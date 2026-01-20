# Web3Authn SDK

Monorepo for `@tatchi-xyz/sdk`: an embedded passkey wallet SDK for NEAR.

## Installation

```bash
pnpm install
pnpm -C sdk build
```

Run examples from the repo root:

```bash
pnpm run server
pnpm examples:vite
```

- `pnpm examples:vite` uses Caddy for local HTTPS + custom hosts (`brew install caddy`; first run may prompt for trust via `caddy trust`) and spins up a wallet server as well.
- Relay server: `pnpm run server` (reachable at `https://relay-server.localhost`, proxies `http://localhost:3000`)
- Docs site (VitePress): `pnpm run docs:dev`

## Repo development

### Useful commands

- Build SDK (dev): `pnpm -C sdk build`
- Build SDK (prod/release-style): `pnpm -C sdk build:prod`
- SDK watch mode: `pnpm -C sdk dev`
- Tests: `pnpm -C sdk test`
- Type check: `pnpm -C sdk run type-check`

## Architecture

- Wallet iframe / origin isolation: `sdk/docs/implementation/wallet-iframe-architecture.md`
- Security model: `examples/tatchi-docs/src/docs/concepts/security-model.md`
- VRF + WebAuthn: `examples/tatchi-docs/src/docs/concepts/vrf-webauthn.md`
- Relay deployment: `examples/tatchi-docs/src/docs/guides/relay-server-deployment.md`

## Release

See `docs/deployment/release.md`.

## License

MIT (see `LICENSE`).
