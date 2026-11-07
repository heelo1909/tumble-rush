// G3a: the race flow (HANDOFF 5.1, 5.4): a 3-2-1 countdown, the race clock, checkpoints, the respawn after a fall.
// Proves, on the pure rules and the code that wires them, that
//  - the numbers HANDOFF gives hold: a 3 s countdown, a respawn 1 s after falling out, back within the 1.5 s feel target,
//  - a race run through logic/race.js goes countdown -> racing with exactly one GO, hands out checkpoints left to right,
//    and puts a fallen runner at the LAST checkpoint (or the start) after the delay, and only then lets them steer,
//  - the course the flow runs on (test-race) is valid, has flags, and its pits are 3 tiles wide: a jump from a run clears
//    them (src/game/CLAUDE.md feel target), a jump from a standstill does not,
//  - the scene runs the rules the way the spec says (the keys are ignored unless controlsLive, a respawn places the runner
//    at the spot the rules name and cuts the camera there), main.js turns the flow on, the HUD has its test ids,
//  - the e2e spec is the real thing: real keys, the words 3 2 1 GO!, no shortcuts, no skips.
// That the real game holds the runner, counts down, flags, falls and respawns is proved in real browsers by
// tests/e2e/race.solo.spec.js.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, fail, pass, read, walk } from './_util.mjs';

const src = (rel) => import(pathToFileURL(join(ROOT, 'src', rel)).href);
const { TUNING, STEP, jumpApex } = await src('logic/tuning.js');
const { newRace, stepRace, controlsLive } = await src('logic/race.js');
const { countdownLabel, formatRaceTime } = await src('logic/clock.js');
const { validateCourse } = await src('logic/course.js');

const out = [];

// 1. the numbers HANDOFF gives
if (TUNING.countdown !== 3) fail(`countdown is ${TUNING.countdown} s: HANDOFF 5.4 says a 3-2-1 countdown`);
if (TUNING.respawnDelay !== 1) fail(`respawnDelay is ${TUNING.respawnDelay} s: HANDOFF 5.1 says a runner who falls off respawns after 1 s`);
if (TUNING.respawnDelay > 1.5) fail('respawnDelay is above the 1.5 s respawn feel target (src/game/CLAUDE.md)');
if (TUNING.goShown > 1.5) fail(`GO! stays ${TUNING.goShown} s: a banner fades within 1.5 s (src/ui/CLAUDE.md rule 5)`);
out.push('countdown 3 s, respawn 1 s');

// 2. a whole race on the pure rules
const course = JSON.parse(readFileSync(join(ROOT, 'src/game/courses/test-race.json'), 'utf8'));
const problems = validateCourse(course);
if (problems.length) fail(`test-race.json is not a valid course: ${problems[0]}`);
if ((course.checkpoints?.length ?? 0) < 2) fail('test-race.json needs at least two checkpoints: the e2e falls after the first one and passes the second');
let race = newRace();
if (controlsLive(race)) fail('a runner may steer during the countdown');
let words = [];
let goes = 0;
for (let i = 0; i < 70 * 3 && race.phase === 'countdown'; i++) {
  const w = countdownLabel(race.t);
  if (words[words.length - 1] !== w) words.push(w);
  const r = stepRace(race, { x: 2.5, y: 9.4 }, course);
  race = r.state;
  goes += r.events.filter((e) => e.type === 'go').length;
}
if (race.phase !== 'racing' || goes !== 1) fail(`the countdown ended in phase ${race.phase} with ${goes} GO events: it must end in racing, with one`);
if (words.join(' ') !== '3 2 1') fail(`the countdown showed "${words.join(' ')}", it must show 3 2 1`);
if (race.t < 0 || race.t > 0.1) fail(`the race clock reads ${race.t} right after GO: it must start at 0`);
if (!controlsLive(race)) fail('a runner may not steer after GO');
const cps = course.checkpoints;
const at = (col) => ({ x: col + 0.5, y: 9.4 });
for (let i = 0; i < cps.length; i++) {
  const r = stepRace(race, at(cps[i].col), course);
  if (r.state.checkpoint !== i || r.events[0]?.index !== i) fail(`running to checkpoint ${i} did not pass it`);
  race = r.state;
}
race = stepRace(race, { x: 5, y: course.rows + 0.5 }, course).state;
if (race.out === null || controlsLive(race)) fail('a runner below the bottom of the course is not waiting to be put back, or may still steer');
let back = null;
for (let i = 0; i < 70 && back === null; i++) {
  const r = stepRace(race, { x: 5, y: course.rows + 3 }, course);
  race = r.state;
  back = r.events.find((e) => e.type === 'respawn') ?? null;
  if (back === null && race.out === null) break;
}
const last = cps[cps.length - 1];
if (back === null || back.col !== last.col || back.row !== last.row) fail(`after falling the runner was put at ${JSON.stringify(back)}: it must be the last checkpoint passed (${JSON.stringify(last)})`);
if (race.t < TUNING.respawnDelay - STEP) fail('the respawn came before the delay was up');
out.push('countdown 3 2 1 then one GO; checkpoints in order; a fall goes back to the last flag');

