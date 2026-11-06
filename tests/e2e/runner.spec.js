import { test, expect, gamePage, shot } from './fixtures.js';
import { TUNING, TILE, jumpApex } from '../../src/logic/tuning.js';

// G1: the runner on the flat test course, driven by real key presses (tests/e2e/CLAUDE.md rule 1).
// Durations come from the game's own physics clock (events carry t in fixed-step seconds), not the
// wall clock, so a slow CI frame cannot make them flaky. window.__TR.hit() is the only shortcut: it
// stands in for a hammer (from before G2a built real ones), and calls the same Runner.hit() a hammer's contact calls.

const GAP = 2 + TUNING.bodyW; // a two-tile gap plus the body width: the feet must land past it

const state = (page) => page.evaluate(() => window.__TR.state());
const me = async (page) => (await state(page)).runners[0];
const log = (page) => page.evaluate(() => window.__TR.events());
const ofType = (events, type, from = 0) => events.filter((e) => e.type === type && e.t >= from);
const waitFor = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout });
const note = (testInfo, type, value) => testInfo.annotations.push({ type, description: String(value) });

async function ready(page) {
  await gamePage(page, { scene: 'flat' });
  await waitFor(page, () => {
    const s = window.__TR.state();
    return s.scene === 'race' && s.runners.length === 1 && s.runners[0].grounded;
  });
}

/** Hold a key until the runner is at top speed (in the given direction), then return the state. */
async function runUpToSpeed(page, key, dir) {
  await page.keyboard.down(key);
  await waitFor(page, ([top, d]) => window.__TR.state().runners[0].vx * d >= top * 0.99, [TUNING.runSpeed, dir]);
}

test('runs right and left with the arrows and with A/D, and stops when you let go', async ({ page }, testInfo) => {
  await ready(page);
  const start = await me(page);
  expect(start.mode).toBe('run');
  expect(Math.abs(start.vx)).toBeLessThan(0.05);
  await shot(page, 'start', testInfo);

  const t0 = (await state(page)).raceTime;
  await page.keyboard.down('ArrowRight');
  await waitFor(page, (top) => window.__TR.state().runners[0].vx >= top * 0.95, TUNING.runSpeed);
  const toTop = (await state(page)).raceTime - t0;
  note(testInfo, 'seconds-to-top-speed', toTop.toFixed(2));
  expect(toTop, 'top speed in about a quarter of a second').toBeLessThan(0.5);

  await page.waitForTimeout(500);
  await shot(page, 'running-right', testInfo); // before reading `mid`: the skid below is measured from the moment of letting go
  const mid = await me(page);
  expect(mid.vx).toBeGreaterThan(TUNING.runSpeed * 0.95);
  expect(mid.vx).toBeLessThan(TUNING.runSpeed + 0.2);
  expect(mid.x - start.x, 'moved right').toBeGreaterThan(3 * TILE);
  expect(mid.grounded).toBe(true);

  const tRelease = (await state(page)).raceTime;
  await page.keyboard.up('ArrowRight');
  await waitFor(page, () => Math.abs(window.__TR.state().runners[0].vx) < 0.05);
  const stopped = await me(page);
  const stopTime = (await state(page)).raceTime - tRelease;
  note(testInfo, 'seconds-to-stop', stopTime.toFixed(2));
  expect(stopTime).toBeLessThan(0.5);
  // the skid is 6.5^2 / (2 * 45) = 0.47 tiles; the rest is the two reads either side of the key-up
  expect((stopped.x - mid.x) / TILE, 'a short skid, not a slide').toBeLessThan(1);
  expect(stopped.facing).toBe(1);
  await shot(page, 'stopped', testInfo);

  await runUpToSpeed(page, 'a', -1);
  const left = await me(page);
  expect(left.vx).toBeLessThan(-TUNING.runSpeed * 0.95);
  expect(left.x).toBeLessThan(stopped.x);
  expect(left.facing).toBe(-1);
  await page.keyboard.up('a');
  await waitFor(page, () => Math.abs(window.__TR.state().runners[0].vx) < 0.05);

  await runUpToSpeed(page, 'd', 1);
  expect((await me(page)).vx).toBeGreaterThan(TUNING.runSpeed * 0.95);
  await page.keyboard.up('d');
  await runUpToSpeed(page, 'ArrowLeft', -1);
  await shot(page, 'running-left', testInfo);
  await page.keyboard.up('ArrowLeft');
});

