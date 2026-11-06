import { describe, it, expect } from 'vitest';
import { TUNING, STEP, jumpApex, jumpAirTime } from '../../../src/logic/tuning.js';
import { newRunnerState, stepRunner, stepRunnerOn, applyHit, canBeHit, NO_INTENT } from '../../../src/logic/runner.js';
import { simulate } from '../../../src/logic/runnerSim.js';

const RIGHT = { ...NO_INTENT, right: true };
const LEFT = { ...NO_INTENT, left: true };
const at = (events, type, from = 0) => events.find((e) => e.type === type && e.t >= from);
const last = (trace) => trace[trace.length - 1];

describe('running', () => {
  it('reaches top speed in about a quarter of a second and never goes over it', () => {
    const { trace } = simulate({ seconds: 1, intentAt: () => RIGHT });
    const reach = trace.find((s) => s.vx >= 0.95 * TUNING.runSpeed);
    expect(reach.t).toBeGreaterThan(0.15);
    expect(reach.t).toBeLessThanOrEqual(0.3);
    expect(Math.max(...trace.map((s) => s.vx))).toBeLessThanOrEqual(TUNING.runSpeed + 1e-9);
  });

  it('stops quickly when the keys are released', () => {
    const { trace } = simulate({ seconds: 1.2, intentAt: (i) => (i < 60 ? RIGHT : NO_INTENT) });
    const stopped = trace.find((s) => s.i >= 60 && s.vx === 0);
    expect(stopped.t - 1).toBeLessThan(0.2);
  });

  it('runs left as well, and turning round brakes harder than speeding up', () => {
    const { trace } = simulate({ seconds: 1.5, intentAt: (i) => (i < 60 ? RIGHT : LEFT) });
    expect(last(trace).vx).toBeCloseTo(-TUNING.runSpeed, 6);
    const turned = trace.find((s) => s.i >= 60 && s.vx <= 0);
    expect(turned.t - 1).toBeLessThan(TUNING.runSpeed / TUNING.runDecel + 0.05);
  });

  it('has only a quarter of the control in the air', () => {
    const grounded = stepRunner(newRunnerState(), RIGHT, { vx: 0, vy: 0, grounded: true });
    const airborne = stepRunner(newRunnerState(), RIGHT, { vx: 0, vy: 0, grounded: false });
    expect(airborne.vx / grounded.vx).toBeCloseTo(TUNING.airAccelFactor, 6);
  });

  it('remembers which way it faces when no key is held', () => {
    const r = stepRunner(newRunnerState(1), LEFT, { vx: 0, vy: 0, grounded: true });
    expect(r.state.facing).toBe(-1);
    const r2 = stepRunner(r.state, NO_INTENT, { vx: -2, vy: 0, grounded: true });
    expect(r2.state.facing).toBe(-1);
  });
});

