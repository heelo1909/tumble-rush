# src/game: Phaser scenes, runner, obstacles, courses

Everything you see move. Phaser 3 with **Matter** physics (`physics: { default: 'matter' }`).

## Layout
```
game/
  config.js          collision categories + the Matter settings (fixed 60 Hz). The canvas is 960×540 (W, H exported
                     by BootScene.js, built in H0), tiles are 48 px (logic/tuning.js TILE)
  BootScene.js       (H0) the "hello" title scene; the real menu replaces it later
  scenes/
    MenuScene.js     hands control to the DOM UI (src/ui) for menus/lobby
    RaceScene.js     builds the course, runners, camera; runs the race loop. Test courses opened with ?test=1&scene=flat,
                     gallery (free run: no countdown, no respawn) or race (G3a: the race flow, registry `flow`: a 3-2-1
                     countdown the keys cannot move through, the race clock and HUD timer, checkpoint flags, a respawn at the
                     last checkpoint after a fall, with a camera cut). The rules are logic/race.js `stepRace`, run once per
                     physics step; the scene acts on its events. The race clock is still steps/60 (it starts at -3 s with the
                     flow on); N2 swaps the source for a clock shared with the host (Decision 53)
  runner/
    Runner.js        Matter body + sprite + animation for ONE runner
    LocalControl.js  keyboard → intent {left,right,jump,dive}
    RemoteControl.js interpolation buffer → moves a static body (fed by src/net)
  obstacles/         one file per obstacle type from HANDOFF §5.2. G2a (race clock): spinningBar, swingingHammer, pusherWall,
                     movingPlatform. G2b (contact): bouncePad (a sensor), seesaw (a real dynamic body on a pin), conveyor
                     (a surface speed, `plugin.surface`), fallingTiles (a row, one body and one timer each). index.js builds
                     them from the course, moves the race-clock ones each step from logic/obstacles.js pose(), steps the
                     others, and hands every contact to the obstacle (`touch`: a hit, a launch, a timer); common.js has the
                     static box and the move with velocity. The rules of the contact four are pure, in logic/contact.js.
  courses/           course1.json, course2.json, course3.json, test-flat.json, test-race.json (G3a: two 3-tile pits, two flags),
                     test-gallery.json (8 bays: the four race-clock
                     obstacles, then pad, seesaw, conveyor, tiles; teleport(i) stands the runner at the start of bay i)
  fx/                shake, dust, confetti, banners
  testApi.js         window.__TR (only when ?test=1)
```

## Rules
1. **Intents, not keys.** Runners only read an intent object `{left, right, jump, dive}` each frame.
   Keyboard (LocalControl), a bot brain (src/bots), and the test autopilot all produce the same intent.
   Never read the keyboard inside Runner.js.
2. **Obstacles that move with the race clock get their pose from `src/logic/obstacles.js`.** Matter has no
   kinematic type: use *static* bodies moved each frame with `Matter.Body.setPosition(body, p, true)` /
   `setAngle(body, a, true)`. The `true` sets the body's velocity: it is what a runner standing on a moving platform
   rides along with, and what Matter's overlap correction pushes with. It is NOT what makes a hammer or bar *hit*
   (G2a measured this): `stepRunner` sets the runner's velocity every step, so Matter's momentum cannot knock a
   running runner back. A hit is decided in `src/logic/obstacles.js` (`hitOnContact`) and delivered with
   `Runner.hit()`. If the installed Matter version lacks that argument, set velocity with `Body.setVelocity` too,
   and log it as a Decision.
