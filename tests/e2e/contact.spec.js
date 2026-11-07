import { readFileSync } from 'node:fs';
import { test, expect, gamePage, shot } from './fixtures.js';
import { TILE, TUNING } from '../../src/logic/tuning.js';

// G2b: the four contact obstacles in the gallery course (?test=1&scene=gallery), in real browsers: a bounce pad,
// a seesaw, a conveyor belt and a row of falling tiles. Every one is driven with REAL key presses and the game's
// own physics. window.__TR.teleport() only puts the runner at the start of a bay (allowed in obstacle tests,
// tests/e2e/CLAUDE.md rule 1); nothing here uses __TR.hit() or touches a body.

const gallery = JSON.parse(readFileSync(new URL('../../src/game/courses/test-gallery.json', import.meta.url), 'utf8'));
const find = (type) => gallery.obstacles.findIndex((o) => o.type === type);
const PAD = find('bounce-pad');
const SEESAW = find('seesaw');
const BELT = find('conveyor');
const TILES = find('falling-tiles');
// the checkpoint that stands the runner at the start of each bay (the same order as the obstacles)
const CP = { pad: 4, seesaw: 5, belt: 6, tiles: 7 };
const LEDGE = gallery.ground.find((g) => g.row === 6); // the floating ledge the pad is for

const state = (page) => page.evaluate(() => window.__TR.state());
const me = async (page) => (await state(page)).runners[0];
const log = (page) => page.evaluate(() => window.__TR.events());
const ofType = (events, type) => events.filter((e) => e.type === type);
const waitFor = (page, fn, arg, timeout = 10000) => page.waitForFunction(fn, arg, { timeout });
const note = (testInfo, type, value) => testInfo.annotations.push({ type, description: String(value) });

/** Open the gallery and wait for the runner and every obstacle to be there. */
async function ready(page) {
  await gamePage(page, { scene: 'gallery' });
  await waitFor(page, (n) => {
    const s = window.__TR.state();
    return s.scene === 'race' && s.runners.length === 1 && s.runners[0].grounded && s.obstacles.length === n;
  }, gallery.obstacles.length);
}

/** Stand the runner at the start of a bay and give the camera time to glide there, so a shot shows the bay. */
async function goTo(page, cp) {
  await page.evaluate((n) => window.__TR.teleport(n), cp);
  await waitFor(page, () => window.__TR.state().runners[0].grounded);
  await page.waitForTimeout(1200);
}

/** Hold a key with the real keyboard until the page says the condition is true, then let go. */
async function holdUntil(page, key, fn, arg, timeout = 10000) {
  await page.keyboard.down(key);
  try {
    await waitFor(page, fn, arg, timeout);
  } finally {
    await page.keyboard.up(key);
  }
}

const obstacle = async (page, i) => (await state(page)).obstacles[i];

test('the contact obstacles are where the course says, and a row of tiles starts out whole', async ({ page }, testInfo) => {
  await ready(page);
  const s = await state(page);
  for (const [type, i] of [['bounce-pad', PAD], ['seesaw', SEESAW], ['conveyor', BELT]]) {
    const o = s.obstacles[i];
    const want = gallery.obstacles[i];
    expect(o.type).toBe(type);
    expect(Math.abs(o.x - want.col * TILE), `${type} x`).toBeLessThan(1);
    expect(Math.abs(o.y - want.row * TILE), `${type} y`).toBeLessThan(1);
    expect(o.angle, `${type} starts level`).toBeCloseTo(0, 3);
  }
  const tiles = s.obstacles[TILES];
  expect(tiles.tiles).toHaveLength(gallery.obstacles[TILES].count);
  expect(tiles.tiles.every((p) => p === 'solid')).toBe(true);
  for (const [name, cp] of [['pad', CP.pad], ['seesaw', CP.seesaw], ['belt', CP.belt]]) {
    await goTo(page, cp);
    await shot(page, `${name}-bay`, testInfo);
  }
});

