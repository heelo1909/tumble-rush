# src/ui: menus, lobby, HUD, results, skin shop

Plain DOM + CSS laid over the Phaser canvas (`#ui` above `#game`). Not Phaser UI, because DOM is
easier to make crisp, accessible, and testable.

## Screens
Title (Create room / Join with code / Play vs bots) → Lobby (4 seats, skins, room code big enough
to read from the next desk, host's Start button) → HUD during the race (timer, place, "first
finisher" banner, the 30 s end countdown) → Results (places, coins earned, Rematch) → Shop (skins
with prices, owned/equipped).

## Rules
1. **Imports only from `src/logic`.** Screens get data and callbacks from `src/main.js`
   (`showLobby({seats, code, isHost, onStart})`), so they never call net or game code.
2. **Every interactive element has a stable `data-testid`** (`create-room`, `join-code-input`,
   `join-submit`, `start-race`, `seat-0`…`seat-3`, `rematch`, `shop-item-<id>`, `buy-<id>`, `equip-<id>`,
   `mute-toggle`). e2e tests click these, never CSS classes or text.
3. **The only text input is the room code** (4 letters, auto-uppercase, consonants only). No other
   free text anywhere (HANDOFF §1). Names come from `src/logic/names.js`.
4. **Visible from a desk away.** Room code ≥ 64 px; place banner ≥ 96 px; body text ≥ 18 px; contrast
   ≥ 4.5:1. Everything important is visual because sound is off by default.
5. **Never cover the runner** during a race. The HUD stays in the corners, and banners fade within 1.5 s.
6. Original look (HANDOFF §1). Bright, chunky, thick outlines; one font, either self-hosted in
   `public/assets/fonts/` or a system font (Google Fonts may be blocked at school).

## Proof
- e2e screenshot of every screen at 1280×800 (a 13" MacBook) and 1440×900, in Chromium and WebKit.
- product-reviewer checks these for overlap, cut-off text and
  unreadable contrast from a desk away.

## Done checklist
- [ ] `data-testid` on everything clickable
- [ ] Screenshots at both sizes in both browsers, looked at
- [ ] No text input other than the room code
