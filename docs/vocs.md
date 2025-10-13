# Plan: Migrate docs from VitePress to Vocs (vocs.dev)

This plan replaces VitePress with Vocs and makes Vocs the site root. The Vite dev server for the app is removed; the homepage (example.localhost) is served by Vocs and embeds our existing React UI (Navbar, HomePage, Toaster). Docs remain under `/docs/*` within the same Vocs site. The plan covers dev/prod topology, routing, config, content reuse, React component embedding, and a reversible rollout.

## Goals

- Keep docs sources in `examples/vite-secure/src/docs`
- Make `https://example.localhost/` the Vocs homepage (embedding our React UI)
- Docs live at `https://example.localhost/docs/*`
- Remove the Vite dev server and React Router (Vocs provides routing)
- Retain search, syntax highlighting, and sidebar/nav
- Allow React component usage in docs (MDX) with minimal bundle impact

## Dev Topology (Vocs as the only dev server)

- Vocs site (home + docs): `localhost:5225`
- Caddy reverse-proxy (TLS internal):
  - `https://example.localhost` → Vocs
  - `https://example.localhost/docs/*` → Vocs (same server)

Notes
- Do not create React Router routes under `/docs/*` in the Vite app; let Caddy own `/docs/*`.
- Keep `allowedHosts` set for `example.localhost` on both dev servers.

## Prod Topology (single static site)

- Build Vocs and ship a single static artifact as the document root:
  - Vocs output → `examples/vite-secure/dist` (homepage at `/`, docs under `/docs/*`)

## File Structure (no content move)

```
examples/vite-secure/
  src/
    docs/
      index.mdx|md                 # docs home (keeps /docs URL)
      getting-started/
      guides/
      concepts/
      api/
      vocs.config.ts               # Vocs site config (lives next to docs)
```

## Step 1 — Add Vocs

Install (workspace root):

```sh
pnpm -w add -D vocs@latest
```

Add scripts (root `package.json`):

```json
{
  "scripts": {
    "docs:vocs:dev": "vocs dev examples/vite-secure/src/docs --port 5225",
    "docs:vocs:build": "vocs build examples/vite-secure/src/docs --outDir examples/vite-secure/dist",
    "docs:vocs:preview": "vocs preview examples/vite-secure/dist --port 5225"
  }
}
```

## Step 2 — Create `vocs.config.ts`

Create `examples/vite-secure/src/docs/vocs.config.ts`:

```ts
import { defineConfig } from 'vocs'

export default defineConfig({
  title: 'Tatchi SDK',
  description: 'Docs for the SDK and examples',

  // Site is served at root; docs are nested under /docs in the sidebar/links
  base: '/',

  // Dev server
  server: {
    host: 'localhost',
    port: 5225,
    allowedHosts: ['example.localhost', 'pta-m4.local']
  },

  // Output entire site to the example app’s dist root
  outDir: 'examples/vite-secure/dist',

  // Keep sources in-place (no move)
  rootDir: '.',

  // Top nav
  nav: [
    { text: 'SDK', link: '/docs' }
  ],

  // Sidebar (collapsible groups)
  sidebar: [
    {
      text: 'Getting Started',
      collapsed: false,
      items: [
        { text: 'Install', link: '/docs/getting-started/install' },
        { text: 'Quickstart', link: '/docs/getting-started/quickstart' }
      ]
    },
    {
      text: 'Guides',
      collapsed: false,
      items: [
        { text: 'Guides Index', link: '/docs/guides/' },
        { text: 'Wallet Iframe', link: '/docs/guides/wallet-iframe' },
        { text: 'Passkeys', link: '/docs/guides/passkeys' },
        { text: 'Secure Tx Confirmation', link: '/docs/guides/tx-confirmation' },
        { text: 'Asset URL Resolution', link: '/docs/guides/asset-url-resolution' },
        { text: 'Relay Server', link: '/docs/guides/relay-server' },
        { text: 'Device Linking', link: '/docs/guides/device-linking' },
        { text: 'Cloudflare Worker', link: '/docs/guides/cloudflare-worker' },
        { text: 'Cloudflare WASM Imports', link: '/docs/guides/cloudflare-wasm-imports' },
        { text: 'Cloudflare + GitHub Actions', link: '/docs/guides/cloudflare-github-actions-setup' },
        { text: 'iPhone (Safari) Dev', link: '/docs/guides/iphone-dev/' },
        { text: 'Safari address bar fix', link: '/docs/guides/iphone-dev/safari-address-bar-fix' }
      ]
    },
    {
      text: 'Concepts',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/docs/concepts/' },
        { text: 'Shamir 3‑pass', link: '/docs/concepts/shamir3pass' },
        { text: 'Server key rotation', link: '/docs/concepts/shamir3pass-rotate-keys' },
        { text: 'Nonce manager', link: '/docs/concepts/nonce-manager' },
        { text: 'RPID policy', link: '/docs/concepts/rpid-policy' },
        { text: 'Wallet iframe architecture', link: '/docs/concepts/wallet-iframe-architecture' },
        { text: 'Wallet‑scoped credentials', link: '/docs/concepts/wallet-scoped-credentials' },
        { text: 'VRF & PRF', link: '/docs/concepts/vrf-and-prf' }
      ]
    },
    {
      text: 'API',
      collapsed: false,
      items: [
        { text: 'API Index', link: '/docs/api/' },
        { text: 'Passkey Manager', link: '/docs/api/passkey-manager' },
        { text: 'WebAuthn Manager', link: '/docs/api/webauthn-manager' },
        { text: 'React Components', link: '/docs/api/react-components' },
        { text: 'Client', link: '/docs/api/client' },
        { text: 'Server', link: '/docs/api/server' }
      ]
    }
  ],

  // Features
  search: true,         // Vocs local search
  codeHighlighter: 'shiki'
})
```

