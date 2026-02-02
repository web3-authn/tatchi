# Tatchi Passkey Embedded Wallet SDK

Monorepo for `@tatchi-xyz/sdk`, an embedded passkey wallet SDK for NEAR.

## Documentation

For documentation of the Tatchi SDK internals, see: [`sdk/README.md`](sdk/README.md).
There you will find detailed explanations for installing, and running examples.

For user-facing documentation, visit: [https://tatchi.xyz/docs](https://tatchi.xyz/docs)


## Local development (quick start)

### Prerequisites

- pnpm (`corepack enable`)
- Rust toolchain + `wasm-pack` (the SDK builds Rust → WASM workers)
- Bun (used to bundle SDK web workers)
- Caddy (used by the examples for local HTTPS + `.localhost` hosts)

```bash
corepack enable
brew install caddy bun
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

### 1) Install and Build SDK

```bash
pnpm install
pnpm -C sdk build
```

### 2) Run the relay

The relay server powers account creation flows and Shamir 3‑pass operations used by the SDK/examples.

```bash
pnpm run server
```

- Relay server is available at `https://relay-server.localhost` (Caddy proxies to `http://localhost:3000`).
- Relay configuration lives in `examples/relay-server/` (see `examples/relay-server/README.md` and `examples/relay-server/.env`).

### 3) Run examples

Examples typically require HTTPS (WebAuthn/passkeys) and a dedicated wallet origin. The dev setups use Caddy with `tls internal` so you can use `.localhost` origins locally.

#### Vite example

In a second terminal:

```bash
pnpm examples:docs
```

What this starts:
- App dev server (proxied): `https://example.localhost`
- Wallet origin: `https://wallet.example.localhost`
- Wallet service route: `https://wallet.example.localhost/wallet-service`
- Relay proxy: `https://relay-server.localhost` (make sure `pnpm run server` is running)

Notes:
- First run may prompt you to trust Caddy’s local CA (`caddy trust`) so browsers accept the HTTPS certs.
- If you accidentally open the raw Vite URL (e.g. `http://localhost:5174`), WebAuthn may fail; prefer the `https://*.localhost` URLs.



## Release

See `docs/deployment/release.md`.
