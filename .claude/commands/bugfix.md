---
description: Fix a bug the user reported (evidence first, red test, fix, real proof)
---
Bug: $ARGUMENTS
0. Next free number → `docs/bugs/BUG-NNN-<name>.md` with the user's exact words; add stage `B-NNN` to HANDOFF §10 and PROGRESS.
1. Evidence before any fix: reproduce it in a real browser (e2e or the playtester), console logs, `__TR.events()`.
   Write what the evidence shows in the bug file. Can't reproduce → say so; don't fix a guess.
2. Red regression test (unit and/or e2e). 3. Smallest fix that removes the cause. 4. Smoke check
   `b_NNN_<name>.mjs`, `npm run smoke` → PASS, look at screenshots. 5. Review panel (verifier + code-reviewer; + product-reviewer if players saw the bug).
6. Root cause under Decisions. If it only happened at school/with friends, add it to "Live tests needed";
   it's not "fixed" until the user confirms. Commit, push, hand back.
