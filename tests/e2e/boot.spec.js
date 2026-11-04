import { test, expect, gamePage, shot } from './fixtures.js';

test('game boots to a rendered canvas with the test API', async ({ page }, testInfo) => {
  await gamePage(page);
  await expect(page.locator('canvas')).toBeVisible();
  const st = await page.evaluate(() => window.__TR.state());
  expect(st.scene).toBe('hello');
  expect(st.seats).toEqual([]);
  await shot(page, 'start', testInfo);
  await page.waitForTimeout(800);
  // A WebGL canvas can't be read back with drawImage, so judge the real screenshot instead:
  // a blank or single-colour canvas compresses to a few KB, the title scene is far larger.
  const png = await page.locator('canvas').screenshot();
  expect(png.length, 'canvas screenshot looks blank').toBeGreaterThan(20000);
  await shot(page, 'end', testInfo);
  testInfo.annotations.push({ type: 'canvas-png-bytes', description: String(png.length) });
});

test('window.__TR is absent without ?test=1', async ({ page }) => {
  await page.goto('./');
  await page.waitForSelector('canvas');
  expect(await page.evaluate(() => typeof window.__TR)).toBe('undefined');
});
