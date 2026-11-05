# Color Flood Master — Improvement Roadmap

This document is the **single source of truth** for the refactor/feature plan. It doubles as a
progress tracker: every task has a checkbox and status, and the ledger at the top is updated at
every checkpoint so work can be **resumed after any interruption** (session end, usage limit,
crash) without losing context.

---

## 🔁 Interruption & Resume Protocol (read this first)

The agent performing this plan may be interrupted at any moment (usage/token limit, session end).
The plan is therefore designed around **small, independently committed units of work**.

### Rules that make resumption safe

1. **Never leave uncommitted work** — commit after every task (or clearly separable sub-task),
   not just after whole phases. Each commit message references the task ID, e.g.
   `P0.3: add vitest + unit tests for floodLogic`.
2. **Update the Status Ledger below before starting a task** (mark 🟡) and after finishing it
   (mark ✅ + notes). The ledger is committed together with the task's commit whenever it changes.
3. Never half-finish a task without committing: a task that cannot be completed in the remaining
   budget must be left in one of two states:
   - not started (no changes on disk), or
   - committed and marked 🟡 in the ledger with an explicit `NEXT:` note describing exactly what
     remains.
4. Run the phase checks (`tsc --noEmit`, tests, `vite build`) before every commit that changes
   source code — never commit red.

### How to resume after an interruption

1. `git log --oneline -10` → note the newest commit and its task ID.
2. Read the **Status Ledger** below. The first task that is not ✅ is where work resumes.
3. If the ledger says 🟡 with a `NEXT:` note, follow that note; otherwise start the task fresh.
4. Before resuming, run the verification commands listed for that phase to confirm the tree is
   green on disk.
5. Update the ledger (🟡) and commit it *before* making new changes, so the resumed session is
   itself interruption-safe.

### Status markers

| Marker | Meaning |
| ------ | ------- |
| ⬜ | Not started |
| 🟡 | In progress (see `NEXT:` note in ledger) |
| ✅ | Done, checks passing |
| ⏸ | Blocked / deferred (see notes) |

---

## 📊 Status Ledger (update at every checkpoint)

| Phase | Status | Last commit | Notes |
| ----- | ------ | ----------- | ----- |
| 0 — Safety net | ✅ | 710105d (P0.9) | DONE. 36 floodLogic tests, eslint+prettier+CI, prod start fixed, genai/GEMINI removed, package renamed, license headers consistent. 10 eslint warnings (react-hooks compiler diagnostics) deliberately deferred to Phase 4 |
| 1 — Engine | ✅ | 10ad383 | Flat engine shipped behind adapter; parity suite (legacy oracle) green; A/B bench ~1.5–2.7x on solo ops, master bot at par (real gain lands with P2.6 minimax) |
| 2 — Balance & AI | ✅ | 3418f6b (P2.1–P2.5) + P2.6–P2.8 in next commit | Solver-calibrated limits+stars; competent ≥90% verified at all 25 configs; hints limited (3 solo / none online / opt-in local+bot); minimax master (beats legacy heur. 80%, slowest move 56ms) in Web Worker; bot ladder tests master 85% vs medium, medium 96% vs easy |
| 3 — Online rewrite | ✅ | 808a133, 0ee6299, 20acb96, P3.6 commit | Single server-authoritative ws protocol (zod, token→role, versioned snapshots, optimistic UI), PeerJS/REST-polling/legacy REST removed, reconnection (heartbeat, 60 s grace + forfeit, resume-by-token w/ 2 h TTL), turn timer off/30/60, hardening (helmet, APP_URL CORS, rate limits); 95 tests incl. 13 live two-client protocol tests. MANUAL CHECK PENDING: two real browsers + refresh mid-game (see DoD) |
| 4 — Front-end architecture | ⬜ | — | — |
| 5 — UX & accessibility | ⬜ | — | — |
| 6 — Features | ⬜ | — | — |

<!-- When resuming: replace the phase row above that is 🟡 with the current commit hash and a
     `NEXT:` note describing the next task, e.g.
     "P0.3 tests committed ✅ NEXT: P0.4 eslint config". -->

### Continuous verification commands

```bash
npm run typecheck   # tsc --noEmit
npm run test        # vitest run
npm run lint        # eslint . (added in P0.2)
npm run build       # vite build
npm run sim         # added in P2 — solver simulation & win-rate table
```

---

