import { describe, it, expect } from 'vitest';
import {
  bestCubeMove,
  bestCubeMoveWithGain,
  bestCubeMultiplayerMove,
  checkCubeMultiplayerGameOver,
  checkCubeWin,
  countConnectedCube,
  cubeAntipodeCell,
  cubeCellCenter,
  cubeCellCountForSize,
  cubeFaceDisplay,
  cubeFaceOrigin,
  cubeNeighbors,
  cubeSeedCell,
  cubeSideForSize,
  cubeTopology,
  expandCubeTerritory,
  floodCube,
  generateCubeBoard,
  generateSeededCubeBoard,
  generateTwoPlayerCube,
  getCubeSide,
  getMaxCubeMoves,
} from './cubeEngine';
import { mulberry32 } from './engine';
import { buildMoveDiff, reconstructTwoPlayerReplayStates } from './replay';
import { cellCountOf } from './floodLogic';

describe('P11 cube topology', () => {
  it('maps the ladder to 96–384 surface cells and validates grid dimensions', () => {
    const expected = new Map([
      [10, 4],
      [12, 5],
      [14, 6],
      [16, 7],
      [18, 8],
    ]);
    for (const [size, side] of expected) {
      expect(cubeSideForSize(size)).toBe(side);
      expect(cubeCellCountForSize(size)).toBe(6 * side * side);
      const board = generateCubeBoard(size, 4, mulberry32(1));
      expect(board).toHaveLength(6 * side);
      expect(board.every((row) => row.length === side)).toBe(true);
      expect(cellCountOf(board)).toBe(6 * side * side);
      expect(getCubeSide(board)).toBe(side);
    }
    expect(() =>
      getCubeSide([
        [1, 2],
        [3, 4],
      ]),
    ).toThrow(RangeError);
  });

  it('gives every cell four distinct symmetric neighbors and one connected graph', () => {
    for (const side of [2, 3, 4, 5, 6, 7, 8]) {
      const { neighbors } = cubeTopology(side);
      expect(neighbors).toHaveLength(6 * side * side);
      for (let index = 0; index < neighbors.length; index++) {
        const list = neighbors[index];
        expect(list).toHaveLength(4);
        expect(new Set(list).size).toBe(4);
        expect(list).not.toContain(index);
        for (const next of list) expect(neighbors[next]).toContain(index);
      }

      const seen = new Set<number>([0]);
      const queue = [0];
      while (queue.length) {
        const index = queue.pop()!;
        for (const next of neighbors[index]) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      expect(seen.size).toBe(neighbors.length);
    }
  });

  it('is deterministic per side and exposes the same cell-neighbor API', () => {
    const a = cubeTopology(4);
    const b = cubeTopology(4);
    expect(a).toEqual(b);
    expect(cubeNeighbors(0, 0, 4)).toEqual(
      a.neighbors[0].map((index) => [Math.floor(index / 4), index % 4]),
    );
  });

  it('places the P2 seed at the antipode of the P1 seed', () => {
    for (const side of [2, 3, 4, 5, 6, 7, 8]) {
      const [r, c] = cubeSeedCell(side);
      const [ar, ac] = cubeAntipodeCell(r, c, side);
      const center = cubeCellCenter(r, c, side);
      const antipode = cubeCellCenter(ar, ac, side);
      expect(antipode[0]).toBeCloseTo(side - center[0]);
      expect(antipode[1]).toBeCloseTo(side - center[1]);
      expect(antipode[2]).toBeCloseTo(side - center[2]);
      expect(cubeAntipodeCell(ar, ac, side)).toEqual([r, c]);
    }
  });

  it('floods the seed component across a cube edge', () => {
    const side = 2;
    const grid = Array.from({ length: 6 * side }, () =>
      Array.from({ length: side }, () => 2),
    );
    const [seedR, seedC] = cubeSeedCell(side);
    // (7,1) is a neighbor of the seed cell on the opposite face, not a
    // same-face neighbor. This edge-crossing component is the whole flood.
    grid[seedR][seedC] = 1;
    grid[7][1] = 1;
    const flooded = floodCube(grid, 3);

    expect(flooded[seedR][seedC]).toBe(3);
    expect(flooded[7][1]).toBe(3);
    const ones = flooded.flatMap((row, r) =>
      row.map((value, c) => (value === 1 ? `${r},${c}` : null)).filter(Boolean),
    );
    expect(ones).toEqual([]);
    expect(grid[seedR][seedC]).toBe(1); // input is non-mutating
  });
});

describe('P11 solo cube', () => {
  it('reproduces seeded boards and reports the cube shape', () => {
    const a = generateSeededCubeBoard(12, 5, 777);
    const b = generateSeededCubeBoard(12, 5, 777);
    expect(a).toEqual(b);
    expect(getCubeSide(a)).toBe(5);
    expect(cellCountOf(a)).toBe(150);
  });

  it('wins, counts and hints from the center seed component', () => {
    const side = 3;
    const grid = Array.from({ length: 6 * side }, () =>
      Array.from({ length: side }, () => 0),
    );
    const [seedR, seedC] = cubeSeedCell(side);
    grid[seedR][seedC] = 1;
    // Give the seed a connected same-color component on the seed face.
    grid[seedR][seedC - 1] = 1;
    expect(countConnectedCube(grid)).toBe(2);
    expect(checkCubeWin(grid)).toBe(false);

    const won = floodCube(grid, 0);
    expect(checkCubeWin(won)).toBe(true);

    const small = generateCubeBoard(10, 4, mulberry32(5));
    const hint = bestCubeMoveWithGain(small, 4);
    expect(hint).not.toBeNull();
    expect(bestCubeMove(small, 4)).toBe(hint!.color);
    const after = floodCube(small, hint!.color);
    expect(countConnectedCube(after)).toBeGreaterThan(countConnectedCube(small));
    expect(bestCubeMove(won, 4)).toBeNull();
  });

  it('exposes a positive move budget for every ladder config', () => {
    for (const size of [10, 12, 14, 16, 18]) {
      for (const colors of [4, 5, 6, 7, 8]) {
        expect(getMaxCubeMoves(size, colors)).toBeGreaterThan(0);
      }
    }
  });
});

describe('P11 two-player cube', () => {
  it('generates non-overlapping antipodal starting territories', () => {
    for (const size of [10, 12, 14, 16, 18]) {
      const side = cubeSideForSize(size);
      for (let seed = 0; seed < 10; seed++) {
        const board = generateTwoPlayerCube(size, 4, mulberry32(seed * 7919 + size));
        expect(getCubeSide(board.grid)).toBe(side);
        expect(board.p1Color).not.toBe(board.p2Color);
        expect(board.p1Cells[0]).toBe(
          `${cubeSeedCell(side)[0]},${cubeSeedCell(side)[1]}`,
        );
        const antipode = cubeAntipodeCell(...cubeSeedCell(side), side);
        expect(board.p2Cells[0]).toBe(`${antipode[0]},${antipode[1]}`);
        const p2Set = new Set(board.p2Cells);
        expect(board.p1Cells.some((k) => p2Set.has(k))).toBe(false);
      }
    }
  });

  it('expands territory through the derived graph but never through opponent cells', () => {
    const board = generateTwoPlayerCube(10, 4, mulberry32(42));
    const { newGrid, newCells, gain } = expandCubeTerritory(
      board.grid,
      board.p1Cells,
      board.p2Cells,
      board.p1Color === 0 ? 2 : 0,
    );
    expect(newCells.slice(0, board.p1Cells.length)).toEqual(board.p1Cells);
    expect(gain).toBe(newCells.length - board.p1Cells.length);
    const opponent = new Set(board.p2Cells);
    expect(newCells.some((k) => opponent.has(k))).toBe(false);
    expect(newGrid).not.toBe(board.grid);
  });

  it('detects majority, full-board and mutually blocked outcomes', () => {
    expect(checkCubeMultiplayerGameOver(24, 13, 11, 4, 0, 1, [], [], [])).toBe('p1_won');
    expect(checkCubeMultiplayerGameOver(24, 11, 13, 4, 0, 1, [], [], [])).toBe('p2_won');
    expect(checkCubeMultiplayerGameOver(24, 12, 12, 4, 0, 1, [], [], [])).toBe('draw');

    const side = 2;
    const grid = Array.from({ length: 6 * side }, () =>
      Array.from({ length: side }, () => 0),
    );
    const [seedR, seedC] = cubeSeedCell(side);
    const [antiR, antiC] = cubeAntipodeCell(seedR, seedC, side);
    grid[antiR][antiC] = 1;
    // Only two palette colors are current, so neither side has a legal gain.
    expect(
      checkCubeMultiplayerGameOver(
        24,
        1,
        1,
        2,
        0,
        1,
        grid,
        [`${seedR},${seedC}`],
        [`${antiR},${antiC}`],
      ),
    ).toBe('draw');
  });

  it('uses the one-ply bot heuristic: easy varies, medium is greedy, master replies', () => {
    const board = generateTwoPlayerCube(10, 5, mulberry32(99));
    const legal = [0, 1, 2, 3, 4].filter(
      (c) => c !== board.p1Color && c !== board.p2Color,
    );
    const greedy = legal.reduce((best, color) => {
      const gain = expandCubeTerritory(
        board.grid,
        board.p1Cells,
        board.p2Cells,
        color,
      ).gain;
      return gain >
        expandCubeTerritory(board.grid, board.p1Cells, board.p2Cells, best).gain
        ? color
        : best;
    }, legal[0]);

    const medium = bestCubeMultiplayerMove(
      board.grid,
      1,
      board.p1Cells,
      board.p2Cells,
      board.p1Color,
      board.p2Color,
      5,
      'medium',
    );
    expect(medium.bestColor).toBe(greedy);

    const picks = new Set(
      Array.from(
        { length: 40 },
        (_, i) =>
          bestCubeMultiplayerMove(
            board.grid,
            1,
            board.p1Cells,
            board.p2Cells,
            board.p1Color,
            board.p2Color,
            5,
            'easy',
            mulberry32(i),
          ).bestColor,
      ),
    );
    expect(picks.size).toBeGreaterThan(1);
    expect([...picks].every((color) => legal.includes(color))).toBe(true);

    const master = bestCubeMultiplayerMove(
      board.grid,
      1,
      board.p1Cells,
      board.p2Cells,
      board.p1Color,
      board.p2Color,
      5,
      'master',
    );
    expect(legal).toContain(master.bestColor);
    expect(master.maxGain).toBe(
      expandCubeTerritory(board.grid, board.p1Cells, board.p2Cells, master.bestColor)
        .gain,
    );
  });

  it('replays a cube round backward from the final board and records', () => {
    const board = generateTwoPlayerCube(12, 5, mulberry32(2024));
    let grid = board.grid;
    let p1 = board.p1Cells;
    let p2 = board.p2Cells;
    let p1Color = board.p1Color;
    let p2Color = board.p2Color;
    const records = [];
    const firstFree = (a: number, b: number, count: number) => {
      for (let c = 0; c < count; c++) if (c !== a && c !== b) return c;
      return 0;
    };
    for (let step = 0; step < 6; step++) {
      const player: 1 | 2 = step % 2 === 0 ? 1 : 2;
      const mine = player === 1 ? p1 : p2;
      const theirs = player === 1 ? p2 : p1;
      const color = firstFree(p1Color, p2Color, 5);
      const expanded = expandCubeTerritory(grid, mine, theirs, color);
      records.push({
        player,
        color,
        diff: buildMoveDiff(grid, expanded.newGrid),
        gained: expanded.newCells.slice(mine.length),
      });
      grid = expanded.newGrid;
      if (player === 1) {
        p1 = expanded.newCells;
        p1Color = color;
      } else {
        p2 = expanded.newCells;
        p2Color = color;
      }
    }

    const replay = reconstructTwoPlayerReplayStates(grid, p1, p2, records);
    expect(replay).toHaveLength(records.length + 1);
    expect(replay[0]).toEqual({
      grid: board.grid,
      p1Cells: board.p1Cells,
      p2Cells: board.p2Cells,
    });
    expect(replay[replay.length - 1]).toEqual({ grid, p1Cells: p1, p2Cells: p2 });
  });
});

describe('P11 cube render frames', () => {
  const add = (a: number[], b: number[]): number[] => a.map((v, i) => v + b[i]);
  const scale = (a: number[], k: number): number[] => a.map((v) => v * k);
  const pointKey = (p: number[]): string => p.map((v) => v.toFixed(1)).join(',');

  it('places each display cell exactly on its storage cell center', () => {
    for (const side of [2, 3, 4, 5, 6, 7, 8]) {
      const centers = new Set<string>();
      for (let face = 0; face < 6; face++) {
        const { colAxis, rowAxis, transpose } = cubeFaceDisplay(face);
        const origin = cubeFaceOrigin(face, side);
        for (let dr = 0; dr < side; dr++) {
          for (let dc = 0; dc < side; dc++) {
            const i = transpose ? dc : dr;
            const j = transpose ? dr : dc;
            const display = add(
              origin,
              add(scale(colAxis, dc + 0.5), scale(rowAxis, dr + 0.5)),
            );
            const storage = cubeCellCenter(face * side + i, j, side);
            for (let axis = 0; axis < 3; axis++) {
              expect(display[axis]).toBeCloseTo(storage[axis], 9);
            }
            centers.add(pointKey(display));
          }
        }
      }
      // No two cells may overlap: every surface cell has its own spot.
      expect(centers.size).toBe(6 * side * side);
    }
  });

  it('returns orthonormal, outward-facing, right-handed frames', () => {
    for (let face = 0; face < 6; face++) {
      const { colAxis, rowAxis, normal } = cubeFaceDisplay(face);
      const length = (v: number[]) => Math.hypot(v[0], v[1], v[2]);
      expect(length(colAxis)).toBeCloseTo(1, 9);
      expect(length(rowAxis)).toBeCloseTo(1, 9);
      expect(length(normal)).toBeCloseTo(1, 9);
      const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      expect(dot(colAxis, rowAxis)).toBeCloseTo(0, 9);
      expect(dot(colAxis, normal)).toBeCloseTo(0, 9);
      expect(dot(rowAxis, normal)).toBeCloseTo(0, 9);

      const cross = [
        colAxis[1] * rowAxis[2] - colAxis[2] * rowAxis[1],
        colAxis[2] * rowAxis[0] - colAxis[0] * rowAxis[2],
        colAxis[0] * rowAxis[1] - colAxis[1] * rowAxis[0],
      ];
      // Right-handed: back-face culling and glyph orientation depend on it.
      for (let axis = 0; axis < 3; axis++) {
        expect(cross[axis]).toBeCloseTo(normal[axis], 12);
      }
    }
  });

  it('renders exactly the derived neighbour graph (no seams that teleport)', () => {
    for (const side of [3, 4, 5, 6]) {
      const { neighbors } = cubeTopology(side);
      const edgeToCells = new Map<string, number[]>();

      for (let face = 0; face < 6; face++) {
        const { colAxis, rowAxis, transpose } = cubeFaceDisplay(face);
        const origin = cubeFaceOrigin(face, side);
        for (let dr = 0; dr < side; dr++) {
          for (let dc = 0; dc < side; dc++) {
            const i = transpose ? dc : dr;
            const j = transpose ? dr : dc;
            const index = (face * side + i) * side + j;
            const center = add(
              origin,
              add(scale(colAxis, dc + 0.5), scale(rowAxis, dr + 0.5)),
            );
            const corners = [
              add(center, add(scale(colAxis, -0.5), scale(rowAxis, -0.5))),
              add(center, add(scale(colAxis, 0.5), scale(rowAxis, -0.5))),
              add(center, add(scale(colAxis, 0.5), scale(rowAxis, 0.5))),
              add(center, add(scale(colAxis, -0.5), scale(rowAxis, 0.5))),
            ];
            for (let edge = 0; edge < 4; edge++) {
              const key = [pointKey(corners[edge]), pointKey(corners[(edge + 1) % 4])]
                .sort()
                .join('|');
              const cells = edgeToCells.get(key) ?? [];
              cells.push(index);
              edgeToCells.set(key, cells);
            }
          }
        }
      }

      const displayed = new Set<string>();
      for (const cells of edgeToCells.values()) {
        expect(cells).toHaveLength(2);
        displayed.add([...cells].sort((a, b) => a - b).join('-'));
      }
      const expected = new Set(
        neighbors.flatMap((list, index) =>
          list.filter((next) => next > index).map((next) => `${index}-${next}`),
        ),
      );
      expect(displayed).toEqual(expected);
    }
  });
});
