#!/bin/sh
# Injects runtime config into the static bundle (issue #22): the published
# image is digest-addressed and deployment-agnostic, so endpoint config
# arrives at container start. Recognized env vars (same names as the
# build-time vocabulary) are written into config.js, which index.html loads
# before the bundle — see src/config/runtime.ts.
set -eu

OUT=/usr/share/nginx/html/config.js

{
  printf 'window.__APERTURE_CONFIG__ = {'
  sep=''
  for key in VITE_HIPPO_GRAPHQL_URL VITE_HIPPO_CONTROL_PLANE_URL VITE_WORKFLOWS VITE_NAV; do
    value=$(printenv "$key" 2>/dev/null || true)
    if [ -n "$value" ]; then
      escaped=$(printf '%s' "$value" | sed 's/\\/\\\\/g; s/"/\\"/g')
      printf '%s\n  "%s": "%s"' "$sep" "$key" "$escaped"
      sep=','
    fi
  done
  printf '\n};\n'
} > "$OUT"

echo "aperture: runtime config written to $OUT"
