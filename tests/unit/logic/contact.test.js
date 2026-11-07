import { describe, it, expect } from 'vitest';
import { TUNING, STEP } from '../../../src/logic/tuning.js';
import {
  CONTACT_TYPES,
  validateContactObstacle,
  contactSize,
  bounceLaunch,
  beltSurface,
  newTile,
  touchTile,
  stepTile,
  tileSolid,
  seesawAssist,
} from '../../../src/logic/contact.js';
import { validateCourse } from '../../../src/logic/course.js';
import { stepRunnerOn, newRunnerState } from '../../../src/logic/runner.js';

// G2b: the four contact obstacles (HANDOFF 5.2): bounce pad, seesaw, conveyor belt, falling tiles.
// Their rules are pure here (a launch speed, a belt speed, a tile's state machine, a seesaw's stop and spring);
// Matter and Phaser only apply them (src/game/obstacles). Units: tiles, seconds, radians; y points down.

const PAD = { type: 'bounce-pad', col: 10, row: 8.8, w: 2 };
const SEESAW = { type: 'seesaw', col: 20, row: 7.4, length: 5 };
const BELT = { type: 'conveyor', col: 30, row: 8.75, w: 6, dir: 1 };
const TILES = { type: 'falling-tiles', col: 40, row: 8.75, count: 5 };
const ALL = [PAD, SEESAW, BELT, TILES];

describe('the contact kit', () => {
  it('names exactly the four contact obstacles of HANDOFF 5.2 that G2b builds', () => {
    expect([...CONTACT_TYPES].sort()).toEqual(['bounce-pad', 'conveyor', 'falling-tiles', 'seesaw']);
  });

  it('sizes the main body of each in tiles', () => {
    expect(contactSize('bounce-pad', PAD)).toEqual({ w: 2, h: expect.any(Number) });
    expect(contactSize('bounce-pad', PAD).h).toBeGreaterThan(0);
    expect(contactSize('seesaw', SEESAW).w).toBe(5);
    expect(contactSize('seesaw', { ...SEESAW, thick: 0.6 }).h).toBe(0.6);
    expect(contactSize('conveyor', BELT).w).toBe(6);
    expect(contactSize('conveyor', { ...BELT, h: 0.75 }).h).toBe(0.75);
    // falling tiles: one body per tile, a tile is one tile wide
    expect(contactSize('falling-tiles', TILES).w).toBe(1);
    expect(contactSize('falling-tiles', { ...TILES, h: 0.4 }).h).toBe(0.4);
    expect(() => contactSize('lava', {})).toThrow();
  });
});

