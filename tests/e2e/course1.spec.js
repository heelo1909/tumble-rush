import { readFileSync } from 'node:fs';
import { test, expect, gamePage, shot } from './fixtures.js';
import { TILE } from '../../src/logic/tuning.js';
import { formatRaceTime, fallsLabel } from '../../src/logic/clock.js';
import { pitsToJump } from '../../src/logic/course.js';
import { playRace } from './player.js';

// G3c: the opening of course 1 (src/game/courses/course1.json), reached with ?test=1&scene=course1, played from the
// countdown to the results by the test player (tests/e2e/player.js): real key presses, reading the game through
// __TR.state() and the course JSON, no __TR.teleport, clock, hit or autopilot (tests/e2e/CLAUDE.md rule 1). The title's
// Play still runs the short test course until G3d, so this spec does not click Play: the way in is race.solo.spec.js's.
// Times are the game's own physics clock (race.finishTime), not wall time, so a slow frame cannot make them flaky.

const course = JSON.parse(readFileSync(new URL('../../src/game/courses/course1.json', import.meta.url), 'utf8'));
const bar = course.obstacles.find((o) => o.type === 'spinning-bar');
const tiles = course.obstacles.find((o) => o.type === 'falling-tiles');
const firstPit = pitsToJump(course)[0];
const RACE_TIME_LIMIT = 60; // the race clock, seconds: the player gives up past it, and a finish after it fails the test

const state = (page) => page.evaluate(() => window.__TR.state());
const log = (page) => page.evaluate(() => window.__TR.events());
const ofType = (events, type) => events.filter((e) => e.type === type);
const waitFor = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout });
const note = (testInfo, type, value) => testInfo.annotations.push({ type, description: String(value) });
const settle = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

test('the test player runs the opening of course 1 from the countdown to the results with real keys: it jumps the pits, crosses the falling tiles, passes every flag in order and finishes', async ({ page }, testInfo) => {
  // the race takes about 16 s of race time and the test about 25 s all told; the player's own wall-clock limit (45 s) is
  // inside this one, so a stuck runner fails with the player's message that says where, not with a bare test timeout
  test.setTimeout(60000);
  await gamePage(page, { scene: 'course1' });
  await waitFor(page, () => {
    const s = window.__TR.state();
    return s.scene === 'race' && s.race && s.runners.length === 1;
  });
  const start = await state(page);
  expect(start.race.phase, 'the race opens in its countdown').toBe('countdown');
  expect(start.race.checkpoints, 'every flag of the course is in the race').toBe(course.checkpoints.length);
  expect(start.obstacles.map((o) => o.type).sort(), 'the bar and the tiles are really in the scene').toEqual(['falling-tiles', 'spinning-bar']);
  // the first frame of a new scene is drawn before the shot is taken (WebKit shows the old canvas for a frame: PROGRESS Decision 67)
  await waitFor(page, () => document.querySelector('[data-testid="countdown"]')?.textContent !== '');
  await settle(page);
  await shot(page, 'countdown', testInfo);

  const taken = new Set();
  const maybeShot = async (name, s, when) => {
    if (taken.has(name) || !when(s.runners[0].x / TILE)) return;
    taken.add(name);
    await shot(page, name, testInfo);
  };
  const { taps } = await playRace(page, course, {
    maxRaceTime: RACE_TIME_LIMIT,
    onTick: async (s) => {
      if (s.race.phase !== 'racing') return;
      // A screenshot takes a moment and the player does not poll while it does, so each is taken where it cannot cost a
      // jump: in the air over the first pit (the jump is already made), the bar's approach and the tile row (no pit near)
      await maybeShot('over-the-first-pit', s, (x) => !s.runners[0].grounded && x > firstPit.from + 0.3 && x < firstPit.to - 0.3);
      await maybeShot('approaching-the-bar', s, (x) => x >= bar.col - 4 && x < bar.col - 1);
      await maybeShot('on-the-tiles', s, (x) => x >= tiles.col - tiles.count / 2 + 2 && x < tiles.col + tiles.count / 2 - 1);
    },
  });
  // the picture at the line, taken before anything else is read: the results card comes up resultsDelay (1.5 s) later
  await shot(page, 'finish', testInfo);

  const done = await state(page);
  const events = await log(page);
  expect(done.race.phase).toBe('finished');
  expect(done.runners[0].finished).toBe(true);
  const finishTime = done.race.finishTime;
  note(testInfo, 'finish-time-seconds', finishTime.toFixed(2));
  note(testInfo, 'falls', done.race.falls);
  note(testInfo, 'hits-by-the-bar', ofType(events, 'hit').length);
  note(testInfo, 'jumps-and-dives-tapped', `${taps.jump} and ${taps.dive}`);
  expect(finishTime, 'nobody can beat course.minTime').toBeGreaterThanOrEqual(course.minTime);
  expect(finishTime, `a runner who keeps going finishes a course this short inside ${RACE_TIME_LIMIT} s of race time`).toBeLessThan(RACE_TIME_LIMIT);
  // The test player is tolerant on purpose (it gives up only after 8 falls) and does not dodge, so the e2e allows a few
  // misses (the bar throws it back toward the start, never into a pit: the ground around it is solid). How harsh the bar is
  // is held by the smoke check (Decision 75), not by this count; the hits it costs are annotated above.
  expect(done.race.falls, 'a player that jumps every pit falls at most a couple of times').toBeLessThanOrEqual(3);

  expect(ofType(events, 'go'), 'one GO').toHaveLength(1);
  const finish = ofType(events, 'finish');
  expect(finish, 'one finish').toHaveLength(1);
  expect(finish[0].data.time).toBeCloseTo(finishTime, 2);
  expect(finish[0].data.x, 'the line is the left edge of the finish tile').toBeGreaterThanOrEqual(course.finish.col);
  // every flag, left to right, and none twice: a fall and a try again do not count one again
  expect(ofType(events, 'checkpoint').map((e) => e.data.index)).toEqual(course.checkpoints.map((_, i) => i));
  // the real jumps: one for each pit at least (a miss and a second try adds one)
  expect(pitsToJump(course).length, 'the opening has pits to jump').toBeGreaterThanOrEqual(2);
  expect(ofType(events, 'jump').length).toBeGreaterThanOrEqual(pitsToJump(course).length);
  // the tiles were crossed for real: they went from solid to armed to fallen under the runner
  const tilePhases = new Set(ofType(events, 'tile').map((e) => e.data.phase));
  expect(tilePhases.has('armed'), 'a falling tile was touched').toBe(true);
  expect(tilePhases.has('fallen'), 'a falling tile dropped').toBe(true);
  expect(ofType(events, 'fall'), 'the falls on the HUD are the falls in the log').toHaveLength(done.race.falls);

  await expect(page.getByTestId('toast')).toHaveText('Finished!');
  // the results come up a beat after the line, with the time the HUD showed
  await expect(page.getByTestId('results')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('results-time')).toHaveText(formatRaceTime(finishTime));
  await expect(page.getByTestId('results-falls')).toHaveText(fallsLabel(done.race.falls));
  await settle(page);
  await shot(page, 'results', testInfo);
});
