import { TILE } from '../../src/logic/tuning.js';
import { groundGaps } from '../../src/logic/course.js';

/**
 * The test player (G3c). It plays a race the way a kid with a keyboard does, with REAL key presses (page.keyboard):
 * it holds ArrowRight, taps Space just before each pit, taps Shift to get up after a hit, and otherwise just runs.
 * It looks at the game through `__TR.state()` and at the course JSON, never at obstacle poses: it does not dodge
 * anything, so a spinning bar may knock it about, and a miss costs a fall and a try from the last flag, as for a
 * person. It never uses __TR.teleport, clock, hit or autopilot (tests/e2e/CLAUDE.md rule 1). B1 builds the real bot
 * brain in src/bots; this is only what the e2e needs to finish a course.
 * @module tests/e2e/player
 */

/** A running jump takes off this many tiles before the edge of a pit and lands about 4.3 tiles on (G3b measured it). */
export const JUMP_AT = 0.6;
/** ...and still clears a 3-tile pit when the poll sees the runner this far past the edge (the feet leave the ground at about 0.4). */
export const JUMP_LATE = 0.25;

/** The pits a runner has to jump: the gaps in the ground that no row of falling tiles bridges. */
export function pitsToJump(course) {
  const tileRows = (course.obstacles ?? []).filter((o) => o.type === 'falling-tiles').map((o) => [o.col - o.count / 2, o.col + o.count / 2]);
  return groundGaps(course).filter((g) => !tileRows.some(([a, b]) => a < g.to && b > g.from));
}

/**
 * Play until the line is crossed (`race.phase === 'finished'`), then let go of the keys.
 * @param {import('@playwright/test').Page} page the game, already in the race scene
 * @param {object} course the course JSON being played
 * @param {{ onTick?: (s: any) => Promise<void> | void, timeoutMs?: number, maxFalls?: number }} [opts] `onTick` sees
 *   every state read (the spec takes its screenshots there; it must not do so just before a pit); `timeoutMs` is
 *   wall-clock; `maxFalls` is how many falls it takes before it gives up (a course or a player that cannot get over
 *   something fails in about half a minute, not at the timeout)
 * @returns {Promise<{ polls: number, taps: { jump: number, dive: number } }>}
 */
export async function playRace(page, course, { onTick, timeoutMs = 120000, maxFalls = 8 } = {}) {
  const pits = pitsToJump(course);
  const jumped = new Set();
  const taps = { jump: 0, dive: 0 };
  let held = false;
  let gotUp = false; // one Shift per tumble
  let polls = 0;
  const started = Date.now();
  try {
    for (;;) {
      const s = await page.evaluate(() => window.__TR.state());
      polls++;
      const race = s.race;
      const me = s.runners[0];
      if (!race || !me) throw new Error('the test player needs the race flow (a race scene with a runner)');
      if (race.phase === 'finished') break;
      if (race.falls > maxFalls) throw new Error(`the test player fell ${race.falls} times and gave up (at x ${(me.x / TILE).toFixed(1)}, last flag ${race.checkpoint})`);
      if (Date.now() - started > timeoutMs) throw new Error(`the test player did not finish in ${timeoutMs / 1000} s (at x ${(me.x / TILE).toFixed(1)}, ${race.falls} falls)`);

      if (race.phase === 'racing' && race.respawnIn === null) {
        if (!held) {
          await page.keyboard.down('ArrowRight');
          held = true;
        }
        const x = me.x / TILE;
        for (let i = 0; i < pits.length; i++) {
          const pit = pits[i];
          if (x < pit.from - 2) jumped.delete(i); // put back before it after a fall: take the run-up again
          if (!jumped.has(i) && me.grounded && me.mode === 'run' && x >= pit.from - JUMP_AT && x < pit.from + JUMP_LATE) {
            await page.keyboard.press('Space');
            taps.jump++;
            jumped.add(i);
          }
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
      }
      if (onTick) await onTick(s);
    }
  } finally {
    // letting go must never hide why the player stopped: if the page is already gone, the first error is the one to see
    if (held) await page.keyboard.up('ArrowRight').catch(() => {});
  }
  return { polls, taps };
}
