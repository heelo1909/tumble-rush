import { createTransport } from './transport.js';

/**
 * Opens a Realtime channel for the connection probe (HANDOFF §10 H1), on top of the transport.
 * Broadcast carries ping/pong; Presence tells each tab how many tabs are in the room.
 *
 * @param {{ url?: string, key?: string, name: string, id: string,
 *           onPeers: (n: number) => void, onMessage: (event: string, payload: any) => void,
 *           onStatus: (status: string, detail?: string) => void }} opts
 * @returns {{ send: (event: string, payload: object) => void, close: () => void }}
 */
export function openProbeChannel({ url, key, name, id, onPeers, onMessage, onStatus }) {
  let closed = false;
  const transport = createTransport({ url, key, eventsPerSecond: 10 });
  transport.on('ping', (payload) => onMessage('ping', payload));
  transport.on('pong', (payload) => onMessage('pong', payload));
  transport.onPresence((state) => onPeers(Object.keys(state).length));
  transport.onStatus(async (status, detail) => {
    if (status === 'subscribed') {
      let tracked;
      try {
        tracked = await transport.track({ id });
      } catch (e) {
        tracked = e && e.message ? e.message : 'error';
      }
      if (closed) return;
      if (tracked === 'ok') onStatus('subscribed');
      else onStatus('error', `Could not announce this laptop to the room (${tracked})`);
    } else if (!closed) {
      onStatus('error', detail);
    }
  });
  transport.join(name, { id });
  return {
    send: (event, payload) => transport.send(event, payload),
    close() {
      closed = true;
      transport.leave();
    },
  };
}
