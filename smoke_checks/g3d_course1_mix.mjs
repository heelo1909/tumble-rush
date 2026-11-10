// G3d: the rest of course 1, the mix (HANDOFF 5.3, 10 G3d).
// Proves, on src/game/courses/course1.json, that the whole course is what HANDOFF 5.3 asks for and that it is fair to fall:
//  - it is 60 to 90 s long for a decent player: the run from the spawn to the line at about 7 tiles a second (a run is 6.5;
//    jumps and dives cost nothing) plus 10 s at the harsh bar (Decision 75), and its `minTime` is still one nobody can beat
//    (no belt or pad: PROGRESS Decision 68 waits for the first course that has one),
//  - it is a MIX: at least 8 pits to jump and 4 rows of falling tiles in different lengths, and the two kinds follow each
//    other (the pits and tile rows alternate, they are not two blocks of one kind), every row bridges its pit from end to
//    end and is flush with the ground on both sides,
//  - a fall is cheap: a flag at least every 45 columns, so a runner put back never has more than about 7 s to run again;
//    the pit rules of G3c (3 wide, 5 tiles of run-up after a flag, a fall under 3.5 tiles) hold for the whole course
//    (g3c_course1_opening.mjs reads every pit, not just the first),
//  - the bar of the opening is the only thing that swings: a second bar or a hammer is a taste call that needs the bots to
//    read poses (the test player gets past the harsh bar by how its phase lines up: PROGRESS Decision 75), so adding one
//    means changing this check with a logged reason.
// That the test player really finishes the whole course in both browsers is proved by tests/e2e/course1.spec.js.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, fail, pass, read } from './_util.mjs';

const src = (rel) => import(pathToFileURL(join(ROOT, 'src', rel)).href);
const { TUNING } = await src('logic/tuning.js');
const { validateCourse, groundGaps, pitsToJump } = await src('logic/course.js');
const { TILE_H } = await src('logic/contact.js');

const DECENT_SPEED = TUNING.runSpeed; // tiles a second over open ground: a run (HANDOFF 5.1); jumps and dives cost nothing
// Seconds lost at the harsh bar. MEASURED on the test player, a fair stand-in for a decent player who does not dodge: the
// opening (98.5 tiles) took it 34.42 s where a run of that length is 15.2 s, so the bar costs about 19 s (Decision 75). With
// these two numbers the model gives 81 s for the whole course, which is what the test player measured (Decision 77).
const BAR_COST = 19;
const MIN_TIME = 60;
const MAX_TIME = 90;
const MAX_FLAG_GAP = 40; // columns (the course's real worst is 37)
const MAX_SAME_KIND = 4; // pits or tile rows in a row
// A tile that was touched is back this long after (drop delay + respawn). A runner who misses a pit after the row is put
// back at the last flag and runs to the row again: that must take longer, or the retry meets a row that is still down
// (an 8-wide hole) and one miss costs two falls. The 0.5 is the fall (0.4) and the acceleration (0.1).
const TILES_BACK = TUNING.tileDropDelay + TUNING.tileRespawn + 0.2;
const out = [];
/** The text of a source file with its comments cut out, so a comment cannot satisfy a rule (as in g3c_course1_opening.mjs). */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');

let course;
try {
  course = JSON.parse(read('src/game/courses/course1.json'));
} catch (e) {
  fail(`src/game/courses/course1.json is missing or is not JSON (${e.message})`);
}
const errors = validateCourse(course);
if (errors.length > 0) fail(`course1.json is not a valid course: ${errors[0]}`);
if (!course.finish || typeof course.minTime !== 'number') fail('course1.json needs a finish and a minTime');

// 1. how long it is
const run = course.finish.col - (course.spawn.col + 0.5);
const estimate = run / DECENT_SPEED + BAR_COST;
if (estimate < MIN_TIME || estimate > MAX_TIME) fail(`a decent player needs about ${estimate.toFixed(0)} s for ${run.toFixed(0)} tiles plus the bar: course 1 is 60 to 90 s (HANDOFF 5.3), so the line must be ${Math.ceil((MIN_TIME - BAR_COST) * DECENT_SPEED + course.spawn.col + 0.5)} to ${Math.floor((MAX_TIME - BAR_COST) * DECENT_SPEED + course.spawn.col + 0.5)} columns from the start`);
if (course.minTime > run / TUNING.diveSpeed) fail(`minTime ${course.minTime} s is more than the ${(run / TUNING.diveSpeed).toFixed(1)} s a runner at dive speed needs: a real run could be rejected as too fast`);
if (course.minTime < 0.8 * (run / TUNING.diveSpeed) - 1) fail(`minTime ${course.minTime} s is far under the ${(run / TUNING.diveSpeed).toFixed(1)} s dive speed allows: the sanity check on results would let impossible times through`);
const obstacles = course.obstacles ?? [];
if (obstacles.some((o) => o.type === 'bounce-pad' || o.type === 'conveyor')) fail('course1 has a pad or a belt: its minTime must allow for them (PROGRESS Decision 68) and this check says how, so change it with a logged reason');
// course 1 teaches two obstacles (Decision 76): the bar and the falling tiles. Anything else (a seesaw, a platform that carries
// a runner, a pusher wall...) is for courses 2 and 3, and would break the reasoning behind minTime.
const other = obstacles.find((o) => o.type !== 'spinning-bar' && o.type !== 'falling-tiles');
if (other) fail(`course1 has a ${other.type}: it teaches two obstacles, the bar and the falling tiles (PROGRESS Decision 76); the others belong to courses 2 and 3`);
out.push(`${run.toFixed(0)} tiles, a decent player about ${estimate.toFixed(0)} s, minTime ${course.minTime} s`);

