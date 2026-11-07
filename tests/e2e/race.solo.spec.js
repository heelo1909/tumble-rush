import { readFileSync } from 'node:fs';
import { test, expect, gamePage, shot } from './fixtures.js';
import { TUNING, TILE } from '../../src/logic/tuning.js';

// G3a: the race flow on the small test course `test-race` (?test=1&scene=race): a 3-2-1 countdown that holds the
// runner, the race clock and the HUD timer, checkpoints, and the respawn after a fall. Real key presses throughout
// (tests/e2e/CLAUDE.md rule 1); no __TR.teleport, __TR.clock or __TR.hit here. Times come from the game's own
// physics clock (state().raceTime and the event log), not the wall clock, so a slow frame cannot make them flaky.
// G3b adds the finish, the results and course 1 to this file.

const course = JSON.parse(readFileSync(new URL('../../src/game/courses/test-race.json', import.meta.url), 'utf8'));
const PIT1 = course.ground[0].col + course.ground[0].w; // first tile of the first pit (3 tiles wide)
const PIT2 = course.ground[1].col + course.ground[1].w;
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
