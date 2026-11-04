// No service-role keys, secret keys or .env content in src/, dist/ or any tracked/unignored file.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fail, pass, read, trackedFiles, walk } from './_util.mjs';

const BAD = [/service_role/i, /sb_secret_/, /SUPABASE_SERVICE/i];

// A Supabase service-role key is a JWT whose payload says role=service_role (base64, so the word is hidden).
function hasServiceRoleJwt(text) {
  for (const m of text.matchAll(/eyJ[\w-]+\.(eyJ[\w-]+)\.[\w-]+/g)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
      if (payload.role && payload.role !== 'anon') return true;
    } catch {
      // not a JWT payload
    }
  }
  return false;
}

const files = [...new Set([...trackedFiles(), ...walk('dist')])]
  .filter((f) => !/^(node_modules|\.git|\.smoke)\//.test(f))
  // docs and this folder's own checks legitimately mention the words
  .filter((f) => !/\.md$/.test(f) && !f.startsWith('smoke_checks/') && f !== 'package-lock.json');

const hits = [];
for (const f of files) {
  if (/\.(png|jpg|jpeg|gif|webp|woff2?|ttf|ico)$/.test(f)) continue;
  const text = read(f);
  if (BAD.some((re) => re.test(text)) || hasServiceRoleJwt(text)) hits.push(f);
}
if (files.includes('.env')) hits.push('.env is tracked or not ignored');

// dist/ may only ever contain the PUBLIC anon key; any other value from .env must not appear there
if (existsSync(join(ROOT, '.env'))) {
  for (const line of read('.env').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (!m || m[1] === 'VITE_SUPABASE_URL' || m[1] === 'VITE_SUPABASE_ANON_KEY' || m[2].length < 12) continue;
    for (const f of walk('dist')) if (read(f).includes(m[2])) hits.push(`${f} contains the value of ${m[1]}`);
  }
}

if (hits.length) fail(`secret-like content in: ${hits.join(', ')}`);
pass(`${files.length} files scanned, no secrets`);
