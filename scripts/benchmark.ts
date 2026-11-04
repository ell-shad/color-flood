/**
 * Engine benchmark: old vs new implementation on N x N grids.
 * Usage: npm run bench [-- --size 18 --iters 200]
 */
import { performance } from 'node:perf_hooks';

import {
  generateSoloGrid,
  floodSolo,
  expandPlayerTerritory,
  getBestSoloMove,
  getBestMultiplayerMove,
  generateTwoPlayerGrid,
} from '../src/utils/floodLogic';

async function loadNew(): Promise<any> {
  // Specifier is assembled at runtime so tsc does not try to resolve the module
  // before the new engine exists (baseline benchmark runs).
  const spec = '../src/utils/' + 'engine';
  try {
    return await import(spec);
  } catch {
    return null;
  }
}

const NEW: any = await loadNew();

const args = process.argv.slice(2);
const sizeArg = args.indexOf('--size');
const itersArg = args.indexOf('--iters');
const size = sizeArg >= 0 ? Number(args[sizeArg + 1]) : 18;
const ITERS = itersArg >= 0 ? Number(args[itersArg + 1]) : 200;
const colorCount = 8;

function bench(name: string, fn: () => void): number {
  // Warmup so JIT tiering settles before the timed loop.
  const warmup = Math.max(50, Math.floor(ITERS / 5));
  for (let i = 0; i < warmup; i++) fn();
  const start = performance.now();
  fn();
  const ms = performance.now() - start;
  const opsPerSec = 1000 / (ms / ITERS);
  console.log(
    `${name.padEnd(46)} ${ms.toFixed(1).padStart(9)} ms total   ${opsPerSec.toFixed(0).padStart(10)} ops/s`,
  );
  return opsPerSec;
}

console.log(
  `\n=== Benchmark: ${size}x${size}, ${colorCount} colors, ${ITERS} iterations ===\n`,
);

console.log(
  `\n=== Benchmark: ${size}x${size}, ${colorCount} colors, ${ITERS} iterations ===\n`,
);

const show = (name: string, impl: 'OLD' | 'NEW', fn: () => void | undefined) =>
  bench(`${impl} ${name}`, fn) && fn;

const solo = generateSoloGrid(size, colorCount);
let sink = 0;

console.log('--- solo ---');
show('floodSolo', 'OLD', () => {
  for (let i = 0; i < ITERS; i++) sink += floodSolo(solo, i % colorCount)[0][0];
});
sink = 0;
show('getBestSoloMove (7 flood+count each)', 'OLD', () => {
  for (let i = 0; i < ITERS; i++) sink += getBestSoloMove(solo, colorCount)!;
});

console.log('\n--- multiplayer ---');
const { grid, p1Cells, p2Cells, p1Color, p2Color } = generateTwoPlayerGrid(
  size,
  colorCount,
);

sink = 0;
show('expandPlayerTerritory', 'OLD', () => {
  for (let i = 0; i < ITERS; i++) {
    sink += expandPlayerTerritory(grid, p1Cells, p2Cells, i % colorCount).gain;
  }
});

show('getBestMultiplayerMove (master)', 'OLD', () => {
  for (let i = 0; i < ITERS; i++) {
    sink += getBestMultiplayerMove(
      grid,
      1,
      p1Cells,
      p2Cells,
      p1Color,
      p2Color,
      colorCount,
      'master',
    ).bestColor;
  }
});

show('generateTwoPlayerGrid', 'OLD', () => {
  for (let i = 0; i < ITERS / 5; i++) generateTwoPlayerGrid(size, colorCount);
});
show('generateTwoPlayerGridFull', 'OLD', () => {
  for (let i = 0; i < ITERS / 5; i++) generateTwoPlayerGrid(size, colorCount);
});

if (NEW) {
  const soloFlat = NEW.toFlat(solo);
  console.log('\n--- solo (NEW) ---');
  sink = 0;
  show('floodFlat', 'NEW', () => {
    for (let i = 0; i < ITERS; i++)
      sink += NEW.floodFlat(soloFlat, size, i % colorCount)[0];
  });
  sink = 0;
  show('bestSoloMoveFlat', 'NEW', () => {
    for (let i = 0; i < ITERS; i++)
      sink += NEW.bestSoloMoveFlat(soloFlat, size, colorCount)!;
  });

  console.log('\n--- multiplayer (NEW) ---');
  const mpFlat = NEW.toFlat(grid);
  const p1Idx = p1Cells.map((k) => {
    const [r, c] = k.split(',').map(Number);
    return r * size + c;
  });
  const p2Idx = p2Cells.map((k) => {
    const [r, c] = k.split(',').map(Number);
    return r * size + c;
  });

  sink = 0;
  show('expandTerritoryFlat', 'NEW', () => {
    for (let i = 0; i < ITERS; i++) {
      sink += NEW.expandTerritoryFlat(mpFlat, size, p1Idx, p2Idx, i % colorCount).gain;
    }
  });

  show('bestMultiplayerMoveFlat (master)', 'NEW', () => {
    for (let i = 0; i < ITERS; i++) {
      sink += NEW.bestMultiplayerMoveFlat(
        mpFlat,
        size,
        1,
        p1Idx,
        p2Idx,
        p1Color,
        p2Color,
        colorCount,
        'master',
      ).bestColor;
    }
  });

  show('generateTwoPlayerGridFlat', 'NEW', () => {
    for (let i = 0; i < ITERS / 5; i++) NEW.generateTwoPlayerGridFlat(size, colorCount);
  });
} else {
  console.log('\n(NEW engine not available yet — baseline run)');
}

if (sink === -1) console.log(sink);
console.log('\n(sink prevents dead-code elimination)');
