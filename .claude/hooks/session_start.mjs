// SessionStart: print the time, the next stage, and whether the last smoke matches the code.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, codeFingerprint, loadLastRun } from '../../scripts/harness_common.mjs';
import { nextStage } from '../../scripts/progress_view.mjs';

const lines = [`Now: ${new Date().toString()}`];
try {
  const next = nextStage(readFileSync(join(ROOT, 'PROGRESS.md'), 'utf8'));
  lines.push(`Next stage: ${next ? `${next.id} — ${next.title}` : 'none, all stages done'}`);
  const last = loadLastRun();
  if (!last) lines.push('Smoke: never run');
  else {
    const same = last.code_fingerprint === codeFingerprint();
    lines.push(`Smoke: ${last.result} at ${last.finished_at} (${same ? 'matches current code' : 'CODE CHANGED since then'})`);
  }
} catch (e) {
  lines.push(`(session_start hook error: ${e.message})`);
}
console.log(lines.join('\n'));
