// Minimal Vite dev plugin(s) to support Passkey Manager modes.
// See docs/passkey-manager-modes.md (Vite Plugin section).
//
// What these plugins do:
// - Serve SDK assets under a base path, expose a wallet service route,
// - Add dev headers (COOP/COEP/CORP + Permissions-Policy), and enforce WASM MIME.
// - IMPORTANT: Strict CSP is scoped only to wallet HTML routes (/wallet-service, /export-viewer),
//   not to the host app pages. App routes remain free to use inline styles/scripts.

import * as fs from 'node:fs'
import * as path from 'node:path'
import { createRequire } from 'node:module'
import { buildPermissionsPolicy, buildWalletCsp } from './headers'
import {
  addPreconnectLink,
  buildWalletServiceHtml,
  buildExportViewerHtml,
  applyCoepCorp,
  echoCorsFromRequest,
  fetchRorOriginsFromNear
} from './plugin-utils'

// Avoid importing 'vite' types to keep this package light. Define a minimal shape.
export type VitePlugin = {
  name: string
  apply?: 'serve' | 'build'
  enforce?: 'pre' | 'post'
  configureServer?: (server: any) => void | Promise<void>
}
// For consumers that prefer a neutral name without importing Vite types
export type ViteLikePlugin = VitePlugin

export type Web3AuthnDevOptions = {
  mode?: 'self-contained' | 'front-only' | 'wallet-only'
  sdkDistRoot?: string
  sdkBasePath?: string
  walletServicePath?: string
  walletOrigin?: string
  setDevHeaders?: boolean
  enableDebugRoutes?: boolean
}

export type ServeSdkOptions = {
  sdkDistRoot?: string
  sdkBasePath?: string
  enableDebugRoutes?: boolean
}

export type WalletServiceOptions = {
  walletServicePath?: string
  sdkBasePath?: string
}

export type DevHeadersOptions = {
  walletOrigin?: string
  walletServicePath?: string
  sdkBasePath?: string
  /**
   * Optional dev-time CSP for the wallet service route.
   *  - 'strict': no inline scripts/styles (mirrors production defaults)
   *  - 'compatible': allows inline scripts/styles (useful for debugging)
   */
  devCSP?: 'strict' | 'compatible'
}

const requireCjs = createRequire(import.meta.url)

/**
 * Normalize a path base used to mount SDK assets or routes.
 * - Ensures a single leading slash
 * - Removes trailing slash (except for root)
 * Used by both app and wallet-iframe dev servers when composing routes.
 */
function normalizeBase(p?: string, fallback = '/sdk'): string {
  let out = (p || fallback).trim()
  if (!out.startsWith('/')) out = '/' + out
  // keep trailing slash off for consistent join logic
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1)
  return out
}

/**
 * Resolve the absolute filesystem directory that contains the built SDK ESM files.
 * Falls back to @tatchi-xyz/sdk/dist when resolution fails.
 * Used by both app and wallet-iframe dev servers for serving /sdk/*.
 */
function resolveSdkDistRoot(explicit?: string): string {
  if (explicit) return path.resolve(explicit)
  // Resolve the installed package (works with workspace + node_modules)
  const pkgPath = requireCjs.resolve('@tatchi-xyz/sdk/package.json')
  const pkgDir = path.dirname(pkgPath)
  try {
    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { module?: string }
    const esmEntry = pkgJson.module || 'dist/esm/index.js'
    const esmAbs = path.resolve(pkgDir, esmEntry)
    // dist root is one level above the esm folder
    return path.resolve(path.dirname(esmAbs), '..')
  } catch {
    // Best effort: assume conventional dist layout
    return path.join(pkgDir, 'dist')
  }
}

/**
 * Infer and set a proper Content-Type header for a given file path.
 * Used by both app and wallet-iframe dev servers while streaming assets.
 */
function setContentType(res: any, filePath: string) {
  const ext = path.extname(filePath)
  switch (ext) {
    case '.js':
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      break
    case '.css':
      res.setHeader('Content-Type', 'text/css; charset=utf-8')
      break
    case '.map':
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      break
    case '.json':
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      break
    case '.wasm':
      res.setHeader('Content-Type', 'application/wasm')
      break
    case '.html':
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      break
    default:
      res.setHeader('Content-Type', 'application/octet-stream')
  }
}

/**
 * Return the first candidate path that exists and is a file.
 * Helper for robust /sdk/* asset resolution on dev servers (app and wallet).
 */
