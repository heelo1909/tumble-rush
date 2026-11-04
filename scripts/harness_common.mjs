// Shared harness helpers. PROTECTED: see scripts/CLAUDE.md.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentStatus, latestLogEntry } from './progress_view.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function git(args, root = ROOT) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const FINGERPRINT_SKIP = [/^\.smoke\//, /^PROGRESS\.md$/, /^STATUS\.md$/];

/** Hash of every non-ignored file (tracked or new) outside .smoke/, PROGRESS.md, STATUS.md. */
export function codeFingerprint(root = ROOT) {
  const files = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'], root)
    .split('\0').filter(Boolean)
    .filter((f) => !FINGERPRINT_SKIP.some((re) => re.test(f)))
    .filter((f) => existsSync(join(root, f)))
    .sort();
  const h = createHash('sha256');
  for (const f of files) {
    h.update(f + '\0');
    h.update(readFileSync(join(root, f)));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 16);
}

export function loadLastRun(root = ROOT) {
  try {
    return JSON.parse(readFileSync(join(root, '.smoke', 'last-run.json'), 'utf8'));
  } catch {
    return null;
  }
}

export function saveJson(root, rel, data) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(data, null, 2));
}

// Matched against the lower-cased, forward-slash path (NTFS and macOS are case-insensitive).
const PROTECTED = [
  /^\.claude\//,
  /^scripts\/smoke\.mjs$/,
  /^scripts\/progress_view\.mjs$/,
  /^scripts\/harness_common\.mjs$/,
  /^playwright\.config\.js$/,
  // the layer rule and the test runner config decide what "green" means, so they are harness too
  /^eslint\.config\.js$/,
  /^vitest\.config\.js$/,
  /^smoke_checks\/_util\.mjs$/,
];

// The same paths as plain text, for scanning shell commands.
const PROTECTED_TEXT = [
  '.claude/',
  'scripts/smoke.mjs',
  'scripts/progress_view.mjs',
  'scripts/harness_common.mjs',
  'playwright.config.js',
  'eslint.config.js',
  'vitest.config.js',
  'smoke_checks/_util.mjs',
];

export function repoRelative(abs, root = ROOT) {
  const rel = relative(root, resolve(root, abs));
  return rel.split(sep).join('/');
}

export function isProtected(relPath) {
  const p = relPath.split(sep).join('/').replace(/^\.\//, '').toLowerCase();
  return PROTECTED.some((re) => re.test(p));
}

// words that write, delete, move or overwrite; `>` counts unless it is a stream redirect like 2>&1
const WRITE_WORDS = /((?<![0-9&])>(?!&)|\bsed\s+-i|\bperl\s+-i|\brm\b|\bmv\b|\bcp\b|\btee\b|\btruncate\b|set-content|out-file|add-content|remove-item|move-item|copy-item|rename-item|writefilesync|writefile|\bgit\s+(checkout|restore|apply|stash)\b)/i;

/** Heuristic: does a Bash/PowerShell command text write to a protected path? */
export function commandTouchesProtected(command) {
  const text = String(command).replace(/\\/g, '/').replace(/\/dev\/null/g, '').toLowerCase();
  if (!WRITE_WORDS.test(text)) return false;
  return PROTECTED_TEXT.some((s) => text.includes(s));
}

/**
 * Stop gate: may the session stop? Returns { ok, reasons[] }.
 * Needs: clean + pushed tree; the newest PROGRESS entry is for the stage named in "Last stage",
 * says Smoke: PASS and has Shots/Live/Review lines (Review not pending);
 * and a full smoke PASS whose fingerprint matches the current code.
 */
export function stopGate(root = ROOT) {
  const reasons = [];
  try {
    if (git(['status', '--porcelain'], root).trim()) reasons.push('uncommitted changes: commit them');
    let ahead = '';
    try {
      ahead = git(['rev-list', '@{u}..HEAD', '--count'], root).trim();
    } catch {
      reasons.push('branch has no upstream: push it');
    }
    if (ahead && ahead !== '0') reasons.push(`${ahead} commit(s) not pushed: push them`);
  } catch (e) {
    reasons.push(`git failed: ${String(e.message).split('\n')[0]}`);
  }

  const progressPath = join(root, 'PROGRESS.md');
  const md = existsSync(progressPath) ? readFileSync(progressPath, 'utf8') : '';
  const entry = latestLogEntry(md);
  if (!entry) {
    reasons.push('PROGRESS.md has no stage-log entry');
  } else {
    const last = (currentStatus(md)['Last stage'] || '').trim().toLowerCase();
    const entryId = (entry.match(/^###\s+(\S+)/)?.[1] || '').toLowerCase();
    if (!last || last === 'none') reasons.push('PROGRESS "Last stage" is not set');
    else if (entryId !== last) reasons.push(`newest log entry is "${entryId}" but Last stage is "${last}": add this stage's entry`);
    for (const key of ['Smoke', 'Shots', 'Live', 'Review']) {
      if (!new RegExp(`^- ${key}:`, 'm').test(entry)) reasons.push(`latest PROGRESS entry lacks a "${key}:" line`);
    }
    if (/^- Smoke:/m.test(entry) && !/^- Smoke:\s*PASS/m.test(entry)) reasons.push('the Smoke line must say PASS');
    const review = entry.match(/^- Review:\s*(.*)$/m);
    if (review && (!review[1].trim() || /pending/i.test(review[1]))) reasons.push('the Review line is empty or still pending');
  }

  const last = loadLastRun(root);
  if (!last) reasons.push('no full smoke run yet: npm run smoke');
  else if (last.result !== 'PASS') reasons.push(`last smoke result is ${last.result}: npm run smoke must say SMOKE: PASS`);
  else {
    try {
      if (last.code_fingerprint !== codeFingerprint(root)) reasons.push('code changed since the last smoke: run npm run smoke again');
    } catch {
      reasons.push('could not fingerprint the code');
    }
  }
  return { ok: reasons.length === 0, reasons };
}
