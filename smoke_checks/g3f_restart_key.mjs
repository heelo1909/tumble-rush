// G3f: the solo restart key (HANDOFF 5.1, 10 G3f).
// Proves R starts a solo race over, and only when it should:
//  - src/logic/race.js `canRestart`: yes in the countdown, while racing and while waiting to be put back, no once finished
//    (the results have Play again, and a kid mashing keys at the line must not lose them: PROGRESS Decision 63),
//  - RaceScene: the key is handled only with the race flow on (not on a free-run test course, not on the title), ignores
//    a repeating key and Ctrl, Cmd or Alt (Ctrl+R is the browser's reload), asks `canRestart`, and says `restart-race`
//    in plain data on game.events; the listener is taken off when the scene stops, and the HUD hint says "R restart",
//  - main.js answers `restart-race` with the same startRace as Play again, listening from preBoot,
//  - R is NOT captured by LocalControl (a captured key is taken from the browser and, later, from the room-code box),
//  - tests/e2e/restart.spec.js is the real proof: real keys, a restart in the middle of a race (after a fall and a flag),
//    in the countdown, nothing with Ctrl/Cmd/Alt, once for a held key, nothing after the finish (in the beat before
//    the results and with them up), nothing on the title or a free-run course; no skip, no teleport/clock/hit,
//  - HANDOFF 5.1 and 10 say so.
// That the restart is a brand-new race in real Chromium and WebKit is proved by tests/e2e/restart.spec.js.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, fail, pass, read } from './_util.mjs';

const out = [];
/** The text of a source file with its comments cut out, so a comment cannot satisfy a rule (as in g3d_course1_mix.mjs). */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');

// 1. the rule
const { newRace, stepRace, canRestart } = await import(pathToFileURL(join(ROOT, 'src/logic/race.js')).href);
const { TUNING } = await import(pathToFileURL(join(ROOT, 'src/logic/tuning.js')).href);
if (typeof canRestart !== 'function') fail('src/logic/race.js has no canRestart');
const course = { cols: 60, rows: 12, spawn: { col: 2, row: 9 }, checkpoints: [], finish: { col: 40 } };
const run = (s, seconds, runner) => {
  let state = s;
  for (let i = 0; i < Math.round(seconds * 60); i++) state = stepRace(state, runner, course).state;
  return state;
};
const ON_GROUND = { x: 3.5, y: 9.45 };
const countdown = newRace();
const racing = run(countdown, TUNING.countdown + 0.1, ON_GROUND);
const waiting = run(racing, 1 / 60, { x: 20, y: 12.2 }); // below the course: a fall, waiting to be put back
const finished = run(racing, 1 / 60, { x: 40.2, y: 9.45 });
if (racing.phase !== 'racing' || waiting.out === null || finished.phase !== 'finished') fail('the check could not build a racing, a falling and a finished race to ask canRestart about');
for (const [name, s] of [['in the countdown', countdown], ['while racing', racing], ['while waiting to be put back', waiting]]) {
  if (canRestart(s) !== true) fail(`canRestart is false ${name}: R must start a race over then`);
}
if (canRestart(finished) !== false) fail('canRestart is true once the runner has finished: R would wipe the results (Decision 63)');
out.push('canRestart: yes in the countdown, racing and waiting to respawn, no once finished');

// 2. the scene
const scene = code('src/game/scenes/RaceScene.js');
if (!/import \{[^}]*\bcanRestart\b[^}]*\} from '\.\.\/\.\.\/logic\/race\.js'/.test(scene)) fail('RaceScene does not import canRestart from logic/race.js');
const handler = /onRestartKey\(e\)\s*\{([\s\S]*?)\n {2}\}/.exec(scene)?.[1];
if (!handler) fail('RaceScene has no onRestartKey(e) method');
const guards = ['e.repeat', 'e.ctrlKey', 'e.metaKey', 'e.altKey'];
for (const g of guards) if (!handler.includes(g)) fail(`RaceScene.onRestartKey ignores no ${g}: ${g === 'e.repeat' ? 'a held key would restart the race on every repeat' : 'Ctrl+R, Cmd+R or Alt+R is the browser\'s own shortcut'}`);
if (!/this\.flow/.test(handler) || !/canRestart\(this\.race\)/.test(handler)) fail('RaceScene.onRestartKey does not check the race flow and canRestart(this.race): R would restart a free-run course or a finished race');
const emitAt = handler.indexOf("emit('restart-race'");
if (emitAt < 0 || !/\.game\.events\.emit\('restart-race'/.test(handler)) fail("RaceScene.onRestartKey does not say 'restart-race' on game.events (game code never imports ui or restarts through main.js directly)");
if (Math.max(...guards.map((g) => handler.indexOf(g))) > emitAt || handler.indexOf('canRestart') > emitAt) fail('RaceScene.onRestartKey emits restart-race before its guards');
if (!/if \(this\.flow\) this\.input\.keyboard\.on\('keydown-R', this\.onRestartKey, this\)/.test(scene)) fail("RaceScene does not listen for 'keydown-R' only when the race flow is on");
if (!/SHUTDOWN,\s*\(\)\s*=>\s*\{[\s\S]*?off\('keydown-R', this\.onRestartKey, this\)/.test(scene)) fail("RaceScene's SHUTDOWN handler does not take the 'keydown-R' listener off when the scene stops");
const hint = /const HINT = '([^']*Shift dive)'/.exec(scene)?.[1];
if (!hint) fail('RaceScene has no HINT constant with the keys line (it must still say "Shift dive": g1_runner_feel.mjs)');
if (!/this\.hint\.setText\(this\.flow \? `\$\{HINT\} {3}R restart` : HINT\)/.test(scene)) fail('the HUD hint does not say "R restart" in a race (and only there)');
const finishBranch = /e\.type === 'finish'\) \{([\s\S]*?)\n {4}\} else|e\.type === 'finish'\) \{([\s\S]*?)\n {4}\}\n/.exec(scene);
if (!finishBranch || !/this\.hint\.setText\(HINT\)/.test(finishBranch[1] ?? finishBranch[2])) fail('the HUD hint still says "R restart" after the finish, where R does nothing (the product review of G3f)');
out.push('RaceScene: R only in a race, ignores repeats and Ctrl/Cmd/Alt, asks canRestart, says restart-race, lets go on shutdown, hint says R restart until the finish');

