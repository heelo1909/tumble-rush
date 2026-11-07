/**
 * One runner's race as a pure state machine (HANDOFF 5.1, 5.4): the 3-2-1 countdown, the race clock, checkpoints
 * and the respawn after a fall. The game calls stepRace once per fixed physics step with where the runner is and
 * applies the events it returns (G3b adds the finish and the results here). Nothing in this file knows Phaser,
 * Matter, keys or the wall clock: positions are in tiles, y points down, time is a number the caller advances.
 * @module logic/race
 */
import { TUNING, STEP } from './tuning.js';

/** @typedef {'countdown' | 'racing'} Phase */
/** @typedef {{phase: Phase, t: number, checkpoint: number, falls: number, out: {left: number} | null}} RaceState t: race time in seconds, negative in the countdown; checkpoint: index of the last one passed, -1 = only the start; out: set while a runner who fell waits to be put back, `left` seconds to go */
/** @typedef {{type: 'go'} | {type: 'checkpoint', index: number} | {type: 'fall'} | {type: 'respawn', checkpoint: number, col: number, row: number}} RaceEvent */

const EPS = 1e-9;

/**
 * @param {import('./tuning.js').Tuning} [T]
 * @returns {RaceState}
 */
export function newRace(T = TUNING) {
  return { phase: 'countdown', t: -T.countdown, checkpoint: -1, falls: 0, out: null };
}

/**
 * May the runner steer right now? Not during the countdown (everyone starts together), and not while waiting to
 * be put back after a fall.
 * @param {RaceState} state
 */
export function controlsLive(state) {
  return state.phase === 'racing' && state.out === null;
}

/**
 * One fixed step of the race.
 * @param {RaceState} state
 * @param {{x: number, y: number}} runner the runner's centre, in tiles
 * @param {{rows: number, spawn: {col: number, row: number}, checkpoints?: {col: number, row: number}[]}} course
 * @param {number} [dt]
 * @param {import('./tuning.js').Tuning} [T]
 * @returns {{state: RaceState, events: RaceEvent[]}}
 */
export function stepRace(state, runner, course, dt = STEP, T = TUNING) {
  /** @type {RaceEvent[]} */
  const events = [];
  let { phase, t, checkpoint, falls, out } = state;
  t += dt;

  if (phase === 'countdown') {
    if (t >= -EPS) {
      phase = 'racing';
      t = Math.max(t, 0);
      events.push({ type: 'go' });
    }
    return { state: { phase, t, checkpoint, falls, out }, events };
  }

  const checkpoints = course.checkpoints ?? [];
  if (out !== null) {
    // Fallen: wait the delay, then put the runner back at the last checkpoint (or the start).
    const left = out.left - dt;
    if (left <= EPS) {
      const at = checkpoint >= 0 ? checkpoints[checkpoint] : course.spawn;
      events.push({ type: 'respawn', checkpoint, col: at.col, row: at.row });
      out = null;
    } else {
      out = { left };
    }
  } else if (runner.y > course.rows) {
    falls += 1;
    out = { left: T.respawnDelay };
    events.push({ type: 'fall' });
  } else {
    // A checkpoint counts when the runner reaches the middle of its tile; one flown over still counts, in order.
    while (checkpoint + 1 < checkpoints.length && runner.x >= checkpoints[checkpoint + 1].col + 0.5) {
      checkpoint += 1;
      events.push({ type: 'checkpoint', index: checkpoint });
    }
  }
  return { state: { phase, t, checkpoint, falls, out }, events };
}
