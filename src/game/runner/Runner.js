import Phaser from 'phaser';
import { TILE, STEP, TUNING } from '../../logic/tuning.js';
import { newRunnerState, stepRunnerOn, applyHit } from '../../logic/runner.js';
import { CAT } from '../config.js';

const { Bodies, Body, Query, Vertices } = Phaser.Physics.Matter.Matter;
const PX_STEP = TILE * STEP; // tiles/s -> Matter velocity (pixels per 60 Hz step)
const wrap = (a) => ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
const round = (v, p = 100) => Math.round(v * p) / p;

/**
 * ONE runner: a Matter body, its sprite, and the pure rules from src/logic/runner.js.
 * It only ever reads an intent object, never the keyboard (src/game/CLAUDE.md rule 1).
 */
export class Runner {
  /**
   * @param {Phaser.Scene & {groundBodies: object[], logEvent: (type: string, data?: object) => void}} scene
   * @param {number} x centre, pixels
   * @param {number} y centre, pixels
   * @param {{id?: string, texture?: string}} [opts]
   */
  constructor(scene, x, y, { id = 'local', texture = 'runner' } = {}) {
    this.scene = scene;
    this.id = id;
    this.logic = newRunnerState();
    this.w = TUNING.bodyW * TILE;
    this.h = TUNING.bodyH * TILE;
    this.grounded = false;
    this.ground = { vx: 0, vy: 0 }; // velocity of what we stand on (tiles/s); reused every step
    this.air = null; // jump bookkeeping: where and when it left the ground
    this.springFrom = 0;
    this.probePoint = { x: 0, y: 0 }; // reused every step by underFeet()

    // A rounded capsule (HANDOFF 5.1). No friction: the rules set the speed, not the ground.
    this.body = Bodies.rectangle(x, y, this.w, this.h, {
      chamfer: { radius: this.w / 2 - 1 },
      friction: 0,
      frictionStatic: 0,
      frictionAir: 0,
      restitution: 0,
      label: `runner:${id}`,
      plugin: { runner: this }, // a contact finds the runner again through this
      collisionFilter: { category: CAT.LOCAL_RUNNER, mask: CAT.WORLD | CAT.OBSTACLE | CAT.REMOTE_RUNNER | CAT.SENSOR },
    });
    this.inertia = this.body.inertia; // kept for the tumble, when rotation is unlocked
    this.lockRotation();
    scene.matter.world.add(this.body);

    // Origin chosen so the bottom of the picture (the feet) sits on the bottom of the body, not below it.
    const frame = scene.textures.getFrame(texture);
    this.sprite = scene.add.image(x, y, texture).setOrigin(0.5, 1 - this.h / 2 / frame.height).setDepth(10);
  }

  lockRotation() {
    Body.setInertia(this.body, Infinity);
    Body.setAngularVelocity(this.body, 0);
  }

  unlockRotation() {
    Body.setInertia(this.body, this.inertia);
  }

  /**
   * Feet on something solid and not rising away from it (measured against that ground: a runner standing on a
   * platform that rises is not "rising"). Uses a thin strip just under the feet; if several bodies are under
   * them the highest one counts. Leaves the velocity of that ground in this.ground (zero when airborne): the
   * speed of the very spot under the feet, so a tilting seesaw plank counts at its turning speed there, plus a
   * conveyor's surface speed (a belt's body does not move, its top does).
   */
  probeGround(vxTiles, vyTiles) {
    const g = this.ground;
    g.vx = 0;
    g.vy = 0;
    const { x, y } = this.body.position;
    const half = this.w / 2 - TUNING.probeInsetPx;
    const feet = y + this.h / 2;
    const found = Query.region(this.scene.groundBodies, { min: { x: x - half, y: feet - TUNING.probeAbovePx }, max: { x: x + half, y: feet + TUNING.probeBelowPx } });
    let top = null;
    for (const f of found) {
      // a tilted body's box is bigger than the body: ask the body itself whether it is really under the feet
      if (f.angle !== 0 && !this.underFeet(f, x, half, feet)) continue;
      if (top === null || f.bounds.min.y < top.bounds.min.y) top = f;
    }
    if (top === null) return false;
    // a moving obstacle's body velocity (pixels per step) is the speed of the ground under the feet; a turning one adds
    // omega x r, the spot's own speed, and a conveyor adds its surface speed
    const surface = top.plugin?.surface;
    const gvx = (top.velocity.x - top.angularVelocity * (feet - top.position.y)) / PX_STEP + (surface ? surface.vx : 0);
    const gvy = (top.velocity.y + top.angularVelocity * (x - top.position.x)) / PX_STEP + (surface ? surface.vy : 0);
    // On a tilted plank a runner who runs up the slope is rising, but along the ground, not away from it: the speed the
    // surface itself rises at under a runner moving at that sideways speed is not "leaving the ground".
    const slopeVy = top.angle === 0 ? 0 : (vxTiles - gvx) * Math.tan(top.angle);
    if (vyTiles - gvy - slopeVy <= -TUNING.groundedMaxRise) return false;
    g.vx = gvx;
    g.vy = gvy;
    return true;
  }