// 3. main.js, and R left to the browser
if (!/preBoot:\s*\(g\)\s*=>\s*\{[\s\S]*?g\.events\.on\('restart-race',\s*\(\)\s*=>\s*startRace\(\)\)/.test(code('src/main.js'))) fail("main.js does not answer 'restart-race' with startRace() from preBoot (the same start as Play again)");
if (/\bK\.R\b|\bR:\s*K\./.test(code('src/game/runner/LocalControl.js'))) fail('LocalControl captures R: a captured key is taken from the browser and from the room-code box; R is not a runner control');
out.push("main.js: restart-race → startRace, from preBoot; LocalControl leaves R alone");

// 4. the spec
const spec = code('tests/e2e/restart.spec.js');
if (/\b(test|it|describe)\.(skip|only|fixme|slow|fail|todo)\b/.test(spec)) fail('restart.spec.js has a skip/only/fixme/slow/fail');
if (/__TR\.(teleport|clock|hit|autopilot)\(/.test(spec) || /player\.js|playRace/.test(spec)) fail('restart.spec.js uses __TR.teleport, clock, hit or autopilot, or the test player: it drives real keys on the short course');
if ((spec.match(/^test\(/gm) ?? []).length < 5) fail('restart.spec.js has fewer than 5 tests (mid-race, countdown, Ctrl/Cmd/Alt and held, after the finish, title and free-run course)');
if (!/keyboard\.press\('KeyR'\)/.test(spec)) fail('restart.spec.js never presses R with the real keyboard');
for (const combo of ['Control+KeyR', 'Meta+KeyR', 'Alt+KeyR']) if (!spec.includes(`'${combo}'`)) fail(`restart.spec.js never presses ${combo}`);
if ((spec.match(/keyboard\.down\('KeyR'\)/g) ?? []).length < 3) fail('restart.spec.js does not hold R (one down, then the keyboard repeating it): a held key must restart once');
if (!/startedOver\(page\)/.test(spec) || !/s\.race\.falls === 0 && s\.race\.checkpoint === -1/.test(spec)) fail('restart.spec.js does not check that a restart is a clean race (no falls, no flag)');
if (!/before\.race\.falls\)\.toBe\(1\)/.test(spec) || !/before\.race\.checkpoint\)\.toBe\(0\)/.test(spec)) fail('restart.spec.js does not restart a race that has a fall and a flag in it (something to lose)');
if (!/\[\['KeyR', false\]\]/.test(spec) || !/\[\['ArrowUp', true\]\]/.test(spec)) fail('restart.spec.js does not check that R is left to the browser and that the new race captures the arrows again');
if (!/after\.race\.phase[^;]*\)\.toBe\('finished'\)/.test(spec) || !/results'\)[^;]*\)\.toBeVisible\(\)/.test(spec)) fail('restart.spec.js does not check that after the finish the race stays finished with the results up');
if (!/await gamePage\(page\);\s*await page\.keyboard\.press\('KeyR'\)/.test(spec) || !/open\(page, 'gallery'\)/.test(spec)) fail('restart.spec.js does not press R on the title and on a free-run course');
if (!/to-title'\)\.click\(\);[\s\S]*?keyboard\.press\('KeyR'\);[\s\S]*?scene,[^)]*\)\.toBe\('hello'\)/.test(spec)) fail('restart.spec.js does not press R on the title AFTER a race (a listener that outlived its scene would start one)');
if (!/raceTime < -2\.6/.test(spec)) fail('restart.spec.js does not press R a second time in a restarted race (a kid mashing R: the listener is made anew with each scene)');
for (const name of ['before-r', 'restarted', 'restarted-in-countdown', 'r-at-the-results']) if (!new RegExp(`shot\\(page, '${name}', testInfo\\)`).test(spec)) fail(`restart.spec.js takes no shot called "${name}"`);
if (!/countdownShown\(page\);\s*(?:await expect[^;]*;\s*)?await settle\(page\);\s*await shot\(page, 'restarted'/.test(spec)) fail('restart.spec.js takes the "restarted" shot without waiting for the new race to be drawn (countdownShown, settle)');
out.push('restart.spec.js: real keys, mid-race with a fall and a flag, countdown, Ctrl/Cmd/Alt, held once, after the finish, title and free-run course, shots');

// 5. the spec documents
const handoff = read('HANDOFF.md');
if (!/- R starts a solo race over/.test(handoff) || !/\*\*G3f: Solo restart key\.\*\*/.test(handoff)) fail('HANDOFF.md does not say what R does (5.1) or list stage G3f (10)');
out.push('HANDOFF 5.1 and 10 say so');

pass(out.join('; '));
