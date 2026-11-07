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
export function makeBox(scene, type, xPx, yPx, wPx, hPx, extra = {}) {
  return scene.matter.add.rectangle(xPx, yPx, wPx, hPx, {
    isStatic: true,
    friction: 0,
    frictionStatic: 0,
    restitution: 0,
    label: `obstacle:${type}`,
    collisionFilter: { category: CAT.OBSTACLE, mask: CAT.RUNNERS },
    ...extra,
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

/**
 * Is something centred at x (pixels), half a width wide, within a screen of the camera? Phaser skips drawing an image
 * that is off screen, but never a Graphics object (it has no size of its own), so every Graphics in a long course would
 * be processed every frame. An obstacle hides its Graphics while this is false. A whole screen of margin, because the
 * camera moves between the frame the obstacle looks and the frame it is drawn (and glides a long way after a teleport).
 */
export function inView(scene, x, halfW) {
  const cam = scene.cameras.main;
  return x + halfW > cam.scrollX - cam.width && x - halfW < cam.scrollX + 2 * cam.width;
}

/** What tests may see (window.__TR.state().obstacles[i]): pixels, and radians rounded to a thousandth. */
export function snapshotOf(item) {
  if (item.snapshot) return item.snapshot(); // a row of falling tiles has no single body
  const { position, angle } = item.body;
  return {
    id: `${item.type}-${item.index}`,
    type: item.type,
    x: Math.round(position.x * 100) / 100,
    y: Math.round(position.y * 100) / 100,
    angle: Math.round(angle * 1000) / 1000,
  };
}
