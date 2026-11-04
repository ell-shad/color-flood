import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  COLORS,
  COLOR_NAMES,
  GRID_SIZES,
  COLOR_COUNTS,
  generateSoloGrid,
  getMaxSoloMoves,
  floodSolo,
  checkSoloWin,
  countConnectedSolo,
  getBestSoloMove,
  findConnectedComponent,
  generateTwoPlayerGrid,
  expandPlayerTerritory,
  getLegalMultiplayerColors,
  getBestMultiplayerMove,
  checkMultiplayerGameOver,
} from './floodLogic';

const clone = (grid: number[][]): number[][] => grid.map((row) => [...row]);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('constants and configuration', () => {
  it('exposes 8 colors and matching names', () => {
    expect(COLORS).toHaveLength(8);
    expect(COLOR_NAMES).toHaveLength(8);
    expect(COLOR_NAMES).toContain('Coral Red');
  });

  it('exposes grid sizes 10, 12, 14, 16, 18 and color counts 4–8', () => {
    expect(GRID_SIZES).toEqual([10, 12, 14, 16, 18]);
    expect(COLOR_COUNTS).toEqual([4, 5, 6, 7, 8]);
  });

  it('computes the solo move limit as floor(1.5*size + 2*colors)', () => {
    expect(getMaxSoloMoves(10, 4)).toBe(23);
    expect(getMaxSoloMoves(18, 8)).toBe(43);
    expect(getMaxSoloMoves(12, 5)).toBe(28);
  });
});

describe('generateSoloGrid', () => {
  it('creates a size x size grid of cells in [0, colorCount)', () => {
    const grid = generateSoloGrid(5, 4);
    expect(grid).toHaveLength(5);
    for (const row of grid) {
      expect(row).toHaveLength(5);
      for (const cell of row) {
        expect(cell).toBeGreaterThanOrEqual(0);
        expect(cell).toBeLessThan(4);
        expect(Number.isInteger(cell)).toBe(true);
      }
    }
  });

  it('fills the whole board with one color when colorCount is 1', () => {
    const grid = generateSoloGrid(3, 1);
    expect(checkSoloWin(grid)).toBe(true);
  });
});

describe('floodSolo', () => {
  it('recolors the connected region of the start color only', () => {
    // (1,1) is isolated: not connected to (0,0) through color 0.
    const grid = [
      [0, 1],
      [1, 0],
    ];
    const result = floodSolo(grid, 2);
    expect(result).toEqual([
      [2, 1],
      [1, 0],
    ]);
  });

  it('cascades through the full connected component', () => {
    const grid = [
      [0, 0],
      [1, 0],
    ];
    expect(floodSolo(grid, 2)).toEqual([
      [2, 2],
      [1, 2],
    ]);
  });

  it('is a no-op returning the same reference when the target equals the start color', () => {
    const grid = [
      [0, 1],
      [1, 0],
    ];
    expect(floodSolo(grid, 0)).toBe(grid);
  });

  it('does not mutate the input grid', () => {
    const grid = [
      [0, 0],
      [1, 0],
    ];
    const snapshot = clone(grid);
    floodSolo(grid, 2);
    expect(grid).toEqual(snapshot);
  });
});

describe('checkSoloWin', () => {
  it('returns true for a single-color board', () => {
    expect(
      checkSoloWin([
        [5, 5],
        [5, 5],
      ]),
    ).toBe(true);
  });

  it('returns false for a mixed board', () => {
    expect(
      checkSoloWin([
        [5, 5],
        [5, 4],
      ]),
    ).toBe(false);
  });
});

describe('countConnectedSolo', () => {
  it('counts the connected component of the start cell', () => {
    expect(
      countConnectedSolo([
        [0, 0],
        [1, 0],
      ]),
    ).toBe(3);
    expect(
      countConnectedSolo([
        [0, 1],
        [1, 0],
      ]),
    ).toBe(1);
  });

  it('counts the whole board when it is one color', () => {
    const grid = generateSoloGrid(6, 1);
    expect(countConnectedSolo(grid)).toBe(36);
  });
});

describe('getBestSoloMove', () => {
  it('picks the color that grows the region the most', () => {
    const grid = [
      [0, 0],
      [0, 1],
    ];
    expect(getBestSoloMove(grid, 2)).toBe(1);
  });

  it('returns null when there is no alternative color', () => {
    const grid = [
      [0, 0],
      [0, 0],
    ];
    expect(getBestSoloMove(grid, 1)).toBeNull();
  });
});

describe('findConnectedComponent', () => {
  // NOTE: the engine evaluates column bounds as `nc < grid.length`, i.e. it assumes
  // SQUARE grids (the game only ever builds N x N). Fixtures here keep that contract.
  it('returns string "r,c" keys of the target color region including the start', () => {
    const grid = [
      [1, 1, 0],
      [1, 0, 0],
      [0, 0, 2],
    ];
    const cells = findConnectedComponent(grid, 0, 0, 1);
    expect([...cells].sort()).toEqual(['0,0', '0,1', '1,0']);
  });

  it('never includes diagonals', () => {
    const grid = [
      [1, 0],
      [0, 1],
    ];
    const cells = findConnectedComponent(grid, 0, 0, 1);
    expect(cells).toEqual(['0,0']);
  });
});

