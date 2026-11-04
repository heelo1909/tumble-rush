import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { codeFingerprint } from '../../../scripts/harness_common.mjs';

let dir;
const g = (...a) => execFileSync('git', a, { cwd: dir });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fp-'));
  g('init', '-q');
  writeFileSync(join(dir, 'a.js'), 'one');
  writeFileSync(join(dir, 'PROGRESS.md'), 'p');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('codeFingerprint', () => {
  it('ignores PROGRESS.md, STATUS.md and .smoke/', () => {
    const before = codeFingerprint(dir);
    writeFileSync(join(dir, 'PROGRESS.md'), 'changed');
    writeFileSync(join(dir, 'STATUS.md'), 'new');
    mkdirSync(join(dir, '.smoke'));
    writeFileSync(join(dir, '.smoke', 'x.json'), '{}');
    expect(codeFingerprint(dir)).toBe(before);
  });
  it('changes when code changes, including untracked files', () => {
    const before = codeFingerprint(dir);
    writeFileSync(join(dir, 'a.js'), 'two');
    const mid = codeFingerprint(dir);
    expect(mid).not.toBe(before);
    writeFileSync(join(dir, 'b.js'), 'new');
    expect(codeFingerprint(dir)).not.toBe(mid);
  });
  it('is unchanged by committing', () => {
    const before = codeFingerprint(dir);
    g('add', '-A');
    g('-c', 'user.email=a@b', '-c', 'user.name=t', 'commit', '-qm', 'x');
    expect(codeFingerprint(dir)).toBe(before);
  });
});
