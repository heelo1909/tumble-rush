// G3b: the finish line, the results, the title's way in, play again and back to the title (HANDOFF 5.4, 7).
// Proves, on the pure rules and the code that wires them, that
//  - a race ends when the runner reaches the line: one finish event carrying the race time, the clock stops there, the
//    controls are gone, nothing later changes it, and a runner who fell before the line does not finish,
//  - every course that has a finish has a minTime nobody can beat (not above what a runner at dive speed needs), the
//    course the title's Play runs is a real one, and the course rules refuse a finish with no ground after it,
//  - the scene turns the finish into a `race-over` game event after TUNING.resultsDelay and lets go of the keyboard when it
//    stops (PROGRESS Decision 32c), main.js wires the title's Play, play again and back to the title, and the DOM screens
//    carry their test ids and the built game has them,
//  - the e2e spec is the real thing: real keys from the title to the results, play again, back to the title, no skips.
// That the real game finishes, stops the runner and the clock, shows the results on the picture and lets the title have
// its keys back is proved in real browsers by tests/e2e/race.solo.spec.js.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, fail, pass, read, walk } from './_util.mjs';

const src = (rel) => import(pathToFileURL(join(ROOT, 'src', rel)).href);
const { TUNING, STEP } = await src('logic/tuning.js');
const { newRace, stepRace, controlsLive } = await src('logic/race.js');
const { formatRaceTime } = await src('logic/clock.js');
const { validateCourse } = await src('logic/course.js');

const out = [];

// 1. a whole race on the pure rules, to the line
if (!(TUNING.resultsDelay >= 1 && TUNING.resultsDelay <= 2.5)) fail(`resultsDelay is ${TUNING.resultsDelay} s: the results come after a beat of 1 to 2.5 s`);
const dir = join(ROOT, 'src/game/courses');
const courses = readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ file: f, c: JSON.parse(readFileSync(join(dir, f), 'utf8')) }));
const course = courses.find((x) => x.c.id === 'test-race')?.c;
if (!course) fail('src/game/courses/test-race.json is missing');
if (!course.finish || typeof course.minTime !== 'number') fail('test-race.json needs a finish and a minTime: the title\'s Play runs a course with a line');
let race = newRace();
const at = (x, y = 9.4) => ({ x, y });
for (let i = 0; i < 70 * 3 && race.phase === 'countdown'; i++) race = stepRace(race, at(2.5), course).state;
if (race.phase !== 'racing') fail('the race did not start');
const before = stepRace(race, at(course.finish.col - 0.01), course);
if (before.events.some((e) => e.type === 'finish') || before.state.phase !== 'racing') fail('a runner just short of the line has finished');
const crossed = stepRace(before.state, at(course.finish.col), course);
const finishes = crossed.events.filter((e) => e.type === 'finish');
if (finishes.length !== 1 || crossed.state.phase !== 'finished') fail(`reaching the line gave ${finishes.length} finish events and phase ${crossed.state.phase}: one finish, then finished`);
if (finishes[0].time !== crossed.state.t) fail('the finish event does not carry the race time at the line');
if (controlsLive(crossed.state)) fail('a runner who has finished may still steer');
let later = crossed.state;
for (let i = 0; i < 300; i++) {
  const r = stepRace(later, i % 2 ? at(5, course.rows + 2) : at(course.finish.col + 3), course);
  if (r.events.length) fail(`something happened after the finish: ${JSON.stringify(r.events)}`);
  later = r.state;
}
if (later.t !== crossed.state.t) fail(`the clock ran on after the finish: ${crossed.state.t} became ${later.t}`);
let fell = stepRace(race, at(course.finish.col + 1, course.rows + 1), course);
if (fell.events.some((e) => e.type === 'finish') || fell.state.phase !== 'racing') fail('a runner below the course, beyond the line, finished');
out.push('a runner finishes at the line: one event with the time, the clock and the controls stop, a fall does not finish');

// 2. the courses: a finish and a minTime nobody can beat, and ground to the wall
for (const { file, c } of courses) {
  const problems = validateCourse(c);
  if (problems.length) fail(`${file} is not a valid course: ${problems[0]}`);
  const freeRun = ['test-flat', 'test-gallery'].includes(c.id); // the free-run test courses have no race
  if (!freeRun && (!c.finish || typeof c.minTime !== 'number')) fail(`${file} is a race course: it needs a finish and a minTime`);
  if (c.finish) {
    // the fastest anyone could cover the distance at dive speed (the speed a dive-spammer averages is lower still)
    const fastest = (c.finish.col - (c.spawn.col + 0.5)) / TUNING.diveSpeed;
    if (c.minTime > fastest) fail(`${file}: minTime ${c.minTime} s is above ${fastest.toFixed(2)} s, what a runner at dive speed needs: a real run could be rejected as too fast`);
  }
}
const base = { id: 'x', tile: 48, cols: 40, rows: 12, spawn: { col: 3, row: 8 }, ground: [{ col: 0, row: 9, w: 36, h: 3 }], finish: { col: 30 }, minTime: 3 };
if (!validateCourse(base).some((e) => /ground must run from the finish/.test(e))) fail('validateCourse lets a finish with a pit between it and the wall through');
if (!validateCourse({ ...base, ground: [{ col: 0, row: 9, w: 40, h: 3 }], minTime: undefined }).some((e) => /minTime/.test(e))) fail('validateCourse lets a finish with no minTime through');
out.push(`${courses.length} courses valid, every finish has a minTime under what dive speed needs, ground runs to the wall`);

