// G2b: the contact obstacles (HANDOFF 5.2): bounce pad, seesaw, conveyor belt, falling tiles. Proves, on the pure
// rules and the code that wires them, that
//  - the gallery course has all four, and every one is valid,
//  - the numbers HANDOFF gives hold (tiles drop 0.6 s after the first touch and are back 5 s after they fell), a pad
//    throws a runner higher than a jump but not into orbit, a belt is slower than a run, a seesaw stops short of
//    about 22 degrees and an empty one comes level,
//  - the game builds them the way the spec says: a pad is a sensor, a belt's top speed is a surface speed the ground
//    probe adds, a falling tile stops colliding and leaves the ground list, a seesaw is a REAL dynamic body on a pin,
//  - one file per obstacle exists, and the e2e spec drives each with real keys (no skip/only, no __TR.hit shortcut).
// That the real Matter bodies bounce, tip, carry and drop is proved in real browsers by tests/e2e/contact.spec.js.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, fail, pass, read } from './_util.mjs';

const src = (rel) => import(pathToFileURL(join(ROOT, 'src', rel)).href);
const { TUNING, STEP } = await src('logic/tuning.js');
const contact = await src('logic/contact.js');
const { validateCourse } = await src('logic/course.js');

const out = [];

// 1. the gallery has all four, and they are valid
const gallery = JSON.parse(readFileSync(join(ROOT, 'src/game/courses/test-gallery.json'), 'utf8'));
const problems = validateCourse(gallery);
if (problems.length) fail(`test-gallery.json is not a valid course: ${problems[0]}`);
const kinds = new Set(gallery.obstacles.map((o) => o.type));
for (const type of contact.CONTACT_TYPES) {
  if (!kinds.has(type)) fail(`the gallery course has no ${type}`);
}
for (const o of gallery.obstacles.filter((x) => contact.CONTACT_TYPES.includes(x.type))) {
  const errors = contact.validateContactObstacle(o);
  if (errors.length) fail(`the gallery's ${o.type} is not valid: ${errors[0]}`);
}
const cps = gallery.checkpoints?.length ?? 0;
if (cps < 8) fail(`the gallery needs a checkpoint at each of its 8 bays (it has ${cps}): the e2e stands the runner at the start of each`);
out.push('gallery has the four contact obstacles, all valid');

// 2. the numbers
if (TUNING.tileDropDelay !== 0.6) fail(`tileDropDelay is ${TUNING.tileDropDelay}: HANDOFF 5.2 says falling tiles drop 0.6 s after the first touch`);
if (TUNING.tileRespawn !== 5) fail(`tileRespawn is ${TUNING.tileRespawn}: HANDOFF 5.2 says falling tiles respawn after 5 s`);
let tile = contact.touchTile(contact.newTile(), 10);
tile = contact.stepTile(tile, 10 + TUNING.tileDropDelay - STEP, TUNING);
if (tile.phase !== 'armed') fail('a tile dropped before 0.6 s after the first touch');
tile = contact.stepTile(tile, 10 + TUNING.tileDropDelay, TUNING);
if (tile.phase !== 'fallen') fail('a tile did not drop 0.6 s after the first touch');
tile = contact.stepTile(tile, 10 + TUNING.tileDropDelay + TUNING.tileRespawn - STEP, TUNING);
if (tile.phase !== 'fallen') fail('a tile came back before 5 s after it fell');
tile = contact.stepTile(tile, 10 + TUNING.tileDropDelay + TUNING.tileRespawn, TUNING);
if (tile.phase !== 'solid') fail('a tile did not come back 5 s after it fell');

const pad = gallery.obstacles.find((o) => o.type === 'bounce-pad');
const launch = contact.bounceLaunch(pad, 0);
if (!(launch < 0)) fail('a bounce pad does not throw a runner upwards');
const apex = (launch * launch) / (2 * TUNING.gravity);
const jumpApex = (TUNING.jumpSpeed * TUNING.jumpSpeed) / (2 * TUNING.gravity);
if (apex < Math.max(4, jumpApex * 2) || apex > 6) fail(`a bounce pad throws a runner ${apex.toFixed(1)} tiles up: it must be about 4 to 6, far above a ${jumpApex.toFixed(1)}-tile jump`);
if (contact.bounceLaunch(pad, launch) !== null) fail('a runner already flying up from the pad is launched again');

const belt = gallery.obstacles.find((o) => o.type === 'conveyor');
const beltSpeed = Math.abs(contact.beltSurface(belt).vx);
if (!(beltSpeed > 0 && beltSpeed < TUNING.runSpeed)) fail(`a belt moves at ${beltSpeed} tiles/s: it must be above 0 and slower than a run (${TUNING.runSpeed}) so a runner can always make way against it`);

