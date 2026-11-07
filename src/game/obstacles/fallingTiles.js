import Phaser from 'phaser';
import { TILE, TUNING } from '../../logic/tuning.js';
import { contactSize, newTile, touchTile, stepTile, tileSolid } from '../../logic/contact.js';
import { CAT } from '../config.js';
import { DEPTH, INK, makeBox, inView } from './common.js';

const { Query } = Phaser.Physics.Matter.Matter;
const POP_TIME = 0.25; // a tile that has come back pops in over this long (seconds)
const FADE_TIME = 0.5; // a fallen tile fades out over this long

/**
 * A row of tiles, each one its own body and its own timer (src/logic/contact.js stepTile). The first touch makes
 * a tile shake; tileDropDelay later it drops (the body stops colliding and leaves the ground list, so a runner
 * on it falls); tileRespawn after that it comes back, unless a runner is in its place. Local only (HANDOFF 6.4).
 */
export function createFallingTiles(scene, params, index) {
  const { w, h } = contactSize('falling-tiles', params);
  const n = params.count;
  const wPx = w * TILE;
  const hPx = h * TILE;
  const x0 = (params.col - n / 2 + 0.5) * TILE; // centre of the first tile
  const y = params.row * TILE;

  const bodies = [];
  const pics = [];
  const states = [];
  for (let i = 0; i < n; i++) {
    bodies.push(makeBox(scene, 'falling-tiles', x0 + i * TILE, y, wPx, hPx));
    states.push(newTile());
    const g = scene.add.graphics().setDepth(DEPTH).setPosition(x0 + i * TILE, y);
    g.fillStyle(i % 2 ? 0xffb703 : 0xffa200, 1);
    g.fillRoundedRect(-wPx / 2 + 1, -hPx / 2, wPx - 2, hPx, 6);
    g.fillStyle(0xffe08a, 1);
    g.fillRoundedRect(-wPx / 2 + 5, -hPx / 2 + 3, wPx - 10, 5, 2);
    g.lineStyle(3, 0x9a5b00, 1); // a crack, so they look breakable
    g.beginPath();
    g.moveTo(-6, -hPx / 2 + 8);
    g.lineTo(0, 0);
    g.lineTo(-4, hPx / 2 - 3);
    g.strokePath();
    g.lineStyle(4, INK, 1);
    g.strokeRoundedRect(-wPx / 2 + 1, -hPx / 2, wPx - 2, hPx, 6);
    pics.push(g);
  }

  let shown = true; // whether the pictures were left visible by the last sync

  const log = (i, phase) => scene.logEvent('tile', { i, phase, x: Math.round(((x0 + i * TILE) / TILE) * 100) / 100 });

  /** The state of tile i just changed from prev to next: switch its body and ground-ness to match. */
  function change(i, prev, next) {
    if (prev.phase === next.phase) return;
    const body = bodies[i];
    if (!tileSolid(next)) {
      body.collisionFilter.mask = 0; // nothing touches it any more
      const at = scene.groundBodies.indexOf(body);
      if (at >= 0) scene.groundBodies.splice(at, 1); // and it is no ground under anyone's feet
    } else if (!tileSolid(prev)) {
      body.collisionFilter.mask = CAT.RUNNERS;
      scene.groundBodies.push(body);
    }
    log(i, next.phase);
  }

  /** Is a runner in the place where tile i would come back? */
  const blocked = (i) => {
    const b = bodies[i].bounds;
    return Query.region(scene.runnerBodies(), { min: { x: b.min.x, y: b.min.y - 2 }, max: { x: b.max.x, y: b.max.y + 2 } }).length > 0;
  };

  const isBlocked = bodies.map((_, i) => () => blocked(i)); // built once: stepTile asks only when a tile is due back

  return {
    type: 'falling-tiles',
    params,
    index,
    bodies,
    ground: true,
    /** Once per physics step: the timers. */
    step(t) {
      for (let i = 0; i < n; i++) {
        const prev = states[i];
        if (prev.phase === 'solid') continue; // nothing to time
        const next = stepTile(prev, t, TUNING, isBlocked[i]);
        if (next === prev) continue;
        states[i] = next;
        change(i, prev, next);
      }
    },
    /** A runner touches tile k: the first touch starts its timer. */
    touch(runner, t, k) {
      const prev = states[k];
      const next = touchTile(prev, t);
      if (next !== prev) {
        states[k] = next;
        change(k, prev, next);
      }
      return null;
    },
    sync(t) {
      const seen = inView(scene, params.col * TILE, (n * TILE) / 2);
      if (!seen) {
        if (shown) for (const g of pics) g.setVisible(false); // far from the camera: draw nothing (once, not every frame)
        shown = false;
        return;
      }
      shown = true;
      for (let i = 0; i < n; i++) {
        const s = states[i];
        const g = pics[i];
        let dx = 0;
        let dy = 0;
        let alpha = 1;
        if (s.phase === 'armed') {
          dx = Math.sin(t * 90) * 2.5; // shakes
        } else if (s.phase === 'fallen') {
          const fall = Math.max(0, t - s.since);
          dy = 0.5 * TUNING.gravity * TILE * fall * fall;
          alpha = Math.max(0, 1 - fall / FADE_TIME);
        } else if (s.since > 0) {
          alpha = Math.min(1, (t - s.since) / POP_TIME); // it came back: pops in
        }
        g.setPosition(x0 + i * TILE + dx, y + dy).setAlpha(alpha).setVisible(alpha > 0);
      }
    },
    snapshot() {
      return { id: `falling-tiles-${index}`, type: 'falling-tiles', x: Math.round(params.col * TILE * 100) / 100, y: Math.round(y * 100) / 100, angle: 0, tiles: states.map((s) => s.phase) };
    },
  };
}