  /** Is any of three spots under the feet (left, middle, right, as far down as the probe reaches) inside this tilted body? */
  underFeet(body, x, half, feet) {
    const py = feet + TUNING.probeBelowPx - 0.5;
    const p = this.probePoint;
    for (const px of [x - half, x, x + half]) {
      p.x = px;
      p.y = py;
      if (Vertices.contains(body.vertices, p)) return true;
    }
    return false;
  }

  /** A bounce pad throws the runner up at vy (tiles/s, negative = up): the same as a jump, only harder. */
  launch(vyTiles) {
    const b = this.body;
    Body.setVelocity(b, { x: b.velocity.x, y: vyTiles * PX_STEP });
    this.air = { x0: b.position.x, y0: b.position.y, t0: this.scene.raceTime(), rise: 0 };
    this.scene.logEvent('bounce', { x: round(b.position.x / TILE), vy: round(vyTiles) });
  }

  /** Vertical speed of the body in tiles/s, down positive. */
  vyTiles() {
    return this.body.velocity.y / PX_STEP;
  }

  /** Put the runner at a spot, standing still and upright (tests and respawn; not a game rule). */
  placeAt(x, y) {
    Body.setPosition(this.body, { x, y });
    Body.setVelocity(this.body, { x: 0, y: 0 });
    Body.setAngle(this.body, 0);
    this.lockRotation();
    this.logic = newRunnerState(this.logic.facing);
    this.air = null;
    this.grounded = false;
  }

  /**
   * One fixed physics step: read what the body is doing, run the pure rules, apply the result.
   * Called from the engine's 'beforeupdate', so it runs in lockstep with physics.
   * @param {{left: boolean, right: boolean, jump: boolean, dive: boolean}} intent
   */
  step(intent) {
    const b = this.body;
    const vx = b.velocity.x / PX_STEP;
    const vy = b.velocity.y / PX_STEP;
    const wasGrounded = this.grounded;
    this.grounded = this.probeGround(vx, vy);

    const r = stepRunnerOn(this.logic, intent, { vx, vy, grounded: this.grounded }, this.ground);
    const before = this.logic.mode;
    this.logic = r.state;

    if (r.vx !== null || r.vy !== null) {
      Body.setVelocity(b, { x: (r.vx ?? vx) * PX_STEP, y: (r.vy ?? vy) * PX_STEP });
    }
    for (const type of r.events) this.onEvent(type);

    // Rotation follows the mode: upright and locked, free while tumbling, eased back while springing.
    const mode = this.logic.mode;
    if (mode === 'spring') {
      if (before !== 'spring') {
        this.springFrom = wrap(b.angle);
        this.lockRotation();
      }
      const u = Math.min(1, this.logic.t / TUNING.springTime);
      Body.setAngle(b, this.springFrom * (1 - (1 - (1 - u) * (1 - u))));
      Body.setAngularVelocity(b, 0);
    } else if (mode !== 'tumble' && b.angle !== 0) {
      Body.setAngle(b, 0);
      Body.setAngularVelocity(b, 0);
    }

    // jump bookkeeping for the event log: how high and how far each jump went
    if (this.air) {
      this.air.rise = Math.max(this.air.rise, (this.air.y0 - b.position.y) / TILE);
      if (this.grounded && !wasGrounded) {
        this.scene.logEvent('land', {
          rise: round(this.air.rise),
          dx: round((b.position.x - this.air.x0) / TILE),
          air: round(this.scene.raceTime() - this.air.t0),
        });
        this.air = null;
      }
    }
  }

  onEvent(type) {
    const b = this.body;
    if (type === 'jump') this.air = { x0: b.position.x, y0: b.position.y, t0: this.scene.raceTime(), rise: 0 };
    this.scene.logEvent(type, { x: round(b.position.x / TILE) });
  }

  /**
   * A big hit (hammer, spinning bar): unlock rotation and fling the body (HANDOFF 5.1).
   * @param {number} dir -1 sends it left, 1 right
   * @param {{speed?: number, lift?: number, spin?: number}} [strength]
   */
  hit(dir, strength = {}) {
    const r = applyHit(this.logic, { dir, ...strength });
    this.logic = r.state;
    this.unlockRotation();
    Body.setVelocity(this.body, { x: r.vx * PX_STEP, y: r.vy * PX_STEP });
    Body.setAngularVelocity(this.body, r.spin * STEP);
    for (const type of r.events) this.onEvent(type);
  }

  /** Put the sprite where the body is. Dives lean the picture forward; the body stays upright. */
  render() {
    const { body, sprite, logic } = this;
    const diving = logic.mode === 'dive';
    const way = diving ? logic.diveDir : logic.facing; // a dive keeps the way it started
    sprite.setPosition(body.position.x, body.position.y);
    sprite.setRotation(body.angle + (diving ? way * TUNING.diveLean : 0));
    sprite.setFlipX(way < 0);
  }

  /** What tests may see (window.__TR.state().runners[i]). Pixels for x/y, tiles/s for speeds. */
  snapshot() {
    const b = this.body;
    return {
      id: this.id,
      x: round(b.position.x),
      y: round(b.position.y),
      angle: round(b.angle, 1000),
      vx: round(b.velocity.x / PX_STEP),
      vy: round(b.velocity.y / PX_STEP),
      mode: this.logic.mode,
      grounded: this.grounded,
      facing: this.logic.facing,
      finished: false,
      place: 0,
      checkpoint: 0,
    };
  }
}