const maxTiltDeg = (TUNING.seesawMaxTilt * 180) / Math.PI;
if (maxTiltDeg < 10 || maxTiltDeg > 22) fail(`a seesaw tips to ${maxTiltDeg.toFixed(0)} degrees: it should be gentle, 10 to 22`);
let st = { angle: TUNING.seesawMaxTilt, angVel: 0 };
for (let i = 0; i < 60 * 12; i++) {
  const r = contact.seesawAssist(st.angle, st.angVel, STEP, TUNING, false);
  st = { angle: r.angle + r.angVel * STEP, angVel: r.angVel };
}
if (Math.abs(st.angle) > 0.01) fail(`an empty seesaw does not come level (still ${st.angle.toFixed(3)} rad after 12 s)`);
const held = contact.seesawAssist(TUNING.seesawMaxTilt + 0.1, 5, STEP, TUNING, true);
if (held.angle > TUNING.seesawMaxTilt + 1e-9) fail('a seesaw can be pushed past its stop');
out.push('tiles 0.6 s / 5 s, pad apex 4 to 6 tiles, belt slower than a run, seesaw stop and levelling');

// 3. the game builds them the way the spec says (comments are removed first, so a comment cannot stand in for a call)
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
for (const f of ['bouncePad', 'seesaw', 'conveyor', 'fallingTiles']) {
  if (!existsSync(join(ROOT, `src/game/obstacles/${f}.js`))) fail(`src/game/obstacles/${f}.js is missing`);
}
const index = code('src/game/obstacles/index.js');
for (const type of contact.CONTACT_TYPES) {
  if (!index.includes(`'${type}'`) && !new RegExp(`\\b${type}:`).test(index)) fail(`obstacles/index.js does not build a ${type}`);
}
if (!/it\.touch\(/.test(index)) fail('obstacles/index.js must hand a contact to the obstacle (it.touch): a pad, a tile and a seesaw decide for themselves');
const padCode = code('src/game/obstacles/bouncePad.js');
if (!/isSensor:\s*true/.test(padCode)) fail('the bounce pad must be a sensor (isSensor: true): a runner walks into it, nothing blocks them');
if (!/bounceLaunch\(/.test(padCode)) fail('the bounce pad must get its launch from src/logic/contact.js bounceLaunch');
const beltCode = code('src/game/obstacles/conveyor.js');
if (!/beltSurface\(/.test(beltCode) || !/plugin:\s*\{\s*surface/.test(beltCode)) fail('the conveyor must put its surface speed (beltSurface) on its body as plugin.surface');
const runnerCode = code('src/game/runner/Runner.js');
if (!/plugin\?\.surface\b/.test(runnerCode)) fail('Runner.probeGround must add the belt\'s surface speed (plugin?.surface) to the ground velocity');
const tilesCode = code('src/game/obstacles/fallingTiles.js');
if (!/stepTile\(/.test(tilesCode) || !/touchTile\(/.test(tilesCode)) fail('the falling tiles must use stepTile / touchTile from src/logic/contact.js');
if (!/collisionFilter\.mask\s*=\s*0/.test(tilesCode)) fail('a fallen tile must stop colliding (collisionFilter.mask = 0)');
if (!/groundBodies\.splice\(/.test(tilesCode)) fail('a fallen tile must leave the ground list (groundBodies.splice), or a runner would still stand on thin air');
const seesawCode = code('src/game/obstacles/seesaw.js');
if (!/Constraint\.create\(/.test(seesawCode)) fail('the seesaw must be hinged on a pin (Matter Constraint.create)');
if (/isStatic:\s*true/.test(seesawCode)) fail('the seesaw plank must be a dynamic body (HANDOFF 5.2: "dynamic, hinged"), not a static one');
if (!/seesawAssist\(/.test(seesawCode)) fail('the seesaw must use src/logic/contact.js seesawAssist for its stop and its levelling spring');
out.push('pad is a sensor, belt has a surface speed, tiles stop colliding and leave the ground list, seesaw is a real hinged body');

// 4. the e2e spec is the real thing
const spec = code('tests/e2e/contact.spec.js');
if (/\b(test|it|describe)\.(skip|only|fixme|todo)\b/.test(spec)) fail('contact.spec.js has a skip/only/fixme');
const tests = (spec.match(/^\s*test\(/gm) ?? []).length;
if (tests < 7) fail(`contact.spec.js has only ${tests} tests (needs at least 7: placement, pad, seesaw, belt with, belt against, tile, tiles crossed)`);
if (/__TR\.hit\(/.test(spec)) fail('contact.spec.js must not use the __TR.hit() shortcut');
if (!/keyboard\.(down|press)/.test(spec)) fail('contact.spec.js presses no real keys');
for (const type of contact.CONTACT_TYPES) {
  if (!spec.includes(`'${type}'`)) fail(`contact.spec.js never looks at the ${type}`);
}
if (!/waitForTimeout\(\s*1200\s*\)/.test(spec) && !/goTo\(/.test(spec)) fail('contact.spec.js does not wait for the camera before its screenshots');
out.push('one file per obstacle; e2e uses real keys, no shortcuts, no skips');

pass(out.join('; '));