// 3. the scene, main.js and the screens (comments removed first)
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const scene = code('src/game/scenes/RaceScene.js');
if (!/e\.type === 'finish'\)\s*\{[\s\S]{0,400}?overAt\s*=[^;]*TUNING\.resultsDelay/.test(scene)) fail('RaceScene must schedule the results TUNING.resultsDelay after the finish event');
if (!/this\.game\.events\.emit\('race-over',\s*\{[^}]*time:\s*this\.race\.t[^}]*falls:\s*this\.race\.falls/.test(scene)) fail('RaceScene must tell the game the race is over (race-over) with the race time and the falls');
if (!/SHUTDOWN,\s*\(\)\s*=>\s*\{[^}]*this\.control\.destroy\(\)/.test(scene)) fail('RaceScene must let go of the keyboard (control.destroy) when it shuts down: the title would never get W, A, D, Space or the arrows back');
if (!/SHUTDOWN,\s*\(\)\s*=>\s*\{[^}]*this\.hudView\?\.clear\(\)/.test(scene)) fail('RaceScene must clear the HUD (hudView.clear) when it shuts down: the old timer would stay on the title');
if (!/makeFinishLine\(/.test(scene) || !/'FINISH'/.test(scene)) fail('RaceScene must draw a finish line');
if (/from\s+['"][^'"]*\/ui\//.test(scene)) fail('RaceScene must not import from src/ui (layer rule): it says what happened with game events');
const control = code('src/game/runner/LocalControl.js');
if (!/destroy\(\)\s*\{[^}]*removeCapture\(/.test(control)) fail('LocalControl.destroy must remove the browser-level key captures: Phaser\'s own shutdown leaves them');
if (!/this\.game\.events\.emit\('title-shown'\)/.test(code('src/game/BootScene.js'))) fail('the title scene must say it is showing (title-shown) so main.js can show the Play button');
const main = code('src/main.js');
if (!/createTitle\(/.test(main) || !/createResults\(/.test(main)) fail('main.js must create the title and the results screens');
if (!/events\.on\('title-shown'/.test(main) || !/events\.on\('race-over'/.test(main)) fail('main.js must show the title on title-shown and the results on race-over');
if (!/preBoot:\s*\(g\)\s*=>\s*\{[\s\S]*?g\.events\.on\('title-shown'[\s\S]*?g\.events\.on\('race-over'/.test(main)) fail('main.js must listen for title-shown and race-over in preBoot, before any scene exists: a missed title-shown means no Play button at all');
if (!/scene\.stop\('boot'\)/.test(main)) fail('main.js must stop the title scene when a race starts, or it keeps running (with its own physics world) under every race');
if (!/fallsLabel\(falls\)/.test(main)) fail('main.js must give the results the falls line from logic/clock.js fallsLabel');
if (!/s\.sys\.isActive\(\)/.test(code('src/game/testApi.js'))) fail('testApi.js race() must only report a race scene that is running: a stopped one (back at the title) is stale data');
if (!/onPlay:\s*playSolo/.test(main) || !/onAgain:\s*startRace/.test(main) || !/onTitle:\s*showTitle/.test(main)) fail('main.js must wire Play, play again and back to the title');
if (!/scene\.start\('race'\)/.test(main) || !/scene\.stop\('race'\)/.test(main) || !/scene\.start\('boot'\)/.test(main)) fail('main.js must start the race scene, stop it, and start the title scene again');
const solo = /const SOLO_COURSE = '([^']+)'/.exec(main)?.[1];
const soloCourse = courses.find((x) => x.c.id === solo)?.c;
if (!soloCourse?.finish) fail(`the course the title's Play runs (${solo}) does not exist or has no finish line`);
const title = code('src/ui/title.js');
const results = code('src/ui/results.js');
for (const id of ['play-solo', 'title']) if (!title.includes(`'${id}'`)) fail(`src/ui/title.js has no data-testid "${id}"`);
for (const id of ['results', 'results-headline', 'results-time', 'results-falls', 'rematch', 'to-title']) if (!results.includes(`'${id}'`)) fail(`src/ui/results.js has no data-testid "${id}"`);
for (const [name, text] of [['title.js', title], ['results.js', results]]) {
  if (/<input|type\s*=\s*['"]text/.test(text) || /createElement\('(input|textarea)'\)/.test(text)) fail(`src/ui/${name} has a text input: the only one allowed is the room code (HANDOFF 1)`);
  if (/\bfrom\s+['"](?!\.\/screens\.css)/.test(text)) fail(`src/ui/${name} imports something other than its stylesheet`);
}
const dist = walk('dist/assets').filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
const css = walk('dist/assets').filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
if (!dist) fail('dist/assets has no script: smoke builds before it runs the checks');
for (const id of ['play-solo', 'results-headline', 'results-time', 'results-falls', 'rematch', 'to-title']) {
  if (!dist.includes(id)) fail(`the built game has no "${id}"`);
}
for (const cls of ['tr-title', 'tr-results', 'tr-btn']) {
  if (!dist.includes(cls) || !css.includes(`.${cls}`)) fail(`the built game has no class ${cls} (script and stylesheet)`);
}
out.push('the scene reports the finish and lets go of the keys, main.js wires Play / again / title, the screens have their test ids in the build');

// 4. the e2e spec is the real thing
const spec = code('tests/e2e/race.solo.spec.js');
if (/\b(test|it|describe)\.(skip|only|fixme|todo)\b/.test(spec)) fail('race.solo.spec.js has a skip/only/fixme');
const tests = (spec.match(/^\s*test\(/gm) ?? []).length;
if (tests < 7) fail(`race.solo.spec.js has only ${tests} tests (needs at least 7: the 4 of G3a, the whole race from the title, play again and the title, the title's layout)`);
if (/__TR\.(teleport|clock|hit)\(/.test(spec)) fail('race.solo.spec.js must not use __TR.teleport, clock or hit: a race test drives real keys');
for (const id of ['play-solo', 'rematch', 'to-title', 'results-time', 'results-falls']) if (!spec.includes(`getByTestId('${id}')`)) fail(`race.solo.spec.js never uses the test id "${id}"`);
if (!/\.getByTestId\('play-solo'\)\.click\(\)/.test(spec) || !/getByTestId\('rematch'\)\.click\(\)/.test(spec) || !/getByTestId\('to-title'\)\.click\(\)/.test(spec)) fail('race.solo.spec.js must click Play, play again and Title');
if (!/phase === 'finished'/.test(spec) || !/formatRaceTime\(finishTime\)/.test(spec)) fail('race.solo.spec.js does not wait for the finish and check the time on the results against the clock that stopped');
if (!/resultsDelay/.test(spec)) fail('race.solo.spec.js does not check the beat before the results (TUNING.resultsDelay)');
if (!/no jump after the line/.test(spec) || !/no dive after the line/.test(spec)) fail('race.solo.spec.js does not check that the keys do nothing after the line');
if (!/defaultPrevented/.test(spec) || !/the title takes no key away from the browser/.test(spec) || !/the race has the arrow keys again/.test(spec)) fail('race.solo.spec.js does not check that the title gets its keys back and that a new race takes them again');
if ((spec.match(/await drawn\(page\)/g) ?? []).length < 3 || !/await settle\(page\)/.test(spec)) fail('race.solo.spec.js takes a shot of a new race or of the title without waiting for it to be DRAWN (drawn / settle): in WebKit the old canvas stays up for a frame or two');
if (!/toHaveText\('1 fall'\)/.test(spec) || !/'fall'\)\)\.toHaveLength\(1\)/.test(spec)) fail('race.solo.spec.js never runs a race with a real fall and checks "1 fall" on the results');
if (!/rematch'\)\)\.not\.toBeFocused\(\)/.test(spec) || !/to-title'\)\)\.not\.toBeFocused\(\)/.test(spec)) fail('race.solo.spec.js does not check that neither results button has the focus (a kid mashing Space at the line must not press Play again)');
if (!/the title is not a race any more/.test(spec) || !/getByTestId\('timer'\)\)\.toBeHidden\(\)/.test(spec)) fail('race.solo.spec.js does not check that nothing of the race (timer, test API state) is left on the title');
if (/addInitScript\([\s\S]{0,200}?defaultPrevented/.test(spec)) fail('race.solo.spec.js reads defaultPrevented in an init script: that listener runs before Phaser\'s and can never see a captured key');
// both screens, each in a 1280x800 and a 1440x900 window (src/ui/CLAUDE.md): looked up in the test that owns it
const titleTest = spec.slice(spec.indexOf("test('the title: Play sits"));
const resultsTest = spec.slice(spec.indexOf("test('from the title: Play"), spec.indexOf("test('play again starts"));
if (!/\[\[1280, 800\], \[1440, 900\]\]/.test(titleTest)) fail('race.solo.spec.js does not look at the title in a 1280x800 and a 1440x900 window (src/ui/CLAUDE.md)');
if (!/\[\[1280, 800\], \[1440, 900\], \[1280, 1000\]\]/.test(resultsTest)) fail('race.solo.spec.js does not look at the results in a 1280x800 and a 1440x900 window (src/ui/CLAUDE.md)');
if (!/keyboard\.down\(/.test(spec) || !/keyboard\.press\('Space'\)/.test(spec)) fail('race.solo.spec.js presses no real keys');
out.push('e2e: real keys from the title to the results, play again, back to the title, the keys, 1280x800 and 1440x900, no shortcuts, no skips');

if (!Number.isFinite(STEP) || formatRaceTime(65.43) !== '1:05.4') fail('the results time text is wrong: 65.43 s must read 1:05.4');
pass(out.join('; '));
