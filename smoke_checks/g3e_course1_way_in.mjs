// G3e: course 1, the way in (HANDOFF 10 G3e).
// Proves the title's Play button starts course 1, and that the tests that go through it keep the e2e inside its time budget:
//  - main.js: SOLO_COURSE is course1 (a course RaceScene knows, with a finish and flags, and the one the G3b and G3c checks
//    read); the only other course Play can run is a short TEST course, chosen by `?test=1&course=...` and by nothing else:
//    the switch is evaluated here with real URLs (a page without test=1, a bogus course, no course, course1 itself),
//  - tests/e2e/course1.spec.js starts from the title (no `scene` in the URL, a click on Play, the title hidden), plays
//    through the test player, and checks that Play again is course 1 again,
//  - tests/e2e/race.solo.spec.js (the G3b title tests) asks for the short course with `course: 'test-race'` for the test that
//    plays a whole race, and checks that Play and Enter, with no switch, run course 1 (its flags, not the short course's),
//  - the WHOLE of course 1 is played once per browser, by the test player in course1.spec.js and nowhere else: one play is
//    74 s (chromium) and 87 s (webkit) of the e2e, which is about 606 s of the 900 s limit of the protected smoke script
//    (measured: PROGRESS Decision 80), so one more play leaves about 130 s that C1 will use, and two more go over; any other
//    spec that plays it has to change this check with a logged reason, after the user has raised the limit.
// That the whole course is really played from the title, in both browsers, is proved by tests/e2e/course1.spec.js.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fail, pass, read } from './_util.mjs';

const out = [];
/** The text of a source file with its comments cut out, so a comment cannot satisfy a rule (as in g3d_course1_mix.mjs). */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');

// 1. main.js: what Play runs
const main = code('src/main.js');
const solo = /const SOLO_COURSE = '([^']+)'/.exec(main)?.[1];
if (solo !== 'course1') fail(`the title's Play runs "${solo}", not course1: SOLO_COURSE in src/main.js is the one constant (HANDOFF 10 G3e)`);
let course;
try {
  course = JSON.parse(read('src/game/courses/course1.json'));
} catch (e) {
  fail(`src/game/courses/course1.json is missing or is not JSON (${e.message})`);
}
if (course.id !== 'course1' || !course.finish || (course.checkpoints ?? []).length < 2) fail('course1.json needs the id course1, a finish and flags (a race the title runs must be finishable)');
if (!/import course1 from '\.\.\/courses\/course1\.json'/.test(code('src/game/scenes/RaceScene.js')) || !/const COURSES = \{[^}]*\bcourse1\b/.test(code('src/game/scenes/RaceScene.js'))) fail('RaceScene does not know course1, so the title could not start it');
if (!/game\.registry\.set\('course', soloCourse\)/.test(main)) fail("main.js's playSolo does not hand the race the course the switch chose (soloCourse)");
if (/game\.registry\.set\('course', SOLO_COURSE\)/.test(main)) fail("main.js's playSolo runs SOLO_COURSE whatever the page asks: the test-mode switch is not wired");

// 2. the switch, evaluated: only test mode can change the course, and only to a short test course
const list = /const TEST_SOLO_COURSES = \[([^\]]*)\]/.exec(main)?.[1];
const expr = /const soloCourse = ([^;]+);/.exec(main)?.[1];
if (list === undefined || !expr) fail('main.js has no TEST_SOLO_COURSES list and soloCourse expression (the test-mode switch for the title\'s Play)');
const testCourses = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
if (testCourses.length === 0 || testCourses.includes('course1')) fail(`TEST_SOLO_COURSES is ${JSON.stringify(testCourses)}: it lists the short test courses, and course1 is not one`);
for (const id of testCourses) {
  let c;
  try {
    c = JSON.parse(read(`src/game/courses/${id}.json`));
  } catch {
    fail(`TEST_SOLO_COURSES names "${id}", which is not a course in src/game/courses`);
  }
  if (!c.finish || c.cols > 120) fail(`the test course "${id}" must have a finish and be short (at most 120 columns): it is there so a title test plays a race in seconds`);
}
const choose = (query) => {
  try {
    return new Function('params', 'SOLO_COURSE', 'TEST_SOLO_COURSES', `return ${expr};`)(new URLSearchParams(query), solo, testCourses);
  } catch (e) {
    return fail(`the soloCourse expression in main.js uses something this check cannot see (${e.message}): it may use only params, SOLO_COURSE and TEST_SOLO_COURSES, or this check has to learn the new helper`);
  }
};
const cases = [
  ['test=1&course=test-race', 'test-race', 'test mode can ask for the short course'],
  ['course=test-race', 'course1', 'without test=1 the page ignores `course`'],
  ['test=0&course=test-race', 'course1', 'test mode is test=1 exactly, as in installTestApi: test=0 is not test mode'],
  ['test=true&course=test-race', 'course1', 'test mode is test=1 exactly, as in installTestApi: test=true is not test mode'],
  ['test=1&course=bogus', 'course1', 'an unknown course falls back to course 1'],
  ['test=1', 'course1', 'test mode with no course runs course 1'],
  ['', 'course1', 'a plain page runs course 1'],
  ['test=1&scene=race&course=test-gallery', 'course1', 'a course that is not in the list (the gallery) cannot be started from the title'],
];
for (const [query, want, why] of cases) {
  const got = choose(query);
  if (got !== want) fail(`?${query}: the title's Play runs "${got}", expected "${want}": ${why}`);
}
out.push(`Play runs course1 (${course.checkpoints.length} flags); only ?test=1&course=${testCourses.join('|')} can change it, and nothing else`);