## Step 3 — Caddy routing (dev)

Update `examples/vite-secure/Caddyfile` to proxy the entire site to Vocs (no Vite dev server):

```
example.localhost {
  tls internal
  encode gzip
  reverse_proxy localhost:5225
}
```

Start dev:

```sh
pnpm -C examples/vite-secure run_caddy.sh   # Caddy only (serves example.localhost)
pnpm docs:vocs:dev                         # Vocs at :5225
```

## Step 4 — Use app React components on the Vocs homepage

You can reuse components from the app (e.g., `HomePage.tsx`) in the Vocs homepage in two supported ways. Avoid importing the app’s global CSS (`@app/index.css`) to prevent layout conflicts — instead, add small, docs‑scoped styles if needed.

Prereq: add an alias to import from the app’s `src` safely.

```ts
// examples/vite-secure/src/docs/vocs.config.ts
import { defineConfig } from 'vocs'
import { fileURLToPath } from 'node:url'

const appSrc = fileURLToPath(new URL('../../', import.meta.url))

export default defineConfig({
  // ...existing config...
  vite: {
    resolve: { alias: { '@app': appSrc } },
    server: { fs: { allow: [appSrc] } },
  },
})
```

Approach A — Homepage component (recommended)

1) Create a Vocs homepage component that wraps your app’s `HomePage` with the minimal SDK providers. Keep it client‑only and avoid importing `@app/index.css`.

```tsx
// examples/vite-secure/src/docs/Homepage.tsx
import React from 'react'
import { PasskeyProvider, ThemeProvider, ThemeScope } from '@tatchi/sdk/react'
import '@tatchi/sdk/react/styles'
import { HomePage } from '@app/pages/HomePage'

export default function DocsHomepage() {
  if (typeof window === 'undefined') return null // SSR guard

  const env = import.meta.env
  return (
    <ThemeProvider>
      <PasskeyProvider
        config={{
          relayer: {
            url: env.VITE_RELAYER_URL,
            accountId: env.VITE_RELAYER_ACCOUNT_ID,
          },
          vrfWorkerConfigs: { shamir3pass: { relayServerUrl: env.VITE_RELAYER_URL } },
          iframeWallet: {
            walletOrigin: env.VITE_WALLET_ORIGIN,
            walletServicePath: env.VITE_WALLET_SERVICE_PATH,
            rpIdOverride: env.VITE_RP_ID_BASE,
            sdkBasePath: env.VITE_SDK_BASE_PATH,
            enableSafariGetWebauthnRegistrationFallback: true,
          },
        }}
      >
        <ThemeScope as="div">
          {/* Optional: light, docs-only styles for layout-root */}
          <style>{`.layout-root{max-width:960px;margin:0 auto;padding:16px}`}</style>
          <HomePage />
        </ThemeScope>
      </PasskeyProvider>
    </ThemeProvider>
  )
}
```

2) Point Vocs to use it as the homepage component.

