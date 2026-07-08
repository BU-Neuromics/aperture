// Runtime config overlay (see src/config/runtime.ts). This no-op default is
// what dev and plain static hosting serve; the Docker image's entrypoint
// rewrites it from VITE_* environment variables at container start.
window.__APERTURE_CONFIG__ = {};
