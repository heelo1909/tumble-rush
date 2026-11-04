// Every file in public/assets/ (besides docs) must be listed in ASSETS.md.
import { ROOT, fail, pass, read, walk } from './_util.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

if (!existsSync(join(ROOT, 'public/assets/ASSETS.md'))) fail('public/assets/ASSETS.md missing');
const log = read('public/assets/ASSETS.md');
const assets = walk('public/assets').filter((f) => !/(^|\/)(ASSETS|CLAUDE)\.md$/.test(f));
const missing = assets.filter((f) => !log.includes(f.replace('public/assets/', '')));
if (missing.length) fail(`not logged in ASSETS.md: ${missing.join(', ')}`);
pass(`${assets.length} asset file(s), all logged`);
