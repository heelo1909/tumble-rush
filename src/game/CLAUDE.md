# src/game: Phaser scenes, runner, obstacles, courses

Everything you see move. Phaser 3 with **Matter** physics (`physics: { default: 'matter' }`).

## Layout
```
game/
  config.js          Phaser game config (scale FIT, 1280×720 base, matter settings, pixelArt false)
  scenes/
    BootScene.js     preload assets, then → MenuScene
    MenuScene.js     hands control to the DOM UI (src/ui) for menus/lobby
    RaceScene.js     builds the course, runners, camera; runs the race loop
  runner/
    Runner.js        Matter body + sprite + animation for ONE runner
    LocalControl.js  keyboard → intent {left,right,jump,dive}
    RemoteControl.js interpolation buffer → moves a static body (fed by src/net)
  obstacles/         one file per obstacle type from HANDOFF §5.2
  courses/           course1.json, course2.json, course3.json, test-flat.json, test-gallery.json
  fx/                shake, dust, confetti, banners
  testApi.js         window.__TR (only when ?test=1)
```

## Rules
1. **Intents, not keys.** Runners only read an intent object `{left, right, jump, dive}` each frame.
   Keyboard (LocalControl), a bot brain (src/bots), and the test autopilot all produce the same intent.
   Never read the keyboard inside Runner.js.
2. **Obstacles that move with the race clock get their pose from `src/logic/obstacles.js`.** Matter has no
   kinematic type: use *static* bodies moved each frame with `Matter.Body.setPosition(body, p, true)` /
   `setAngle(body, a, true)`. The `true` sets velocity, which is what makes a hammer *hit*. If the installed
   Matter version lacks that argument, set velocity with `Body.setVelocity` too, and log it as a Decision.
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
`teleport(checkpointIndex)` exists only for obstacle tests. Never use it in a "full race" test.
Changing this shape means updating `tests/e2e/fixtures.js` in the same stage.

## Done checklist for changes here
- [ ] e2e test drives it with **real key presses** (`page.keyboard`), not `__TR` shortcuts
- [ ] Screenshots of the new thing in `.smoke/shots/<stage>/`, and you looked at them
- [ ] No console errors during the e2e run
- [ ] Works in WebKit too (Safari on school Macs)
