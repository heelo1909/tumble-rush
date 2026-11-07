# BUG-001: the probe's mid-run drop test failed once with ERR_CONNECTION_REFUSED

Status: open, watching. Not reproduced. No fix stage yet: a `B-001` stage is opened if it happens again.

## User's exact words
None. Found by `npm run smoke` while closing G3a.

## When and where
- 2026-11-06, the last full smoke of G3a (365 s, the others took about 340 s), Chromium, at home, real Supabase.
- Test: `tests/e2e/probe.spec.js:116` "a connection drop in the middle of the run is counted and the run still finishes".
- It had passed in the three full smokes of G3a before that one, and in 6 of 6 repeats straight after
  (`--repeat-each=6`, Chromium, 19 to 21 s each). G3a changes nothing the probe page loads
  (`probe.html`, `src/probe.js`, `src/net/`).

## Evidence
`fixtures.js:67`: `no pageerror / console.error allowed in any window`, received
`["a console.error: Failed to load resource: net::ERR_CONNECTION_REFUSED"]`: window "a" (the first of the two probe
windows) logged one refused request. The assertion at `probe.spec.js:139` is the only one that failed; the drop itself and the
GREEN result were not reported as wrong. The log does not say which URL was refused.

## Root cause
Unknown. Candidates, none checked: a transient refusal from Supabase's host on the home network; the local `vite preview`
server refusing one request while the machine was busy (this run was the slowest of the four); the test's own
deliberate socket drop racing a request.

## Fix
None yet. Not loosened and not skipped (PRINCIPLES §5.1). If it recurs: capture the refused URL (a `requestfailed` listener in the
test, which logs the URL and does not allow the error), then decide.

## Confirmed live?
Not applicable (a home-network smoke result; `smoke:live` ran the same test against the deployed site for H1 without this).
