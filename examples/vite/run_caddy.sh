#!/bin/bash
set -euo pipefail

# Trust Caddy's local CA so tls internal works without browser warnings
if command -v caddy >/dev/null 2>&1; then
  caddy trust || true
else
  echo "Caddy not found. Please install Caddy (brew install caddy)" >&2
  exit 1
fi

# Run Caddy with the multi-host Caddyfile
caddy run --config Caddyfile