// 3. the specs
const c1 = code('tests/e2e/course1.spec.js');
if (/scene:\s*'course1'|scene=course1/.test(c1)) fail("course1.spec.js opens ?scene=course1, which skips the title: G3e's way in is the title's Play button");
if (!/gamePage\(page\)/.test(c1) || !/getByTestId\('play-solo'\)/.test(c1) || !/\bplay\.click\(\)/.test(c1) || !/getByTestId\('title'\)\)\.toBeHidden\(\)/.test(c1)) fail('course1.spec.js does not open the title, click Play and see the title go away');
if (!/\.scene,[^)]*\)\.toBe\('hello'\)/.test(c1)) fail('course1.spec.js does not check that the page opens on the title (scene hello)');
if (!/playRace\(/.test(c1)) fail('course1.spec.js does not play the race with the test player (real keys: g3c_course1_opening.mjs holds the player to them)');
if (!/start\.race\.checkpoints[^;]*toBe\(course\.checkpoints\.length\)/.test(c1)) fail("course1.spec.js does not check that the race Play started has every flag of course1.json (start.race.checkpoints): that is what tells course 1 from the short course");
if (!/getByTestId\('rematch'\)\.click\(\)/.test(c1) || !/again\.race\.checkpoints[^;]*toBe\(course\.checkpoints\.length\)/.test(c1)) fail('course1.spec.js does not click Play again and check that it is course 1 again (every flag in the new race)');
for (const name of ['title', 'countdown', 'finish', 'results', 'again-countdown']) if (!new RegExp(`shot\\(page, '${name}', testInfo\\)`).test(c1)) fail(`course1.spec.js takes no shot called "${name}"`);

const solos = code('tests/e2e/race.solo.spec.js');
if (!/gamePage\(page, \{ course: 'test-race' \}\)/.test(solos)) fail("race.solo.spec.js's whole-race title test does not ask for the short course (gamePage(page, { course: 'test-race' })): on course 1 it would play 80 s more per browser");
if (/\.\/player\.js|\bplayRace\b/.test(solos)) fail('race.solo.spec.js uses the test player: only course1.spec.js plays the whole of course 1 (PROGRESS Decision 80)');
const proofs = solos.match(/race\.checkpoints[^;]*toBe\(course1\.checkpoints\.length\)/g) ?? [];
if (proofs.length < 2) fail(`race.solo.spec.js checks ${proofs.length} time(s) that the title's Play runs course 1 (its flags); it needs 2: the Play after a test scene's race, and Enter on a title with no switch`);
if (!/export async function gamePage\(page, \{[^}]*\bcourse\b[^}]*\} = \{\}\)/.test(code('tests/e2e/fixtures.js')) || !/&course=\$\{course\}/.test(code('tests/e2e/fixtures.js'))) fail("tests/e2e/fixtures.js gamePage has no `course` option for the title's test-mode switch");
out.push('course1.spec.js: title, Play, the whole course by the test player, Play again; race.solo.spec.js: short course by the switch, Play and Enter checked for course 1');

// 4. the time budget: one spec plays the whole of course 1
const specs = readdirSync(join(ROOT, 'tests/e2e')).filter((f) => f.endsWith('.spec.js'));
const players = specs.filter((f) => /\bplayRace\(/.test(code(`tests/e2e/${f}`)));
const importers = specs.filter((f) => /\.\/player\.js/.test(code(`tests/e2e/${f}`)));
if (players.length !== 1 || players[0] !== 'course1.spec.js' || importers.length !== 1 || importers[0] !== 'course1.spec.js') fail(`the whole of a course is played by the test player in ${JSON.stringify(players)} (imported by ${JSON.stringify(importers)}): exactly one spec, course1.spec.js, may (the e2e is about 606 s of the 900 s the protected smoke script allows, and one play is about 160 s of it: PROGRESS Decisions 79 and 80)`);
if ((code('tests/e2e/course1.spec.js').match(/\bplayRace\(/g) ?? []).length !== 1) fail('course1.spec.js plays the course more than once: a second play per browser is about 90 s more of the 900 s e2e limit');
out.push('one whole-course play per browser (course1.spec.js)');

pass(out.join('; '));
