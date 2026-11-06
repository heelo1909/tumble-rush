/**
 * The runner's rules as a pure state machine (HANDOFF 5.1). The game calls stepRunner once per fixed
 * physics step with the intent and what the body is doing, and applies the velocities it returns.
 * Nothing here knows about Phaser, Matter, keys or time: speeds are tiles/s, y points down.
 * @module logic/runner
 */
import { TUNING, STEP } from './tuning.js';

/** @typedef {{left: boolean, right: boolean, jump: boolean, dive: boolean}} Intent */
/** @typedef {'run' | 'dive' | 'tumble' | 'spring'} Mode */
/** @typedef {{mode: Mode, t: number, facing: 1 | -1, diveDir: 1 | -1, prevJump: boolean, prevDive: boolean, diveCd: number, hitCd: number}} RunnerState hitCd: seconds left in which nothing can hit the runner again */
/** @typedef {{vx: number, vy: number, grounded: boolean}} Probe what the body is doing right now */
/** @typedef {{state: RunnerState, vx: number | null, vy: number | null, events: string[]}} StepResult null = leave it to physics */

/** @type {Readonly<Intent>} */
export const NO_INTENT = Object.freeze({ left: false, right: false, jump: false, dive: false });

const EPS = 1e-9;

/** @param {1 | -1} [facing] @returns {RunnerState} */
export function newRunnerState(facing = 1) {
  return { mode: 'run', t: 0, facing, diveDir: facing, prevJump: false, prevDive: false, diveCd: 0, hitCd: 0 };
}

const approach = (v, target, delta) => (v < target ? Math.min(v + delta, target) : Math.max(v - delta, target));

/** Horizontal control: speed up towards the held direction, brake harder when turning round, slow down when idle. */
function steer(vx, dir, grounded, dt, T) {
  const turning = dir !== 0 && Math.sign(vx) === -dir;
  const rate = (dir === 0 || turning ? T.runDecel : T.runAccel) * (grounded ? 1 : T.airAccelFactor);
  return approach(vx, dir * T.runSpeed, rate * dt);
}

/**
 * One fixed step of the runner.
 * @param {RunnerState} state
 * @param {Partial<Intent>} intent
 * @param {Probe} probe
 * @param {number} [dt]
 * @param {import('./tuning.js').Tuning} [T]
 * @returns {StepResult}
 */
export function stepRunner(state, intent, probe, dt = STEP, T = TUNING) {
  const dir = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);
  const facing = dir !== 0 ? dir : state.facing;
  const jumpPressed = !!intent.jump && !state.prevJump;
  const divePressed = !!intent.dive && !state.prevDive;
  let { mode } = state;
  let t = state.t + dt;
  let diveCd = Math.max(0, state.diveCd - dt);
  const hitCd = Math.max(0, state.hitCd - dt);
  let diveDir = state.diveDir; // a dive keeps the way it started: steering the other way mid-lunge does not turn it round
  let vx = null;
  let vy = null;
  const events = [];

  if (mode === 'tumble') {
    if (divePressed && diveCd <= 0) {
      // A dive is the fastest way to get up (HANDOFF 5.1): skip the rest of the tumble.
      mode = 'spring';
      t = 0;
      diveCd = T.diveCooldown;
      diveDir = facing;
      vx = diveDir * T.diveSpeed;
      events.push('dive', 'spring');
    } else if (t >= T.tumbleTime - EPS) {
      mode = 'spring';
      t = 0;
      events.push('spring');
    } else {
      vx = probe.vx * Math.exp(-T.tumbleDrag * dt);
    }
  } else if (mode === 'dive') {
    vx = diveDir * T.diveSpeed;
    if (t >= T.diveTime - EPS) {
      mode = 'run';
      t = 0;
      events.push('run');
    }
  } else if (mode === 'spring') {
    vx = steer(probe.vx, dir, probe.grounded, dt, T);
    if (t >= T.springTime - EPS) {
      mode = 'run';
      t = 0;
      events.push('run');
    }
  } else if (divePressed && diveCd <= 0) {
    mode = 'dive';
    t = 0;
    diveCd = T.diveCooldown;
    diveDir = facing;
    vx = diveDir * T.diveSpeed;
    if (probe.grounded) vy = -T.diveHop;
    events.push('dive');
  } else {
    vx = steer(probe.vx, dir, probe.grounded, dt, T);
    if (jumpPressed && probe.grounded) {
      vy = -T.jumpSpeed;
      events.push('jump');
    }
  }

  return { state: { mode, t, facing, diveDir, prevJump: !!intent.jump, prevDive: !!intent.dive, diveCd, hitCd }, vx, vy, events };
}

/**
 * The same step for a runner standing on ground that moves (a platform now, a conveyor in G2b). The rules run in
 * the ground's own frame: how fast the runner moves is measured against the ground, so one standing still on a
 * platform rides along instead of sliding off its back, and a jump carries the platform's speed. While in the
 * air the ground does not count. A null (leave it to physics) stays null.
 * @param {RunnerState} state
 * @param {Partial<Intent>} intent
 * @param {Probe} probe the runner's own velocity in the world
 * @param {{vx: number, vy: number}} ground the velocity of what is under the feet
 * @param {number} [dt]
 * @param {import('./tuning.js').Tuning} [T]
 * @returns {StepResult} velocities in the world frame
 */
export function stepRunnerOn(state, intent, probe, ground, dt = STEP, T = TUNING) {
  if (!probe.grounded || (ground.vx === 0 && ground.vy === 0)) return stepRunner(state, intent, probe, dt, T);
  const r = stepRunner(state, intent, { vx: probe.vx - ground.vx, vy: probe.vy - ground.vy, grounded: true }, dt, T);
  return { ...r, vx: r.vx === null ? null : r.vx + ground.vx, vy: r.vy === null ? null : r.vy + ground.vy };
}

/** Can an obstacle hit this runner now? Not while it is still immune from the last hit. */
export function canBeHit(state) {
  return state.hitCd <= 0;
}

/**
 * A big hit (hammer, spinning bar): start the tumble. The caller sets the returned velocity and spin on the body.
 * @param {RunnerState} state
 * @param {{dir?: number, speed?: number, lift?: number, spin?: number}} [hit]
 * @param {import('./tuning.js').Tuning} [T]
 */
export function applyHit(state, hit = {}, T = TUNING) {
  const dir = hit.dir !== undefined && hit.dir < 0 ? -1 : 1;
  return {
    state: { ...state, mode: /** @type {Mode} */ ('tumble'), t: 0, hitCd: T.hitImmunity },
    vx: dir * (hit.speed ?? T.hitSpeed),
    vy: -(hit.lift ?? T.hitLift),
    spin: dir * (hit.spin ?? T.hitSpin),
    events: ['tumble'],
  };
}
