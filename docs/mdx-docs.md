Docs Integration Plan (Markdown in-app)

Goal: Serve the documentation experience from the React/Vite app (route `/docs`) without Vocs, while keeping the layout/features on par with the VitePress/Vocs UX.

Deliverables / Requirements
- Markdown pipeline that ingests `.mdx` sources via `import.meta.glob` (raw) and renders:
  - Headings, paragraphs, blockquotes, tables, lists
  - Syntax-highlighted code fences with language badges
  - Code groups (tabbed) based on `:::code-group` and fence labels (` ```lang [label]`)
  - Callouts (`:::info`, etc.) and multi-step blocks (`::::steps`)
- Responsive UI: desktop sidebar + search bar (sticky); mobile topbar with dropdown navigation; both theme-aware (light/dark through SDK theme context).
- Sidebar: brand header (`Tatchi.xyz` linking home), collapsible sections, persistent footer links.
- Search: client-side filter of sidebar entries with highlight of matches.
- Hosting: Docs share the SPA build (no static export); Caddy proxies `/docs` through the app.

Step-by-step Strategy
1. **Tooling setup**
   - Import markdown sources with `import.meta.glob` (`as: 'raw'`).
   - Implement a renderer that parses markdown tokens required above and applies Prism-based syntax highlighting (or swap to Shiki if it provides clear benefits without heavy runtime cost).
   - Ship renderer-specific styles for typography, callouts, code blocks, and code-group tabs.

2. **Docs file structure**
   - Keep markdown content under `examples/vite-secure/src/pages/docs`.
   - Use a manifest (`src/docs/manifest.ts`) generated via `import.meta.glob` to list routes + sections; auto-generate sidebar structure and expose metadata for search.

3. **UI integration**
   - `/docs/*` route renders a `DocsLayout` component that hydrates the sidebar/mobile nav, search bar, and markdown content.
   - Layout consumes SDK theme (`useTheme`) and `useIsMobile` hook for responsive behaviour.
   - Sidebar sections collapsible; mobile dropdown toggled via topbar control; footer links present in both desktop and mobile overlays.

4. **Hosting & build pipeline**
   - Vite dev server + build handle docs alongside app. No Vocs scripts remain; `pnpm run dev`/`pnpm run build` operate normally.
   - Caddy simply proxies `example.localhost` to Vite (no separate docs origin).

5. **Cleanup / documentation**
   - Remove Vocs folders/scripts (done).
   - Keep this document updated with outstanding tasks and usage notes.
   - Validate via `pnpm frontend:secure` (after installing workspace deps) and deep-link testing.

- Implementation Log / TODOs
  - [x] Built responsive docs shell (desktop sidebar + mobile topbar) with theme awareness and search filter.
  - [x] Generated sidebar/route manifest automatically from filesystem.
  - [x] Replaced Vocs scripts/Caddy config; docs now ship inside SPA.
  - [x] Replace bespoke markdown renderer with unified + remark/rehype pipeline (slugged headings, TOC-ready anchors, sanitisation).
  - [x] Switch syntax highlighting from Prism to Shiki via `rehype-pretty-code`.
  - [x] Implement tabbed code-groups using markdown directives + rehype transforms.

Step-by-step Strategy
1. **Tooling setup**
   - Import markdown sources with `import.meta.glob` (`as: 'raw'`) so no new bundler plugins are required.
   - Implement a small renderer that parses headings, lists, code fences, callouts, etc., and outputs sanitized HTML.
   - Ship renderer-specific styles for typography, callouts, and code blocks.

2. **Docs file structure**
   - Create `examples/vite-secure/src/docs/` with the existing MDX content migrated from `examples/vite-secure/docs/pages`.
   - Provide an index manifest (e.g., `docsIndex.ts`) describing sidebar sections + MDX modules.
   - Author a script or Vite plugin that scans the docs directory and auto-generates the manifest so sidebar navigation and routes stay in sync.
   - Introduce shared MDX components (callouts, layout wrappers) if needed.

3. **UI integration**
   - Add a `/docs/*` route in `examples/vite-secure/src/main.tsx`.
   - Build a `DocsLayout` React component that reads the manifest, renders responsive sidebar/mobile navigation, search bar, and markdown content.
   - Ensure the navbar “Docs” link points to `/docs` so routing stays inside the SPA.

4. **Hosting & build pipeline**
   - Remove reliance on the Vocs build scripts; docs ship inside the React bundle now.
   - Simplify scripts: `pnpm run dev` no longer needs a pre-docs build, and root `frontend:secure` should just start Vite + Caddy.
   - Update Caddy config so `/docs` stays on the SPA (remove static file server).

5. **Cleanup & documentation**
   - Delete unused Vocs artifacts (`examples/vite-secure/docs/`, scripts, `docs/vocs-docs.md`).
   - Refresh developer docs (this file) with usage/testing tips.
   - Run regression checks: `pnpm frontend:secure`, confirm `/` and `/docs/...` routes, ensure deep links and reloads work.

Open Questions / Options
- Theme + styling for docs (reuse app styles vs. dedicated styling bundle).
- Search functionality (manual or future enhancement using a lightweight search lib).

- [x] Added custom markdown renderer, responsive layout, and styles.
- [x] Generated docs manifest + sidebar from filesystem using `import.meta.glob`.
- [x] Wired `/docs/*` route and runtime loader with error/loading states.
- [x] Migrated markdown content into `src/pages/docs`.
- [x] Simplified scripts/Caddy to rely on the SPA build only.
- [x] Removed Vocs artifacts.
