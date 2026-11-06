import { TILE } from '../../logic/tuning.js';
import { bodySize } from '../../logic/obstacles.js';
import { DEPTH, INK, makeBox } from './common.js';

/** A platform that slides back and forth along a dotted track and carries whoever stands on it. */
export function createMovingPlatform(scene, params, index) {
  const { w, h } = bodySize('moving-platform', params);
  const wPx = w * TILE;
  const hPx = h * TILE;
  const body = makeBox(scene, 'moving-platform', params.col * TILE, params.row * TILE, wPx, hPx);

  // the track: dots from where it starts to where it turns round
  const dots = Math.max(2, Math.round(Math.hypot(params.dx, params.dy) * 2));
  const track = scene.add.graphics().setDepth(DEPTH - 2);
  track.fillStyle(0x06d6a0, 0.5);
  for (let i = 0; i <= dots; i++) {
    track.fillCircle((params.col + (params.dx * i) / dots) * TILE, (params.row + (params.dy * i) / dots) * TILE, 4);
  }

  const g = scene.add.graphics().setDepth(DEPTH);
  g.fillStyle(0x06d6a0, 1);
  g.fillRoundedRect(-wPx / 2, -hPx / 2, wPx, hPx, 8);
  g.fillStyle(0x8ef5d6, 1);
  g.fillRoundedRect(-wPx / 2 + 3, -hPx / 2 + 3, wPx - 6, 7, 3);
  g.lineStyle(4, INK, 1);
  g.strokeRoundedRect(-wPx / 2, -hPx / 2, wPx, hPx, 8);

  return {
    type: 'moving-platform',
    params,
    index,
    body,
    ground: true, // a runner can stand on it, and it is the ground the runner's rules are measured against
    sync() {
      g.setPosition(body.position.x, body.position.y);
    },
  };
}
