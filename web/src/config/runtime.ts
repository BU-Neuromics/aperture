/**
 * Runtime config overlay (issue #22): `VITE_*` values are baked into the
 * bundle at build time, but the published image is digest-addressed and
 * deployment-agnostic — the endpoint must arrive at container start. The
 * image entrypoint writes `config.js` (loaded before the bundle) which sets
 * `window.__APERTURE_CONFIG__`; its entries override the build-time env,
 * using the same `VITE_*` vocabulary. Dev and plain static hosting ship a
 * no-op `public/config.js`.
 */
export function runtimeEnv(): Record<string, unknown> {
  const runtime = (globalThis as { __APERTURE_CONFIG__?: unknown }).__APERTURE_CONFIG__;
  const overlay =
    typeof runtime === 'object' && runtime != null && !Array.isArray(runtime)
      ? (runtime as Record<string, unknown>)
      : {};
  return { ...import.meta.env, ...overlay };
}
