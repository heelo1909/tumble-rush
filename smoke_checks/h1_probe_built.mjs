// H1: the school-Wi-Fi probe ships as its own page in the build, uses the pure verdict rules, and has no text
// input (no free text from kids, HANDOFF §1). This check is STRUCTURAL: it proves the page and its UI exist in
// dist/. That ping/pong, presence and the verdict really work is proved by tests/e2e/probe.spec.js.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, fail, pass, read } from './_util.mjs';

const dist = (rel) => join(ROOT, 'dist', rel);
if (!existsSync(dist('probe.html'))) fail('dist/probe.html missing: probe.html is not in vite rollupOptions.input');

const html = read('dist/probe.html');
// every file the page loads: its module script AND the chunks it preloads (a shared chunk would hide from <script> only)
const urls = [
  ...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g),
  ...html.matchAll(/<link[^>]*\srel="modulepreload"[^>]*\shref="([^"]+)"/g),
  ...html.matchAll(/<link[^>]*\shref="([^"]+)"[^>]*\srel="modulepreload"/g),
].map((m) => m[1]);
if (urls.length === 0) fail('dist/probe.html loads no script');
const bad = urls.filter((u) => !u.startsWith('/tumble-rush/'));
if (bad.length) fail(`probe asset URLs not under /tumble-rush/: ${bad.join(', ')}`);

let bundle = '';
for (const u of new Set(urls)) {
  const file = dist(u.replace('/tumble-rush/', ''));
  if (!existsSync(file)) fail(`probe asset ${u} is not in dist/`);
  bundle += readFileSync(file, 'utf8');
}
const everything = html + bundle;

for (const needle of [
  'probe-status',
  'Waiting for the other laptop',
  'the live connection worked',
  'could not connect',
  'may be blocking it',
  'BOTH laptops',
]) {
  if (!everything.includes(needle)) fail(`probe page never mentions "${needle}"`);
}
if (/<input\b/i.test(everything)) fail('probe has an <input>: no free text allowed (HANDOFF §1)');
// the game engine's own banner string ("phaser.io") must not be anywhere the probe loads
if (/phaser\.io/i.test(everything)) fail('the probe page loads the game engine (Phaser): it must stay a light, separate page');

// When a local .env exists, the Supabase URL must have been baked into the probe build (never printed).
const envPath = join(ROOT, '.env');
if (existsSync(envPath)) {
  const m = readFileSync(envPath, 'utf8').match(/^VITE_SUPABASE_URL=["']?([^\s"']+)/m);
  if (m && !bundle.includes(m[1])) fail('probe bundle was built without the Supabase URL from .env');
}

// The verdict rules themselves (pure logic): a healthy run is green, silence is red.
const { summarize, PING_MS } = await import(pathToFileURL(join(ROOT, 'src/logic/probe.js')).href);
const recvTimes = Array.from({ length: 10 }, (_, i) => (i + 1) * PING_MS + 40);
const healthy = summarize({ sentCount: 10, rtts: recvTimes.map(() => 40), recvTimes, startAt: 0, endAt: 10 * PING_MS });
const dead = summarize({ sentCount: 10, rtts: [], recvTimes: [], startAt: 0, endAt: 10 * PING_MS });
if (healthy.verdict !== 'green') fail(`healthy run judged ${healthy.verdict}: ${healthy.reasons.join('; ')}`);
if (dead.verdict !== 'red') fail('a run with no replies was not judged red');

pass(`probe.html built (${new Set(urls).size} file(s), ${bundle.length} bytes), no input, no Phaser, verdicts green/red correct`);