// 2. a mix of pits and tile rows
const gaps = groundGaps(course);
const pits = pitsToJump(course);
const rows = obstacles.filter((o) => o.type === 'falling-tiles');
if (pits.length < 8) fail(`course1 has ${pits.length} pits to jump: the mix has at least 8`);
if (rows.length < 4) fail(`course1 has ${rows.length} rows of falling tiles: the mix has at least 4`);
if (new Set(rows.map((r) => r.count)).size < 3) fail('the rows of falling tiles are all about the same length: the mix has at least 3 different lengths');
const groundTop = (col) => Math.min(...course.ground.filter((g) => col >= g.col && col < g.col + g.w).map((g) => g.row));
for (const r of rows) {
  const from = r.col - r.count / 2;
  const to = r.col + r.count / 2;
  const gap = gaps.find((g) => g.from === from && g.to === to);
  if (!gap) fail(`the row of ${r.count} falling tiles at ${from} does not bridge a pit exactly (its ends must be the pit's ends)`);
  const top = r.row - (r.h ?? TILE_H) / 2;
  if (Math.abs(top - groundTop(from - 1)) > 0.01 || Math.abs(top - groundTop(to)) > 0.01) fail(`the row of falling tiles at ${from} is not flush with the ground on both sides: the runner would step up or down`);
}
// the two kinds follow each other: read the pits and the rows left to right, and count the changes from one kind to the other
const kinds = gaps.map((g) => (pits.some((p) => p.from === g.from) ? 'pit' : 'tiles'));
const changes = kinds.filter((k, i) => i > 0 && k !== kinds[i - 1]).length;
if (changes < 6) fail(`the pits and the tile rows change over only ${changes} times along the course: they must follow each other (at least 6 times), not come in two blocks`);
let run1 = 1;
for (let i = 1; i < kinds.length; i++) {
  run1 = kinds[i] === kinds[i - 1] ? run1 + 1 : 1;
  if (run1 > MAX_SAME_KIND) fail(`${run1} ${kinds[i] === 'pit' ? 'pits' : 'tile rows'} in a row at ${gaps[i].from}: the mix alternates, at most ${MAX_SAME_KIND} of one kind in a row`);
}
out.push(`${pits.length} pits and ${rows.length} tile rows of ${[...new Set(rows.map((r) => r.count))].sort((a, b) => a - b).join(', ')}, changing kind ${changes} times, each row bridging its pit exactly and flush`);

// 3. a fall is cheap
const marks = [course.spawn.col, ...(course.checkpoints ?? []).map((c) => c.col), course.finish.col];
for (let i = 1; i < marks.length; i++) {
  if (marks[i] - marks[i - 1] > MAX_FLAG_GAP) fail(`there are ${marks[i] - marks[i - 1]} columns between the flag at ${marks[i - 1]} and the next one at ${marks[i]}: a runner who falls has too far to run again (at most ${MAX_FLAG_GAP})`);
}
// a flag stands on ground: one over a pit or a tile row would put a runner back into a fall, again and again
for (const c of course.checkpoints ?? []) {
  if (!course.ground.some((g) => c.col >= g.col && c.col < g.col + g.w)) fail(`the flag at column ${c.col} is not on ground (over a pit or a row of tiles): a runner put back there falls again`);
}
// the retry after a miss meets a row that is back (see TILES_BACK): for each row, the first pit after it before the next flag
const spots = [course.spawn.col + 0.5, ...(course.checkpoints ?? []).map((c) => c.col + 0.5)];
for (const r of rows) {
  const from = r.col - r.count / 2;
  const flag = Math.max(...spots.filter((c) => c <= from));
  const nextFlag = Math.min(...spots.filter((c) => c > from), course.finish.col);
  const pit = pits.find((p) => p.from >= from + r.count && p.from < nextFlag);
  if (!pit) continue;
  const back = (pit.from - flag) / TUNING.runSpeed + TUNING.respawnDelay + 0.5;
  if (back < TILES_BACK) fail(`a runner who misses the pit at ${pit.from} is back at the row of tiles at ${from} after ${back.toFixed(1)} s, but a touched tile is back only after ${TILES_BACK.toFixed(1)} s: move the flag at ${flag - 0.5} further from the row (at least ${((TILES_BACK - TUNING.respawnDelay - 0.5) * TUNING.runSpeed).toFixed(0)} columns before that pit)`);
}
out.push(`a flag at least every ${MAX_FLAG_GAP} columns (${(course.checkpoints ?? []).length} flags, all on ground), the retry after a miss meets a row that is back`);

// 4. the harsh bar of the opening is the only thing that swings
const swingers = obstacles.filter((o) => o.type === 'spinning-bar' || o.type === 'swinging-hammer');
if (swingers.length !== 1) fail(`course1 has ${swingers.length} bars or hammers: the opening's harsh bar is the only one until the bots can read poses (PROGRESS Decision 75)`);
out.push('the bar of the opening is the only thing that swings');

// 5. the e2e plays the whole course
const spec = code('tests/e2e/course1.spec.js'); // without its comments
if (!spec.includes("maybeShot('halfway'")) fail('course1.spec.js takes no "halfway" shot: the whole course is played, so the middle needs a picture');
if (!/\[\.\.\.taken\]\.sort\(\)/.test(spec)) fail('course1.spec.js does not check that every in-race shot fired: a shot whose condition never holds would just go missing');
if (!/for \(const r of tileRows\)/.test(spec) || !/phase === 'fallen'/.test(spec)) fail('course1.spec.js does not check that a tile dropped in EVERY row of the course');
if (!spec.includes("'longest-stall-seconds'") || !spec.includes("'events-logged'")) fail('course1.spec.js does not print the margins it rests on (the longest stall, the events logged)');

pass(out.join('; '));
