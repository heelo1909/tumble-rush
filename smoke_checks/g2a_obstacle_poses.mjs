// G2a: the race-clock obstacles (HANDOFF 5.2). Proves, on the pure rules and the course files, that
//  - every course's obstacles are valid, and every pose is finite, continuous and periodic for 0-120 s,
//  - the gallery course has all four obstacle types, and its bar and hammer really hit where they sweep
//    while its pusher wall and platform never do,
//  - the game sets bodies from those poses WITH velocity (`true`): that is the ground velocity a runner rides on a moving platform,
//  - one file per obstacle type exists, and the e2e spec drives hits with real contacts and real keys
//    (not the __TR.hit() shortcut) and has no skip/only.
// That the real Matter bodies hit, push and carry is proved in real browsers by tests/e2e/obstacles.spec.js.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, fail, pass, read } from './_util.mjs';

const src = (rel) => import(pathToFileURL(join(ROOT, 'src', rel)).href);
const { OBSTACLE_TYPES, pose, hitFrom, bodySize } = await src('logic/obstacles.js');
const { validateCourse } = await src('logic/course.js');
const { STEP } = await src('logic/tuning.js');

const out = [];
const dir = join(ROOT, 'src/game/courses');
const courses = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => ({ file: f, json: JSON.parse(readFileSync(join(dir, f), 'utf8')) }));
if (!courses.some((c) => c.file === 'test-gallery.json')) fail('src/game/courses/test-gallery.json is missing');

// 1. every course is valid, and every obstacle in it moves smoothly and repeats exactly
let obstacleCount = 0;
for (const { file, json } of courses) {
  const problems = validateCourse(json);
  if (problems.length) fail(`${file} is not a valid course: ${problems[0]}`);
  for (const [i, o] of (json.obstacles ?? []).entries()) {
    if (!OBSTACLE_TYPES.includes(o.type)) continue; // G2b's contact obstacles have no pose = f(t): smoke_checks/g2b_contact_obstacles.mjs covers them
    obstacleCount++;
    const name = `${file} obstacles[${i}] (${o.type})`;
    const period = o.type === 'spinning-bar' ? 1 / Math.abs(o.rps) : o.period;
    let prev = pose(o.type, o, 0);
    for (let k = 1; k <= 120 / STEP; k++) {
      const t = k * STEP;
      const p = pose(o.type, o, t);
      if (![p.x, p.y, p.angle].every(Number.isFinite)) fail(`${name} has a non-number pose at t=${t.toFixed(2)}`);
      // one physics step may move a body less than a quarter tile and turn it less than a third of a radian: more is a jump, and would tunnel
      if (Math.hypot(p.x - prev.x, p.y - prev.y) > 0.25 || Math.abs(p.angle - prev.angle) > 0.33) fail(`${name} jumps between t=${(t - STEP).toFixed(3)} and t=${t.toFixed(3)}`);
      prev = p;
    }
    for (const t of [0, 0.37, 1.9, 7.3]) {
      const a = pose(o.type, o, t);
      const b = pose(o.type, o, t + period);
      const turn = Math.abs(Math.sin((a.angle - b.angle) / 2));
      if (Math.abs(a.x - b.x) > 1e-6 || Math.abs(a.y - b.y) > 1e-6 || turn > 1e-6) fail(`${name} does not repeat after one period (${period} s)`);
    }
    const before = pose(o.type, o, -2);
    const start = pose(o.type, o, 0);
    if (before.x !== start.x || before.y !== start.y || before.angle !== start.angle) fail(`${name} moves during the countdown (t < 0)`);
  }
}
out.push(`${courses.length} courses, ${obstacleCount} obstacles: valid, smooth for 120 s, periodic, still in the countdown`);

// 2. the gallery shows all four, and only the bar and the hammer hit
const gallery = courses.find((c) => c.file === 'test-gallery.json').json;
const kinds = new Set(gallery.obstacles.map((o) => o.type));
for (const type of OBSTACLE_TYPES) if (!kinds.has(type)) fail(`the gallery course has no ${type}`);
for (const o of gallery.obstacles) {
  if (!OBSTACLE_TYPES.includes(o.type)) continue; // a contact obstacle (G2b): see g2b_contact_obstacles.mjs
  let hits = 0;
  // walk a point that sits on the obstacle's own body (its centre, and a point towards its end) through ten seconds
  const { w } = bodySize(o.type, o);
  for (let t = 0; t < 10; t += STEP) {
    const p = pose(o.type, o, t);
    const tip = { x: p.x + Math.cos(p.angle) * (w / 2 - 0.1), y: p.y + Math.sin(p.angle) * (w / 2 - 0.1) };
    if (hitFrom(o.type, o, t, p.x, p.y) || hitFrom(o.type, o, t, tip.x, tip.y)) hits++;
  }
  const hitter = o.type === 'spinning-bar' || o.type === 'swinging-hammer';
  if (hitter && hits === 0) fail(`the gallery's ${o.type} never hits anything in 10 s: it is too slow to count as a hit`);
  if (!hitter && hits > 0) fail(`the gallery's ${o.type} hits: only a bar and a hammer should tumble a runner`);
}
out.push('gallery has all four types; the bar and hammer hit, the pusher and platform do not');

// 3. the game gives bodies the velocity of their move
// comments are removed first, so a comment that mentions a call cannot stand in for the call
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const common = code('src/game/obstacles/common.js');
if (!/Body\.setPosition\(\s*body\s*,[^)]*,\s*true\s*\)/.test(common)) fail('movePose must call Body.setPosition(body, p, true): the true is the velocity a runner rides along with on a moving platform');
if (!/Body\.setAngle\(\s*body\s*,[^)]*,\s*true\s*\)/.test(common)) fail('movePose must pass true to Body.setAngle too, the same way as to setPosition');
const index = code('src/game/obstacles/index.js');
if (!/pose\(it\.type, it\.params, t\)/.test(index)) fail('obstacles/index.js must take every pose from src/logic/obstacles.js pose()');

if (!/hitOnContact\(/.test(index)) fail('obstacles/index.js must decide a hit with src/logic/obstacles.js hitOnContact (that is where the immunity rule lives)');

// 4. one file per obstacle type
for (const f of ['spinningBar', 'swingingHammer', 'pusherWall', 'movingPlatform']) {
  if (!existsSync(join(ROOT, `src/game/obstacles/${f}.js`))) fail(`src/game/obstacles/${f}.js is missing`);
}

// 5. the e2e spec is the real thing
const spec = read('tests/e2e/obstacles.spec.js');
if (/\b(test|it|describe)\.(skip|only|fixme|todo)\b/.test(spec)) fail('obstacles.spec.js has a skip/only/fixme');
const tests = (spec.match(/^\s*test\(/gm) ?? []).length + (spec.includes('for (const [name, bay') ? 1 : 0); // the loop makes two tests from one block
if (tests < 6) fail(`obstacles.spec.js has only ${tests} tests (needs at least 6: poses, clock, bar, hammer, pusher, platform)`);
if (/__TR\.hit\(/.test(spec)) fail('obstacles.spec.js must not use the __TR.hit() shortcut: a hit has to come from a real contact');
if (!/keyboard\.(down|press)/.test(spec)) fail('obstacles.spec.js presses no real keys');
for (const by of ['spinning-bar', 'swinging-hammer']) {
  if (!spec.includes(`'${by}'`)) fail(`obstacles.spec.js never checks a hit by the ${by}`);
}
out.push('one file per obstacle; the game sets pose with velocity; e2e uses real keys and real contacts');

pass(out.join('; '));