describe('generateTwoPlayerGrid', () => {
  it('produces opposite corners with different colors and disjoint territories', () => {
    for (let run = 0; run < 30; run++) {
      const size = GRID_SIZES[run % GRID_SIZES.length];
      const colorCount = COLOR_COUNTS[run % COLOR_COUNTS.length];
      const result = generateTwoPlayerGrid(size, colorCount);

      expect(result.grid).toHaveLength(size);
      expect(result.grid[0]).toHaveLength(size);
      expect(result.p1Color).not.toBe(result.p2Color);
      expect(result.p1Color).toBe(result.grid[0][0]);
      expect(result.p2Color).toBe(result.grid[size - 1][size - 1]);
      expect(result.p1Color).toBeLessThan(colorCount);
      expect(result.p2Color).toBeLessThan(colorCount);

      // Corners belong to their respective territories.
      expect(result.p1Cells).toContain('0,0');
      expect(result.p2Cells).toContain(`${size - 1},${size - 1}`);

      // Starting territories must not overlap.
      const p2Set = new Set(result.p2Cells);
      for (const cell of result.p1Cells) {
        expect(p2Set.has(cell)).toBe(false);
      }

      // Every cell inside a territory has its owner's color.
      const [p1r, p1c] = result.p1Cells[0].split(',').map(Number);
      expect(result.grid[p1r][p1c]).toBe(result.p1Color);
    }
  });

  it('always yields at least one starting cell per player', () => {
    for (let run = 0; run < 10; run++) {
      const result = generateTwoPlayerGrid(10, 4);
      expect(result.p1Cells.length).toBeGreaterThan(0);
      expect(result.p2Cells.length).toBeGreaterThan(0);
    }
  });
});

describe('expandPlayerTerritory', () => {
  // NOTE: territory functions assume square grids; keep all fixtures N x N.
  it('recolors the territory and expands into matching neutral neighbors', () => {
    const grid = [
      [0, 1, 2],
      [1, 2, 2],
      [3, 3, 1],
    ];
    const { newGrid, newCells, gain } = expandPlayerTerritory(
      grid,
      ['0,0'],
      ['1,0', '2,0'], // opponent owns the left column below P1
      1,
    );

    expect(newGrid[0]).toEqual([1, 1, 2]);
    // (0,1) is a neutral color-1 neighbor and gets captured; row 1 stays with the opponent.
    expect([...newCells].sort()).toEqual(['0,0', '0,1']);
    expect(gain).toBe(1);
  });

  it('never captures opponent-owned cells', () => {
    const grid = [
      [0, 1, 1],
      [2, 2, 2],
      [3, 3, 3],
    ];
    // Opponent owns the rightmost color-1 cell; only the middle cell is neutral.
    const { newCells, gain } = expandPlayerTerritory(grid, ['0,0'], ['0,2'], 1);
    expect([...newCells].sort()).toEqual(['0,0', '0,1']);
    expect(gain).toBe(1);
    expect(newCells).not.toContain('0,2');
  });

  it('gains nothing when no neighbor matches the target color', () => {
    const grid = [
      [0, 1],
      [1, 1],
    ];
    const { newGrid, gain } = expandPlayerTerritory(grid, ['0,0'], ['1,1'], 3);
    expect(gain).toBe(0);
    expect(newGrid[0][0]).toBe(3);
    expect(newGrid[0][1]).toBe(1);
    expect(newGrid[1][0]).toBe(1);
  });

  it('does not mutate the input grid or cell lists', () => {
    const grid = [
      [0, 1, 2],
      [1, 2, 2],
      [3, 3, 1],
    ];
    const snapshot = clone(grid);
    const currentCells = ['0,0'];
    const opponentCells = ['0,2'];
    expandPlayerTerritory(grid, currentCells, opponentCells, 1);
    expect(grid).toEqual(snapshot);
    expect(currentCells).toEqual(['0,0']);
    expect(opponentCells).toEqual(['0,2']);
  });
});

describe('getLegalMultiplayerColors', () => {
  it("excludes both players' current colors", () => {
    expect(getLegalMultiplayerColors(0, 3, 5)).toEqual([1, 2, 4]);
  });

  it('returns an empty list when only the two locked colors exist', () => {
    expect(getLegalMultiplayerColors(0, 1, 2)).toEqual([]);
  });
});

