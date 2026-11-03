# PROGRESS.md

Read only "Current status" at the start of a prompt. Keep headings exactly as they are:
`scripts/progress_view.mjs` and the Stop hook read them.

## Current status
- **Next stage:** H0 — Scaffold + harness
- **Last stage:** none
- **Smoke:** see STATUS.md (generated)
- **Waiting on the user:** nothing
- **Live tests needed:** H1 (school Wi-Fi)

## Stages
Mirror of HANDOFF.md §10. Tick in both places.

- [ ] H0 — Scaffold + harness
- [ ] H1 — Supabase + school Wi-Fi probe (needs the user)
- [ ] G1 — Runner
- [ ] G2 — Obstacle kit
- [ ] G3 — Course 1 + solo race flow
- [ ] B1 — Bots
- [ ] N1 — Rooms [design]
- [ ] N2 — Live race sync [design]
- [ ] N3 — Results + host leaves mid-race
- [ ] P1 — Coins + skin shop
- [ ] C1 — Course 2
- [ ] C2 — Course 3
- [ ] U1 — Polish
- [ ] D1 — First public deploy (needs the user)
- [ ] L1 — Class playtest (needs the user)
- [ ] R1 — v1.0

## Stage log
Newest first. Copy the template for each stage.

### Template
- Date: YYYY-MM-DD HH:MM–HH:MM
- Status: DONE | PARTIAL (what's left) | FAILED
- Ref: HANDOFF §… / BUG-NNN
- Built:
- Smoke check added: smoke_checks/<id>_<name>.mjs
- Smoke test: PASS (N checks, vitest X passed, e2e Y passed in chromium+webkit)
- Shots: .smoke/shots/<id>/ — what they show, in one line
- Live: PASS on <pages url> | n/a (why)
- Review: verifier PASS · code-reviewer APPROVE · product-reviewer SHIP | n/a (rounds: n; declined items → Decisions)
- Decisions:
- Needs the user:

## Live tests needed
- **H1:** probe on school Wi-Fi, 2 minutes, two MacBooks.

## Decisions
Numbered, newest last. One line each: what was decided and why.
