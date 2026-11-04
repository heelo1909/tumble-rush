# PROGRESS.md

Read only "Current status" at the start of a prompt. Keep headings exactly as they are:
`scripts/progress_view.mjs` and the Stop hook read them.

## Current status
- **Next stage:** H1 — Supabase + school Wi-Fi probe (needs the user)
- **Last stage:** H0
- **Smoke:** see STATUS.md (generated)
- **Waiting on the user:** H1 setup (Supabase project, .env, GitHub Pages source = Actions, repo secrets)
- **Live tests needed:** H1 (school Wi-Fi)

## Stages
Mirror of HANDOFF.md §10. Tick in both places.

- [x] H0 — Scaffold + harness
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

### H0 — Scaffold + harness
- Date: 2026-11-04 18:12–18:45
- Status: DONE
- Ref: HANDOFF §3, §4, §8, §10 H0
- Built: Vite + Phaser 3.90 (Matter) hello scene, window.__TR test API (?test=1), ESLint layer rule, Vitest, Playwright (chromium+webkit), scripts/{smoke,progress_view,harness_common}.mjs, 4 hooks + settings.json, ci.yml, deploy.yml
- Smoke check added: smoke_checks/h0_base_path.mjs, h0_no_secrets.mjs, h0_assets_logged.mjs, h0_harness.mjs
- Smoke: PASS (4 checks, vitest 42 passed, e2e 4 passed in chromium+webkit; rerun after review fixes, with H0 unticked in PROGRESS during the run so the .env check did not apply). Proved red: base_path (vite base set to "/"), no_secrets (src file containing service_role), assets_logged (unlogged png) each failed when broken, then restored; h0_harness asserts every Stop-gate failure case in a temp repo. Hooks run by hand: protect_harness exit 2 on scripts/smoke.mjs, .claude/settings.json, playwright.config.js and exit 0 on src/main.js; lint_on_edit exit 2 on a syntax error; stage_gate exit 2 while unclosed (and it blocked this session's Stop); session_start printed time, next stage and smoke freshness.
- Shots: .smoke/shots/h0/ — title scene "Tumble Rush" with the Matter test box falling then landed on the floor, same in chromium and webkit
- Live: n/a (no deploy yet; Pages setup is H1)
- Review: verifier PASS · code-reviewer APPROVE (rounds: 2; round 1 had 3 blockers, all fixed; deferred SHOULDs → Decision 7)
- Decisions: 1–6 below
- Needs the user: H1 setup (Supabase project, .env, Pages source = Actions, repo secrets)

### Template
- Date: YYYY-MM-DD HH:MM–HH:MM
- Status: DONE | PARTIAL (what's left) | FAILED
- Ref: HANDOFF §… / BUG-NNN
- Built:
- Smoke check added: smoke_checks/<id>_<name>.mjs
- Smoke: PASS (N checks, vitest X passed, e2e Y passed in chromium+webkit)
- Shots: .smoke/shots/<id>/ — what they show, in one line
- Live: PASS on <pages url> | n/a (why)
- Review: verifier PASS · code-reviewer APPROVE · product-reviewer SHIP | n/a (rounds: n; declined items → Decisions)
- Decisions:
- Needs the user:

## Live tests needed
- **H1:** probe on school Wi-Fi, 2 minutes, two MacBooks.

## Decisions
Numbered, newest last. One line each: what was decided and why.
1. Pinned phaser@^3.90 (npm "latest" is Phaser 4; HANDOFF specifies Phaser 3).
2. boot.spec canvas check uses a screenshot-size test, not drawImage pixel sampling: a WebGL canvas reads back blank without preserveDrawingBuffer, which would cost performance. The probe was wrong, not the game.
3. The env check requires the Supabase .env keys as soon as H0 is ticked (spec: "from H1 onward"), so every stage after H0 fails smoke until H1 setup is done. Raised with the user.
4. Review round 1 (code-reviewer) found 3 blockers: stop gate not tied to the current stage, case-sensitive/edit-only protection, layer rule not covering packages/globals. Fixed; the protected-file fixes were applied by the user from .smoke/patch because the hook blocks edits to the harness even during H0.
5. Protected list extended beyond the spec: eslint.config.js, vitest.config.js, smoke_checks/_util.mjs (they define what "green" means); the hook also scans Bash/PowerShell commands for writes to protected paths.
7. Round-2 SHOULDs deferred because they are in protected files (need a user-applied patch, bundle with the next harness change): (a) the Review regex in stopGate lets `\s*` cross a newline, so an empty "Review:" followed by another line passes; use `[ \t]*` and add a test with a trailing line; (b) the write-word check treats `>` in a commit trailer or `=>` as a write; strip `<...@...>` and `=>` first; (c) protect .smoke/last-run.json and .smoke/stop_blocks.json from forgery; (d) lint-ban Date.now/performance.now/new Date and `phaser/*` subpaths in logic and bots; (e) require the Review line to contain no CHANGES/BLOCKER. Fixed now: the PROGRESS template said "Smoke test:" but the gate needs "Smoke:".
6. Known limit: the shell-command check is a heuristic. It blocks any one command that contains both a write word and a protected path (for example a sed on PROGRESS.md chained with a run of scripts/smoke.mjs), so such commands must be split.
