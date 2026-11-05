import { describe, it, expect } from 'vitest';
import { summarize, formatResult, LIMITS, PING_MS } from '../../../src/logic/probe.js';

// a healthy run: a ping every 2 s, a reply 40 ms later
function healthy(n = 10) {
  const recvTimes = [];
  const rtts = [];
  for (let i = 1; i <= n; i++) {
    recvTimes.push(i * PING_MS + 40);
    rtts.push(40 + (i % 3));
  }
  return { sentCount: n, rtts, recvTimes, startAt: 0, endAt: n * PING_MS + 500 };
}

describe('summarize', () => {
  it('is green for a healthy run', () => {
    const s = summarize(healthy());
    expect(s.verdict).toBe('green');
    expect(s.reasons).toEqual([]);
    expect(s.received).toBe(10);
    expect(s.loss).toBe(0);
    expect(s.medianMs).toBeGreaterThanOrEqual(40);
  });

  it('is red when nothing ever comes back', () => {
    const s = summarize({ sentCount: 10, rtts: [], recvTimes: [], startAt: 0, endAt: 22000 });
    expect(s.verdict).toBe('red');
    expect(s.reasons.join(' ')).toMatch(/no reply/);
    expect(s.medianMs).toBeNull();
  });

  it('is red when too many pings are lost', () => {
    const run = healthy(10);
    run.rtts = run.rtts.slice(0, 6);
    run.recvTimes = run.recvTimes.slice(0, 6);
    run.recvTimes.push(run.endAt - 1); // keep the gap rule out of it
    const s = summarize(run);
    expect(s.verdict).toBe('red');
    expect(s.reasons.join(' ')).toMatch(/%/);
  });

  it('is red when the connection goes silent, even if the average loss is low', () => {
    const run = healthy(30);
    // drop 4 pings in a row (8 s of silence) = 13% loss, under the loss limit
    run.rtts.splice(10, 4);
    run.recvTimes.splice(10, 4);
    const s = summarize(run);
    expect(s.loss).toBeLessThanOrEqual(LIMITS.maxLoss);
    expect(s.verdict).toBe('red');
    expect(s.reasons.join(' ')).toMatch(/silent/);
  });

  it('is red when the delay is too high', () => {
    const run = healthy(10);
    run.rtts = run.rtts.map(() => 900);
    const s = summarize(run);
    expect(s.verdict).toBe('red');
    expect(s.reasons.join(' ')).toMatch(/delay/);
  });

  it('is red when too few pings were sent', () => {
    const s = summarize({ sentCount: 2, rtts: [30, 31], recvTimes: [2030, 4031], startAt: 0, endAt: 4500 });
    expect(s.verdict).toBe('red');
  });

  it('computes median and p95 from unsorted input', () => {
    const run = healthy(5);
    run.rtts = [100, 10, 50, 30, 20];
    const s = summarize(run);
    expect(s.medianMs).toBe(30);
    expect(s.p95Ms).toBe(100);
  });

  it('does not let received exceed sent (duplicate replies)', () => {
    const run = healthy(3);
    run.rtts = [...run.rtts, 40, 40];
    run.recvTimes = [...run.recvTimes, 100, 200];
    expect(summarize(run).loss).toBe(0);
  });
});

describe('formatResult', () => {
  it('names the verdict and the numbers', () => {
    const line = formatResult(summarize(healthy()), 20);
    expect(line).toMatch(/^GREEN \| 20s \| sent 10, got 10 \| median \d+ ms/);
  });
  it('includes the reasons when red', () => {
    const line = formatResult(summarize({ sentCount: 10, rtts: [], recvTimes: [], startAt: 0, endAt: 22000 }), 20);
    expect(line).toMatch(/^RED \(.*no reply/);
    expect(line).toMatch(/median n\/a/);
  });
});
