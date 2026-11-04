/**
 * Honest A/B: alternate OLD and NEW blocks in the same process so load spikes hit both
 * equally; the ratio of accumulated times is robust to background noise.
 * Usage: npx tsx scripts/abBench.ts
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
import {
  toFlat,
  floodFlat,
  expandTerritoryFlat,
  bestSoloMoveFlat,
  bestMultiplayerMoveFlat,
  generateTwoPlayerGridFlat,
} from '../src/utils/engine';

const size = 18;
const colorCount = 8;
const BLOCK = 200; // ops per block
const ROUNDS = 30; // alternating rounds per pair

const solo = generateSoloGrid(size, colorCount);
const flat = toFlat(solo);
const board = generateTwoPlayerGrid(size, colorCount);
const boardFlat = toFlat(board.grid);
const p1Idx = board.p1Cells.map((k) => {
  const [r, c] = k.split(',').map(Number);
  return r * size + c;
});
const p2Idx = board.p2Cells.map((k) => {
  const [r, c] = k.split(',').map(Number);
  return r * size + c;
});

let sink = 0;

type Pair = { name: string; old: () => void; new: () => void };

const pairs: Pair[] = [
  {
    name: 'flood (one op)',
    old: () => {
      sink += floodSolo(solo, (sink + 1) % colorCount).length;
    },
    new: () => {
      sink += floodFlat(flat, size, (sink + 1) % colorCount).length;
    },
  },
  {
    name: 'best solo move',
    old: () => {
      sink += getBestSoloMove(solo, colorCount)!;
    },
    new: () => {
      sink += bestSoloMoveFlat(flat, size, colorCount)!;
    },
  },
  {
    name: 'expand territory',
    old: () => {
      sink += expandPlayerTerritory(
        board.grid,
        board.p1Cells,
        board.p2Cells,
        (sink + 1) % colorCount,
      ).gain;
    },
    new: () => {
      sink += expandTerritoryFlat(
        boardFlat,
        size,
        p1Idx,
        p2Idx,
        (sink + 1) % colorCount,
      ).gain;
    },
  },
  {
    name: 'master bot eval',
    old: () => {
      sink += getBestMultiplayerMove(
        board.grid,
        1,
        board.p1Cells,
        board.p2Cells,
        board.p1Color,
        board.p2Color,
        colorCount,
        'master',
      ).bestColor;
    },
    new: () => {
      sink += bestMultiplayerMoveFlat(
        boardFlat,
        size,
        1,
        p1Idx,
        p2Idx,
        board.p1Color,
        board.p2Color,
        colorCount,
        'master',
      ).bestColor;
    },
  },
  {
    name: 'generate 2p board',
    old: () => {
      sink += generateTwoPlayerGrid(size, colorCount).grid[0][0];
    },
    new: () => {
      sink += generateTwoPlayerGridFlat(size, colorCount).cells[0];
    },
  },
];

console.log(
  `A/B interleaved: block=${BLOCK} rounds=${ROUNDS} — reported as NEW/OLD time ratio (lower is faster)`,
);
for (const pair of pairs) {
  // warmup both
  for (let i = 0; i < BLOCK; i++) {
    pair.old();
    pair.new();
  }
  let tOld = 0;
  let tNew = 0;
  for (let round = 0; round < ROUNDS; round++) {
    let start = performance.now();
    for (let i = 0; i < BLOCK; i++) pair.old();
    tOld += performance.now() - start;
    start = performance.now();
    for (let i = 0; i < BLOCK; i++) pair.new();
    tNew += performance.now() - start;
  }
  const ratio = tNew / tOld;
  const oldOps = (ROUNDS * BLOCK * 1000) / tOld;
  const newOps = (ROUNDS * BLOCK * 1000) / tNew;
  console.log(
    `${pair.name.padEnd(22)} OLD ${oldOps.toFixed(0).padStart(9)} ops/s | NEW ${newOps
      .toFixed(0)
      .padStart(9)} ops/s | ratio ${ratio.toFixed(2)}x`,
  );
}
if (sink === -1) console.log(sink);