function tryFile(...candidates: string[]): string | undefined {
  for (const file of candidates) {
    try {
      const stat = fs.statSync(file)
      if (stat.isFile()) return file
    } catch {}
  }
  return undefined
}

// RPC helpers are provided by plugin-utils to share logic across frameworks.

// Shared assets emitted/served for the wallet service bootstrap.
const WALLET_SHIM_SOURCE = "window.global ||= window; window.process ||= { env: {} };\n"
const WALLET_SURFACE_CSS = [
  'html, body { background: transparent !important; margin:0; padding:0; }',
  'html, body { color-scheme: normal; }',
  '',
  // Class-based surface for strict CSP setups toggled by JS
  'html.w3a-transparent, body.w3a-transparent { background: transparent !important; margin:0; padding:0; color-scheme: normal; }',
  '',
  // Minimal portal styles used by confirm-ui (no animation; child components handle transitions)
  '.w3a-portal { position: relative; z-index: 2147483647; opacity: 0; pointer-events: none; }',
  '.w3a-portal.w3a-portal--visible { opacity: 1; pointer-events: auto; }',
  '',
  // Provide baseline tokens only when the document does not declare a theme.
  // This avoids overriding :root[data-w3a-theme] values supplied by token sheet
  // or integrator-injected themes.
  ':root:not([data-w3a-theme]) {',
  '  --w3a-colors-textPrimary: #f6f7f8;',
  '  --w3a-colors-textSecondary: rgba(255,255,255,0.7);',
  '  --w3a-colors-surface: rgba(255,255,255,0.08);',
  '  --w3a-colors-surface2: rgba(255,255,255,0.06);',
  '  --w3a-colors-surface3: rgba(255,255,255,0.04);',
  '  --w3a-colors-borderPrimary: rgba(255,255,255,0.14);',
  '  --w3a-colors-borderSecondary: rgba(255,255,255,0.1);',
  '  --w3a-colors-colorBackground: #0b0c10;',
  '  /* Default viewport custom properties for width/height calculations */',
  '  --w3a-vw: 100vw;',
  '  --w3a-vh: 100vh;',
  '}',
  '',
].join('\n')

/**
 * Tatchi SDK plugin: serve SDK assets under a stable base (default: /sdk) with COEP/CORP and permissive CORS.
 * Where it runs: both the app server and the wallet-iframe server.
 * - App server: lets host pages and Lit components load SDK CSS/JS locally.
 * - Wallet server: used by /wallet-service to load wallet-iframe-host.js and related CSS/JS.
 */
export function tatchiServeSdk(opts: ServeSdkOptions = {}): VitePlugin {
  const configuredBase = normalizeBase(opts.sdkBasePath, '/sdk')
  const sdkDistRoot = resolveSdkDistRoot(opts.sdkDistRoot)
  const enableDebugRoutes = opts.enableDebugRoutes === true

  // In dev we want both '/sdk' and a custom base to work.
  const bases = Array.from(new Set([configuredBase, normalizeBase('/sdk')]))
    // Prefer longest base match first (e.g., '/sdk/esm/react' before '/sdk')
    .sort((a, b) => b.length - a.length)

  return {
    name: 'tatchi:serve-sdk',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      // Serve a tiny shim as a virtual asset to enable strict CSP (no inline scripts)
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = (req.url || '').split('?')[0]
        if (url === configuredBase + '/wallet-shims.js') {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
          // Align with SDK asset headers so COEP/CORP environments can import
          applyCoepCorp(res)
          // Dev-only CORS echo (no preflight handling on this route)
          echoCorsFromRequest(res, req, { handlePreflight: false })
          res.end(WALLET_SHIM_SOURCE)
          return
        }
        if (url === configuredBase + '/wallet-service.css') {
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/css; charset=utf-8')
          // Important: provide CORP for cross‑origin CSS so COEP documents can load it
          applyCoepCorp(res)
          // Dev-only CORS echo (no preflight handling on this route)
          echoCorsFromRequest(res, req, { handlePreflight: false })
          res.end(WALLET_SURFACE_CSS)
          return
        }
        next()
      })
      // Optional debug route to confirm resolution
      if (enableDebugRoutes) {
        server.middlewares.use('/__sdk-root', (req: any, res: any) => {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(sdkDistRoot)
        })
      }

      // Serve files under any recognized base from sdkDistRoot with fallbacks
      server.middlewares.use((req: any, res: any, next: any) => {
        if (!req.url) return next()
        const url = req.url.split('?')[0]

        const matchBase = bases.find((b) => url.startsWith(b + '/'))
        if (!matchBase) return next()

        const rel = url.slice((matchBase + '/').length)
        // Try dist/esm/sdk first (canonical), then common fallbacks
        const candidate = tryFile(
          path.join(sdkDistRoot, 'esm', 'sdk', rel),
          path.join(sdkDistRoot, rel),
          path.join(sdkDistRoot, 'esm', rel)
        )

        if (!candidate) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: 'SDK asset not found', path: rel }))
          return
        }

        setContentType(res, candidate)
        // SDK assets need COEP headers to work in wallet iframe with COEP enabled
        applyCoepCorp(res)
        // Dev-only CORS echo (no preflight handling here)
        echoCorsFromRequest(res, req, { handlePreflight: false })
        const stream = fs.createReadStream(candidate)
        stream.on('error', () => next())
        stream.pipe(res)
      })
    },
  }
}

