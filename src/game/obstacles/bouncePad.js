import { TILE } from '../../logic/tuning.js';
import { contactSize, bounceLaunch } from '../../logic/contact.js';
import { CAT } from '../config.js';
import { DEPTH, INK, inView } from './common.js';

const SQUASH_TIME = 0.35; // how long the pad stays squashed and springs back (seconds)
const SQUASH_PX = 11; // how far the plate goes down at the deepest

/**
 * A pad that throws a runner straight up. A sensor, so a runner walks into it and nothing blocks them: the contact
 * decides (src/logic/contact.js bounceLaunch) and RaceScene gives the runner the speed. Pink plate on a spring.
 */
export function createBouncePad(scene, params, index) {
  const { w, h } = contactSize('bounce-pad', params);
  const wPx = w * TILE;
  const hPx = h * TILE;
  const body = scene.matter.add.rectangle(params.col * TILE, params.row * TILE, wPx, hPx, {
    isStatic: true,
    isSensor: true,
    label: 'obstacle:bounce-pad',
    collisionFilter: { category: CAT.SENSOR, mask: CAT.RUNNERS },
  });

  const g = scene.add.graphics().setDepth(DEPTH).setPosition(body.position.x, body.position.y);
  let bouncedAt = -10; // race time of the last launch
  let drawn = -1; // the squash the picture shows now (quantised, so it is redrawn only when it changes)

  /** squash is 0 (resting) to 1 (flat). */
  function draw(squash) {
    g.clear();
    const plateH = 12;
    const top = -hPx / 2 + squash * SQUASH_PX; // the plate's top edge
    const base = hPx / 2;
    // the spring between the base and the plate: a zig-zag that gets tighter as the plate goes down
    g.lineStyle(4, INK, 1);
    g.beginPath();
    const coils = 4;
    const x0 = -wPx / 2 + 14;
    const x1 = wPx / 2 - 14;
    const span = base - 6 - (top + plateH);
    g.moveTo(x0, base - 6);
    for (let i = 1; i <= coils; i++) {
      g.lineTo(i % 2 ? x1 : x0, base - 6 - (span * i) / coils);
    }
    g.strokePath();
    // base and plate
    g.fillStyle(INK, 1);
    g.fillRoundedRect(-wPx / 2, base - 6, wPx, 6, 3);
    g.fillStyle(0xff4fa3, 1);
    g.fillRoundedRect(-wPx / 2 + 2, top, wPx - 4, plateH, 5);
    g.fillStyle(0xffffff, 0.75);
    g.fillRoundedRect(-wPx / 2 + 8, top + 2, wPx - 16, 3, 1.5);
    g.lineStyle(3, INK, 1);
    g.strokeRoundedRect(-wPx / 2 + 2, top, wPx - 4, plateH, 5);
    // an arrow on the plate, so it reads as "up"
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(0, top - 9, -7, top - 1, 7, top - 1);
    g.lineStyle(2, INK, 1);
    g.strokeTriangle(0, top - 9, -7, top - 1, 7, top - 1);
  }
  draw(0);
  drawn = 0;

  return {
    type: 'bounce-pad',
    params,
    index,
    body,
    ground: false, // a sensor: you pass through it, you do not stand on it
    /** A runner is touching the pad: launch it, unless it is already flying up from this pad. */
    touch(runner, t) {
      const vy = bounceLaunch(params, runner.vyTiles());
      if (vy === null) return null;
      bouncedAt = t;
      return { kind: 'launch', by: 'bounce-pad', vy };
    },
    sync(t) {
      const seen = inView(scene, body.position.x, wPx / 2);
      g.setVisible(seen);
      if (!seen) return;
      const u = (t - bouncedAt) / SQUASH_TIME;
      const squash = u >= 0 && u < 1 ? Math.round(Math.sin(u * Math.PI) * 20) / 20 : 0;
      if (squash !== drawn) {
        drawn = squash;
        draw(squash);
      }
    },
  };
}
