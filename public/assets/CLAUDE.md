# public/assets: art, fonts, sounds

Served as-is by Vite/GitHub Pages at `<base>/assets/...`.

## Layout
```
assets/
  ASSETS.md        every file: path, source (made here / user / CC0 URL), license, date
  runners/         runner base + skin layers (atlas: runners.png + runners.json)
  obstacles/       one atlas for all obstacle sprites
  tiles/           course tileset
  fx/              particles, confetti, banners
  fonts/           self-hosted font files (OFL or similar) + their license file
  sfx/             short sounds (muted by default in game)
```

## Rules
1. **Original or CC0 only.** Made here (SVG or procedural, then exported), made by the user, or CC0
   (for example Kenney.nl). Nothing from Fall Guys, nothing "inspired" so closely that it reads as their
   character (no jelly-bean body shape, no their colors and patterns as a set).
2. **Log every file in ASSETS.md in the same commit that adds it.** Smoke check `h0_assets_logged.mjs`
   fails if any file here is missing from ASSETS.md.
3. **Small:** the whole folder < 5 MB. PNG atlases ≤ 2048×2048. Sounds as `.ogg` + `.m4a` (Safari),
   each < 100 KB.
4. **Paths are relative to Vite's `base`.** Load with `import.meta.env.BASE_URL + 'assets/…'`, never a leading `/`,
   or the game breaks on GitHub Pages under `/<repo>/`.
5. **Skins are layers, not full sprites:** base body (tinted) + pattern + hat. 12 skins from a few layers.
6. No external hotlinks (CDNs and Google Fonts may be blocked at school). Everything is served from here.

## Proof
- `vite build` has no missing-asset warnings; the e2e test loads every atlas (a BootScene event lists them).
- A "skin gallery" screenshot (test-gallery course) in the stage that adds or changes art.
