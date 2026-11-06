import { readFileSync } from 'node:fs';
import { test, expect, gamePage, shot } from './fixtures.js';
import { TILE, TUNING } from '../../src/logic/tuning.js';
import { pose } from '../../src/logic/obstacles.js';

// G2a: the four race-clock obstacles in the gallery course (?test=1&scene=gallery), in real browsers.
// Poses are checked against the SAME pure pose() the game uses, at the race time the game reports in the
// same call. window.__TR.clock() and teleport() are the only shortcuts: clock() holds the race clock still
// so a screenshot is "at t = 1 s" exactly, and teleport() is allowed in obstacle tests (tests/e2e/CLAUDE.md
// rule 1). The hits, the push and the ride are done with real key presses and the game's own physics.

const gallery = JSON.parse(readFileSync(new URL('../../src/game/courses/test-gallery.json', import.meta.url), 'utf8'));
const BAYS = ['spinning-bar', 'swinging-hammer', 'pusher-wall', 'moving-platform'];
const BAR = 0;
const HAMMER = 1;
const PUSHER = 2;
const PLATFORM = 3;

const state = (page) => page.evaluate(() => window.__TR.state());
const me = async (page) => (await state(page)).runners[0];
const log = (page) => page.evaluate(() => window.__TR.events());
const ofType = (events, type, from = 0) => events.filter((e) => e.type === type && e.t >= from);
const waitFor = (page, fn, arg, timeout = 10000) => page.waitForFunction(fn, arg, { timeout });
const note = (testInfo, type, value) => testInfo.annotations.push({ type, description: String(value) });
const wrap = (a) => ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;

/** Open the gallery, put the race clock back to 0 (so every test starts from the same moment) and wait for the runner. */
async function ready(page) {
  await gamePage(page, { scene: 'gallery' });
  await waitFor(page, () => {
    const s = window.__TR.state();
    return s.scene === 'race' && s.runners.length === 1 && s.runners[0].grounded && s.obstacles.length === 4;
  });
  await page.evaluate(() => window.__TR.clock(0, false));
}

const teleport = async (page, i) => {
  await page.evaluate((n) => window.__TR.teleport(n), i);
  await waitFor(page, () => window.__TR.state().runners[0].grounded);
};

/** Check every obstacle in a state against the pure pose() at the state's own race time. */
function expectPoses(s) {
  expect(s.obstacles.map((o) => o.type)).toEqual(gallery.obstacles.map((o) => o.type));
  s.obstacles.forEach((o, i) => {
    const want = pose(o.type, gallery.obstacles[i], s.raceTime);
    expect(Math.abs(o.x - want.x * TILE), `${o.type} x at t=${s.raceTime}`).toBeLessThan(1);
    expect(Math.abs(o.y - want.y * TILE), `${o.type} y at t=${s.raceTime}`).toBeLessThan(1);
    expect(Math.abs(wrap(o.angle - want.angle)), `${o.type} angle at t=${s.raceTime}`).toBeLessThan(0.01);
  });
}

test('each obstacle sits where pose(t) says at t = 0, 1 and 2 s, and the picture changes between them', async ({ page }, testInfo) => {
  await ready(page);
  for (let bay = 0; bay < BAYS.length; bay++) {
    await page.evaluate(() => window.__TR.clock(0, true)); // every obstacle back at its t = 0 pose BEFORE the runner arrives, so nothing is in the way
    await teleport(page, bay);
    await page.waitForTimeout(1200); // the camera glides to the runner after a teleport: let it arrive, so only the obstacle can change the picture
    const pictures = [];
    for (const t of [0, 1, 2]) {
      await page.evaluate((time) => window.__TR.clock(time, true), t);
      await page.waitForTimeout(150); // a few frames, so the picture has been drawn at this time
      const s = await state(page);
      expect(s.raceTime).toBeCloseTo(t, 6);
      expectPoses(s);
      pictures.push(await page.screenshot());
      await shot(page, `${BAYS[bay]}-t${t}`, testInfo);
    }
    expect(pictures[0].equals(pictures[1]), `${BAYS[bay]}: the picture at t=1 differs from t=0`).toBe(false);
    expect(pictures[1].equals(pictures[2]), `${BAYS[bay]}: the picture at t=2 differs from t=1`).toBe(false);
    expect(pictures[0].equals(pictures[2]), `${BAYS[bay]}: the picture at t=2 differs from t=0`).toBe(false);
  }
});

