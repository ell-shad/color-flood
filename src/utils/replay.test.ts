import { describe, it, expect } from 'vitest';
import { reconstructReplayStates } from './replay';
import type { SoloMoveDiff } from '../types';

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
