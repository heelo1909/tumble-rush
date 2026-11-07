import Phaser from 'phaser';
import { TILE, STEP, TUNING } from '../../logic/tuning.js';
import { validateCourse } from '../../logic/course.js';
import { NO_INTENT } from '../../logic/runner.js';
import { newRace, stepRace, controlsLive } from '../../logic/race.js';
import { countdownLabel, formatRaceTime, raceTenth } from '../../logic/clock.js';
import { CAT } from '../config.js';
import { Runner } from '../runner/Runner.js';
import { LocalControl } from '../runner/LocalControl.js';
import { buildObstacles } from '../obstacles/index.js';
import { W, H } from '../BootScene.js';
import testFlat from '../courses/test-flat.json';
import testGallery from '../courses/test-gallery.json';
import testRace from '../courses/test-race.json';

const COURSES = { 'test-flat': testFlat, 'test-gallery': testGallery, 'test-race': testRace };
const MAX_EVENTS = 500;
const CAMERA_LEAD = W * 0.1; // the camera's centre sits this far ahead of the runner, so there is more to see in front

/**
 * One local runner on a course. G1/G2: a free-run test course (the flat one, or the obstacle gallery). G3a adds the
 * race flow (registry `flow`): a 3-2-1 countdown the runner cannot move through, a race clock and timer, checkpoints,
 * and a respawn at the last checkpoint after a fall. The rules are in src/logic/race.js; this scene feeds them
 * the runner's place every physics step and acts on the events. The course is data and is built only after
 * validateCourse passes (src/game/CLAUDE.md rule 5).
 */
export class RaceScene extends Phaser.Scene {
  constructor() {
    super('race');
  }

  create() {
    const course = COURSES[this.registry.get('course') ?? 'test-flat'];
    const problems = validateCourse(course);
    if (problems.length) throw new Error(`Invalid course ${course.id}: ${problems.join('; ')}`);
    if (course.tile !== TILE) throw new Error(`Course tile ${course.tile} does not match the tuning TILE ${TILE}`);

    this.course = course;
    this.flow = this.registry.get('flow') === true;
    this.race = this.flow ? newRace() : null; // logic/race.js state; null on the free-run test courses
    // The race clock counts physics steps (Decision 21); with the flow on it starts 3 s before 0, so it reads -3 in the
    // countdown and 0 at GO, and obstacles hold their t = 0 pose until then (logic/obstacles.js).
    this.steps = this.flow ? -Math.round(TUNING.countdown / STEP) : 0;
    this.hudView = this.registry.get('hud') ?? null; // the DOM HUD from src/ui, handed over by main.js
    this.hudTenth = NaN; // the tenth of a second and the countdown word the HUD last showed: it is rewritten only when one changes
    this.hudWord = '';
    this.flags = [];
    this.events_ = [];
    this.groundBodies = [];
    this.clockPaused = false; // test only (window.__TR.clock): holds the race clock still
    const worldW = course.cols * TILE;
    const worldH = course.rows * TILE;

    this.cameras.main.setBackgroundColor('#2d2a55');
    this.makeRunnerTexture();
    this.buildCourse(course, worldW, worldH);
    this.obstacles = buildObstacles(this, course.obstacles ?? []);
    this.groundBodies.push(...this.obstacles.ground); // a runner can stand on a moving platform
    this.obstacles.step(0);

    const at = this.standAt(course.spawn);
    this.runner = new Runner(this, at.x, at.y);
    this.control = new LocalControl(this);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, worldW, worldH);
    cam.scrollY = worldH - H; // the view never moves up and down, so jumps read clearly
    cam.startFollow(this.runner.sprite, true, 0.12, 0, -CAMERA_LEAD, 0);

