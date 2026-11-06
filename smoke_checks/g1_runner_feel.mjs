// G1: the runner's feel targets (src/game/CLAUDE.md "Feel targets"), proved on the pure rules with the
// headless simulation, plus proof that the flat test course is valid, the race scene is in the build, and
// the e2e spec drives the runner with real key presses. The simulation uses the SAME stepRunner as the game;
// that the real Matter body behaves the same is proved in real browsers by tests/e2e/runner.spec.js.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, fail, pass, read } from './_util.mjs';

const src = (rel) => import(pathToFileURL(join(ROOT, 'src', rel)).href);
const { simulate } = await src('logic/runnerSim.js');
const { TUNING } = await src('logic/tuning.js');
const { validateCourse } = await src('logic/course.js');

const at = (events, type, from = 0) => events.find((e) => e.type === type && e.t >= from);
const GAP = 2 + TUNING.bodyW; // a two-tile gap plus the body width
const out = [];

// 1. Holding run reaches top speed in about a quarter of a second.
{
  const { trace } = simulate({ seconds: 1, intentAt: () => ({ right: true }) });
  const t = trace.find((s) => s.vx >= 0.95 * TUNING.runSpeed)?.t;
  if (t === undefined || t > 0.3) fail(`top speed takes ${t ?? 'never'} s (target about 0.25 s)`);
  out.push(`top speed ${t.toFixed(2)} s`);
}

// 2. A jump clears a two-tile gap at full speed but not from a standstill.
{
  const run = simulate({ seconds: 3, intentAt: (i) => ({ right: true, jump: i >= 60 && i < 66 }) });
  const j = at(run.events, 'jump');
  if (!j) fail('a running jump never happens');
  const landed = run.trace.find((s) => s.t > j.t + 0.1 && s.y === 0);
  const running = landed.x - j.x;
  const stand = simulate({ seconds: 2, intentAt: (i) => ({ right: true, jump: i === 0 }) });
  const j2 = at(stand.events, 'jump');
  if (!j2) fail('a standing jump never happens');
  const standing = stand.trace.find((s) => s.t > j2.t + 0.1 && s.y === 0).x - j2.x;
  if (running <= GAP + 0.5) fail(`running jump covers ${running.toFixed(2)} tiles, needs more than ${(GAP + 0.5).toFixed(2)} to clear a 2-tile gap`);
  if (standing >= 2) fail(`a standing jump covers ${standing.toFixed(2)} tiles and would cross a 2-tile gap (limit 2)`);
  out.push(`jump ${running.toFixed(1)} tiles running vs ${standing.toFixed(1)} standing`);
}

// 3. The dive covers about three tiles.
{
  const { events } = simulate({ seconds: 2, intentAt: (i) => ({ right: true, dive: i >= 60 && i < 64 }) });
  const d = at(events, 'dive');
  const back = d && at(events, 'run', d.t);
  if (!back) fail('a dive never starts or never ends');
  const dist = back.x - d.x;
  if (dist < 2.5 || dist > 3.8) fail(`dive covers ${dist.toFixed(2)} tiles (target about 3)`);
  out.push(`dive ${dist.toFixed(1)} tiles`);
}

// 4. A big hit tumbles about four to six tiles (0.8 s, then spring-up), and a dive is the fastest way up.
{
  const hit = simulate({ seconds: 3, hits: [{ step: 60, dir: 1 }] });
  const tumble = at(hit.events, 'tumble');
  const spring = tumble && at(hit.events, 'spring', tumble.t);
  const run = spring && at(hit.events, 'run', spring.t);
  if (!run) fail('a hit does not tumble, spring up and run again');
  const dist = run.x - tumble.x;
  if (dist < 3.5 || dist > 6.5) fail(`a hit sends the runner ${dist.toFixed(2)} tiles (target about 4-6)`);
  if (Math.abs(spring.t - tumble.t - TUNING.tumbleTime) > 0.05) fail(`tumble lasts ${(spring.t - tumble.t).toFixed(2)} s (target ${TUNING.tumbleTime} s)`);
  const dived = simulate({ seconds: 3, hits: [{ step: 0, dir: 1 }], intentAt: (i) => ({ dive: i >= 10 && i < 14 }) });
  const up = at(dived.events, 'run', at(dived.events, 'tumble').t).t;
  const wait = run.t - tumble.t;
  if (up >= wait - 0.4) fail(`diving gets up in ${up.toFixed(2)} s, waiting takes ${wait.toFixed(2)} s: dive must be much faster`);
  out.push(`tumble ${dist.toFixed(1)} tiles, dive-recover ${up.toFixed(2)} s vs ${wait.toFixed(2)} s`);
}

// 5. The flat test course is valid data.
{
  const course = JSON.parse(read('src/game/courses/test-flat.json'));
  const errors = validateCourse(course);
  if (errors.length) fail(`test-flat.json is invalid: ${errors.join('; ')}`);
}

// 6. The race scene is in the build (the index page's own script and preloads).
{
  const indexPath = join(ROOT, 'dist', 'index.html');
  if (!existsSync(indexPath)) fail('dist/index.html missing: run the build first');
  const html = readFileSync(indexPath, 'utf8');
  const urls = [
    ...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g),
    ...html.matchAll(/<link[^>]*\srel="modulepreload"[^>]*\shref="([^"]+)"/g),
    ...html.matchAll(/<link[^>]*\shref="([^"]+)"[^>]*\srel="modulepreload"/g),
  ].map((m) => m[1]);
  let bundle = '';
  for (const u of new Set(urls)) {
    const file = join(ROOT, 'dist', u.replace('/tumble-rush/', ''));
    if (existsSync(file)) bundle += readFileSync(file, 'utf8');
  }
  for (const needle of ['Shift dive', 'test-flat', 'Invalid course']) {
    if (!bundle.includes(needle)) fail(`the built game never mentions "${needle}": the race scene is not in the build`);
  }
}

// 7. The e2e spec drives the runner with real keys and is not switched off.
{
  const spec = 'tests/e2e/runner.spec.js';
  if (!existsSync(join(ROOT, spec))) fail(`${spec} is missing`);
  const text = read(spec);
  if (!/page\.keyboard\.(down|press)\(/.test(text)) fail(`${spec} does not press real keys`);
  if (/\btest\.(skip|only|fixme|fail)\b|\.only\(|\btest\.slow\b/.test(text)) fail(`${spec} has a skip/only/fixme`);
  if ((text.match(/^test\(/gm) || []).length < 6) fail(`${spec} lost tests (expected at least 6)`);
}

pass(`${out.join('; ')}; flat course valid; race scene built; runner e2e uses real keys`);
