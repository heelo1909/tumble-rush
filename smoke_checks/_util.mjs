// Shared helpers for smoke checks. Not itself a check (smoke skips files starting with _).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function pass(msg) {
  console.log(`PASS ${msg}`);
  process.exit(0);
}

export function fail(msg) {
  console.log(`FAIL ${msg}`);
  process.exit(1);
}

export function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

export function walk(rel) {
  const out = [];
  const dir = join(ROOT, rel);
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(relative(ROOT, p)));
    else out.push(relative(ROOT, p).split('\\').join('/'));
  }
  return out;
}

export function trackedFiles() {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean).filter((f) => existsSync(join(ROOT, f)));
}
