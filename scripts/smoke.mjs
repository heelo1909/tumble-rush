// npm run smoke. PROTECTED: see scripts/CLAUDE.md.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, codeFingerprint, saveJson } from './harness_common.mjs';
import { nextStage, stages } from './progress_view.mjs';

const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const LIVE = args.includes('--live');

const md = readFileSync(join(ROOT, 'PROGRESS.md'), 'utf8');
const next = nextStage(md);
const STAGE = (next ? next.id : 'done').toLowerCase();
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
mkdirSync(join(ROOT, '.smoke'), { recursive: true });

const steps = [];
const annotations = [];
// Fingerprint the code BEFORE running anything: edits made while smoke runs must not be blessed.
const FINGERPRINT_AT_START = codeFingerprint();

function run(name, cmd, { timeout = 600000, env = {} } = {}) {
  const t0 = Date.now();
  const r = spawnSync(cmd, { cwd: ROOT, shell: true, encoding: 'utf8', timeout, env: { ...process.env, ...env } });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
  const ok = r.status === 0;
  const lines = out.split(/\r?\n/).filter(Boolean);
  const summary = (lines.at(-1) || (ok ? 'ok' : 'no output')).slice(0, 160);
  steps.push({ name, ok, ms: Date.now() - t0, summary });
  if (!ok) console.error(`\n--- ${name} FAILED ---\n${lines.slice(-25).join('\n')}\n`);
  return ok;
}

function envCheck() {
  const t0 = Date.now();
  const problems = [];
  if (Number(process.versions.node.split('.')[0]) < 20) problems.push('Node >= 20 required');
  if (!existsSync(join(ROOT, 'node_modules'))) problems.push('run npm ci');
  const probe = "const p=require('@playwright/test');const fs=require('fs');process.exit(fs.existsSync(p.chromium.executablePath())&&fs.existsSync(p.webkit.executablePath())?0:1)";
  const pw = spawnSync(process.execPath, ['-e', probe], { cwd: ROOT });
  if (pw.status !== 0) problems.push('Playwright browsers missing: npx playwright install chromium webkit');
  const h0Done = stages(md).find((s) => s.id === 'H0')?.done;
  if (h0Done) {
    const env = existsSync(join(ROOT, '.env')) ? readFileSync(join(ROOT, '.env'), 'utf8') : '';
    for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
      if (!new RegExp(`^${k}=\\S+`, 'm').test(env)) problems.push(`.env lacks ${k}: do H1 setup`);
    }
  }
  steps.push({ name: 'environment', ok: problems.length === 0, ms: Date.now() - t0, summary: problems.join('; ') || 'ok' });
  return problems.length === 0;
}

function smokeChecks() {
  const files = readdirSync(join(ROOT, 'smoke_checks')).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
  let allOk = true;
  if (files.length === 0) {
    steps.push({ name: 'smoke_checks', ok: false, ms: 0, summary: 'no smoke checks found: every stage needs one' });
    return false;
  }
  for (const f of files) {
    const ok = run(`check ${f}`, `node smoke_checks/${f}`, { timeout: 60000 });
    allOk = allOk && ok;
  }
  return allOk;
}

function e2e() {
  const env = { STAGE: STAGE.replace(/[^a-z0-9_-]/g, '') };
  if (LIVE) env.BASE_URL = pkg.homepage;
  const ok = run('e2e (chromium+webkit)', 'npx playwright test', { env, timeout: 900000 });
  try {
    const rep = JSON.parse(readFileSync(join(ROOT, '.smoke', 'e2e-report.json'), 'utf8'));
    const s = rep.stats || {};
    const last = steps.at(-1);
    last.summary = `${s.expected ?? 0} passed, ${s.unexpected ?? 0} failed, ${s.flaky ?? 0} flaky, ${s.skipped ?? 0} skipped`;
    if ((s.skipped ?? 0) > 0) {
      last.ok = false;
      last.summary += ' (skips are not allowed)';
    }
    const walk = (suite) => {
      for (const sp of suite.specs || []) {
        for (const t of sp.tests || []) {
          for (const a of t.annotations || []) annotations.push(`${sp.title} [${t.projectName}] ${a.type}: ${a.description ?? ''}`);
        }
      }
      for (const c of suite.suites || []) walk(c);
    };
    for (const top of rep.suites || []) walk(top);
    return last.ok;
  } catch {
    return ok;
  }
}

if (LIVE) {
  e2e();
} else if (envCheck()) {
  // every step runs even after a failure so the report is complete
  run('eslint', 'npx eslint .', { timeout: 120000 });
  run('vitest', 'npx vitest run', { timeout: 300000 });
  run('vite build', 'npx vite build', { timeout: 300000 });
  smokeChecks();
  if (!QUICK) e2e();
}

if (!LIVE && codeFingerprint() !== FINGERPRINT_AT_START) {
  steps.push({ name: 'code-stable', ok: false, ms: 0, summary: 'files changed while smoke was running: rerun it' });
}
const allOk = steps.every((s) => s.ok);
const final = LIVE ? (allOk ? 'LIVE-PASS' : 'LIVE-FAIL') : !allOk ? 'FAIL' : QUICK ? 'QUICK' : 'PASS';
const report = { result: final, finished_at: new Date().toISOString(), code_fingerprint: FINGERPRINT_AT_START, stage: STAGE, steps, annotations };
saveJson(ROOT, LIVE ? '.smoke/last-live.json' : '.smoke/last-run.json', report);

const esc = (s) => s.replace(/\|/g, '/');
if (!LIVE) {
  const rows = steps.map((s) => `| ${s.name} | ${s.ok ? 'PASS' : 'FAIL'} | ${(s.ms / 1000).toFixed(1)}s | ${esc(s.summary)} |`).join('\n');
  const meas = annotations.length ? annotations.map((a) => `- ${a}`).join('\n') : '- none';
  writeFileSync(join(ROOT, 'STATUS.md'), `# STATUS (generated by npm run smoke, do not edit)\n\n- Result: **${final}**\n- Finished: ${report.finished_at}\n- Stage: ${STAGE}\n- Code fingerprint: ${report.code_fingerprint}\n\n| Step | Result | Time | Summary |\n|---|---|---|---|\n${rows}\n\n## Measurements\n${meas}\n`);
}

console.log('\n| Step | Result | Time | Summary |');
for (const s of steps) console.log(`| ${s.name} | ${s.ok ? 'PASS' : 'FAIL'} | ${(s.ms / 1000).toFixed(1)}s | ${s.summary} |`);
console.log(LIVE ? `LIVE: ${allOk ? 'PASS' : 'FAIL'}` : QUICK && allOk ? 'SMOKE: QUICK (not valid for the gate)' : `SMOKE: ${final}`);
process.exit(allOk ? 0 : 1);