test('jumps with Space, Up and W: about two tiles high, once per press, and holding the key does not re-jump', async ({ page }, testInfo) => {
  await ready(page);
  const start = await me(page);

  await page.keyboard.press('Space'); // a very short tap must still count
  await waitFor(page, () => {
    const r = window.__TR.state().runners[0];
    return !r.grounded && r.vy < 0;
  });
  await shot(page, 'jumping', testInfo); // best effort: the runner is rising for about a third of a second
  await waitFor(page, () => window.__TR.events().some((e) => e.type === 'land'));
  let events = await log(page);
  expect(ofType(events, 'jump')).toHaveLength(1);
  const land = ofType(events, 'land')[0].data;
  note(testInfo, 'jump-rise-tiles', land.rise);
  note(testInfo, 'jump-air-seconds', land.air);
  expect(land.rise, 'about two tiles high').toBeGreaterThan(jumpApex() - 0.35);
  expect(land.rise).toBeLessThan(jumpApex() + 0.15);
  expect(land.air, 'about 0.7 s in the air').toBeGreaterThan(0.55);
  expect(land.air).toBeLessThan(0.85);
  expect(Math.abs(land.dx), 'straight up and down').toBeLessThan(0.2);
  const after = await me(page);
  expect(after.grounded).toBe(true);
  expect(Math.abs(after.y - start.y), 'lands where it took off').toBeLessThan(3);

  // mid-air: a second press does nothing
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowUp');
  await waitFor(page, () => window.__TR.events().filter((e) => e.type === 'land').length >= 2);
  events = await log(page);
  expect(ofType(events, 'jump'), 'one jump for two presses in the air').toHaveLength(2);
  await shot(page, 'after-jumps', testInfo);

  await page.keyboard.press('w');
  await waitFor(page, () => window.__TR.events().filter((e) => e.type === 'land').length >= 3);

  // hold the key through a landing: still only one more jump
  await page.keyboard.down('Space');
  await waitFor(page, () => window.__TR.events().filter((e) => e.type === 'land').length >= 4);
  await page.waitForTimeout(400);
  await shot(page, 'holding-space', testInfo);
  await page.keyboard.up('Space');
  events = await log(page);
  expect(ofType(events, 'jump')).toHaveLength(4);
});

test('a running jump clears a two-tile gap, a jump from a standstill does not', async ({ page }, testInfo) => {
  await ready(page);

  // standing still: Space and a direction at the same moment, then keep steering in the air.
  // The unit test and the smoke check hold this to under 2 tiles (the gap itself); here the two key-downs are
  // separate browser calls that can land a frame apart, so the bound is the gap plus the body width instead.
  await Promise.all([page.keyboard.down('Space'), page.keyboard.down('ArrowRight')]);
  await waitFor(page, () => window.__TR.events().some((e) => e.type === 'land'));
  await page.keyboard.up('Space');
  await page.keyboard.up('ArrowRight');
  let events = await log(page);
  const standing = ofType(events, 'land')[0].data.dx;
  note(testInfo, 'standing-jump-tiles', standing);
  expect(standing, 'cannot cross the gap from a standstill').toBeLessThan(GAP);
  await waitFor(page, () => Math.abs(window.__TR.state().runners[0].vx) < 0.05);

  // at full speed
  await runUpToSpeed(page, 'ArrowRight', 1);
  await page.keyboard.press('Space');
  await waitFor(page, () => window.__TR.events().filter((e) => e.type === 'land').length >= 2);
  await shot(page, 'after-running-jump', testInfo);
  await page.keyboard.up('ArrowRight');
  events = await log(page);
  const running = ofType(events, 'land')[1].data.dx;
  note(testInfo, 'running-jump-tiles', running);
  expect(running, 'clears the gap at full speed, with room to spare').toBeGreaterThan(GAP + 1);
});

test('Shift dives about three tiles forward from a run, then you run again', async ({ page }, testInfo) => {
  await ready(page);
  await runUpToSpeed(page, 'ArrowRight', 1);
  await page.keyboard.press('Shift');
  await waitFor(page, () => window.__TR.events().some((e) => e.type === 'dive'));
  await shot(page, 'diving', testInfo); // best effort: a dive is over in 0.28 s
  await waitFor(page, () => {
    const ev = window.__TR.events();
    const d = ev.findIndex((e) => e.type === 'dive');
    return d >= 0 && ev.slice(d).some((e) => e.type === 'run');
  });
  const events = await log(page);
  const dive = ofType(events, 'dive')[0];
  const back = ofType(events, 'run', dive.t)[0];
  const dist = back.data.x - dive.data.x;
  note(testInfo, 'dive-tiles', dist.toFixed(2));
  note(testInfo, 'dive-seconds', (back.t - dive.t).toFixed(2));
  expect(dist, 'about three tiles').toBeGreaterThan(2.5);
  expect(dist).toBeLessThan(4.2);
  expect(back.t - dive.t).toBeGreaterThan(TUNING.diveTime - 0.05);
  expect(back.t - dive.t).toBeLessThan(TUNING.diveTime + 0.1);
  await page.keyboard.up('ArrowRight');
  await waitFor(page, () => Math.abs(window.__TR.state().runners[0].vx) < 0.05);
  expect((await me(page)).mode).toBe('run');
  await shot(page, 'after-dive', testInfo);
});