describe('jumping', () => {
  const jumpAt = (n) => (i) => ({ ...RIGHT, jump: i >= n && i < n + 6 });

  it('only launches from the ground, and holding the key does not re-jump on landing', () => {
    const { events } = simulate({ seconds: 3, intentAt: () => ({ ...NO_INTENT, jump: true }) });
    expect(events.filter((e) => e.type === 'jump')).toHaveLength(1);
  });

  it('cannot jump again in mid-air', () => {
    const press = (i) => ({ ...NO_INTENT, jump: i === 0 || i === 3 || i === 10 || i === 20 });
    const { events } = simulate({ seconds: 0.5, intentAt: press });
    expect(events.filter((e) => e.type === 'jump')).toHaveLength(1);
  });

  it('rises about two tiles and stays up about 0.7 s', () => {
    const { trace, events } = simulate({ seconds: 1.5, intentAt: (i) => ({ ...NO_INTENT, jump: i === 5 }) });
    const rise = -Math.min(...trace.map((s) => s.y));
    expect(rise).toBeGreaterThan(jumpApex() - 0.15);
    expect(rise).toBeLessThan(jumpApex() + 0.05);
    const up = at(events, 'jump').t;
    const down = trace.find((s) => s.t > up + 0.1 && s.y === 0).t;
    expect(down - up).toBeGreaterThan(jumpAirTime() - 0.05);
    expect(down - up).toBeLessThan(jumpAirTime() + 0.05);
  });

  it('clears a two-tile gap at full speed but not from a standstill', () => {
    const GAP = 2 + TUNING.bodyW; // a gap plus the body width: the feet must land past it
    const running = simulate({ seconds: 3, intentAt: jumpAt(60) }); // run for 1 s, then jump
    const takeoff = at(running.events, 'jump');
    const land = running.trace.find((s) => s.t > takeoff.t + 0.1 && s.y === 0);
    expect(land.x - takeoff.x).toBeGreaterThan(GAP);

    const standing = simulate({ seconds: 2, intentAt: (i) => ({ ...RIGHT, jump: i === 0 }) });
    const t2 = at(standing.events, 'jump');
    const l2 = standing.trace.find((s) => s.t > t2.t + 0.1 && s.y === 0);
    // strictly under the two-tile gap itself (not gap + body): anything over 2 tiles would already cross it
    expect(l2.x - t2.x).toBeLessThan(2);
  });
});

describe('diving', () => {
  const diveAt = (n) => (i) => ({ ...RIGHT, dive: i >= n && i < n + 4 });

  it('lunges about three tiles forward and then goes back to running', () => {
    const { events } = simulate({ seconds: 2, intentAt: diveAt(60) });
    const d = at(events, 'dive');
    const back = at(events, 'run', d.t);
    expect(back.t - d.t).toBeCloseTo(TUNING.diveTime, 1);
    expect(back.x - d.x).toBeGreaterThan(2.5);
    expect(back.x - d.x).toBeLessThan(3.8);
  });

  it('dives the way you face even with no key held, and works in the air', () => {
    const { events, trace } = simulate({
      seconds: 1,
      start: { facing: -1 },
      intentAt: (i) => ({ ...NO_INTENT, jump: i === 0, dive: i === 10 }),
    });
    const d = at(events, 'dive');
    expect(d).toBeDefined();
    expect(trace.find((s) => s.t > d.t + 0.05).vx).toBeLessThan(-TUNING.diveSpeed + 0.01);
  });

  it('ignores a second dive until the cooldown has passed', () => {
    const { events } = simulate({ seconds: 1.5, intentAt: (i) => ({ ...RIGHT, dive: i % 12 < 6 && i < 36 }) });
    const dives = events.filter((e) => e.type === 'dive');
    expect(dives.length).toBeGreaterThanOrEqual(1);
    for (let k = 1; k < dives.length; k++) expect(dives[k].t - dives[k - 1].t).toBeGreaterThanOrEqual(TUNING.diveCooldown - 1e-6);
  });
});

