import { test, expect, openPlayers, probePage, shot, testRoom } from './fixtures.js';

// H1 (HANDOFF §10 H1, §6.3): the school-Wi-Fi probe, run against the real built site and real Supabase.
// The user's 2-minute run at school is the same page without ?secs=.
const SECS = 14;
const FINISH_MS = SECS * 1000 + 8000; // the run itself + the 2.5 s wait for the last replies + margin

test('two laptops reach GREEN: both see each other, pings come back, verdict is shown', async ({ browser }, testInfo) => {
  const { ns, code } = testRoom();
  const { pages, assertNoErrors, closeAll } = await openPlayers(browser, 2);
  const [a, b] = pages;
  try {
    await probePage(a, { ns, room: code, secs: SECS });
    await expect(a.getByTestId('probe-room')).toHaveText(code);
    await expect(a.locator('#link')).toHaveAttribute('href', new RegExp(`room=${code}`));
    await expect(a.getByTestId('probe-status')).toHaveAttribute('data-status', 'waiting', { timeout: 15000 });
    await shot(a, 'a-waiting', testInfo);

    await probePage(b, { ns, room: code, secs: SECS });
    for (const p of [a, b]) {
      await expect(p.getByTestId('probe-peers')).toHaveText('2', { timeout: 15000 });
      await expect(p.getByTestId('probe-status')).toHaveAttribute('data-status', 'running');
    }
    // wait for a real reply instead of sleeping
    await expect.poll(() => a.evaluate(() => window.__PROBE.state().received), { timeout: 8000 }).toBeGreaterThanOrEqual(1);
    await expect(a.getByTestId('probe-status')).toHaveAttribute('data-status', 'running'); // still running, not reset to waiting
    await shot(a, 'a-running', testInfo);
    await shot(b, 'b-running', testInfo);
    const mid = await a.evaluate(() => window.__PROBE.state());
    expect(mid.sent, 'pings were sent while running').toBeGreaterThanOrEqual(1);
    await expect(a.getByTestId('probe-rtt')).toHaveText(/^\d+ ms$/);

    for (const p of [a, b]) {
      await expect(p.getByTestId('probe-status')).toHaveAttribute('data-status', 'green', { timeout: FINISH_MS });
      await expect(p.getByTestId('probe-status')).toContainText('GREEN');
      await expect(p.getByTestId('probe-summary')).toContainText(/^GREEN/);
      await expect(p.locator('#after')).toContainText(/screenshot/i);
    }
    await shot(a, 'a-end', testInfo);
    await shot(b, 'b-end', testInfo);

    for (const [who, p] of [['a', a], ['b', b]]) {
      const st = await p.evaluate(() => window.__PROBE.state());
      expect(st.status).toBe('green');
      expect(st.sent).toBeGreaterThanOrEqual(3);
      expect(st.received).toBeGreaterThanOrEqual(3);
      expect(st.summary.verdict).toBe('green');
      expect(st.summary.loss).toBeLessThanOrEqual(0.2);
      testInfo.annotations.push({ type: `probe-${who}-median-ms`, description: String(Math.round(st.summary.medianMs)) });
      testInfo.annotations.push({ type: `probe-${who}-p95-ms`, description: String(Math.round(st.summary.p95Ms)) });
      testInfo.annotations.push({ type: `probe-${who}-sent-received`, description: `${st.sent}/${st.received}` });
      testInfo.annotations.push({ type: `probe-${who}-connection-errors`, description: String(st.drops) });
    }
    assertNoErrors();
  } finally {
    await closeAll();
  }
});

test('a laptop alone keeps waiting and never starts the run', async ({ browser }, testInfo) => {
  const { ns, code } = testRoom();
  const { pages, assertNoErrors, closeAll } = await openPlayers(browser, 1);
  const [a] = pages;
  try {
    await probePage(a, { ns, room: code, secs: SECS });
    await expect(a.getByTestId('probe-status')).toHaveAttribute('data-status', 'waiting', { timeout: 15000 });
    await expect(a.getByTestId('probe-status')).toContainText(/waiting for the other laptop/i);
    await expect(a.getByTestId('probe-peers')).toHaveText('1');
    await a.waitForTimeout(3000); // a negative assertion needs time to pass: nothing may start in that window
    const st = await a.evaluate(() => window.__PROBE.state());
    expect(st.status).toBe('waiting');
    expect(st.sent).toBe(0);
    await shot(a, 'a-alone', testInfo);
    assertNoErrors();
  } finally {
    await closeAll();
  }
});

test('a network that blocks the live connection shows RED, not a hang', async ({ page }, testInfo) => {
  // What a strict school network does: the browser can load the page but the WebSocket never opens.
  await page.routeWebSocket(/supabase\.co/, (ws) => ws.close());
  const { ns, code } = testRoom();
  await probePage(page, { ns, room: code, secs: SECS });
  await expect(page.getByTestId('probe-status')).toHaveAttribute('data-status', 'red', { timeout: 20000 });
  await expect(page.getByTestId('probe-status')).toContainText(/RED/);
  await expect(page.getByTestId('probe-summary')).toContainText(/may be blocking it/);
  await expect(page.getByTestId('probe-summary')).not.toContainText('Missing Supabase'); // the socket path, not a build without keys
  expect((await page.evaluate(() => window.__PROBE.state())).sent).toBe(0);
  await shot(page, 'blocked', testInfo);
});

