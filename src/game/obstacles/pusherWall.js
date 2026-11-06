import { TILE } from '../../logic/tuning.js';
import { bodySize } from '../../logic/obstacles.js';
import { DEPTH, INK, makeBox } from './common.js';

/** A wall that slides out and back along its track and shoves whoever is in the way. The faint track shows where it can reach. */
export function createPusherWall(scene, params, index) {
  const { w, h } = bodySize('pusher-wall', params);
  const wPx = w * TILE;
  const hPx = h * TILE;
  const body = makeBox(scene, 'pusher-wall', params.col * TILE, params.row * TILE, wPx, hPx);

  // the track: the box the wall sweeps through, drawn faintly
  const x0 = Math.min(params.col, params.col + params.dx) * TILE - wPx / 2;
  const y0 = Math.min(params.row, params.row + params.dy) * TILE - hPx / 2;
  scene.add.rectangle(x0, y0, Math.abs(params.dx) * TILE + wPx, Math.abs(params.dy) * TILE + hPx, 0xef476f, 0.14).setOrigin(0, 0).setDepth(DEPTH - 2);

  const g = scene.add.graphics().setDepth(DEPTH);
  g.fillStyle(0xef476f, 1);
  g.fillRoundedRect(-wPx / 2, -hPx / 2, wPx, hPx, 8);
  g.fillStyle(0xffffff, 0.85);
  // three arrows on the wall, pointing the way it pushes first (towards +dx)
  const way = params.dx !== 0 ? Math.sign(params.dx) : 1;
  for (let i = 0; i < 3; i++) {
    const cy = -hPx / 2 + (hPx * (i + 0.5)) / 3;
    g.fillTriangle(way * 9, cy, way * -9, cy - 9, way * -9, cy + 9);
  }
  g.lineStyle(4, INK, 1);
  g.strokeRoundedRect(-wPx / 2, -hPx / 2, wPx, hPx, 8);

  return {
    type: 'pusher-wall',
    params,
    index,
    body,
    ground: false,
    sync() {
      g.setPosition(body.position.x, body.position.y);
    },
  };
}
