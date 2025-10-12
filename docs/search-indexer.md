# Docs Search: Frontend Index with Pluggable Backend API

Goal: implement a fast, docs search that works entirely in the browser, while designing an abstraction so we can later swap to a hosted search index (e.g., Cloudflare Workers) with zero UI changes.

## High‑Level Design

- Introduce a small Search API with two providers:
  - `LocalSearchProvider`: builds/loads a client‑side index from MDX/JSON and runs queries in the browser
  - `RemoteSearchProvider`: calls a REST endpoint (later: CF Worker) that returns ranked results
- The UI (search box, results popover) depends on `SearchProvider` only — provider is chosen via config or runtime detection.

## Minimal API (stable contract)

TypeScript interfaces (shared by both providers):

```ts
export type DocPath = `/docs${string}`

export interface SearchDocMeta {
  path: DocPath
  title: string
  headings?: { depth: 1|2|3, text: string, id: string }[]
  summary?: string
}

export interface SearchResult {
  path: DocPath
  title: string
  excerpt: string
  score: number
  // optional anchor for deep linking to a heading
  anchor?: string
}

export interface SearchProvider {
  ready(): Promise<void>
  search(query: string, opts?: { limit?: number }): Promise<SearchResult[]>
}
```

Provider selection:
```ts
function createSearchProvider(): SearchProvider {
  if (import.meta.env.VITE_SEARCH_REMOTE_URL) return new RemoteSearchProvider(...)
  return new LocalSearchProvider(...)
}
```

## Phase 1 — Frontend‑Only (no backend)

1) Index source discovery (Vite)
   - Use `import.meta.glob('./../pages/docs/**/*.mdx', { as: 'raw' })` to lazy‑load raw MDX content on demand
   - Also import the built route map (already exists in `examples/vite-secure/src/pages/DocsPage.tsx`) to resolve MDX module → route path

2) Lightweight tokenizer + scorer
   - Start with a tiny scorer: tokenize to words, lowercase, remove punctuation, compute TF‑IDF‑like score (document frequency approximated client‑side)
   - Alternatively, use `minisearch` or `Fuse.js` (both small and tree‑shakeable)
   - Index fields:
     - `title` (boost x3)
     - H2/H3 headings (boost x2)
     - body text (boost x1)
     - derived `summary` (first ~200 chars of the first paragraph)

3) Heading extraction
   - Simple regex on raw MDX to capture `#`, `##`, `###` headings and generate stable `id`s (slug)
   - Store `{ depth, text, id }` in `SearchDocMeta.headings`

4) Index lifecycle
   - Lazy: build index on first interaction (focus/typing) to keep initial load small
   - Cache index in `IndexedDB` (via simple version key) to persist across page loads; rebuild when app version (hash) changes
   - Support partial loading: hydrate title/summaries first, progressively enrich with full bodies as needed

5) UI integration
   - Wire the input `.docs-search` in `examples/vite-secure/src/pages/docs/DocsLayout.tsx` to the provider
   - Add a results popover below the input with keyboard navigation (Up/Down/Enter/Escape)
   - Result card shows title, highlighted excerpt, and optional heading chip; clicking navigates to `path#anchor`

6) Accessibility
   - `role="combobox"` with `aria-expanded`, `aria-controls`, `aria-activedescendant`
   - Results list as `role="listbox"`/`role="option"`; ensure focus ring and screen reader labels

7) Performance targets
   - First search usable < 300ms on mid‑range device with ~50–150 MDX files
   - Index build off the main thread if needed (Web Worker) — optional phase‑1 stretch
   - Debounce input (150ms), cap results (default 8–10)

## Phase 2 — Pluggable Remote Provider

1) `RemoteSearchProvider` implementation
   - Constructor accepts `baseUrl` and `apiKey?`
   - `ready()` no‑op; `search(q)` → `GET /search?q=...&limit=...`
   - Expects JSON: `{ results: SearchResult[] }`
   - Handles network errors (fallback to local provider if present)

2) Cloudflare Worker reference
   - Worker receives `q`, runs query against an index built during CI (e.g., `minisearch` index serialized to KV/R2)
   - Response shape mirrors `SearchResult[]`
   - Add permissive CORS for wallet/docs origins

3) CI index build (optional early)
   - New script: `pnpm -w run build:docs-index` → parse MDX at build time and emit `search-index.json` (titles/headings/summaries + tokens)
   - Upload to Pages/Worker/R2; local provider can also fetch this JSON to avoid runtime MDX parsing

## Data Formats

Local index (runtime build):
```ts
type LocalIndexDoc = {
  path: DocPath
  title: string
  body: string // raw text extracted from MDX
  headings: { depth: 1|2|3, text: string, id: string }[]
  summary: string
}
```

Prebuilt JSON (CI build):
```ts
type PrebuiltIndex = {
  version: string // app hash or semver
  docs: LocalIndexDoc[]
}
```

## File/Module Plan (frontend)

- Add `examples/vite-secure/src/pages/docs/search/`:
  - `provider.ts` — interfaces + `createSearchProvider()`
  - `local.ts` — LocalSearchProvider (runtime MDX glob + optional prebuilt JSON path)
  - `remote.ts` — RemoteSearchProvider (simple fetch client)
  - `indexWorker.ts` (optional) — build/search in a Web Worker for large corpora
  - `utils.ts` — tokenize, highlight, slugify
- Wire provider into `examples/vite-secure/src/pages/docs/DocsLayout.tsx`:
  - on focus/first keystroke: `await provider.ready()`
  - `onChange`: debounce, call `provider.search(q)`, update popover results
- Style: extend `docs.css` for results list, focus states, and dark/light themes

## Swap Strategy

- Provider chosen by env/config — no UI changes required
- Local provider supports two modes:
  - pure runtime (raw MDX parsing)
  - prebuilt index (download JSON) — mirrors remote behavior for parity testing

## Security & Privacy

- Local mode: no network calls; queries never leave the device
- Remote mode: send only query string + optional referer; avoid sending full page content
- Rate‑limit remote calls; set `Cache-Control: public, max-age=60` for common queries if acceptable

## Tasks & Acceptance

1) Implement SearchProvider interfaces and factory
2) Implement LocalSearchProvider (runtime MDX glob) with Fuse.js or MiniSearch
3) Wire up UI: input + results popover with keyboard support
4) Cache index in IndexedDB and invalidate on app version change
5) Add feature flag/env to select remote provider; implement fetch client
6) Optional: prebuilt JSON + worker offload for large corpora

Acceptance:
- Type “nonce” or “wallet iframe” returns ranked matches in <300ms after first warm
- Deep linking to `#heading` works; back/forward navigations preserve query until blur
- Toggling env to remote provider continues to work without UI changes

## Future Enhancements

- Synonyms/stemming (e.g., “PRF” ~ “pseudorandom function”)
- Section‑level ranking (per‑heading chunks) for better recall
- Analytics: anonymized `q` frequency with opt‑in
- “On this page” ToC integration powered by the same heading scan

