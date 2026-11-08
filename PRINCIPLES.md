# PRINCIPLES.md (Tumble Rush)

How work happens here. `CLAUDE.md` has the per-prompt checklist.

## 1. Order of work
**Requirement → (design note) → red test → code → smoke (real browsers) → look at screenshots →
review panel → live check → log → commit.**
- Every change traces to a `HANDOFF.md` section, a design note, or a `docs/bugs/BUG-NNN` file.
- `[design]` stages get a one-page note from `docs/design/TEMPLATE.md`. The user sets `approved`.
- Tests come before or with the code, never after.

## 2. What "done" means
DoD items met, a permanent smoke check exists, the smoke for this stage passed on the user's Mac (`SMOKE: TARGETED` on
four stages out of five, a full `SMOKE: PASS` every 5th stage and on D1 and R1: see CLAUDE.md "Closing a stage"),
screenshots show the feature, the review panel passes (§4), the live check passes (if deploy exists), PROGRESS
is updated, and the work is committed and pushed. Anything less is PARTIAL or FAILED and logged that way.

## 3. Real first (the lesson from Warden)
Warden's harness was strong but tested only fakes, so "passing" said little about the real app, and 13
tests that passed in a Linux sandbox failed on the Mac. Here:
- **Unit tests (Vitest)** are for pure rules (`src/logic`, bot decisions, net message handling with a fake
  channel). They are fast but never proof that the game works.
- **Proof is e2e (Playwright):** real Chromium and WebKit, the real built game, a real Supabase project,
  real key presses, and several browser windows at once for multiplayer.
- **Proof you can see:** every e2e test saves screenshots, and Claude and the verifier look at them.
- **Live:** after deploy, the same suite runs against the real GitHub Pages URL.
- **Human-only truths** (school Wi-Fi, fun, fairness between friends) are `(needs the user)` stages.
  Never claim them from automated results.

## 4. Review panel
Three independent reviewers who didn't write the code, run in parallel at the end of a stage:
| Reviewer | Question it answers | Runs |
|---|---|---|
| `verifier` | Is the stage *done*: scope, every DoD item, proof that it's real, claims backed? | every stage |
| `code-reviewer` | Will this code hurt us later: layers, determinism, netcode, physics, perf, test quality, safety? | every stage |
| `product-reviewer` | Does this make the game better *for kids in class*: fun, fair, readable, on-goal, kid-safe? | player-visible stages |
Plus on demand: `playtester` (plays the real build like a kid) and `test-writer` (red tests first).
A BLOCKER from any reviewer stops the stage. A SHOULD is fixed or declined with a logged reason.
Product "taste" questions go to the user; reviewers never decide taste.

## 5. Hard limits
1. Never commit with failing tests. No `test.skip`, `.only`, `fixme`, or raised timeouts to get green.
   A test that is truly flaky becomes a `B-NNN` stage, not a skip.
2. Never edit the harness (see CLAUDE.md list) to get a stage through. Ask the user.
3. Never mix a feature and a refactor.
4. Commit messages carry the stage ID and HANDOFF reference.
5. Tests use their own Supabase channel prefix (`test-<runId>-`) and never touch real players' rooms.
6. No personal data, ads, chat, free-text input, paid randomness, filter bypasses, or copied IP (HANDOFF §1).
7. No secrets in the repo, logs, screenshots, or CI output.

## 6. Quality gates
- Every player-visible feature has an e2e test driving real input, with screenshots.
- No console errors during any e2e test (the e2e fixture fails the test on `pageerror` or `console.error`).
- 55+ fps average in the e2e perf check (U1 onward) in both browsers.
- `vite build` has no warnings about missing assets.
