import { TILE } from '../../logic/tuning.js';
import { contactSize, beltSurface } from '../../logic/contact.js';
import { DEPTH, INK, makeBox, inView } from './common.js';

const PERIOD = 32; // pixels from one chevron to the next

/** Chevrons on a dark belt, one texture per direction, drawn in code. */
function beltTexture(scene, dir) {
  const key = `belt${dir > 0 ? 'R' : 'L'}`;
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x3d3a6b, 1);
  g.fillRect(0, 0, PERIOD, 24);
  g.lineStyle(5, 0xffc300, 1);
  g.beginPath();
  const a = dir > 0 ? 8 : 24; // the tail of the chevron
  const b = dir > 0 ? 20 : 12; // its point
  g.moveTo(a, 3);
  g.lineTo(b, 12);
  g.lineTo(a, 21);
  g.strokePath();
  g.generateTexture(key, PERIOD, 24);
  g.destroy();
  return key;
}

/**
 * A belt: a solid top that moves. The body itself stands still; its top has a surface speed (plugin.surface) that
 * the runner's ground probe adds, so a runner standing on it is carried and one running keeps its run speed on
 * top (src/logic/runner.js stepRunnerOn). The chevrons scroll with race time, the way the surface moves.
 */
export function createConveyor(scene, params, index) {
  const { w, h } = contactSize('conveyor', params);
  const wPx = w * TILE;
  const hPx = h * TILE;
  const surface = beltSurface(params);
  const body = makeBox(scene, 'conveyor', params.col * TILE, params.row * TILE, wPx, hPx, { plugin: { surface } });

  const belt = scene.add.tileSprite(body.position.x, body.position.y, wPx, hPx, beltTexture(scene, Math.sign(surface.vx))).setDepth(DEPTH);
  const frame = scene.add.graphics().setDepth(DEPTH + 1).setPosition(body.position.x, body.position.y);
  frame.fillStyle(0xdde1f0, 1); // a light roller at each end
  const r = Math.min(hPx / 2, 14);
  frame.fillCircle(-wPx / 2 + r, 0, r - 2);
  frame.fillCircle(wPx / 2 - r, 0, r - 2);
  frame.lineStyle(4, INK, 1);
  frame.strokeCircle(-wPx / 2 + r, 0, r - 2);
  frame.strokeCircle(wPx / 2 - r, 0, r - 2);
  frame.strokeRect(-wPx / 2, -hPx / 2, wPx, hPx);
  frame.fillStyle(0xffffff, 0.35);
  frame.fillRect(-wPx / 2 + 2, -hPx / 2 + 2, wPx - 4, 4); // a light edge along the top

  return {
    type: 'conveyor',
    params,
    index,
    body,
    ground: true, // a runner stands on it
    sync(t) {
      const seen = inView(scene, body.position.x, wPx / 2);
      frame.setVisible(seen); // the belt itself is a TileSprite, which Phaser skips when it is off screen
      if (seen) belt.tilePositionX = -surface.vx * TILE * t; // the chevrons move the way the surface moves
    },
  };
}
