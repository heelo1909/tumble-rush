import { describe, it, expect } from 'vitest';
import { commandTouchesProtected, isProtected } from '../../../scripts/harness_common.mjs';

describe('isProtected is case-insensitive and covers the lint/test config', () => {
  it.each(['Scripts/Smoke.mjs', '.CLAUDE/Settings.json', 'PLAYWRIGHT.config.js', 'eslint.config.js', 'vitest.config.js', 'smoke_checks/_util.mjs'])('protects %s', (p) => {
    expect(isProtected(p)).toBe(true);
  });
  it.each(['src/main.js', 'smoke_checks/h0_base_path.mjs', 'package.json', 'vite.config.js'])('allows %s', (p) => {
    expect(isProtected(p)).toBe(false);
  });
});

describe('commandTouchesProtected', () => {
  it.each([
    'sed -i s/a/b/ scripts/smoke.mjs',
    'echo x > .claude/settings.json',
    'rm eslint.config.js',
    'git checkout -- scripts/harness_common.mjs',
    'Set-Content -Path scripts\\smoke.mjs -Value x',
    'cp /tmp/x playwright.config.js',
    'node -e "fs.writeFileSync(\'.claude/hooks/a.mjs\',\'\')"',
  ])('blocks: %s', (cmd) => expect(commandTouchesProtected(cmd)).toBe(true));

  it.each([
    'node scripts/smoke.mjs --quick',
    'cat scripts/smoke.mjs',
    'ls .claude/hooks',
    'npx eslint eslint.config.js 2>&1 | tail',
    'git status',
    'rm src/leak.js',
    'cat .claude/settings.json 2>/dev/null',
  ])('allows: %s', (cmd) => expect(commandTouchesProtected(cmd)).toBe(false));
});
