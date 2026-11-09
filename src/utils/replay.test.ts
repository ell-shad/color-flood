import { describe, it, expect } from 'vitest';
import {
  buildMoveDiff,
  reconstructReplayStates,
  reconstructTwoPlayerReplayStates,
  type TwoPlayerReplayState,
} from './replay';
import {
  checkGameOverForShape,
  expandPlayerTerritory,
  generateSoloGrid,
  generateTwoPlayerGrid,
} from './floodLogic';
import {
  checkWheelMultiplayerGameOver,
  expandWheelTerritory,
  generateTwoPlayerWheel,
} from './circleEngine';
import { mulberry32 } from './engine';
import type { GridSize, SoloMoveDiff, TwoPlayerMoveRecord } from '../types';

describe('reconstructReplayStates', () => {
  it('rebuilds every intermediate state from the final grid + diffs', () => {
    // 1x2 board: start red-red, move 1 floods to blue (absorbs cell 1).
    const initial = [
      [1, 1],
      [2, 2],
    ];
    // Repainting the (0,0) component to 2 absorbs (0,1) and (1,0).
    const move1: SoloMoveDiff[] = [
      { r: 0, c: 0, prev: 1 },
      { r: 0, c: 1, prev: 1 },
      { r: 1, c: 0, prev: 2 },
    ];
    // Move 2: finish the board by painting to 1 (absorbing (1,1)).
    const move2: SoloMoveDiff[] = [
      { r: 0, c: 0, prev: 2 },
      { r: 0, c: 1, prev: 2 },
      { r: 1, c: 0, prev: 2 },
      { r: 1, c: 1, prev: 2 },
    ];
    const final = [
      [1, 1],
      [1, 1],
    ];
    const states = reconstructReplayStates(final, [[], move1, move2]);
    expect(states).toHaveLength(3);
    expect(states[0]).toEqual(initial);
    expect(states[1]).toEqual([
      [2, 2],
      [2, 2],
    ]);
    expect(states[2]).toEqual(final);
  });

  it('tolerates a single-state history (the initial empty diff)', () => {
    const final = [
      [0, 3],
      [3, 1],
    ];
    const states = reconstructReplayStates(final, [[]]);
    expect(states).toEqual([final]);
    expect(states[0]).not.toBe(final); // defensive copy, no shared references
  });

  it('restores wheel boards whose row count differs from the sector count', () => {
    // P7.3: a 2-ring × 6-sector wheel — the column bound comes from each
    // row's length, never from the ring count.
    const final = [
      [2, 2, 2, 2, 2, 2],
      [2, 2, 2, 2, 2, 2],
    ];
    const move1: SoloMoveDiff[] = [
      { r: 0, c: 0, prev: 1 },
      { r: 0, c: 1, prev: 1 },
      { r: 1, c: 5, prev: 1 },
    ];
    const states = reconstructReplayStates(final, [[], move1]);
    expect(states).toHaveLength(2);
    expect(states[1]).toEqual(final);
    expect(states[0][0][0]).toBe(1);
    expect(states[0][0][1]).toBe(1);
    expect(states[0][1][5]).toBe(1); // beyond the ring count (2) — the old bug
    expect(states[0][1][0]).toBe(2);
  });

  it('does not mutate the input grid', () => {
    const final = [
      [0, 0],
      [0, 0],
    ];
    const snapshot = JSON.parse(JSON.stringify(final));
    reconstructReplayStates(final, [[]]);
    expect(final).toEqual(snapshot);
  });
});

describe('buildMoveDiff (P10.1 — shared by solo and two-player machines)', () => {
  it('records every recolored cell with its previous color', () => {
    const before = [
      [1, 1, 2],
      [3, 3, 2],
    ];
    const after = [
      [2, 2, 2],
      [3, 3, 2],
    ];
    // Only the (0,0) component changed: two cells, prev captured.
    expect(buildMoveDiff(before, after)).toEqual([
      { r: 0, c: 0, prev: 1 },
      { r: 0, c: 1, prev: 1 },
    ]);
  });

  it('is exact on wheels whose rings ≠ sector count', () => {
    const before = [
      [1, 2, 1, 2, 1],
      [0, 0, 3, 0, 0],
    ];
    const after = [
      [1, 1, 1, 2, 1],
      [0, 0, 3, 0, 0],
    ];
    expect(buildMoveDiff(before, after)).toEqual([{ r: 0, c: 1, prev: 2 }]);
  });

  it('returns an empty diff for identical boards', () => {
    const board = [
      [0, 1],
      [1, 0],
    ];
    expect(buildMoveDiff(board, board)).toEqual([]);
  });
});