describe('validateContactObstacle', () => {
  it.each(ALL.map((o) => [o.type, o]))('accepts a well-formed %s', (_n, o) => {
    expect(validateContactObstacle(o)).toEqual([]);
  });

  it('rejects anything that is not one of the four, with a sentence listing what is allowed', () => {
    expect(validateContactObstacle(null)).toEqual(['obstacle must be an object']);
    expect(validateContactObstacle([])).toEqual(['obstacle must be an object']);
    expect(validateContactObstacle({ type: 'lava' })[0]).toMatch(/type must be one of: bounce-pad/);
  });

  it('needs every required number, and says which one is missing or not a number', () => {
    for (const o of ALL) {
      for (const key of Object.keys(o).filter((k) => k !== 'type')) {
        const missing = { ...o };
        delete missing[key];
        expect(validateContactObstacle(missing), `${o.type} without ${key}`).toContain(`${key} is missing`);
        expect(validateContactObstacle({ ...o, [key]: NaN }), `${o.type} ${key} NaN`).toContain(`${key} must be a finite number`);
        expect(validateContactObstacle({ ...o, [key]: '3' }), `${o.type} ${key} string`).toContain(`${key} must be a finite number`);
      }
    }
  });

  it('needs sizes above 0', () => {
    expect(validateContactObstacle({ ...PAD, w: 0 })).toContain('w must be above 0');
    expect(validateContactObstacle({ ...SEESAW, length: -1 })).toContain('length must be above 0');
    expect(validateContactObstacle({ ...BELT, w: 0 })).toContain('w must be above 0');
    expect(validateContactObstacle({ ...BELT, h: 0 })).toContain('h must be above 0');
    expect(validateContactObstacle({ ...SEESAW, thick: 0 })).toContain('thick must be above 0');
    expect(validateContactObstacle({ ...PAD, power: 0 })).toContain('power must be above 0');
    expect(validateContactObstacle({ ...BELT, speed: 0 })).toContain('speed must be above 0');
  });

  it('a belt goes one way or the other (dir is 1 or -1), never "0" or "2"', () => {
    expect(validateContactObstacle({ ...BELT, dir: -1 })).toEqual([]);
    expect(validateContactObstacle({ ...BELT, dir: 0 })).toContain('dir must be 1 or -1');
    expect(validateContactObstacle({ ...BELT, dir: 2 })).toContain('dir must be 1 or -1');
  });

  it('falling tiles are a whole number of tiles, from 1 to 12', () => {
    expect(validateContactObstacle({ ...TILES, count: 1 })).toEqual([]);
    expect(validateContactObstacle({ ...TILES, count: 12 })).toEqual([]);
    expect(validateContactObstacle({ ...TILES, count: 0 })).toContain('count must be a whole number from 1 to 12');
    expect(validateContactObstacle({ ...TILES, count: 2.5 })).toContain('count must be a whole number from 1 to 12');
    expect(validateContactObstacle({ ...TILES, count: 13 })).toContain('count must be a whole number from 1 to 12');
  });

  it('a pad that launches harder than twice the usual is not a pad, it is a cannon', () => {
    expect(validateContactObstacle({ ...PAD, power: 2 })).toEqual([]);
    expect(validateContactObstacle({ ...PAD, power: 2.5 })).toContain('power must be at most 2');
  });

  it('a pad that launches too softly would throw the runner up and then throw them again from the same spot', () => {
    expect(validateContactObstacle({ ...PAD, power: 0.4 })).toEqual([]);
    expect(validateContactObstacle({ ...PAD, power: 0.3 })).toContain('power must be at least 0.4');
  });

  it('a belt may not be as fast as a run, or a runner could not make way against it', () => {
    expect(validateContactObstacle({ ...BELT, speed: TUNING.runSpeed - 0.5 })).toEqual([]);
    expect(validateContactObstacle({ ...BELT, speed: TUNING.runSpeed })).toContain(`speed must be under ${TUNING.runSpeed} (the run speed)`);
    expect(validateContactObstacle({ ...BELT, speed: 12 })).toContain(`speed must be under ${TUNING.runSpeed} (the run speed)`);
  });

  it('nothing is so thin that a runner could fall through it (at least 0.1 tile)', () => {
    expect(validateContactObstacle({ ...SEESAW, thick: 0.1 })).toEqual([]);
    expect(validateContactObstacle({ ...SEESAW, thick: 0.01 })).toContain('thick must be at least 0.1');
    expect(validateContactObstacle({ ...BELT, h: 0.05 })).toContain('h must be at least 0.1');
    expect(validateContactObstacle({ ...TILES, h: 0.05 })).toContain('h must be at least 0.1');
    expect(validateContactObstacle({ ...PAD, w: 0.05 })).toContain('w must be at least 0.1');
    expect(validateContactObstacle({ ...BELT, w: 0.05 })).toContain('w must be at least 0.1');
    expect(validateContactObstacle({ ...SEESAW, length: 0.05 })).toContain('length must be at least 0.1');
  });
});

describe('bounce pad', () => {
  const speed = TUNING.padSpeed;

  it('launches a runner standing on it straight up at the pad speed, much higher than a jump', () => {
    expect(bounceLaunch(PAD, 0)).toBe(-speed);
    const apex = (speed * speed) / (2 * TUNING.gravity);
    expect(apex, 'a pad throws about 4 to 6 tiles high').toBeGreaterThan(4);
    expect(apex).toBeLessThan(6);
    expect(speed).toBeGreaterThan(TUNING.jumpSpeed * 1.4);
  });

  it('launches a runner who lands on it from above, harder fall or not', () => {
    expect(bounceLaunch(PAD, 12)).toBe(-speed);
  });

  it('launches once: a runner already rising fast from it is left alone while still overlapping the sensor', () => {
    expect(bounceLaunch(PAD, -speed)).toBeNull();
    expect(bounceLaunch(PAD, -0.6 * speed)).toBeNull();
    expect(bounceLaunch(PAD, -0.4 * speed), 'a slow rise (a jump just starting) still launches').toBe(-speed);
  });

  it('power scales the launch', () => {
    expect(bounceLaunch({ ...PAD, power: 0.5 }, 0)).toBeCloseTo(-speed * 0.5, 9);
    expect(bounceLaunch({ ...PAD, power: 1.5 }, 0)).toBeCloseTo(-speed * 1.5, 9);
  });
});