test('a bounce pad throws a runner who walks onto it about 4.7 tiles up, once, onto the ledge it is for', async ({ page }, testInfo) => {
  await ready(page);
  await goTo(page, CP.pad);
  const start = await me(page);
  await shot(page, 'pad-before', testInfo);

  await page.keyboard.down('ArrowRight');
  await waitFor(page, () => window.__TR.events().some((e) => e.type === 'bounce'));
  await waitFor(page, () => !window.__TR.state().runners[0].grounded);
  await shot(page, 'pad-launched', testInfo);
  await waitFor(page, () => window.__TR.events().some((e) => e.type === 'land'));
  await page.keyboard.up('ArrowRight');

  const events = await log(page);
  const bounces = ofType(events, 'bounce');
  expect(bounces, 'one launch, not a string of them while the runner is still over the pad').toHaveLength(1);
  expect(bounces[0].data.vy, 'launched straight up at the pad speed (tiles/s)').toBe(-TUNING.padSpeed);
  const land = ofType(events, 'land')[0];
  note(testInfo, 'pad-rise-tiles', land.data.rise);
  note(testInfo, 'pad-air-seconds', land.data.air);
  const apex = (TUNING.padSpeed * TUNING.padSpeed) / (2 * TUNING.gravity);
  expect(land.data.rise, 'about the apex the speed gives').toBeGreaterThan(apex - 0.4);
  expect(land.data.rise).toBeLessThan(apex + 0.2);
  expect(land.data.rise, 'far higher than the 1.9-tile jump').toBeGreaterThan(3.5);

  // it ends standing on the ledge, which no jump can reach (a jump rises under 2 tiles; the ledge top is 3 above the ground)
  expect((TUNING.jumpSpeed * TUNING.jumpSpeed) / (2 * TUNING.gravity), 'the ledge is out of reach of any jump').toBeLessThan(gallery.ground[0].row - LEDGE.row);
  const end = await me(page);
  expect(end.grounded).toBe(true);
  expect(end.x / TILE, 'on the ledge, not beside it').toBeGreaterThan(LEDGE.col);
  expect(end.x / TILE).toBeLessThan(LEDGE.col + LEDGE.w);
  expect(end.y + (TUNING.bodyH * TILE) / 2, 'feet on the ledge top').toBeLessThan(LEDGE.row * TILE + 4);
  expect(start.y - end.y, 'higher than where it started').toBeGreaterThan(2.5 * TILE);
  await shot(page, 'pad-on-ledge', testInfo);
});

