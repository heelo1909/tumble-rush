import { TILE } from '../../logic/tuning.js';
import { bodySize } from '../../logic/obstacles.js';
import { DEPTH, INK, makeBox } from './common.js';

/**
 * A hammer on a long arm, swinging like a pendulum. Only the head is solid; the arm is a chain you can run
 * through (a thin dark line, so it reads as a rope and not a wall).
 */
export function createSwingingHammer(scene, params, index) {
  const { w, h } = bodySize('swinging-hammer', params);
  const wPx = w * TILE;
  const hPx = h * TILE;
  const body = makeBox(scene, 'swinging-hammer', params.col * TILE, (params.row + params.length) * TILE, wPx, hPx);

  const px = params.col * TILE;
  const py = params.row * TILE;
  // arm: origin at its top centre, pointing straight down at angle 0; turning it by the pose angle swings it
  const arm = scene.add.rectangle(px, py, 8, params.length * TILE, INK).setOrigin(0.5, 0).setDepth(DEPTH - 1);
  const head = scene.add.graphics().setDepth(DEPTH);
  head.fillStyle(0x7b2cbf, 1);
  head.fillRoundedRect(-wPx / 2, -hPx / 2, wPx, hPx, 12);
  head.fillStyle(0xffd23f, 1);
  head.fillRect(-wPx / 2 + 4, -6, wPx - 8, 12);
  head.lineStyle(4, INK, 1);
  head.strokeRoundedRect(-wPx / 2, -hPx / 2, wPx, hPx, 12);
  const hub = scene.add.graphics().setDepth(DEPTH + 1).setPosition(px, py);
  hub.fillStyle(INK, 1);
  hub.fillCircle(0, 0, 13);
  hub.fillStyle(0xffd23f, 1);
  hub.fillCircle(0, 0, 6);

  return {
    type: 'swinging-hammer',
    params,
    index,
    body,
    ground: false,
    sync() {
      head.setPosition(body.position.x, body.position.y).setRotation(body.angle);
      arm.setRotation(body.angle);
    },
  };
}