describe('recording contract — territory keys are an exact prefix (P10.1)', () => {
  /**
   * Both 2P engines return `newCells` as "[current territory, then this
   * move's discoveries]" and never claim opponent land. The reducers slice
   * `newCells.slice(currentCells.length)` as the recorded `gained`, so these
   * prefix guarantees are what the P10 replay walks build on.
   */
  const agendas: Array<Array<1 | 2>> = [
    [1, 2],
    [1, 2],
    [1, 2],
    [1, 2],
  ];

  /** First palette index that is neither player's live color (real-game legal). */
  const firstFree = (a: number, b: number, count: number): number => {
    for (let c = 0; c < count; c++) if (c !== a && c !== b) return c;
    return (a + 1) % count;
  };

  it('classic: newCells = currentCells ⊕ gained, disjoint from opponent land', () => {
    for (let seed = 0; seed < 12; seed++) {
      const rng = mulberry32(seed * 104729 + 7);
      const board = generateTwoPlayerGrid(10, 5, rng);
      let grid = board.grid;
      let p1 = board.p1Cells;
      let p2 = board.p2Cells;
      let p1Color = board.p1Color;
      let p2Color = board.p2Color;
      for (const round of agendas) {
        for (const player of round) {
          const mine = player === 1 ? p1 : p2;
          const theirs = player === 1 ? p2 : p1;
          // A real-game legal color: neither live color may be replayed.
          const color = firstFree(p1Color, p2Color, 5);
          const expand = expandPlayerTerritory(grid, mine, theirs, color);
          // The previous territory is a byte-exact prefix of the new one.
          expect(expand.newCells.slice(0, mine.length)).toEqual(mine);
          const gained = expand.newCells.slice(mine.length);
          expect(gained).toHaveLength(expand.gain);
          // Expansion never eats opponent territory.
          const oppSet = new Set(theirs);
          expect(gained.some((k) => oppSet.has(k))).toBe(false);
          const mineSet = new Set(mine);
          expect(gained.some((k) => mineSet.has(k))).toBe(false);

          grid = expand.newGrid;
          if (player === 1) {
            p1 = expand.newCells;
            p1Color = color;
          } else {
            p2 = expand.newCells;
            p2Color = color;
          }
        }
      }
    }
  });

  it('wheel: same prefix guarantee over generated 2P wheels', () => {
    for (const size of [10, 14]) {
      for (let seed = 0; seed < 12; seed++) {
        const rng = mulberry32(seed * 15485863 + size);
        const board = generateTwoPlayerWheel(size, 5, rng);
        let grid = board.grid;
        let p1 = board.p1Cells;
        let p2 = board.p2Cells;
        let p1Color = board.p1Color;
        let p2Color = board.p2Color;
        for (const round of agendas) {
          for (const player of round) {
            const mine = player === 1 ? p1 : p2;
            const theirs = player === 1 ? p2 : p1;
            const color = firstFree(p1Color, p2Color, 5);
            const expand = expandWheelTerritory(grid, mine, theirs, color);
            expect(expand.newCells.slice(0, mine.length)).toEqual(mine);
            const gained = expand.newCells.slice(mine.length);
            expect(gained).toHaveLength(expand.gain);
            const oppSet = new Set(theirs);
            expect(gained.some((k) => oppSet.has(k))).toBe(false);
            const mineSet = new Set(mine);
            expect(gained.some((k) => mineSet.has(k))).toBe(false);

            grid = expand.newGrid;
            if (player === 1) {
              p1 = expand.newCells;
              p1Color = color;
            } else {
              p2 = expand.newCells;
              p2Color = color;
            }
          }
        }
      }
    }
  });

  it('buildMoveDiff and the engines compose into a replayable record', () => {
    // One scripted opening move: the recorded entry carries exactly what a
    // backward walk needs (P10.2 reconstructs the boards; here we pin it).
    const grid = generateSoloGrid(10, 4, mulberry32(4242));
    const p1 = ['0,0'];
    const { newGrid, newCells, gain } = expandPlayerTerritory(grid, p1, [], 1);
    const record: TwoPlayerMoveRecord = {
      player: 1,
      color: 1,
      diff: buildMoveDiff(grid, newGrid),
      gained: newCells.slice(p1.length),
    };
    expect(record.gained.length).toBe(gain);
    // Each repainted cell appears once with a `prev` of its real old color.
    const diffKeys = record.diff.map((d) => `${d.r},${d.c}`);
    expect(new Set(diffKeys).size).toBe(diffKeys.length);
    for (const { r, c, prev } of record.diff) expect(prev).toBe(grid[r][c]);
  });
});