test('a seesaw tips under a runner standing on one end, flips when they walk to the other, and levels again when empty', async ({ page }, testInfo) => {
  await ready(page);
  await goTo(page, CP.seesaw);
  const pivot = gallery.obstacles[SEESAW].col * TILE;
  const half = (gallery.obstacles[SEESAW].length * TILE) / 2;
  const startFloor = (await me(page)).y;
  await shot(page, 'seesaw-before', testInfo);

  // onto the left end with the real keys, then stand still there
  await holdUntil(page, 'ArrowRight', (x) => window.__TR.state().runners[0].x >= x, pivot - half + 0.9 * TILE);
  const t0 = (await state(page)).raceTime;
  await waitFor(page, ([i, max]) => window.__TR.state().obstacles[i].angle <= -max, [SEESAW, 0.9 * TUNING.seesawMaxTilt]);
  const s1 = await state(page);
  note(testInfo, 'seesaw-seconds-to-tip', (s1.raceTime - t0).toFixed(2));
  expect(s1.obstacles[SEESAW].angle, 'the left end went down (negative = anticlockwise)').toBeLessThanOrEqual(-0.9 * TUNING.seesawMaxTilt);
  expect(s1.obstacles[SEESAW].angle, 'and no further than its stop').toBeGreaterThanOrEqual(-TUNING.seesawMaxTilt - 0.01);
  expect(s1.runners[0].grounded, 'still standing on it').toBe(true);
  // carried down with the plank: by roughly how far the tilted surface has dropped at the runner's place (70% of it, so
  // where exactly they stopped after the key came up does not matter)
  const dropPx = (pivot - s1.runners[0].x) * Math.tan(-s1.obstacles[SEESAW].angle);
  expect(s1.runners[0].y, 'carried down with the end').toBeGreaterThan(startFloor + 0.7 * dropPx);
  await shot(page, 'seesaw-left-down', testInfo);

  // walk up the slope towards the middle and stop a little short of it: with a runner on it the plank stays tipped (an
  // empty one levels itself, but its spring must not fight a runner's weight, or it would hover half-way up)
  await holdUntil(page, 'ArrowRight', (x) => window.__TR.state().runners[0].x >= x, pivot - 1.0 * TILE);
  await page.waitForTimeout(1500);
  const mid = await state(page);
  expect(mid.runners[0].x, 'still on the left of the pin').toBeLessThan(pivot);
  expect(mid.runners[0].grounded).toBe(true);
  expect(mid.obstacles[SEESAW].angle, 'still tipped to the runner\'s side with them near the middle').toBeLessThanOrEqual(-0.9 * TUNING.seesawMaxTilt);

  // walk up the slope and across to the right end: the plank flips under them. A runner going up a tilted plank is
  // rising along the ground, not leaving it: it must stay "on the ground" the whole way (counted every frame).
  await page.evaluate(([from, to]) => {
    window.__slope = { on: 0, air: 0 };
    const f = () => {
      const r = window.__TR.state().runners[0];
      if (r.x >= from && r.x <= to) {
        window.__slope.on += 1;
        if (!r.grounded) window.__slope.air += 1;
      }
      window.__raf = requestAnimationFrame(f);
    };
    f();
  }, [pivot - 1.5 * TILE, pivot]);
  await holdUntil(page, 'ArrowRight', (x) => window.__TR.state().runners[0].x >= x, pivot + half - 1.3 * TILE);
  const slope = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__slope; });
  note(testInfo, 'seesaw-frames-uphill-airborne', `${slope.air} of ${slope.on}`);
  expect(slope.on, 'the climb was sampled').toBeGreaterThan(3);
  expect(slope.air, 'on the ground the whole way up the plank').toBeLessThanOrEqual(1);
  const s2a = await state(page);
  expect(s2a.runners[0].grounded, 'walked across without falling off').toBe(true);
  await waitFor(page, ([i, max]) => window.__TR.state().obstacles[i].angle >= max, [SEESAW, 0.9 * TUNING.seesawMaxTilt]);
  const s2 = await state(page);
  expect(s2.obstacles[SEESAW].angle, 'the right end went down').toBeGreaterThanOrEqual(0.9 * TUNING.seesawMaxTilt);
  expect(s2.obstacles[SEESAW].angle).toBeLessThanOrEqual(TUNING.seesawMaxTilt + 0.01);
  expect(s2.runners[0].grounded).toBe(true);
  await shot(page, 'seesaw-right-down', testInfo);

  // jump off to the ground on the far side
  await page.keyboard.down('ArrowRight');
  await page.keyboard.press('Space');
  await waitFor(page, (x) => window.__TR.state().runners[0].x >= x && window.__TR.state().runners[0].grounded, pivot + half + 1 * TILE);
  await page.keyboard.up('ArrowRight');
  await shot(page, 'seesaw-crossed', testInfo);

  // with nobody on it the plank comes back level
  const t1 = (await state(page)).raceTime;
  await waitFor(page, (i) => Math.abs(window.__TR.state().obstacles[i].angle) < 0.03, SEESAW, 12000);
  const s3 = await state(page);
  note(testInfo, 'seesaw-seconds-to-level', (s3.raceTime - t1).toFixed(2));
  expect(Math.abs(s3.obstacles[SEESAW].angle)).toBeLessThan(0.03);
  await shot(page, 'seesaw-level-again', testInfo);
});