test('while the race clock runs, every obstacle keeps following pose(t) (no shortcut)', async ({ page }, testInfo) => {
  await ready(page);
  const seen = [];
  for (let i = 0; i < 6; i++) {
    const s = await state(page);
    expectPoses(s);
    seen.push(s);
    await page.waitForTimeout(400);
  }
  expect(seen[5].raceTime, 'the clock ran').toBeGreaterThan(seen[0].raceTime + 1.5);
  const moved = (k) => new Set(seen.map((s) => `${s.obstacles[k].x.toFixed(1)},${s.obstacles[k].y.toFixed(1)},${s.obstacles[k].angle.toFixed(2)}`)).size;
  for (let k = 0; k < 4; k++) expect(moved(k), `${BAYS[k]} moved`).toBeGreaterThan(2);
  note(testInfo, 'clock-seconds-in-this-test', (seen[5].raceTime - seen[0].raceTime).toFixed(2));
  await shot(page, 'running', testInfo);
});

test('a running clock that is still below 0 (the countdown) leaves every obstacle at its t = 0 pose', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.__TR.clock(-2, false)); // running, not held: the clamp in pose() is what keeps them still
  const samples = [];
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(250);
    samples.push(await state(page));
  }
  const at0 = gallery.obstacles.map((o) => pose(o.type, o, 0));
  for (const s of samples) {
    expect(s.raceTime, 'still counting down').toBeLessThan(0);
    s.obstacles.forEach((o, i) => {
      expect(Math.abs(o.x - at0[i].x * TILE), `${o.type} x at t=${s.raceTime}`).toBeLessThan(1);
      expect(Math.abs(o.y - at0[i].y * TILE), `${o.type} y at t=${s.raceTime}`).toBeLessThan(1);
      expect(Math.abs(wrap(o.angle - at0[i].angle)), `${o.type} angle at t=${s.raceTime}`).toBeLessThan(0.01);
    });
  }
  expect(samples[3].raceTime, 'the clock did run').toBeGreaterThan(samples[0].raceTime + 0.5);
});

/** Walk right with the real keys until x reaches `stopAtTile` or something hits us, then let go and wait for a hit. */
async function walkIntoAndGetHit(page, bay, stopAtTile, by) {
  await teleport(page, bay);
  const before = await me(page);
  await page.keyboard.down('ArrowRight');
  await waitFor(page, (stop) => window.__TR.state().runners[0].x >= stop * 48 || window.__TR.events().some((e) => e.type === 'hit'), stopAtTile);
  await page.keyboard.up('ArrowRight');
  await waitFor(page, () => window.__TR.events().some((e) => e.type === 'hit'));
  const events = await log(page);
  const hit = ofType(events, 'hit')[0];
  expect(hit.data.by).toBe(by);
  return { before, hit, events };
}

for (const [name, bay, stopAtTile, by] of [
  ['a spinning bar', BAR, 5.4, 'spinning-bar'],
  ['a swinging hammer', HAMMER, 15.4, 'swinging-hammer'],
]) {
  test(`${name} hits a runner who walks into it: a real contact, a tumble the way it was moving, then spring-up and run`, async ({ page }, testInfo) => {
    await ready(page);
    const { hit, events } = await walkIntoAndGetHit(page, bay, stopAtTile, by);
    note(testInfo, `${by}-hit-direction`, hit.data.dir);

    // the hit started the tumble, in the same physics step
    const tumble = ofType(events, 'tumble', hit.t)[0];
    expect(tumble, 'a tumble follows the hit').toBeTruthy();
    expect(tumble.t - hit.t).toBeLessThan(0.05);
    expect([-1, 1]).toContain(hit.data.dir);
    await shot(page, `${by}-hit`, testInfo);

    // thrown a good way in the direction of the hit (the feel target is 4-6 tiles; air time and drag decide the rest)
    const xHit = hit.data.x;
    await waitFor(page, () => window.__TR.state().runners[0].mode === 'run' && window.__TR.events().some((e) => e.type === 'spring'));
    const after = await me(page);
    const flown = ((after.x / TILE) - xHit) * hit.data.dir;
    note(testInfo, `${by}-tiles-thrown`, flown.toFixed(2));
    expect(flown, 'thrown in the direction of the hit').toBeGreaterThan(2.5);
    expect(after.mode).toBe('run');
    await shot(page, `${by}-after`, testInfo);

    // one hit, not a chain, over the next 1.2 s (a fixed time, not the tuning number under test). That the immunity
    // gate itself works is pinned by the hitOnContact unit tests; this only shows a real swing does not re-tumble.
    await waitFor(page, (until) => window.__TR.state().raceTime >= until, hit.t + 1.3);
    const later = await log(page);
    expect(ofType(later, 'hit', hit.t).filter((e) => e.t <= hit.t + 1.2).length, 'only one hit in the 1.2 s after the first').toBe(1);
  });
}