test('a big hit tumbles the runner for 0.8 s, then it springs back upright and runs again', async ({ page }, testInfo) => {
  await ready(page);
  const before = await me(page);
  await page.evaluate(() => window.__TR.hit(1));
  await waitFor(page, () => Math.abs(window.__TR.state().runners[0].angle) > 0.6);
  const tumbling = await me(page);
  expect(tumbling.mode).toBe('tumble');
  await shot(page, 'tumbling', testInfo);

  // A jump press is ignored while tumbling. It must land while the runner is on the ground (the hit throws it
  // into the air first, where a press could not jump anyway), so wait for the landing inside the tumble.
  await waitFor(page, () => {
    const r = window.__TR.state().runners[0];
    return r.mode === 'tumble' && r.grounded;
  });
  await page.keyboard.press('Space');

  await waitFor(page, () => {
    const ev = window.__TR.events();
    const t = ev.findIndex((e) => e.type === 'tumble');
    return t >= 0 && ev.slice(t).some((e) => e.type === 'run');
  });
  const events = await log(page);
  const tumble = ofType(events, 'tumble')[0];
  const spring = ofType(events, 'spring', tumble.t)[0];
  const run = ofType(events, 'run', spring.t)[0];
  note(testInfo, 'tumble-seconds', (spring.t - tumble.t).toFixed(2));
  note(testInfo, 'spring-seconds', (run.t - spring.t).toFixed(2));
  expect(spring.t - tumble.t).toBeGreaterThan(TUNING.tumbleTime - 0.05);
  expect(spring.t - tumble.t).toBeLessThan(TUNING.tumbleTime + 0.1);
  expect(run.t - spring.t).toBeGreaterThan(TUNING.springTime - 0.05);
  expect(run.t - spring.t).toBeLessThan(TUNING.springTime + 0.1);
  expect(ofType(events, 'jump', tumble.t).filter((e) => e.t < run.t), 'no jumping while tumbling').toHaveLength(0);

  const dist = run.data.x - tumble.data.x;
  note(testInfo, 'tumble-tiles', dist.toFixed(2));
  expect(dist, 'sent about four to six tiles').toBeGreaterThan(3.5);
  expect(dist).toBeLessThan(6.5);

  await waitFor(page, () => window.__TR.state().runners[0].grounded);
  const after = await me(page);
  expect(after.mode).toBe('run');
  expect(Math.abs(after.angle), 'upright again').toBeLessThan(0.02);
  expect(after.x, 'flew to the right').toBeGreaterThan(before.x + 3 * TILE);
  await shot(page, 'upright-again', testInfo);

  // a hit from the other side sends it the other way
  const x1 = after.x;
  await page.evaluate(() => window.__TR.hit(-1));
  await waitFor(page, () => window.__TR.events().filter((e) => e.type === 'run').length >= 2);
  expect((await me(page)).x, 'flew to the left').toBeLessThan(x1 - 3 * TILE);
});

test('Shift while tumbling gets you up much faster than waiting', async ({ page }, testInfo) => {
  await ready(page);
  await page.evaluate(() => window.__TR.hit(1));
  await waitFor(page, () => Math.abs(window.__TR.state().runners[0].angle) > 0.3);
  await page.keyboard.press('Shift');
  await waitFor(page, () => {
    const ev = window.__TR.events();
    const t = ev.findIndex((e) => e.type === 'tumble');
    return t >= 0 && ev.slice(t).some((e) => e.type === 'run');
  });
  const events = await log(page);
  const tumble = ofType(events, 'tumble')[0];
  const run = ofType(events, 'run', tumble.t)[0];
  const upIn = run.t - tumble.t;
  note(testInfo, 'dive-recover-seconds', upIn.toFixed(2));
  expect(ofType(events, 'dive', tumble.t)).toHaveLength(1);
  expect(upIn, 'well under the 1.05 s of waiting').toBeLessThan(0.7);
  await waitFor(page, () => window.__TR.state().runners[0].grounded);
  const after = await me(page);
  expect(after.mode).toBe('run');
  expect(Math.abs(after.angle)).toBeLessThan(0.02);
  await shot(page, 'dive-recovered', testInfo);
});

test('the physics clock runs at wall-clock speed (60 steps a second, whatever the screen)', async ({ page }, testInfo) => {
  // Every duration above is measured in this clock, so a wrong step rate would shift them all together and
  // still pass. This is the one check that ties the clock to real time.
  await ready(page);
  const { wall, sim } = await page.evaluate(
    () => new Promise((resolve) => {
      const t0 = performance.now();
      const s0 = window.__TR.state().raceTime;
      setTimeout(() => resolve({ wall: (performance.now() - t0) / 1000, sim: window.__TR.state().raceTime - s0 }), 2000);
    }),
  );
  note(testInfo, 'physics-seconds-per-wall-second', (sim / wall).toFixed(3));
  expect(sim / wall).toBeGreaterThan(0.85);
  expect(sim / wall).toBeLessThan(1.15);
});
