import {
  bestTriangleMove,
  checkTriangleWin,
  floodTriangle,
  generateTriangleBoard,
} from '../src/utils/triangleEngine';
import {
  bestHiveMove,
  checkHiveWin,
  floodHive,
  generateHiveBoard,
} from '../src/utils/hiveEngine';
import { maxSoloMovesLimit } from '../src/utils/soloBalance';
import { mulberry32 } from '../src/utils/engine';

const GRID_SIZES = [10, 12, 14, 16, 18];
const COLOR_COUNTS = [4, 5, 6, 7, 8];
const BOARDS = Number(
  process.argv.find((a) => a.startsWith('--boards='))?.split('=')[1] ?? 500,
);
const FACTORS = process.argv
  .find((a) => a.startsWith('--factors='))
  ?.split('=')[1]
  ?.split(',')
  .map(Number)
  .filter(Number.isFinite) ?? [0.8, 0.9, 1, 1.1];

const playGreedy = (
  grid: number[][],
  colorCount: number,
  cap: number,
  best: typeof bestTriangleMove,
  flood: typeof floodTriangle,
  check: typeof checkTriangleWin,
) => {
  let board = grid;
  let moves = 0;
  while (!check(board) && moves < cap) {
    const hint = best(board, colorCount);
    if (hint === null) break;
    board = flood(board, hint);
    moves++;
  }
  return { solved: check(board), moves };
};

const report = (
  name: string,
  generate: typeof generateTriangleBoard,
  best: typeof bestTriangleMove,
  flood: typeof floodTriangle,
  check: typeof checkTriangleWin,
) => {
  console.log(`\n${name}: ${BOARDS} boards/config`);
  for (const size of GRID_SIZES) {
    for (const colors of COLOR_COUNTS) {
      const soloLimit = maxSoloMovesLimit(size, colors);
      const cap = Math.ceil(soloLimit * 1.5) + 20;
      const needs: number[] = [];
      let unsolved = 0;
      for (let i = 0; i < BOARDS; i++) {
        const result = playGreedy(
          generate(size, colors, mulberry32(size * 1000 + colors + i)),
          colors,
          cap,
          best,
          flood,
          check,
        );
        if (result.solved) needs.push(result.moves);
        else unsolved++;
      }
      const avgNeed =
        needs.reduce((sum, value) => sum + value, 0) / Math.max(1, needs.length);
      const parts = FACTORS.map((factor) => {
        const budget = Math.round(soloLimit * factor);
        const wins = needs.filter((need) => need <= budget).length;
        return `${factor}→${budget}: ${((wins / BOARDS) * 100).toFixed(1)}% (${needs.length ? (avgNeed / budget).toFixed(2) : '-'})`;
      });
      console.log(
        `${size}/${colors}c solo=${soloLimit} avg=${avgNeed.toFixed(1)} unsolved=${unsolved} ${parts.join(' | ')}`,
      );
    }
  }
};

report(
  'Triangle',
  generateTriangleBoard,
  bestTriangleMove,
  floodTriangle,
  checkTriangleWin,
);
report('Hive', generateHiveBoard, bestHiveMove, floodHive, checkHiveWin);
