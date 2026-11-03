# tests/unit: Vitest

Fast checks of pure rules. Useful, but **never the proof that the game works** (that's tests/e2e).

## Layout
Mirror `src/`: `tests/unit/logic/clock.test.js` tests `src/logic/clock.js`, and so on. Only `logic`, `net`
(with `fakeTransport`) and `bots` are unit-tested. Phaser scenes are tested in e2e.

## Repo-specific rules
1. Inject what isn't pure: `now`, a seeded `rng` from `logic/rng.js`, `net/fakeTransport.js`, and in-memory storage.
2. No snapshot tests for logic; they pass after any change and prove nothing.
3. Net tests must cover the messy orders: join/leave interleavings, the host leaving at every phase, duplicate
   and out-of-order messages, and invalid payloads.
4. ESLint (`vitest/no-focused-tests`, `no-disabled-tests`) blocks skip/only/todo.
5. Bug regression tests are named `bug-NNN.<what>.test.js`.

## Running
`npm test` (all), `npx vitest run tests/unit/logic` (one folder). Smoke runs them all.