describe('tumbling', () => {
  const hit = (dir = 1, step = 60) => [{ step, dir }];

  it('a big hit tumbles for 0.8 s, springs up for 0.25 s, then runs again', () => {
    const { events } = simulate({ seconds: 3, intentAt: () => NO_INTENT, hits: hit() });
    const tumble = at(events, 'tumble');
    const spring = at(events, 'spring', tumble.t);
    const run = at(events, 'run', spring.t);
    expect(spring.t - tumble.t).toBeCloseTo(TUNING.tumbleTime, 1);
    expect(run.t - spring.t).toBeCloseTo(TUNING.springTime, 1);
  });

  it('sends the runner about four to six tiles in the direction of the hit', () => {
    for (const dir of [1, -1]) {
      const { events } = simulate({ seconds: 3, intentAt: () => NO_INTENT, hits: hit(dir) });
      const tumble = at(events, 'tumble');
      const run = at(events, 'run', tumble.t);
      const dist = (run.x - tumble.x) * dir;
      expect(dist).toBeGreaterThan(3.5);
      expect(dist).toBeLessThan(6.5);
    }
  });

  it('ignores a fresh jump press while tumbling on the ground', () => {
    // lift 0 keeps the runner on the floor, so only the tumble can be what stops the jump
    const onGround = [{ step: 0, dir: 1, lift: 0 }];
    const presses = (i) => ({ ...NO_INTENT, jump: i === 10 || i === 20 });
    const tumbling = simulate({ seconds: 1.2, hits: onGround, intentAt: presses });
    expect(tumbling.trace[10].grounded, 'the press must land while grounded or this proves nothing').toBe(true);
    expect(tumbling.trace[10].mode).toBe('tumble');
    expect(tumbling.events.filter((e) => e.type === 'jump')).toHaveLength(0);
    // the same presses without a hit do jump, so the test can fail
    const free = simulate({ seconds: 1.2, intentAt: presses });
    expect(free.events.filter((e) => e.type === 'jump').length).toBeGreaterThan(0);
  });

  it('ignores a fresh jump press while springing up, and jumps again once running', () => {
    const { events, trace } = simulate({
      seconds: 2,
      hits: [{ step: 0, dir: 1, lift: 0 }],
      intentAt: (i) => ({ ...NO_INTENT, jump: i === 52 || i === 70 }), // 52 is inside the spring (steps 48-63), 70 is after it
    });
    expect(trace[52].mode).toBe('spring');
    expect(trace[52].grounded).toBe(true);
    const jumps = events.filter((e) => e.type === 'jump');
    expect(jumps).toHaveLength(1);
    expect(jumps[0].t).toBeCloseTo(70 / 60, 2);
  });

  it('a hit during a dive ends the dive and tumbles', () => {
    const { events } = simulate({
      seconds: 3,
      intentAt: (i) => ({ ...RIGHT, dive: i >= 60 && i < 64 }),
      hits: [{ step: 66, dir: -1 }],
    });
    expect(events.map((e) => e.type)).toEqual(['dive', 'tumble', 'spring', 'run']);
  });

  it('a hit during the spring-up tumbles again for the full time', () => {
    const { events } = simulate({ seconds: 4, hits: [{ step: 0, dir: 1 }, { step: 52, dir: 1 }] });
    // the first tumble springs at step 48, the second hit lands at step 52 inside that spring
    expect(events.map((e) => e.type)).toEqual(['tumble', 'spring', 'tumble', 'spring', 'run']);
    const second = events.filter((e) => e.type === 'tumble')[1];
    expect(at(events, 'spring', second.t).t - second.t).toBeCloseTo(TUNING.tumbleTime, 1);
  });

  it('refuses the get-up dive while the dive is cooling down, and allows it afterwards', () => {
    const script = (diveStep) => (i) => ({ ...NO_INTENT, dive: i === 0 || i === diveStep });
    // dive at step 0 (cooldown 0.6 s = 36 steps), hit at step 10
    const early = simulate({ seconds: 3, intentAt: script(20), hits: [{ step: 10, dir: 1 }] });
    expect(early.events.filter((e) => e.type === 'dive')).toHaveLength(1); // the step-20 press was refused
    expect(at(early.events, 'run', at(early.events, 'tumble').t).t - at(early.events, 'tumble').t).toBeGreaterThan(TUNING.tumbleTime);
    const late = simulate({ seconds: 3, intentAt: script(45), hits: [{ step: 10, dir: 1 }] });
    expect(late.events.filter((e) => e.type === 'dive')).toHaveLength(2); // the step-45 press got up
    // the dive came 0.58 s into the tumble: up 0.25 s later, sooner than the 1.05 s of waiting
    const upIn = at(late.events, 'run', at(late.events, 'tumble').t).t - at(late.events, 'tumble').t;
    expect(upIn).toBeLessThan(TUNING.tumbleTime + TUNING.springTime - 0.1);
    expect(upIn).toBeGreaterThan(0.58);
  });

  it('a dive keeps the way it started even if you steer the other way mid-lunge', () => {
    const { trace, events } = simulate({
      seconds: 2,
      intentAt: (i) => ({ right: i < 62, left: i >= 62, dive: i >= 60 && i < 64 }),
    });
    const d = at(events, 'dive');
    const during = trace.filter((s) => s.t > d.t && s.t <= d.t + TUNING.diveTime - 0.02);
    expect(during.length).toBeGreaterThan(5);
    for (const s of during) expect(s.vx).toBeCloseTo(TUNING.diveSpeed, 6);
  });

  it('a dive while tumbling gets you up much sooner than waiting', () => {
    const waited = simulate({ seconds: 3, intentAt: () => NO_INTENT, hits: hit(1, 0) });
    const dived = simulate({ seconds: 3, intentAt: (i) => ({ ...NO_INTENT, dive: i >= 10 && i < 14 }), hits: hit(1, 0) });
    const wait = at(waited.events, 'run', at(waited.events, 'tumble').t).t;
    const fast = at(dived.events, 'run', at(dived.events, 'tumble').t).t;
    expect(wait).toBeGreaterThan(TUNING.tumbleTime + TUNING.springTime - 0.05);
    expect(fast).toBeLessThan(0.4 + TUNING.springTime);
    expect(fast).toBeLessThan(wait - 0.4);
    expect(at(dived.events, 'dive')).toBeDefined();
  });

  it('slows down while tumbling (drag) and can be hit again to restart the tumble', () => {
    const { events } = simulate({ seconds: 3, intentAt: () => NO_INTENT, hits: [{ step: 0, dir: 1 }, { step: 30, dir: -1 }] });
    const tumbles = events.filter((e) => e.type === 'tumble');
    expect(tumbles).toHaveLength(2);
    const run = at(events, 'run', tumbles[1].t);
    expect(run.t - tumbles[1].t).toBeCloseTo(TUNING.tumbleTime + TUNING.springTime, 1);
  });
});

