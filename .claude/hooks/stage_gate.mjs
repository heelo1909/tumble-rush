// Stop: block stopping unless committed, pushed, PROGRESS entry complete, and the last full smoke PASSED
// for the current code. After 3 blocks in a row within one session, let it stop (loudly).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, stopGate } from '../../scripts/harness_common.mjs';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;

const counterFile = join(ROOT, '.smoke', 'stop_blocks.json');
const readCount = (session) => {
  try {
    const c = JSON.parse(readFileSync(counterFile, 'utf8'));
    return c.session === session ? c.count || 0 : 0; // a new session starts at zero
  } catch {
    return 0;
  }
};
const writeCount = (session, count) => {
  mkdirSync(join(ROOT, '.smoke'), { recursive: true });
  writeFileSync(counterFile, JSON.stringify({ session, count }));
};

try {
  const session = String(JSON.parse(raw || '{}').session_id || 'unknown');
  const gate = stopGate(ROOT);
  if (gate.ok) {
    writeCount(session, 0);
    process.exit(0);
  }
  const count = readCount(session) + 1;
  if (count >= 3) {
    writeCount(session, 0);
    console.error(`STOP GATE RELEASED after 3 blocks, but NOT satisfied:\n- ${gate.reasons.join('\n- ')}\nTell the user plainly that this stage is not closed.`);
    process.exit(0);
  }
  writeCount(session, count);
  console.error(`STOP GATE (block ${count}/3): the stage is not closed:\n- ${gate.reasons.join('\n- ')}`);
  process.exit(2);
} catch (e) {
  console.error(`stage_gate hook error (not blocking): ${e.message}`);
}
