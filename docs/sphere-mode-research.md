# Sphere Board Mode — Research & Design Note

Status: **research only** (no code). Proposed as Phase 12 in `ROADMAP.md`.

Goal: a fourth `BoardShape` — `'sphere'` — that plays the same floods-it rules on a closed
spherical surface, with the same guards the cube has: identical rules client/server, seeded
boards, share links, replays, records, 2P fairness, and a board the player can rotate.

---

## 1. The geometry problem (why this is not just "cube but round")

The cube works because its surface is a regular quad mesh: 6·N² cells, every cell has
exactly 4 neighbours, no singularities, and adjacency can be derived from shared 3D edges
(`cubeTopology` in `src/utils/cubeEngine.ts`).

A sphere cannot be covered by a regular quad mesh. By Euler's formula a closed surface with
only valence-4 vertices is a torus; on a sphere the curvature has to be concentrated somewhere.
Every practical spherical grid therefore carries a small number of defects:

| Grid family | Cells | Neighbour valence | Defects | Counts |
| --- | --- | --- | --- | --- |
| Lat/long ("orb") rings × meridians | (R−1)·M + 2 | 4 (3 at the caps) | 2 pole caps + strongly distorted polar cells | `WheelBoard`-like |
| Cube-sphere (spherified cube) | 6·N² | 4 everywhere | 8 cube corners where 3 cells meet | reuses `cubeEngine` exactly |
| Icosphere / Goldberg (geodesic dual) | 10·s² + 2 | 6, and 5 at twelve cells | exactly 12 pentagons | soccer-ball look |

Notes:

- Goldberg polyhedra always have **12 pentagons** and 10(T−1) hexagons (F = 10T + 2); the 12
  pentagons are the curvature, not an implementation artifact. An icosphere's 12 valence-5
  vertices are the same defect set.
- Lat/long puts all the distortion on the two poles (cells become arbitrarily thin wedges);
  the caps have to be special-cased or the board degenerates.
- The cube-sphere distributes distortion over 8 corners and keeps a perfect 4-neighbour
  graph everywhere, i.e. **the graph is bit-for-bit the cube graph**.

---

## 2. Options compared

### A. Lat/long orb — rings × meridians + 2 pole caps

- Storage mirrors the wheel: `grid[ring][sector]`, ring 1..R−1 plus two cap cells.
- Adjacency = wheel adjacency (`circleEngine`) with the seam closed at both hemispheres:
  sector ±1 mod M, ring ±1, ring 1 ↔ north cap, ring R−1 ↔ south cap.
- Rendering: SVG orthographic projection with a rotation matrix (same pipeline as
  `WheelBoard`: per-cell path + `fill` transitions + `fill-box` pop). Back faces culled by
  `normal · view > 0`, painter's-algorithm sort by depth.
- Pros: near-zero engine work; pole caps are the only new rule; 2P can start at antipodal
  (ring, sector + M/2) cells.
- Cons: visibly distorted cells at the poles; a cell count that only matches the ladder
  roughly ((R−1)·M + 2); the two caps are huge compared with the rest, so per-move gain is
  lumpy and needs its own calibration; polar triangles break the "all cells are quads" look.
- Effort: ~2–3 commits (engine + board + calibration).

### B. Cube-sphere (spherified cube) — recommended

- Keep the **existing cube topology unchanged**: cell `(face, i, j)` keeps its 4 neighbours,
  including across the 12 cube edges. Only the *rendering* changes: cells are projected
  radially onto a sphere.
- Projection: map face-local `(u, v) ∈ [−1, 1]²` to `normalize([u, v, 1])` (gnomonic, ~10
  lines) or Nowell's equal-area warp if corner cells look too big (simple version stretches
  cells near the 8 cube corners by roughly 1.3–1.4× linearly).
