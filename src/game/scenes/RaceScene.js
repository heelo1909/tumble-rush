import Phaser from 'phaser';
import { TILE, STEP, TUNING } from '../../logic/tuning.js';
import { validateCourse } from '../../logic/course.js';
import { CAT } from '../config.js';
import { Runner } from '../runner/Runner.js';
import { LocalControl } from '../runner/LocalControl.js';
import { W, H } from '../BootScene.js';
import testFlat from '../courses/test-flat.json';

const COURSES = { 'test-flat': testFlat };
const MAX_EVENTS = 500;

/**
 * G1: the flat test course with one local runner. G3 turns this into the real race scene; the course is
 * data and is built only after validateCourse passes (src/game/CLAUDE.md rule 5).
 */
export class RaceScene extends Phaser.Scene {
  constructor() {
    super('race');
  }

  create() {
    const course = COURSES['test-flat'];
    const problems = validateCourse(course);
    if (problems.length) throw new Error(`Invalid course ${course.id}: ${problems.join('; ')}`);
    if (course.tile !== TILE) throw new Error(`Course tile ${course.tile} does not match the tuning TILE ${TILE}`);

    this.course = course;
    this.steps = 0;
    this.events_ = [];
    this.groundBodies = [];
    const worldW = course.cols * TILE;
    const worldH = course.rows * TILE;

    this.cameras.main.setBackgroundColor('#2d2a55');
    this.makeRunnerTexture();
    this.buildCourse(course, worldW, worldH);

    const x = (course.spawn.col + 0.5) * TILE;
    const y = (course.spawn.row + 1) * TILE - (TUNING.bodyH * TILE) / 2 - 1;
    this.runner = new Runner(this, x, y);
    this.control = new LocalControl(this);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, worldW, worldH);
    cam.scrollY = worldH - H; // the view never moves up and down, so jumps read clearly
    cam.startFollow(this.runner.sprite, true, 0.12, 0, -W * 0.1, 0);

    this.hud = this.add.text(16, 12, '', { fontFamily: 'sans-serif', fontSize: '18px', color: '#ffffff', lineSpacing: 4 })
      .setScrollFactor(0).setDepth(50).setStroke('#1b1b2f', 4);
    this.hud.setText('Arrows / A D run   Up / W / Space jump   Shift dive');
    this.dbg = { mode: '', speed: -1, grounded: null }; // what the debug line shows now: rewrite the text only when it changes
    this.debug = this.add.text(16, 64, '', { fontFamily: 'monospace', fontSize: '16px', color: '#ffd23f' })
      .setScrollFactor(0).setDepth(50).setStroke('#1b1b2f', 4);

    // The rules run once per fixed physics step, in lockstep with Matter (src/game/CLAUDE.md rule 4).
    // No listener cleanup here: Phaser's Matter plugin shuts down before any scene handler could run
    // (this.matter.world is already null by then) and its World.shutdown removes every listener itself.
    this.matter.world.on(Phaser.Physics.Matter.Events.BEFORE_UPDATE, this.onStep, this);

    this.registry.set('scene', 'race');
  }

  /** Physics time in seconds: fixed steps, not frames, so it matches on every laptop. */
  raceTime() {
    return this.steps * STEP;
  }

  logEvent(type, data = {}) {
    const log = this.events_;
    log.push({ t: Math.round(this.raceTime() * 1000) / 1000, type, data });
    if (log.length > MAX_EVENTS) log.shift();
  }

  onStep() {
    this.runner.step(this.control.sample());
    this.steps += 1;
  }

  update() {
    const r = this.runner;
    r.render();
    const mode = r.logic.mode;
    const speed = Math.round((Math.abs(r.body.velocity.x) / (TILE * STEP)) * 10) / 10;
    const d = this.dbg;
    if (mode !== d.mode || speed !== d.speed || r.grounded !== d.grounded) {
      d.mode = mode;
      d.speed = speed;
      d.grounded = r.grounded;
      this.debug.setText(`mode ${mode}   speed ${speed.toFixed(1)} tiles/s   ${r.grounded ? 'on ground' : 'in air'}`);
    }
  }

  buildCourse(course, worldW, worldH) {
    const g = this.add.graphics().setDepth(1);
    for (const r of course.ground) {
      const body = this.matter.add.rectangle((r.col + r.w / 2) * TILE, (r.row + r.h / 2) * TILE, r.w * TILE, r.h * TILE, {
        isStatic: true,
        friction: 0,
        label: 'ground',
        collisionFilter: { category: CAT.WORLD, mask: CAT.LOCAL_RUNNER | CAT.REMOTE_RUNNER },
      });
      this.groundBodies.push(body);
      for (let row = 0; row < r.h; row++) {
        for (let col = 0; col < r.w; col++) {
          const top = row === 0;
          const shade = (col + row) % 2 === 0;
          g.fillStyle(top ? (shade ? 0x4ecdc4 : 0x45bdb4) : (shade ? 0x2a9d8f : 0x258f82), 1);
          g.fillRect((r.col + col) * TILE, (r.row + row) * TILE, TILE, TILE);
        }
      }
      g.fillStyle(0x1b1b2f, 1);
      g.fillRect(r.col * TILE, r.row * TILE, r.w * TILE, 4);
    }
    // Walls at both ends so the test runner can't leave the course.
    for (const x of [-TILE / 2, worldW + TILE / 2]) {
      this.matter.add.rectangle(x, worldH / 2, TILE, worldH * 2, {
        isStatic: true,
        friction: 0,
        label: 'wall',
        collisionFilter: { category: CAT.WORLD, mask: CAT.LOCAL_RUNNER | CAT.REMOTE_RUNNER },
      });
    }
    // A post and a number every 10 tiles, so movement reads in a screenshot.
    const groundTop = Math.min(...course.ground.map((r) => r.row)) * TILE;
    for (let col = 10; col < course.cols; col += 10) {
      this.add.rectangle(col * TILE, groundTop - TILE * 1.5, 6, TILE * 3, 0xffd23f).setDepth(2);
      this.add.text(col * TILE, groundTop - TILE * 3.4, String(col), { fontFamily: 'sans-serif', fontSize: '26px', color: '#ffd23f', fontStyle: 'bold' })
        .setOrigin(0.5).setStroke('#1b1b2f', 6).setDepth(2);
    }
  }

  /** Our own little critter, drawn in code (no files, nothing borrowed): a rounded body, big eyes, stubby feet. */
  makeRunnerTexture() {
    if (this.textures.exists('runner')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x1b1b2f, 1);
    g.fillRoundedRect(10, 56, 12, 8, 3); // feet
    g.fillRoundedRect(26, 56, 12, 8, 3);
    g.fillStyle(0xff6b6b, 1);
    g.fillRoundedRect(4, 8, 40, 52, 14); // body
    g.lineStyle(3, 0x1b1b2f, 1);
    g.strokeRoundedRect(4, 8, 40, 52, 14);
    g.fillStyle(0xffd23f, 1);
    g.fillCircle(24, 6, 5); // top knob
    g.lineStyle(2, 0x1b1b2f, 1);
    g.strokeCircle(24, 6, 5);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(19, 26, 8);
    g.fillCircle(33, 26, 8);
    g.fillStyle(0x1b1b2f, 1);
    g.fillCircle(22, 27, 4);
    g.fillCircle(36, 27, 4);
    g.generateTexture('runner', 48, 64);
    g.destroy();
  }
}
