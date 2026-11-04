// PostToolUse (Edit|Write|MultiEdit): run eslint on the file just edited and feed errors back.
// Only real lint failures (exit 1) block; a timeout or a crash never does.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from '../../scripts/harness_common.mjs';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
try {
  const file = JSON.parse(raw).tool_input?.file_path;
  if (file && /\.(js|mjs)$/.test(file)) {
    // run eslint's own entry point with node: no shell, so the path needs no quoting
    const bin = join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js');
    const r = spawnSync(process.execPath, [bin, '--no-warn-ignored', file], { cwd: ROOT, encoding: 'utf8', timeout: 20000 });
    if (r.status === 1) {
      console.error(`ESLint problems in ${file}:\n${(r.stdout || '') + (r.stderr || '')}`.slice(0, 3000));
      process.exit(2);
    }
  }
} catch {
  // never block on a hook bug
}