test('a conveyor belt carries a runner who stands still on it, and the runner keeps their own speed on top of it', async ({ page }, testInfo) => {
  await ready(page);
  await goTo(page, CP.belt);
  const belt = gallery.obstacles[BELT];
  const left = (belt.col - belt.w / 2) * TILE;
  const right = (belt.col + belt.w / 2) * TILE;
  await shot(page, 'belt-before', testInfo);

  // step onto the near end and let go of the keys: the belt does the moving
  await holdUntil(page, 'ArrowRight', (x) => window.__TR.state().runners[0].x >= x, left + 1.2 * TILE);
  await waitFor(page, (v) => Math.abs(window.__TR.state().runners[0].vx - v) < 0.15 && window.__TR.state().runners[0].grounded, TUNING.beltSpeed);
  const a = await me(page);
  const t0 = (await state(page)).raceTime;
  await page.waitForTimeout(600); // short: the runner must still have most of the belt in front of it for the run below
  const s = await state(page);
  const b = s.runners[0];
  const secs = s.raceTime - t0;
  const carried = (b.x - a.x) / TILE / secs; // tiles per second, with no key down
  note(testInfo, 'belt-carry-tiles-per-second', carried.toFixed(2));
  expect(b.x, 'still on the belt').toBeLessThan(right);
  expect(carried, 'carried right at about the belt speed').toBeGreaterThan(TUNING.beltSpeed - 0.5);
  expect(carried).toBeLessThan(TUNING.beltSpeed + 0.5);
  expect(b.grounded).toBe(true);
  expect(b.mode).toBe('run');
  await shot(page, 'belt-carried', testInfo);

  // running with it: the run speed on top of the belt
  await page.evaluate(() => { // a sampler that only READS the state every frame, so the peak is not missed between two calls
    window.__maxVx = 0;
    const f = () => { window.__maxVx = Math.max(window.__maxVx, window.__TR.state().runners[0].vx); window.__raf = requestAnimationFrame(f); };
    f();
  });
  await page.keyboard.down('ArrowRight');
  await waitFor(page, (v) => window.__maxVx >= v, TUNING.runSpeed + TUNING.beltSpeed - 0.7);
  await page.keyboard.up('ArrowRight');
  const peak = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__maxVx; });
  note(testInfo, 'belt-speed-running-with-tiles-per-second', peak);
  expect(peak, 'faster than a run on flat ground').toBeGreaterThan(TUNING.runSpeed + 1);
  await shot(page, 'belt-running-with', testInfo);
});

test('running against a conveyor belt still makes headway, slower by the belt speed', async ({ page }, testInfo) => {
  await ready(page);
  await goTo(page, CP.belt);
  const belt = gallery.obstacles[BELT];
  const left = (belt.col - belt.w / 2) * TILE;
  const right = (belt.col + belt.w / 2) * TILE;

  // run over the belt to the ground beyond its far end, then turn round and run back onto it, against it
  await holdUntil(page, 'ArrowRight', (x) => window.__TR.state().runners[0].x >= x, right + 1.5 * TILE);
  await page.keyboard.down('ArrowLeft');
  await waitFor(page, ([l, r]) => {
    const q = window.__TR.state().runners[0];
    return q.x < r - 1.5 * 48 && q.x > l + 1 * 48 && q.vx < -2 && q.grounded;
  }, [left, right]);
  await page.waitForTimeout(250); // top speed against the belt
  await shot(page, 'belt-running-against', testInfo);
  const first = await state(page); // position and time from ONE read, after the picture (taking it takes a while)
  await page.waitForTimeout(500);
  const after = await state(page);
  await page.keyboard.up('ArrowLeft');
  const rate = (first.runners[0].x - after.runners[0].x) / TILE / (after.raceTime - first.raceTime); // tiles per second to the left
  note(testInfo, 'belt-speed-running-against-tiles-per-second', rate.toFixed(2));
  expect(rate, 'makes headway against it').toBeGreaterThan(1.5);
  expect(rate, 'but slower than a run on flat ground').toBeLessThan(TUNING.runSpeed - 1);
  expect(Math.abs(rate - (TUNING.runSpeed - TUNING.beltSpeed)), 'the run speed minus the belt speed').toBeLessThan(1);
});

