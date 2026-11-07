/**
 * The contact obstacles (HANDOFF 5.2, G2b): bounce pad, seesaw, conveyor belt, falling tiles. Unlike the
 * race-clock obstacles in obstacles.js they have no pose = f(t): what they do depends on who touches them.
 * Their rules are pure and live here (a launch speed, a belt's surface speed, a tile's state machine, a seesaw's
 * stop and spring); src/game/obstacles only applies them to Matter bodies.
 *
 * Units: tiles, seconds, radians; y points down. `col` and `row` are the CENTRE of the thing in tiles (fractions
 * allowed), like the race-clock obstacles (PROGRESS Decision 36); for a seesaw that is the pivot.
 * @module logic/contact
 */
import { TUNING } from './tuning.js';

/** The contact obstacle types (HANDOFF 5.2). */
export const CONTACT_TYPES = Object.freeze(['bounce-pad', 'seesaw', 'conveyor', 'falling-tiles']);
/** Thickness (tiles) of each thing when a course does not say. */
export const PAD_H = 0.4;
export const SEESAW_THICK = 0.4;
export const BELT_H = 0.5;
export const TILE_H = 0.5;
/** Most tiles in one row of falling tiles. */
export const MAX_TILES = 12;
/** A pad cannot launch harder than this many times the usual: past it, it is a cannon. */
export const MAX_PAD_POWER = 2;
/** ...nor softer than this: a weaker pad would throw the runner up and then throw them again from the same spot (the pad is 0.4 tile thick). */
export const MIN_PAD_POWER = 0.4;
/** The thinnest anything may be, in tiles: a runner would fall through a sliver. */
export const MIN_SIZE = 0.1;

const EPS = 1e-6;

/**
 * The box of an obstacle's main body, in tiles. For falling tiles it is ONE tile of the row.
 * @param {string} type one of CONTACT_TYPES
 * @param {Record<string, any>} p the obstacle as written in the course
 * @returns {{w: number, h: number}}
 */
export function contactSize(type, p) {
  switch (type) {
    case 'bounce-pad': return { w: p.w, h: PAD_H };
    case 'seesaw': return { w: p.length, h: p.thick ?? SEESAW_THICK };
    case 'conveyor': return { w: p.w, h: p.h ?? BELT_H };
    case 'falling-tiles': return { w: 1, h: p.h ?? TILE_H };
    default: throw new Error(`unknown contact obstacle type "${type}"`);
  }
}

/**
 * The box everything of this obstacle stays inside, in tiles (a seesaw's tilt and a row of tiles included).
 * @returns {{x0: number, y0: number, x1: number, y1: number}}
 */
export function contactBounds(type, p, T = TUNING) {
  const { w, h } = contactSize(type, p);
  let halfW = w / 2;
  let halfH = h / 2;
  if (type === 'falling-tiles') halfW = p.count / 2;
  if (type === 'seesaw') halfH = (p.length / 2) * Math.sin(T.seesawMaxTilt) + h / 2;
  return { x0: p.col - halfW, y0: p.row - halfH, x1: p.col + halfW, y1: p.row + halfH };
}

const SIZES = ['w', 'h', 'length', 'thick']; // keys that are a size in tiles
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// what each type needs: required numbers, optional numbers, and which must be above 0
const SPECS = {
  'bounce-pad': { need: ['col', 'row', 'w'], opt: ['power'], positive: ['w', 'power'] },
  seesaw: { need: ['col', 'row', 'length'], opt: ['thick', 'base'], positive: ['length', 'thick', 'base'] },
  conveyor: { need: ['col', 'row', 'w', 'dir'], opt: ['h', 'speed'], positive: ['w', 'h', 'speed'] },
  'falling-tiles': { need: ['col', 'row', 'count'], opt: ['h'], positive: ['h'] },
};

/**
 * Check one contact obstacle as written in a course.
 * @param {unknown} o
 * @returns {string[]} one plain sentence per problem; empty means it is good
 */
export function validateContactObstacle(o) {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return ['obstacle must be an object'];
  const ob = /** @type {Record<string, any>} */ (o);
  const spec = Object.hasOwn(SPECS, ob.type) ? SPECS[ob.type] : undefined;
  if (!spec) return [`type must be one of: ${CONTACT_TYPES.join(', ')}`];
  const errors = [];
  for (const key of [...spec.need, ...spec.opt]) {
    const present = ob[key] !== undefined;
    if (!present && spec.need.includes(key)) errors.push(`${key} is missing`);
    else if (present && !isNum(ob[key])) errors.push(`${key} must be a finite number`);
    else if (present && spec.positive.includes(key) && !(ob[key] > 0)) errors.push(`${key} must be above 0`);
    else if (present && SIZES.includes(key) && ob[key] < MIN_SIZE) errors.push(`${key} must be at least ${MIN_SIZE}`);
  }
  if (isNum(ob.dir) && ob.dir !== 1 && ob.dir !== -1) errors.push('dir must be 1 or -1');
  if (isNum(ob.count) && !(Number.isInteger(ob.count) && ob.count >= 1 && ob.count <= MAX_TILES)) errors.push(`count must be a whole number from 1 to ${MAX_TILES}`);
  if (isNum(ob.power) && ob.power > MAX_PAD_POWER) errors.push(`power must be at most ${MAX_PAD_POWER}`);
  if (isNum(ob.power) && ob.power > 0 && ob.power < MIN_PAD_POWER) errors.push(`power must be at least ${MIN_PAD_POWER}`);
  if (isNum(ob.speed) && ob.speed > 0 && ob.speed >= TUNING.runSpeed) errors.push(`speed must be under ${TUNING.runSpeed} (the run speed)`);
  return errors;
}