    this.hint = this.add.text(16, 12, '', { fontFamily: 'sans-serif', fontSize: '18px', color: '#ffffff', lineSpacing: 4 })
      .setScrollFactor(0).setDepth(50).setStroke('#1b1b2f', 4);
    this.hint.setText('Arrows / A D run   Up / W / Space jump   Shift dive');
    this.dbg = { mode: '', speed: -1, grounded: null }; // what the debug line shows now: rewrite the text only when it changes
    // The debug line is for the free-run test courses; the race flow shows only what a player should see (Decision 32g).
    this.debug = this.flow ? null : this.add.text(16, 64, '', { fontFamily: 'monospace', fontSize: '16px', color: '#ffd23f' })
      .setScrollFactor(0).setDepth(50).setStroke('#1b1b2f', 4);
    if (this.flow) {
      this.makeFlags(course);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.hudView?.clear());
    }

    // The rules run once per fixed physics step, in lockstep with Matter (src/game/CLAUDE.md rule 4).
    // No listener cleanup here: Phaser's Matter plugin shuts down before any scene handler could run
    // (this.matter.world is already null by then) and its World.shutdown removes every listener itself.
    this.matter.world.on(Phaser.Physics.Matter.Events.BEFORE_UPDATE, this.onStep, this);
    // A runner touching a bar or a hammer: the contact decides, from how fast it is moving there (src/logic/obstacles.js)
    this.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_START, this.onContact, this);
    this.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_ACTIVE, this.onContact, this);

    this.registry.set('scene', 'race');
  }

  /** Physics time in seconds: fixed steps, not frames, so it matches on every laptop. Negative in the countdown. */
  raceTime() {
    return this.steps * STEP;
  }

  logEvent(type, data = {}) {
    const log = this.events_;
    log.push({ t: Math.round(this.raceTime() * 1000) / 1000, type, data });
    if (log.length > MAX_EVENTS) log.shift();
  }

  /** Centre of a runner standing on tile (col, row): feet on the tile's bottom edge. */
  standAt({ col, row }) {
    return { x: (col + 0.5) * TILE, y: (row + 1) * TILE - (TUNING.bodyH * TILE) / 2 - 1 };
  }

  /**
   * One fixed step. The obstacles go to their pose for the time this step ends at, so after the step the
   * clock and every obstacle agree (the pose is a pure function of race time: src/logic/obstacles.js).
   */
  onStep() {
    this.obstacles.step(this.clockPaused ? this.raceTime() : (this.steps + 1) * STEP);
    // The keys are read every step (that also empties the press latches), but only a runner who may steer gets them:
    // not in the countdown, not while waiting to be put back (logic/race.js controlsLive).
    const intent = this.control.sample();
    this.runner.step(!this.flow || controlsLive(this.race) ? intent : NO_INTENT);
    if (!this.clockPaused) this.steps += 1;
    if (this.flow) this.stepFlow();
  }

  /** The race rules for this step: where the runner is in, what happened out. */
  stepFlow() {
    const { x, y } = this.runner.body.position;
    const r = stepRace(this.race, { x: x / TILE, y: y / TILE }, this.course);
    this.race = r.state;
    for (const e of r.events) this.onRaceEvent(e);
  }

  /** What the race rules say happened: log it, and show or do it. */
  onRaceEvent(e) {
    const x = Math.round((this.runner.body.position.x / TILE) * 100) / 100;
    if (e.type === 'go') {
      this.logEvent('go');
    } else if (e.type === 'checkpoint') {
      this.logEvent('checkpoint', { index: e.index, x });
      this.flags[e.index]?.reach();
      this.hudView?.toast('Checkpoint!');
    } else if (e.type === 'fall') {
      this.logEvent('fall', { x });
      this.hudView?.toast('Oops!');
    } else if (e.type === 'respawn') {
      const at = this.standAt(e);
      this.runner.placeAt(at.x, at.y);
      // a cut, not a long pan back across the course: the player sees themselves at the flag the moment they are put back
      this.cameras.main.centerOnX(at.x + CAMERA_LEAD);
      this.logEvent('respawn', { checkpoint: e.checkpoint, x: Math.round((at.x / TILE) * 100) / 100 });
    }
  }

  /** The engine says two bodies touch: if it is a runner and a bar or hammer, maybe a hit. */
  onContact(event) {
    if (this.clockPaused) return; // a held clock means nothing is really moving
    for (const pair of event.pairs) {
      const a = pair.bodyA.parent;
      const b = pair.bodyB.parent;
      const runner = a.plugin?.runner ?? b.plugin?.runner;
      if (!runner) continue;
      const effect = this.obstacles.touch(runner === a.plugin?.runner ? b : a, runner, this.raceTime());
      if (!effect) continue;
      if (effect.kind === 'launch') {
        runner.launch(effect.vy); // a bounce pad
      } else {
        this.logEvent('hit', { by: effect.by, dir: effect.dir, x: Math.round((runner.body.position.x / TILE) * 100) / 100 });
        runner.hit(effect.dir);
      }
    }
  }

  /** The Matter bodies of every runner in the race (a tile will not come back on top of one). */
  runnerBodies() {
    return [this.runner.body];
  }

  /** Test only (window.__TR.clock): set the race clock to t seconds, and keep it there if paused. */
  setClock(t, paused = false) {
    if (this.flow) throw new Error('clock() is for the free-run test courses: a race has its own clock (countdown, then racing)');
    this.steps = Math.round(t / STEP);
    this.clockPaused = !!paused;
    this.obstacles.step(this.raceTime());
  }

  /** Test only (window.__TR.teleport): stand the runner on checkpoint i of the course. */
  teleport(i) {
    const cp = (this.course.checkpoints ?? [])[i];
    if (!cp) throw new Error(`teleport: the course has no checkpoint ${i}`);
    const at = this.standAt(cp);
    this.runner.placeAt(at.x, at.y);
  }

  update() {
    const r = this.runner;
    this.obstacles.render(this.raceTime());
    r.render();
    const mode = r.logic.mode;
    const speed = Math.round((Math.abs(r.body.velocity.x) / (TILE * STEP)) * 10) / 10;
    const d = this.dbg;
    if (this.debug && (mode !== d.mode || speed !== d.speed || r.grounded !== d.grounded)) {
      d.mode = mode;
      d.speed = speed;
      d.grounded = r.grounded;
      this.debug.setText(`mode ${mode}   speed ${speed.toFixed(1)} tiles/s   ${r.grounded ? 'on ground' : 'in air'}`);
    }
    if (this.flow && this.hudView) {
      // The HUD shows tenths of a second, so there is nothing new to say until the tenth changes (logic/clock.js raceTenth:
      // the same cut as the timer text, and the countdown word changes on those boundaries too). The word is compared as
      // well, so a tuning of goShown that is not a whole tenth could not leave it stale.
      const tenth = raceTenth(this.race.t);
      const word = countdownLabel(this.race.t);
      if (tenth !== this.hudTenth || word !== this.hudWord) {
        this.hudTenth = tenth;
        this.hudWord = word;
        this.hudView.update({ countdown: word, time: formatRaceTime(this.race.t) });
      }
    }
  }

  /** A flag on a pole at each checkpoint: white until the runner passes it, then green. Drawn in code, no files. */
  makeFlags(course) {
    for (const cp of course.checkpoints ?? []) {
      const x = (cp.col + 0.5) * TILE;
      const feet = (cp.row + 1) * TILE;
      this.add.rectangle(x, feet - TILE, 6, TILE * 2, 0x1b1b2f).setDepth(2);
      const cloth = this.add.triangle(x + 3, feet - TILE * 1.55, 0, 0, 0, TILE * 0.8, TILE * 0.95, TILE * 0.4, 0xffffff)
        .setOrigin(0, 0.5).setStrokeStyle(3, 0x1b1b2f).setDepth(3);
      this.flags.push({ reach: () => cloth.setFillStyle(0x6bff6b) });
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
