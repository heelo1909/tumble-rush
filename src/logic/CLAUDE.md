# src/logic: pure game rules

The "brain" of the game that doesn't need a screen or a network. Because it's pure, it's the one place
where fast unit tests are real proof, so keep as much decision-making here as possible.

## What lives here
| File (suggested) | Owns |
|---|---|
| `clock.js` | what the race clock says as text: `countdownLabel(t)` (3, 2, 1, GO!), `formatRaceTime(t)` and `raceTenth(t)` (the tenth a time falls in: when the HUD must be redrawn; the word and the text change only on its boundaries, with one shared float allowance) (G3a). Clock-offset math (median of N ping/pong samples) arrives with N2 |
| `obstacles.js` | `pose(type, params, t)` → `{x, y, angle}` for every race-clock obstacle (HANDOFF §5.2) |
| `contact.js` | the contact obstacles of HANDOFF §5.2 (bounce pad, seesaw, conveyor, falling tiles): their validation, `bounceLaunch`, `beltSurface`, the falling tile's state machine (`touchTile`, `stepTile`) and the seesaw's stop and levelling spring (`seesawAssist`). No `pose(t)`: what they do depends on who touches them |
| `course.js` | `validateCourse(json)`: tile grid, obstacles, checkpoints, finish, `minTime`; returns a list of errors |
| `race.js` | race state machine. G3a: ONE runner's `newRace`, `stepRace` (countdown → racing, checkpoints left to right, a fall → `out` for `respawnDelay` → a `respawn` event naming the last checkpoint or the start) and `controlsLive`. Later: finish, ending, results, placement, the 30 s end timer, ordering by distance for unfinished runners |
| `coins.js` | coins per placement (HANDOFF §5.5) |
| `skins.js` | the skins catalog (id, name, price, colors, hat) + `canBuy`, `buy` |
| `save.js` | load/migrate/save `tr.save.v1`; takes a storage object so tests pass a fake |
| `roomCode.js` | 4-letter codes from consonants without confusables; `isValidCode` |
| `names.js` | adjective + animal name list, `pickName(seed)`; the lists are hand-checked to be kid-safe |
| `tuning.js` | every physics/feel number (run speed, jump, dive, tumble time). One place to tune |
| `rng.js` | seeded random (mulberry32 or similar). **Never use `Math.random()` in logic** |

## Rules
1. **Imports nothing** from Phaser, Supabase, the DOM, `window`, `localStorage`, or other `src/` folders.
   ESLint enforces this. Pass anything outside in as arguments (storage, now(), rng).
2. **Deterministic.** Same inputs → same outputs. Time comes in as a number, and randomness comes from `rng.js`.
3. **JSON-safe data only.** It gets broadcast and saved, so no classes, Maps, or functions in returned state.
4. JSDoc types on exports. They're our only type checking (no TypeScript).

## Obstacle pose functions (most important file)
- `pose(type, params, t)` must be **continuous** (no jumps in position between nearby t values) except where
  the obstacle design says so, and **periodic** where it's meant to repeat.
- Tests: values at t = 0, a quarter period, a half period; continuity (pose(t) vs pose(t + 1 ms) close);
  period (pose(t) ≈ pose(t + period)); behavior with t < 0 (countdown) is defined (the obstacle holds still at
  its t = 0 pose).
- `src/game` reads these every frame and sets the static body's position and angle from them. If you
  find yourself writing obstacle motion inside `src/game`, move it here.

## Save data
- Shape: `{ v: 1, coins, owned: [skinIds], equipped, name, seed }`.
- Missing, corrupt, or the wrong `v` → return a fresh default and never throw. Unknown skin ids are dropped.
- Migrations are functions `migrate1to2` etc. and each has a test with a real old-format sample.

## Done checklist for changes here
- [ ] No forbidden imports (`npm run lint` passes)
- [ ] Unit tests for each new or changed export, including an edge case
- [ ] If `tuning.js` changed: note the old → new numbers and why under Decisions in PROGRESS.md
