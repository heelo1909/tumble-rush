/**
 * A headless simulation of one runner on flat ground (y = 0, y points down, so a jump is negative y).
 * It runs the SAME stepRunner the game uses, with a plain gravity-and-floor model instead of Matter.
 * Unit tests and the g1 smoke check use it to prove the feel targets; the game never does. The real
 * engine is proven by tests/e2e/runner.spec.js, which asserts the same targets in real browsers.
 * @module logic/runnerSim
 */
import { TUNING, STEP } from './tuning.js';
import { newRunnerState, stepRunner, applyHit, NO_INTENT } from './runner.js';

/**
 * @param {object} opts
 * @param {number} [opts.seconds]
 * @param {(step: number, body: object) => Partial<import('./runner.js').Intent>} [opts.intentAt]
 * @param {{step: number, dir?: number}[]} [opts.hits] big hits at given step numbers
 * @param {{x?: number, vx?: number, facing?: 1 | -1}} [opts.start]
 * @param {import('./tuning.js').Tuning} [opts.T]
 */
export function simulate({ seconds = 2, intentAt = () => NO_INTENT, hits = [], start = {}, T = TUNING } = {}) {
  let state = newRunnerState(start.facing ?? 1);
  let x = start.x ?? 0;
  let y = 0;
  let vx = start.vx ?? 0;
  let vy = 0;
  const steps = Math.round(seconds / STEP);
  const trace = [];
  const events = [];

  for (let i = 0; i < steps; i++) {
    const t = i * STEP;
    for (const h of hits) {
      if (h.step !== i) continue;
      const r = applyHit(state, h, T);
      state = r.state;
      vx = r.vx;
      vy = r.vy;
      for (const type of r.events) events.push({ t, type, x });
    }
    const grounded = y >= 0 && vy > -T.groundedMaxRise;
    const r = stepRunner(state, intentAt(i, { x, y, vx, vy, mode: state.mode, grounded }), { vx, vy, grounded }, STEP, T);
    state = r.state;
    if (r.vx !== null) vx = r.vx;
    if (r.vy !== null) vy = r.vy;
    for (const type of r.events) events.push({ t, type, x });

    vy += T.gravity * STEP;
    x += vx * STEP;
    y += vy * STEP;
    if (y >= 0 && vy >= 0) {
      y = 0;
      vy = 0;
    }
    trace.push({ i, t: (i + 1) * STEP, x, y, vx, vy, mode: state.mode, grounded });
  }
  return { trace, events };
}
