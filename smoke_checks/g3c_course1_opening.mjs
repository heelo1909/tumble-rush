// G3c: the opening of course 1 and the test player that finishes it (HANDOFF 5.3, 10 G3c).
// Proves, on the course data and the code around it, that
//  - src/game/courses/course1.json is a valid course with a finish and a minTime nobody can beat (not above what a runner at
//    dive speed needs), and it follows the course-builder rules the earlier stages found: every pit a runner has to jump is
//    3 tiles wide (Decision 33b: wide enough to need a run-up, not wider than a running jump clears), has a run-up of at
//    least 5 tiles after the spawn or the last flag, and a fall to the bottom is under 3.5 tiles (Decision 54); no flag is
//    within reach of a swinging thing (Decision 55); there are 2 pits, a spinning bar and a row of falling tiles that bridges
//    a pit, the bar reaches a standing runner's head by 0.15 to 0.6 tiles (a lesson, not a wall) and does not touch the ground, and the ground around it is solid for
//    8 tiles each way, so a tumble cannot throw the runner into a pit,
//  - the scene knows course1 and main.js reaches it with ?test=1&scene=course1, with the race flow, and the build has it,
//  - the e2e spec and the test player are the real thing: real keys (Space and Shift taps, ArrowRight held), no skips, no
//    teleport, clock, hit or autopilot, the finish and the results time checked, the flags in order, the shots taken.
// That the player really finishes the opening in both browsers is proved by tests/e2e/course1.spec.js.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, fail, pass, read, walk } from './_util.mjs';

const src = (rel) => import(pathToFileURL(join(ROOT, 'src', rel)).href);
const { TUNING } = await src('logic/tuning.js');
const { validateCourse, groundGaps } = await src('logic/course.js');
const { TILE_H } = await src('logic/contact.js');

const out = [];
const MAX_PIT = 3.5; // a running jump clears about 4.3 tiles (G3b measured 4.33); the body is 0.8 wide: 4.3 - 0.8
const RUN_UP = 5;
const SAFE_GROUND = 8; // a tumble throws a runner 4 to 6 tiles
const MAX_FALL = 3.5; // Decision 54

let course;
try {
  course = JSON.parse(read('src/game/courses/course1.json'));
} catch (e) {
  fail(`src/game/courses/course1.json is missing or is not JSON (${e.message})`);
}

// 1. a valid course with a finish
const errors = validateCourse(course);
if (errors.length > 0) fail(`course1.json is not a valid course: ${errors[0]}`);
if (!course.finish || typeof course.minTime !== 'number') fail('course1.json needs a finish and a minTime');
const run = course.finish.col - (course.spawn.col + 0.5);
if (course.minTime > run / TUNING.diveSpeed) fail(`minTime ${course.minTime} s is more than the ${(run / TUNING.diveSpeed).toFixed(2)} s a runner at dive speed needs: a real run could be rejected as too fast`);
out.push(`valid, finish at ${course.finish.col}, minTime ${course.minTime} s`);

// 2. the pits
const obstacles = course.obstacles ?? [];
const bar = obstacles.find((o) => o.type === 'spinning-bar');
const tiles = obstacles.find((o) => o.type === 'falling-tiles');
if (!bar) fail('course1.json has no spinning bar: the opening teaches the bar');
if (!tiles) fail('course1.json has no row of falling tiles: the opening teaches the tiles');
const gaps = groundGaps(course);
const bridged = (g) => obstacles.some((o) => o.type === 'falling-tiles' && o.col - o.count / 2 <= g.from && o.col + o.count / 2 >= g.to);
const pits = gaps.filter((g) => !bridged(g));
if (pits.length < 2) fail(`course1.json has ${pits.length} pits to jump: the opening teaches the jump with at least 2`);
if (!gaps.some(bridged)) fail('the row of falling tiles does not bridge a pit (its ends must be the pit\'s ends)');
const groundTop = (col) => Math.min(...course.ground.filter((g) => col >= g.col && col < g.col + g.w).map((g) => g.row));
const flagCols = (course.checkpoints ?? []).map((c) => c.col + 0.5);
for (const p of pits) {
  if (p.width < 3 || p.width > MAX_PIT) fail(`the pit at ${p.from} is ${p.width} tiles wide: a jumpable pit is 3 to ${MAX_PIT} (Decision 33b)`);
  const behind = Math.max(course.spawn.col + 0.5, ...flagCols.filter((c) => c <= p.from));
  if (p.from - behind < RUN_UP) fail(`the pit at ${p.from} has only ${(p.from - behind).toFixed(1)} tiles of run-up after the spawn or the last flag: it needs ${RUN_UP}`);
}
for (const g of gaps) {
  const fall = course.rows - groundTop(g.from - 1);
  if (fall >= MAX_FALL) fail(`the fall at ${g.from} is ${fall} tiles to the bottom edge: under ${MAX_FALL} (Decision 54)`);
}
out.push(`${pits.length} pits of ${pits.map((p) => p.width).join(', ')} tiles with a run-up, a row of ${tiles.count} tiles over a pit`);

