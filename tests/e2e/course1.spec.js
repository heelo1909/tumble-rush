import { readFileSync } from 'node:fs';
import { test, expect, gamePage, shot } from './fixtures.js';
import { TILE } from '../../src/logic/tuning.js';
import { formatRaceTime, fallsLabel } from '../../src/logic/clock.js';
import { groundGaps, pitsToJump } from '../../src/logic/course.js';
import { playRace } from './player.js';

// G3c to G3e: course 1 (src/game/courses/course1.json: the opening of G3c, its harsh bar and tiles, then the mix of
// G3d), played from the title's Play button (G3e: the real way in, no `scene` in the URL) through the countdown to the
// results by the test player (tests/e2e/player.js): real key presses, reading the game through
// __TR.state() and the course JSON, no __TR.teleport, clock, hit or autopilot (tests/e2e/CLAUDE.md rule 1). It is the only
// test that plays the whole of course 1 (74 s in chromium and 87 s in webkit when measured, with the bar's luck): the
// whole-race title test in race.solo.spec.js plays the short course through `?course=test-race` (PROGRESS Decision 80), so
// the e2e keeps its margin under the smoke script's 900 s limit.
// Times are the game's own physics clock (race.finishTime), not wall time, so a slow frame cannot make them flaky.

const course = JSON.parse(readFileSync(new URL('../../src/game/courses/course1.json', import.meta.url), 'utf8'));
const bar = course.obstacles.find((o) => o.type === 'spinning-bar');
const tiles = course.obstacles.find((o) => o.type === 'falling-tiles');
const firstPit = pitsToJump(course)[0];
const gaps = groundGaps(course);
// the race clock, seconds: the player gives up past it, and a finish after it fails the test. The whole course takes the
// player about 82 s (the harsh bar costs it about 20 s of that: Decision 75); this leaves room for three falls and a slow bar
const RACE_TIME_LIMIT = 150;
const tileRows = course.obstacles.filter((o) => o.type === 'falling-tiles');
const SHOTS = ['over-the-first-pit', 'past-the-bar', 'on-the-tiles', 'halfway'];

const state = (page) => page.evaluate(() => window.__TR.state());
const log = (page) => page.evaluate(() => window.__TR.events());
const ofType = (events, type) => events.filter((e) => e.type === type);
const waitFor = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout });
const note = (testInfo, type, value) => testInfo.annotations.push({ type, description: String(value) });
const settle = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
/** A new race is on screen, as in race.solo.spec.js: the timer reads 0:00.0 and the word is 3, 2 or 1. Callers `settle` after it: two frames drawn (WebKit shows the old canvas for a frame or two: PROGRESS Decision 67). */
async function countdownShown(page) {
  await expect(page.getByTestId('timer')).toHaveText('0:00.0');
  await expect(page.getByTestId('countdown')).toHaveText(/^[123]$/);
}

