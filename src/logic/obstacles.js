/**
 * The race-clock obstacles (HANDOFF 5.2, G2a): spinning bar, swinging hammer, pusher wall, moving platform.
 * Each one's place is a pure function of race time, `pose(type, params, t)`, so every laptop shows it in the
 * same place at the same moment with nothing sent over the network. src/game only reads these every step
 * and sets a static body's position and angle from them (src/game/CLAUDE.md rule 2): no obstacle motion
 * is written in the game folder.
 *
 * Units: tiles and radians (the game multiplies by TILE). y points down and a positive angle turns
 * clockwise on screen, like Phaser and Matter. `col` and `row` are the CENTRE of the thing in tiles
 * (fractions allowed), not the top-left corner that ground blocks use. For a bar and a hammer it is the pivot.
 *
 * Before the race starts (t < 0, the countdown) every obstacle holds still at its t = 0 pose.
 * @module logic/obstacles
 */
import { TUNING } from './tuning.js';
import { canBeHit } from './runner.js';

const TAU = Math.PI * 2;
/** The obstacle types this module knows (HANDOFF 5.2; the contact obstacles come in G2b). */
export const OBSTACLE_TYPES = Object.freeze(['spinning-bar', 'swinging-hammer', 'pusher-wall', 'moving-platform']);
/** Bar thickness and hammer head size when a course does not say (tiles). */
export const DEFAULT_THICK = 0.35;
export const DEFAULT_HEAD = 1.4;
/** Only these knock a runner into a tumble. A pusher wall pushes and a platform carries: physics does both. */
const HITTERS = new Set(['spinning-bar', 'swinging-hammer']);
/** Step used to turn a pose into a speed (seconds). */
const DT = 1e-5;

/**
 * @typedef {object} Pose where an obstacle is (tiles, radians)
 * @property {number} x centre x (the head for a hammer)
 * @property {number} y centre y
 * @property {number} angle rotation, clockwise positive
 */

/** Phase of a periodic motion in turns: time / period, plus the course's phase. Held at t = 0 while the clock is negative. */
const turns = (t, period, phase = 0) => (t > 0 ? t : 0) / period + phase;

/** Slide out and back along (dx, dy): a sine ease, so it starts and ends each trip at rest. */
function slide(p, t) {
  const s = 0.5 - 0.5 * Math.cos(TAU * turns(t, p.period, p.phase));
  return { x: p.col + p.dx * s, y: p.row + p.dy * s, angle: 0 };
}

const POSES = {
  'spinning-bar': (p, t) => ({ x: p.col, y: p.row, angle: TAU * ((t > 0 ? t : 0) * p.rps + (p.phase ?? 0)) }),
  'swinging-hammer': (p, t) => {
    const a = ((p.ampDeg * Math.PI) / 180) * Math.sin(TAU * turns(t, p.period, p.phase));
    // the head hangs one arm length below the pivot, tipped round it by the angle
    return { x: p.col - p.length * Math.sin(a), y: p.row + p.length * Math.cos(a), angle: a };
  },
  'pusher-wall': slide,
  'moving-platform': slide,
};

/**
 * Where an obstacle is at race time t.
 * @param {string} type one of OBSTACLE_TYPES
 * @param {Record<string, any>} params the obstacle as written in the course
 * @param {number} t race time in seconds (negative = countdown: holds at the t = 0 pose)
 * @returns {Pose}
 */
export function pose(type, params, t) {
  if (!Object.hasOwn(POSES, type)) throw new Error(`unknown obstacle type "${type}"`);
  return POSES[type](params, t);
}

/**
 * How fast a point that is rigidly fixed to the obstacle is moving at time t (tiles/s). The point is
 * given where it is in the world right now, so a runner's position tells how hard the swing that is
 * touching it is moving there.
 * @param {string} type
 * @param {Record<string, any>} params
 * @param {number} t
 * @param {number} px world x of the point (tiles)
 * @param {number} py world y of the point (tiles)
 * @returns {{vx: number, vy: number}}
 */
export function velocityAt(type, params, t, px, py) {
  if (!(t >= 0)) return { vx: 0, vy: 0 }; // the countdown: nothing moves
  // where the point sits in the body's own frame now, carried to where the body is a hair before and after
  const c = pose(type, params, t);
  const dx = px - c.x;
  const dy = py - c.y;
  const cc = Math.cos(c.angle);
  const sc = Math.sin(c.angle);
  const lx = dx * cc + dy * sc;
  const ly = -dx * sc + dy * cc;
  const t0 = Math.max(0, t - DT);
  const t1 = t + DT;
  const p0 = pose(type, params, t0);
  const p1 = pose(type, params, t1);
  const c0 = Math.cos(p0.angle);
  const s0 = Math.sin(p0.angle);
  const c1 = Math.cos(p1.angle);
  const s1 = Math.sin(p1.angle);
  const span = t1 - t0;
  return {
    vx: (p1.x + lx * c1 - ly * s1 - (p0.x + lx * c0 - ly * s0)) / span,
    vy: (p1.y + lx * s1 + ly * c1 - (p0.y + lx * s0 + ly * c0)) / span,
  };
}

