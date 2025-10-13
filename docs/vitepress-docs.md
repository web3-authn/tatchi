# Plan: Host docs with VitePress at example.localhost/docs

This plan introduces VitePress to serve the docs in `examples/vite-secure/src/docs`, mounted at the `/docs` path on the same origin as the Vite app (`https://example.localhost`). It covers local development (with Caddy proxying to separate dev servers) and production build/deploy (single static site with docs in `dist/docs`).

## Goals

- Keep docs source under `examples/vite-secure/src/docs`
- Serve docs at `https://example.localhost/docs`
- Preserve Vite app at `https://example.localhost/` (no route conflicts)
- File-based routing, code highlighting, search, sidebar/navigation via VitePress
- Allow embedding selected React UI (e.g., `Navbar.tsx`) as Web Components in docs, loaded lazily and client-only

---

## Dev topology

- Vite app: `localhost:5174` (already configured)
- VitePress docs: `localhost:5222`
- Caddy (reverse proxy, TLS internal):
  - `https://example.localhost` → Vite app
  - `https://example.localhost/docs/*` → VitePress

Notes
- Keep React Router from claiming `/docs/*` in the app. Let Caddy own `/docs/*` so the Vite app never sees those requests.
- Vite’s `server.allowedHosts` already includes `example.localhost`.

---

## Prod topology

- Build both:
  - Vite app → `examples/vite-secure/dist`
  - VitePress docs → `examples/vite-secure/dist/docs` (via `outDir` or copy step)
- Serve only the app’s `dist/` as the document root. Docs are static under `dist/docs`.

---

## Project layout (no repo root moves)

```
examples/vite-secure/
  src/
    docs/
      .vitepress/
        config.ts
        theme/
          index.ts
      index.md                # migrated from index.mdx
      guides/...              # .md (migrated from .mdx)
      concepts/...            # .md (migrated from .mdx)
      api/...                 # .md (migrated from .mdx)
    components/
      Navbar.tsx
      registerNavbarWC.tsx    # small wrapper to expose <wallet-navbar/>
```

---

## Step 1 — Add VitePress

1) Install (workspace or example app — choose one; examples shown for workspace):

```sh
pnpm -w add -D vitepress@latest
```

2) Create `examples/vite-secure/src/docs/.vitepress/config.ts`:

```ts
import { defineConfig } from 'vitepress'

export default defineConfig({
  // Dev+build assets resolve correctly when hosted at /docs
  base: '/docs/',

  // Site metadata
  title: 'Web3 Authn SDK',
  description: 'Docs for the SDK and examples',

  themeConfig: {
    // Built-in local search (no external service required)
    search: { provider: 'local' },

    // Top nav (edit as needed)
    nav: [
      { text: 'Getting Started', link: '/docs/getting-started/install' },
      { text: 'Guides', link: '/docs/guides/' },
      { text: 'Concepts', link: '/docs/concepts/' },
      { text: 'API', link: '/docs/api/' }
    ],

    // Sidebar (start simple; expand later)
    sidebar: {
      '/docs/getting-started/': [
        { text: 'Install', link: '/docs/getting-started/install' },
        { text: 'Quickstart', link: '/docs/getting-started/quickstart' }
      ],
      '/docs/guides/': [
        { text: 'Guides Index', link: '/docs/guides/' },
      ],
      '/docs/concepts/': [
        { text: 'Key Concepts', link: '/docs/concepts/shamir3pass' }
      ],
      '/docs/api/': [
        { text: 'API Index', link: '/docs/api/' }
      ]
    }
  },

  // Make it easy to import from the app code (for WC wrappers, etc.)
  vite: {
    server: { host: 'localhost', port: 5222 },
    resolve: {
      alias: {
        '@app': new URL('../../', import.meta.url).pathname
      }
    }
  }
})
```

3) Theme entry `examples/vite-secure/src/docs/.vitepress/theme/index.ts` for client-only WC registration:

```ts
import type { Theme } from 'vitepress'

const theme: Theme = {
  enhanceApp: async ({ app }) => {
    if (import.meta.env.SSR) return
    // Lazily define the custom element only on pages that need it
    if (!customElements.get('wallet-navbar')) {
      await import('@app/components/registerNavbarWC.tsx')
    }
  }
}

export default theme
```

4) Package scripts (root or example package.json):

```json
{
  "scripts": {
    "docs:dev": "vitepress dev examples/vite-secure/src/docs --base /docs/ --port 5222",
    "docs:build": "vitepress build examples/vite-secure/src/docs",
    "docs:preview": "vitepress preview examples/vite-secure/src/docs --port 5222"
  }
}
```

5) Syntax highlighting: VitePress uses Shiki by default; no extra action needed. You can customize themes via `markdown.code.highlighter`, but defaults are fine to start.

---

## Step 2 — Route docs via Caddy (dev)

Extend `examples/vite-secure/Caddyfile` site block for `example.localhost` to send `/docs/*` to VitePress. Two workable options:

Option A — keep `/docs` prefix end-to-end (recommended; matches `base: '/docs/'`):

```
example.localhost {
  tls internal
  encode gzip

  @docs path /docs*        # send /docs/* to VitePress dev server
  handle @docs {
    reverse_proxy localhost:5222
  }

  handle {
    reverse_proxy localhost:5174
  }
}
```

Option B — strip `/docs` before proxying (use only if you do NOT set `base: '/docs/'` in VitePress):