## Phase 0 — Safety Net ⬜→🟡

Goal: never lose the existing behavior while we refactor. Baseline tests + hygiene.

| ID | Task | Status |
| -- | ---- | ------ |
| P0.1 | Create ROADMAP.md with ledger + interruption protocol (this file) | ✅ |
| P0.2 | Add **Vitest** (`npm i -D vitest`) and scripts (`test`, `test:watch`); wire into `tsconfig` if needed | ✅ (vitest 3.2.7) |
| P0.3 | Unit tests for `src/utils/floodLogic.ts`: | ✅ (36 tests) |
| | - `generateSoloGrid` (dimensions, color range) | ✅ |
| | - `floodSolo` (recolors connected region only, no-op when same color, non-mutating) | ✅ |
| | - `checkSoloWin` (all-one-color, mixed grid) | ✅ |
| | - `countConnectedSolo` & `getBestSoloMove` (picks max-gain color) | ✅ |
| | - `findConnectedComponent` (diagonals excluded, boundaries) | ✅ |
| | - `generateTwoPlayerGrid` fairness over many runs: corners differ, territories disjoint, fallback path | ✅ |
| | - `expandPlayerTerritory` (respects opponent cells, gain accounting, no leakage into opponent) | ✅ |
| | - `getLegalMultiplayerColors` (excludes both current colors) | ✅ |
| | - `getBestMultiplayerMove` (easy randomness range, medium greedy, master lookahead denies opponent) | ✅ |
| | - `checkMultiplayerGameOver` (majority, all-occupied, blocked-both, playing) | ✅ |
| P0.4 | Add **ESLint 9 (flat config) + Prettier**, scripts `lint`, `format`; fix findings without changing behavior | ✅ |
| P0.5 | GitHub Actions CI: node 22 single job, steps = install → lint → typecheck → test → build | ✅ |
| P0.6 | Fix `npm start`: `cross-env NODE_ENV=production`, build then serve `dist` (`"start": "npm run build && cross-env NODE_ENV=production tsx server.ts"`) | ✅ (verified: health endpoint + static bundle served) |
| P0.7 | Remove `@google/genai` dependency and `process.env.GEMINI_API_KEY` `define` in `vite.config.ts` (key embedded in client bundle); refresh `package-lock.json` | ✅ |
| P0.8 | Rename package `react-example` → `color-flood` (version bump to 0.1.0) | ✅ |
| P0.9 | License consistency: LICENSE is MIT → remove Apache-2.0 `@license / SPDX` headers from all first-party files | ✅ (21 files) |
| P0.10 | README fix: real clone URL (`github.com/ell-shad/color-flood`), correct grid options (10/12/14/16/18) and color counts (4–8), accurate project structure, note `npm start` builds+serves, remove fake screenshot | ✅ (fake picsum screenshot removed; progressive challenge + themes documented) |

**Phase 0 checks:** `npm run typecheck && npm run test && npm run lint && npm run build` all green ✅.
**Deferred:** 10 react-hooks compiler warnings (`set-state-in-effect`, `refs`, `immutability`)
in `App.tsx` / `OnlineLobby.tsx` / `useOnlineMultiplayer.ts` — resolving them requires the
state-management restructure planned in **Phase 4** (rules intentionally downgraded to
`warn` in `eslint.config.js` with a promotion note). Also noted: the engine assumes square
grids (`nc < grid.length` is used as the column bound) — documented in tests, unaffected today
since the game only builds N×N.

---

## Phase 1 — Engine ⬜

Goal: `floodLogic` = single pure engine shared by client & server; flat typed-array grid,
index-based BFS; seedable RNG.