- Rendering: SVG with the same painter's-algorithm approach as A — project each cell's four
  corners through a rotation matrix, cull cells whose centre is behind the sphere, sort by
  depth. 96–384 polygons is well within the wheel's current budget, and it keeps the crisp
  cell edges the other boards already have. (CSS-3D per-cell tangent quads also works and
  would reuse the cube's `matrix3d` trick, but 384 transformed DOM nodes is heavier than 384
  SVG paths with one shared rotate.)
- Pros:
  - **`cubeEngine` is reused wholesale** — flood, hints, 2P generation, territory expansion,
    game over, bots, replay, seeds, share links (`shape=cube` plumbing pattern), move budget
    and star thresholds already calibrated.
  - 2P fairness already solved (antipodal seeds).
  - No poles, uniform valence 4, no special-case cells in the rules.
  - Tests can prove the geometry: every cell centre on the unit sphere, every shared display
    edge = a neighbour pair (the same invariant now enforced for the cube in
    `cubeEngine.test.ts → P11 cube render frames`).
- Cons: it is a *sphere-textured cube*, not a true uniform sphere — corner cells are larger
  and the 8 corners have a 3-face pinch in the mesh (graph-wise nothing special).
  Effort: ~3 commits (projection helper + board renderer + plumbing).

### C. Icosphere / Goldberg — the "true sphere" (later, optional)

- Subdivide the icosahedron, take the dual: 10s² + 2 cells, 12 pentagons and the rest
  hexagons. `s = 4 → 162`, `s = 5 → 252`, `s = 6 → 362`, `s = 7 → 492` cells, which brackets
  the ladder's 96–384.
- Adjacency can use the same trick the cube uses: parameterize cells on the unit sphere, hash
  shared edges from corner coordinates, and derive the neighbour table (proven approach, but
  float keys need a rounded canonical key instead of integer corners).
- Pros: uniformly sized cells, authentic sphere look, visible pentagons are a nice visual.
- Cons: a genuinely new engine surface (hex/pent flood, 5–6 neighbour bot heuristics), new
  calibration run, new replay/records counts, more rendering work (polygon clipping at the
  silhouette). This is a phase of its own.
- Effort: ~6–8 commits.

### Recommendation

Ship **B (cube-sphere)** as `shape: 'sphere'`: it delivers the sphere experience for the
least risk and reuses every rule, bot and calibration the cube already has. Keep **C** as a
later "geodesic" option if the pinched cube corners are not spherical enough in play; A is
not recommended because the poles make both the rules and the balance lumpy.

---

## 3. Design for option B

### 3.1 Storage and engine

- No new grid format. `grid: number[6N][N]` remains the contract (`N = cube side`), so
  seeds, diffs, replays, share links, records and the server never learn about spheres.
- New module `src/utils/sphereEngine.ts` (pure, cached, testable):
  - `sphereCellCenter(r, c, side): CubePoint` — `cubeCellCenter` direction, normalized to the
    unit sphere.
  - `sphereCellCorners(r, c, side): CubePoint[4]` — projected corners of the cell quad.
  - `sphereCellFrame(r, c, side)` — centre + tangent basis for the "up" direction of the
    projected quad (lets the renderer draw cells as small spherical quads instead of
    straight-line chords if desired).
  - Everything else is re-exported from `cubeEngine` (`cubeTopology`, `floodCube`,
    `checkCubeWin`, `bestCubeMoveWithGain`, 2P kernels, budgets). Document explicitly:
    *sphere mode is cube mode with a different projection; the graph is the contract.*
- `BoardShape` gains `'sphere'`; every `assertNever` switch must be updated (the compiler
  lists them): `boardShape.ts`, `useSoloGame`, `floodLogic` dispatchers, `shareLink`,
  `SoloScoreboard`, `ProgressiveTrack`, settings, help copy.

### 3.2 Rendering

`SphereBoard.tsx` (SVG, modelled on `WheelBoard` + `CubeBoard`):