// 3. the course the flow runs on: its pits can be jumped at a run, not from a standstill
const blocks = [...course.ground].sort((a, b) => a.col - b.col);
const gaps = [];
for (let i = 1; i < blocks.length; i++) gaps.push(blocks[i].col - (blocks[i - 1].col + blocks[i - 1].w));
if (gaps.length < 2) fail('test-race.json needs two pits: the e2e falls into one before any checkpoint and one after');
for (const g of gaps) {
  if (g < 3) fail(`a pit ${g} tiles wide: a gap that needs a run-up is at least 3 tiles wide (PROGRESS Decision 33b)`);
  if (g > 3.5) fail(`a pit ${g} tiles wide: a running jump clears about 3.5 (a 4.3-tile jump minus the body width)`);
}
const runJump = TUNING.runSpeed * ((2 * TUNING.jumpSpeed) / TUNING.gravity); // distance of a jump at full speed
if (runJump - TUNING.bodyW < Math.max(...gaps)) fail(`a running jump covers ${runJump.toFixed(2)} tiles, not enough for a pit ${Math.max(...gaps)} wide`);
if (jumpApex() > 3) fail('a jump rises more than 3 tiles');
if (formatRaceTime(-1) !== '0:00.0' || formatRaceTime(61.5) !== '1:01.5') fail('the timer text is wrong: it must read 0:00.0 in the countdown and 1:01.5 at 61.5 s');
out.push(`pits ${gaps.join(', ')} tiles wide, jumpable at a run`);

