import { TILE } from '../../src/logic/tuning.js';
import { pitsToJump } from '../../src/logic/course.js';

/**
 * The test player (G3c). It plays a race the way a kid with a keyboard does, with REAL key presses (page.keyboard):
 * it holds ArrowRight, taps Space just before each pit, taps Shift to get up after a hit, and otherwise just runs.
 * It looks at the game through `__TR.state()` and at the course JSON, never at obstacle poses: it does not dodge
 * anything, so a spinning bar may knock it about, and a miss costs a fall and a try from the last flag, as for a
 * person. It never uses __TR.teleport, clock, hit or autopilot (tests/e2e/CLAUDE.md rule 1). B1 builds the real bot
 * brain in src/bots; this is only what the e2e needs to finish a course.
 *
 * It gives up with a message that says where it was, so a broken course or a key that does not reach the game fails
 * fast and plainly: after too many falls, when it makes no headway for a while, past a race-time limit, or past a
 * wall-clock limit.
 * @module tests/e2e/player
 */

/** A running jump takes off this many tiles before the edge of a pit and lands about 4.3 tiles on (G3b measured it). */
export const JUMP_AT = 0.6;
/** ...and still clears a 3-tile pit when the poll sees the runner this far past the edge (the feet stop counting as on the ground about 0.34 past it). */
export const JUMP_LATE = 0.25;

/** A dive can be tapped again this many seconds of race time after the last one (the cooldown is 0.6 s: tuning.js diveCooldown). */
export const DIVE_EVERY = 0.65;

/**
 * Where a runner dives through instead of running: the stretches around a bar or a hammer, from well before it (a hit
 * throws a runner back about 4.5 tiles) to just past it. A dive crosses ground at 11 tiles a second against 6.5 for a
 * run, and a hit leaves a second of immunity, so diving through is how a kid beats these. In tiles, left to right.
 * @param {any} course the course JSON
 * @returns {{from: number, to: number}[]}
 */
export function hazardZones(course) {
  return (course.obstacles ?? [])
    .filter((o) => o.type === 'spinning-bar' || o.type === 'swinging-hammer')
    .map((o) => {
      const reach = o.type === 'spinning-bar' ? o.length / 2 : o.length + (o.head ?? 1.4) / 2;
      return { from: o.col - reach - 8, to: o.col + reach + 1 };
    });
}

/**
 * Play until the line is crossed (`race.phase === 'finished'`), then let go of the keys.
 * @param {import('@playwright/test').Page} page the game, already in the race scene
 * @param {object} course the course JSON being played
 * @param {{ onTick?: (s: any) => Promise<void> | void, timeoutMs?: number, maxFalls?: number, maxRaceTime?: number, stallSeconds?: number }} [opts]
 *   `onTick` sees every state read (the spec takes its screenshots there; it must not do so just before a pit);
 *   `timeoutMs` is wall-clock and must stay under the test's own timeout, so that this message is the one that shows;
 *   `maxFalls` is how many falls it takes before it gives up; `maxRaceTime` is the race clock (seconds) it may not pass;
 *   `stallSeconds` is how many seconds of race time it may go without getting 0.5 tiles past its furthest point
 * @returns {Promise<{ polls: number, taps: { jump: number, dive: number }, longestStall: number }>} `longestStall` is the
 *   longest stretch of race time (seconds) it went without getting 0.5 tiles past its furthest point: the margin under
 *   the `stallSeconds` guard, which the spec prints
 */
export async function playRace(page, course, { onTick, timeoutMs = 170000, maxFalls = 8, maxRaceTime = 150, stallSeconds = 20 } = {}) {
  const pits = pitsToJump(course);
  const zones = hazardZones(course);
  let lastDive = -Infinity; // race time of the last dive tapped through a hazard
  const jumped = new Set();
  const taps = { jump: 0, dive: 0 };
  let held = false;
  let gotUp = false; // one Shift per tumble
  let polls = 0;
  let bestX = -Infinity; // the furthest the runner has got
  let bestAt = 0; // and the race time it got there
  let longestStall = 0;
  const started = Date.now();
  try {
    for (;;) {
      const s = await page.evaluate(() => window.__TR.state());
      polls++;
      const race = s.race;
      const me = s.runners[0];
      if (!race || !me) throw new Error('the test player needs the race flow (a race scene with a runner)');
      if (race.phase === 'finished') break;
      const x = me.x / TILE;
      const where = `at x ${x.toFixed(1)}, last flag ${race.checkpoint}, mode ${me.mode}, ${race.falls} falls, race time ${race.t.toFixed(1)}`;
      if (race.falls > maxFalls) throw new Error(`the test player fell ${race.falls} times and gave up (${where})`);
      if (race.t > maxRaceTime) throw new Error(`the test player ran out of race time (${maxRaceTime} s) (${where})`);
      if (Date.now() - started > timeoutMs) throw new Error(`the test player did not finish in ${timeoutMs / 1000} s of wall-clock time (${where})`);

      if (race.phase === 'racing' && race.respawnIn === null) {
        if (x > bestX + 0.5) {
          bestX = x;
          bestAt = race.t;
        } else if (race.t - bestAt > stallSeconds) {
          longestStall = Math.max(longestStall, race.t - bestAt);
          throw new Error(`the test player has made no headway past x ${bestX.toFixed(1)} for ${stallSeconds} s of race time: the keys may not be reaching the game (${where})`);
        }
        longestStall = Math.max(longestStall, race.t - bestAt);
        if (!held) {
          await page.keyboard.down('ArrowRight');
          held = true;
        }
        for (let i = 0; i < pits.length; i++) {
          const pit = pits[i];
          if (x < pit.from - 2) jumped.delete(i); // put back before it after a fall: take the run-up again
          if (!jumped.has(i) && me.grounded && me.mode === 'run' && x >= pit.from - JUMP_AT && x < pit.from + JUMP_LATE) {
            await page.keyboard.press('Space');
            taps.jump++;
            jumped.add(i);
          }
        }
        if (me.mode !== 'tumble' && zones.some((z) => x >= z.from && x <= z.to) && race.t - lastDive >= DIVE_EVERY) {
          await page.keyboard.press('Shift'); // dive through: faster than a run, and it makes the most of the immunity after a hit
          taps.dive++;
          lastDive = race.t;
        }
        if (me.mode === 'tumble') {
          if (!gotUp) {
            await page.keyboard.press('Shift'); // a dive gets you up faster than waiting
            taps.dive++;
            gotUp = true;
          }
        } else {
          gotUp = false;
        }
      } else {
        // the countdown and the wait to be put back after a fall have nothing to decide: do not spin the page's CPU
        await page.waitForTimeout(20);
      }
      if (onTick) await onTick(s);
    }
  } finally {
    // letting go must never hide why the player stopped: if the page is already gone, the first error is the one to see
    if (held) await page.keyboard.up('ArrowRight').catch(() => {});
  }
  return { polls, taps, longestStall };
}