/**
 * Dev plugin: expose the wallet service HTML route (default: /wallet-service) that links only external CSS/JS.
 * Where it runs: wallet-iframe dev server (wallet origin). Used by tatchiWalletServer.
 */
export function tatchiWalletService(opts: WalletServiceOptions = {}): VitePlugin {
  const walletServicePath = normalizeBase(opts.walletServicePath, '/wallet-service')
  const sdkBasePath = normalizeBase(opts.sdkBasePath, '/sdk')

  const html = buildWalletServiceHtml(sdkBasePath)

  return {
    name: 'tatchi:wallet-service',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (!req.url) return next()
        const url = req.url.split('?')[0]
        if (url !== walletServicePath) return next()
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        // Headers for cross-origin reliability are set by tatchiHeaders; avoid overriding COOP here.
        applyCoepCorp(res)
        // Allow SDK assets to load across origins when needed
        // Do not override Permissions-Policy here; tatchiHeaders sets it consistently
        res.end(html)
      })
    },
  }
}

/**
 * Dev plugin: force the correct `.wasm` MIME type (application/wasm) for any served wasm file.
 * Where it runs: both app and wallet-iframe dev servers.
 */
export function tatchiWasmMime(): VitePlugin {
  return {
    name: 'tatchi:wasm-mime',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (!req.url) return next()
        const url = req.url.split('?')[0]
        if (url.endsWith('.wasm')) {
          res.setHeader('Content-Type', 'application/wasm')
        }
        next()
      })
    },
  }
}

/**
 * Dev plugin: add Permissions-Policy (delegating WebAuthn + clipboard), COOP/COEP/CORP, and optional dev CSP.
 * Where it runs: both app and wallet-iframe dev servers.
 * Notes:
 * - Uses Structured Header format for Permissions-Policy (double-quoted origins).
 * - Wallet dev CSP can be toggled strict/compatible via opts.devCSP.
 */
