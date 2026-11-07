/**
 * What the race clock says, as text for the HUD (HANDOFF 5.4). Race time is a plain number of seconds, negative
 * during the 3-2-1 countdown and 0 at the start; where that number comes from (G3a: the physics steps; N2: a clock
 * shared with the host) is the scene's business, not this file's. Clock-offset math arrives with N2.
 * @module logic/clock
 */
import { TUNING } from './tuning.js';

/** Race time is a sum of 1/60 steps, so it carries float noise: a time that should sit on a boundary can be a hair under it. */
const EPS = 1e-9;

/**
 * The tenth of a second a race time falls in: what the timer text shows, and the moment the HUD has to be redrawn.
 * A time a hair under a tenth boundary counts as on it. The countdown word changes only on these boundaries too.
 * @param {number} t race time in seconds
 * @returns {number}
 */
export function raceTenth(t) {
  return Math.floor(t * 10 + EPS);
}

/**
 * The big countdown word for a race time: "3", "2", "1" in the last three seconds before the start, "GO!" for
 * TUNING.goShown seconds after it, otherwise nothing.
 * @param {number} t race time in seconds (negative before the start)
 * @param {import('./tuning.js').Tuning} [T]
 * @returns {string}
 */
export function countdownLabel(t, T = TUNING) {
  if (typeof t !== 'number' || Number.isNaN(t)) return '';
  const u = t + EPS; // the same float-noise allowance as raceTenth, so the word changes on the very step the tenth does
  if (u < 0) return u >= -T.countdown ? String(Math.ceil(-u)) : '';
  return u < T.goShown ? 'GO!' : '';
}

/**
 * The falls line on the results (G3b): "No falls", "1 fall", "3 falls". Anything that is not a count above zero reads
 * "No falls", and a fraction counts down to a whole number.
 * @param {number} n how many times the runner fell off the course
 * @returns {string}
 */
export function fallsLabel(n) {
  const count = typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (count === 0) return 'No falls';
  return count === 1 ? '1 fall' : `${count} falls`;
}

/**
 * The timer as m:ss.t. Tenths are cut, not rounded, so the timer never shows more time than has passed.
 * Zero before the start and for anything that is not a time.
 * @param {number} t race time in seconds
 * @returns {string}
 */
export function formatRaceTime(t) {
  const seconds = typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : 0;
  const tenths = raceTenth(seconds);
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${tenths % 10}`;
}