// 3. the bar and the tiles
const top = groundTop(Math.round(bar.col));
const lowestEdge = bar.row + bar.length / 2 + (bar.thick ?? 0.35) / 2; // the bar's lowest edge when it hangs straight down
const overlap = lowestEdge - (top - TUNING.bodyH); // how far that reaches into a standing runner's head
// A TEACHING bar clips a runner who times it badly; it is not a wall. The first version had its pivot 2 tiles over the
// ground (overlap about 1.1): it swept the runner's whole height most of the time, and a player who just ran at it was
// knocked back 6 times and lost 7 s. At an overlap of about 0.3 the same player is clipped once.
if (overlap < 0.15) fail(`the spinning bar's lowest edge is only ${overlap.toFixed(2)} tiles into a standing runner's head: it does not reach them (it needs 0.15 to 0.6)`);
if (overlap > 0.6) fail(`the spinning bar reaches ${overlap.toFixed(2)} tiles into a standing runner's head: it sweeps their whole height and is a wall, not a lesson (it needs 0.15 to 0.6)`);
if (lowestEdge > top + 0.01) fail('the spinning bar touches the ground when it hangs down');
const near = gaps.filter((g) => g.to > bar.col - SAFE_GROUND && g.from < bar.col + SAFE_GROUND);
if (near.length > 0) fail(`a pit at ${near[0].from} is within ${SAFE_GROUND} tiles of the spinning bar: a tumble could throw the runner into it`);
const tileTop = tiles.row - (tiles.h ?? TILE_H) / 2;
const ledge = groundTop(tiles.col - tiles.count / 2 - 1);
if (Math.abs(tileTop - ledge) > 0.01) fail(`the falling tiles' top is at ${tileTop} but the ground they join is at ${ledge}: the runner would step up or down`);
out.push(`the bar clips a standing runner's head by ${overlap.toFixed(2)} tiles and has solid ground 8 tiles each way, the tiles are flush with the ground`);

// 4. flags where nothing swings (Decision 55)
for (const o of obstacles.filter((x) => x.type === 'spinning-bar' || x.type === 'swinging-hammer')) {
  const reach = o.length;
  for (const f of flagCols) if (Math.abs(f - o.col) < reach / 2 + 2) fail(`a flag at ${f - 0.5} is within reach of the ${o.type} at ${o.col}: a runner put back there could be hit as they appear (Decision 55)`);
}
out.push(`${flagCols.length} flags clear of everything that swings`);

// 5. wired into the scene, main.js and the build
const scene = read('src/game/scenes/RaceScene.js');
if (!/import\s+course1\s+from\s+'\.\.\/courses\/course1\.json'/.test(scene) || !/COURSES\s*=\s*\{[^}]*\bcourse1\b/.test(scene)) fail('RaceScene.js does not load course1.json into COURSES');
const main = read('src/main.js');
if (!/course1:\s*\{\s*course:\s*'course1',\s*flow:\s*true\s*\}/.test(main)) fail('main.js has no TEST_SCENES entry course1 with the race flow (?test=1&scene=course1)');
const built = walk('dist').filter((f) => f.endsWith('.js')).map((f) => read(f)).join('\n');
if (!/["'`]?id["'`]?\s*:\s*["'`]course1["'`]/.test(built) || !built.includes('falling-tiles')) fail('the built game does not contain course1 (run the build first)');
out.push('scene, main.js and the build have course1');

// 6. the e2e spec and the player
const spec = read('tests/e2e/course1.spec.js');
const player = read('tests/e2e/player.js');
for (const [name, text] of [['course1.spec.js', spec], ['player.js', player]]) {
  if (/\b(test|it|describe)\.(skip|only|fixme|todo)\b/.test(text)) fail(`${name} has a skip/only/fixme`);
  if (/__TR\.(teleport|clock|hit|autopilot)\(/.test(text)) fail(`${name} uses __TR.teleport, clock, hit or autopilot: the test player drives real keys`);
}
if ((spec.match(/^\s*test\(/gm) ?? []).length < 1) fail('course1.spec.js has no test');
if (!/scene:\s*'course1'/.test(spec)) fail('course1.spec.js does not open the course1 scene');
if (!/keyboard\.down\('ArrowRight'\)/.test(player) || !/keyboard\.press\('Space'\)/.test(player) || !/keyboard\.press\('Shift'\)/.test(player)) fail('player.js does not hold ArrowRight and tap Space and Shift with real keys');
if (!/phase === 'finished'/.test(player)) fail('player.js does not play until the finish');
if (!/formatRaceTime\(finishTime\)/.test(spec) || !/'checkpoint'\)\.map\(\(e\) => e\.data\.index\)\)\.toEqual\(course\.checkpoints\.map/.test(spec)) fail('course1.spec.js does not check the time on the results or that every flag was passed in order');
if (!/toBeGreaterThanOrEqual\(course\.minTime\)/.test(spec)) fail('course1.spec.js does not check the finish time against minTime');
if ((spec.match(/\bshot\(page,/g) ?? []).length < 4 || !/await settle\(page\);\s*await shot\(page, 'countdown'/.test(spec)) fail('course1.spec.js takes fewer than 4 shots, or the first one without waiting for the new scene to be drawn');
out.push('e2e: a test player with real keys from the countdown to the results, flags in order, no shortcuts, no skips');

pass(out.join('; '));
