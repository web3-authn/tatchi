# Vocs Integration (Option A)

## Dev/Prod Split

- **Development** runs two Vite servers:
  - `pnpm docs:dev` starts the Vocs dev server on `127.0.0.1:5175`.
  - `vite` (from `pnpm dev` or `pnpm frontend:secure`) serves the app on `localhost:5174`.
  - `run_caddy.sh` proxies `https://example.localhost/docs` to Vocs while keeping the rest of the routes on the app server.
- **Production** keeps a single logical bundle:
  - `pnpm docs:build && pnpm vite build` emits the app into `dist/` and copies the docs build to `dist/docs/`.
  - Any static host can serve `dist/`; `/docs/*` resolves to the Vocs build with the correct `basePath` baked in.

## Key Routing Rules (dev via Caddy)

- `/docs/*` and `/docs/@hmr*` have the `/docs` prefix stripped before hitting the Vocs server (Vocs dev runs with `basePath=''`).
- `/.vocs/*`, `/@id/vocs*`, `/@id/__x00__virtual:*`, `/@fs/.../vocs/...`, and absolute vanilla-extract CSS paths are forwarded directly to `127.0.0.1:5175`.
- Generic websocket upgrades (`Connection: Upgrade`) go to the docs server unless the path is `/app/@hmr*` (reserved for the app HMR stream).
- The app’s own HMR endpoint now lives at `/app/@hmr` to avoid clashes.

## Gotchas We Hit

1. **Hydration flashes to NotFound** – Serving the built docs statically caused the prerendered HTML to differ from the client-side router. Running the Vocs dev server directly solved this.
2. **404s for Vocs-only endpoints** – Requests such as `/.vocs/theme.css`, `/@id/__x00__virtual:config`, and vanilla-extract CSS paths initially fell through to the app server. Explicit Caddy matchers now route them to 5175.
3. **WebSocket collisions** – Both servers originally used `wss://example.localhost/?token=…`. Moving the app HMR to `/app/@hmr` and forwarding the remaining websocket traffic to Vocs fixed it.
-4. **Base path mismatches** – Dev runs Vocs with `basePath=''` (the proxy strips `/docs`), while production sets `VOCS_BASE_PATH=/docs` during `docs:build`. The post-build script still rewrites assets to `/docs/...` and injects `<base href="/docs/">` so links remain rooted correctly when deployed.
5. **MDX links need `/docs` prefixes** – Sidebar entries and internal links keep the `/docs` prefix to match Vocs’ basename. The `prepare-docs.mjs` script can normalise any stray links if needed.

## Workflow Summary

```bash
# Dev (two servers + Caddy)
pnpm frontend:secure

# Prod bundle
pnpm -C examples/vite-secure build
```

With this setup we retain all Vocs features (search dialog, live navigation, HMR) during development while shipping a single static output in production.