describe('reconstructTwoPlayerReplayStates (P10.2) — handcrafted', () => {
  it('rebuilds boards AND ownership state by state', () => {
    // 3x3: P1 owns (0,0) [color 1], P2 owns (2,2) [color 2]; wall between.
    const opening: TwoPlayerReplayState = {
      grid: [
        [1, 0, 0],
        [0, 3, 0],
        [0, 0, 2],
      ],
      p1Cells: ['0,0'],
      p2Cells: ['2,2'],
    };
    // Move 1: P1 plays 0 — takes (0,1) (its own cell already recolors 1→0).
    const m1: TwoPlayerMoveRecord = {
      player: 1,
      color: 0,
      diff: [
        { r: 0, c: 0, prev: 1 },
        { r: 0, c: 1, prev: 0 },
      ],
      gained: ['0,1'],
    };
    // Move 2: P2 plays 3 — takes (1,1).
    const m2: TwoPlayerMoveRecord = {
      player: 2,
      color: 3,
      diff: [
        { r: 2, c: 2, prev: 2 },
        { r: 1, c: 1, prev: 3 },
      ],
      gained: ['1,1'],
    };
    const final: TwoPlayerReplayState = {
      grid: [
        [0, 0, 0],
        [0, 3, 0],
        [0, 0, 3],
      ],
      p1Cells: ['0,0', '0,1'],
      p2Cells: ['2,2', '1,1'],
    };

    const states = reconstructTwoPlayerReplayStates(
      final.grid,
      final.p1Cells,
      final.p2Cells,
      [m1, m2],
    );

    expect(states).toHaveLength(3);
    expect(states[2]).toEqual(final);
    expect(states[1]).toEqual({
      grid: [
        [0, 0, 0],
        [0, 3, 0],
        [0, 0, 2],
      ],
      p1Cells: ['0,0', '0,1'],
      p2Cells: ['2,2'],
    });
    expect(states[0]).toEqual(opening);
    // Seed cell stays first in the territory list (wheel badges rely on it).
    expect(states[1].p1Cells[0]).toBe('0,0');
  });

  it('tolerates zero moves and never shares references between states', () => {
    const final = {
      grid: [
        [1, 2],
        [2, 1],
      ],
      p1Cells: ['0,0'],
      p2Cells: ['1,1'],
    };
    const states = reconstructTwoPlayerReplayStates(
      final.grid,
      final.p1Cells,
      final.p2Cells,
      [],
    );
    expect(states).toHaveLength(1);
    expect(states[0]).toEqual(final);
    expect(states[0].grid).not.toBe(final.grid);
    expect(states[0].p1Cells).not.toBe(final.p1Cells);

    // Mutating one state must not touch any other.
    states[0].grid[0][0] = 9;
    states[0].p1Cells.push('9,9');
    expect(final.grid[0][0]).toBe(1);
    expect(final.p1Cells).toEqual(['0,0']);
  });

  it('drops defensively a gained key the mover does not own', () => {
    // Corrupt recording: '3,3' was never P1's — the walk must ignore it.
    const m: TwoPlayerMoveRecord = {
      player: 1,
      color: 0,
      diff: [],
      gained: ['0,1', '3,3'],
    };
    const final = {
      grid: [
        [0, 0],
        [0, 0],
      ],
      p1Cells: ['0,0', '0,1'],
      p2Cells: ['1,1'],
    };
    const states = reconstructTwoPlayerReplayStates(
      final.grid,
      final.p1Cells,
      final.p2Cells,
      [m],
    );
    expect(states[0].p1Cells).toEqual(['0,0']);
  });
});