```ts
// examples/vite-secure/src/docs/vocs.config.ts
export default defineConfig({
  // ...
  homepage: { component: './Homepage.tsx' },
})
```

Approach B — Custom components (use inside MDX)

1) Create a wrapper component you can drop into any MDX page.

```tsx
// examples/vite-secure/src/docs/components/HomeDemo.tsx
import React from 'react'
import DocsHomepage from '../Homepage'
export const HomeDemo = () => <DocsHomepage />
```

2) Register it as a global custom component and use it in `index.mdx`.

```ts
// examples/vite-secure/src/docs/vocs.config.ts
import { HomeDemo } from './components/HomeDemo'
export default defineConfig({
  // ...
  components: { HomeDemo },
})
```

```mdx
<!-- examples/vite-secure/src/docs/index.mdx -->
<HomeDemo />
```

Notes
- Keep the providers minimal and avoid importing the app’s global stylesheet to prevent layout clashes. If a small utility class (e.g., `.layout-root`) is needed, inline it or add a tiny docs‑scoped CSS file and include it via `vocs.config.ts`.
- If you don’t want the homepage to be interactive, you can omit `PasskeyProvider` and render only visual components.

## Step 4 — Keep `/docs` URL but show Install

Reuse the existing `index.md` pattern to surface Install while staying on `/docs`:

- Option A: `index.md` renders the Install component via MDX import (keeps URL, shows Install)
- Option B: use `redirects` (if enabled) to treat `/docs` as an alias of `/docs/getting-started/install` while preserving visible URL via Caddy `uri replace` (already present)

## Step 5 — Content compatibility

- Vocs supports both `.md` and `.mdx`; current content largely works as-is
- Remove VitePress‑specific components (e.g., `<ClientOnly>`) where not needed; MDX can import React directly
- For links to app pages not generated by Vocs, use explicit targets:
  - `[Open Demos](/multitx){target="_self"}`

## Step 6 — React in docs (two options)

- MDX import (simplest): import React components directly in `.mdx` pages
- Web Components (portable): keep `<wallet-navbar />` usage; component is already isolated in Shadow DOM and can be registered on the client via a small `enhance` script if needed

Initial recommendation: use MDX for examples; keep WC only for cross‑framework snippets.

## Step 7 — Build & single artifact deploy

Add/adjust scripts (root `package.json`):

```json
{
  "scripts": {
    "build:site": "pnpm docs:vocs:build"
  }
}
```

Deploy only `examples/vite-secure/dist/` as your document root. Home is `/`, docs under `/docs/*`.

## Step 8 — Remove Vite dev server and React Router

We’re consolidating to a Vocs‑only dev experience:

- Remove `react-router-dom` usage from `examples/vite-secure/src/main.tsx` and child components. Replace `<BrowserRouter>` with plain composition.
- Update `Navbar.tsx` links to use external anchors for docs (e.g., `<a href="/docs" rel="external">`).
- Remove app dev scripts that run `vite dev`; keep only the Vocs and Caddy scripts for local development.
- Keep the example app’s components and pages for reuse inside the Vocs homepage and MDX demos.

## Step 8 — Rollout + rollback

- Phase 1 (side‑by‑side):
  - Keep VitePress scripts for a short period (`docs:dev`, `docs:build`) for comparison
  - Add Vocs scripts alongside; switch Caddy to Vocs in dev
- Phase 2 (flip prod):
  - Replace the docs build step in CI with `docs:vocs:build`
  - Remove VitePress config/theme after validation
- Rollback plan:
  - Revert Caddy’s `/docs*` upstream to VitePress dev port and run previous build scripts

## Checklist

- [ ] `vocs` installed; scripts added
- [ ] `examples/vite-secure/src/docs/vocs.config.ts` created
- [ ] Caddy proxies `/docs*` to Vocs on :5225 (dev)
- [ ] `/docs` URL shows Install page contents
- [ ] Search and code highlighting work
- [ ] MDX imports render React examples; app links use `{target="_self"}`
- [ ] `build:site` places docs in `dist/docs` and serves from a single origin

## Notes

- If the Vite app’s global CSS was previously imported into docs, avoid doing that with Vocs to prevent layout clashes
- Keep React Router from defining `/docs/*` routes to avoid conflicts
- If you need a custom theme tweak, place it under `examples/vite-secure/src/docs/styles.css` and register via `vocs.config.ts` without importing the app stylesheet
