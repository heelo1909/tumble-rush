import { readFileSync } from 'node:fs';
import { test, expect, gamePage, shot } from './fixtures.js';
import { TUNING, TILE } from '../../src/logic/tuning.js';
import { formatRaceTime } from '../../src/logic/clock.js';

// G3a: the race flow on the small test course `test-race` (?test=1&scene=race): a 3-2-1 countdown that holds the
// runner, the race clock and the HUD timer, checkpoints, and the respawn after a fall. Real key presses throughout
// (tests/e2e/CLAUDE.md rule 1); no __TR.teleport, __TR.clock or __TR.hit here. Times come from the game's own
// physics clock (state().raceTime and the event log), not the wall clock, so a slow frame cannot make them flaky.
// G3b adds the way in and out: the title's Play button, the finish line, the results screen, play again and back to
// the title, on the same short course. G3e: the title's Play now runs course 1, played whole by course1.spec.js (74 to
// 87 s a browser). The first title test below plays a WHOLE race, by the short course's pit coordinates, so it asks for
// that course with `?course=test-race` (a test-mode switch for the title's Play, PROGRESS Decision 80): it cannot play
// course 1 at all, and rewriting it for the test player would add another 160 s to an e2e that is at 606 s of a 900 s limit
// only the user can raise. The play-again test reaches its races through a test scene, and the third only presses Enter.
// Where a test only STARTS a race from the title, it checks that Play runs course 1 (its flags are the proof: the short
// course has 2).

const course = JSON.parse(readFileSync(new URL('../../src/game/courses/test-race.json', import.meta.url), 'utf8'));
const course1 = JSON.parse(readFileSync(new URL('../../src/game/courses/course1.json', import.meta.url), 'utf8'));
const PIT1 = course.ground[0].col + course.ground[0].w; // first tile of the first pit (3 tiles wide)
const PIT2 = course.ground[1].col + course.ground[1].w;
const FINISH = course.finish.col; // the line: the left edge of this tile
const JUMP_AT = 0.6; // a running jump takes off this many tiles before the edge and lands about 4.3 tiles on
const CP = course.checkpoints.map((c) => c.col + 0.5); // where each flag is, in tiles
const SPAWN_X = (course.spawn.col + 0.5) * TILE;

const state = (page) => page.evaluate(() => window.__TR.state());
const log = (page) => page.evaluate(() => window.__TR.events());
const ofType = (events, type) => events.filter((e) => e.type === type);
const waitFor = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout });
const note = (testInfo, type, value) => testInfo.annotations.push({ type, description: String(value) });
const toast = (page) => page.getByTestId('toast');

