import { openProbeChannel } from './net/probeChannel.js';
import { PING_MS, formatResult, summarize } from './logic/probe.js';

// ---- settings from the URL -------------------------------------------------
const params = new URLSearchParams(window.location.search);
const secs = Math.min(600, Math.max(6, Number(params.get('secs')) || 120));
const ns = params.get('ns') || '';
const testMode = params.get('test') === '1';
const WAIT_HINT_MS = 20000;
const RECONNECT_MS = 10000;

const LETTERS = 'BCDFGHJKLMNPQRSTVWXZ'; // consonants only, no look-alikes (HANDOFF §6.1)
function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => LETTERS[b % LETTERS.length]).join('');
}
const wanted = (params.get('room') || '').toUpperCase();
const room = /^[A-Z]{4}$/.test(wanted) ? wanted : randomCode();
if (room !== wanted) {
  params.set('room', room);
  history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}
const id = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('');

function lengthText(s) {
  if (s < 60) return `${s} seconds`;
  const m = Math.round(s / 60);
  return `${m} minute${m === 1 ? '' : 's'}`;
}

// The link to share: this page plus the room (and secs when set). Nothing else from the address bar is echoed.
const shareUrl = new URL(window.location.href);
shareUrl.search = '';
shareUrl.hash = '';
shareUrl.searchParams.set('room', room);
if (params.get('secs')) shareUrl.searchParams.set('secs', String(secs));

// ---- page ------------------------------------------------------------------
const app = document.getElementById('app');
app.innerHTML = `
  <h1>Connection check</h1>
  <p class="sub">Open this link on <b>two</b> laptops. Keep <b>BOTH</b> tabs open and in front for ${lengthText(secs)}.
    The clock starts when both laptops are here.</p>
  <div id="banner" data-testid="probe-status" data-status="connecting">Connecting…</div>
  <p class="room">Room code <b class="code" data-testid="probe-room">${room}</b>
    <span class="same">Both laptops must show the same code.</span></p>
  <p id="join" class="join">Link for the other laptop:<br><a id="link"></a></p>
  <p id="hint" class="hint" hidden></p>
  <table>
    <tr><td>Laptops in room</td><td data-testid="probe-peers">0</td></tr>
    <tr><td>Time</td><td data-testid="probe-elapsed">0 / ${secs} s</td></tr>
    <tr><td>Pings sent / answered</td><td data-testid="probe-counts">0 / 0</td></tr>
    <tr><td>Last delay</td><td data-testid="probe-rtt">n/a</td></tr>
  </table>
  <p id="result" data-testid="probe-summary">The result appears here when the test finishes.</p>
  <p id="after" class="after" hidden></p>
`;
const $ = (sel) => document.querySelector(sel);
const link = $('#link');
link.href = shareUrl.href;
link.textContent = shareUrl.href;

const banner = $('#banner');
const ui = {
  status: 'connecting',
  setStatus(status, text) {
    this.status = status;
    banner.dataset.status = status;
    banner.textContent = text;
  },
};

// ---- probe -----------------------------------------------------------------
let peers = 0;
let sent = 0;
let seq = 0;
let startedAt = 0;
let pingTimer = null;
let renderTimer = null;
let hintTimer = null;
let finished = false;
let drops = 0; // connection errors after the run started (the run keeps measuring: loss and silence decide the verdict)
let hiddenMs = 0; // time this tab spent in the background during the run (browsers slow hidden tabs down)
let hiddenSince = 0;
const sentAt = new Map(); // seq -> performance.now() when we sent it; a reply counts once, and only for our own ping
const rtts = [];
const recvTimes = [];
let lastRtt = null;
let summary = null;
let everSubscribed = false; // true once the channel has opened at least once
let reconnectTimer = null; // while waiting: a dropped connection gets RECONNECT_MS to come back before the page goes RED

let channel = null;
channel = openProbeChannel({
  url: import.meta.env.VITE_SUPABASE_URL,
  key: import.meta.env.VITE_SUPABASE_ANON_KEY,
  name: `${ns}probe-${room}`,
  id,
  onPeers(n) {
    peers = n;
    $('[data-testid="probe-peers"]').textContent = String(n);
    if (n >= 2 && !startedAt && !finished) start();
  },
  onMessage(event, payload) {
    if (!payload || typeof payload !== 'object') return;
    if (event === 'ping') {
      if (typeof payload.from === 'string' && payload.from !== id && Number.isFinite(payload.seq)) {
        channel.send('pong', { to: payload.from, seq: payload.seq });
      }
    } else if (event === 'pong' && payload.to === id && startedAt && !finished) {
      const t0 = sentAt.get(payload.seq);
      if (t0 === undefined) return; // not a ping of ours, or a duplicate reply
      sentAt.delete(payload.seq);
      const now = performance.now();
      lastRtt = now - t0;
      rtts.push(lastRtt);
      recvTimes.push(now - startedAt);
      render();
    }
  },
  onStatus(status, detail) {
    if (status === 'subscribed') {
      everSubscribed = true;
      // supabase-js reports SUBSCRIBED again after every rejoin: it may only touch the page before the run starts
      if (!startedAt && !finished) {
        clearTimeout(reconnectTimer);
        ui.setStatus('waiting', 'Waiting for the other laptop…');
        $('#hint').hidden = true;
        clearTimeout(hintTimer);
        hintTimer = setTimeout(showWaitHint, WAIT_HINT_MS);
      }
    } else if (status === 'error' && !finished) {
      if (startedAt) {
        drops += 1; // during the run: measured, never hidden (loss and silence decide the verdict)
        render();
      } else if (everSubscribed) {
        // a hiccup while waiting: supabase-js rejoins by itself, so give it a moment before calling it RED
        drops += 1;
        const hint = $('#hint');
        hint.hidden = false;
        hint.textContent = 'The connection hiccuped. Reconnecting…';
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          if (!startedAt && !finished) fail(detail, true);
        }, RECONNECT_MS);
      } else {
        fail(detail, false);
      }
    }
  },
});
if (finished) channel.close(); // fail() ran before the channel object existed

