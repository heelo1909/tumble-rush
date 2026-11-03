---
description: Do the next stage (same as "continue")
---
Run the next stage exactly as CLAUDE.md says: `date`; Current status; PRINCIPLES; HANDOFF §0–1 and the stage
entry with its links; the CLAUDE.md of every folder you'll touch. $ARGUMENTS
[design] without an approved note → write/finish the note, log PARTIAL ("waiting for design approval"), stop.
(needs the user) → prep, hand back plain steps, stop.
Otherwise: red tests (test-writer for anything non-trivial) → code → permanent smoke check (proved red) →
`npm run smoke` until PASS → look at screenshots → review panel in parallel (verifier + code-reviewer, + product-reviewer
if player-visible); fix BLOCKERs, re-run only the blockers (max 2 rounds) → deploy + `smoke:live` if applicable →
PROGRESS + HANDOFF ticks → commit `<id>: <what> (<ref>)`, push → hand back in ≤ 8 lines.
