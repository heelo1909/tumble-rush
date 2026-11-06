/**
 * Every physics / feel number for the runner (HANDOFF 5.1, src/game/CLAUDE.md feel targets).
 * Distances are in tiles, times in seconds, speeds in tiles/s. One place to tune.
 * @module logic/tuning
 */

/** Pixels per tile at the 960x540 base resolution. */
export const TILE = 48;
/** Fixed physics step: the game runs Matter at 60 Hz (src/game/CLAUDE.md rule 4). */
export const STEP = 1 / 60;

/**
 * @typedef {object} Tuning
 * @property {number} runSpeed top running speed
 * @property {number} runAccel acceleration while a direction is held (0.25 s to top speed)
 * @property {number} runDecel deceleration with no direction held
 * @property {number} airAccelFactor share of runAccel/runDecel available in the air
 * @property {number} gravity downward acceleration (tiles/s^2)
 * @property {number} jumpSpeed upward launch speed (apex = jumpSpeed^2 / 2 / gravity)
 * @property {number} diveSpeed forward speed of the dive lunge
 * @property {number} diveTime how long the lunge lasts
 * @property {number} diveHop small upward kick when diving from the ground
 * @property {number} diveCooldown minimum time between dives
 * @property {number} tumbleTime rotation unlocked, no control (HANDOFF 5.1: 0.8 s)
 * @property {number} springTime upright again, eased, control returns at the end
 * @property {number} tumbleDrag horizontal slow-down while tumbling (1/s, exponential)
 * @property {number} hitSpeed default horizontal speed of a big hit
 * @property {number} hitLift default upward speed of a big hit
 * @property {number} hitSpin spin of a big hit (rad/s)
 * @property {number} hitMinSpeed an obstacle must move faster than this (tiles/s) at the point it touches a runner to count as a hit, not a brush
 * @property {number} hitSideRatio an obstacle moving more up or down than this share of its speed (sideways speed below this fraction) throws a runner away from its middle instead of the way it moves
 * @property {number} hitImmunity after a hit nothing can hit the runner again for this long (s): longer than the tumble and spring-up, so one swing cannot chain-tumble
 * @property {number} bodyW body width (tiles)
 * @property {number} bodyH body height (tiles)
 * @property {number} groundedMaxRise a runner rising faster than this (tiles/s) is not "on the ground"
 * @property {number} probeInsetPx the ground probe under the feet stops this far in from each side (pixels), so a wall is not ground
 * @property {number} probeAbovePx how far the probe reaches up into the feet (pixels)
 * @property {number} probeBelowPx how far the probe reaches down below the feet (pixels): a jump-forgiveness number
 * @property {number} diveLean how far the picture leans forward in a dive (radians; the body stays upright)
 */

/** @type {Readonly<Tuning>} */
export const TUNING = Object.freeze({
  runSpeed: 6.5,
  runAccel: 26,
  runDecel: 45,
  airAccelFactor: 0.25,
  gravity: 34,
  jumpSpeed: 11.66,
  diveSpeed: 11,
  diveTime: 0.28,
  diveHop: 3,
  diveCooldown: 0.6,
  tumbleTime: 0.8,
  springTime: 0.25,
  tumbleDrag: 2.5,
  hitSpeed: 13,
  hitLift: 5,
  hitSpin: 14,
  hitMinSpeed: 2,
  hitSideRatio: 0.4,
  hitImmunity: 1.5,
  bodyW: 0.8,
  bodyH: 1.1,
  groundedMaxRise: 1,
  probeInsetPx: 3,
  probeAbovePx: 2,
  probeBelowPx: 4,
  diveLean: 1.15,
});

/** Gravity in Matter's own unit (gravity.y with the default scale 0.001): pixels/s^2 divided by 1000. */
export function matterGravity(t = TUNING) {
  return (t.gravity * TILE) / 1000;
}

/** Highest point of a jump above take-off, in tiles. */
export function jumpApex(t = TUNING) {
  return (t.jumpSpeed * t.jumpSpeed) / (2 * t.gravity);
}

/** Time a jump from flat ground spends in the air, in seconds. */
export function jumpAirTime(t = TUNING) {
  return (2 * t.jumpSpeed) / t.gravity;
}
