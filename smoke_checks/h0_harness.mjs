// The Stop gate must block until committed + pushed + logged for THIS stage + smoke-passed for THIS code.
// Runs against a temp repo, with its own git config so the user's global settings (gpg signing) cannot interfere.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codeFingerprint, saveJson, stopGate } from '../scripts/harness_common.mjs';
import { fail, pass } from './_util.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'gate-'));
const remote = join(tmp, 'remote.git');
const work = join(tmp, 'work');
const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: 'pipe' });

const progress = ({ last = 'X1', entryId = 'X1', smoke = 'PASS', review = 'verifier PASS', lines = true } = {}) =>
  `## Current status\n- **Last stage:** ${last}\n\n## Stage log\n### ${entryId} test\n- Smoke: ${smoke}\n${lines ? `- Shots: a\n- Live: n/a\n- Review: ${review}\n` : ''}`;

try {
  mkdirSync(remote);
  g(remote, 'init', '-q', '--bare');
  mkdirSync(work);
  g(work, 'init', '-q');
  g(work, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  g(work, 'config', 'user.email', 'a@b');
  g(work, 'config', 'user.name', 't');
  g(work, 'config', 'commit.gpgsign', 'false');
  g(work, 'remote', 'add', 'origin', remote);
  writeFileSync(join(work, '.gitignore'), '.smoke/\n');
  writeFileSync(join(work, 'a.js'), '1');
  writeFileSync(join(work, 'PROGRESS.md'), progress());

  const expectBlocked = (label, needle) => {
    const r = stopGate(work);
    if (r.ok || !r.reasons.some((x) => x.includes(needle))) throw new Error(`${label}: expected a block mentioning "${needle}", got ${JSON.stringify(r)}`);
  };
  const setProgress = (opts) => writeFileSync(join(work, 'PROGRESS.md'), progress(opts));

  expectBlocked('dirty tree', 'uncommitted');
  g(work, 'add', '-A');
  g(work, 'commit', '-qm', 'c1');
  expectBlocked('no upstream', 'upstream');
  g(work, 'push', '-q', '-u', 'origin', 'main');
  expectBlocked('no smoke', 'no full smoke');

  saveJson(work, '.smoke/last-run.json', { result: 'FAIL', code_fingerprint: codeFingerprint(work) });
  expectBlocked('failed smoke', 'FAIL');
  saveJson(work, '.smoke/last-run.json', { result: 'QUICK', code_fingerprint: codeFingerprint(work) });
  expectBlocked('quick smoke', 'QUICK');
  saveJson(work, '.smoke/last-run.json', { result: 'PASS', code_fingerprint: 'stale' });
  expectBlocked('stale fingerprint', 'code changed');

  saveJson(work, '.smoke/last-run.json', { result: 'PASS', code_fingerprint: codeFingerprint(work) });
  const ok = stopGate(work);
  if (!ok.ok) throw new Error(`should be open, got ${JSON.stringify(ok)}`);

  // PROGRESS.md is outside the fingerprint, so only the log rules can catch these; each is a real loophole.
  const logCase = (label, opts, needle) => {
    setProgress(opts);
    g(work, 'commit', '-qam', label);
    g(work, 'push', '-q');
    expectBlocked(label, needle);
  };
  logCase('stale entry from an older stage', { last: 'X2', entryId: 'X1' }, 'Last stage');
  logCase('smoke line says FAIL', { smoke: 'FAIL' }, 'must say PASS');
  logCase('review pending', { review: 'pending' }, 'pending');
  logCase('review empty', { review: '' }, 'empty');
  logCase('missing lines', { lines: false }, 'lacks');
  logCase('last stage none', { last: 'none' }, 'not set');

  setProgress();
  g(work, 'commit', '-qam', 'restore');
  g(work, 'push', '-q');
  if (!stopGate(work).ok) throw new Error('should reopen once the log is correct');

  pass('stop gate blocks on dirty/unpushed/no-smoke/fail/quick/stale-code/stale-entry/bad-smoke-line/pending-review/missing-lines, opens when all true');
} catch (e) {
  fail(e.message);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