/**
 * Would a seesaw tip into solid ground at either of its stops (or lie in it level)? Ground blocks are
 * whole-tile `{col, row, w, h}` boxes. The plank's outline is sampled at both stops and level.
 * @param {Record<string, any>} p the seesaw as written in the course
 * @param {{col: number, row: number, w: number, h: number}[]} ground
 * @returns {boolean}
 */
export function seesawHitsGround(p, ground, T = TUNING) {
  const { w: len, h: th } = contactSize('seesaw', p);
  for (const a of [-T.seesawMaxTilt, 0, T.seesawMaxTilt]) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (let i = 0; i <= 10; i++) {
      const x = -len / 2 + (len * i) / 10;
      for (const y of [-th / 2, th / 2]) {
        const qx = p.col + x * c - y * s;
        const qy = p.row + x * s + y * c;
        if (ground.some((g) => qx > g.col + EPS && qx < g.col + g.w - EPS && qy > g.row + EPS && qy < g.row + g.h - EPS)) return true;
      }
    }
  }
  return false;
}

/**
 * A runner touches a bounce pad moving at vy (tiles/s, down positive): the new vertical speed to give it, or
 * null to leave it alone. A runner already rising fast (it was launched a moment ago and is still overlapping the
 * pad) is not launched again.
 * @param {Record<string, any>} p the pad as written in the course
 * @param {number} vy
 * @returns {number | null} tiles/s, negative = up
 */
export function bounceLaunch(p, vy, T = TUNING) {
  const speed = T.padSpeed * (p.power ?? 1);
  return vy <= -0.5 * speed ? null : -speed;
}

/**
 * How fast the top of a conveyor belt moves (tiles/s): the velocity of the ground under a runner standing on it.
 * The runner's rules run in that ground's frame (stepRunnerOn), so a runner standing still is carried and a
 * runner running keeps its run speed on top of it.
 * @param {Record<string, any>} p the belt as written in the course
 * @returns {{vx: number, vy: number}}
 */
export function beltSurface(p, T = TUNING) {
  return { vx: p.dir * (p.speed ?? T.beltSpeed), vy: 0 };
}

/**
 * A falling tile's state: `solid` (you can stand on it), `armed` (touched, shaking, still solid) or `fallen`
 * (gone). `since` is the race time it entered that phase (for `fallen`: the moment it actually dropped).
 * @typedef {{phase: 'solid' | 'armed' | 'fallen', since: number}} Tile
 */

/** @returns {Tile} */
export function newTile() {
  return { phase: 'solid', since: 0 };
}

/** Standing on it (or running into it) works while it is solid or only shaking. */
export function tileSolid(tile) {
  return tile.phase !== 'fallen';
}

/**
 * Something touches the tile at race time t. Only the FIRST touch counts: it starts the drop timer.
 * @param {Tile} tile
 * @param {number} t
 * @returns {Tile}
 */
export function touchTile(tile, t) {
  return tile.phase === 'solid' ? { phase: 'armed', since: t } : tile;
}

/**
 * One step of a tile at race time t: an armed tile drops tileDropDelay after the first touch; a fallen one comes
 * back tileRespawn after it dropped, unless something is standing in its spot (then it waits for the spot to be
 * free). Setting the clock back before the tile's last change puts it back to solid (a restart).
 * @param {Tile} tile
 * @param {number} t
 * @param {import('./tuning.js').Tuning} [T]
 * @param {() => boolean} [isBlocked] asked only when the tile is due back
 * @returns {Tile}
 */
export function stepTile(tile, t, T = TUNING, isBlocked = () => false) {
  if (tile.phase === 'solid') return tile;
  if (t < tile.since) return tile.phase === 'fallen' && isBlocked() ? tile : newTile(); // clock set back: whole again, unless a runner stands in its place
  if (tile.phase === 'armed') {
    const at = tile.since + T.tileDropDelay;
    return t >= at ? { phase: 'fallen', since: at } : tile;
  }
  if (t >= tile.since + T.tileRespawn && !isBlocked()) return { phase: 'solid', since: t };
  return tile;
}

/**
 * The seesaw's help on top of real physics: damping that calms the swing, a gentle spring that brings an EMPTY
 * plank level (with a runner on it the spring is off, so their weight keeps it tipped: the spring would otherwise
 * fight the runner), and a hard stop at the tilt limit (a plank pressed into its stop stays there; one pushed out
 * of it is held in). Matter does the tipping (the plank is a real hinged body that a runner's weight turns); this
 * is called once per fixed step with the plank's angle and angular velocity.
 * @param {number} angle radians, clockwise positive (the right end down)
 * @param {number} angVel radians per second
 * @param {number} dt seconds
 * @param {import('./tuning.js').Tuning} [T]
 * @param {boolean} [loaded] a runner is on the plank
 * @returns {{angle: number, angVel: number}}
 */
export function seesawAssist(angle, angVel, dt, T = TUNING, loaded = false) {
  let w = angVel + ((loaded ? 0 : -T.seesawLevel * angle) - T.seesawDamping * angVel) * dt;
  let a = angle;
  const max = T.seesawMaxTilt;
  if (Math.abs(a) >= max) {
    a = Math.sign(a) * max;
    if (w * Math.sign(a) > 0) w = 0; // still pushing further out: stop dead
  }
  return { angle: a, angVel: w };
}
