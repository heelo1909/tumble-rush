# scripts: harness runner (protected after H0)

`smoke.mjs`, `progress_view.mjs`, `harness_common.mjs` are built in H0 and then **protected**: the
PreToolUse hook blocks edits. If one needs changing, stop and tell the user what and why.

## smoke.mjs (spec for H0)
`npm run smoke` = `node scripts/smoke.mjs`. Steps, stopping the *report* (not the run) at the first failure:
1. Environment check: Node ≥ 20, `node_modules` present, Playwright browsers installed, `.env` has
   both Supabase keys (missing → FAIL with "do H1 setup", from H1 onward).
2. `eslint .`
3. `vitest run`
4. `vite build`
5. Every `smoke_checks/*.mjs` (except `_util.mjs`), each with a 60 s timeout
6. `playwright test` (chromium + webkit), with `STAGE` = the next stage from PROGRESS.md
Then:
- Print a table and the last line exactly `SMOKE: PASS` or `SMOKE: FAIL`.
- Write `.smoke/last-run.json`: `{result, finished_at, code_fingerprint, steps:[{name,ok,ms,summary}], annotations}`.
  `code_fingerprint` = a hash of tracked files outside `.smoke/`, `PROGRESS.md` and `STATUS.md`.
- Regenerate `STATUS.md` (see the WardenMac 2 version for the format).
- `--quick` runs steps 1–5 only, writes `result: "QUICK"`, and never satisfies the Stop gate.
- `--live` runs only step 6 against `BASE_URL` = the Pages URL from `package.json` `homepage`.
- `--targeted=a.spec.js,b.spec.js` runs steps 1–5 and, for step 6, only `boot.spec.js` plus those specs; result `TARGETED`,
  saved to `.smoke/last-targeted.json` (never over `last-run.json`, which stays the last FULL run). `stopGate` accepts a
  TARGETED run for the current code unless the last full run was 5 or more stages back in the PROGRESS list, or the stage
  is D1 or R1 (`FULL_EVERY`, `ALWAYS_FULL` in harness_common.mjs).

## progress_view.mjs
Parses PROGRESS.md: `currentStatus()`, `stages()` → `[{id,title,done}]`, `nextStage()`, `latestLogEntry()`.
It's used by the hooks and smoke. Keep it tolerant of extra lines, but strict about the headings.

## harness_common.mjs
`ROOT`, `git(...args)`, `codeFingerprint()`, `loadLastRun()`, `isProtected(relPath)`, `repoRelative(abs)`.
The protected list: `.claude/**`, `scripts/smoke.mjs`, `scripts/progress_view.mjs`,
`scripts/harness_common.mjs`, `playwright.config.js`.

## Tests for the harness itself
`tests/unit/harness/*.test.js` covers progress parsing, the fingerprint (ignores PROGRESS/STATUS), and
isProtected. Smoke check `h0_harness.mjs` runs the Stop-gate logic against a temp git repo.
