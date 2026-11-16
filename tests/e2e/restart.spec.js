import { readFileSync } from 'node:fs';
import { test, expect, gamePage, shot } from './fixtures.js';
import { TILE } from '../../src/logic/tuning.js';

// G3f: R starts a solo race over (HANDOFF 5.1): the way out of an 80 s course. Played on the short test course
// (`?test=1&scene=race`, so a race takes seconds) with real key presses (tests/e2e/CLAUDE.md rule 1), no __TR.teleport,
// clock or hit. The scene stops and starts again, so "over" means a brand-new race: a new countdown, no falls, no flag,
// the runner at the start, nothing of the old event log, and the keys captured again (PROGRESS Decision 65). It does
// nothing after the finish (the results have Play again), with Ctrl, Cmd or Alt held (the browser's reload), on the title
// or on a free-run test course, and holding the key restarts once, not on every repeat of the keyboard.

const course = JSON.parse(readFileSync(new URL('../../src/game/courses/test-race.json', import.meta.url), 'utf8'));
const PIT1 = course.ground[0].col + course.ground[0].w; // first tile of the first pit (3 tiles wide)
const JUMP_AT = 0.6; // a running jump takes off this many tiles before the edge
const CP = course.checkpoints.map((c) => c.col + 0.5);
const PIT2 = course.ground[1].col + course.ground[1].w;
const SPAWN = course.spawn.col + 0.5; // tiles
const SPAWN_X = SPAWN * TILE;
const LIMIT = 60_000;

const state = (page) => page.evaluate(() => window.__TR.state());
const log = (page) => page.evaluate(() => window.__TR.events());
const ofType = (events, type) => events.filter((e) => e.type === type);
const waitFor = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout });
const settle = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function open(page, scene = 'race') {
  await gamePage(page, { scene });
  await waitFor(page, () => {
    const s = window.__TR.state();
    return s.scene === 'race' && s.runners.length === 1;
  });
}
const untilGo = (page) => waitFor(page, () => window.__TR.state().race.phase === 'racing', null, 10000);

/** Hold right until the runner's centre is at x tiles. */
async function runTo(page, tiles) {
  await page.keyboard.down('ArrowRight');
  await waitFor(page, ([x, tile]) => window.__TR.state().runners[0].x >= x * tile, [tiles, TILE], 15000);
}
/** Jump the pit that starts at `edge` (tiles) while running right, and land on the far side. */
async function jumpPit(page, edge) {
  await runTo(page, edge - JUMP_AT);
  await page.keyboard.press('Space');
  await waitFor(page, ([x, size, tile]) => {
    const r = window.__TR.state().runners[0];
    return r.grounded && r.x >= (x + size + 1) * tile;
  }, [edge, 3, TILE], 8000);
}
/** Run the whole short course with real keys: jump both pits, then run on until the line is crossed. */
async function finishRace(page) {
  await untilGo(page);
  await jumpPit(page, PIT1);
  await jumpPit(page, PIT2);
  await page.keyboard.down('ArrowRight');
  await waitFor(page, () => window.__TR.state().race.phase === 'finished', null, 20000);
}

/** A brand-new race is on the screen: the timer reads 0:00.0 and the word is 3, 2 or 1. Callers `settle` before a shot. */
async function countdownShown(page) {
  await expect(page.getByTestId('timer')).toHaveText('0:00.0');
  await expect(page.getByTestId('countdown')).toHaveText(/^[123]$/);
}
/** The race has been started over: a new countdown, a clean slate, within the first second of it. */
const startedOver = (page) => waitFor(page, () => {
  const s = window.__TR.state();
  return s.scene === 'race' && s.race && s.race.phase === 'countdown' && s.raceTime < -2 && s.race.falls === 0 && s.race.checkpoint === -1;
});

