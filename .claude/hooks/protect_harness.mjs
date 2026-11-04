// PreToolUse (Edit|Write|MultiEdit|Bash|PowerShell): block writes to the protected harness. Exit 2 = block.
import { commandTouchesProtected, isProtected, repoRelative } from '../../scripts/harness_common.mjs';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
try {
  const input = JSON.parse(raw);
  const file = input.tool_input?.file_path;
  if (file && isProtected(repoRelative(file))) {
    console.error(`BLOCKED: ${repoRelative(file)} is part of the protected harness. Do not edit it. Tell the user what needs to change and why.`);
    process.exit(2);
  }
  const command = input.tool_input?.command;
  if (command && commandTouchesProtected(command)) {
    console.error('BLOCKED: this command looks like it writes to the protected harness (.claude/, scripts/{smoke,progress_view,harness_common}.mjs, playwright/eslint/vitest config). Tell the user what needs to change and why.');
    process.exit(2);
  }
} catch {
  // unreadable input: never block on a hook bug
}
