# src/ui: menus, lobby, HUD, results, skin shop

Plain DOM + CSS laid over the Phaser canvas (`#ui` above `#game`). Not Phaser UI, because DOM is
easier to make crisp, accessible, and testable.

## Screens
Title (Create room / Join with code / Play vs bots) → Lobby (4 seats, skins, room code big enough
to read from the next desk, host's Start button) → HUD during the race (timer, place, "first
finisher" banner, the 30 s end countdown) → Results (places, coins earned, Rematch) → Shop (skins
with prices, owned/equipped).

## Built so far
`hud.js` + `hud.css` (G3a): `createHud(#ui)` returns `{place(rect), update({countdown, time}), toast(text), clear()}` with the
test ids `countdown` (128 px at a 1280 px wide picture, upper middle), `timer` (top right) and `toast` (a message that fades
in 1.2 s, below the controls hint). main.js creates it and hands it to the scene through the Phaser registry, so game code
never imports ui. `#ui` is a click-through layer in `index.html`; **main.js lays it over the canvas rectangle** (`place`, on
every resize of the picture), because the canvas is scaled to fit and centred, so in a window that is not 16:9 a layer pinned
to the window would sit on the letterbox bars. All its sizes scale with the picture (`--u` = picture width / 1280, at least
0.75). e2e: race.solo.spec.js checks the timer, message and word lie inside the canvas at 1280x800, 1440x900, 1280x1000 and
1440x780 and after a resize.

`title.js` + `results.js` + `screens.css` (G3b): `createTitle(#ui, {onPlay})` is a Play button (test id `play-solo`, focused so Enter or
Space starts a race) and a line about the keys, shown only while the title scene is up (`show()` / `hide()`); `createResults(#ui,
{onAgain, onTitle})` is the solo results card: `results` (the layer), `results-headline` ("Finished!", 128 px at a 1280 px picture),
`results-time` (the time as the timer wrote it), `results-falls` ("No falls" / "1 fall" / "N falls"), `rematch` ("Play again") and
`to-title` ("Title"), brought up by `show({time, falls})`. Neither is focused on show for the results: a kid still hammering Space
at the line would otherwise press Play again by accident. Places and coins arrive with bots, the net and P1. main.js wires them
(`title-shown`, `race-over`, Play, play again, back to the title). e2e: race.solo.spec.js checks every part lies on the picture, and
the text sizes, at 1280x800, 1440x900 (and 1280x1000 for the results).

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
