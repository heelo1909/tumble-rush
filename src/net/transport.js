import { createClient } from '@supabase/supabase-js';

/**
 * THE ONLY file that touches the Supabase Realtime API (src/net/CLAUDE.md rule 1).
 * Everything else talks to this small interface, so a fake transport can stand in for unit tests.
 *
 * Register `on` / `onPresence` / `onStatus` handlers BEFORE calling `join`.
 * One transport = one join. `leave()` is final: make a new transport to join again.
 *
 * @typedef {{ id: string }} JoinOptions
 * @typedef {{
 *   on: (event: string, cb: (payload: any) => void) => void,
 *   onPresence: (cb: (state: Record<string, any[]>) => void) => void,
 *   onStatus: (cb: (status: 'subscribed'|'error', detail?: string) => void) => void,
 *   join: (topic: string, opts: JoinOptions) => void,
 *   track: (presence: object) => Promise<'ok'|'timed out'|'error'>,
 *   send: (event: string, payload: object) => void,
 *   leave: () => void,
 * }} Transport
 *
 * `eventsPerSecond` is only sent to the server as a URL parameter: realtime-js does no client-side throttling,
 * so the send-rate cap (HANDOFF §6.2, 15 Hz) must be enforced by the caller (sync.js, N2).
 *
 * @param {{ url?: string, key?: string, eventsPerSecond?: number }} cfg
 * @returns {Transport}
 */
export function createTransport({ url, key, eventsPerSecond = 10 } = {}) {
  const broadcastHandlers = new Map();
  const presenceHandlers = [];
  const statusHandlers = [];
  let client = null;
  let channel = null;
  let left = false;

  const emitStatus = (status, detail) => {
    if (!left) statusHandlers.forEach((cb) => cb(status, detail));
  };

  return {
    on(event, cb) {
      if (!broadcastHandlers.has(event)) broadcastHandlers.set(event, []);
      broadcastHandlers.get(event).push(cb);
    },
    onPresence(cb) {
      presenceHandlers.push(cb);
    },
    onStatus(cb) {
      statusHandlers.push(cb);
    },
    join(topic, { id }) {
      if (left || channel) return;
      if (!url || !key) {
        emitStatus('error', 'Missing Supabase settings: set up .env (H1) and rebuild.');
        return;
      }
      try {
        client = createClient(url, key, {
          // no accounts in v1: do not start auth timers/listeners (they also warn when a page makes a second client)
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          realtime: { params: { eventsPerSecond } },
        });
        channel = client.channel(topic, { config: { broadcast: { self: false, ack: false }, presence: { key: id } } });
        for (const [event, cbs] of broadcastHandlers) {
          channel.on('broadcast', { event }, ({ payload }) => cbs.forEach((cb) => cb(payload)));
        }
        channel.on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          presenceHandlers.forEach((cb) => cb(state));
        });
        channel.subscribe((status, err) => {
          if (status === 'SUBSCRIBED') emitStatus('subscribed');
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            emitStatus('error', `Realtime channel ${status}${err ? `: ${err.message || err}` : ''}`);
          }
        });
      } catch (e) {
        // a bad URL or key must show up as an error status, never as an exception in the page
        emitStatus('error', `Could not start the live connection: ${e && e.message ? e.message : e}`);
      }
    },
    async track(presence) {
      if (!channel) return 'error';
      return channel.track(presence);
    },
    send(event, payload) {
      if (channel) channel.send({ type: 'broadcast', event, payload });
    },
    leave() {
      left = true;
      const c = client;
      const ch = channel;
      client = null;
      channel = null;
      if (c && ch) {
        // let the leave reach the server before the socket is cut
        Promise.resolve(c.removeChannel(ch))
          .catch(() => {})
          .finally(() => {
            try {
              c.realtime.disconnect();
            } catch {
              // already closed: nothing more to do
            }
          });
      }
    },
  };
}