describe('conveyor belt', () => {
  it('is a surface speed along the way it faces, at the tuned belt speed unless the course says otherwise', () => {
    expect(beltSurface(BELT)).toEqual({ vx: TUNING.beltSpeed, vy: 0 });
    expect(beltSurface({ ...BELT, dir: -1 })).toEqual({ vx: -TUNING.beltSpeed, vy: 0 });
    expect(beltSurface({ ...BELT, speed: 5 })).toEqual({ vx: 5, vy: 0 });
    expect(beltSurface({ ...BELT, dir: -1, speed: 5 })).toEqual({ vx: -5, vy: 0 });
  });

  it('a belt is slower than a run, so a runner can always make way against it', () => {
    expect(TUNING.beltSpeed).toBeGreaterThan(0);
    expect(TUNING.beltSpeed).toBeLessThan(TUNING.runSpeed);
  });

  it('carries a runner who stands still, and adds to a runner who runs with it, using the ground-frame rules', () => {
    const s = newRunnerState();
    const belt = beltSurface(BELT);
    // standing on the belt with no keys: the runner ends up moving with the belt
    let probe = { vx: 0, vy: 0, grounded: true };
    let state = s;
    for (let i = 0; i < 30; i++) {
      const r = stepRunnerOn(state, {}, probe, belt);
      state = r.state;
      probe = { vx: r.vx ?? probe.vx, vy: r.vy ?? probe.vy, grounded: true };
    }
    expect(probe.vx).toBeCloseTo(belt.vx, 6);
    // running with it: top speed is the run speed PLUS the belt
    for (let i = 0; i < 60; i++) {
      const r = stepRunnerOn(state, { right: true }, probe, belt);
      state = r.state;
      probe = { vx: r.vx ?? probe.vx, vy: r.vy ?? probe.vy, grounded: true };
    }
    expect(probe.vx).toBeCloseTo(TUNING.runSpeed + belt.vx, 6);
    // running against it: still makes way, at the run speed MINUS the belt
    const against = { vx: -belt.vx, vy: 0 };
    let p2 = { vx: 0, vy: 0, grounded: true };
    let st2 = newRunnerState();
    for (let i = 0; i < 60; i++) {
      const r = stepRunnerOn(st2, { right: true }, p2, against);
      st2 = r.state;
      p2 = { vx: r.vx ?? p2.vx, vy: r.vy ?? p2.vy, grounded: true };
    }
    expect(p2.vx).toBeCloseTo(TUNING.runSpeed - belt.vx, 6);
    expect(p2.vx).toBeGreaterThan(0);
  });
});

