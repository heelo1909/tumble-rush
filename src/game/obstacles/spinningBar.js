import { TILE } from '../../logic/tuning.js';
import { bodySize } from '../../logic/obstacles.js';
import { DEPTH, INK, makeBox } from './common.js';

/** A bar that turns on its pivot. Orange with a red tip on one end, so you can see which way it turns. */
export function createSpinningBar(scene, params, index) {
  const { w, h } = bodySize('spinning-bar', params);
  const wPx = w * TILE;
  const hPx = h * TILE;
  const body = makeBox(scene, 'spinning-bar', params.col * TILE, params.row * TILE, wPx, hPx);

  const g = scene.add.graphics().setDepth(DEPTH);
  g.fillStyle(0xff9f1c, 1);
  g.fillRoundedRect(-wPx / 2, -hPx / 2, wPx, hPx, hPx / 2);
  g.fillStyle(0xe63946, 1);
  g.fillRoundedRect(wPx / 2 - 30, -hPx / 2 + 3, 27, hPx - 6, (hPx - 6) / 2);
  g.lineStyle(4, INK, 1);
  g.strokeRoundedRect(-wPx / 2, -hPx / 2, wPx, hPx, hPx / 2);
  const hub = scene.add.graphics().setDepth(DEPTH + 1).setPosition(params.col * TILE, params.row * TILE);
  hub.fillStyle(INK, 1);
  hub.fillCircle(0, 0, 13);
  hub.fillStyle(0xffd23f, 1);
  hub.fillCircle(0, 0, 6);

  return {
    type: 'spinning-bar',
    params,
    index,
    body,
    ground: false,
    sync() {
      g.setPosition(body.position.x, body.position.y).setRotation(body.angle);
    },
  };
}
