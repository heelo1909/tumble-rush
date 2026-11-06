# HANDOFF.md: "Tumble Rush" (working title)

A short, chaotic 2D obstacle-course race in the browser. 2–4 friends sitting in class each open a
link on their own school MacBook, type a room code, and race through a physics-heavy course.
First to the finish wins. Races earn coins, and coins unlock skins. Empty seats are filled by
bots, and a friend who joins takes a bot's seat. It's hosted on GitHub Pages (the only host
that isn't blocked at school) and uses Supabase for the live connection between laptops.

Built by one person with Claude Code. Claude Code writes and tests everything, and the user
plays it, decides, and says "go".

---

## 0. TL;DR

- **Genre:** side-view 2D party obstacle race, in the spirit of Fall Guys, made small. Run, jump,
  dive, and get knocked around by spinning bars, hammers, bouncy pads and seesaws.
- **Round:** lobby → 3-2-1 countdown → a race of about 60–90 s → results (1st/2nd/3rd/4th + coins)
  → back to the lobby, with a rematch in one click.
- **Players:** 4 seats per room. Humans join with a 4-letter room code, and bots fill every empty seat.
- **Progression:** coins by placement → skin shop. Saved in the browser, with no accounts in v1.
- **Where it runs:** a static site on GitHub Pages (Phaser 3 + Matter physics, built by Vite and
  deployed by GitHub Actions). Live race data goes through Supabase Realtime (Broadcast + Presence).
- **Where it's tested:** for real, on the user's Mac. Playwright opens real Chrome windows that
  join a real Supabase room, race with bots driving, and save screenshots as proof. Fake-only
  tests were the weakness of the last project's harness (Warden), and this project fixes that.
- **MVP:** 3 courses, 8 obstacle types, 12 skins, bots, room codes. Nothing else until the MVP
  has been played in class and people want to play again.

## 1. Rules (non-negotiable)

**Original work**
- The gameplay is inspired by Fall Guys. The name, characters, art, sounds, UI and logos are all
  ours. Never use "Fall Guys", "bean", or any Mediatonic/Epic asset or lookalike character.
- Assets are either made for this project (by Claude Code as SVG/procedural art, or by the user)
  or are CC0 (for example Kenney.nl). Every file is logged in `public/assets/ASSETS.md`.

**Players are kids at school**
- **No personal data.** No accounts, emails or real names in v1. Display names are picked from a
  generated list (adjective + animal, like "Speedy Otter"). There's no free-text name box and no chat.
- No ads in the MVP. Later, banner ads only, never pop-ups or video interruptions (§9). An ad
  account needs an adult, so that's a parent's job.
- No pay-to-win and no paid random rewards, ever. Skins are cosmetic only.
- **No filter-bypassing tricks.** No proxies, mirrors, or domain-hopping to get around school
  blocks. The game is a normal GitHub Pages site. If the school blocks it, that's that.

**In class**
- Sound is **off by default**. Everything important shows visually (shake, flash, big "1st!").
- A race fits in about 90 s, and the lobby → race → results loop is under 2 minutes.
- It runs at 60 fps on a school MacBook in Chrome and Safari.

## 2. Goal and success

- **Success:** the user's friends ask to play it again the next day without being asked.
  The measurable version is in §11 (L1 playtest).
- **Goals:** fun with friends, fast to join (link → code → racing in under 20 s), and skins worth
  grinding for.
- **Non-goals for v1:** accounts or cloud saves, chat, more than 4 seats, mobile/touch controls,
  matchmaking with strangers, a level editor, ads, payments.
- **Anti-goals (a failure even if it works):** pop-up ads; a game that feels laggy or unfair
  between laptops (people quit); collecting kids' personal info; becoming a Fall Guys knockoff
  people could get taken down; a giant scope that never ships (the lesson from the Roblox game).

## 3. Tech stack

| Part | Choice | Why |
|---|---|---|
| Game engine | **Phaser 3** (latest 3.x) with **Matter.js** physics | The user chose it for the more impressive physics: rotating hinged bars, swinging hammers, seesaws, ragdoll-ish knockbacks |
| Language | JavaScript (ES modules), JSDoc types in `src/logic` and `src/net` | AI writes it reliably; no TypeScript build overhead (approach B chosen, not C) |
| Build | **Vite** | Fast dev server; `vite build` → `dist/` |
| Hosting | **GitHub Pages** project site `https://<user>.github.io/tumble-rush/` (Vite `base: '/tumble-rush/'`), deployed by GitHub Actions | The only host not blocked at school (Vercel/Netlify/Render are) |
| Live connection | **Supabase Realtime**, using Broadcast and Presence channels (no database tables in v1) | `*.supabase.co` is reachable at school (H1 confirms the live WebSocket stays open) |
| Unit tests | **Vitest** | Native to Vite |
| Real-browser tests | **Playwright** with real Chromium + WebKit (Safari engine) on the user's Mac | The "test it for real" requirement |
| Harness scripts and hooks | Node.js (`.mjs`), no Python | One language for the whole repo |

Node 20+ is required on the Mac. Supabase URL and anon key go in `.env` (local) and GitHub Actions
secrets (deploy). The anon key is public by design. Never commit the service-role key, and never
use it anywhere.

## 4. Architecture

### 4.1 Folders (each has its own `CLAUDE.md` with detailed rules)

```
tumble-rush/
  CLAUDE.md  PRINCIPLES.md  HANDOFF.md  PROGRESS.md  STATUS.md (generated)
  index.html  vite.config.js  package.json  .env.example
  src/
    main.js          boots Phaser, reads ?room= / ?test= URL params
    logic/           pure game rules: no Phaser, no network, no DOM. Clock, scoring, coins,
                     skins catalog, room codes, names, course data validation
    game/            Phaser scenes, the runner, obstacles, courses, camera, effects
    net/             Supabase rooms: create/join, presence seats, broadcast sync, host logic
    bots/            bot "brains" that press the same inputs a player does
    ui/              menus, lobby, HUD, results, skin shop (DOM overlay over the canvas)
  public/assets/     sprites, course art, fonts, sounds + ASSETS.md (sources/licenses)
  tests/
    unit/            Vitest: logic, net (with a fake channel), bots
    e2e/             Playwright: real browsers, real Supabase, screenshots
  smoke_checks/      one permanent check per stage; smoke runs them all forever
  scripts/           smoke.mjs, progress_view.mjs, harness_common.mjs (protected)
  docs/design/       one-page design notes for [design] stages
  docs/bugs/         BUG-NNN files
  .github/workflows/ deploy.yml (Pages), ci.yml (unit + build on every push)
  .claude/           settings.json, hooks/, agents/, commands/ (protected)
```

### 4.2 Dependency rule
`logic` depends on nothing. `bots` depends on `logic`. `net` depends on `logic`. `game` depends
on `logic` and `bots`. `ui` depends on `logic`. Only `src/main.js` and the scenes in `game/` wire
`net` and `ui` together. An ESLint rule (`no-restricted-imports`) enforces this.

### 4.3 Test API
When the URL has `?test=1`, the game exposes `window.__TR` (it's never present otherwise):
`state()` (scene, room code, seats, race time, each runner's x/y/finished/place), `autopilot(true)`
(a bot brain drives the local player), `seed(n)` (fixed seed for bot choices and names),
`fps()` (average over the last 2 s), `events()` (the log of race events). Playwright uses only
this API plus real keyboard input, never reaching into Phaser internals.

## 5. Gameplay spec

### 5.1 The runner
- Controls: ←/→ or A/D to run, ↑/W/Space to jump, Shift to dive (a forward lunge that also gets you
  up after a fall). Same layout for everyone, and no key remapping in v1.
- A Matter body: a rounded capsule with fixed rotation while upright. A big hit (hammer, spinning
  bar) "tumbles" it: rotation is unlocked for 0.8 s, then it springs back upright. That's the
  signature feel, so tune it until it's funny.
- Falling off the course respawns you at the last checkpoint after 1 s.

### 5.2 Obstacle kit (8 types for the MVP)
| Obstacle | Physics | Driven by |
|---|---|---|
| Spinning bar | static, rotated each frame | race clock |
| Swinging hammer | static pendulum, rotated each frame | race clock |
| Pusher wall | static, slides in/out each frame | race clock |
| Moving platform | static, moved along a path each frame | race clock |
| Bounce pad | static sensor that launches you | contact |
| Seesaw | dynamic, hinged | local physics only (see 6.4) |
| Conveyor belt | static, adds velocity | contact |
| Falling tiles | static → drop 0.6 s after first touch, respawn after 5 s | contact (local only) |

**Race-clock obstacles are pure functions of race time** (`pose = f(t)`), so every laptop shows them
in the same place at the same moment, with nothing sent over the network.
Matter has no "kinematic" body type. These are **static bodies moved every frame** with
`Matter.Body.setPosition/setAngle(body, value, true)` (the `true` gives the body the velocity of its move,
so a moving platform carries the runner standing on it and a pusher wall pushes with it). A bar's or
hammer's hit is not left to Matter's momentum, because a runner's own rules set its velocity every step:
the hit is decided from the pose function when the bodies touch and delivered as a tumble (G2a measured
4.4–4.8 tiles in both browsers, on target).

### 5.3 Courses
- Data, not code: `src/game/courses/<id>.json` (tile layout, obstacles with parameters,
  checkpoints, finish line). Validated by `src/logic/course.js`.
- MVP: 3 courses, each a left-to-right run of 60–90 s for a decent player. Each course
  teaches 2–3 obstacles, then mixes them.
- A room picks the next course in rotation (my call: a fixed order so friends learn them; random
  can come later).

### 5.4 Race flow
Lobby (seats, skins, "Start" for the host) → countdown 3-2-1 → race → a runner crosses the finish →
the "first finisher" banner shows on everyone's screen → the race ends when all humans finish or 30 s
after the first finisher (the timer is visible) → results with places and coins → lobby.
Bots that haven't finished are placed by distance travelled.

### 5.5 Coins and skins
- Coins per race: 1st 50, 2nd 35, 3rd 25, 4th 15; +10 for finishing at all; bot races count the same.
- 12 original skins in the MVP (colors/patterns + a few hats) at 0, 100, 200, 400 and 800 coins.
- Saved in `localStorage` (`tr.save.v1`) with a version number. If the data is corrupt or missing,
  start fresh without crashing. Others see your skin (it's sent in your Presence data).
- Cheating coins by editing localStorage only affects that person. That's acceptable in v1.

## 6. Multiplayer (Supabase Realtime)

### 6.1 Rooms
- The host clicks "Create room" and gets a 4-letter code from consonants only, with no confusable
  letters (no vowels means no accidental words). The link `…/?room=BKTR` also works.
- The channel is `room:<CODE>`. Presence holds each player's seat: id, name, skin, isHost and joinedAt.
- 4 seats. Joining a full room shows "Room full". Joining mid-race waits in the lobby for the next race.
- **Bots fill empty seats**, and a joining friend takes a bot's seat. Bots are simulated on the
  host's laptop and broadcast like players.
- **Host migration:** if the host leaves, the remaining human with the earliest `joinedAt` becomes
  host. If it happens mid-race, the race continues, the new host decides the results, and the **new host takes over
  the bots from their last broadcast position** (with a brief ghosted look for 0.5 s, never a teleport to the start).

### 6.2 During a race
- Each laptop simulates **only its own runner** with full Matter physics and broadcasts
  `{x, y, angle, vx, vy, anim, t}` about 15 times a second.
- Other runners are shown by **interpolating** about 100 ms behind. On the local screen they are
  static bodies moved each frame (same technique as §5.2), so they can bump you, but you can't push them. That's the trade-off for
  zero-lag control of your own runner.
- **Shared race clock:** the host broadcasts `start` with a start moment. Each client estimates its
  clock offset to the host with 5 ping/pong round trips in the lobby and uses the median.
- **Finish:** each client broadcasts `finish {raceTime}`. The host orders them and broadcasts
  `results`. A finish faster than the course's `minTime` is ignored (a sanity check, not
  anti-cheat).

### 6.3 Limits
- **Message budget.** Supabase's free tier caps Realtime messages per second and per month (H1 looks up
  the current numbers and logs them as a Decision). One room with 4 runners at 15 Hz, delivered to 3
  others, is about 180 messages/s. So: the host sends **all bots in one message**, positions only while
  racing, and the rate drops to 10 Hz if H1's numbers require it. N2 measures real messages per race,
  and PROGRESS keeps a running estimate of "races per month on the free tier".
- Designed for up to **3 rooms at once** (one class's worth of friend groups). More than that is a later problem.
- If the connection drops, show "Reconnecting…" and retry with backoff. After 10 s, drop to the
  lobby with a message. Never freeze the game.

### 6.4 Known divergence (accepted)
Seesaws, falling tiles and bumps are simulated locally, so two laptops can disagree on small
details. That's fine for a party game, as long as positions and results agree.

## 7. Presentation
- 16:9 canvas scaled to fit the window, with a DOM UI overlay. Readable from about 60 cm on a
  13" laptop.
- Bright, chunky shapes with thick outlines. The camera follows the local runner with a lead in
  the running direction.
- Effects: screen shake on big hits, dust puffs, confetti at the finish, and a big placement banner.
- Audio: optional, muted by default, with a toggle in the corner.

## 8. Harness (how Claude Code works on this repo)

It's the same skeleton as Warden's harness (root CLAUDE.md, stages, permanent smoke checks,
verifier, Stop gate, protected harness), plus real-world testing:

1. **Short root `CLAUDE.md`**, read every prompt, and **one detailed `CLAUDE.md` per folder**
   that Claude Code loads when it works in that folder.
2. **`npm run smoke`** (`scripts/smoke.mjs`) runs, in order: ESLint → Vitest → `vite build` →
   every `smoke_checks/*.mjs` → the Playwright e2e suite in **real Chromium and WebKit** against
   `vite preview`, using the real Supabase dev project. It prints `SMOKE: PASS` or `SMOKE: FAIL`,
   writes `.smoke/last-run.json` and `STATUS.md`, and keeps screenshots in `.smoke/shots/<stage>/`.
   `--quick` skips e2e and never counts for the gate.
3. **`npm run smoke:live`** runs the e2e suite against the deployed GitHub Pages URL after a deploy.
   Every stage that changes the game ends with a live run.
4. **Proof you can see:** Claude and the reviewers open the stage's screenshots and describe what is
   actually on screen. "Tests passed" alone never counts as proof.
5. **Review panel** (PRINCIPLES §4): `verifier` (done?), `code-reviewer` (sound?), `product-reviewer`
   (better for kids in class?), in parallel. Plus `playtester` and `test-writer` on demand.
6. **Runs on the user's Mac.** If smoke can't run there (no browser, no network, a cloud sandbox),
   the stage is PARTIAL. It's never DONE on the strength of a simulation.
7. **(needs the user)** stages cover what only a human at school can do: school Wi-Fi, playing
   with friends, judging fun.

Hooks: SessionStart (prints the time, the next stage, and whether the last smoke matches the code), PreToolUse
(blocks edits to the harness), PostToolUse (runs ESLint on the file just edited and returns errors right away),
Stop (blocks stopping unless the work is committed, pushed, PROGRESS is updated and the last full
smoke passed for the current code).

## 9. Later (Cut List, not in the MVP, in rough order)
More courses · elimination rounds (Fall Guys-style 3-round show) · emotes · daily challenge
course · optional cloud save with Supabase auth (needs a privacy review because players are kids) ·
banner ads (a parent's account, banner only) · touch controls · 8-player rooms.

## 10. Stages
One prompt = one stage (about 30 min). Tick here and in PROGRESS.md.
**[design]** = a note in `docs/design/` must say `Status: approved` before any code.
**(needs the user)** = ends by handing the user plain steps.

- [x] **H0: Scaffold + harness.** Vite + Phaser "hello" scene; ESLint with the dependency rule;
  Vitest; Playwright (Chromium + WebKit installed); `scripts/smoke.mjs`, `progress_view.mjs`,
  `harness_common.mjs`; `.claude/settings.json` + 3 hooks; `deploy.yml` + `ci.yml`; `?test=1` →
  `window.__TR.state()`. DoD: smoke passes, the e2e test loads the page in both browsers and
  screenshots it, and the hooks fire (shown in the log).
- [x] **H1: Supabase + school Wi-Fi probe (needs the user).** The user creates the Supabase project
  and the GitHub repo with Pages turned on (plain steps). Claude looks up Supabase's current free-tier
  Realtime limits and logs them. `probe.html`: opens a Realtime channel,
  sends a ping every 2 s for 2 minutes between two tabs, and shows green/red with latency. DoD: probe
  e2e passes at home; **the user runs it on school Wi-Fi** and reports the result in PROGRESS.
- [x] **G1: Runner.** Movement, jump, dive, tumble and spring-up on a flat test course. Tuning
  values live in `src/logic/tuning.js`. DoD: e2e drives it with real key presses and asserts movement,
  with screenshots.
- [x] **G2a: Obstacle kit, race-clock obstacles.** Spinning bar, swinging hammer, pusher wall, moving platform
  (split from G2, PROGRESS Decision 34); race-clock `pose = f(t)` functions live in `src/logic` with unit tests;
  a real hammer/bar contact does the hitting; a runner rides a moving platform. DoD: a gallery test course;
  e2e screenshots each obstacle at t = 0 / 1 / 2 s.
- [ ] **G2b: Obstacle kit, contact obstacles.** Bounce pad, seesaw, conveyor belt, falling tiles (the other
  four of the 8 from §5.2), added to the same gallery. DoD: e2e drives each with real keys, with screenshots.
- [ ] **G3: Course 1 + solo race flow.** Countdown, timer, checkpoints, respawn, finish, results.
- [ ] **B1: Bots.** A bot brain that reliably finishes course 1 (waits for gaps, jumps pads). Three
  bots + the player race locally. DoD: on 10 seeded runs, bots finish 10/10 within 2× `minTime`.
- [ ] **N1: Rooms [design].** Create/join by code or link, Presence seats, bots fill seats, a friend
  replaces a bot, room full, host migration in the lobby. DoD: e2e with 4 browser contexts.
- [ ] **N2: Live race sync [design].** Clock offset, start, 15 Hz broadcast, interpolation,
  reconnecting. DoD: e2e with 4 contexts (2 Chromium + 2 WebKit), each with autopilot; every
  context sees all 4 runners move; the max position disagreement is logged.
- [ ] **N3: Results + host leaves mid-race.** Host-decided results, the `minTime` sanity check, mid-race
  host migration, a mid-race joiner waits. DoD: all contexts show identical results; the
  host-closes-tab test passes.
- [ ] **P1: Coins + skin shop.** Save v1, shop UI, skins visible to others. DoD: e2e buys a skin,
  reloads, it's still owned, and another context sees it.
- [ ] **C1: Course 2.**  **C2: Course 3.** (one stage each)
- [ ] **U1: Polish.** Menus, HUD, effects, muted-by-default audio, a 60 fps check on WebKit.
- [ ] **D1: First public deploy (needs the user).** The live e2e suite passes on the Pages URL; the user
  opens it at school **in real Safari and Chrome** (Playwright's WebKit is close to Safari, not identical)
  and plays one race with a friend.
- [ ] **L1: Class playtest (needs the user).** 3+ friends, 5+ races. The user answers the §11 questions,
  and each problem becomes a `B-NNN` stage.
- [ ] **R1: v1.0.** Fixes from L1, a version tag, a README with how to play.

## 11. Playtest questions (L1)
1. Did everyone get from link to racing in under 20 s?
2. Did anyone say it felt laggy or unfair? When?
3. How many races did they play before stopping? Did they want a rematch?
4. Which course and obstacle was the most fun, and which was the most annoying?
5. Did anyone care about skins? Which one did they want?
6. The next day, did anyone ask to play again?

## 12. Left to the builder (decide, record under Decisions in PROGRESS.md, keep going)
Exact Phaser/Vite/Supabase/Playwright versions · sprite style details and palette · course
layouts beyond the "teach 2–3 then mix" rule · skin names and designs · bot difficulty curve ·
tuning numbers · file names inside folders · effect details.
