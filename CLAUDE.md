# CLAUDE.md (Tumble Rush)

Browser party race: Phaser 3 + Matter, Vite, GitHub Pages, Supabase Realtime. Players are kids on school MacBooks.
This file is only what's specific to this repo. Each folder's `CLAUDE.md` has that folder's rules.

## Start of every prompt
`date` → "Current status" in `PROGRESS.md` → `PRINCIPLES.md` → `HANDOFF.md` §0–1 → the next stage in §10 + its links.
`[design]` stage → code waits for `Status: approved` in its `docs/design/` note (only the user approves).

## One prompt = one stage (~30 min)
Only the next stage. ~25 min and not done → stop safely, log PARTIAL with what's left. Too big → split (N2a/N2b).
`(needs the user)` → do the prep, hand back plain steps, stop.

## Closing a stage (the Stop hook enforces 3, 6, 7)
1. Permanent check `smoke_checks/<id>_<name>.mjs`, proved red once.
2. `npm run smoke` → `SMOKE: PASS` (lint, unit, build, smoke checks, **real Chromium + WebKit e2e on real Supabase**).
3. Look at `.smoke/shots/<id>/` yourself.
4. **Review panel, in parallel:** `verifier` + `code-reviewer` always; `product-reviewer` if players can see the change.
   Fix every BLOCKER, then re-run only the reviewers that blocked (max 2 rounds → PARTIAL).
   Anything you decline to fix: log it under Decisions with the reason.
5. Deploy exists and the game changed → push, wait for Pages, `npm run smoke:live`.
6. `PROGRESS.md`: status, stage-log entry (Smoke / Shots / Live / Review lines), tick §10 in both files.
7. Commit `<id>: <what> (HANDOFF §x)`, push. Hand back in ≤ 8 lines.

## Hard limits
- **Real or nothing.** Fakes and sandboxes never make a stage DONE. No browser or network → PARTIAL.
- Never commit red, and never skip/`.only`/loosen a test or a check to get green. Flaky → `B-NNN`.
- Protected harness (hook-enforced): `.claude/`, `scripts/{smoke,progress_view,harness_common}.mjs`,
  `playwright.config.js`. Need a change → tell the user what and why.
- HANDOFF §1 is law: no personal data, free text, chat, ads, filter bypasses, Fall Guys IP, or secrets.
- Feature and refactor never share a stage.

## Don't stop to ask
Pick a default, log it under Decisions, keep going. Stop only for `(needs the user)`.

`/stage` `/design` `/bugfix` `/refactor` `/retro` `/playtest` · agents: verifier, code-reviewer,
product-reviewer, playtester, test-writer
