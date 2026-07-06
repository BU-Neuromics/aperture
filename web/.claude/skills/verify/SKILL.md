---
name: verify
description: Verify the Aperture SPA end-to-end — stand up a stub Hippo GraphQL endpoint, run the dev server against it, and drive the app in headless Chromium.
---

# Verifying the Aperture web app

The app's surface is a browser talking GraphQL to a Hippo endpoint. Verify by driving that
surface, not by re-running CI (typecheck/lint/test/build are `.github/workflows/web.yml`'s job).

## Recipe that works

1. **Stub endpoint** (real spec-compliant execution — reuse `graphql` from `web/node_modules`):
   a small `node` http server with `buildSchema` + `graphql()` and CORS headers
   (`Access-Control-Allow-Origin: *`, `-Headers: content-type`, `-Methods: POST, OPTIONS`;
   answer `OPTIONS` with 204). Give it a generic schema with list fields taking
   `(filter, limit, offset, search)` args, an enum, a single ref, a list-of-object ref, and a
   `batchPut` mutation — that lights up the negotiated capabilities the UI gates on.
   Serve ~60 rows so pagination has 3 pages.

2. **Dev server:** `cd web && VITE_HIPPO_GRAPHQL_URL=http://localhost:4000/ npm run dev -- --port 5173 --strictPort`

3. **Browser:** `npm install playwright-core` in a scratch dir;
   `chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })`
   (the bare `/opt/pw-browsers/chromium` path is a directory, not the binary — check
   `ls /opt/pw-browsers` for the versioned dir).

## Flows worth driving

- Boot → nav derives collections from introspection; first collection's table renders.
- `Next`/`Prev` → URL gains `?page=N`; short last page disables Next (no faked counts).
- Nav switch → `?collection=X&page=1`; deep-link `/?collection=X&page=2` renders directly.
- `?collection=nonsense` → falls back to first collection; `?page=99` → empty state with
  "Back to first page".
- Kill the stub → boot shows the connect-error panel; mid-session death shows the table error
  state; restart stub + Retry recovers.
- No `VITE_HIPPO_GRAPHQL_URL` → "No data-plane endpoint configured" guidance panel.

## Gotchas

- The stub must answer the standard `__schema` introspection query — `graphql()` does this
  for free; a hand-rolled JSON responder will not.
- `page.on('console'/'pageerror')` catches React errors the screenshots hide.
- A `/favicon.ico` 404 in the console is pre-existing scaffold noise (no icon link in
  `index.html`), not an app error.