export function tatchiHeaders(opts: DevHeadersOptions = {}): VitePlugin {
  const walletOriginRaw = opts.walletOrigin ?? process.env.VITE_WALLET_ORIGIN
  const walletOrigin = walletOriginRaw?.trim()
  const walletServicePath = normalizeBase(opts.walletServicePath || process.env.VITE_WALLET_SERVICE_PATH, '/wallet-service')
  const sdkBasePath = normalizeBase(opts.sdkBasePath || process.env.VITE_SDK_BASE_PATH, '/sdk')
  const devCSPMode = (opts.devCSP ?? (process.env.VITE_WALLET_DEV_CSP as 'strict' | 'compatible' | undefined))

  // Build headers via shared helpers to avoid drift.
  const permissionsPolicy = buildPermissionsPolicy(walletOrigin)

  // Dev convenience: dynamic ROR from NEAR RPC (no relay dependency)
  // The dev server will fetch the allowlist from chain on demand when a contract id is provided.
  const rorContractId = (process.env.VITE_WEBAUTHN_CONTRACT_ID || '').toString().trim()
  const rorMethod = (process.env.VITE_ROR_METHOD || 'get_allowed_origins').toString().trim()
  const nearRpcUrl = (process.env.VITE_NEAR_RPC_URL || 'https://test.rpc.fastnear.com').toString().trim()
  // Caching is handled inside fetchRorOriginsFromNear via TTL

  return {
    name: 'tatchi:dev-headers',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {

      console.log('[tatchi] headers enabled', {
        walletServicePath,
        sdkBasePath,
        rorContractId: rorContractId || '(none)',
        nearRpcUrl
      })

      server.middlewares.use((req: any, res: any, next: any) => {
        const url = (req.url || '').split('?')[0] || ''
        const isWalletRoute = url === walletServicePath || url === `${walletServicePath}/` || url === `${walletServicePath}//`
        res.setHeader('Cross-Origin-Opener-Policy', isWalletRoute ? 'unsafe-none' : 'same-origin')
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
        res.setHeader('Permissions-Policy', permissionsPolicy)
        // Optional dev-time CSP for the wallet service page only (app pages are unaffected)
        if (isWalletRoute && devCSPMode) {
          const mode = devCSPMode === 'strict' ? 'strict' : 'compatible'
          const walletCsp = buildWalletCsp({ mode })
          res.setHeader('Content-Security-Policy', walletCsp)
        }
        // Resource hints: help parent pages preconnect to the wallet origin early in dev
        addPreconnectLink(res, walletOrigin)

        // Serve /.well-known/webauthn for ROR using chain state in dev
        const isWellKnown = url === '/.well-known/webauthn' || url === '/.well-known/webauthn/'
        if (isWellKnown) {
          // Direct fetch from NEAR RPC (no relay). Caching handled inside helper.
          // Requires contract id; RPC URL falls back to a reliable public endpoint.
          if (rorContractId) {
            ;(async () => {
              try {
                const origins = await fetchRorOriginsFromNear({
                  rpcUrl: nearRpcUrl,
                  contractId: rorContractId,
                  method: rorMethod,
                })
                res.statusCode = 200
                res.setHeader('Content-Type', 'application/json; charset=utf-8')
                res.setHeader('Cache-Control', 'max-age=60, stale-while-revalidate=600')
                res.end(JSON.stringify({ origins }))
              } catch (e) {
                console.warn('[tatchi] ROR dynamic fetch failed:', e)
                res.statusCode = 200
                res.setHeader('Content-Type', 'application/json; charset=utf-8')
                res.setHeader('Cache-Control', 'max-age=60, stale-while-revalidate=600')
                res.end(JSON.stringify({ origins: [] }))
              }
            })()
            return
          }
          // No configuration; respond with empty allowlist to avoid hard 404 in dev
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Cache-Control', 'max-age=60, stale-while-revalidate=600')
          res.end(JSON.stringify({ origins: [] }))
          return
        }

        if (url.startsWith(`${sdkBasePath}/`)) {
          // Dev-only CORS for SDK assets served by Vite
          applyCoepCorp(res)
          // Honor existing echo from SDK server; otherwise echo
          const ended = echoCorsFromRequest(res, req, { honorExistingAcaOrigin: true, handlePreflight: true })
          if (ended) return
        }
        next()
      })
    },
  }
}

/**
 * Dev plugin (composed): convenience entry that wires SDK server, WASM MIME, optional headers,
 * and (in wallet modes) the wallet service route.
 * Where it runs:
 * - App server: mode 'front-only' (or 'self-contained' when serving wallet pages on the same origin).
 * - Wallet-iframe server: modes 'wallet-only' or 'self-contained'.
 */
/**
 * Compose dev plugins for serving SDK assets, wallet service HTML and dev headers.
 * External-facing entry for configuring either the app or wallet-iframe dev server.
 */
function tatchiDevServer(options: Web3AuthnDevOptions = {}): VitePlugin {
  const mode: Required<Web3AuthnDevOptions>['mode'] = options.mode || 'self-contained'
  const sdkBasePath = normalizeBase(options.sdkBasePath || process.env.VITE_SDK_BASE_PATH, '/sdk')
  const walletServicePath = normalizeBase(options.walletServicePath || process.env.VITE_WALLET_SERVICE_PATH, '/wallet-service')
  const walletOrigin = (options.walletOrigin ?? process.env.VITE_WALLET_ORIGIN)?.trim()
  const setDevHeaders = options.setDevHeaders !== false // default true
  const enableDebugRoutes = options.enableDebugRoutes === true
  const sdkDistRoot = resolveSdkDistRoot(options.sdkDistRoot)

  // Build the sub-plugins to keep logic small and testable
  const sdkPlugin = tatchiServeSdk({ sdkBasePath, sdkDistRoot, enableDebugRoutes })
  const walletPlugin = tatchiWalletService({ walletServicePath, sdkBasePath })
  const wasmMimePlugin = tatchiWasmMime()
  // Flip wallet CSP to strict by default in dev. Consumers can override via
  // VITE_WALLET_DEV_CSP or by composing tatchiHeaders directly.
  const headersPlugin = setDevHeaders
    ? tatchiHeaders({ walletOrigin, walletServicePath, sdkBasePath, devCSP: 'strict' })
    : undefined

  return {
    name: 'tatchi:dev',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      // Always add WASM MIME + SDK server
      sdkPlugin.configureServer?.(server)
      wasmMimePlugin.configureServer?.(server)
      if (headersPlugin) headersPlugin.configureServer?.(server)

      // Mode-specific wallet service route
      if (mode === 'self-contained' || mode === 'wallet-only') {
        walletPlugin.configureServer?.(server)
      }
    },
  }
}

