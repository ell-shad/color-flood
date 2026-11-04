/**
 * Solo balance calibration + verification.
 *
 * Modes:
 *   npm run sim                → report per-config (default, no table write)
 *   npm run sim -- --persist   → also write measured pars/limits into soloBalance.ts
 *   npm run sim -- --verify    → verify (and fail hard if any config < 90%)
 *                                  the committed limit table
 *   npm run sim -- --config=18:8 --boards=200   restrict and deepen
 */
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

import { maxSoloMovesLimit } from '../src/utils/soloBalance';
import { playBeam, playGreedy, seededSoloBoard } from '../src/utils/soloSolver';
import { mulberry32 } from '../src/utils/engine';

const writeTable = (newPars: Map<string, number>, newLimits: Map<string, number>) => {
  const path = 'src/utils/soloBalance.ts';
  const content = fs.readFileSync(path, 'utf8');
  const parDecl = 'export const PAR_MOVES = new Map<string, number>();';
  const limDecl = 'export const SOLO_LIMITS = new Map<string, number>();';
  const keyMarker = 'const key = (size: number, colors: number) =>';
  const parIdx = content.indexOf(parDecl);
  const limIdx = content.indexOf(limDecl);
  const keyIdx = content.indexOf(keyMarker);
  if (parIdx < 0 || limIdx < 0 || keyIdx < 0 || limIdx < parIdx || keyIdx < limIdx) {
    console.error('soloBalance.ts structure changed — aborting persist');
    process.exit(1);
  }
  const head = content.slice(0, parIdx);
  const tail = content.slice(keyIdx);
  const parLines = [...newPars]
    .map(([k, v]) => `  PAR_MOVES.set("${k}", ${v});`)
    .join('\n');
  const limLines = [...newLimits]
    .map(([k, v]) => `  SOLO_LIMITS.set("${k}", ${v});`)
    .join('\n');
  const middle = `${parDecl}\n${parLines}\n\n${limDecl}\n${limLines}\n\n`;
  fs.writeFileSync(path, head + middle + tail);
  console.log(
    `\n↳ wrote ${newPars.size} par entries + ${newLimits.size} limit entries to ${path}`,
  );
};

const GRID_SIZES = [10, 12, 14, 16, 18];
const COLOR_COUNTS = [4, 5, 6, 7, 8];

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const noWrite = process.argv.includes('--no-write');
const persist = !noWrite;
const verify = process.argv.includes('--verify');
const BOARDS = Number(arg('boards') ?? (verify ? 200 : 120));
const configFilter = arg('config'); // "18:8"

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
};

const summarize = (moves: number[], wins: number, limit: number) => {
  const sorted = [...moves].sort((a, b) => a - b);
  const n = Math.max(1, sorted.length);
  const avg = sorted.reduce((a, b) => a + b, 0) / n;
  return {
    winRate: Number((((wins || 0) / BOARDS) * 100).toFixed(0)),
    avg: Number(avg.toFixed(1)),
    median: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1] ?? 0,
    limit,
  };
};

const newPars = new Map<string, number>();
const newLimits = new Map<string, number>();
/**
 * Limit calibration: allow the competent player's 90th percentile, with at least
 * par+2 headroom (a perfect solver always has spare moves) and at most par+8 so the
 * easiest configs stay non-trivial.
 */
const deriveLimit = (par: number, competentP90: number): number =>
  Math.min(par + 8, Math.max(par + 2, Math.ceil(competentP90) + 1));

let verifyFailed = false;
let anyConfig = false;

