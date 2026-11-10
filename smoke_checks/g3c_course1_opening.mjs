// G3c: the opening of course 1 and the test player that finishes it (HANDOFF 5.3, 10 G3c).
// Proves, on the course data and the code around it, that
//  - src/game/courses/course1.json is a valid course with a finish and a minTime nobody can beat (not above what a runner at
//    dive speed needs), and it follows the course-builder rules the earlier stages found: every pit a runner has to jump is
//    3 tiles wide (Decision 33b: wide enough to need a run-up, not wider than a running jump clears), has a run-up of at
//    least 5 tiles after the spawn or the last flag, and a fall to the bottom is under 3.5 tiles (Decision 54); no flag is
//    within reach of a swinging thing (Decision 55); there are 2 pits, a spinning bar and a row of falling tiles that bridges
//    a pit; the bar's lowest point goes into a standing runner's head by a little (a lesson, not a wall: Decisions 72, 74) and
//    the ground around it is solid for 8 tiles each way, so a tumble cannot throw the runner into a pit,
//  - the scene knows course1 and main.js reaches it with ?test=1&scene=course1, with the race flow, and the build has it,
//  - the e2e spec and the test player are the real thing: real keys (Space and Shift taps, ArrowRight held), no skips, no
//    teleport, clock, hit or autopilot, a test timeout the player's own limits sit under, the finish and the results time
//    checked, the flags in order, the shots taken. The source is read WITHOUT its comments, so a comment cannot satisfy a rule.
// That the player really finishes the opening in both browsers is proved by tests/e2e/course1.spec.js.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, fail, pass, read, walk } from './_util.mjs';

const src = (rel) => import(pathToFileURL(join(ROOT, 'src', rel)).href);
const { TUNING } = await src('logic/tuning.js');
const { validateCourse, groundGaps, pitsToJump } = await src('logic/course.js');
const { TILE_H } = await src('logic/contact.js');
const { DEFAULT_THICK, DEFAULT_HEAD } = await src('logic/obstacles.js');

/** The text of a source file with its comments cut out (block comments, and `//` to the end of a line outside a string). */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');

const out = [];
const MAX_PIT = 3.5; // a running jump clears about 4.3 tiles (G3b measured 4.33); the body is 0.8 wide: 4.3 - 0.8
const RUN_UP = 5;
const SAFE_GROUND = 8; // a tumble throws a runner 4 to 6 tiles
const MAX_FALL = 3.5; // Decision 54
// How far the bar's lowest point may reach into a standing runner's head, in tiles. At 0.05 it clips only a runner who times
// it badly; at 0.9 (the first version, pivot 2 tiles over the ground) it swept their whole height and a player who just ran
// at it was knocked back 6 times. Decision 74 says why this is measured to the bar's true lowest point.
const MIN_REACH = 0.05;
const MAX_REACH = 0.45;

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
if (course.finish.col % 10 === 0) fail(`the finish is at column ${course.finish.col}, which has a numbered ruler post: the ribbon would hide its number`);
out.push(`valid, finish at ${course.finish.col}, minTime ${course.minTime} s`);

// 2. the pits
const obstacles = course.obstacles ?? [];
const bar = obstacles.find((o) => o.type === 'spinning-bar');
const tiles = obstacles.find((o) => o.type === 'falling-tiles');
if (!bar) fail('course1.json has no spinning bar: the opening teaches the bar');
if (!tiles) fail('course1.json has no row of falling tiles: the opening teaches the tiles');
const gaps = groundGaps(course);
const pits = pitsToJump(course); // the gaps no row of falling tiles bridges end to end (the same list the test player jumps)
const bridged = gaps.filter((g) => !pits.some((p) => p.from === g.from));
if (pits.length < 2) fail(`course1.json has ${pits.length} pits to jump: the opening teaches the jump with at least 2`);
if (bridged.length < 1) fail('the row of falling tiles does not bridge a pit from end to end (its ends must reach the pit\'s ends)');
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
// A bar that hangs straight down is a box turned on its end, and its lowest POINT is a corner a hair off the vertical:
// the pivot plus the hypotenuse of half its length and half its thickness (not half the length plus half the thickness).
const lowest = bar.row + Math.hypot(bar.length / 2, (bar.thick ?? DEFAULT_THICK) / 2);
const reach = lowest - (top - TUNING.bodyH); // how far that goes into a standing runner's head
if (reach < MIN_REACH) fail(`the spinning bar's lowest point is only ${reach.toFixed(2)} tiles into a standing runner's head: it does not reach them (it needs ${MIN_REACH} to ${MAX_REACH})`);
if (reach > MAX_REACH) fail(`the spinning bar reaches ${reach.toFixed(2)} tiles into a standing runner's head: it sweeps their whole height and is a wall, not a lesson (it needs ${MIN_REACH} to ${MAX_REACH})`);
const near = gaps.filter((g) => g.to > bar.col - SAFE_GROUND && g.from < bar.col + SAFE_GROUND);
if (near.length > 0) fail(`a pit at ${near[0].from} is within ${SAFE_GROUND} tiles of the spinning bar: a tumble could throw the runner into it`);
const tileTop = tiles.row - (tiles.h ?? TILE_H) / 2;
const ledge = groundTop(tiles.col - tiles.count / 2 - 1);
if (Math.abs(tileTop - ledge) > 0.01) fail(`the falling tiles' top is at ${tileTop} but the ground they join is at ${ledge}: the runner would step up or down`);
out.push(`the bar's lowest point goes ${reach.toFixed(2)} tiles into a standing runner's head and it has solid ground 8 tiles each way, the tiles are flush with the ground`);

