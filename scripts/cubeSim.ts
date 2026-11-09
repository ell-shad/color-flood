import {
  bestCubeMove,
  checkCubeWin,
  floodCube,
  generateCubeBoard,
} from '../src/utils/cubeEngine';
import { maxSoloMovesLimit } from '../src/utils/soloBalance';
import { mulberry32 } from '../src/utils/engine';

const GRID_SIZES = [10, 12, 14, 16, 18];
const COLOR_COUNTS = [4, 5, 6, 7, 8];

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const BOARDS = Number(arg('boards') ?? 500);
const FACTORS = (arg('factors') ?? '0.65,0.75,0.85,0.95')
  .split(',')
  .map(Number)
  .filter(Number.isFinite);

/**
 * Greedy cube calibration. A board contributes the number of moves the cube
 * hint needs to solve it, then every candidate budget is checked against
 * that one measurement (a budget wins exactly when it is >= the need).
 */
const playGreedy = (grid: number[][], colorCount: number, cap: number) => {
  let board = grid;
  let moves = 0;
  while (!checkCubeWin(board) && moves < cap) {
    const hint = bestCubeMove(board, colorCount);
    if (hint === null) break;
    board = floodCube(board, hint);
    moves++;
  }
  return { solved: checkCubeWin(board), moves };
};

console.log(
  `Cube greedy calibration: ${BOARDS} boards/config, candidate limit factors ${FACTORS.join(', ')}`,
);

for (const size of GRID_SIZES) {
  for (const colors of COLOR_COUNTS) {
    const soloLimit = maxSoloMovesLimit(size, colors);
    const cap = Math.ceil(soloLimit * 1.5) + 20;
    const baseSeed = ((size * 1000 + colors) >>> 0) + 1;
    const needs: number[] = [];
    let unsolved = 0;

    for (let i = 0; i < BOARDS; i++) {
      const board = generateCubeBoard(size, colors, mulberry32(baseSeed + i));
      const result = playGreedy(board, colors, cap);
      if (result.solved) needs.push(result.moves);
      else unsolved++;
    }

    const avgNeed = needs.length
      ? needs.reduce((sum, value) => sum + value, 0) / needs.length
      : Number.NaN;
    const parts = FACTORS.map((factor) => {
      const budget = Math.round(soloLimit * factor);
      const wins = needs.filter((need) => need <= budget).length;
      const winRate = (wins / BOARDS) * 100;
      const ratio = wins === 0 ? Number.NaN : avgNeed / budget;
      return `${factor}→${budget}: ${winRate.toFixed(1)}%, avg/budget ${ratio.toFixed(2)}`;
    });

    console.log(
      `${String(size).padStart(2)}/${colors}c solo=${soloLimit} avgNeed=${avgNeed.toFixed(1)} p90=${needs.sort((a, b) => a - b)[Math.floor(needs.length * 0.9)] ?? '-'} unsolved=${unsolved} ${parts.join(' | ')}`,
    );
  }
}
