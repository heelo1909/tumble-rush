# CLAUDE.md (Tumble Rush)

Browser party race: Phaser 3 + Matter, Vite, GitHub Pages, Supabase Realtime. Players are kids on school MacBooks.
This file is only what's specific to this repo. Each folder's `CLAUDE.md` has that folder's rules.

## Start of every prompt
`date` → "Current status" in `PROGRESS.md` → `PRINCIPLES.md` → `HANDOFF.md` §0–1 → the next stage in §10 + its links.
`[design]` stage → code waits for `Status: approved` in its `docs/design/` note (only the user approves).

## One prompt = one stage (30 min, enforced)
Only the next stage. Before coding, say in one line whether it fits 30 min; if not, split it first (N2a/N2b) and log the
split as a Decision. At ~25 min and not done → stop safely, log PARTIAL with what's left; do not run on. Budget: ~10 min
red tests + code, ~5 min smoke check + proof, ~8 min targeted smoke + shots, ~7 min review + close. Where the time goes
(G3b took ~2 h): reruns of full smoke after review fixes, 20+ mutation proofs, two review rounds. All three are capped below.
`(needs the user)` → do the prep, hand back plain steps, stop.

## Closing a stage (the Stop hook enforces 3, 6, 7)
1. Permanent check `smoke_checks/<id>_<name>.mjs`, proved red with **at most ~5 mutations** (the ones that matter), each restored in a `finally`.
2. **Smoke, light or full.** Count stages in the PROGRESS list from the last full run (that stage = 0):
   - **Stages 1–4 after a full run:** `npm run smoke -- --targeted=<the e2e specs this stage touched>` → `SMOKE: TARGETED`
     (lint, unit, build, every smoke check, boot.spec.js + those specs, real Chromium + WebKit on real Supabase).
   - **Every 5th stage, and always D1 and R1:** `npm run smoke` → `SMOKE: PASS` (the whole e2e suite). A failure here is
     fixed in this stage before closing, so a regression is at most 4 stages old.
   The Stop gate enforces this (scripts/harness_common.mjs `stopGate`). Run each smoke once on the final tree.
3. Look at `.smoke/shots/<id>/` yourself.
4. **Review panel, in parallel, ONE round:** `verifier` + `code-reviewer` always; `product-reviewer` only if players can
   see the change. Tell the verifier not to re-run smoke (give it the fingerprint from STATUS.md) and touch nothing meanwhile.
   Fix every BLOCKER and SHOULD in ONE batch, then one smoke run again; only a BLOCKER the reviewer raised gets a
   focused second look from that reviewer (no smoke re-run). A second BLOCKER round → PARTIAL.
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