for (const grid of GRID_SIZES) {
  for (const colors of COLOR_COUNTS) {
    if (configFilter && configFilter !== `${grid}:${colors}`) continue;
    anyConfig = true;

    const limit = maxSoloMovesLimit(grid, colors);
    const k = `${grid}:${colors}`;
    const baseSeed = ((grid * 1000 + colors) >>> 0) + 1;

    const greedyMoves: number[] = [];
    let greedyWins = 0;
    const competentMoves: number[] = [];
    let competentWins = 0;
    const parMoves: number[] = [];
    // Pre-seed the write map so every config contributes at least one entry,
    // even when no boards were solved this run (rare; keep the table honest).
    if (persist && !newPars.has(k)) {
      newPars.set(k, -1);
      newLimits.set(k, limit);
    }

    const t0 = performance.now();
    for (let i = 0; i < BOARDS; i++) {
      // Engine generator + mulberry32: identical to what a seeded in-game board would be.
      const board = seededSoloBoard(grid, colors, mulberry32(baseSeed + i));

      // Strong solver: greedy upper bound, then beam-8 to try to beat it.
      const greedyFull = playGreedy(board, grid, colors, grid * 1.5 + colors * 4);
      if (greedyFull.solved) parMoves.push(greedyFull.moves);
      const bp = playBeam(
        board,
        grid,
        colors,
        greedyFull.solved ? greedyFull.moves : grid * 1.5 + colors * 4,
        8,
      );
      if (bp.solved) {
        if (!greedyFull.solved || bp.moves < greedyFull.moves) parMoves.push(bp.moves);
      }

      // Competent player proxy: width-4 beam, a human who plays the hint and looks ahead a few moves.
      const c = playBeam(board, grid, colors, limit, 4);
      competentMoves.push(c.moves);
      if (c.solved) competentWins++;

      // Greedy = in-game hint behavior.
      const g = playGreedy(board, grid, colors, limit);
      greedyMoves.push(g.moves);
      if (g.solved) greedyWins++;
    }
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);

    const bpSummary = summarize(parMoves, parMoves.length, limit);
    const c = summarize(competentMoves, competentWins, limit);
    const g = summarize(greedyMoves, greedyWins, limit);

    // Calibrate: par = solver median; limit must let a competent player win ~90%+
    // (p90 of its move distribution) while staying within par + [2, 8] so easy
    // configs do not become trivial.
    const par = parMoves.length ? bpSummary.median : -1;
    const derived = par > 0 ? deriveLimit(par, c.p90) : limit;
    newPars.set(k, par);
    newLimits.set(k, derived);

    if (verify) {
      const winOk = c.winRate >= 90;
      // Non-triviality: the limit may not exceed par + 8 (a large giveaway), and must
      // leave at least par + 2 room. Requires a measured par (limit table persisted).
      const boundsOk = par > 0 && limit >= par + 2 && limit <= par + 8;
      if (!winOk || !boundsOk) verifyFailed = true;
      const flags = `${winOk ? '' : ' ** WIN<90% **'}${boundsOk ? '' : ' ** LIMIT-BOUNDS **'}`;
      console.log(
        `${String(grid).padStart(2)}x${String(grid).padEnd(2)}/${colors}c  par=${String(par).padStart(3)}  limit=${String(limit).padStart(3)}  ` +
          `competent=${String(c.winRate).padStart(3)}% avg=${c.avg}  greedy=${String(g.winRate).padStart(3)}% avg=${g.avg}  ` +
          `solver=${String(bpSummary.winRate).padStart(3)}% ${flags || 'OK'}  (${elapsed}s)`,
      );
    } else {
      console.log(
        `${String(grid).padStart(2)}x${String(grid).padEnd(2)}/${colors}c  limit=${String(limit).padStart(3)}  ` +
          `solver(min-solved): med=${bpSummary.median} p90=${bpSummary.p90}  ` +
          `competent: med=${c.median} p90=${c.p90} max=${c.max}  ` +
          `greedy: med=${g.median} p90=${g.p90} p95=${g.p95} max=${g.max} avg=${g.avg}`,
      );
    }
  }
}

if (persist) {
  if (configFilter) {
    console.log(
      '\n↳ --config filter is set; skipping table persist (would drop other configs).',
    );
  } else {
    writeTable(newPars, newLimits);
  }
}

if (!anyConfig) {
  console.log(`No config matched --config=${configFilter ?? ''}. Use "18:8" format.`);
  process.exitCode = 1;
}

if (verify) {
  if (verifyFailed) {
    console.log(
      '\n✖ Verification FAILED — some configs are below the 90% competent-player target.',
    );
    process.exitCode = 1;
  } else {
    console.log(
      '\n✔ Verification passed — every config meets the 90% competent-player target.',
    );
  }
}