/** In the page, from now on: how many times did the clock go BACK (a restart does; a held, repeating key must not do it again). */
async function watchClockDrops(page) {
  await page.evaluate(() => {
    window.__drops = 0;
    window.__dropLog = []; // [the clock before, the clock after, ms since the page loaded]: what a failure message shows
    let last = null;
    const tick = () => {
      const t = window.__TR.state().raceTime;
      if (typeof t === 'number') {
        if (last !== null && t < last - 0.5) {
          window.__drops += 1;
          window.__dropLog.push([Math.round(last * 100) / 100, Math.round(t * 100) / 100, Math.round(performance.now())]);
        }
        last = t;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const drops = (page) => page.evaluate(() => ({ n: window.__drops, log: window.__dropLog }));
/** Once the game has booted: every key pressed and whether the page's default action was cancelled (added AFTER Phaser's own listener, PROGRESS Decision 66). */
const watchKeys = (page) => page.evaluate(() => {
  window.__keys = [];
  window.addEventListener('keydown', (e) => window.__keys.push([e.code, e.defaultPrevented]));
});

test('R in the middle of a race starts it over: a new countdown, no falls, no flag, the runner at the start, and the keys work again', async ({ page }, testInfo) => {
  test.setTimeout(LIMIT);
  await open(page);
  await watchKeys(page);
  await untilGo(page);
  // something to lose: a fall (straight off the first pit), put back, then across the pit and past the first flag
  await runTo(page, PIT1 + 1);
  await waitFor(page, () => window.__TR.state().race.falls === 1);
  await page.keyboard.up('ArrowRight');
  await waitFor(page, () => window.__TR.events().some((e) => e.type === 'respawn') && window.__TR.state().runners[0].grounded, null, 8000);
  await jumpPit(page, PIT1);
  await runTo(page, CP[0] + 0.3);
  await waitFor(page, () => window.__TR.state().race.checkpoint === 0);
  await page.keyboard.up('ArrowRight');
  const before = await state(page);
  expect(before.race.falls).toBe(1);
  expect(before.race.checkpoint).toBe(0);
  expect(before.runners[0].x, 'well past the start').toBeGreaterThan(SPAWN_X + 10 * TILE);
  await shot(page, 'before-r', testInfo);

  await page.keyboard.press('KeyR');
  await startedOver(page);
  const fresh = await state(page);
  expect(fresh.race.finishTime).toBeNull();
  expect(Math.abs(fresh.runners[0].x - SPAWN_X), 'back at the spawn').toBeLessThan(TILE / 2);
  expect(fresh.runners[0].finished).toBe(false);
  const events = await log(page);
  expect(ofType(events, 'fall'), 'the old race\'s falls are gone from the log').toHaveLength(0);
  expect(ofType(events, 'checkpoint'), 'and its flag').toHaveLength(0);
  await countdownShown(page);
  await expect(page.getByTestId('toast'), 'no "Checkpoint!" left over').toHaveText('');
  await settle(page);
  await shot(page, 'restarted', testInfo);

  // R was not taken from the browser, and the new race has the arrows and Space again (the capture is made anew)
  const pressed = await page.evaluate(() => window.__keys.filter((k) => k[0] === 'KeyR'));
  expect(pressed, 'R is not captured: the browser keeps it').toEqual([['KeyR', false]]);
  await page.evaluate(() => { window.__keys.length = 0; });
  await page.keyboard.press('ArrowUp');
  expect(await page.evaluate(() => window.__keys.slice()), 'the new race has the arrow keys again').toEqual([['ArrowUp', true]]);

  // and again: a kid mashing R gets a fresh countdown each time (the listener is made anew with each scene)
  await waitFor(page, () => window.__TR.state().raceTime > -2.0, null, 5000);
  await page.keyboard.press('KeyR');
  await waitFor(page, () => {
    const s = window.__TR.state();
    return s.race && s.race.phase === 'countdown' && s.raceTime < -2.6;
  });

  // and the new race is a real one: GO once, and the runner runs
  await untilGo(page);
  await runTo(page, SPAWN + 4);
  await page.keyboard.up('ArrowRight');
  expect(ofType(await log(page), 'go'), 'one GO, not one per restart').toHaveLength(1);
  expect((await state(page)).race.falls).toBe(0);
});

test('R during the countdown starts the countdown over, and GO comes once, after a whole new countdown', async ({ page }, testInfo) => {
  await open(page);
  await waitFor(page, () => window.__TR.state().raceTime > -1.8, null, 5000); // about 1.2 s into the countdown
  const mid = await state(page);
  expect(mid.race.phase).toBe('countdown');
  await page.keyboard.press('KeyR');
  await startedOver(page);
  const fresh = await state(page);
  expect(fresh.raceTime, 'the countdown began again at 3').toBeLessThan(-2.4);
  expect(fresh.raceTime).toBeLessThan(mid.raceTime - 0.5);
  await countdownShown(page);
  await settle(page);
  await shot(page, 'restarted-in-countdown', testInfo);
  await untilGo(page);
  const goes = ofType(await log(page), 'go');
  expect(goes).toHaveLength(1);
  expect(goes[0].t, 'GO at race time 0').toBeCloseTo(0, 1);
});

test('Ctrl+R, Cmd+R and Alt+R do nothing to the race, and holding R starts it over once, not on every repeat of the keyboard', async ({ page }) => {
  test.setTimeout(LIMIT);
  await open(page);
  await watchClockDrops(page);
  await untilGo(page);
  await runTo(page, SPAWN + 5);
  await page.keyboard.up('ArrowRight');
  const before = await state(page);
  for (const combo of ['Control+KeyR', 'Meta+KeyR', 'Alt+KeyR']) await page.keyboard.press(combo);
  await waitFor(page, (t) => window.__TR.state().raceTime >= t, before.raceTime + 0.4);
  const after = await state(page);
  expect(after.race.phase, 'still racing').toBe('racing');
  expect(after.race.t, 'the clock was not reset').toBeGreaterThan(before.race.t);
  expect(after.runners[0].x, 'the runner is where it was').toBeGreaterThan(SPAWN_X + 4 * TILE);
  expect(await page.evaluate(() => window.__drops), 'no restart by Ctrl, Cmd or Alt').toBe(0);

  // hold R: the first press starts it over; the keyboard then repeats keydown (Playwright marks a second down of a key already held as a repeat)
  await page.keyboard.down('KeyR');
  await startedOver(page);
  // count from here: the clock has run on from the restart (so the watcher has long since seen that one go back), and R is still held
  await waitFor(page, () => window.__TR.state().raceTime > -2.0, null, 5000);
  await page.evaluate(() => { window.__drops = 0; window.__dropLog.length = 0; });
  await page.keyboard.down('KeyR');
  await page.keyboard.down('KeyR');
  await waitFor(page, () => window.__TR.state().raceTime > -1.2, null, 5000); // 0.8 s of game time more, key still held
  await page.keyboard.up('KeyR');
  const held = await drops(page);
  expect(held.n, `a held R restarted once, not again on each repeat (the clock went back: ${JSON.stringify(held.log)})`).toBe(0);
  expect((await state(page)).race.phase).toBe('countdown');
});

test('R after the finish does nothing: right after the line (normally inside the beat before the results) and once they are up, and not on the title after it', async ({ page }, testInfo) => {
  test.setTimeout(LIMIT);
  await open(page);
  await watchClockDrops(page);
  await finishRace(page);
  await page.keyboard.up('ArrowRight');
  const done = await state(page);
  expect(done.race.phase).toBe('finished');
  await page.keyboard.press('KeyR'); // the beat between the line and the results
  await expect(page.getByTestId('results')).toBeVisible({ timeout: 8000 });
  await page.keyboard.press('KeyR');
  await page.keyboard.press('KeyR');
  await waitFor(page, (t) => window.__TR.state().raceTime >= t, done.raceTime + 0.8);
  const after = await state(page);
  expect(after.race.phase, 'still finished').toBe('finished');
  expect(after.race.finishTime, 'the same finish time').toBe(done.race.finishTime);
  await expect(page.getByTestId('results'), 'the results are still up').toBeVisible();
  await expect(page.getByTestId('results-time')).not.toHaveText('');
  expect(await page.evaluate(() => window.__drops), 'R did not start a new race').toBe(0);
  await shot(page, 'r-at-the-results', testInfo);

  // back at the title: the race scene is gone with its listener, so R there starts nothing
  await page.getByTestId('to-title').click();
  await waitFor(page, () => window.__TR.state().scene === 'hello');
  await page.keyboard.press('KeyR');
  await settle(page);
  expect((await state(page)).scene, 'R on the title after a race starts nothing').toBe('hello');
});

test('R on the title and on a free-run test course does nothing', async ({ page }) => {
  await gamePage(page); // the title
  await page.keyboard.press('KeyR');
  await settle(page);
  expect((await state(page)).scene, 'still the title').toBe('hello');
  await expect(page.getByTestId('play-solo')).toBeVisible();

  await open(page, 'gallery'); // a free-run course: no race flow, no restart
  await watchClockDrops(page);
  await waitFor(page, () => window.__TR.state().raceTime > 1.0, null, 5000);
  const t0 = (await state(page)).raceTime;
  await page.keyboard.press('KeyR');
  await waitFor(page, (t) => window.__TR.state().raceTime >= t, t0 + 0.6);
  expect(await page.evaluate(() => window.__drops), 'the free-run course kept its clock').toBe(0);
  expect((await state(page)).race, 'no race flow there').toBeNull();
});