| ID | Task | Status |
| -- | ---- | ------ |
| P1.1 | Benchmark current engine on 18x18 (ops/sec for flood, expand, best-move) before rewrite; record numbers in ledger notes | ✅ (`scripts/benchmark.ts`; numbers below) |
| P1.2 | New flat engine: `Uint8Array`/`Int32Array` grid (row-major), index-based BFS with ring-buffer queue (no `queue.shift()`), no `r,c` string keys, no string[] territories | ✅ (`src/utils/engine.ts`) |
| P1.3 | Pure-function API: `flood`, `expandTerritory`, `legalColors`, `gameOver`, `connectedRegion`, `regionIdMap`; immutability via copy-on-write or explicit clone | ✅ (floodFlat, expandTerritoryFlat + gain-only variant, legalColorsFlat, checkMultiplayerGameOverFlat, connectedRegionFlat, countRegionFlat, bestSoloMoveFlat, bestMultiplayerMoveFlat; `toFlat` rejects non-square grids with RangeError) |
| P1.4 | Seedable RNG (`mulberry32`), thread through all generators (`generateSoloGrid`, `generateTwoPlayerGrid`, bot randomness); default remains nondeterministic at call sites | ✅ (bot RNG threaded in P2.6 via `BotMoveOptions.rng`) |
| P1.5 | Adapters so existing callers (App.tsx, server.ts, components) keep working; delete duplicate logic from `useOnlineMultiplayer.ts` where it diverges from engine | ✅ (`floodLogic.ts` is now a thin adapter over the engine; signatures unchanged — the hook had no duplicated engine logic, it already imported floodLogic) |
| P1.6 | Port all P0 tests to the new engine + property tests (old vs new engine parity on random boards) | ✅ (`engineParity.test.ts`, 15 tests incl. seeded legacy-oracle comparisons; caught a real bug in the first optimized best-move — disconnected startColor blobs were wrongly traversable) |
| P1.7 | Benchmark after; record numbers; ledger note `BEFORE: … / AFTER: …` | ✅ (`npm run bench` = interleaved A/B, noise-robust; numbers below) |

**Phase 1 checks:** typecheck, tests, build, lint green; parity suite proves identical outputs to
the old engine for the same seeds; benchmark ≥2x on 18x18 or documented as why-not. ✅

### Phase 1 benchmark ledger (18x18, 8 colors)

Absolute single-run numbers on this machine were too noisy (3x swing between processes), so the
official metric is `npm run bench` (`scripts/abBench.ts`): OLD and NEW timed in alternating
blocks in the same process — the ratio is robust to background load. Consistent across runs:

| Operation | NEW/OLD time ratio | Meaning |
| --------- | ------------------ | ------- |
| single flood | 0.48 – 0.67 | ~1.5 – 2.1x faster |
| best solo move (7-way greedy) | 0.55 – 0.80 | ~1.3 – 1.8x faster |
| expand territory | 0.37 – 0.50 | ~2.0 – 2.7x faster |
| master bot evaluation | 0.96 – 1.00 | at par (see note) |
| generate 2-player board | 0.77 – 0.78 | ~1.3x faster |

Note: the master bot is at par because its cost is dominated by ~7 candidates x (expand + up
to 7 opponent-reply sims); the flat representation removes the string-key/shift overheads but
the algorithmic shape is unchanged. The big win here comes in **P2.6**, which replaces this
heuristic with time-boxed alpha-beta minimax running in a Web Worker.

Raw per-op absolute numbers (warm, single process, 500 iters, run-dependent):
floodSolo ~44–184k ops/s; expandPlayerTerritory ~47–118k; getBestMultiplayerMove ~1.6–4.6k;
new floodFlat ~154–394k; expandTerritoryFlat ~121–657k; bestSoloMoveFlat ~78–785k. Treat the
ratios above as the stable figure.

---

## Phase 2 — Balance & AI ✅

Goal: solver-calibrated solo limits + stars; limited/removed hints; strong seeded bots in a worker.

| ID | Task | Status |
| -- | ---- | ------ |
| P2.1 | Build stronger solver (greedy + beam search with 1–2 move lookahead) inside `sim` tooling | ✅ 3418f6b (`soloSolver.ts`: greedy = hint rule + beam) |
| P2.2 | `npm run sim` script: table of config → par estimate, greedy wins, solver wins, current limit | ✅ 3418f6b (calibration + `--verify`, idempotent `--persist`) |
| P2.3 | Replace `floor(1.5*size + 2*colors)` with per-config par table + difficulty slack; target ~90%+ win rate at every config for a competent player, easy configs not trivial | ✅ 3418f6b (limit = clamp(p90+1, par+2, par+8); verified 95–100% at all 25 configs) |
| P2.4 | 1–3 star rating per solo game (e.g. ≤par =3★, +2 =2★, ≤limit =1★); persist per config | ✅ 3418f6b (rendered in SoloScoreboard; ⏸ per-config star record persistence deferred to Phase 4 storage helper) |
| P2.5 | Hints: 3 per solo game (or cost a star); removed from online; default-off in local/bot with a settings toggle (preserve availability offline) | ✅ 3418f6b (3/game enforced; online removed; settings toggle persisted) |
| P2.6 | Master bot = time-boxed depth-limited minimax with alpha-beta, evaluation = territory diff + frontier size + reachable neutral cells; respect seeded RNG | ✅ Beats legacy heuristic 16–4 (80%) on 10x10/5c; slowest move 56ms on 18x18/8c (avg 35ms) |
| P2.7 | Run bot computation in a **Web Worker** for all bot matches; UI never blocks on 18x18 | ✅ `botWorker.ts` + `botWorkerClient.ts`: singleton worker, stale-response guard, sync fallback; bundled in dist |
| P2.8 | Seeded bot tests: master ≥70% wins vs medium; medium ≥70% vs easy | ✅ `botStrength.test.ts`: master 85% vs medium, medium 96% vs easy (fully deterministic, 0.7s) |