/** Open the race and keep a record, in the page, of every countdown word the HUD showed and when the runner first left the ground. */
async function open(page) {
  await page.addInitScript(() => {
    window.__seen = [];
    const tick = () => {
      const el = document.querySelector('[data-testid="countdown"]');
      const text = el ? el.textContent : '';
      if (text && window.__seen[window.__seen.length - 1] !== text) window.__seen.push(text);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await gamePage(page, { scene: 'race' });
  await waitFor(page, () => {
    const s = window.__TR.state();
    return s.scene === 'race' && s.race && s.runners.length === 1;
  });
}

/** Wait until the countdown is over. */
async function untilGo(page) {
  await waitFor(page, () => window.__TR.state().race.phase === 'racing', null, 10000);
}

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

test('a 3-2-1 countdown holds the runner, then GO lets everyone run, and the timer starts', async ({ page }, testInfo) => {
  await open(page);
  const start = (await state(page));
  expect(start.race.phase).toBe('countdown');
  expect(start.raceTime).toBeLessThan(0);
  expect(start.race.t).toBeCloseTo(start.raceTime, 1); // the race rules and the scene's clock are one clock
  await expect(page.getByTestId('timer')).toHaveText('0:00.0');
  const size = await page.getByTestId('countdown').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size, 'the countdown word is at least 96 px (src/ui/CLAUDE.md rule 4)').toBeGreaterThanOrEqual(96);
  await shot(page, 'countdown', testInfo);

  // A runner who leans on the keys during the countdown does not move: right is held, jump and dive are tapped.
  const x0 = start.runners[0].x;
  await page.keyboard.down('ArrowRight');
  await page.keyboard.press('Space');
  await page.keyboard.press('Shift');
  await waitFor(page, (t) => window.__TR.state().raceTime >= t, start.raceTime + 0.7); // 0.7 s of GAME time with the keys held
  const held = await state(page);
  expect(held.race.phase, 'still counting down after 0.7 s of holding the keys').toBe('countdown');
  expect(Math.abs(held.runners[0].x - x0), 'the runner has not moved').toBeLessThan(2);
  expect(held.runners[0].mode).toBe('run');
  expect(ofType(await log(page), 'jump'), 'no jump during the countdown').toHaveLength(0);

  // GO: the race clock reads 0, the same key now runs (the latches from the taps above did not wait for GO)
  await waitFor(page, () => window.__TR.state().race.countdown === 'GO!', null, 10000);
  await shot(page, 'go', testInfo);
  await untilGo(page);
  const goEvents = ofType(await log(page), 'go');
  expect(goEvents).toHaveLength(1);
  expect(goEvents[0].t, 'GO comes at race time 0').toBeCloseTo(0, 1);
  await waitFor(page, ([x, tile]) => window.__TR.state().runners[0].x > x + 3 * tile, [x0, TILE]);
  const racing = await state(page);
  expect(racing.runners[0].mode).toBe('run');
  expect(racing.runners[0].vx).toBeGreaterThan(2);
  expect(ofType(await log(page), 'jump'), 'the tap on Space during the countdown did not turn into a jump at GO').toHaveLength(0);
  await shot(page, 'racing', testInfo);

  // the HUD showed 3, 2, 1, GO! in that order, and the timer follows the race clock
  const seen = await page.evaluate(() => window.__seen);
  expect(seen, 'the words on screen').toEqual(['3', '2', '1', 'GO!']);
  const text = await page.getByTestId('timer').textContent();
  const shown = Number(text.split(':')[0]) * 60 + Number(text.split(':')[1]);
  const clock = (await state(page)).raceTime;
  expect(Math.abs(shown - clock), `the timer says ${text}, the race clock ${clock.toFixed(2)}`).toBeLessThan(0.4);
  expect(clock).toBeGreaterThan(0.3);
  note(testInfo, 'seconds-from-first-read-to-go', (goEvents[0].t - start.raceTime).toFixed(2)); // 3 minus the moment of the first read
  await page.keyboard.up('ArrowRight');
});

test('falling into a pit before any checkpoint puts the runner back at the start after 1 s, and the next try can cross', async ({ page }, testInfo) => {
  await open(page);
  await untilGo(page);
  // when does the runner first leave the ground at the edge? (the whole fall is measured from here)
  await page.evaluate((edgePx) => {
    window.__leftAt = null;
    const tick = () => {
      const s = window.__TR.state();
      const r = s.runners[0];
      if (window.__leftAt === null && r && r.x > edgePx && !r.grounded) window.__leftAt = s.raceTime;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, (PIT1 - 0.5) * TILE);

  await runTo(page, PIT1 + 1); // no jump: straight over the edge
  await waitFor(page, () => window.__TR.state().race.falls === 1);
  await page.keyboard.up('ArrowRight');
  const fall = ofType(await log(page), 'fall');
  expect(fall).toHaveLength(1);
  const mid = await state(page);
  expect(mid.race.respawnIn, 'waiting to be put back').toBeGreaterThan(0);
  expect(mid.race.respawnIn).toBeLessThanOrEqual(TUNING.respawnDelay);
  await expect(toast(page)).toHaveText('Oops!');
  await shot(page, 'fell', testInfo);

  await waitFor(page, () => window.__TR.events().some((e) => e.type === 'respawn'), null, 5000);
  const respawn = ofType(await log(page), 'respawn');
  expect(respawn).toHaveLength(1);
  const wait = respawn[0].t - fall[0].t;
  note(testInfo, 'seconds-fall-to-respawn', wait.toFixed(2));
  expect(wait, 'put back 1 s after falling out').toBeGreaterThan(TUNING.respawnDelay - 0.03);
  expect(wait).toBeLessThan(TUNING.respawnDelay + 0.05);
  const leftAt = await page.evaluate(() => window.__leftAt);
  expect(leftAt, 'the runner was seen leaving the ledge').not.toBeNull();
  const total = respawn[0].t - leftAt;
  note(testInfo, 'seconds-leave-ledge-to-respawn', total.toFixed(2));
  expect(total, 'src/game/CLAUDE.md feel target: respawn after a fall takes at most 1.5 s in total').toBeLessThanOrEqual(1.5);

  // back at the START (no checkpoint yet), standing and upright, in control, with the clock still running
  await waitFor(page, () => window.__TR.state().race.respawnIn === null);
  const back = await state(page);
  expect(back.race.checkpoint).toBe(-1);
  expect(back.race.falls).toBe(1);
  expect(Math.abs(back.runners[0].x - SPAWN_X), 'at the spawn').toBeLessThan(TILE / 2);
  expect(back.runners[0].angle).toBeCloseTo(0, 2);
  expect(back.runners[0].mode).toBe('run');
  expect(back.raceTime, 'the race clock kept running').toBeGreaterThan(respawn[0].t - 0.1);
  await waitFor(page, () => window.__TR.state().runners[0].grounded);
  await shot(page, 'respawned', testInfo);

  // the next try: run, jump, land beyond the pit, and the first flag is a few tiles on
  await jumpPit(page, PIT1);
  await runTo(page, CP[0] + 0.5);
  await page.keyboard.up('ArrowRight');
  const after = await state(page);
  expect(after.race.checkpoint).toBe(0);
  expect(after.runners[0].checkpoint).toBe(0);
  expect(after.race.falls).toBe(1);
  expect(ofType(await log(page), 'checkpoint').map((e) => e.data.index)).toEqual([0]);
  await shot(page, 'crossed', testInfo);
});

test('a checkpoint is passed once, shows a message, and a fall after it goes back to that flag, not the start', async ({ page }, testInfo) => {
  await open(page);
  await untilGo(page);
  await jumpPit(page, PIT1);
  await runTo(page, CP[0] + 0.3);
  await waitFor(page, () => window.__TR.state().race.checkpoint === 0);
  await expect(toast(page)).toHaveText('Checkpoint!');
  const first = ofType(await log(page), 'checkpoint');
  expect(first).toHaveLength(1);
  expect(first[0].data.x, 'passed when the runner reached the middle of the flag tile').toBeGreaterThanOrEqual(CP[0]);
  expect(first[0].data.x).toBeLessThan(CP[0] + 0.5);
  await shot(page, 'checkpoint-0', testInfo);

  // on to the second pit, and straight into it
  await runTo(page, PIT2 + 1);
  await waitFor(page, () => window.__TR.state().race.falls === 1);
  await page.keyboard.up('ArrowRight');
  await waitFor(page, () => window.__TR.events().some((e) => e.type === 'respawn'), null, 5000);
  await waitFor(page, () => window.__TR.state().race.respawnIn === null && window.__TR.state().runners[0].grounded);
  const back = await state(page);
  const respawn = ofType(await log(page), 'respawn');
  expect(respawn[0].data.checkpoint).toBe(0);
  expect(Math.abs(back.runners[0].x - CP[0] * TILE), 'back at the first flag').toBeLessThan(TILE / 2);
  expect(back.race.checkpoint, 'the flag is still counted').toBe(0);
  expect(ofType(await log(page), 'checkpoint'), 'passing it again is not a new checkpoint').toHaveLength(1);
  await shot(page, 'back-at-flag', testInfo);

  // cross the second pit, pass the second flag
  await jumpPit(page, PIT2);
  await runTo(page, CP[1] + 0.3);
  await waitFor(page, () => window.__TR.state().race.checkpoint === 1);
  await page.keyboard.up('ArrowRight');
  const end = await state(page);
  expect(end.race.falls).toBe(1);
  expect(end.race.checkpoints).toBe(2);
  expect(ofType(await log(page), 'checkpoint').map((e) => e.data.index)).toEqual([0, 1]);
  await shot(page, 'checkpoint-1', testInfo);
});

test('the HUD sits on the picture, not on the letterbox bars, in a 13" window and in tall and narrow ones, and follows a resize', async ({ page }, testInfo) => {
  // The canvas is scaled to fit the window and centred: in a window that is not 16:9 it has bars beside or above it.
  // The HUD must lie over the picture (src/ui/CLAUDE.md: screenshots at 1280x800 and 1440x900; the others are the shapes
  // a school laptop's browser window really has). Rectangles are read from the page, in window pixels.
  const rects = () => page.evaluate(() => {
    const r = (el) => {
      const b = el.getBoundingClientRect();
      return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
    };
    return {
      canvas: r(document.querySelector('#game canvas')),
      ui: r(document.getElementById('ui')),
      timer: r(document.querySelector('[data-testid="timer"]')),
      // the word itself, not its full-width block (the block is scaled by the "pop" animation for a moment); null when there is no word
      countdown: (() => {
        const el = document.querySelector('[data-testid="countdown"]');
        if (!el.textContent) return null;
        const range = document.createRange();
        range.selectNodeContents(el);
        return r(range);
      })(),
      toast: r(document.querySelector('[data-testid="toast"]')),
    };
  });
  const inside = (box, canvas) => box.left >= canvas.left - 1.5 && box.right <= canvas.right + 1.5 && box.top >= canvas.top - 1.5 && box.bottom <= canvas.bottom + 1.5;
  const check = async (label) => {
    // Phaser rescales the picture on its next frame, then the HUD follows it
    await waitFor(page, () => {
      const c = document.querySelector('#game canvas').getBoundingClientRect();
      const u = document.getElementById('ui').getBoundingClientRect();
      return c.width > 0 && ['left', 'top', 'width', 'height'].every((k) => Math.abs(c[k] - u[k]) < 1.5);
    }, null, 5000);
    const r = await rects();
    expect(inside(r.ui, r.canvas), `${label}: the HUD layer is the picture`).toBe(true);
    expect(inside(r.timer, r.canvas), `${label}: the timer is on the picture (canvas ${JSON.stringify(r.canvas)}, timer ${JSON.stringify(r.timer)})`).toBe(true);
    if (r.countdown) expect(inside(r.countdown, r.canvas), `${label}: the countdown word is on the picture (canvas ${JSON.stringify(r.canvas)}, word ${JSON.stringify(r.countdown)})`).toBe(true);
    expect(inside(r.toast, r.canvas), `${label}: the message is on the picture`).toBe(true);
    const size = await page.getByTestId('countdown').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size, `${label}: the countdown word is at least 96 px`).toBeGreaterThanOrEqual(96);
    return r;
  };

  for (const [w, h] of [[1280, 800], [1440, 900], [1280, 1000], [1440, 780]]) {
    await page.setViewportSize({ width: w, height: h });
    await open(page); // a fresh load at this size, so the countdown word is on screen for the shot
    await expect(page.getByTestId('timer')).toBeVisible();
    const r = await check(`${w}x${h}`);
    note(testInfo, `picture-${w}x${h}`, `${Math.round(r.canvas.width)}x${Math.round(r.canvas.height)} at ${Math.round(r.canvas.left)},${Math.round(r.canvas.top)}`);
    await shot(page, `hud-${w}x${h}`, testInfo);
  }

  // and a window resized while the page is open
  await page.setViewportSize({ width: 1024, height: 768 });
  // first the picture itself has to be rescaled by Phaser (until then picture and HUD still agree at the old size)
  await waitFor(page, () => document.querySelector('#game canvas').getBoundingClientRect().width < 1100, null, 5000);
  const small = await check('resized to 1024x768');
  expect(small.canvas.width, 'the picture really was rescaled').toBeLessThan(1100);
  await shot(page, 'hud-resized-1024x768', testInfo);
});

// ---------------------------------------------------------------------------------------------------------------
// G3b: the finish, the results, the title's way in, play again, and back to the title. These tests play WHOLE races in
// real time (a 3 s countdown and about 12 s of running). The first takes about 16 s (a 60 s limit is margin for a slow
// clock on a busy machine); the second plays two races and takes about 35 s, which is over Playwright's 30 s default, so
// it gets 90 s. They are longer tests, not loosened ones (tests/e2e/CLAUDE.md rule 6): every step also has its own wait.
// ---------------------------------------------------------------------------------------------------------------
const SINGLE_RACE_LIMIT = 60_000;
const TWO_RACES_LIMIT = 90_000;

/**
 * Two animation frames. A shot taken the moment a new scene's state exists can still show the OLD canvas in WebKit (the
 * race is created before its first frame is drawn: the probe saw the title for a frame or two, 60 to 70 ms): the
 * verifier's first look at this stage caught it.
 */
const settle = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
/** A new race is really on screen: its HUD has the timer and a countdown word, and two frames have been drawn since. */
async function drawn(page) {
  await expect(page.getByTestId('timer')).toHaveText('0:00.0');
  await expect(page.getByTestId('countdown')).toHaveText(/^[123]$/);
  await settle(page);
}

/** In the page: when the results screen first shows, what the race clock read (one entry per time it appears). */
async function watchPage(page) {
  await page.addInitScript(() => {
    window.__resultsAt = [];
    let wasShown = false;
    const tick = () => {
      const el = document.querySelector('[data-testid="results"]');
      const shown = !!el && !el.hidden;
      if (shown && !wasShown && window.__TR) window.__resultsAt.push(window.__TR.state().raceTime);
      wasShown = shown;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Once the game has booted: record every key pressed and whether the page's default action was cancelled (Phaser cancels
 * it for the keys it captures: the arrows and Space would scroll the page). It has to be added AFTER Phaser's own
 * listener on window, so that it sees what that one did to the event: an init script would run before it and see nothing.
 */
const watchKeys = (page) => page.evaluate(() => {
  window.__keys = [];
  window.addEventListener('keydown', (e) => window.__keys.push([e.code, e.defaultPrevented]));
});

/**
 * Run the whole short course with real keys: jump both pits, then run on until the line is crossed. With `fallFirst` the
 * runner first runs straight off the edge of the first pit (no jump), waits to be put back, and then does the course.
 */
async function finishRace(page, { fallFirst = false } = {}) {
  await untilGo(page);
  if (fallFirst) {
    await runTo(page, PIT1 + 1);
    await waitFor(page, () => window.__TR.state().race.falls === 1);
    await page.keyboard.up('ArrowRight');
    await waitFor(page, () => window.__TR.events().some((e) => e.type === 'respawn') && window.__TR.state().runners[0].grounded, null, 8000);
  }
  await jumpPit(page, PIT1);
  await jumpPit(page, PIT2);
  await page.keyboard.down('ArrowRight');
  await waitFor(page, () => window.__TR.state().race.phase === 'finished', null, 20000);
}

/** The picture (canvas) and where the results' parts lie, in window pixels. */
const resultRects = (page) => page.evaluate(() => {
  const r = (el) => {
    const b = el.getBoundingClientRect();
    return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
  };
  const text = (id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    const range = document.createRange();
    range.selectNodeContents(el);
    return r(range);
  };
  const size = (id) => parseFloat(getComputedStyle(document.querySelector(`[data-testid="${id}"]`)).fontSize);
  return {
    win: { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight },
    canvas: r(document.querySelector('#game canvas')),
    ui: r(document.getElementById('ui')),
    headline: text('results-headline'),
    time: text('results-time'),
    falls: text('results-falls'),
    again: r(document.querySelector('[data-testid="rematch"]')),
    title: r(document.querySelector('[data-testid="to-title"]')),
    sizes: { headline: size('results-headline'), time: size('results-time'), falls: size('results-falls'), again: size('rematch'), title: size('to-title') },
  };
});
const within = (box, canvas) => box.left >= canvas.left - 1.5 && box.right <= canvas.right + 1.5 && box.top >= canvas.top - 1.5 && box.bottom <= canvas.bottom + 1.5;
/**
 * Wait until Phaser has rescaled the picture to the window AND the HUD layer lies over it. After a resize Phaser rescales
 * on its next frame, and until then the picture and the layer still agree with each other at the OLD size (wider than
 * the new window): "layer equals picture" alone passed vacuously in WebKit at 1280x1000, and the shot showed a
 * 1440-wide picture cut off by the window. So the picture must also fit the window and be as big as the window allows
 * (the canvas is scaled to fit: its width or its height is the window's) and sit in the middle of it: going from a
 * 1280x720 window to 1280x800 changes only the position, and without the centring test the old, uncentred picture
 * passed and the shot showed it hugging the top with a bar only below.
 */
const layerOnPicture = (page) => waitFor(page, () => {
  const c = document.querySelector('#game canvas').getBoundingClientRect();
  const u = document.getElementById('ui').getBoundingClientRect();
  const w = window.innerWidth;
  const h = window.innerHeight;
  const fits = c.left >= -1 && c.top >= -1 && c.right <= w + 1 && c.bottom <= h + 1;
  const asBigAsItCanBe = Math.abs(c.width - w) < 2 || Math.abs(c.height - h) < 2;
  const centred = Math.abs((c.left + c.right) / 2 - w / 2) < 2 && Math.abs((c.top + c.bottom) / 2 - h / 2) < 2;
  return c.width > 0 && fits && asBigAsItCanBe && centred && ['left', 'top', 'width', 'height'].every((k) => Math.abs(c[k] - u[k]) < 1.5);
}, null, 5000);

test('from the title: Play, the countdown, the finish line, the results; the runner stops and the clock too', async ({ page }, testInfo) => {
  test.setTimeout(SINGLE_RACE_LIMIT);
  await watchPage(page);
  await gamePage(page, { course: 'test-race' }); // no scene in the URL: the real way in, the title (its Play runs the short course here)
  expect((await state(page)).scene).toBe('hello');
  const play = page.getByTestId('play-solo');
  await expect(play).toBeVisible();
  await expect(play).toHaveText('Play');
  await expect(page.getByTestId('results')).toBeHidden();
  await settle(page);
  await shot(page, 'title', testInfo);

  await play.click();
  await waitFor(page, () => {
    const s = window.__TR.state();
    return s.scene === 'race' && s.race && s.runners.length === 1;
  });
  await expect(page.getByTestId('title')).toBeHidden();
  const start = await state(page);
  expect(start.race.phase).toBe('countdown');
  expect(start.race.checkpoints, '?course=test-race: Play ran the short course').toBe(course.checkpoints.length);
  expect(start.race.finishTime).toBeNull();
  expect(start.runners[0].finished).toBe(false);

  await finishRace(page);
  const done = await state(page);
  const finishEvents = ofType(await log(page), 'finish');
  expect(finishEvents, 'one finish event').toHaveLength(1);
  const finishTime = done.race.finishTime;
  expect(finishTime, 'the race clock stopped at the line').toBe(done.race.t);
  expect(finishEvents[0].data.time).toBeCloseTo(finishTime, 2);
  expect(done.race.phase).toBe('finished');
  expect(done.runners[0].finished).toBe(true);
  expect(finishEvents[0].data.x, 'the line is the left edge of the finish tile').toBeGreaterThanOrEqual(FINISH);
  expect(finishEvents[0].data.x).toBeLessThan(FINISH + 0.5);
  note(testInfo, 'finish-time-seconds', finishTime.toFixed(2));
  expect(finishTime, 'nobody can beat course.minTime').toBeGreaterThanOrEqual(course.minTime);
  expect(finishTime, 'a short course, run with two jumps').toBeLessThan(40);
  expect(done.race.falls).toBe(0);
  await expect(page.getByTestId('toast')).toHaveText('Finished!');
  await shot(page, 'finished', testInfo);

  // the keys do nothing any more: right is still held, and Space and Shift are tapped; the runner coasts to a stop
  // at the line, and the timer stands still at the finish time
  const xAtLine = done.runners[0].x;
  await page.keyboard.press('Space');
  await page.keyboard.press('Shift');
  await waitFor(page, (t) => window.__TR.state().raceTime >= t, done.raceTime + 1.0);
  const after = await state(page);
  expect(after.runners[0].x - xAtLine, 'coasted to a stop within a tile and a half of the line').toBeLessThan(1.5 * TILE);
  note(testInfo, 'tiles-from-the-line-to-a-stop', ((after.runners[0].x - xAtLine) / TILE).toFixed(2));
  expect(Math.abs(after.runners[0].vx), 'stopped').toBeLessThan(0.5);
  expect(after.runners[0].grounded).toBe(true);
  expect(after.race.t, 'the clock stays at the finish time').toBe(finishTime);
  const events = await log(page);
  expect(ofType(events, 'jump').filter((e) => e.t > finishEvents[0].t), 'no jump after the line').toHaveLength(0);
  expect(ofType(events, 'dive').filter((e) => e.t > finishEvents[0].t), 'no dive after the line').toHaveLength(0);
  await expect(page.getByTestId('timer')).toHaveText(formatRaceTime(finishTime));

  // the results come a beat after the line (TUNING.resultsDelay, in game time), with the time that stopped
  const results = page.getByTestId('results');
  await expect(results).toBeVisible({ timeout: 8000 });
  const shownAt = (await page.evaluate(() => window.__resultsAt))[0];
  note(testInfo, 'seconds-line-to-results', (shownAt - finishEvents[0].t).toFixed(2));
  expect(shownAt - finishEvents[0].t, 'not before the beat').toBeGreaterThanOrEqual(TUNING.resultsDelay - 0.06);
  expect(shownAt - finishEvents[0].t, 'and not long after it').toBeLessThanOrEqual(TUNING.resultsDelay + 0.4);
  await expect(page.getByTestId('results-headline')).toHaveText('Finished!');
  await expect(page.getByTestId('results-time')).toHaveText(formatRaceTime(finishTime));
  await expect(page.getByTestId('results-falls')).toHaveText('No falls');
  await expect(page.getByTestId('rematch')).toHaveText('Play again');
  await expect(page.getByTestId('to-title')).toHaveText('Title');
  await page.keyboard.up('ArrowRight');
  // a kid still mashing Space at the line must not press Play again by accident: neither button has the focus, and keys do
  // nothing to the results (Decision 63)
  await expect(page.getByTestId('rematch')).not.toBeFocused();
  await expect(page.getByTestId('to-title')).not.toBeFocused();
  for (const key of ['Space', 'Enter', 'ArrowLeft', 'KeyW']) await page.keyboard.press(key);
  await expect(results, 'the results are still up after Space, Enter and the arrow keys').toBeVisible();
  expect((await state(page)).race.phase, 'no key started a new race').toBe('finished');
  expect(await page.evaluate(() => window.__resultsAt.length), 'the results came up once').toBe(1);
  await shot(page, 'results-1280x720', testInfo);

  // the results lie on the picture, and read from a desk away, in the 13" windows and after a resize
  for (const [w, h] of [[1280, 800], [1440, 900], [1280, 1000]]) {
    await page.setViewportSize({ width: w, height: h });
    await layerOnPicture(page);
    const r = await resultRects(page);
    expect(within(r.canvas, r.win), `${w}x${h}: the picture fits the window (canvas ${JSON.stringify(r.canvas)})`).toBe(true);
    for (const part of ['headline', 'time', 'falls', 'again', 'title']) {
      expect(within(r[part], r.canvas), `${w}x${h}: the ${part} is on the picture (canvas ${JSON.stringify(r.canvas)}, ${part} ${JSON.stringify(r[part])})`).toBe(true);
    }
    expect(r.sizes.headline, `${w}x${h}: the headline is at least 96 px (src/ui/CLAUDE.md rule 4)`).toBeGreaterThanOrEqual(96);
    expect(r.sizes.time).toBeGreaterThanOrEqual(64);
    expect(r.sizes.falls).toBeGreaterThanOrEqual(18);
    expect(r.sizes.again, 'button text is at least 18 px').toBeGreaterThanOrEqual(18);
    expect(r.sizes.title).toBeGreaterThanOrEqual(18);
    await shot(page, `results-${w}x${h}`, testInfo);
  }
});

test('play again starts a clean race, the title gets its keys back, and Play from the title works a second time', async ({ page }, testInfo) => {
  test.setTimeout(TWO_RACES_LIMIT);
  await watchPage(page);
  await open(page); // the test scene: the same race, without the title
  await watchKeys(page);
  await finishRace(page);
  await page.keyboard.up('ArrowRight');
  await expect(page.getByTestId('results')).toBeVisible({ timeout: 8000 });
  const first = (await state(page)).race.finishTime;

  // Play again: the scene stops and starts, so the race is brand new, with nothing left over from the last one
  await page.getByTestId('rematch').click();
  await expect(page.getByTestId('results')).toBeHidden();
  await waitFor(page, () => {
    const s = window.__TR.state();
    return s.scene === 'race' && s.race && s.race.phase === 'countdown' && s.raceTime < -2;
  });
  const fresh = await state(page);
  expect(fresh.race.finishTime).toBeNull();
  expect(fresh.race.falls).toBe(0);
  expect(fresh.race.checkpoint).toBe(-1);
  expect(fresh.runners[0].finished).toBe(false);
  expect(Math.abs(fresh.runners[0].x - SPAWN_X), 'back at the spawn').toBeLessThan(TILE / 2);
  expect(ofType(await log(page), 'finish'), 'the event log of the last race is gone').toHaveLength(0);
  await drawn(page);
  await shot(page, 'again-countdown', testInfo);

  // and it can be raced to the end like the first (this time with one fall on the way, so the results have a number to
  // show): the keys, the pits, the line, the results again
  await finishRace(page, { fallFirst: true });
  await page.keyboard.up('ArrowRight');
  const log2 = await log(page);
  expect(ofType(log2, 'go'), 'one GO, not one per scene start').toHaveLength(1);
  expect(ofType(log2, 'finish')).toHaveLength(1);
  expect(ofType(log2, 'fall')).toHaveLength(1);
  expect(ofType(log2, 'respawn')).toHaveLength(1);
  expect(ofType(log2, 'jump'), 'one jump for each pit').toHaveLength(2);
  const end = await state(page);
  expect(end.race.falls).toBe(1);
  const second = end.race.finishTime;
  note(testInfo, 'finish-times-seconds', `${first.toFixed(2)} then ${second.toFixed(2)} (with one fall)`);
  await expect(page.getByTestId('results')).toBeVisible({ timeout: 8000 });
  expect(await page.evaluate(() => window.__resultsAt.length), 'the results came up once per race').toBe(2);
  await expect(page.getByTestId('results-time')).toHaveText(formatRaceTime(second));
  await expect(page.getByTestId('results-falls'), 'the falls on the results are the falls of the race').toHaveText('1 fall');
  await shot(page, 'again-results', testInfo);

  // while a race is on the page keeps the arrows and Space for the game (the browser would scroll)
  await page.evaluate(() => { window.__keys.length = 0; });
  await page.keyboard.press('ArrowUp');
  const inRace = await page.evaluate(() => window.__keys.slice());
  expect(inRace, 'in the race the arrow key is taken by the game').toEqual([['ArrowUp', true]]);

  // back to the title: the race scene lets go of the keyboard (PROGRESS Decision 32c), so the title and, later, the
  // room-code box get W, A, D, Space and the arrows like any page
  await page.getByTestId('to-title').click();
  await expect(page.getByTestId('results')).toBeHidden();
  await expect(page.getByTestId('play-solo')).toBeVisible();
  await waitFor(page, () => window.__TR.state().scene === 'hello');
  // nothing of the race is left on the title: no timer, no word, no message, and the test API does not report a stopped race
  const gone = await state(page);
  expect(gone.race, 'the title is not a race any more').toBeNull();
  expect(gone.runners, 'no runner on the title').toEqual([]);
  await expect(page.getByTestId('timer')).toBeHidden();
  await expect(page.getByTestId('countdown')).toHaveText('');
  await expect(page.getByTestId('toast')).toHaveText('');
  await page.evaluate(() => { document.activeElement?.blur(); window.__keys.length = 0; }); // a focused Play button would take Space as a click
  const typed = ['KeyW', 'KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'ShiftLeft'];
  for (const key of typed) await page.keyboard.press(key);
  const onTitle = await page.evaluate(() => window.__keys.slice());
  expect(onTitle.map((k) => k[0])).toEqual(typed);
  expect(onTitle.filter((k) => k[1]).map((k) => k[0]), 'the title takes no key away from the browser').toEqual([]);
  await shot(page, 'back-at-title', testInfo);

  // and Play works from the title a second time, with the keys captured again
  await page.getByTestId('play-solo').click();
  await waitFor(page, () => {
    const s = window.__TR.state();
    return s.scene === 'race' && s.race && s.race.phase === 'countdown' && s.raceTime < -2;
  });
  await expect(page.getByTestId('title')).toBeHidden();
  // this page raced the short course through a test scene, and the title's Play (no `course` in the URL) is still course 1
  expect((await state(page)).race.checkpoints, "Play from the title runs course 1, whatever the page raced before").toBe(course1.checkpoints.length);
  await drawn(page); // the shot below must show the race, not the title canvas that is still up for a frame or two in WebKit
  await page.evaluate(() => { window.__keys.length = 0; });
  await page.keyboard.press('ArrowUp');
  expect(await page.evaluate(() => window.__keys.slice()), 'the race has the arrow keys again').toEqual([['ArrowUp', true]]);
  await shot(page, 'second-race-countdown', testInfo);
});

test('the title: Play sits on the picture at 1280x800 and 1440x900, and Enter starts the race', async ({ page }, testInfo) => {
  for (const [w, h] of [[1280, 800], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await gamePage(page);
    const play = page.getByTestId('play-solo');
    await expect(play).toBeVisible();
    await expect(play, 'focused, so Enter or Space starts a race').toBeFocused();
    await layerOnPicture(page);
    const r = await page.evaluate(() => {
      const box = (el) => {
        const b = el.getBoundingClientRect();
        return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
      };
      const button = document.querySelector('[data-testid="play-solo"]');
      const keys = document.querySelector('.tr-keys');
      return {
        canvas: box(document.querySelector('#game canvas')),
        play: box(button),
        keys: box(keys),
        size: parseFloat(getComputedStyle(button).fontSize),
        keysSize: parseFloat(getComputedStyle(keys).fontSize),
      };
    });
    expect(within(r.canvas, { left: 0, top: 0, right: w, bottom: h }), `${w}x${h}: the picture fits the window`).toBe(true);
    expect(within(r.play, r.canvas), `${w}x${h}: the Play button is on the picture`).toBe(true);
    expect(within(r.keys, r.canvas), `${w}x${h}: the key hints are on the picture`).toBe(true);
    expect(r.size, 'the button text is big').toBeGreaterThanOrEqual(48);
    expect(r.keysSize).toBeGreaterThanOrEqual(18);
    await settle(page);
    await shot(page, `title-${w}x${h}`, testInfo);
  }
  await page.keyboard.press('Enter');
  await waitFor(page, () => {
    const s = window.__TR.state();
    return s.scene === 'race' && s.race && s.race.phase === 'countdown';
  });
  await expect(page.getByTestId('title')).toBeHidden();
  expect((await state(page)).race.checkpoints, 'Enter on the title starts course 1 (the title was opened with no course switch)').toBe(course1.checkpoints.length);
  await drawn(page);
  await shot(page, 'enter-started-race', testInfo);
});