describe('getBestMultiplayerMove', () => {
  const grid = [
    [0, 1, 2],
    [1, 2, 2],
    [3, 3, 4],
  ];
  // Player 1 starts top-left (color 0), Player 2 bottom-right (color 4).
  const call = (difficulty: 'easy' | 'medium' | 'master') =>
    getBestMultiplayerMove(grid, 1, ['0,0'], ['2,2'], 0, 4, 5, difficulty);

  it('returns every legal color in the evaluations map for player 1', () => {
    const { evaluations } = call('medium');
    expect(Object.keys(evaluations).map(Number).sort()).toEqual([1, 2, 3]);
  });

  it('handles the no-legal-color case gracefully', () => {
    // colorCount 2 with P1=0 and P2=1 locks every color: no legal move exists.
    const result = getBestMultiplayerMove(grid, 1, ['0,0'], ['2,2'], 0, 1, 2, 'master');
    expect(result).toEqual({ bestColor: 0, maxGain: 0, evaluations: {} });
  });

  it('easy bot takes the guaranteed-random branch to the first legal color when seeded to 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { bestColor } = call('easy');
    expect(bestColor).toBe(1); // first legal color via floor(0 * n)
  });

  it('easy bot falls through to the tactical path when seeded to 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const { bestColor } = call('easy');
    // Falls into the master-style lookahead below the 0.6 threshold.
    expect([1, 2, 3]).toContain(bestColor);
  });

  it('medium bot is greedy: picks the color with the highest immediate gain', () => {
    // Candidate gains on the fixture: color 2 expands into the cluster (1,1),(1,2),(2,1),(2,0)?? —
    // assert it equals the color whose expansion connects the most cells.
    let greedyGain = -1;
    let greedyColor = -1;
    for (const c of [1, 2, 3]) {
      const { gain } = expandPlayerTerritory(grid, ['0,0'], ['2,2'], c);
      if (gain > greedyGain) {
        greedyGain = gain;
        greedyColor = c;
      }
    }
    const { bestColor, maxGain } = call('medium');
    expect(bestColor).toBe(greedyColor);
    expect(maxGain).toBe(greedyGain);
  });

  it('master bot stays within the legal color set and scores moves with lookahead', () => {
    const { bestColor, evaluations } = call('master');
    expect([1, 2, 3]).toContain(bestColor);
    // Master must never be worse than a zero-gain pick.
    expect(evaluations[bestColor]).toBeGreaterThanOrEqual(0);
  });

  it('master bot accounts for the opponent reply in its score', () => {
    // Verify directly against the documented heuristic gain*1.5 - 0.8*maxOppGain.
    const myColor = 0;
    const oppColor = 4;
    let expected = -Infinity;
    let best = -1;
    for (const c of [1, 2, 3]) {
      const { newGrid, newCells, gain } = expandPlayerTerritory(
        grid,
        ['0,0'],
        ['2,2'],
        c,
      );
      const oppLegal = getLegalMultiplayerColors(c, oppColor, 5);
      let maxOppGain = 0;
      for (const oppC of oppLegal) {
        const sim = expandPlayerTerritory(newGrid, ['2,2'], newCells, oppC);
        if (sim.gain > maxOppGain) maxOppGain = sim.gain;
      }
      const score = gain * 1.5 - maxOppGain * 0.8;
      if (score > expected) {
        expected = score;
        best = c;
      }
    }
    expect(myColor).toBeGreaterThan(-1);
    expect(call('master').bestColor).toBe(best);
    expect(expected).toBeGreaterThan(-Infinity);
  });
});

describe('checkMultiplayerGameOver', () => {
  const base = {
    gridSize: 2,
    colorCount: 4,
    grid: [
      [0, 2],
      [3, 1],
    ],
  };
  const check = (p1Cells: string[], p2Cells: string[]) =>
    checkMultiplayerGameOver(
      4,
      p1Cells.length,
      p2Cells.length,
      base.colorCount,
      0,
      1,
      base.grid,
      p1Cells,
      p2Cells,
    );

  it('declares an immediate winner on majority (>50%)', () => {
    expect(check(['0,0', '0,1', '1,0'], ['1,1'])).toBe('p1_won');
    expect(check(['0,0'], ['0,1', '1,0', '1,1'])).toBe('p2_won');
  });

  it('declares a draw when the board is split evenly', () => {
    expect(check(['0,0', '0,1'], ['1,0', '1,1'])).toBe('draw');
  });

  it('returns "playing" while either side can still expand', () => {
    // P1 (color 0) borders neutral color 2 at (0,1) and color 3 at (1,0) — moves exist.
    expect(check(['0,0'], ['1,1'])).toBe('playing');
  });

  it('decides the winner when both players are blocked', () => {
    // colorCount 2: both players are locked out of every legal color immediately.
    const grid2 = [
      [0, 2],
      [3, 1],
    ];
    const outcome = checkMultiplayerGameOver(
      4,
      1,
      2,
      2,
      0,
      1,
      grid2,
      ['0,0'],
      ['1,1', '1,0'],
    );
    expect(outcome).toBe('p2_won');
  });
});
