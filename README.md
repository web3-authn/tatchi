# Web3Authn SDK

Monorepo for `@tatchi-xyz/sdk`: an embedded passkey wallet SDK for NEAR:
- No popups, no extensions needed
- One-touch accout creation
- Serverless, no need for server hosting or MPC servers, etc.
- Built-in account recovery with multisig emails, and device linking with QR scans.
- Secured with WebAuthn + origin-isolated wallet iframe + worker/WASM crypto


## Install (consumers)

```bash
npm install @tatchi-xyz/sdk
# or
pnpm add @tatchi-xyz/sdk
```

- SDK API docs: `sdk/README.md`
- Main integration guide: `examples/tatchi-docs/src/docs/guides/wallet-iframe.md`

## Run locally (examples)

```bash
pnpm install
pnpm -C sdk build
```

- `examples/vite` uses Caddy for local HTTPS + custom hosts (`brew install caddy`; first run may prompt for trust via `caddy trust`).
- Wallet host (Vite): `pnpm -C examples/vite dev` (opens `https://example.localhost` and `https://wallet.example.localhost`)
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

- Wallet iframe / origin isolation: `sdk/docs/wallet-iframe-architecture.md`
- Security model: `examples/tatchi-docs/src/docs/concepts/security-model.md`
- VRF challenges: `examples/tatchi-docs/src/docs/concepts/vrf-challenges.md`
- Relay deployment: `examples/tatchi-docs/src/docs/guides/relay-server-deployment.md`

## Release

See `docs/deployment/release.md`.

## License

MIT (see `LICENSE`).

## Support

- Issues: https://github.com/web3-authn/sdk/issues
