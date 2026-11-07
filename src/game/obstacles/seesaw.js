import Phaser from 'phaser';
import { TILE, STEP, TUNING } from '../../logic/tuning.js';
import { contactSize, seesawAssist } from '../../logic/contact.js';
import { CAT } from '../config.js';
import { DEPTH, INK, inView } from './common.js';

const { Bodies, Body, Constraint } = Phaser.Physics.Matter.Matter;
/**
 * How heavy the plank is (Matter density; the runner's is 0.001). Body definition, not a feel number: it sets how
 * fast a runner at the end tips it, and it is tuned against the e2e's measured tip time.
 */
const PLANK_DENSITY = 0.0006;
/** A touch from a runner counts as "someone is on it" for this long (seconds): a few steps, so one missed contact does not level it under them. */
const LOADED_FOR = 0.1;
const DEFAULT_BASE = 1.5; // tiles of fulcrum drawn under the plank when the course gives no `base`

/**
 * A plank on a pin: a REAL dynamic Matter body hinged at its middle (HANDOFF 5.2), so a runner's weight tips it and
 * walking across it flips it. Local physics only (HANDOFF 6.4). Matter does the tipping; each step src/logic's
 * seesawAssist adds a gentle spring that levels an empty plank and the hard stop at the tilt limit.
 */
export function createSeesaw(scene, params, index) {
  const { w, h } = contactSize('seesaw', params);
  const wPx = w * TILE;
  const hPx = h * TILE;
  const x = params.col * TILE;
  const y = params.row * TILE;
  const body = Bodies.rectangle(x, y, wPx, hPx, {
    density: PLANK_DENSITY,
    friction: 0,
    frictionStatic: 0,
    restitution: 0,
    label: 'obstacle:seesaw',
    collisionFilter: { category: CAT.OBSTACLE, mask: CAT.RUNNERS },
  });
  scene.matter.world.add(body);
  // the pin: holds the plank's middle at one fixed spot in the world, and lets it turn
  scene.matter.world.add(Constraint.create({ pointA: { x, y }, bodyB: body, pointB: { x: 0, y: 0 }, length: 0, stiffness: 1 }));

  // a fulcrum under the plank (just a picture: the plank is held by the pin)
  const base = (params.base ?? DEFAULT_BASE) * TILE;
  const fulcrum = scene.add.graphics().setDepth(DEPTH - 1).setPosition(x, y + hPx / 2);
  fulcrum.fillStyle(0x6c757d, 1);
  fulcrum.fillTriangle(0, 0, -0.55 * TILE, base, 0.55 * TILE, base);
  fulcrum.lineStyle(4, INK, 1);
  fulcrum.strokeTriangle(0, 0, -0.55 * TILE, base, 0.55 * TILE, base);

  const g = scene.add.graphics().setDepth(DEPTH).setPosition(x, y);
  g.fillStyle(0x8d5a2b, 1);
  g.fillRoundedRect(-wPx / 2, -hPx / 2, wPx, hPx, 7);
  g.fillStyle(0xb98550, 1);
  g.fillRoundedRect(-wPx / 2 + 4, -hPx / 2 + 3, wPx - 8, 5, 2); // a lighter top, so you can tell which side is up
  g.lineStyle(2, 0x5e3a18, 1);
  for (let px = -wPx / 2 + TILE; px < wPx / 2 - 8; px += TILE) {
    g.beginPath(); // plank joints
    g.moveTo(px, -hPx / 2 + 8);
    g.lineTo(px, hPx / 2 - 2);
    g.strokePath();
  }
  g.lineStyle(4, INK, 1);
  g.strokeRoundedRect(-wPx / 2, -hPx / 2, wPx, hPx, 7);
  const pin = scene.add.graphics().setDepth(DEPTH + 1).setPosition(x, y);
  pin.fillStyle(INK, 1);
  pin.fillCircle(0, 0, 9);
  pin.fillStyle(0xffd23f, 1);
  pin.fillCircle(0, 0, 4);

  let loadedAt = -10; // race time a runner last touched the plank

  return {
    type: 'seesaw',
    params,
    index,
    body,
    ground: true, // a runner stands on the plank
    /** A runner touches the plank: it is loaded for a moment, so the levelling spring stays off. */
    touch(runner, t) {
      loadedAt = t;
      return null;
    },
    /** Once per physics step: level an empty plank, and hold the stop. */
    step(t) {
      const r = seesawAssist(body.angle, body.angularVelocity / STEP, STEP, TUNING, t >= loadedAt && t - loadedAt < LOADED_FOR); // (t < loadedAt: the clock was set back, nobody is on it)
      if (r.angle !== body.angle) Body.setAngle(body, r.angle);
      Body.setAngularVelocity(body, r.angVel * STEP);
    },
    sync() {
      const seen = inView(scene, x, wPx / 2);
      g.setVisible(seen);
      fulcrum.setVisible(seen);
      pin.setVisible(seen);
      if (seen) g.setPosition(body.position.x, body.position.y).setRotation(body.angle);
    },
  };
}
