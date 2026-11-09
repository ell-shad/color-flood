import { describe, it, expect } from 'vitest';
import { buildMoveDiff, reconstructReplayStates } from './replay';
import {
  expandPlayerTerritory,
  generateTwoPlayerGrid,
  generateSoloGrid,
} from './floodLogic';
import { expandWheelTerritory, generateTwoPlayerWheel } from './circleEngine';
import { mulberry32 } from './engine';
import type { SoloMoveDiff, TwoPlayerMoveRecord } from '../types';

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
