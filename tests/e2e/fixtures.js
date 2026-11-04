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

export async function gamePage(page, { seed = 1 } = {}) {
  await page.goto(`./?test=1&ns=test-${runId}-&seed=${seed}`);
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