test('from the title, Play starts course 1 and the test player runs all of it with real keys: it jumps the pits, crosses the falling tiles, passes every flag in order, finishes, and Play again is course 1 again', async ({ page }, testInfo) => {
  // the race takes about 85 s of race time and the test about 100 s all told; the player's own wall-clock limit (170 s)
  // is inside this one, so a stuck runner fails with the player's message that says where, not with a bare test timeout
  test.setTimeout(200000);
  await gamePage(page); // no scene in the URL: the real way in, the title
  expect((await state(page)).scene, 'the page opens on the title').toBe('hello');
  const play = page.getByTestId('play-solo');
  await expect(play).toBeVisible();
  await expect(play).toHaveText('Play');
  await settle(page);
  await shot(page, 'title', testInfo);
  await play.click();
  await expect(page.getByTestId('title')).toBeHidden();
  await waitFor(page, () => {
    const s = window.__TR.state();
    return s.scene === 'race' && s.race && s.runners.length === 1;
  });
  const start = await state(page);
  expect(start.race.phase, 'the race opens in its countdown').toBe('countdown');
  expect(start.race.checkpoints, 'every flag of the course is in the race').toBe(course.checkpoints.length);
  expect(start.obstacles.map((o) => o.type).sort(), 'every bar and every row of tiles of the course is really in the scene').toEqual(course.obstacles.map((o) => o.type).sort());
  // the first frame of a new scene is drawn before the shot is taken (WebKit shows the old canvas for a frame: PROGRESS Decision 67)
  await countdownShown(page);
  await settle(page);
  await shot(page, 'countdown', testInfo);

  const taken = new Set();
  const maybeShot = async (name, s, when) => {
    if (taken.has(name) || !when(s.runners[0].x / TILE)) return;
    taken.add(name);
    await shot(page, name, testInfo);
  };
  const { taps, longestStall } = await playRace(page, course, {
    maxRaceTime: RACE_TIME_LIMIT,
    onTick: async (s) => {
      if (s.race.phase !== 'racing') return;
      // A screenshot takes a moment and the player does not poll while it does, so each is taken where it cannot cost a
      // jump or a dive: in the air over the first pit (the jump is already made), PAST the bar (a shot inside the bar's dive zone
      // pauses the player while the bar swings, and the pass there is by phase luck), and on the first tile row (no pit near)
      await maybeShot('over-the-first-pit', s, (x) => !s.runners[0].grounded && x > firstPit.from + 0.3 && x < firstPit.to - 0.3);
      await maybeShot('past-the-bar', s, (x) => x >= bar.col + 5 && x < bar.col + 8);
      await maybeShot('on-the-tiles', s, (x) => x >= tiles.col - tiles.count / 2 + 2 && x < tiles.col + tiles.count / 2 - 1);
      // the middle of the course, on the ground and at least 3 tiles from any pit or tile row (no jump to cost)
      await maybeShot('halfway', s, (x) => s.runners[0].grounded && x >= course.cols / 2 && !gaps.some((g) => x > g.from - 3 && x < g.to + 3));
    },
  });
  // the picture at the line, taken before anything else is read: the results card comes up resultsDelay (1.5 s) later
  await shot(page, 'finish', testInfo);
  // every shot that was meant to be taken was taken: a condition that never holds would just leave a picture missing
  expect([...taken].sort(), 'each in-race shot fired').toEqual([...SHOTS].sort());

  const done = await state(page);
  const events = await log(page);
  expect(done.race.phase).toBe('finished');
  expect(done.runners[0].finished).toBe(true);
  const finishTime = done.race.finishTime;
  note(testInfo, 'finish-time-seconds', finishTime.toFixed(2));
  note(testInfo, 'falls', done.race.falls);
  note(testInfo, 'hits-by-the-bar', ofType(events, 'hit').length);
  note(testInfo, 'jumps-and-dives-tapped', `${taps.jump} and ${taps.dive}`);
  // the margins the e2e rests on, printed so STATUS.md shows how close they are: the longest stretch of race time the
  // player went without headway (it gives up at 20 s: the harsh bar's pass is by phase luck, Decision 75, and a legitimate run uses 10.0 s of it), and how full
  // the scene's event log is (a ring of 500: the oldest events drop, and the 'go' and the first flag with them)
  note(testInfo, 'longest-stall-seconds', longestStall.toFixed(1));
  note(testInfo, 'events-logged', events.length);
  expect(events.length, 'the event log (a ring of 500) still holds the GO and the first flag').toBeLessThan(480);
  expect(finishTime, 'nobody can beat course.minTime').toBeGreaterThanOrEqual(course.minTime);
  expect(finishTime, `a runner who keeps going finishes inside ${RACE_TIME_LIMIT} s of race time`).toBeLessThan(RACE_TIME_LIMIT);
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
  expect(pitsToJump(course).length, 'the course has pits to jump').toBeGreaterThanOrEqual(8);
  expect(ofType(events, 'jump').length).toBeGreaterThanOrEqual(pitsToJump(course).length);
  // the tiles were crossed for real: they went from solid to armed to fallen under the runner
  const tilePhases = new Set(ofType(events, 'tile').map((e) => e.data.phase));
  expect(tilePhases.has('armed'), 'a falling tile was touched').toBe(true);
  expect(tilePhases.has('fallen'), 'a falling tile dropped').toBe(true);
  // ...in every row of the course, not just the first: each row has a tile that dropped inside its own span
  const fallen = ofType(events, 'tile').filter((e) => e.data.phase === 'fallen');
  for (const r of tileRows) {
    const [from, to] = [r.col - r.count / 2, r.col + r.count / 2];
    expect(fallen.some((e) => e.data.x >= from && e.data.x <= to), `a tile of the row at ${from} to ${to} dropped under the runner`).toBe(true);
  }
  expect(ofType(events, 'fall'), 'the falls on the HUD are the falls in the log').toHaveLength(done.race.falls);

  await expect(page.getByTestId('toast')).toHaveText('Finished!');
  // the results come up a beat after the line, with the time the HUD showed
  await expect(page.getByTestId('results')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('results-time')).toHaveText(formatRaceTime(finishTime));
  await expect(page.getByTestId('results-falls')).toHaveText(fallsLabel(done.race.falls));
  await settle(page);
  await shot(page, 'results', testInfo);

  // Play again runs course 1 again (the title's Play set the course, and the results' button starts the same race): a new
  // countdown, none of the old race left, and the whole course in the scene (only the countdown: the course is played once)
  await page.getByTestId('rematch').click();
  await expect(page.getByTestId('results')).toBeHidden();
  await waitFor(page, () => {
    const s = window.__TR.state();
    return s.scene === 'race' && s.race && s.race.phase === 'countdown';
  });
  const again = await state(page);
  expect(again.race.checkpoints, 'play again is course 1 again, with every flag').toBe(course.checkpoints.length);
  expect(again.race.falls).toBe(0);
  expect(again.race.finishTime).toBeNull();
  expect(again.obstacles.map((o) => o.type).sort(), 'and every bar and row of tiles').toEqual(course.obstacles.map((o) => o.type).sort());
  await countdownShown(page);
  await settle(page);
  await shot(page, 'again-countdown', testInfo);
});
