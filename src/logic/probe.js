/**
 * Pure verdict logic for the school-Wi-Fi probe (HANDOFF §10 H1).
 * No DOM, no network: the page feeds it numbers and shows what it returns.
 */

export const PING_MS = 2000;

/** Thresholds for GREEN. Loose on purpose: this answers "is live play possible at all on this network?". */
export const LIMITS = Object.freeze({
  maxLoss: 0.2, // at most 20% of pings may go unanswered
  maxGapMs: 3.25 * PING_MS, // never silent for more than ~3 pings in a row
  maxMedianRttMs: 400,
  minSent: 3,
});

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

/**
 * @param {{ sentCount: number, rtts: number[], recvTimes: number[], startAt: number, endAt: number }} run
 *   rtts: round-trip times in ms; recvTimes: when each pong arrived (same clock as startAt/endAt, ms).
 * @returns {{ verdict: 'green'|'red', reasons: string[], sent: number, received: number, loss: number,
 *            medianMs: number|null, p95Ms: number|null, maxGapMs: number }}
 */
export function summarize({ sentCount, rtts, recvTimes, startAt, endAt }) {
  const sorted = [...rtts].sort((a, b) => a - b);
  const received = rtts.length;
  const loss = sentCount > 0 ? Math.max(0, 1 - received / sentCount) : 1;

  const stamps = [startAt, ...[...recvTimes].sort((a, b) => a - b), endAt];
  let maxGapMs = 0;
  for (let i = 1; i < stamps.length; i++) maxGapMs = Math.max(maxGapMs, stamps[i] - stamps[i - 1]);

  const medianMs = percentile(sorted, 0.5);
  const p95Ms = percentile(sorted, 0.95);

  const reasons = [];
  if (sentCount < LIMITS.minSent) reasons.push(`only ${sentCount} pings were sent`);
  if (received === 0) reasons.push('no reply ever came back');
  if (loss > LIMITS.maxLoss) reasons.push(`${Math.round(loss * 100)}% of pings got no reply`);
  if (maxGapMs > LIMITS.maxGapMs) reasons.push(`connection went silent for ${(maxGapMs / 1000).toFixed(1)} s`);
  if (medianMs !== null && medianMs > LIMITS.maxMedianRttMs) reasons.push(`median delay ${Math.round(medianMs)} ms is too high`);

  return { verdict: reasons.length === 0 ? 'green' : 'red', reasons, sent: sentCount, received, loss, medianMs, p95Ms, maxGapMs };
}

/** One line a kid can read out or screenshot. */
export function formatResult(s, seconds) {
  const ms = (v) => (v === null ? 'n/a' : `${Math.round(v)} ms`);
  const head = s.verdict === 'green' ? 'GREEN' : 'RED';
  const why = s.reasons.length ? ` (${s.reasons.join('; ')})` : '';
  return `${head}${why} | ${seconds}s | sent ${s.sent}, got ${s.received} | median ${ms(s.medianMs)} | p95 ${ms(s.p95Ms)} | longest silence ${(s.maxGapMs / 1000).toFixed(1)} s`;
}