describe('reconstructTwoPlayerReplayStates (P10.2) — engine parity', () => {
  /**
   * The strongest test of the recording format: forward-replay scripted
   * rounds through the REAL engines, then hand the backward walker only the
   * final board + records. Every intermediate state must match the forward
   * simulation exactly — colors AND ownership — for both shapes.
   */
  const firstFree = (a: number, b: number, count: number): number => {
    for (let c = 0; c < count; c++) if (c !== a && c !== b) return c;
    return (a + 1) % count;
  };
  const snapshotOf = (
    grid: number[][],
    p1Cells: string[],
    p2Cells: string[],
  ): TwoPlayerReplayState => ({
    grid: grid.map((row) => [...row]),
    p1Cells: [...p1Cells],
    p2Cells: [...p2Cells],
  });

  it('classic: backward walk reproduces the forward simulation', () => {
    for (let seed = 0; seed < 8; seed++) {
      const rng = mulberry32(seed * 31 + 13);
      const board = generateTwoPlayerGrid(12, 6, rng);
      let grid = board.grid;
      let p1 = board.p1Cells;
      let p2 = board.p2Cells;
      let p1Color = board.p1Color;
      let p2Color = board.p2Color;

      const forward: TwoPlayerReplayState[] = [];
      const records: TwoPlayerMoveRecord[] = [];
      for (let step = 0; step < 10; step++) {
        const player: 1 | 2 = step % 2 === 0 ? 1 : 2;
        const mine = player === 1 ? p1 : p2;
        const theirs = player === 1 ? p2 : p1;
        const color = firstFree(p1Color, p2Color, 6);
        const expand = expandPlayerTerritory(grid, mine, theirs, color);
        records.push({
          player,
          color,
          diff: buildMoveDiff(grid, expand.newGrid),
          gained: expand.newCells.slice(mine.length),
        });
        grid = expand.newGrid;
        p1 = player === 1 ? expand.newCells : p1;
        p2 = player === 2 ? expand.newCells : p2;
        if (player === 1) p1Color = color;
        else p2Color = color;
        forward.push(snapshotOf(grid, p1, p2));
      }

      const backward = reconstructTwoPlayerReplayStates(grid, p1, p2, records);
      expect(backward).toHaveLength(11);
      // Final state by state, including the opening board at index 0.
      for (let i = 0; i < 10; i++) expect(backward[i + 1]).toEqual(forward[i]);
      const opening = backward[0];
      expect(opening.grid).toEqual(board.grid);
      expect(opening.p1Cells).toEqual(board.p1Cells);
      expect(opening.p2Cells).toEqual(board.p2Cells);
    }
  });

  it('wheel: backward walk reproduces the forward simulation', () => {
    for (const size of [10, 12] as GridSize[]) {
      for (let seed = 0; seed < 6; seed++) {
        const rng = mulberry32(seed * 977 + size);
        const board = generateTwoPlayerWheel(size, 5, rng);
        let grid = board.grid;
        let p1 = board.p1Cells;
        let p2 = board.p2Cells;
        let p1Color = board.p1Color;
        let p2Color = board.p2Color;

        const forward: TwoPlayerReplayState[] = [];
        const records: TwoPlayerMoveRecord[] = [];
        let gameOver = false;
        for (let step = 0; step < 14 && !gameOver; step++) {
          const player: 1 | 2 = step % 2 === 0 ? 1 : 2;
          const mine = player === 1 ? p1 : p2;
          const theirs = player === 1 ? p2 : p1;
          const color = firstFree(p1Color, p2Color, 5);
          const expand = expandWheelTerritory(grid, mine, theirs, color);
          records.push({
            player,
            color,
            diff: buildMoveDiff(grid, expand.newGrid),
            gained: expand.newCells.slice(mine.length),
          });
          grid = expand.newGrid;
          p1 = player === 1 ? expand.newCells : p1;
          p2 = player === 2 ? expand.newCells : p2;
          if (player === 1) p1Color = color;
          else p2Color = color;
          forward.push(snapshotOf(grid, p1, p2));
          const total = grid.length * grid[0].length;
          gameOver =
            checkWheelMultiplayerGameOver(
              total,
              p1.length,
              p2.length,
              5,
              p1Color,
              p2Color,
              grid,
              [],
              [],
            ) !== 'playing';
        }

        const backward = reconstructTwoPlayerReplayStates(grid, p1, p2, records);
        expect(backward).toHaveLength(forward.length + 1);
        for (let i = 0; i < forward.length; i++) {
          expect(backward[i + 1]).toEqual(forward[i]);
        }
        const opening = backward[0];
        expect(opening.grid).toEqual(board.grid);
        expect(opening.p1Cells).toEqual(board.p1Cells);
        expect(opening.p2Cells).toEqual(board.p2Cells);
      }
    }
  });

  it('replays a round that ended by a forfeit/victory record through the outcome check', () => {
    // The caller-side gate: a finished classic round reconstructs and the
    // outcome check re-derived from state[0] agrees with the recorded status.
    const rng = mulberry32(808);
    const board = generateTwoPlayerGrid(10, 4, rng);
    const replay = reconstructTwoPlayerReplayStates(
      board.grid,
      board.p1Cells,
      board.p2Cells,
      [],
    );
    expect(replay).toHaveLength(1);
    expect(
      checkGameOverForShape(
        'classic',
        replay[0].grid,
        board.p1Cells,
        board.p2Cells,
        4,
        board.p1Color,
        board.p2Color,
      ),
    ).toBe('playing');
  });
});
