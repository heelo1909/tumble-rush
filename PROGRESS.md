# PROGRESS.md

Read only "Current status" at the start of a prompt. Keep headings exactly as they are:
`scripts/progress_view.mjs` and the Stop hook read them.

## Current status
- **Next stage:** H1 — Supabase + school Wi-Fi probe (needs the user) (PARTIAL: built, tested and passing at home; waiting for the user's school Wi-Fi result)
- **Last stage:** H1
- **Smoke:** see STATUS.md (generated)
- **Waiting on the user:** run the probe on school Wi-Fi (2 minutes, two MacBooks) and report the result line. Link: https://heelo1909.github.io/tumble-rush/probe.html?room=BKTR (same link on both laptops; available once the deploy finishes).
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

### H1 — Supabase + school Wi-Fi probe
- Date: 2026-11-04 18:30–19:31
- Status: PARTIAL (everything Claude can do is done and passes at home; waiting on the user's 2-minute school Wi-Fi run, which is the last DoD item. H1 stays unticked until the user reports the result.)
- Ref: HANDOFF §6.3, §10 H1
- Built: user setup done and verified read-only (Supabase project, .env keys, repo secrets, Pages = GitHub Actions). Free-tier Realtime limits looked up and logged (Decisions 8–9). Probe page `probe.html` (second Vite entry in vite.config.js): two tabs join `<ns>probe-<ROOM>`, ping every 2 s for 120 s (`?secs=` shortens it for tests), big room code, GREEN/RED banner with latency, loss, p95 and longest silence, and what to do next (screenshot both laptops); a connection that never opens (blocked or silent socket) ends RED with a plain sentence; trouble after the run started is counted and measured, not hidden; if the channel had already opened, an error while waiting shows "The connection hiccuped. Reconnecting…" and only goes RED if it has not come back after 10 s. Verdict rules are pure in src/logic/probe.js (10 unit tests). New src/net/transport.js is the only file importing supabase-js (src/net/CLAUDE.md rule 1); src/net/probeChannel.js sits on it. fixtures.js gained testRoom(), openPlayers() (separate contexts, error collection in every window) and probePage(). Review fixes: late `subscribed` no longer overwrites the running banner (this raced and made the e2e flaky); pongs count once and only for our own pings; hidden-tab time is reported; supabase-js is created without auth timers and `leave()` waits for the leave to be sent.
- Smoke check added: smoke_checks/h1_probe_built.mjs (dist/probe.html exists, every file it loads is under the base path, the page-specific strings are in what it loads, no `<input>`, no Phaser (`phaser.io`) in any loaded chunk, Supabase URL baked in when .env exists, green/red verdict rules). It is structural; behaviour is proved by tests/e2e/probe.spec.js. Proved red: removing the probe entry from vite.config.js, adding an `<input type=text>`, and importing phaser from probe.js each made it FAIL; restored → PASS. h0_no_secrets.mjs: only the exact supabase-js idiom `startsWith("sb_secret_")` inside dist/ is ignored (Decision 12). Proved: a planted fake key in dist, a bare `sb_secret_` in dist, a bare `sb_secret_` in src, the library idiom in src, and `service_role` in dist all FAIL; the real bundle PASSES.
- Smoke: PASS (5 checks, vitest 52 passed, e2e 18 passed in chromium+webkit on real Supabase). Repeat runs: the GREEN test 10 of 10 after the banner fix (the verifier saw it fail 2 of 5 before), the two drop tests 16 of 16. Probe numbers at home in the last smoke run (two windows each; they vary run to run, webkit p95 reached about 840 ms): chromium median 104/86 ms, p95 203/311 ms, 7/7 pings; webkit median 239/204 ms, p95 843/288 ms, 7/7 pings. After a deliberate mid-run socket drop both browsers still ended GREEN, 7/7, "connection errors: 1".
- Shots: .smoke/shots/h1/ — I opened them: waiting (grey "Waiting for the other laptop…", big yellow room code, link for the other laptop, 1 laptop, a placeholder in the result bar), running (blue "Testing… keep this tab open and in front.", 2 laptops, pings 1/1), end (green "GREEN: the live connection worked on this network.", 7/7, bold result line "GREEN | 14s | sent 7, got 7 | median 173 ms | p95 247 ms | longest silence 2.1 s", then "Take a screenshot of this screen on BOTH laptops…"), mid-run drop end (green, same line plus "| connection errors: 1"), hiccup while waiting (still grey "Waiting…" with an amber "The connection hiccuped. Reconnecting…"), blocked WebSocket (red "RED: could not connect.", "This network may be blocking it. Details for the builder: Realtime channel CHANNEL_ERROR: socket closed: 0") and silent socket (same red screen, detail "Realtime channel TIMED_OUT"). Same layout in chromium and webkit, no overlap, readable.
- Live: PASS on https://heelo1909.github.io/tumble-rush/ (commit 84b70f6: deploy and ci workflows green; `npm run smoke:live` = 18 e2e passed in chromium+webkit, 0 flaky, 0 failed, including the probe tests against the deployed bundle with its baked-in Supabase settings and the H0 title page). Not yet opened by a human on school Wi-Fi: that is the remaining DoD item.
- Review: verifier PASS · code-reviewer APPROVE · product-reviewer CHANGES (no BLOCKER, SHOULDs applied) (rounds: 2; round 1 had one BLOCKER found independently by the verifier and the code-reviewer: a late `subscribed` reset the banner and made the e2e flaky; fixed, round 2 clean). Changes after round 2, not re-reviewed (small; proved by two new permanent e2e tests, the waiting-phase one proved red against the old behaviour, 16 of 16 repeats, and a full smoke): a dropped connection while waiting now shows "Reconnecting…" for up to 10 s instead of going RED at once (verifier SHOULD, code-reviewer NIT); permanent mid-run and waiting-phase drop tests; the "about 2 s silence" note only on finished runs; try/catch around track() and disconnect(); drops annotated in the GREEN test; the red tests assert the socket path, not a missing .env. Declined and deferred items → Decisions 13, 16, 17.
- Decisions: 12–18 below
- Needs the user: run the probe on school Wi-Fi: on two MacBooks (ideally one Safari, one Chrome) open the same link (Current status → Waiting on the user), keep both tabs open and in front for 2 minutes, then tell Claude the result line from BOTH laptops (GREEN/RED and the numbers); decide the netcode send rate when the N2 design note comes (Decision 9)

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
6. Known limit: the shell-command check is a heuristic. It blocks any one command that contains both a write word and a protected path (for example a sed on PROGRESS.md chained with a run of scripts/smoke.mjs), so such commands must be split.
7. Round-2 SHOULDs deferred because they are in protected files (need a user-applied patch, bundle with the next harness change): (a) the Review regex in stopGate lets `\s*` cross a newline, so an empty "Review:" followed by another line passes; use `[ \t]*` and add a test with a trailing line; (b) the write-word check treats `>` in a commit trailer or `=>` as a write; strip `<...@...>` and `=>` first; (c) protect .smoke/last-run.json and .smoke/stop_blocks.json from forgery; (d) lint-ban Date.now/performance.now/new Date and `phaser/*` subpaths in logic and bots; (e) require the Review line to contain no CHANGES/BLOCKER. Fixed now: the PROGRESS template said "Smoke test:" but the gate needs "Smoke:".
8. Supabase free-tier Realtime limits (read from the docs on 2026-11-04): 100 messages/s, 100 channel joins/s, 100 channels per connection, 256 KB broadcast payload, 20 presence messages/s, 2 million messages/month, 200 peak connections. A broadcast counts as 1 sent plus 1 per subscribed receiver. The docs do not say whether the 100/s cap counts deliveries, so assume it does. Sources: supabase.com/docs/guides/realtime/limits, /pricing, and /guides/platform/manage-your-usage/realtime-messages.
9. Message-budget consequence for the N2 [design] note (my estimate): 4 humans each sending at 15 Hz is 60 sends/s x (1 + 3 receivers) = about 240 messages/s per room, 2.4x the 100/s cap; at 10 Hz about 160/s. 2 humans + bots (all bots in one message from the host) at 15 Hz is about 90/s. At 240/s the monthly 2M would last about 8,300 s of racing (roughly 90 races of 90 s). HANDOFF §6.3 assumed about 180/s and did not count the sender. Options for the design note: lower send rate plus interpolation, send only on change, drop to 2-3 real senders per room, or a paid plan. This needs the user's decision before N2.
10. Supabase now issues publishable keys (sb_publishable_...) instead of anon keys. The publishable key is stored in VITE_SUPABASE_ANON_KEY (name kept so the harness, CI and deploy secrets keep working). The secret key (sb_secret_...) and service_role are never used; the secrets smoke check fails if one appears.
11. The probe e2e runs with a short ?secs value (14 s) so smoke stays fast; the full 120 s run is what the user does at school.
12. smoke_checks/h0_no_secrets.mjs: the probe is the first page that bundles supabase-js, and the library ships the bare prefix as a string test (`e.startsWith("sb_secret_")`), so `/sb_secret_/` failed on a harmless constant. My first fix was a key-shaped pattern `sb_secret_[A-Za-z0-9_-]{16,}`; the code-reviewer showed that would let a bare or split prefix in src/ through, so I narrowed it: inside dist/ only, the exact idiom `startsWith("sb_secret_")` is removed before the unchanged `/sb_secret_/` test. Everything else (src/, any other string, a key, `service_role`, `SUPABASE_SERVICE`, role-JWT, `.env`-value checks) fails exactly as before. The requirement is unchanged. Proved red/green (see the H1 entry); verifier and code-reviewer both judged this a legitimate false-positive fix.
13. src/net/transport.js differs slightly from the signature in src/net/CLAUDE.md: `on`, `onPresence`, `onStatus` are registered before `join(topic, {id})` (supabase-js needs handlers before subscribe, and presence needs the id as key); `track` returns the supabase result ('ok' | 'timed out' | 'error'); one transport = one join. Not built in H1: `fakeTransport.js`, `messages.js` (with `v` and validators) and `supabase.js`. The probe is a standalone diagnostic whose ping/pong is validated inline in src/probe.js (own sequence numbers, each reply counted once, finite numbers). N1 builds the fake transport, messages.js and the reconnect state machine with unit tests, and the layout line in src/net/CLAUDE.md is still the intent.
14. The session did not register the `test-writer` and `code-reviewer` agent types (only verifier, product-reviewer and playtester). I wrote the red probe test myself, proved red (all 3 tests failed on the missing probe-status, since probe.html was not in the build) and ran the code review through a general-purpose agent told to follow .claude/agents/code-reviewer.md.
15. The "blocked WebSocket" e2e case uses Playwright routeWebSocket in real Chromium/WebKit to close the socket, so it shows the red path works. It is an extra, not proof of school Wi-Fi: only the user's school run is. The green path in all other tests is real Supabase.
16. Review items declined or deferred in H1 (reasons): (a) a fixed default room when `?room=` is missing, so laptop B types a shorter link: a taste call for the user, so no change; the plain steps give the explicit `?room=BKTR` link. (b) Passing the Supabase secrets to the smoke-check step of deploy.yml so the check can require the URL in the bundle: declined, because `smoke:live` runs the probe e2e against the deployed site and goes red if the build has no URL. (c) Still no e2e for a third laptop joining late or for one laptop never answering (documented: the page says "two laptops"; with 3 a ping counts as answered if any peer replies, so loss is lenient). The mid-run drop and the waiting-phase hiccup DO have permanent e2e tests now. (d) `?test=1` without `ns` joins the real probe topic, room codes accept vowels or odd upper-casing, `?secs=90` reads "2 minutes", the free-text check only matches a literal `<input`, and the .env read skips `KEY = value` lines: all harmless today, not changed. (e) `eventsPerSecond` is only a URL parameter in realtime-js (no client-side throttle): documented in transport.js; N2 must enforce 15 Hz in sync.js. (f) Errors during a run do not change the verdict by themselves (loss and silence decide); they are listed on the result line as "connection errors: N". (g) The 10 s reconnect grace while waiting mirrors src/net/CLAUDE.md rule 7. (h) Fixed from review: the mid-run `subscribed` guard, the pong de-duplication, try/catch around createClient/subscribe/track, auth timers off, awaited leave, visibility reporting, big room code, GREEN wording, result line size and placeholder, "screenshot both laptops" text, and the link built from origin + room.
17. GREEN means the live connection stayed open and replied in time, not that the game will feel smooth: the probe sends about 1 message per second, the real game needs about 15 Hz per runner (Decisions 8–9). The banner wording was changed from \"live play should work\" to \"the live connection worked\"; throughput is N2's question.
18. The deploy and ci runs print GitHub warnings that actions/checkout@v4, setup-node@v4, upload-pages-artifact@v3 and deploy-pages@v4 run on Node 20 and are forced onto Node 24. Harmless today (both runs succeed); revisit when bumping action majors. Not changed in H1 (workflows are untouched, and .github/CLAUDE.md pins v4).
