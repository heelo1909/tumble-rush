# .claude (protected harness)
H0 adds `settings.json` and `hooks/` (session_start.mjs, protect_harness.mjs, lint_on_edit.mjs, stage_gate.mjs), ported from
WardenMac 2's Python hooks to Node, with the same behavior: SessionStart prints the time and the next stage;
PreToolUse blocks edits to protected paths (see scripts/CLAUDE.md); PostToolUse
(Edit|Write) runs `eslint` on just that file and feeds errors back (non-blocking, < 3 s); Stop blocks stopping unless the work is
committed and pushed, PROGRESS has Smoke/Shots/Live/Review lines, and the last full smoke PASSED for the current
code (3 blocks in a row → let it stop, loudly).
Not created yet on purpose: settings.json pointing at hooks that don't exist would error on every prompt.