// 4. flags where nothing swings (Decision 55): a bar reaches half its length from the pivot, a hammer its arm plus half its head
for (const o of obstacles.filter((x) => x.type === 'spinning-bar' || x.type === 'swinging-hammer')) {
  const sweep = o.type === 'spinning-bar' ? o.length / 2 : o.length + (o.head ?? DEFAULT_HEAD) / 2;
  for (const f of flagCols) if (Math.abs(f - o.col) < sweep + 2) fail(`a flag at ${f - 0.5} is within reach of the ${o.type} at ${o.col}: a runner put back there could be hit as they appear (Decision 55)`);
}
out.push(`${flagCols.length} flags clear of everything that swings`);

// 5. wired into the scene, main.js and the build
const scene = code('src/game/scenes/RaceScene.js');
if (!/import\s+course1\s+from\s+'\.\.\/courses\/course1\.json'/.test(scene) || !/COURSES\s*=\s*\{[^}]*\bcourse1\b/.test(scene)) fail('RaceScene.js does not load course1.json into COURSES');
const main = code('src/main.js');
if (!/course1:\s*\{\s*course:\s*'course1',\s*flow:\s*true\s*\}/.test(main)) fail('main.js has no TEST_SCENES entry course1 with the race flow (?test=1&scene=course1)');
const built = walk('dist').filter((f) => f.endsWith('.js')).map((f) => read(f)).join('\n');
if (!/["'`]?id["'`]?\s*:\s*["'`]course1["'`]/.test(built)) fail('the built game does not contain course1 (run the build first)');
out.push('scene, main.js and the build have course1');

// 6. the e2e spec and the player, read without their comments
const spec = code('tests/e2e/course1.spec.js');
const player = code('tests/e2e/player.js');
for (const [name, text] of [['course1.spec.js', spec], ['player.js', player]]) {
  if (/\b(test|it|describe)\.(skip|only|fixme|todo|slow|fail)\b/.test(text)) fail(`${name} has a skip/only/fixme/slow/fail`);
  if (/__TR\.(teleport|clock|hit|autopilot)\(/.test(text)) fail(`${name} uses __TR.teleport, clock, hit or autopilot: the test player drives real keys`);
}
if ((spec.match(/^\s*test\(/gm) ?? []).length < 1) fail('course1.spec.js has no test');
if (!/scene:\s*'course1'/.test(spec)) fail('course1.spec.js does not open the course1 scene');
if (!/keyboard\.down\('ArrowRight'\)/.test(player) || !/keyboard\.press\('Space'\)/.test(player) || !/keyboard\.press\('Shift'\)/.test(player)) fail('player.js does not hold ArrowRight and tap Space and Shift with real keys');
if (!/race\.phase === 'finished'\)\s*break/.test(player)) fail('player.js does not play until the finish');
const guards = { maxFalls: /race\.falls > maxFalls/, maxRaceTime: /race\.t > maxRaceTime/, stallSeconds: /race\.t - bestAt > stallSeconds/, timeoutMs: /Date\.now\(\) - started > timeoutMs/ };
for (const [name, re] of Object.entries(guards)) if (!re.test(player)) fail(`player.js has no ${name} guard: a stuck runner must fail fast with a message that says where`);
const testTimeout = Number(spec.match(/test\.setTimeout\((\d+)\)/)?.[1]);
const playerWall = Number(player.match(/timeoutMs\s*=\s*(\d+)/)?.[1]);
if (!(testTimeout > 0 && testTimeout <= 90000)) fail(`course1.spec.js sets a test timeout of ${testTimeout} ms: it needs one, at most 90000 (the race takes about 25 s)`);
if (!(playerWall > 0 && playerWall < testTimeout)) fail(`the player's wall-clock limit (${playerWall} ms) is not under the test timeout (${testTimeout} ms): its own message could never show`);
if (!/formatRaceTime\(finishTime\)/.test(spec) || !/'checkpoint'\)\.map\(\(e\) => e\.data\.index\)\)\.toEqual\(course\.checkpoints\.map/.test(spec)) fail('course1.spec.js does not check the time on the results or that every flag was passed in order');
if (!/toBeGreaterThanOrEqual\(course\.minTime\)/.test(spec)) fail('course1.spec.js does not check the finish time against minTime');
if (!/done\.race\.falls[^;]*\)\.toBeLessThanOrEqual\(\d+\)/.test(spec)) fail('course1.spec.js does not bound the falls of the test player');
if (!/await settle\(page\);\s*await shot\(page, 'countdown'/.test(spec)) fail('course1.spec.js takes its first shot without waiting for the new scene to be drawn');
for (const name of ['over-the-first-pit', 'approaching-the-bar', 'on-the-tiles']) if (!spec.includes(`maybeShot('${name}'`)) fail(`course1.spec.js takes no "${name}" shot`);
for (const name of ['finish', 'results']) if (!spec.includes(`shot(page, '${name}'`)) fail(`course1.spec.js takes no "${name}" shot`);
out.push('e2e: a test player with real keys from the countdown to the results, flags in order, no shortcuts, no skips, its own limits under the test timeout');

pass(out.join('; '));