describe('falling tiles: one tile', () => {
  const T = TUNING;

  it('uses the numbers HANDOFF 5.2 gives: drops 0.6 s after the first touch, back after 5 s', () => {
    expect(T.tileDropDelay).toBe(0.6);
    expect(T.tileRespawn).toBe(5);
  });

  it('starts solid and stays solid with nobody on it, however long the race runs', () => {
    let s = newTile();
    expect(tileSolid(s)).toBe(true);
    for (let t = 0; t < 60; t += 0.5) s = stepTile(s, t, T);
    expect(s).toEqual(newTile());
  });

  it('the first touch arms it, and it is still solid (you can still stand on it) while it shakes', () => {
    const s = touchTile(newTile(), 3);
    expect(s.phase).toBe('armed');
    expect(s.since).toBe(3);
    expect(tileSolid(s)).toBe(true);
    expect(tileSolid(stepTile(s, 3.59, T))).toBe(true);
  });

  it('drops 0.6 s after the first touch, and not before', () => {
    const s = touchTile(newTile(), 3);
    expect(stepTile(s, 3.59, T).phase).toBe('armed');
    const dropped = stepTile(s, 3.6, T);
    expect(dropped.phase).toBe('fallen');
    expect(tileSolid(dropped)).toBe(false);
  });

  it('only the FIRST touch counts: more touches while it shakes do not push the drop later', () => {
    let s = touchTile(newTile(), 3);
    s = touchTile(s, 3.4);
    expect(s.since).toBe(3);
    expect(stepTile(s, 3.6, T).phase).toBe('fallen');
  });

  it('a touch on a fallen tile does nothing', () => {
    const fallen = stepTile(touchTile(newTile(), 3), 4, T);
    expect(touchTile(fallen, 5)).toEqual(fallen);
  });

  it('is exact about when it fell even if the step that noticed was late: the respawn counts from the drop, not from the step', () => {
    const late = stepTile(touchTile(newTile(), 3), 3.7, T); // noticed 0.1 s late
    expect(late.phase).toBe('fallen');
    expect(late.since).toBeCloseTo(3.6, 9);
    expect(stepTile(late, 3.6 + 4.99, T).phase).toBe('fallen');
    expect(stepTile(late, 3.6 + 5, T).phase).toBe('solid');
  });

  it('respawns 5 s after it dropped, and can be dropped again', () => {
    let s = stepTile(touchTile(newTile(), 3), 3.6, T);
    s = stepTile(s, 8.6, T);
    expect(s.phase).toBe('solid');
    expect(tileSolid(s)).toBe(true);
    s = touchTile(s, 9);
    expect(stepTile(s, 9.6, T).phase).toBe('fallen');
  });

  it('waits to come back while a runner is in its spot, then comes back the moment the spot is free', () => {
    const fallen = stepTile(touchTile(newTile(), 0), 0.6, T);
    expect(stepTile(fallen, 6, T, () => true).phase).toBe('fallen');
    expect(stepTile(fallen, 6, T, () => false).phase).toBe('solid');
    // blocked is asked only when the respawn is due, never while it is still falling
    let asked = 0;
    stepTile(fallen, 3, T, () => (asked++, true));
    expect(asked).toBe(0);
  });

  it('is JSON-safe and does not change the state it was given', () => {
    const s = touchTile(newTile(), 1);
    const copy = JSON.parse(JSON.stringify(s));
    stepTile(s, 5, T);
    expect(s).toEqual(copy);
    expect(JSON.parse(JSON.stringify(stepTile(s, 5, T)))).toEqual(stepTile(s, 5, T));
  });

  it('goes back to solid if the race clock is set back before it fell (a restart)', () => {
    const fallen = stepTile(touchTile(newTile(), 10), 10.6, T);
    expect(stepTile(fallen, 2, T).phase).toBe('solid');
    expect(stepTile(touchTile(newTile(), 10), 2, T).phase).toBe('solid');
  });

  it('a restart does not pop a fallen tile back on top of a runner who is in its place', () => {
    const fallen = stepTile(touchTile(newTile(), 10), 10.6, T);
    expect(stepTile(fallen, 2, T, () => true)).toEqual(fallen);
    expect(stepTile(fallen, 2, T, () => false).phase).toBe('solid');
  });
});