- One `<svg viewBox="0 0 100 100">`; a rotate matrix from drag/arrow keys kept in a ref
  (`rx`, `ry`), applied to projected points (no per-frame React state).
- Per cell: project 4 corners → if all four are behind the sphere, skip; else polygon path
  with the theme fill + `cell-pop-<color>` animation + `fill` transition (same as wheel).
- Draw order: sort cells by centre depth (back to front). Optional silhouette rim
  (`stroke` on the sphere circle) so the orb reads as a solid body.
- Reuse `BoardCell`-level concerns: territory overlay = inset stroke colour on owned cells;
  seed badge = `P1`/`P2`/`BOT` text at the projected centre; solo flood origin = the same
  white ring the cube now draws.
- Emoji theme: draw the glyph as `<text>` at the projected centre, sized from the cell's
  projected area (min font size clamp).
- Accessibility: `role="img"` + label, arrow keys rotate, reduced-motion respected, and a
  keyboard-accessible alternative view is *not* needed (the flood is colour-driven).

### 3.3 Fairness, balance, records

- Solo: same `getMaxCubeMoves` / `getCubePar` / `rateCubeStars` — sphere and cube have the
  same graph, so the cube calibration (1.05× budget, greedy 100% over 500 seeds) transfers.
  Optionally run `scripts/cubeSim.ts` once with `shape=sphere` only as a sanity check.
- 2P: `generateTwoPlayerCube` already seeds P2 at the antipode; on the sphere the antipode is
  visually opposite, which is exactly what players expect.
- Records/stats: key by `shape: 'sphere'` (existing `HighScore.shape` union + zod enum in
  `useSoloGame`), so a sphere best never overwrites a cube best.
- Share links: `?seed=…&size=…&colors=…&shape=sphere`; `shareLink.test.ts` currently asserts
  `shape=sphere` is rejected — flip that case to a positive test.

### 3.4 Task breakdown (commit-sized)

| ID | Task |
| --- | --- |
| P12.1 | `sphereEngine.ts` projection + geometry tests (unit sphere, shared display edges = `cubeTopology` neighbours, no overlaps) |
| P12.2 | `BoardShape` plumbing (`sphere`) through dispatch, prefs, share links, records, help copy, scoreboard labels |
| P12.3 | `SphereBoard` SVG renderer (rotation, culling, painter's sort, wave stagger, territory, seed/origin markers, emoji glyphs) + `BoardRenderer` case |
| P12.4 | Replay/lobby/settings sweep + browser E2E (solo win, 2P vs bot, share link, replay) and gate run |

### 3.5 Test plan

- Geometry: `sphereCellCenter` length ≈ 1 for all cells and all ladder sides; projected cell
  quads tile without overlap; every edge shared by exactly two cells; derived adjacency
  equals `cubeTopology` (the invariant that caught the cube's old scrambled faces).
- Parity: sphere solo states match cube states for the same seed and colour sequence
  (same graph ⇒ identical grids) — a single test proves the reuse is genuine.
- Rendering smoke (browser): flood crosses the "north pole" (cube corner) correctly, back
  faces are culled, cells stay clickable through the palette only.

### 3.6 Risks / open questions

- **Corner distortion** (option B): 8 pinches where three cube faces meet; the projected
  quads overlap slightly unless cells are inset a few percent. Mitigation: draw cells at 96–98%
  of their projected size, or use Nowell's equal-area map.
- **Silhouette clipping**: cells on the limb are half-visible; either clamp the polygon to the
  circle (SVG clip-path is enough) or accept the raggedy edge (the cube already has hard edges).
- **Perf**: 384 polygons × 4 points re-projected per pointer frame is O(1.5k) math per frame —
  fine if projection stays in a ref-driven rAF loop (same pattern as `CubeBoard`'s inertia).
- **Naming**: "sphere" is a display projection of the cube graph; documentation and the help
  modal must say so, or a player who compares boards will expect a different graph.
