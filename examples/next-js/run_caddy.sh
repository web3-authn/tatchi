#!/bin/bash
set -euo pipefail

if command -v caddy >/dev/null 2>&1; then
  caddy trust || true
else
  echo "Caddy not found. Please install Caddy (brew install caddy)" >&2
  exit 1
fi

pkill -f "caddy run" 2>/dev/null || true

echo "Validating Caddyfile..."
caddy validate --config Caddyfile || { echo "Caddyfile validation failed" >&2; exit 1; }

echo "Starting Caddy"
caddy run --config Caddyfile --adapter caddyfile --environ