// === Build-time helper: emit Cloudflare Pages/Netlify _headers ===
// This plugin writes a _headers file into Vite's outDir with COOP/COEP and a
// Permissions-Policy delegating WebAuthn to the configured wallet origin.
// It is a no-op if a _headers file already exists (to avoid overriding app settings).
/**
 * Build-time plugin: writes a Cloudflare Pages/Netlify-compatible `_headers` file into Vite's `outDir`.
 * Adds COOP/COEP/CORP and a Permissions-Policy delegating WebAuthn to the configured wallet origin.
 * Where it runs: build for either the app or a static wallet host (not used in dev).
 * Notes: no-ops if `_headers` already exists in `outDir` (to avoid overriding platform config).
 */
export function tatchiBuildHeaders(opts: { walletOrigin?: string, cors?: { accessControlAllowOrigin?: string } } = {}): VitePlugin {
  const walletOriginRaw = opts.walletOrigin ?? process.env.VITE_WALLET_ORIGIN
  const walletOrigin = walletOriginRaw?.trim()
  const walletServicePath = normalizeBase(process.env.VITE_WALLET_SERVICE_PATH, '/wallet-service')
  const sdkBasePath = normalizeBase(process.env.VITE_SDK_BASE_PATH, '/sdk')

  // Build headers via shared helpers to avoid drift between frameworks
  const permissionsPolicy = buildPermissionsPolicy(walletOrigin)
  const walletCsp = buildWalletCsp({ mode: 'strict' })

  let outDir = 'dist'

  // We intentionally return a broader shape than VitePlugin; cast at the end
  const plugin = {
    name: 'tatchi:build-headers',
    apply: 'build' as const,
    enforce: 'post' as const,
    // Capture the resolved outDir
    configResolved(config: any) {
      outDir = (config?.build?.outDir as string) || outDir
    },
    generateBundle() {
      try {
        const hdrPath = path.join(outDir, '_headers')
        if (fs.existsSync(hdrPath)) {
          // Do not override existing headers; leave a note in build logs
          console.warn('[tatchi] _headers already exists in outDir; skipping auto-emission')
        } else {
          // Strict CSP is emitted only for wallet HTML routes; not for app pages.
          const contentLines: string[] = [
            '/*',
            '  Cross-Origin-Opener-Policy: same-origin',
            '  Cross-Origin-Embedder-Policy: require-corp',
            '  Cross-Origin-Resource-Policy: cross-origin',
            `  Permissions-Policy: ${permissionsPolicy}`,
            '',
            `${walletServicePath}`,
            '  Cross-Origin-Opener-Policy: unsafe-none',
            `  Permissions-Policy: ${permissionsPolicy}`,
            `  Content-Security-Policy: ${walletCsp}`,
            `${walletServicePath}/`,
            '  Cross-Origin-Opener-Policy: unsafe-none',
            `  Permissions-Policy: ${permissionsPolicy}`,
            `  Content-Security-Policy: ${walletCsp}`,
            '/export-viewer',
            '  Cross-Origin-Opener-Policy: unsafe-none',
            `  Permissions-Policy: ${permissionsPolicy}`,
            '/export-viewer/',
            '  Cross-Origin-Opener-Policy: unsafe-none',
            `  Permissions-Policy: ${permissionsPolicy}`,
          ]
          // Optional: emit CORS headers when explicitly configured via plugin option.
          // Prefer a single source of truth (platform or plugin), not both.
          const configuredAcaOrigin = (opts.cors && typeof opts.cors.accessControlAllowOrigin === 'string'
            ? opts.cors.accessControlAllowOrigin.trim()
            : undefined) as string | undefined;
          if (configuredAcaOrigin) {
            contentLines.push(
              `${sdkBasePath}/*`,
              `  Access-Control-Allow-Origin: ${configuredAcaOrigin}`,
            )
          }
          const content = contentLines.join('\n') + '\n'
          fs.mkdirSync(outDir, { recursive: true })
          fs.writeFileSync(hdrPath, content, 'utf-8')
          console.log('[tatchi] emitted _headers with COOP/COEP + Permissions-Policy' + (configuredAcaOrigin ? ' + CORS' : ''))
        }

        const sdkDir = path.join(outDir, sdkBasePath.replace(/^\//, ''))
        try { fs.mkdirSync(sdkDir, { recursive: true }) } catch {}
        const shimPath = path.join(sdkDir, 'wallet-shims.js')
        if (!fs.existsSync(shimPath)) {
          fs.writeFileSync(shimPath, WALLET_SHIM_SOURCE, 'utf-8')
        }
        const cssPath = path.join(sdkDir, 'wallet-service.css')
        if (!fs.existsSync(cssPath)) {
          fs.writeFileSync(cssPath, WALLET_SURFACE_CSS, 'utf-8')
        }

        // Emit minimal wallet-service/index.html if the app hasn't provided one
        const walletRel = walletServicePath.replace(/^\//, '')
        const wsDir = path.join(outDir, walletRel)
        const wsHtml = path.join(wsDir, 'index.html')
        if (!fs.existsSync(wsHtml)) {
          fs.mkdirSync(wsDir, { recursive: true })
          const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Web3Authn Wallet Service</title>
    <link rel=\"prefetch\" as=\"style\" href=\"${sdkBasePath}/tx-tree.css\">
    <link rel="prefetch" as="style" href="${sdkBasePath}/drawer.css">
    <link rel=\"prefetch\" as=\"style\" href=\"${sdkBasePath}/halo-border.css\">
    <link rel=\"prefetch\" as=\"style\" href=\"${sdkBasePath}/passkey-halo-loading.css\">
    <link rel="stylesheet" href="${sdkBasePath}/wallet-service.css">
    <link rel="stylesheet" href="${sdkBasePath}/w3a-components.css">
    <link rel="stylesheet" href="${sdkBasePath}/drawer.css">
    <link rel="stylesheet" href="${sdkBasePath}/tx-tree.css">
    <link rel="stylesheet" href="${sdkBasePath}/tx-confirmer.css">
    <script src="${sdkBasePath}/wallet-shims.js"></script>
    <link rel="modulepreload" href="${sdkBasePath}/wallet-iframe-host.js" crossorigin>
  </head>
  <body>
    <script type="module" src="${sdkBasePath}/wallet-iframe-host.js"></script>
  </body>
</html>
`
          fs.writeFileSync(wsHtml, buildWalletServiceHtml(sdkBasePath), 'utf-8')
          console.log(`[tatchi] emitted ${path.posix.join('/', walletRel, 'index.html')} (minimal wallet service)`)
        }

        // Emit minimal export viewer HTML for production
        const evDir = path.join(outDir, 'export-viewer')
        const evHtml = path.join(evDir, 'index.html')
        if (!fs.existsSync(evHtml)) {
          fs.mkdirSync(evDir, { recursive: true })
          const ev = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <link rel="stylesheet" href="${sdkBasePath}/wallet-service.css">
    <link rel="stylesheet" href="${sdkBasePath}/w3a-components.css">
    <link rel="stylesheet" href="${sdkBasePath}/drawer.css">
    <link rel="stylesheet" href="${sdkBasePath}/tx-tree.css">
    <link rel="stylesheet" href="${sdkBasePath}/tx-confirmer.css">
    <script src="${sdkBasePath}/wallet-shims.js"></script>
    <link rel="modulepreload" href="${sdkBasePath}/export-private-key-viewer.js" crossorigin>
    <link rel="modulepreload" href="${sdkBasePath}/iframe-export-bootstrap.js" crossorigin>
  </head>
  <body>
    <w3a-drawer id="exp" theme="dark"></w3a-drawer>
    <script type="module" src="${sdkBasePath}/export-private-key-viewer.js" crossorigin></script>
    <script type="module" src="${sdkBasePath}/iframe-export-bootstrap.js" crossorigin></script>
  </body>
</html>
`
          fs.writeFileSync(evHtml, buildExportViewerHtml(sdkBasePath), 'utf-8')
          console.log('[tatchi] emitted /export-viewer/index.html (minimal export viewer)')
        }
      } catch (e) {
        console.warn('[tatchi] failed to emit _headers:', e)
      }
    },
  }

  return plugin as unknown as VitePlugin
}

// Small test helpers to keep unit tests decoupled from Vite server implementation
export function computeDevPermissionsPolicy(walletOrigin?: string): string {
  return buildPermissionsPolicy(walletOrigin)
}

export function computeDevWalletCsp(mode: 'strict' | 'compatible' = 'strict'): string {
  return buildWalletCsp({ mode })
}

export function tatchiWalletServer(options: Omit<Web3AuthnDevOptions, 'mode'> = {}): VitePlugin {
  return tatchiDevServer({ ...options, mode: 'wallet-only' })
}

export function tatchiAppServer(options: Omit<Web3AuthnDevOptions, 'mode'> = {}): VitePlugin {
  return tatchiDevServer({ ...options, mode: 'front-only' })
}

/**
 * Convenience wrapper: app origin helper that combines dev-time headers with optional
 * build-time headers emission for static hosts.
 *
 * Dev-time (serve): applies COOP/COEP/CORP and Permissions-Policy via tatchiAppServer.
 * Build-time (build): when `emitHeaders` is true, writes a Cloudflare Pages/Netlify
 * `_headers` file into Vite's `outDir` via tatchiBuildHeaders, scoping strict CSP to
 * wallet HTML routes only.
 *   - Emits: COOP=same-origin, COEP=require-corp, CORP=cross-origin, and a
 *     Permissions-Policy delegating WebAuthn/clipboard to the configured wallet origin.
 *   - No-op if a `_headers` file already exists in `outDir` (avoids clobbering CI/platform rules).
 *
 * Notes
 * - Keeps production header emission opt-in to avoid surprising overrides when apps
 *   already manage headers via custom servers or platform rules.
 * - Returns a plugin array for ergonomics; Vite accepts arrays in the `plugins` list.
 */
export function tatchiApp(options: Omit<Web3AuthnDevOptions, 'mode'> & { emitHeaders?: boolean } = {}): any[] /* Vite Plugin[] */ {
  const { emitHeaders, ...rest } = options
  const walletOrigin = (rest.walletOrigin ?? process.env.VITE_WALLET_ORIGIN)?.trim()
  const app = tatchiAppServer(rest)
  // Build-time emission is opt-in and will no-op if `_headers` already exists.
  const hdr = emitHeaders ? tatchiBuildHeaders({ walletOrigin }) : undefined
  return [app, hdr].filter(Boolean) as any[]
}

/**
 * Convenience wrapper: wallet origin helper that combines dev-time wallet server
 * with optional build-time headers emission for static hosts.
 *
 * Dev-time (serve): serves `/wallet-service` and `/sdk/*` plus headers via tatchiWalletServer.
 * Build-time (build): when `emitHeaders` is true, writes a Cloudflare Pages/Netlify
 * `_headers` file into Vite's `outDir` via tatchiBuildHeaders, scoping strict CSP to
 * wallet HTML routes only.
 *   - Emits: COOP=same-origin (wallet HTML routes use `unsafe-none`), COEP=require-corp,
 *     CORP=cross-origin, and a Permissions-Policy delegating WebAuthn/clipboard to the
 *     configured wallet origin.
 *   - No-op if a `_headers` file already exists in `outDir` (avoids clobbering CI/platform rules).
 *
 * Notes
 * - Keeps production header emission opt-in to avoid overriding platform/server configs.
 * - Returns a plugin array for ergonomics; Vite accepts arrays in the `plugins` list.
 */
export function tatchiWallet(options: Omit<Web3AuthnDevOptions, 'mode'> & { emitHeaders?: boolean } = {}): any[] /* Vite Plugin[] */ {
  const { emitHeaders, ...rest } = options
  const walletOrigin = (rest.walletOrigin ?? process.env.VITE_WALLET_ORIGIN)?.trim()
  const wallet = tatchiWalletServer(rest)
  // Build-time emission is opt-in and will no-op if `_headers` already exists.
  const hdr = emitHeaders ? tatchiBuildHeaders({ walletOrigin }) : undefined
  return [wallet, hdr].filter(Boolean) as any[]
}