describe('state handling', () => {
  it('is JSON-safe and the step never changes its input', () => {
    const s = newRunnerState();
    const frozen = JSON.stringify(s);
    const r = stepRunner(s, { ...RIGHT, jump: true }, { vx: 1, vy: 0, grounded: true });
    expect(JSON.stringify(s)).toBe(frozen);
    expect(JSON.parse(JSON.stringify(r.state))).toEqual(r.state);
    expect(r.events).toEqual(['jump']);
  });

  it('applyHit returns what the body should do and does not mutate', () => {
    const s = newRunnerState();
    const h = applyHit(s, { dir: -1 });
    expect(s.mode).toBe('run');
    expect(h.state.mode).toBe('tumble');
    expect(h.vx).toBe(-TUNING.hitSpeed);
    expect(h.vy).toBe(-TUNING.hitLift);
    expect(h.spin).toBe(-TUNING.hitSpin);
    expect(h.events).toEqual(['tumble']);
  });

  it('is deterministic: the same script gives the same trace', () => {
    const script = (i) => ({ ...RIGHT, jump: i % 50 === 0, dive: i % 90 === 45 });
    const a = simulate({ seconds: 4, intentAt: script, hits: [{ step: 100, dir: 1 }] });
    const b = simulate({ seconds: 4, intentAt: script, hits: [{ step: 100, dir: 1 }] });
    expect(a).toEqual(b);
    expect(STEP).toBeCloseTo(1 / 60, 12);
  });
});

