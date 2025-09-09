#!/bin/bash
set -euo pipefail

# Trust Caddy's local CA so tls internal works without browser warnings
if command -v caddy >/dev/null 2>&1; then
  caddy trust || true
else
  echo "Caddy not found. Please install Caddy (brew install caddy)" >&2
  exit 1
fi

# Kill any stale Caddy instances that may still be listening on 443 (dev convenience)
pkill -f "caddy run" 2>/dev/null || true

# Validate config and print environment
echo "Validating Caddyfile..."
caddy validate --config Caddyfile || { echo "Caddyfile validation failed" >&2; exit 1; }

echo "Starting Caddy (debug enabled via global options)"
caddy run --config Caddyfile --adapter caddyfile --environ