// 4. the scene runs the rules, main.js turns the flow on, the HUD has its test ids (comments removed first)
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const scene = code('src/game/scenes/RaceScene.js');
if (!/stepRace\(/.test(scene)) fail('RaceScene must run the race rules (stepRace) every physics step');
if (!/controlsLive\(/.test(scene) || !/NO_INTENT/.test(scene)) fail('RaceScene must give the runner NO_INTENT unless controlsLive: the keys do nothing in the countdown');
// (the branch for the respawn event itself: teleport() also calls placeAt, so "placeAt appears somewhere" proves nothing)
if (!/e\.type === 'respawn'\)\s*\{[^}]*\.placeAt\(/.test(scene)) fail('RaceScene must put a fallen runner back (placeAt) when the rules say respawn');
if (!/centerOnX\(/.test(scene)) fail('a respawn must cut the camera to the runner (centerOnX), not pan back across the course');
if (!/countdownLabel\(/.test(scene) || !/formatRaceTime\(/.test(scene)) fail('RaceScene must hand the HUD the words from src/logic/clock.js');
if (!/raceTenth\(/.test(scene) || !/word\s*!==\s*this\.hudWord/.test(scene)) fail('RaceScene must redraw the HUD when the tenth (raceTenth) OR the countdown word changes: a gate on the tenth alone showed 2 and 1 a tenth late');
if (/from\s+['"][^'"]*\/ui\//.test(scene)) fail('RaceScene must not import from src/ui (layer rule): main.js hands it the HUD');
const main = code('src/main.js');
if (!/race:\s*\{[^}]*flow:\s*true/.test(main)) fail('main.js must turn the flow on for ?scene=race');
if (!/createHud\(/.test(main) || !/registry\.set\('hud'/.test(main)) fail('main.js must create the HUD and hand it to the scene');
const hud = code('src/ui/hud.js');
for (const id of ['countdown', 'timer', 'toast']) {
  if (!hud.includes(`'${id}'`)) fail(`the HUD has no data-testid "${id}"`);
}
if (/\bfrom\s+['"](?!\.\/hud\.css)/.test(hud)) fail('src/ui/hud.js imports something other than its stylesheet');
// the HUD lies over the picture, not over the window: the canvas is letterboxed in a window that is not 16:9
if (!/\bplace\(/.test(hud) || !/style\.(left|top)|s\.left|s\.top/.test(hud)) fail('src/ui/hud.js has no place(rect) that puts the HUD layer over the canvas rectangle');
if (!/hud\.place\(\s*game\.canvas\.getBoundingClientRect\(\)\s*\)/.test(main)) fail('main.js must place the HUD over the canvas rectangle (hud.place(game.canvas.getBoundingClientRect()))');
if (!/ResizeObserver/.test(main) || !/Scale\.Events\.RESIZE/.test(main)) fail('main.js must re-place the HUD when the picture is rescaled (a ResizeObserver and Phaser\'s scale RESIZE event)');
if (!/id="ui"/.test(read('index.html'))) fail('index.html has no #ui layer for the HUD');
const dist = walk('dist/assets').filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
if (!dist) fail('dist/assets has no script: smoke builds before it runs the checks');
for (const id of ['countdown', 'timer', 'toast']) {
  // the test id and its class name together: a bare word could come from any library in the bundle
  if (!new RegExp(`['"\`]${id}['"\`]\\s*,\\s*['"\`]tr-${id}['"\`]`).test(dist)) fail(`the built game has no HUD element "${id}" (test id and class tr-${id})`);
}
if (!existsSync(join(ROOT, 'src/game/courses/test-race.json'))) fail('test-race.json is missing');
out.push('scene runs stepRace and obeys controlsLive, respawn cuts the camera, main wires the HUD, test ids are in the build');

// 5. the e2e spec is the real thing
const spec = code('tests/e2e/race.solo.spec.js');
if (/\b(test|it|describe)\.(skip|only|fixme|todo)\b/.test(spec)) fail('race.solo.spec.js has a skip/only/fixme');
const tests = (spec.match(/^\s*test\(/gm) ?? []).length;
if (tests < 4) fail(`race.solo.spec.js has only ${tests} tests (needs at least 4: countdown, fall before a checkpoint, fall after one, the HUD on the picture)`);
if (!/setViewportSize\(\{\s*width:\s*w,\s*height:\s*h\s*\}\)/.test(spec) || !/\[1280,\s*800\]/.test(spec) || !/\[1440,\s*900\]/.test(spec)) fail('race.solo.spec.js does not look at the HUD in a 1280x800 and a 1440x900 window (src/ui/CLAUDE.md)');
if (!/getBoundingClientRect/.test(spec) || !/inside\(r\.timer,\s*r\.canvas\)/.test(spec)) fail('race.solo.spec.js does not check that the timer lies inside the canvas rectangle');
if (/__TR\.(teleport|clock|hit)\(/.test(spec)) fail('race.solo.spec.js must not use __TR.teleport, clock or hit: a race test drives real keys');
if (!/keyboard\.down\(/.test(spec) || !/keyboard\.press\('Space'\)/.test(spec)) fail('race.solo.spec.js presses no real keys');
if (!/\['3', '2', '1', 'GO!'\]/.test(spec)) fail('race.solo.spec.js never checks the words 3, 2, 1, GO! on screen');
if (!/toBeLessThanOrEqual\(1\.5\)/.test(spec)) fail('race.solo.spec.js does not hold the respawn to the 1.5 s feel target');
if (!/respawnDelay/.test(spec)) fail('race.solo.spec.js does not check the 1 s respawn delay');
out.push('e2e uses real keys, the 3 2 1 GO! words and the 1.5 s target, no shortcuts, no skips');

pass(out.join('; '));
