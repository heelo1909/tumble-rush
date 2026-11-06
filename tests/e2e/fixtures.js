import { test as base, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const STAGE = process.env.STAGE || 'adhoc';
const runId = Date.now().toString(36);

export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
    });
    await use(page);
    expect(errors, 'no pageerror / console.error allowed').toEqual([]);
  },
});
export { expect };

export async function gamePage(page, { seed = 1, scene } = {}) {
  const extra = scene ? `&scene=${scene}` : '';
  await page.goto(`./?test=1&ns=test-${runId}-&seed=${seed}${extra}`);
  await page.waitForFunction(() => window.__TR && window.__TR.state().scene !== 'boot');
  return page;
}

export async function shot(page, name, testInfo) {
  const dir = `.smoke/shots/${STAGE}`;
  mkdirSync(dir, { recursive: true });
  const spec = testInfo.file.split(/[\\/]/).pop().replace(/\.spec\.js$/, '');
  await page.screenshot({ path: `${dir}/${spec}-${name}-${testInfo.project.name}.png` });
}

export async function waitForState(page, predicate, timeout = 10000) {
  await page.waitForFunction(`(${predicate.toString()})(window.__TR.state())`, null, { timeout });
}

/** A fresh namespace + random consonant room code per test, so test traffic never lands in a real room. */
export function testRoom() {
  const letters = 'BCDFGHJKLMNPQRSTVWXZ';
  let code = '';
  for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
  return { ns: `test-${runId}-${Date.now().toString(36)}-`, code };
}

/**
 * n separate browser contexts (separate players, each with its own storage like a separate laptop).
 * Every page fails the test on pageerror / console.error: call assertNoErrors() before closeAll().
 */
export async function openPlayers(browser, n) {
  const contexts = [];
  const pages = [];
  const errors = [];
  for (let i = 0; i < n; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const who = String.fromCharCode(97 + i);
    page.on('pageerror', (e) => errors.push(`${who} pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`${who} console.error: ${m.text()}`);
    });
    contexts.push(context);
    pages.push(page);
  }
  return {
    pages,
    assertNoErrors: () => expect(errors, 'no pageerror / console.error allowed in any window').toEqual([]),
    closeAll: () => Promise.all(contexts.map((c) => c.close())),
  };
}

/** Open the connection probe (probe.html) in test mode. */
export async function probePage(page, { ns, room, secs = 14, test = true } = {}) {
  const q = new URLSearchParams();
  if (test) q.set('test', '1');
  if (ns) q.set('ns', ns);
  if (room) q.set('room', room);
  q.set('secs', String(secs));
  await page.goto(`./probe.html?${q.toString()}`);
  return page;
}