3. **Feel numbers come from `src/logic/tuning.js`.** No magic numbers for speed, jump, gravity or knockback here.
4. **Fixed timestep.** Matter runs at a fixed 60 Hz step (`matter.runner` / `autoUpdate` set up so a slow
   frame doesn't make physics jumpy). Race time comes from the clock in src/logic, not frame counting.
5. **The course is data.** RaceScene builds everything from the course JSON after `validateCourse` passes.
   An invalid course shows an error screen in test mode and throws in dev.
6. **Collision categories** (define once in `config.js`): `LOCAL_RUNNER`, `REMOTE_RUNNER`, `WORLD`,
   `OBSTACLE`, `SENSOR`. Remote runners are static bodies moved by RemoteControl each frame
   (same technique as rule 2), so they can bump the local runner but are never moved by physics.
7. **No network or DOM code here.** RaceScene gets a `session` object (from main.js) with
   `onRemoteState(cb)`, `sendLocalState(s)`, `sendFinish(t)`, so it never imports Supabase.
8. **Performance budget** (school MacBook, 60 fps): ≤ 250 Matter bodies per course, no per-frame
   allocations in update loops, texture atlases rather than many single images, particles capped.

## Feel targets (tune toward these, check them in screenshots/GIF captures)
- Holding run reaches top speed in ~0.25 s. Jump clears a 2-tile gap at full speed but not from standstill.
- Dive covers ~3 tiles and is the fastest way to recover from a tumble.
- A hammer hit sends you tumbling ~4–6 tiles. It should look funny, not frustrating.
- Respawn at a checkpoint after a fall takes ≤ 1.5 s total.

## testApi.js (the contract with tests/e2e)
`window.__TR` exists only with `?test=1`. Keep this shape stable; e2e tests depend on it:
`state()` → `{scene, roomCode, seats:[{id,name,skin,isBot,isHost}], raceTime, runners:[{id,x,y,angle,finished,place,checkpoint}]}`
`autopilot(on)` · `seed(n)` · `fps()` · `events()` → `[{t, type, data}]`.
`teleport(checkpointIndex)` (G2a) stands the runner on that checkpoint of the course; only for obstacle tests. Never use it in a "full race" test.
`clock(t, paused)` (G2a) sets the race clock to t seconds; paused holds it there (obstacles stand still and contacts do not hit), so a screenshot is "at t = 1 s" exactly.
`state().obstacles` (G2a) → `[{id, type, x, y, angle}]`, pixels and radians, read from the real bodies. A row of falling tiles (G2b) adds `tiles: ['solid'|'armed'|'fallen', ...]`; a seesaw's `angle` is its plank's.
`state().race` (G3a) → `null` on the free-run test courses; with the race flow `{phase: 'countdown'|'racing', t, countdown, checkpoint, checkpoints, falls, respawnIn}`: `t` is the race clock (negative in the countdown, equal to `raceTime`), `countdown` the word the HUD shows ('3', '2', '1', 'GO!' or ''), `checkpoint` the last flag passed (-1 = only the start), `respawnIn` seconds until a fallen runner is put back (null = not fallen). `runners[0].checkpoint` is the same index. `clock(t, paused)` throws with the flow on.
`events()` also has `go`, `checkpoint {index, x}`, `fall {x}` and `respawn {checkpoint, x}` (G3a), `x` in tiles.
`hit(dir)` (G1) is the shortcut from before there were obstacles: it calls the same `Runner.hit()` that a bar's or hammer's contact now calls. Obstacle tests do not use it: a hit must come from a real contact.
Each `runners[i]` also carries `vx, vy` (tiles/s), `mode` ('run'|'dive'|'tumble'|'spring'), `grounded`, `facing`;
`events()` has `jump`, `land {rise, dx, air}`, `dive`, `tumble`, `spring`, `run`, `hit {by, dir, x}` (logged just before its `tumble`), `bounce {x, vy}` (a pad launched the runner; its `land` follows) and `tile {i, phase, x}` (a falling tile became `armed`, `fallen` or `solid` again), with `t` in physics seconds.
Changing this shape means updating `tests/e2e/fixtures.js` in the same stage.

## Done checklist for changes here
- [ ] e2e test drives it with **real key presses** (`page.keyboard`), not `__TR` shortcuts
- [ ] Screenshots of the new thing in `.smoke/shots/<stage>/`, and you looked at them
- [ ] No console errors during the e2e run
- [ ] Works in WebKit too (Safari on school Macs)