test('a network that accepts the socket but never answers also ends RED', async ({ page }, testInfo) => {
  // The likelier school failure: the connection looks open but nothing comes back, so the join times out (10 s).
  await page.routeWebSocket(/supabase\.co/, () => {});
  const { ns, code } = testRoom();
  await probePage(page, { ns, room: code, secs: SECS });
  await expect(page.getByTestId('probe-status')).toHaveAttribute('data-status', 'red', { timeout: 20000 });
  await expect(page.getByTestId('probe-summary')).toContainText(/may be blocking it/);
  await expect(page.getByTestId('probe-summary')).not.toContainText('Missing Supabase');
  expect((await page.evaluate(() => window.__PROBE.state())).sent).toBe(0);
  await shot(page, 'silent', testInfo);
});

// Flaky Wi-Fi is exactly what this probe exists to measure, so a drop must be counted, not thrown away.
// The real Supabase socket is proxied by the browser and then closed by the test.
async function proxyAndDrop(page) {
  const sockets = [];
  await page.routeWebSocket(/supabase\.co/, (ws) => {
    ws.connectToServer();
    sockets.push(ws);
  });
  return () => sockets.forEach((ws) => ws.close({ code: 1006, reason: 'test: network dropped' }));
}

test('a connection drop in the middle of the run is counted and the run still finishes', async ({ browser }, testInfo) => {
  const { ns, code } = testRoom();
  const { pages, assertNoErrors, closeAll } = await openPlayers(browser, 2);
  const [a, b] = pages;
  try {
    const dropA = await proxyAndDrop(a);
    await probePage(a, { ns, room: code, secs: SECS });
    await probePage(b, { ns, room: code, secs: SECS });
    await expect(a.getByTestId('probe-status')).toHaveAttribute('data-status', 'running', { timeout: 20000 });
    await expect.poll(() => a.evaluate(() => window.__PROBE.state().received), { timeout: 8000 }).toBeGreaterThanOrEqual(1);

    dropA();
    await expect.poll(() => a.evaluate(() => window.__PROBE.state().drops), { timeout: 8000 }).toBeGreaterThanOrEqual(1);
    await shot(a, 'a-dropped', testInfo);

    // the run is not thrown away: it ends with a verdict (loss and silence decide which) and says it saw errors
    await expect(a.getByTestId('probe-status')).toHaveAttribute('data-status', /^(green|red)$/, { timeout: FINISH_MS });
    await expect(a.getByTestId('probe-status')).not.toContainText(/could not connect|dropped/i);
    await expect(a.getByTestId('probe-summary')).toContainText(/connection errors: [1-9]/);
    await shot(a, 'a-dropped-end', testInfo);
    const st = await a.evaluate(() => window.__PROBE.state());
    expect(st.summary, 'a verdict was produced').not.toBeNull();
    testInfo.annotations.push({ type: 'probe-after-drop', description: `${st.summary.verdict}, sent ${st.sent}, got ${st.received}, errors ${st.drops}` });
    assertNoErrors();
  } finally {
    await closeAll();
  }
});

test('a hiccup while waiting does not turn the page RED, and the run still starts', async ({ browser }, testInfo) => {
  const { ns, code } = testRoom();
  const { pages, assertNoErrors, closeAll } = await openPlayers(browser, 2);
  const [a, b] = pages;
  try {
    const dropA = await proxyAndDrop(a);
    await probePage(a, { ns, room: code, secs: SECS });
    await expect(a.getByTestId('probe-status')).toHaveAttribute('data-status', 'waiting', { timeout: 15000 });

    dropA();
    await expect.poll(() => a.evaluate(() => window.__PROBE.state().drops), { timeout: 8000 }).toBeGreaterThanOrEqual(1);
    await shot(a, 'a-hiccup', testInfo);
    await expect(a.getByTestId('probe-status')).not.toHaveAttribute('data-status', 'red');

    // supabase-js rejoins by itself: the second laptop can still join and the run starts on both
    await probePage(b, { ns, room: code, secs: SECS });
    for (const p of [a, b]) {
      await expect(p.getByTestId('probe-peers')).toHaveText('2', { timeout: 20000 });
      await expect(p.getByTestId('probe-status')).toHaveAttribute('data-status', 'running');
    }
    await shot(a, 'a-after-hiccup', testInfo);
    assertNoErrors();
  } finally {
    await closeAll();
  }
});

test('window.__PROBE is absent without ?test=1', async ({ page }) => {
  const { ns, code } = testRoom();
  await probePage(page, { ns, room: code, secs: SECS, test: false });
  await expect(page.getByTestId('probe-status')).toBeVisible();
  expect(await page.evaluate(() => typeof window.__PROBE)).toBe('undefined');
});
