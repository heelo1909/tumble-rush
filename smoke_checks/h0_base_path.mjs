// dist/index.html asset URLs must start with the repo base, not "/".
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fail, pass, read } from './_util.mjs';

if (!existsSync(join(ROOT, 'dist', 'index.html'))) fail('dist/index.html missing (build first)');
const html = read('dist/index.html');
const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|data:|#)/.test(u));
const bad = urls.filter((u) => !u.startsWith('/tumble-rush/'));
if (urls.length === 0) fail('no asset URLs found in dist/index.html');
if (bad.length) fail(`asset URLs not under /tumble-rush/: ${bad.join(', ')}`);
pass(`${urls.length} asset URL(s) all under /tumble-rush/`);
