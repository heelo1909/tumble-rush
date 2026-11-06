import { describe, it, expect } from 'vitest';
import { TUNING } from '../../../src/logic/tuning.js';
import { OBSTACLE_TYPES, validateObstacle, pose, velocityAt, hitFrom, hitOnContact, bodySize } from '../../../src/logic/obstacles.js';
import { newRunnerState, applyHit, stepRunner, NO_INTENT } from '../../../src/logic/runner.js';

// G2a: the four race-clock obstacles (HANDOFF 5.2). Every pose is a pure function of race time, so
// every laptop shows the obstacle in the same place at the same moment with nothing sent over the network.
// Units: tiles and radians, y points down, positive angle turns clockwise on screen (like Phaser and Matter).

const BAR = { type: 'spinning-bar', col: 5, row: 7, length: 3.6, rps: 0.5 };
const HAMMER = { type: 'swinging-hammer', col: 10, row: 3.5, length: 4, ampDeg: 45, period: 3 };
const PUSHER = { type: 'pusher-wall', col: 26, row: 7.5, w: 0.8, h: 3, dx: -3, dy: 0, period: 4 };
const PLATFORM = { type: 'moving-platform', col: 34, row: 7, w: 3, h: 0.5, dx: 3, dy: 0, period: 6 };
const ALL = [BAR, HAMMER, PUSHER, PLATFORM];
const periodOf = (o) => (o.type === 'spinning-bar' ? 1 / Math.abs(o.rps) : o.period);
const P = (o, t) => pose(o.type, o, t);
const close = (a, b, digits = 6) => expect(a).toBeCloseTo(b, digits);
const AMP = (45 * Math.PI) / 180;

describe('the obstacle kit', () => {
  it('names exactly the four race-clock obstacles of HANDOFF 5.2 that G2a builds', () => {
    expect([...OBSTACLE_TYPES].sort()).toEqual(['moving-platform', 'pusher-wall', 'spinning-bar', 'swinging-hammer']);
  });
});

describe('every pose, whatever the obstacle', () => {
  it.each(ALL.map((o) => [o.type, o]))('%s is JSON-safe plain numbers', (_name, o) => {
    const p = P(o, 1.234);
    expect(Object.keys(p).sort()).toEqual(['angle', 'x', 'y']);
    for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });

  it.each(ALL.map((o) => [o.type, o]))('%s is continuous: nearby times give nearby poses', (_name, o) => {
    for (let t = 0; t < 12; t += 0.37) {
      const a = P(o, t);
      const b = P(o, t + 0.001);
      expect(Math.abs(a.x - b.x), `x at ${t}`).toBeLessThan(0.02);
      expect(Math.abs(a.y - b.y), `y at ${t}`).toBeLessThan(0.02);
      expect(Math.abs(a.angle - b.angle), `angle at ${t}`).toBeLessThan(0.02);
    }
  });

  it.each(ALL.map((o) => [o.type, o]))('%s repeats exactly once per period', (_name, o) => {
    const T = periodOf(o);
    for (const t of [0, 0.4, 1.1, 2.9]) {
      const a = P(o, t);
      const b = P(o, t + T);
      close(a.x, b.x, 6);
      close(a.y, b.y, 6);
      // an angle is the same turn whichever whole number of turns it has been through
      close(Math.cos(a.angle), Math.cos(b.angle), 6);
      close(Math.sin(a.angle), Math.sin(b.angle), 6);
    }
  });

  it.each(ALL.map((o) => [o.type, o]))('%s holds still at its t = 0 pose during the countdown (t < 0)', (_name, o) => {
    expect(P(o, -3)).toEqual(P(o, 0));
    expect(P(o, -0.001)).toEqual(P(o, 0));
    expect(velocityAt(o.type, o, -1, o.col, o.row)).toEqual({ vx: 0, vy: 0 });
  });

  it.each(ALL.map((o) => [o.type, o]))('%s gives the same answer every time and never changes its input', (_name, o) => {
    const frozen = JSON.stringify(o);
    expect(P(o, 3.3)).toEqual(P(o, 3.3));
    expect(JSON.stringify(o)).toBe(frozen);
  });

  it('a phase shifts the motion in time by that share of a period', () => {
    for (const o of ALL) {
      const T = periodOf(o);
      const shifted = { ...o, phase: 0.25 };
      const a = P(shifted, 0);
      const b = P(o, T * 0.25);
      close(a.x, b.x, 6);
      close(a.y, b.y, 6);
      close(Math.cos(a.angle), Math.cos(b.angle), 6);
    }
  });
});

