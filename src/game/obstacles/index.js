import { pose, hitOnContact, OBSTACLE_TYPES } from '../../logic/obstacles.js';
import { TILE } from '../../logic/tuning.js';
import { movePose, snapshotOf } from './common.js';
import { createSpinningBar } from './spinningBar.js';
import { createSwingingHammer } from './swingingHammer.js';
import { createPusherWall } from './pusherWall.js';
import { createMovingPlatform } from './movingPlatform.js';
import { createBouncePad } from './bouncePad.js';
import { createSeesaw } from './seesaw.js';
import { createConveyor } from './conveyor.js';
import { createFallingTiles } from './fallingTiles.js';

const MAKERS = {
  'spinning-bar': createSpinningBar,
  'swinging-hammer': createSwingingHammer,
  'pusher-wall': createPusherWall,
  'moving-platform': createMovingPlatform,
  'bounce-pad': createBouncePad,
  seesaw: createSeesaw,
  conveyor: createConveyor,
  'falling-tiles': createFallingTiles,
};
/** The obstacles whose place is a pure function of race time (src/logic/obstacles.js). The rest react to touch. */
const RACE_CLOCK = new Set(OBSTACLE_TYPES);

/**
 * Builds every obstacle of a (validated) course and keeps them where src/logic says they are.
 * An item has a `type`, its `params`, a `body` (or `bodies`), whether a runner can stand on it (`ground`), and
 * optionally `step(t)` (once per physics step), `touch(runner, t, k)` (a runner touches body k) and `snapshot()`.
 * @param {Phaser.Scene} scene
 * @param {object[]} list the course's `obstacles`
 */
export function buildObstacles(scene, list) {
  const items = list.map((params, index) => MAKERS[params.type](scene, params, index));
  const byBody = new Map();
  for (const it of items) (it.bodies ?? [it.body]).forEach((body, k) => byBody.set(body, { it, k }));
  // bodies a runner can stand on: the scene adds these to its ground list
  const ground = items.filter((it) => it.ground).flatMap((it) => it.bodies ?? [it.body]);

  return {
    items,
    ground,
    /** Move every race-clock body to its pose at race time t (seconds), and step the others. Once per physics step. */
    step(t) {
      for (const it of items) {
        if (RACE_CLOCK.has(it.type)) movePose(it.body, pose(it.type, it.params, t));
        else it.step?.(t);
      }
    },
    /** Make the pictures match the bodies, at race time t. Called every frame. */
    render(t) {
      for (const it of items) it.sync(t);
    },
    snapshots: () => items.map(snapshotOf),
    /**
     * A contact between an obstacle body and a runner. What happens is the obstacle's call: a bar or hammer that is
     * moving fast enough at that point knocks the runner into a tumble (once per immunity time); a bounce pad
     * launches it; a falling tile starts its timer.
     * @returns {{kind: 'hit', by: string, dir: 1 | -1} | {kind: 'launch', by: string, vy: number} | null} what to do to the runner, or null
     */
    touch(body, runner, t) {
      const found = byBody.get(body);
      if (!found) return null;
      const { it, k } = found;
      if (it.touch) return it.touch(runner, t, k);
      const hit = hitOnContact(runner.logic, it.type, it.params, t, runner.body.position.x / TILE, runner.body.position.y / TILE);
      return hit ? { kind: 'hit', by: hit.by, dir: hit.dir } : null;
    },
  };
}
