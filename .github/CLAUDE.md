# .github: CI and GitHub Pages deploy

## Workflows (created in H0)
- `ci.yml`: on every push and PR, run `npm ci`, `eslint`, `vitest run`, `vite build`, and the smoke checks. **No e2e
  in CI** (it needs the real Supabase project and real browsers; that proof happens on the user's Mac
  and in `smoke:live`). CI green is a safety net, never proof that the game works.
- `deploy.yml`: on push to `main`, `npm ci` → `vite build` with `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` from repo secrets → `actions/upload-pages-artifact` → `actions/deploy-pages`.
  Pages source = "GitHub Actions" (the user sets this in repo Settings → Pages during H1).

## Rules
1. `vite.config.js` sets `base: '/<repo-name>/'` to match the Pages URL. Smoke check `h0_base_path` guards it.
2. Only the anon key goes in secrets/build. Never the service-role key.
3. Pin action major versions (`actions/checkout@v4` etc.). Pin Node to 20.
4. After a deploy, the stage runs `npm run smoke:live` and records the result. A deploy that's green in
   Actions but fails live is a failed stage.
5. Changing a workflow is part of a stage's diff and goes through the verifier like any code.
