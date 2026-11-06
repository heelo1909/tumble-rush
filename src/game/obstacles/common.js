import Phaser from 'phaser';
import { TILE } from '../../logic/tuning.js';
import { CAT } from '../config.js';

const { Body } = Phaser.Physics.Matter.Matter;

/** Obstacles are drawn behind the runner (depth 10). */
export const DEPTH = 5;
/** Outline colour shared by everything we draw. */
export const INK = 0x1b1b2f;

const where = { x: 0, y: 0 }; // reused every step: Body.setPosition only reads it (pose() itself still returns one small object per obstacle per step: accepted, Decision 32d)

/**
 * A static Matter box for an obstacle (index.js finds the obstacle again from its body). Friction is 0: carrying a runner is the ground-frame rule in src/logic, not friction.
 */
export function makeBox(scene, type, xPx, yPx, wPx, hPx) {
  return scene.matter.add.rectangle(xPx, yPx, wPx, hPx, {
    isStatic: true,
    friction: 0,
    frictionStatic: 0,
    restitution: 0,
    label: `obstacle:${type}`,
    collisionFilter: { category: CAT.OBSTACLE, mask: CAT.LOCAL_RUNNER | CAT.REMOTE_RUNNER },
  });
}

/**
 * Put a static body at a pose from src/logic/obstacles.js (tiles, radians). The `true` gives the body the
 * velocity of that move. What needs it: a moving platform, whose velocity is the ground velocity a runner standing
 * on it rides along with (Runner.probeGround; the e2e goes red without it). It is NOT what makes a bar or hammer
 * hit: that is decided in src/logic (hitOnContact) and delivered by Runner.hit(), because the runner's rules set its
 * velocity every step, so Matter's momentum could not knock a running runner back. A pusher wall pushes through
 * Matter's overlap correction. Called every physics step, even when nothing moved, so a body that has stopped also
 * reports that it has stopped.
 */
export function movePose(body, pose) {
  Body.setAngle(body, pose.angle, true);
  where.x = pose.x * TILE;
  where.y = pose.y * TILE;
  Body.setPosition(body, where, true);
}

/** What tests may see (window.__TR.state().obstacles[i]): pixels, and radians rounded to a thousandth. */
export function snapshotOf(item) {
  const { position, angle } = item.body;
  return {
    id: `${item.type}-${item.index}`,
    type: item.type,
    x: Math.round(position.x * 100) / 100,
    y: Math.round(position.y * 100) / 100,
    angle: Math.round(angle * 1000) / 1000,
  };
}
