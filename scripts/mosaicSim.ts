import {
  bestMosaicMove,
  checkMosaicWin,
  floodMosaic,
  generateMosaicBoard,
  mosaicCellCount,
} from '../src/utils/mosaicEngine';
import { maxSoloMovesLimit } from '../src/utils/soloBalance';
import { mulberry32 } from '../src/utils/engine';

const GRID_SIZES = [10, 12, 14, 16, 18];
const COLOR_COUNTS = [4, 5, 6, 7, 8];

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const BOARDS = Number(arg('boards') ?? 500);
const FACTORS = (arg('factors') ?? '0.7,0.8,0.85,0.9,1.0')
  .split(',')
  .map(Number)
  .filter(Number.isFinite);

/**
 * Greedy mosaic calibration. A board contributes the number of moves the
 * mosaic hint needs to solve it, then every candidate budget is checked
 * against that one measurement (a budget wins exactly when it is >= the need).
 */
const playGreedy = (grid: number[][], colorCount: number, cap: number) => {
  let board = grid;
  let moves = 0;
  while (!checkMosaicWin(board) && moves < cap) {
    const hint = bestMosaicMove(board, colorCount);
    if (hint === null) break;
    board = floodMosaic(board, hint);
    moves++;
  }
  return { solved: checkMosaicWin(board), moves };
};

console.log(
  `Mosaic greedy calibration: ${BOARDS} boards/config, candidate limit factors ${FACTORS.join(', ')}`,
);

for (const size of GRID_SIZES) {
  for (const colors of COLOR_COUNTS) {
    const soloLimit = maxSoloMovesLimit(size, colors);
    const cap = Math.ceil(soloLimit * 1.5) + 20;
    const baseSeed = ((size * 7000 + colors) >>> 0) + 1;
    const needs: number[] = [];
    let unsolved = 0;

    for (let i = 0; i < BOARDS; i++) {
      const board = generateMosaicBoard(size, colors, mulberry32(baseSeed + i));
      const result = playGreedy(board, colors, cap);
      if (result.solved) needs.push(result.moves);
      else unsolved++;
    }

    const avgNeed = needs.length
      ? needs.reduce((sum, value) => sum + value, 0) / needs.length
      : Number.NaN;
    const sorted = [...needs].sort((a, b) => a - b);
    const parts = FACTORS.map((factor) => {
      const budget = Math.round(soloLimit * factor);
      const wins = needs.filter((need) => need <= budget).length;
      const winRate = (wins / BOARDS) * 100;
      const ratio = wins === 0 ? Number.NaN : avgNeed / budget;
      return `${factor}→${budget}: ${winRate.toFixed(1)}%, avg/budget ${ratio.toFixed(2)}`;
    });

    console.log(
      `${String(size).padStart(2)}/${colors}c cells=${mosaicCellCount(size)} solo=${soloLimit} avgNeed=${avgNeed.toFixed(1)} p90=${sorted[Math.floor(sorted.length * 0.9)] ?? '-'} max=${sorted[sorted.length - 1] ?? '-'} unsolved=${unsolved} ${parts.join(' | ')}`,
    );
  }
}
