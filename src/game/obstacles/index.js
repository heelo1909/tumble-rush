import { pose, hitOnContact } from '../../logic/obstacles.js';
import { TILE } from '../../logic/tuning.js';
import { movePose, snapshotOf } from './common.js';
import { createSpinningBar } from './spinningBar.js';
import { createSwingingHammer } from './swingingHammer.js';
import { createPusherWall } from './pusherWall.js';
import { createMovingPlatform } from './movingPlatform.js';

const MAKERS = {
  'spinning-bar': createSpinningBar,
  'swinging-hammer': createSwingingHammer,
  'pusher-wall': createPusherWall,
  'moving-platform': createMovingPlatform,
};

/**
 * Builds every obstacle of a (validated) course and keeps them where src/logic/obstacles.js says they are.
 * @param {Phaser.Scene} scene
 * @param {object[]} list the course's `obstacles`
 */
export function buildObstacles(scene, list) {
  const items = list.map((params, index) => MAKERS[params.type](scene, params, index));
  const byBody = new Map(items.map((it) => [it.body, it]));
  // bodies a runner can stand on: the scene adds these to its ground list
  const ground = items.filter((it) => it.ground).map((it) => it.body);

  return {
    items,
    ground,
    /** Move every body to its pose at race time t (seconds). Called once per physics step. */
    step(t) {
      for (const it of items) movePose(it.body, pose(it.type, it.params, t));
    },
    /** Make the pictures match the bodies. Called every frame. */
    render() {
      for (const it of items) it.sync();
    },
    snapshots: () => items.map(snapshotOf),
    /**
     * A contact between an obstacle body and a runner. A bar or hammer that is moving fast enough at that
     * point knocks the runner into a tumble, once per immunity time.
     * @returns {{by: string, dir: 1 | -1} | null} what to do to the runner, or null for a brush
     */
    touch(body, runner, t) {
      const it = byBody.get(body);
      if (!it) return null;
      const hit = hitOnContact(runner.logic, it.type, it.params, t, runner.body.position.x / TILE, runner.body.position.y / TILE);
      return hit ? { by: hit.by, dir: hit.dir } : null;
    },
  };
}
