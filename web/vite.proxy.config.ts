import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Dev rig for driving the app against a REAL Mosaic (not the in-process test
// doubles) — notably the conversational panel, which needs a live
// `converseQuerySpec`. Proxying /graphql makes Mosaic same-origin, so the
// browser is not making a cross-origin request at all.
//
// Mosaic gained CORS middleware in #207, but it is opt-in (`--cors-origin`)
// AND unreleased — it is not in v0.13.0, so it is absent from the certified
// container image. Until a release carries it, this proxy is the working path.
//
//   mosaic serve --config mosaic.yaml --host 127.0.0.1 --port 8099 --graphql --mcp
//   npm run dev -- --config vite.proxy.config.ts
//
// Point MOSAIC_EXON_URL at the planning service first, or `converseQuerySpec`
// will not be registered on the schema at all (it is env-gated at build time).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/graphql': { target: 'http://127.0.0.1:8099', changeOrigin: true } } },
});
