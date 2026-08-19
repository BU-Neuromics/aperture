// Smoke-test-only vite config: same app, plus a dev proxy to a local mosaic
// so the browser sees a same-origin /graphql (matching how real deployments
// reverse-proxy — endpoint.ts). Not used by any build; safe to keep for
// `npm run dev` against a local `mosaic serve`.
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';

export default mergeConfig(
  base,
  defineConfig({
    server: {
      proxy: {
        '/graphql': process.env.SMOKE_GRAPHQL_TARGET ?? 'http://127.0.0.1:8123',
      },
    },
  }),
);