test('a pusher wall pushes a runner who stands in its way, without tumbling them', async ({ page }, testInfo) => {
  await ready(page);
  await page.evaluate(() => window.__TR.clock(0, true)); // held at t = 0 while the camera arrives, so the wall has not reached the runner yet
  await teleport(page, PUSHER);
  await page.waitForTimeout(1200);
  const start = await me(page);
  expect(Math.abs((await state(page)).obstacles[PUSHER].x - gallery.obstacles[PUSHER].col * TILE), 'the wall waits at its rest place').toBeLessThan(1);
  await shot(page, 'pusher-before', testInfo);
  await page.evaluate(() => window.__TR.clock(0, false)); // go
  await waitFor(page, (x0) => window.__TR.state().runners[0].x <= x0 - 1.0 * 48, start.x, 12000);
  const s = await state(page); // one read, so the runner and the wall are from the same moment
  const pushed = s.runners[0];
  note(testInfo, 'pusher-tiles-pushed', ((start.x - pushed.x) / TILE).toFixed(2));
  await shot(page, 'pusher-pushing', testInfo);
  const wall = s.obstacles[PUSHER];
  expect(pushed.x + (TUNING.bodyW * TILE) / 2, 'the runner is in front of the wall, not inside it').toBeLessThan(wall.x - (gallery.obstacles[PUSHER].w * TILE) / 2 + 6);
  expect(ofType(await log(page), 'tumble'), 'a pusher pushes, it does not tumble').toHaveLength(0);
  expect(pushed.mode).toBe('run');
});

test('a moving platform carries a runner who stands still on it, and they can jump from it', async ({ page }, testInfo) => {
  await ready(page);
  await page.evaluate(() => window.__TR.clock(0, true)); // held at t = 0 while the runner drops onto the platform and the camera arrives
  await teleport(page, PLATFORM);
  await page.waitForTimeout(1200);
  const s0 = await state(page);
  const offset0 = s0.runners[0].x - s0.obstacles[PLATFORM].x;
  await shot(page, 'platform-start', testInfo);
  expect(s0.runners[0].grounded).toBe(true);
  expect(Math.abs(offset0) / TILE, 'standing on the platform, not beside it').toBeLessThan(1.1);
  await page.evaluate(() => window.__TR.clock(0, false)); // go

  // no keys at all: the platform does the moving. Wait until IT has moved a good way (not until a fixed clock
  // time, which depends on how long the page took to load), then the runner must have moved with it.
  await waitFor(page, (p0) => Math.abs(window.__TR.state().obstacles[3].x - p0) >= 1.5 * 48, s0.obstacles[PLATFORM].x, 12000);
  const s1 = await state(page);
  const r1 = s1.runners[0];
  const platformMoved = (s1.obstacles[PLATFORM].x - s0.obstacles[PLATFORM].x) / TILE;
  const travelled = (r1.x - s0.runners[0].x) / TILE;
  note(testInfo, 'platform-tiles-carried', travelled.toFixed(2));
  expect(Math.abs(platformMoved), 'the platform moved').toBeGreaterThanOrEqual(1.5);
  expect(travelled / platformMoved, 'carried along with the platform, the same way and nearly the same distance').toBeGreaterThan(0.8);
  expect(Math.abs(r1.x - s1.obstacles[PLATFORM].x - offset0) / TILE, 'still in the same place on the platform').toBeLessThan(0.35);
  expect(r1.grounded).toBe(true);
  expect(r1.mode).toBe('run');
  expect(Math.abs(r1.y - s0.runners[0].y), 'did not sink or bounce off (px)').toBeLessThan(8);
  await shot(page, 'platform-carried', testInfo);

  // a real jump from the moving platform: a full-height one (the platform neither cancels nor cuts it short)
  await page.keyboard.press('Space');
  await waitFor(page, () => window.__TR.events().some((e) => e.type === 'jump'));
  await waitFor(page, () => !window.__TR.state().runners[0].grounded);
  await shot(page, 'platform-jumped', testInfo);
  await waitFor(page, () => window.__TR.events().some((e) => e.type === 'land'));
  const land = ofType(await log(page), 'land')[0];
  note(testInfo, 'platform-jump-rise-tiles', land.data.rise);
  expect(land.data.rise, 'a normal jump height').toBeGreaterThan(1.5);
  expect(land.data.air, 'in the air for a normal jump time').toBeGreaterThan(0.5);
});