test('a falling tile shakes when first touched, drops 0.6 s later with the runner on it, and is back 5 s after it fell', async ({ page }, testInfo) => {
  await ready(page);
  await page.evaluate(() => window.__TR.clock(0, true)); // held: a tile cannot be touched, or time out, while the camera glides over
  await page.evaluate((n) => window.__TR.teleport(n), CP.tiles); // standing on the first tile
  await page.waitForTimeout(1200);
  await shot(page, 'tiles-before', testInfo);
  await page.evaluate(() => window.__TR.clock(0, false)); // go: the first touch starts the timer
  const floorY = 10 * TILE - (TUNING.bodyH * TILE) / 2;
  const s0 = await state(page);
  expect(s0.obstacles[TILES].tiles[0]).not.toBe('fallen');

  await waitFor(page, () => window.__TR.events().some((e) => e.type === 'tile' && e.data.phase === 'armed'));
  const armed = ofType(await log(page), 'tile').find((e) => e.data.phase === 'armed');
  expect(armed.data.i, 'the tile under the runner is the one that shakes').toBe(0);
  expect((await obstacle(page, TILES)).tiles[0]).toBe('armed');
  expect((await obstacle(page, TILES)).tiles[1], 'its neighbour is not touched').toBe('solid');
  const held = (await state(page)).raceTime;
  await page.evaluate((t) => window.__TR.clock(t, true), held); // hold it still for the picture
  await shot(page, 'tiles-shaking', testInfo);
  await page.evaluate((t) => window.__TR.clock(t, false), held);

  await waitFor(page, () => window.__TR.events().some((e) => e.type === 'tile' && e.data.phase === 'fallen'));
  const fell = ofType(await log(page), 'tile').find((e) => e.data.phase === 'fallen');
  const delay = fell.t - armed.t;
  note(testInfo, 'tile-drop-delay-seconds', delay.toFixed(2));
  expect(delay, 'drops 0.6 s after the first touch').toBeGreaterThan(TUNING.tileDropDelay - 0.08);
  expect(delay).toBeLessThan(TUNING.tileDropDelay + 0.12);

  // the runner goes down with it, to the floor of the pit
  await waitFor(page, (y) => window.__TR.state().runners[0].grounded && window.__TR.state().runners[0].y >= y - 4, floorY);
  const down = await me(page);
  expect(down.y, 'fell a tile into the pit').toBeGreaterThan(s0.runners[0].y + 0.6 * TILE);
  expect((await obstacle(page, TILES)).tiles[0]).toBe('fallen');
  await shot(page, 'tiles-fallen', testInfo);

  // climb out with the real keys (a jump and a step left), so the tile's place is free when it comes back
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.press('Space');
  await waitFor(page, ([y, x]) => { const q = window.__TR.state().runners[0]; return q.grounded && q.y < y - 0.5 * 48 && q.x <= x; }, [down.y, (gallery.obstacles[TILES].col - gallery.obstacles[TILES].count / 2 - 1.5) * TILE]);
  await page.keyboard.up('ArrowLeft');

  await waitFor(page, () => window.__TR.events().some((e) => e.type === 'tile' && e.data.phase === 'solid'), null, 12000);
  const back = ofType(await log(page), 'tile').find((e) => e.data.phase === 'solid');
  const gone = back.t - fell.t;
  note(testInfo, 'tile-seconds-gone', gone.toFixed(2));
  expect(gone, 'back 5 s after it dropped').toBeGreaterThan(TUNING.tileRespawn - 0.1);
  expect(gone).toBeLessThan(TUNING.tileRespawn + 0.5);
  expect((await obstacle(page, TILES)).tiles[0]).toBe('solid');
  await page.waitForTimeout(400); // the tile pops back in over a quarter of a second: let the picture finish
  await shot(page, 'tiles-back', testInfo);
});

test('a runner who keeps running across the tiles gets over before they fall, and they fall behind', async ({ page }, testInfo) => {
  await ready(page);
  await goTo(page, CP.belt); // two stretches before the tiles: belt, then plain ground
  const tiles = gallery.obstacles[TILES];
  const farEnd = (tiles.col + tiles.count / 2 + 1) * TILE;
  await holdUntil(page, 'ArrowRight', (x) => window.__TR.state().runners[0].x >= x && window.__TR.state().runners[0].grounded, farEnd, 15000);
  const end = await me(page);
  expect(end.y, 'on the ground at the far side, not in the pit').toBeLessThan(9.2 * TILE);
  const armedCount = ofType(await log(page), 'tile').filter((e) => e.data.phase === 'armed').length;
  note(testInfo, 'tiles-armed-while-crossing', armedCount);
  expect(armedCount, 'it touched the tiles on the way').toBeGreaterThanOrEqual(tiles.count - 1);
  // a moment later the ones it stepped on have dropped
  await waitFor(page, ([i, n]) => window.__TR.state().obstacles[i].tiles.filter((p) => p === 'fallen').length >= n, [TILES, tiles.count - 1]);
  await shot(page, 'tiles-crossed', testInfo);
});