```
  @docs path /docs*
  handle @docs {
    uri strip_prefix /docs
    reverse_proxy localhost:5222
  }
```

Also ensure `/etc/hosts` has:

```
127.0.0.1 example.localhost wallet.example.localhost relay-server.localhost
```

Start dev:

```sh
pnpm -C examples/vite-secure dev          # Vite app + Caddy (existing script)
pnpm docs:dev                             # VitePress dev on :5222
```

---

## Step 3 — Avoid router conflicts

- Do not define any React Router routes under `/docs/*` in `examples/vite-secure/src/main.tsx`.
- If you ever add a SPA catch-all, ensure Caddy’s `/docs*` matcher is evaluated first so the app never sees docs routes.
- Current routes (`/`, `/multitx`) are fine; no changes required.

---

## Step 4 — Embed React components as Web Components

Expose small React components from the app as Custom Elements for use in docs. Example wrapper for the `Navbar`:

`examples/vite-secure/src/components/registerNavbarWC.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Navbar } from './Navbar'

class WalletNavbarElement extends HTMLElement {
  private root: ReactDOM.Root | null = null
  connectedCallback() {
    const mount = this.attachShadow({ mode: 'open' })
    const container = document.createElement('div')
    mount.appendChild(container)
    this.root = ReactDOM.createRoot(container)
    this.root.render(<Navbar />)
  }
  disconnectedCallback() {
    this.root?.unmount()
  }
}

if (!customElements.get('wallet-navbar')) {
  customElements.define('wallet-navbar', WalletNavbarElement)
}
```

Use in a VitePress page (lazy + client-only):

```md
---
title: Using the App Navbar in Docs
---

<ClientOnly>
  <wallet-navbar />
</ClientOnly>
```

This keeps the docs bundle slim (component registered only on client) and avoids SSR issues.

---

## Step 5 — Migrate `.mdx` to VitePress `.md`

VitePress does not parse MDX. Migrate progressively:

1) Start with entry point:
   - Rename `examples/vite-secure/src/docs/index.mdx` → `index.md`.
   - Remove MDX imports/JSX; use standard Markdown and VitePress components/admonitions.
2) For each folder (`getting-started`, `guides`, `concepts`, `api`):
   - Rename to `.md` and replace JSX with either:
     - Plain Markdown
     - `<ClientOnly>` + Web Components (from Step 4)
     - VitePress slots/components (e.g., custom containers `::: tip` / `::: warning`)
3) Verify local search finds new pages and sidebar links resolve.

Tips
- Code fences (```ts, ```tsx) are highlighted by Shiki out of the box.
- Use frontmatter `title:` and `outline: [2, 3]` for per-page TOC control.

---

## Step 6 — Production build & single deployable

Add scripts (root or example):

```json
{
  "scripts": {
    "build:app": "pnpm -C examples/vite-secure build",
    "build:docs": "vitepress build examples/vite-secure/src/docs --outDir examples/vite-secure/dist/docs",
    "build:site": "pnpm build:app && pnpm build:docs"
  }
}
```

Serve only `examples/vite-secure/dist/`. The docs live at `dist/docs` so `/docs/*` works under the same origin. Ensure `base: '/docs/'` is set so asset URLs are correct.

Optional hardening
- Add a small static server or CDN rules to cache `/docs/assets/*` aggressively.

---

## Step 7 — Nice-to-haves (iterative)

- Algolia DocSearch (swap `themeConfig.search` to DocSearch when ready)
- Auto-generate sidebar from filesystem via a plugin or script
- Versioned docs (`/docs/vX/`) by duplicating the content root or using branches/tags
- CI job to build both app and docs and publish a single artifact

---

## Quick checklist

- [ ] VitePress installed and `docs/.vitepress/config.ts` created
- [x] Caddy routes `/docs*` → VitePress dev server on :5222
- [x] `base: '/docs/'` set; `docs:dev` runs
- [x] `index.mdx` migrated to `index.md`; first doc renders
- [x] React components exposed as WCs and used via `<ClientOnly>`
- [x] `build:site` places docs in `examples/vite-secure/dist/docs`
- [x] App deploy serves only `dist/` (includes `/docs`)

---

## Status (2025-10-13)

Done
- VitePress scaffolded with theme hook and app alias
- Dev proxy via Caddy for `/docs/*` and `/docs` → `/docs/` redirect
- Navbar exposed as `<wallet-navbar />` (light DOM) and loaded lazily in docs
- Initial MDX → MD migration: getting-started, passkeys, tx-confirmation, concepts (Shamir3Pass, rotation, nonce, rpid, wallet-iframe-architecture, wallet-scoped-credentials, VRF & PRF), API stubs
- Sidebar wired to new pages; dev scripts added (`dev:all`, `dev:with-docs`)

Next
- Migrate remaining guides: wallet-iframe (done), asset-url-resolution (stub), relay-server (stub), device-linking (stub), Cloudflare guides (stubs), iPhone dev (done)
- Consider Algolia DocSearch; otherwise keep local search
- Add CI step to run `build:site` and publish single artifact

---

## Commands summary

Dev
```sh
pnpm -C examples/vite-secure dev     # Vite app + Caddy (existing)
pnpm docs:dev                        # VitePress at :5222
```

Build
```sh
pnpm build:site                      # app → dist, docs → dist/docs
```

Preview (either)
```sh
pnpm -C examples/vite-secure preview # app only
pnpm docs:preview                    # docs only (served at /docs due to base)
```
