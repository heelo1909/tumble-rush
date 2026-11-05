# smoke_checks: one permanent check per stage

Each stage adds at least one check here. They **stay forever**, so every later stage re-proves every
earlier feature. Smoke runs them all after the build and before e2e.

## Shape
- File name: `<stageid>_<what>.mjs` in lowercase (`g1_runner_moves.mjs`, `n1_room_join.mjs`, `b_003_double_jump.mjs`).
- A Node script: exit 0/non-zero, one output line, < 60 s.
- May import from `src/logic` and `src/bots`, read `dist/`, read files, or run a **targeted** Playwright test
  (`npx playwright test tests/e2e/runner.spec.js -g "runs right" --project=chromium`) when the feature is
  only provable in a browser.
- Shared helpers go in `smoke_checks/_util.mjs`.

## Good checks (examples)
- `h0_assets_logged.mjs`: every file in `public/assets/` is listed in `ASSETS.md`.
- `h0_no_secrets.mjs`: no `service_role`, `sb_secret_` (except supabase-js's own `startsWith("sb_secret_")` check inside `dist/`), or `.env` content in `src/`, `dist/` or git-tracked files.
- `h0_base_path.mjs`: `dist/index.html` asset URLs start with the repo `base`, not `/`.
- `g2_obstacle_poses.mjs`: every course's obstacles have valid params and continuous poses for 0–120 s.
- `g3_courses_valid.mjs`: every `courses/*.json` passes `validateCourse` and has a `minTime`.
- `n1_message_versions.mjs`: every message type in `messages.js` has a validator and a version.
- `p1_save_roundtrip.mjs`: save → load → same data; corrupt save → fresh default.
- `h1_no_free_text.mjs`: the only `<input type="text">` in the built UI is the room code.

## Rules
1. A check must **fail when its feature breaks**. Prove it once by breaking the feature locally, seeing red,
   and putting it back. Note "proved red" in the stage log.
2. Checks never loosen. Changing an old check needs a logged Decision saying why the requirement changed.
3. No network calls except through a targeted Playwright run (which uses the test namespace).