describe('hit immunity (G2a): an obstacle must not re-tumble a runner it has just hit', () => {
  it('a hit makes the runner immune for hitImmunity seconds, counted down by the step', () => {
    const h = applyHit(newRunnerState(), { dir: 1 });
    expect(canBeHit(newRunnerState())).toBe(true);
    expect(canBeHit(h.state)).toBe(false);
    let s = h.state;
    let t = 0;
    while (!canBeHit(s) && t < 5) {
      s = stepRunner(s, NO_INTENT, { vx: 0, vy: 0, grounded: true }).state;
      t += STEP;
    }
    expect(t).toBeGreaterThanOrEqual(TUNING.hitImmunity - 2 * STEP);
    expect(t).toBeLessThanOrEqual(TUNING.hitImmunity + 2 * STEP);
  });

  it('lasts longer than the tumble and the spring-up together, so one swing cannot chain-tumble', () => {
    expect(TUNING.hitImmunity).toBeGreaterThan(TUNING.tumbleTime + TUNING.springTime);
  });

  it('is part of the JSON-safe state', () => {
    const s = applyHit(newRunnerState(), { dir: -1 }).state;
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('standing on ground that moves (a platform): the rules run in the ground frame', () => {
  const PLATFORM = { vx: 2, vy: 0 };
  const idle = (state, probe, ground) => stepRunnerOn(state, NO_INTENT, probe, ground);

  it('a runner at rest on a platform keeps moving with it instead of sliding off the back', () => {
    const r = idle(newRunnerState(), { vx: 2, vy: 0, grounded: true }, PLATFORM);
    expect(r.vx).toBeCloseTo(2, 9);
  });

  it('a runner that is not at the platform speed is brought to it, by the idle braking rate', () => {
    const r = idle(newRunnerState(), { vx: 0, vy: 0, grounded: true }, PLATFORM);
    expect(r.vx).toBeCloseTo(TUNING.runDecel * STEP, 9);
  });

  it('holding right on a platform that moves right reaches platform speed + run speed', () => {
    let s = newRunnerState();
    let vx = 2;
    for (let i = 0; i < 60; i++) {
      const r = stepRunnerOn(s, RIGHT, { vx, vy: 0, grounded: true }, PLATFORM);
      s = r.state;
      vx = r.vx;
    }
    expect(vx).toBeCloseTo(2 + TUNING.runSpeed, 6);
  });

  it('a jump takes the platform velocity with it', () => {
    const rising = { vx: 1, vy: -2 };
    const r = stepRunnerOn(newRunnerState(), { ...NO_INTENT, jump: true }, { vx: 1, vy: -2, grounded: true }, rising);
    expect(r.events).toEqual(['jump']);
    expect(r.vy).toBeCloseTo(-TUNING.jumpSpeed - 2, 9);
  });

  it('a runner in the air ignores the ground velocity (the ground frame only applies while touching it)', () => {
    const air = stepRunnerOn(newRunnerState(), NO_INTENT, { vx: 5, vy: 3, grounded: false }, PLATFORM);
    const plain = stepRunner(newRunnerState(), NO_INTENT, { vx: 5, vy: 3, grounded: false });
    expect(air.vx).toBe(plain.vx);
    expect(air.vy).toBe(plain.vy);
  });

  it('with ground that does not move it is exactly stepRunner', () => {
    for (const intent of [NO_INTENT, RIGHT, LEFT, { ...NO_INTENT, jump: true }, { ...NO_INTENT, dive: true }]) {
      const probe = { vx: 3, vy: 0, grounded: true };
      const a = stepRunnerOn(newRunnerState(), intent, probe, { vx: 0, vy: 0 });
      const b = stepRunner(newRunnerState(), intent, probe);
      expect(a).toEqual(b);
    }
  });

  it('a runner tumbling on a platform slows down relative to the platform, not to the world', () => {
    const h = applyHit(newRunnerState(), { dir: 1, speed: 0 });
    const r = stepRunnerOn(h.state, NO_INTENT, { vx: 2, vy: 0, grounded: true }, PLATFORM);
    expect(r.vx).toBeCloseTo(2, 6); // at the platform's speed already: nothing to drag away
  });

  it('keeps a null (leave it to physics) as null, in the world frame too', () => {
    const r = stepRunnerOn(applyHit(newRunnerState(), { dir: 1 }).state, NO_INTENT, { vx: 0, vy: 0, grounded: false }, PLATFORM);
    expect(r.vy).toBeNull();
  });
});