/**
 * Does the obstacle knock a runner at (px, py) into a tumble right now, and which way? A bar or a hammer
 * moving faster than TUNING.hitMinSpeed does. It sends the runner the way it is moving; if it is moving mostly
 * up or down it throws the runner away from its own middle. Anything slower is a brush, not a hit.
 * @returns {{dir: 1 | -1, speed: number} | null}
 */
export function hitFrom(type, params, t, px, py) {
  if (!HITTERS.has(type)) return null;
  const { vx, vy } = velocityAt(type, params, t, px, py);
  const speed = Math.hypot(vx, vy);
  if (!(speed >= TUNING.hitMinSpeed)) return null;
  const dir = Math.abs(vx) >= TUNING.hitSideRatio * speed ? Math.sign(vx) : px >= pose(type, params, t).x ? 1 : -1;
  return { dir: /** @type {1 | -1} */ (dir), speed };
}

/**
 * A runner (its state, and where it is) touches an obstacle at race time t: does it get hit? Not while it is
 * still immune from the last hit (TUNING.hitImmunity), otherwise exactly what hitFrom says.
 * @param {import('./runner.js').RunnerState} state
 * @returns {{by: string, dir: 1 | -1, speed: number} | null}
 */
export function hitOnContact(state, type, params, t, px, py) {
  if (!canBeHit(state)) return null;
  const hit = hitFrom(type, params, t, px, py);
  return hit ? { by: type, dir: hit.dir, speed: hit.speed } : null;
}

/** The box an obstacle collides as, in tiles. */
export function bodySize(type, params) {
  if (type === 'spinning-bar') return { w: params.length, h: params.thick ?? DEFAULT_THICK };
  if (type === 'swinging-hammer') {
    const head = params.head ?? DEFAULT_HEAD;
    return { w: head, h: head };
  }
  return { w: params.w, h: params.h };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// what each type needs: required numbers, optional numbers, and which must be above 0 or not 0
const SPECS = {
  'spinning-bar': { need: ['col', 'row', 'length', 'rps'], opt: ['thick', 'phase'], positive: ['length', 'thick'], nonzero: ['rps'] },
  'swinging-hammer': { need: ['col', 'row', 'length', 'ampDeg', 'period'], opt: ['head', 'phase'], positive: ['length', 'head', 'period', 'ampDeg'], nonzero: [] },
  'pusher-wall': { need: ['col', 'row', 'w', 'h', 'dx', 'dy', 'period'], opt: ['phase'], positive: ['w', 'h', 'period'], nonzero: [] },
  'moving-platform': { need: ['col', 'row', 'w', 'h', 'dx', 'dy', 'period'], opt: ['phase'], positive: ['w', 'h', 'period'], nonzero: [] },
};

/**
 * Check one obstacle as written in a course.
 * @param {unknown} o
 * @returns {string[]} one plain sentence per problem; empty means it is good
 */
export function validateObstacle(o) {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return ['obstacle must be an object'];
  const ob = /** @type {Record<string, any>} */ (o);
  const spec = Object.hasOwn(SPECS, ob.type) ? SPECS[ob.type] : undefined;
  if (!spec) return [`type must be one of: ${OBSTACLE_TYPES.join(', ')}`];
  const errors = [];
  for (const key of [...spec.need, ...spec.opt]) {
    const present = ob[key] !== undefined;
    if (!present && spec.need.includes(key)) errors.push(`${key} is missing`);
    else if (present && !isNum(ob[key])) errors.push(`${key} must be a finite number`);
    else if (present && spec.positive.includes(key) && !(ob[key] > 0)) errors.push(`${key} must be above 0`);
    else if (present && spec.nonzero.includes(key) && ob[key] === 0) errors.push(`${key} must not be 0 (it would never move)`);
  }
  if (ob.type === 'swinging-hammer' && isNum(ob.ampDeg) && ob.ampDeg >= 180) errors.push('ampDeg must be below 180 (a hammer that goes over the top is not a swing)');
  if ((ob.type === 'pusher-wall' || ob.type === 'moving-platform') && ob.dx === 0 && ob.dy === 0) errors.push('dx and dy cannot both be 0 (it would not move)');
  return errors;
}
