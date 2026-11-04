// Parses PROGRESS.md. PROTECTED: see scripts/CLAUDE.md.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function section(md, heading) {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start < 0) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start + 1, end).join('\n');
}

/** { 'Next stage': 'H0 — ...', ... } from the "Current status" bullets. */
export function currentStatus(md) {
  const out = {};
  for (const m of section(md, 'Current status').matchAll(/^- \*\*(.+?):\*\*\s*(.*)$/gm)) out[m[1]] = m[2].trim();
  return out;
}

/** [{ id, title, done }] from the "Stages" checklist. */
export function stages(md) {
  return [...section(md, 'Stages').matchAll(/^- \[( |x|X)\]\s+(\S+)\s+[—-]\s+(.*)$/gm)]
    .map((m) => ({ id: m[2], title: m[3].trim(), done: m[1] !== ' ' }));
}

export function nextStage(md) {
  return stages(md).find((s) => !s.done) || null;
}

/** Text of the newest stage-log entry (skips the Template), or null. */
export function latestLogEntry(md) {
  const parts = section(md, 'Stage log').split(/^### /m).slice(1);
  const real = parts.find((p) => !p.startsWith('Template'));
  return real ? `### ${real}` : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const md = readFileSync(join(ROOT, 'PROGRESS.md'), 'utf8');
  const next = nextStage(md);
  const all = stages(md);
  console.log(`Next stage: ${next ? `${next.id} — ${next.title}` : 'none (all done)'}`);
  console.log(`Done: ${all.filter((s) => s.done).length}/${all.length}`);
  const st = currentStatus(md);
  for (const k of Object.keys(st)) console.log(`${k}: ${st[k]}`);
}