function showWaitHint() {
  if (startedAt || finished) return;
  const hint = $('#hint');
  hint.hidden = false;
  hint.textContent = `Still waiting. Check that the other laptop shows room code ${room}.`;
}

function render() {
  const elapsed = startedAt ? Math.min(secs, (performance.now() - startedAt) / 1000) : 0;
  $('[data-testid="probe-elapsed"]').textContent = `${Math.floor(elapsed)} / ${secs} s`;
  $('[data-testid="probe-counts"]').textContent = `${sent} / ${rtts.length}`;
  $('[data-testid="probe-rtt"]').textContent = lastRtt === null ? 'n/a' : `${Math.round(lastRtt)} ms`;
}

function showAfter(note = '') {
  clearTimeout(hintTimer);
  clearTimeout(reconnectTimer);
  clearInterval(pingTimer);
  clearInterval(renderTimer);
  $('#join').hidden = true;
  $('#hint').hidden = true;
  const after = $('#after');
  after.hidden = false;
  after.textContent = `Done. Take a screenshot of this screen on BOTH laptops and send both. Reload the page to run it again.${note}`;
}

function ping() {
  const elapsed = (performance.now() - startedAt) / 1000;
  if (elapsed >= secs) {
    clearInterval(pingTimer);
    // leave time for the last replies, then judge
    setTimeout(finish, PING_MS + 500);
    return;
  }
  sent += 1;
  seq += 1;
  sentAt.set(seq, performance.now());
  channel.send('ping', { from: id, seq });
  render();
}

function start() {
  startedAt = performance.now();
  hiddenSince = document.hidden ? startedAt : 0;
  clearTimeout(hintTimer);
  $('#hint').hidden = true;
  ui.setStatus('running', 'Testing… keep this tab open and in front.');
  ping();
  pingTimer = setInterval(ping, PING_MS);
  renderTimer = setInterval(render, 500);
}

document.addEventListener('visibilitychange', () => {
  if (!startedAt || finished) return;
  if (document.hidden) {
    hiddenSince = performance.now();
  } else if (hiddenSince) {
    hiddenMs += performance.now() - hiddenSince;
    hiddenSince = 0;
  }
});

function finish() {
  if (finished) return;
  finished = true;
  if (hiddenSince) hiddenMs += performance.now() - hiddenSince;
  // The test window is exactly `secs` long; the extra wait for the last replies must not count as silence.
  summary = summarize({ sentCount: sent, rtts, recvTimes, startAt: 0, endAt: secs * 1000 });
  const notes = [];
  if (drops) notes.push(`connection errors: ${drops}`);
  if (hiddenMs > 3000) notes.push(`this tab was in the background for ${Math.round(hiddenMs / 1000)} s, so the result may be unreliable`);
  $('#result').textContent = formatResult(summary, secs) + (notes.length ? ` | ${notes.join('; ')}` : '');
  if (summary.verdict === 'green') ui.setStatus('green', 'GREEN: the live connection worked on this network.');
  else ui.setStatus('red', 'RED: the live connection had problems on this network. Details below.');
  showAfter(' (A longest silence of about 2 s is normal: the test pings every 2 s.)');
  render();
  channel.close();
}

// Only before the run started: a connection that never opened, or that dropped while waiting and did not come back.
// Trouble during the run is measured, not hidden.
function fail(detail, droppedAfterOpening) {
  finished = true;
  ui.setStatus('red', droppedAfterOpening ? 'RED: the connection dropped.' : 'RED: could not connect.');
  const what = droppedAfterOpening ? 'The live connection dropped and did not come back' : 'The live connection would not open';
  $('#result').textContent = `${what}. This network may be blocking it. Details for the builder: ${detail || 'none'}`;
  showAfter();
  if (channel) channel.close();
}

if (testMode) {
  window.__PROBE = {
    state: () => ({ status: ui.status, peers, sent, received: rtts.length, room, summary, drops, hiddenMs }),
  };
}