describe('spinning bar', () => {
  it('turns on its pivot: the pivot never moves, the angle goes round at rps turns a second', () => {
    for (const t of [0, 0.3, 1, 7.7]) {
      const p = P(BAR, t);
      expect(p.x).toBe(BAR.col);
      expect(p.y).toBe(BAR.row);
    }
    close(P(BAR, 0).angle, 0);
    close(P(BAR, 0.5).angle, Math.PI / 2); // a quarter turn takes a quarter of the 2 s period
    close(P(BAR, 1).angle, Math.PI);
    close(P(BAR, 2).angle, 2 * Math.PI);
  });

  it('a negative rps turns the other way', () => {
    close(P({ ...BAR, rps: -0.5 }, 0.5).angle, -Math.PI / 2);
  });

  it('starts at its phase', () => {
    close(P({ ...BAR, phase: 0.25 }, 0).angle, Math.PI / 2);
  });

  it('a point on the bar moves at rps x 2 pi x distance, across the bar', () => {
    // bar flat at t = 0, clockwise: the right end moves down, the left end moves up
    const right = velocityAt(BAR.type, BAR, 0, BAR.col + 1.8, BAR.row);
    close(right.vx, 0, 3);
    close(right.vy, 2 * Math.PI * 0.5 * 1.8, 2);
    const left = velocityAt(BAR.type, BAR, 0, BAR.col - 1.8, BAR.row);
    close(left.vy, -2 * Math.PI * 0.5 * 1.8, 2);
    // the pivot itself does not move
    const hub = velocityAt(BAR.type, BAR, 0, BAR.col, BAR.row);
    close(hub.vx, 0, 3);
    close(hub.vy, 0, 3);
  });
});

describe('swinging hammer', () => {
  it('hangs straight down from the pivot at t = 0 (angle 0, head one arm length below)', () => {
    const p = P(HAMMER, 0);
    close(p.angle, 0);
    close(p.x, HAMMER.col);
    close(p.y, HAMMER.row + HAMMER.length);
  });

  it('swings out to the amplitude a quarter period later and back through the middle at half period', () => {
    const q = P(HAMMER, HAMMER.period / 4);
    close(q.angle, AMP);
    // the head is one arm length from the pivot, tipped by the angle (screen y points down)
    close(q.x, HAMMER.col - HAMMER.length * Math.sin(AMP));
    close(q.y, HAMMER.row + HAMMER.length * Math.cos(AMP));
    close(P(HAMMER, HAMMER.period / 2).angle, 0);
    close(P(HAMMER, (HAMMER.period * 3) / 4).angle, -AMP);
  });

  it('the head is always exactly one arm length from the pivot, and never swings past the amplitude', () => {
    for (let t = 0; t < 9; t += 0.11) {
      const p = P(HAMMER, t);
      close(Math.hypot(p.x - HAMMER.col, p.y - HAMMER.row), HAMMER.length, 6);
      expect(Math.abs(p.angle)).toBeLessThanOrEqual(AMP + 1e-9);
    }
  });

  it('is fastest at the bottom of the swing and still for an instant at the ends', () => {
    const bottom = velocityAt(HAMMER.type, HAMMER, 0, HAMMER.col, HAMMER.row + HAMMER.length);
    close(Math.hypot(bottom.vx, bottom.vy), (AMP * 2 * Math.PI * HAMMER.length) / HAMMER.period, 2);
    expect(bottom.vx).toBeLessThan(0); // swinging towards the left first, so the head moves left
    const p = P(HAMMER, HAMMER.period / 4);
    const end = velocityAt(HAMMER.type, HAMMER, HAMMER.period / 4, p.x, p.y);
    close(Math.hypot(end.vx, end.vy), 0, 1);
  });
});

