/**
 * The runner's rules as a pure state machine (HANDOFF 5.1). The game calls stepRunner once per fixed
 * physics step with the intent and what the body is doing, and applies the velocities it returns.
 * Nothing here knows about Phaser, Matter, keys or time: speeds are tiles/s, y points down.
 * @module logic/runner
 */
import { TUNING, STEP } from './tuning.js';

/** @typedef {{left: boolean, right: boolean, jump: boolean, dive: boolean}} Intent */
/** @typedef {'run' | 'dive' | 'tumble' | 'spring'} Mode */
/** @typedef {{mode: Mode, t: number, facing: 1 | -1, diveDir: 1 | -1, prevJump: boolean, prevDive: boolean, diveCd: number}} RunnerState */
/** @typedef {{vx: number, vy: number, grounded: boolean}} Probe what the body is doing right now */
/** @typedef {{state: RunnerState, vx: number | null, vy: number | null, events: string[]}} StepResult null = leave it to physics */

/** @type {Readonly<Intent>} */
export const NO_INTENT = Object.freeze({ left: false, right: false, jump: false, dive: false });

const EPS = 1e-9;

/** @param {1 | -1} [facing] @returns {RunnerState} */
export function newRunnerState(facing = 1) {
  return { mode: 'run', t: 0, facing, diveDir: facing, prevJump: false, prevDive: false, diveCd: 0 };
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

  return { state: { mode, t, facing, diveDir, prevJump: !!intent.jump, prevDive: !!intent.dive, diveCd }, vx, vy, events };
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
    state: { ...state, mode: /** @type {Mode} */ ('tumble'), t: 0 },
    vx: dir * (hit.speed ?? T.hitSpeed),
    vy: -(hit.lift ?? T.hitLift),
    spin: dir * (hit.spin ?? T.hitSpin),
    events: ['tumble'],
  };
}
