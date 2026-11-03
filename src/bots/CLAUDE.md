# src/bots: bot brains

Bots fill empty seats, and they're also the **autopilot that plays the real game in e2e tests**. A bad bot
breaks both the game and the harness, so bots get their own tests and numbers.

## Shape
A brain is `createBrain({ course, skill, rng }) → { think(view) → intent }`.
- `view` is what a player could see: own position and velocity, whether it's on the ground, the
  course tiles nearby, and obstacle poses at the current race time (from `src/logic/obstacles.js`).
  **Bots never read other laptops' data or future obstacle states beyond what timing a human could judge.**
- `intent` is the same `{left, right, jump, dive}` a keyboard produces (see src/game/CLAUDE.md rule 1).
- `skill` 0–1 changes reaction delay, jump-timing accuracy, and how often they make a "human" mistake.

## Rules
1. **Imports only from `src/logic`.** No Phaser, no net, no DOM. This lets brains run in Vitest against a
   tiny headless step model, and in the real game unchanged.
2. **Seeded.** All randomness comes from the passed `rng`; same seed → same decisions.
3. **Behaviors per obstacle type** live in one file each (`behaviors/hammer.js` etc.): "wait for the
   gap, then go", "jump on pad", "dive to recover". The brain picks a behavior by what's ahead.
4. Default skills: one bot at 0.4, one at 0.6, one at 0.8, so a new player can beat at least one bot
   and a good player can beat all of them.

## Proof (B1 and every course stage)
- **Real runs, not just unit tests.** The e2e test `bots.finish.spec.js` runs each course N = 10 times with seeds
  1–10 in Chromium, autopilot on the local runner + 3 bots, and asserts that every bot finishes within
  2× the course's `minTime`. It prints the table of finish times.
- Unit tests check behaviors in isolation (a hammer behavior waits when the hammer is in the path at
  time t and goes when it isn't).
- A course isn't done until bots can finish it. If they can't, it's the course *or* the bot. Log which.

## Done checklist
- [ ] Unit tests for new or changed behaviors
- [ ] `bots.finish` e2e table pasted into the stage log (finish rate, min/avg/max time per course)
- [ ] No bot gets stuck forever (the e2e fails if a runner's x doesn't increase for 15 s)