**Phase 2 checks:** checks green + `npm run sim` table meeting targets in the DoD.
**Phase 2 result:** `npm run sim -- --verify` (200 boards/config): competent player ≥90% at all 25 configs + limit bounds par+2..par+8 enforced; solo limits recalibrated (e.g. 10x10/4c 23→14).

---

## Phase 3 — Online Multiplayer Rewrite ✅

> Manual acceptance (pending user): open two browsers, finish a match with no desync, and
> refresh mid-game with `?room=CODE` — the reloading player must resume by token with their
> original role (P1 stays P1). Everything mechanizable is automated (95 tests).

Known defects (confirmed by reading server.ts + useOnlineMultiplayer.ts): three sync layers
(PeerJS + REST/1.2s polling + unused ws), host grid never sent on `POST /api/rooms` so polling
overwrites local state, `role`/auth from request body (`playerToken` unchecked — anyone can move
for either player, accept resets, change settings, close room; `/accept-reset` doesn't check a
proposal exists; `bind_player` unauthenticated), no validation of color/gridSize/colorCount
(size change mid-game corrupts win check), `requestedCode` can hijack an existing room, CORS `*`,
no rate limit, `joinRoom` hard-codes role 2 so a host reloading via `?room=` believes they are P2.

| ID | Task | Status |
| -- | ---- | ------ |
| P3.1 | Design one **server-authoritative WebSocket protocol**, typed shared messages validated by **zod** (intent-only client messages) | ✅ 808a133 `server/protocol.ts` shared by server+client |
| P3.2 | Server: token→role on every message; validate turn, color range, legality; clamp/validate settings (lobby-only changes or approved reset); max 2 players; server-generated room codes | ✅ 808a133 `server/rooms.ts` (+14 unit tests) |
| P3.3 | Broadcast state with monotonic `version`; client optimistic UI with rollback on rejection | ✅ P3.4 commit (version gate in new hook; rejected intents auto-`resume`) |
| P3.4 | Remove PeerJS + REST polling + duplicate REST endpoints from the client and server | ✅ P3.4 commit (single ws protocol; `peerjs` uninstalled) |
| P3.5 | Reconnection: heartbeat, 60 s grace, resume-by-token after refresh (localStorage with expiry), forfeit on timeout, optional turn timer (off/30/60 s) | ✅ P3.5 commit (ws heartbeat 25 s, 60 s grace + forfeit, session resume w/ 2 h TTL, turn timer off/30/60 host-only, 5 service tests) |
| P3.6 | Server hardening: CORS restricted to APP_URL, body size limit, rate limiting, `helmet`, room storage behind a storage interface (in-memory default) | ✅ P3.6 commit (`helmet` CSP-off until PWA, APP_URL CORS + same-host allowance, 120 req/min HTTP limit, 16 KiB JSON; ws 8 KiB cap + 30 msg/2 s + RoomStore seam landed in P3.1) |
| P3.7 | Keep the fix for `joinRoom` role derivation (host reload via `?room=` must not become P2) | ✅ 808a133 (role always derived from token) |
| P3.8 | Tests with two ws clients incl. cheating attempts: wrong turn, spoofed role, invalid color, oversized grid, duplicate room code, unauthenticated bind | ✅ P3.4 commit `server/wsProtocol.test.ts` (13 live-socket tests: wrong turn, forged token, bad color, 9KiB close, no-proposal, settings lock, proposal flow, leave, rate limit, emote, resume, malformed) |

**Phase 3 checks:** all checks green; manual two-browser match incl. refresh mid-game stays in sync.

---