describe('pusher wall and moving platform', () => {
  it.each([PUSHER, PLATFORM].map((o) => [o.type, o]))('%s slides out and back along its travel and never turns', (_name, o) => {
    const start = P(o, 0);
    close(start.x, o.col);
    close(start.y, o.row);
    close(start.angle, 0);
    const T = o.period;
    const far = P(o, T / 2);
    close(far.x, o.col + o.dx);
    close(far.y, o.row + o.dy);
    const mid = P(o, T / 4);
    close(mid.x, o.col + o.dx / 2);
    for (let t = 0; t < 2 * T; t += 0.13) {
      const p = P(o, t);
      close(p.angle, 0);
      const s = (p.x - o.col) / o.dx; // how far along the travel, always between 0 and 1
      expect(s).toBeGreaterThanOrEqual(-1e-9);
      expect(s).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('can slide up and down too', () => {
    const lift = { ...PLATFORM, dx: 0, dy: -2 };
    close(P(lift, lift.period / 2).y, lift.row - 2);
    close(P(lift, lift.period / 2).x, lift.col);
  });

  it('every point of a sliding body moves at the same speed, and it starts and ends each trip at rest', () => {
    const v0 = velocityAt(PLATFORM.type, PLATFORM, 0, 34, 7);
    close(v0.vx, 0, 3);
    const vq = velocityAt(PLATFORM.type, PLATFORM, PLATFORM.period / 4, 35.5, 7);
    const vq2 = velocityAt(PLATFORM.type, PLATFORM, PLATFORM.period / 4, 33, 6);
    close(vq.vx, vq2.vx, 6);
    close(vq.vx, (Math.PI * PLATFORM.dx) / PLATFORM.period, 2); // the middle of a sine ease is its fastest point
    close(vq.vy, 0, 6);
  });
});

describe('what a hit does', () => {
  it('a fast bar tip hits and sends the runner the way the tip is moving', () => {
    // bar vertical at a quarter period, turning clockwise: the end above the pivot moves right, the end below moves left
    const t = 0.5;
    const top = hitFrom(BAR.type, BAR, t, BAR.col, BAR.row - 1.5);
    expect(top.dir).toBe(1);
    const bottom = hitFrom(BAR.type, BAR, t, BAR.col, BAR.row + 1.5);
    expect(bottom.dir).toBe(-1);
    expect(top.speed).toBeGreaterThan(TUNING.hitMinSpeed);
  });

  it('the hammer hits the way its head is swinging', () => {
    const h = hitFrom(HAMMER.type, HAMMER, 0, HAMMER.col, HAMMER.row + HAMMER.length);
    expect(h.dir).toBe(-1); // moving left at the bottom of its first swing
    const back = hitFrom(HAMMER.type, HAMMER, HAMMER.period / 2, HAMMER.col, HAMMER.row + HAMMER.length);
    expect(back.dir).toBe(1);
  });

  it('a pusher wall and a platform do not hit (they push and carry, which physics does)', () => {
    for (const o of [PUSHER, PLATFORM]) {
      expect(hitFrom(o.type, o, o.period / 4, o.col, o.row)).toBeNull();
    }
  });

  it('too slow is a brush, not a hit', () => {
    const slow = { ...BAR, rps: 0.02 };
    expect(hitFrom(slow.type, slow, 0.1, slow.col + 1.8, slow.row)).toBeNull();
    // a hammer at the end of its swing is nearly still
    const p = P(HAMMER, HAMMER.period / 4);
    expect(hitFrom(HAMMER.type, HAMMER, HAMMER.period / 4, p.x, p.y)).toBeNull();
  });

  it('when the obstacle is moving mostly up or down it throws the runner away from its middle', () => {
    // bar flat at t = 0: its right tip moves straight down, so it knocks right, its left tip moves straight up, so left
    const right = hitFrom(BAR.type, BAR, 0, BAR.col + 1.7, BAR.row);
    const left = hitFrom(BAR.type, BAR, 0, BAR.col - 1.7, BAR.row);
    expect(right.dir).toBe(1);
    expect(left.dir).toBe(-1);
  });
});

describe('hitOnContact (the runner side of a hit: immunity first, then hitFrom)', () => {
  const tip = [BAR.col + 1.7, BAR.row]; // the bar is flat at t = 0, its right tip moving straight down

  it('a runner who is not immune is hit, with who hit them and which way', () => {
    const h = hitOnContact(newRunnerState(), BAR.type, BAR, 0, ...tip);
    expect(h).toMatchObject({ by: 'spinning-bar', dir: 1 });
    expect(h.speed).toBeGreaterThan(TUNING.hitMinSpeed);
  });

  it('a runner who has just been hit is not hit again, however hard the obstacle moves', () => {
    const tumbling = applyHit(newRunnerState(), { dir: 1 }).state;
    expect(hitOnContact(tumbling, BAR.type, BAR, 0, ...tip)).toBeNull();
    expect(hitFrom(BAR.type, BAR, 0, ...tip), 'the obstacle itself would hit').not.toBeNull();
  });

  it('is hit again once the immunity time has run out', () => {
    let s = applyHit(newRunnerState(), { dir: 1 }).state;
    for (let i = 0; i < Math.ceil((TUNING.hitImmunity + 0.1) * 60); i++) s = stepRunner(s, NO_INTENT, { vx: 0, vy: 0, grounded: true }).state;
    expect(hitOnContact(s, BAR.type, BAR, 0, ...tip)).not.toBeNull();
  });

  it('a brush, a pusher and a platform are never a hit, immune or not', () => {
    expect(hitOnContact(newRunnerState(), BAR.type, { ...BAR, rps: 0.02 }, 0, ...tip)).toBeNull();
    expect(hitOnContact(newRunnerState(), PUSHER.type, PUSHER, 1, PUSHER.col, PUSHER.row)).toBeNull();
    expect(hitOnContact(newRunnerState(), PLATFORM.type, PLATFORM, 1, PLATFORM.col, PLATFORM.row)).toBeNull();
  });
});

describe('type names that are not obstacles but are on every object', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('%s is an unknown type, not a crash or a free pass', (name) => {
    const errors = validateObstacle({ type: name, col: 1, row: 1 });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/type must be one of/);
    expect(() => pose(name, {}, 1)).toThrow(/unknown obstacle type/);
  });
});

describe('bodySize', () => {
  it('gives the box each obstacle collides as, in tiles', () => {
    expect(bodySize(BAR.type, BAR)).toEqual({ w: 3.6, h: 0.35 });
    expect(bodySize(BAR.type, { ...BAR, thick: 0.5 })).toEqual({ w: 3.6, h: 0.5 });
    expect(bodySize(HAMMER.type, HAMMER)).toEqual({ w: 1.4, h: 1.4 });
    expect(bodySize(HAMMER.type, { ...HAMMER, head: 2 })).toEqual({ w: 2, h: 2 });
    expect(bodySize(PUSHER.type, PUSHER)).toEqual({ w: 0.8, h: 3 });
    expect(bodySize(PLATFORM.type, PLATFORM)).toEqual({ w: 3, h: 0.5 });
  });
});

describe('validateObstacle', () => {
  it('accepts a good one of each type', () => {
    for (const o of ALL) expect(validateObstacle(o)).toEqual([]);
  });

  it('rejects things that are not obstacles', () => {
    for (const bad of [null, undefined, 3, 'bar', []]) expect(validateObstacle(bad).length).toBeGreaterThan(0);
  });

  it('rejects an unknown type and says which ones exist', () => {
    const errors = validateObstacle({ ...BAR, type: 'lava' });
    expect(errors.length).toBe(1);
    expect(errors[0]).toMatch(/type/);
    expect(errors[0]).toMatch(/spinning-bar/);
  });

  it('needs every number, finite', () => {
    for (const key of ['col', 'row', 'length', 'rps']) {
      const o = { ...BAR };
      delete o[key];
      expect(validateObstacle(o), key).toContainEqual(expect.stringContaining(key));
      expect(validateObstacle({ ...BAR, [key]: Number.NaN }), `${key} NaN`).toContainEqual(expect.stringContaining(key));
      expect(validateObstacle({ ...BAR, [key]: Infinity }), `${key} Infinity`).toContainEqual(expect.stringContaining(key));
      expect(validateObstacle({ ...BAR, [key]: '3' }), `${key} string`).toContainEqual(expect.stringContaining(key));
    }
  });

  it('needs sizes and periods above zero', () => {
    expect(validateObstacle({ ...BAR, length: 0 })).toContainEqual(expect.stringContaining('length'));
    expect(validateObstacle({ ...BAR, thick: -1 })).toContainEqual(expect.stringContaining('thick'));
    expect(validateObstacle({ ...BAR, rps: 0 })).toContainEqual(expect.stringContaining('rps')); // a bar that never turns is not an obstacle
    expect(validateObstacle({ ...HAMMER, period: 0 })).toContainEqual(expect.stringContaining('period'));
    expect(validateObstacle({ ...HAMMER, head: 0 })).toContainEqual(expect.stringContaining('head'));
    expect(validateObstacle({ ...HAMMER, ampDeg: 0 })).toContainEqual(expect.stringContaining('ampDeg'));
    expect(validateObstacle({ ...HAMMER, ampDeg: 180 })).toContainEqual(expect.stringContaining('ampDeg')); // a hammer that goes over the top
    expect(validateObstacle({ ...PUSHER, w: 0 })).toContainEqual(expect.stringContaining('w'));
    expect(validateObstacle({ ...PUSHER, period: -2 })).toContainEqual(expect.stringContaining('period'));
    expect(validateObstacle({ ...PLATFORM, dx: 0, dy: 0 })).toContainEqual(expect.stringContaining('dx'));
  });

  it('reports every problem at once', () => {
    expect(validateObstacle({ type: 'swinging-hammer' }).length).toBeGreaterThanOrEqual(4);
  });
});
