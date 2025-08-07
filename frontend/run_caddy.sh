#!/bin/bash

# Create certs directory if it doesn't exist
mkdir -p certs

# Generate certificates using mkcert
mkcert -install
mkcert -key-file certs/example.localhost-key.pem -cert-file certs/example.localhost.pem example.localhost

# Run Caddy with the Caddyfile configuration
caddy run --config Caddyfile