## Phase 4 — Front-end Architecture 🔶 (P4.1–P4.5, P4.7, P4.8 done; P4.6 + lint promotion pending)

| ID | Task | Status |
| -- | ---- | ------ |
| P4.1 | Split `App.tsx` (~1,200 lines) into feature components/hooks | ✅ fcb19bd (App 1,343→310 lines; usePrefs / useSoloGame / useLocalMatch / useGameSession) |
| P4.2 | Introduce `useGameSession()` exposing one view model (grid, territories, turn, legal colors, status, actions) with adapters for solo/local/bot/online; kill the `opponent === 'online' && roomState ? … : …` ternaries | ✅ fcb19bd (online rooms coerced to TwoPlayerGameState in coerceRoom; derived view props feed GameGrid/palette/modal) |
| P4.3 | `useReducer` for local game state | ✅ fcb19bd (solo + local/bot machines move engine calls into reducers; side-effect callbacks stay sync like before) |
| P4.4 | Fix init effect that re-creates both games on `gridSize/colorCount/challengeType` change (can wipe a game in progress) | ✅ fcb19bd (reducer lazy initializers build the first boards; only explicit handlers re-create) |
| P4.5 | Safe storage helper: try/catch, zod validation, versioned keys — corrupted localStorage must never white-screen the app | ⬜ |
| P4.6 | Board rendering perf: replace per-cell framer-motion elements (up to 324 on 18x18) with CSS transitions or single canvas; memoize cells; verify smoothness on throttled mid-range mobile profile | ⬜ |
| P4.7 | Remove dev-only "download icon" action from production settings; make `ais-dev-` URL rewrite in `urlHelper.ts` env-driven | ⬜ |
| P4.8 | Audio: shared `AudioContext` (currently one per call), add move/win/lose sounds, persisted mute toggle | ⬜ |

---

## Phase 5 — UX & Accessibility ⬜

| ID | Task | Status |
| -- | ---- | ------ |
| P5.1 | Remove `maximum-scale=1, user-scalable=no` from viewport meta | ⬜ |
| P5.2 | Keyboard: 1–8 color, H hint, U undo, R restart, Esc closes modals; visible focus styles | ⬜ |
| P5.3 | Screen readers: aria-live for moves/turn/results; modals role="dialog", aria-modal, focus trap + restore | ⬜ |
| P5.4 | Color-blind support: optional shape/pattern overlay + color-blind-safe theme; WCAG AA contrast for text/badges | ⬜ |
| P5.5 | Respect `prefers-reduced-motion` (animations, confetti) | ⬜ |
| P5.6 | Solo undo: store diffs instead of full grids in history | ⬜ |
| P5.7 | First-run interactive tutorial; clearer turn indicator; haptics on mobile; layout checks 320–1440 px portrait+landscape | ⬜ |
| P5.8 | Lighthouse a11y ≥ 95 verified | ⬜ |

---

## Phase 6 — Features (in order) ⬜

| ID | Task | Status |
| -- | ---- | ------ |
| P6.1 | Daily challenge: date-seeded board, streak counter, shareable emoji-grid result | ⬜ |
| P6.2 | Stats screen: games, win rate, avg moves per config, streaks, per-config star records | ⬜ |
| P6.3 | Share-by-seed links + replay viewer for finished games | ⬜ |
| P6.4 | PWA: manifest, service worker, offline solo/local/bot, install prompt | ⬜ |
| P6.5 | i18n scaffold, no hard-coded UI strings, English + one more locale | ⬜ |
| P6.6 | Online: spectator mode, quick rematch, remembered player name | ⬜ |

---

## Definition of Done (overall)

- CI green on every phase merge.
- Engine and protocol tests pass; old-vs-new engine parity suite passes.
- `npm run sim` shows ~90%+ competent-player win rate at every solo config, easy configs not trivial.
- Two real browsers finish a match with no desync, including a refresh mid-game (resume by token).
- App fully playable with keyboard only.
- Lighthouse accessibility score ≥ 95.

## Working rules (recurring)

- Phase by phase; after each phase run `tsc --noEmit`, tests, `vite build`; commit; give a short
  summary (what changed, tests added, benchmark numbers, anything deferred) before starting the
  next phase.
- Preserve existing features and visual identity unless a phase says otherwise; ask before
  removing any feature; never skip a failing check.
- On any interruption: follow the resume protocol at the top of this file.