describe('seesaw', () => {
  const T = TUNING;
  const MAX = T.seesawMaxTilt;
  // what the engine does around the assist: it turns the plank by its angular velocity each step
  const advance = (st) => {
    const r = seesawAssist(st.angle, st.angVel, STEP, T);
    return { angle: r.angle + r.angVel * STEP, angVel: r.angVel };
  };
  const run = (angle, w, steps) => {
    let st = { angle, angVel: w };
    for (let i = 0; i < steps; i++) st = advance(st);
    return st;
  };

  it('has a gentle stop: tips to about 15 to 20 degrees and no further', () => {
    expect((MAX * 180) / Math.PI).toBeGreaterThan(12);
    expect((MAX * 180) / Math.PI).toBeLessThan(22);
  });

  it('never lets the plank past its stop, and stops it dead there instead of bouncing', () => {
    const r = seesawAssist(MAX + 0.05, 2, STEP, T);
    expect(r.angle).toBeCloseTo(MAX, 9);
    expect(r.angVel, 'moving further out is cancelled').toBe(0);
    const l = seesawAssist(-MAX - 0.05, -2, STEP, T);
    expect(l.angle).toBeCloseTo(-MAX, 9);
    expect(l.angVel).toBe(0);
  });

  it('a plank pressed against its stop with nothing pushing it back out gets the spring pushing it level', () => {
    const r = seesawAssist(MAX, 0, STEP, T);
    expect(r.angle).toBeCloseTo(MAX, 9);
    expect(r.angVel, 'the spring pulls it back towards level').toBeLessThan(0);
  });

  it('with a runner on it the spring does NOT pull the plank level: it stays tipped where their weight put it', () => {
    const loaded = seesawAssist(0.2, 0, STEP, T, true);
    expect(loaded.angle).toBe(0.2);
    expect(loaded.angVel, 'no spring while loaded').toBe(0);
    const empty = seesawAssist(0.2, 0, STEP, T, false);
    expect(empty.angVel, 'the spring works when empty').toBeLessThan(0);
    // damping still calms a swing while loaded
    expect(Math.abs(seesawAssist(0.1, 2, STEP, T, true).angVel)).toBeLessThan(2);
    // and the stop still holds while loaded
    const stopped = seesawAssist(MAX + 0.02, 1, STEP, T, true);
    expect(stopped.angle).toBeCloseTo(MAX, 9);
    expect(stopped.angVel).toBe(0);
  });

  it('comes level again and stays level when nobody is on it', () => {
    const r = run(MAX, 0, 60 * 12);
    expect(Math.abs(r.angle)).toBeLessThan(0.005);
    expect(Math.abs(r.angVel)).toBeLessThan(0.02);
    const l = run(-MAX * 0.7, 0, 60 * 12);
    expect(Math.abs(l.angle)).toBeLessThan(0.005);
  });

  it('settles without swinging past level more than a little (it is damped)', () => {
    let st = { angle: MAX, angVel: 0 };
    let worst = 0;
    for (let i = 0; i < 60 * 8; i++) {
      st = advance(st);
      worst = Math.min(worst, st.angle * Math.sign(MAX)); // how far it went to the other side
    }
    expect(-worst, 'overshoot, radians').toBeLessThan(MAX * 0.3);
  });

  it('leaves a level, still plank alone', () => {
    expect(seesawAssist(0, 0, STEP, T)).toEqual({ angle: 0, angVel: 0 });
  });

  it('is JSON-safe plain numbers', () => {
    const r = seesawAssist(0.1, 0.2, STEP, T);
    expect(Object.keys(r).sort()).toEqual(['angVel', 'angle']);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});

describe('contact obstacles in a course', () => {
  const good = () => ({
    id: 't',
    tile: 48,
    cols: 60,
    rows: 12,
    spawn: { col: 1, row: 8 },
    ground: [{ col: 0, row: 9, w: 60, h: 3 }],
  });

  it('are checked by the contact rules, and the error names which one is wrong', () => {
    expect(validateCourse({ ...good(), obstacles: ALL.map((o) => ({ ...o, col: o.col - 5 })) })).toEqual([]);
    const errors = validateCourse({ ...good(), obstacles: [{ ...PAD, col: 10 }, { ...BELT, col: 20, dir: 0 }] });
    expect(errors).toContain('obstacles[1] dir must be 1 or -1');
    expect(errors.some((e) => e.startsWith('obstacles[0]'))).toBe(false);
  });

  it('an unknown type lists all eight types, race-clock and contact', () => {
    const errors = validateCourse({ ...good(), obstacles: [{ type: 'lava' }] });
    const e = errors.find((x) => x.startsWith('obstacles[0]'));
    for (const t of ['spinning-bar', 'moving-platform', 'bounce-pad', 'falling-tiles']) expect(e).toContain(t);
  });

  it('needs the whole thing inside the course: a long plank or a row of tiles at the edge is checked by its size, not its centre', () => {
    expect(validateCourse({ ...good(), obstacles: [{ ...SEESAW, col: 2.5 }] })).toEqual([]);
    expect(validateCourse({ ...good(), obstacles: [{ ...SEESAW, col: 1 }] })).toContainEqual(expect.stringMatching(/^obstacles\[0\].*inside the course/));
    expect(validateCourse({ ...good(), obstacles: [{ ...TILES, col: 58.5 }] })).toContainEqual(expect.stringMatching(/^obstacles\[0\].*inside the course/));
    expect(validateCourse({ ...good(), obstacles: [{ ...BELT, col: 59 }] })).toContainEqual(expect.stringMatching(/^obstacles\[0\].*inside the course/));
    expect(validateCourse({ ...good(), obstacles: [{ ...PAD, col: 59.5 }] })).toContainEqual(expect.stringMatching(/^obstacles\[0\].*inside the course/));
  });

  it('a seesaw plank must clear the ground it tips over: its ends at full tilt may not go into solid ground', () => {
    // pivot 0.5 above the ground top (row 9): a 5-tile plank at about 17 degrees puts an end about 0.73 tiles down: into the ground
    expect(validateCourse({ ...good(), obstacles: [{ ...SEESAW, row: 8.5 }] })).toContainEqual(expect.stringMatching(/^obstacles\[0\].*ground/));
    // pivot 1.6 above it: clear
    expect(validateCourse({ ...good(), obstacles: [{ ...SEESAW, row: 7.4 }] })).toEqual([]);
    // the same plank over a notch in the ground (a pit the ends can dip into) is fine, flush with the ground
    const notch = { ...good(), ground: [{ col: 0, row: 9, w: 17, h: 3 }, { col: 17, row: 11, w: 6, h: 1 }, { col: 23, row: 9, w: 37, h: 3 }] };
    expect(validateCourse({ ...notch, obstacles: [{ ...SEESAW, col: 20, row: 9.2, length: 5.8 }] })).toEqual([]);
  });
});
