# src/net: rooms and live sync over Supabase Realtime

The riskiest folder: it only truly works with real laptops on a real network. Read HANDOFF §6 before any
change here. N1 and N2 are `[design]` stages, so read their approved notes in `docs/design/` too.

## Layout
```
net/
  supabase.js     createClient from import.meta.env.VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
  transport.js    THE ONLY file that touches the Supabase channel API. Wraps it as
                  { join(topic), track(presence), onPresence(cb), send(event, payload), on(event, cb), leave() }
  fakeTransport.js an in-memory transport with the same shape (used by unit tests and the solo/bot mode)
  room.js         create/join by code, seats from presence, bots fill seats, host election
  sync.js         15 Hz send of local state, receive → interpolation buffers, start/finish/results events
  clockSync.js    ping/pong with the host; uses src/logic/clock.js for the median-offset math
  messages.js     every message type with its payload shape and a validate() for each
```

## Rules
1. **Only `transport.js` imports `@supabase/supabase-js`.** Everything else talks to the transport
   interface, so the fake transport can stand in for unit tests.
2. **Every message is declared in `messages.js`** with a `type`, a version field `v`, and a validator.
   Incoming messages that fail validation are dropped and counted (exposed in `__TR.events()`), never thrown.
3. **Topics:** real rooms are `room:<CODE>`. Tests set `?test=1&ns=test-<runId>` and use
   `test-<runId>-room:<CODE>`, so test traffic can never land in a real room.
4. **Rate:** position updates ≤ 15 Hz per runner, only while racing, rounded to 1 decimal place.
   Lobby/presence updates only on change.
5. **Host decides:** seats, bot seats, race start time, results. Clients *request*; the host *announces*.
   Host election = the human with the earliest `joinedAt` (tie → smaller id). Re-run on every presence change.
6. **Never trust timing from one sample.** Clock offset = median of 5 round trips; re-sync at each lobby.
7. **Failure is normal.** On disconnect: show "Reconnecting…", retry with backoff (0.5, 1, 2, 4 s); after 10 s,
   leave to the lobby with a friendly message. Never freeze or throw into Phaser.
8. **No personal data on the wire:** id (random), generated name, skin id, positions. Nothing else.

## Testing (both kinds are required for every change here)
- **Unit (Vitest + fakeTransport):** message validation, host election with join/leave orders, seats
  with bots replaced by humans, room full, a mid-race joiner waiting, the results ordering + `minTime`
  rule, reconnect state machine with fake timers.
- **Real (Playwright, real Supabase):** `tests/e2e/multiplayer.*.spec.js`, using several browser
  contexts in one test (mix Chromium and WebKit when the stage says so). Assert what each window
  *shows* (seats, runners moving, the same results), plus `__TR.state()`. Screenshot every window at
  every key moment, named `<ctx>-<moment>.png`.
- Log measured numbers in the stage log: average and max position disagreement between windows,
  time from "Start" to the race starting on every window, and the reconnect time.

## Done checklist for changes here
- [ ] Message changes are in `messages.js` with a bumped `v` and a validator test
- [ ] Unit tests with the fake transport AND a real multi-window e2e test
- [ ] Measured lag/disagreement numbers written in the stage log
- [ ] A "host closes the tab" case was tested if election, start or results code changed
