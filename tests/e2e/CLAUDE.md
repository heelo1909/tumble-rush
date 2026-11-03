# tests/e2e: Playwright, the real-world proof

This folder is why this harness exists. Warden's tests used only fakes, and "passing" didn't mean
the real thing worked. Here every test runs the **real built game** in **real browsers** on the
user's Mac, against a **real Supabase project**, with **real key presses**, and saves **screenshots**.

## Setup (built in H0; `playwright.config.js` is protected)
- Projects: `chromium` and `webkit` (WebKit = Safari's engine, which school Macs have).
- `webServer`: `npm run build && npm run preview` on port 4173. `BASE_URL` env overrides it for live runs
  (`npm run smoke:live` sets it to the GitHub Pages URL).
- Real Supabase: reads `.env`. If the Supabase keys are missing, multiplayer tests **fail** with "set up
  .env (H1)". They never skip.
- `outputDir`: `.smoke/e2e-results`; screenshots go to `.smoke/shots/<STAGE>/` (`STAGE` env set by smoke).
- Retries: 0 locally (a flaky test is a bug, so file `B-NNN`), 1 on live runs (school-ish networks).

## fixtures.js (shared, use it in every spec)
- `gamePage(browserOrContext, opts)` opens `?test=1&ns=test-<runId>&seed=<n>` and waits for
  `__TR.state().scene !== 'boot'`.
- Fails the test on any `pageerror` or `console.error` (allow-list only with a logged Decision).
- `shot(page, name)` saves `.smoke/shots/<STAGE>/<spec>-<name>-<browser>.png`.
- `waitForState(page, predicate, timeout)` polls `__TR.state()`.
- `openPlayers(browser(s), n)` gives n separate contexts (separate players), not tabs in one context,
  so each has its own localStorage like a separate laptop.

## Rules
1. **Drive like a human** in feature tests: `page.keyboard.down('ArrowRight')`, `page.getByTestId('start-race').click()`.
   `__TR.autopilot(true)` is for full-race and multiplayer tests where a "human" would just be playing.
   `__TR.teleport` only in obstacle-gallery tests.
2. **Assert what's on screen *and* in state:** a visible element/text check plus `__TR.state()`.
3. **Screenshot every key moment**, at minimum: the start state, after the action, and the end state. Multiplayer:
   every window at every moment.
4. **Multiplayer tests** use separate contexts, a fresh `ns` per test, and clean up (leave the channel) in `afterEach`.
5. **Measure and print numbers** the stage cares about (finish times, lag, fps) with `test.info().annotations`
   so smoke can copy them into STATUS.md.
6. **Never** `test.skip`, `.only`, `fixme`, or raise a timeout to make red go green. Flaky → `B-NNN`.

## Spec files (grow by stage)
`boot.spec.js` (H0) · `probe.spec.js` (H1) · `runner.spec.js` (G1) · `obstacles.spec.js` (G2) ·
`race.solo.spec.js` (G3) · `bots.finish.spec.js` (B1) · `multiplayer.rooms.spec.js` (N1) ·
`multiplayer.race.spec.js` (N2) · `multiplayer.results.spec.js` (N3) · `shop.spec.js` (P1) ·
`perf.spec.js` (U1) · `screens.spec.js` (U1).

## After a run: look at the pictures
Open the new screenshots (the Read tool shows images) and write one line per stage in PROGRESS.md
about what they show. If a screenshot shows something wrong (overlaps, missing sprites, a black
canvas), the stage isn't done, even if every assertion passed.
