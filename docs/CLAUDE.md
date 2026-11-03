# docs: design notes and bug reports

## docs/design/ ([design] stages: N1, N2, and any new subsystem)
One page from `TEMPLATE.md`:
`Status: draft | approved` · Requirement (HANDOFF §) · Approach · Messages/data shapes ·
What's tested with fakes vs. what only real browsers/networks can prove · Numbers to measure ·
Risks · Alternatives considered.
Write it, set `draft`, log a Decision, and stop. **Only the user changes it to `approved`.** Claude never does.

## docs/bugs/
`BUG-NNN-<short-name>.md` from `TEMPLATE.md`:
User's exact words · When/where (school Wi-Fi? which browser? how many players?) · Evidence (screenshot,
console log, `__TR.events()` dump, a failing test) · Root cause · Fix (stage `B-NNN`) ·
"Confirmed live?" yes/no.
Rule: **evidence before a fix.** If it only happens with friends at school, say so, and add it to
"Live tests needed" in PROGRESS.md. Never call it fixed because tests at home pass.
