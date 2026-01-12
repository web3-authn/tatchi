// Minimal Vite dev plugin(s) to support Passkey Manager modes.
// See docs/passkey-manager-modes.md (Vite Plugin section).
//
// What these plugins do:
// - Serve SDK assets under a base path, expose a wallet service route,
// - Add dev headers (COOP + Permissions-Policy, optional COEP/CORP), and enforce WASM MIME.
// - IMPORTANT: Strict CSP is scoped only to wallet HTML routes (/wallet-service, /export-viewer),
//   not to the host app pages. App routes remain free to use inline styles/scripts.

import * as fs from 'node:fs'
import * as path from 'node:path'
import { buildPermissionsPolicy, buildWalletCsp } from './headers'
import {
  addPreconnectLink,
  buildWalletServiceHtml,
  buildExportViewerHtml,
  applyCoepCorpIfNeeded,
  echoCorsFromRequest,
  fetchRorOriginsFromNear,
  toBasePath,
  resolveCoepMode,
  resolveSdkDistRoot,
} from './plugin-utils'
import { addOfflineExportDevRoutes, buildOfflineExportHtml, emitOfflineExportAssets } from './offline'
import { setContentType } from './plugin-utils'

export type VitePlugin = {
  name: string
  apply?: 'serve' | 'build'
  enforce?: 'pre' | 'post'
  configureServer?: (server: any) => void | Promise<void>
}
export type ViteLikePlugin = VitePlugin

export type Web3AuthnDevOptions = {
  mode?: 'self-contained' | 'front-only' | 'wallet-only'
  sdkDistRoot?: string
  sdkBasePath?: string
  walletServicePath?: string
  walletOrigin?: string
  setDevHeaders?: boolean
  enableDebugRoutes?: boolean
  /**
   * Controls Cross-Origin-Embedder-Policy (COEP) behavior in dev.
   * - 'off' (default): do not emit COEP/CORP on app pages.
   * - 'strict': emit `Cross-Origin-Embedder-Policy: require-corp`
   *   and `Cross-Origin-Resource-Policy: cross-origin` on app pages.
   *
   * Tip: set `VITE_COEP_MODE=strict` in tests/CI to enable isolation automatically.
   */
  coepMode?: 'strict' | 'off'
}

export type ServeSdkOptions = {
  sdkDistRoot?: string
  sdkBasePath?: string
  enableDebugRoutes?: boolean
  coepMode?: 'strict' | 'off'
}

export type WalletServiceOptions = {
  walletServicePath?: string
  sdkBasePath?: string
  coepMode?: 'strict' | 'off'
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
  /**
   * Controls Cross-Origin-Embedder-Policy (COEP) behavior in dev.
   * - 'off' (default): do not emit COEP/CORP headers on app pages.
   * - 'strict': emit COEP/CORP headers on app pages.
   */
  coepMode?: 'strict' | 'off'
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
 * Tatchi SDK plugin: serve SDK assets under a stable base (default: /sdk) with optional COEP/CORP (strict mode) and permissive CORS.
 * Where it runs: both the app server and the wallet-iframe server.
 * - App server: lets host pages and Lit components load SDK CSS/JS locally.
 * - Wallet server: used by /wallet-service to load wallet-iframe-host.js and related CSS/JS.
 */
export function tatchiServeSdk(opts: ServeSdkOptions = {}): VitePlugin {
  const configuredBase = toBasePath(opts.sdkBasePath, '/sdk')
  const sdkDistRoot = resolveSdkDistRoot(opts.sdkDistRoot)
  const enableDebugRoutes = opts.enableDebugRoutes === true
  const coepMode = resolveCoepMode(opts.coepMode)
  const offlineHtml = buildOfflineExportHtml(configuredBase)

  // In dev we want both '/sdk' and a custom base to work.
  const bases = Array.from(new Set([configuredBase, toBasePath('/sdk')]))
    .sort((a, b) => b.length - a.length)
    // Prefer longest base match first (e.g., '/sdk/esm/react' before '/sdk')

  return {
    name: 'tatchi:serve-sdk',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      // Mount Offline Export dev routes once here (includes app module + chunks)
      addOfflineExportDevRoutes(server, {
        sdkDistRoot,
        sdkBasePath: configuredBase,
        offlineHtml,
        includeAppModule: true,
        coepMode,
      })
      // Serve a tiny shim as a virtual asset to enable strict CSP (no inline scripts)
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = (req.url || '').split('?')[0]
        if (url === configuredBase + '/wallet-shims.js') {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
          // Align with SDK asset headers so COEP/CORP environments can import
          applyCoepCorpIfNeeded(res, coepMode)
          // Dev-only CORS echo (no preflight handling on this route)
          echoCorsFromRequest(res, req, { handlePreflight: false })
          res.end(WALLET_SHIM_SOURCE)
          return
        }
        if (url === configuredBase + '/wallet-service.css') {
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/css; charset=utf-8')
          // Important: provide CORP for cross‑origin CSS so COEP documents can load it
          applyCoepCorpIfNeeded(res, coepMode)
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
        applyCoepCorpIfNeeded(res, coepMode)
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
  const walletServicePath = toBasePath(opts.walletServicePath, '/wallet-service')
  const sdkBasePath = toBasePath(opts.sdkBasePath, '/sdk')
  const coepMode = resolveCoepMode(opts.coepMode)

  const html = buildWalletServiceHtml(sdkBasePath)
  const offlineHtml = buildOfflineExportHtml(sdkBasePath)
  const sdkDistRoot = resolveSdkDistRoot()

  return {
    name: 'tatchi:wallet-service',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (!req.url) return next()
        const url = req.url.split('?')[0]
        const isWalletRoute = url === walletServicePath || url === `${walletServicePath}/` || url === `${walletServicePath}//`
        if (isWalletRoute) {
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          // Important: allow embedding this wallet HTML into COEP=require-corp apps even
          // when the wallet itself is not running with COEP enabled.
          // Without CORP, the iframe can be blocked and remain on an opaque 'null' origin,
          // causing CONNECT/READY handshake timeouts in the parent.
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
          applyCoepCorpIfNeeded(res, coepMode)
          res.end(html)
          return
        }
        next()
      })

      // Mount Offline Export routes here as well (no app module duplication)
      addOfflineExportDevRoutes(server, {
        sdkDistRoot,
        sdkBasePath,
        offlineHtml,
        includeAppModule: false,
        coepMode,
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
 * Dev plugin: add Permissions-Policy (delegating WebAuthn + clipboard), COOP, optional COEP/CORP, and optional dev CSP.
 * Where it runs: both app and wallet-iframe dev servers.
 * Notes:
 * - Uses Structured Header format for Permissions-Policy (double-quoted origins).
 * - Wallet dev CSP can be toggled strict/compatible via opts.devCSP.
 */
export function tatchiHeaders(opts: DevHeadersOptions = {}): VitePlugin {
  const walletOriginRaw = opts.walletOrigin ?? process.env.VITE_WALLET_ORIGIN
  const walletOrigin = walletOriginRaw?.trim()
  const walletServicePath = toBasePath(opts.walletServicePath || process.env.VITE_WALLET_SERVICE_PATH, '/wallet-service')
  const sdkBasePath = toBasePath(opts.sdkBasePath || process.env.VITE_SDK_BASE_PATH, '/sdk')
  const devCSPMode = (opts.devCSP ?? (process.env.VITE_WALLET_DEV_CSP as 'strict' | 'compatible' | undefined))
  const coepMode = resolveCoepMode(opts.coepMode)

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
        coepMode,
        rorContractId: rorContractId || '(none)',
        nearRpcUrl
      })

      server.middlewares.use((req: any, res: any, next: any) => {
        const url = (req.url || '').split('?')[0] || ''
        const isWalletRoute = url === walletServicePath || url === `${walletServicePath}/` || url === `${walletServicePath}//`
        res.setHeader('Cross-Origin-Opener-Policy', isWalletRoute ? 'unsafe-none' : 'same-origin')
        if (coepMode !== 'off') {
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
        }
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
          applyCoepCorpIfNeeded(res, coepMode)
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
  const sdkBasePath = toBasePath(options.sdkBasePath || process.env.VITE_SDK_BASE_PATH, '/sdk')
  const walletServicePath = toBasePath(options.walletServicePath || process.env.VITE_WALLET_SERVICE_PATH, '/wallet-service')
  const walletOrigin = (options.walletOrigin ?? process.env.VITE_WALLET_ORIGIN)?.trim()
  const setDevHeaders = options.setDevHeaders !== false // default true
  const enableDebugRoutes = options.enableDebugRoutes === true
  const sdkDistRoot = resolveSdkDistRoot(options.sdkDistRoot)
  const coepMode = resolveCoepMode(options.coepMode)

  // Build the sub-plugins to keep logic small and testable
  const sdkPlugin = tatchiServeSdk({ sdkBasePath, sdkDistRoot, enableDebugRoutes, coepMode })
  const walletPlugin = tatchiWalletService({ walletServicePath, sdkBasePath, coepMode })
  const wasmMimePlugin = tatchiWasmMime()
  // Flip wallet CSP to strict by default in dev. Consumers can override via
  // VITE_WALLET_DEV_CSP or by composing tatchiHeaders directly.
  const headersPlugin = setDevHeaders
    ? tatchiHeaders({ walletOrigin, walletServicePath, sdkBasePath, devCSP: 'strict', coepMode })
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
// This plugin writes a _headers file into Vite's outDir with COOP and optional COEP and a
// Permissions-Policy delegating WebAuthn to the configured wallet origin.
// It is a no-op if a _headers file already exists (to avoid overriding app settings).
/**
 * Build-time plugin: writes a Cloudflare Pages/Netlify-compatible `_headers` file into Vite's `outDir`.
 * Adds COOP + Permissions-Policy and optional COEP/CORP (configurable via coepMode) delegating WebAuthn to the configured wallet origin.
 * Where it runs: build for either the app or a static wallet host (not used in dev).
 * Notes: no-ops if `_headers` already exists in `outDir` (to avoid overriding platform config).
 */
export function tatchiBuildHeaders(opts: { walletOrigin?: string, cors?: { accessControlAllowOrigin?: string }, coepMode?: 'strict' | 'off' } = {}): VitePlugin {
  const walletOriginRaw = opts.walletOrigin ?? process.env.VITE_WALLET_ORIGIN
  const walletOrigin = walletOriginRaw?.trim()
  const walletServicePath = toBasePath(process.env.VITE_WALLET_SERVICE_PATH, '/wallet-service')
  const sdkBasePath = toBasePath(process.env.VITE_SDK_BASE_PATH, '/sdk')
  const coepMode = resolveCoepMode(opts.coepMode)

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
            ...(coepMode === 'off'
              ? []
              : [
                  '  Cross-Origin-Embedder-Policy: require-corp',
                  '  Cross-Origin-Resource-Policy: cross-origin',
                ]),
            `  Permissions-Policy: ${permissionsPolicy}`,
            '',
            `${walletServicePath}`,
            '  Cross-Origin-Opener-Policy: unsafe-none',
            // Always allow COEP=require-corp apps to embed wallet HTML, even when
            // the wallet host itself is not using COEP.
            '  Cross-Origin-Resource-Policy: cross-origin',
            `  Permissions-Policy: ${permissionsPolicy}`,
            `  Content-Security-Policy: ${walletCsp}`,
            `${walletServicePath}/`,
            '  Cross-Origin-Opener-Policy: unsafe-none',
            '  Cross-Origin-Resource-Policy: cross-origin',
            `  Permissions-Policy: ${permissionsPolicy}`,
            `  Content-Security-Policy: ${walletCsp}`,
            '/export-viewer',
            '  Cross-Origin-Opener-Policy: unsafe-none',
            '  Cross-Origin-Resource-Policy: cross-origin',
            `  Permissions-Policy: ${permissionsPolicy}`,
            '/export-viewer/',
            '  Cross-Origin-Opener-Policy: unsafe-none',
            '  Cross-Origin-Resource-Policy: cross-origin',
            `  Permissions-Policy: ${permissionsPolicy}`,
            // Offline export cache policy (no-cache for HTML/SW; immutable for other assets)
            '/offline-export',
            '  Cache-Control: no-cache',
            '/offline-export/',
            '  Cache-Control: no-cache',
            '/offline-export/index.html',
            '  Cache-Control: no-cache',
            '/offline-export/sw.js',
            '  Cache-Control: no-cache',
            '/offline-export/precache.manifest.json',
            '  Cache-Control: no-cache',
            '/offline-export/manifest.webmanifest',
            '  Cache-Control: no-cache',
            '/offline-export/offline-export-app.js',
            '  Cache-Control: no-cache',
            '/offline-export/*',
            '  Cache-Control: public, max-age=31536000, immutable',
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
          console.log('[tatchi] emitted _headers with COOP' + (coepMode === 'off' ? '' : '/COEP/CORP') + ' + Permissions-Policy' + (configuredAcaOrigin ? ' + CORS' : ''))
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
          fs.writeFileSync(wsHtml, buildWalletServiceHtml(sdkBasePath), 'utf-8')
          console.log(`[tatchi] emitted ${path.posix.join('/', walletRel, 'index.html')} (minimal wallet service)`)
        }

        // Emit minimal export viewer HTML for production
        const evDir = path.join(outDir, 'export-viewer')
        const evHtml = path.join(evDir, 'index.html')
        if (!fs.existsSync(evHtml)) {
          fs.mkdirSync(evDir, { recursive: true })
          fs.writeFileSync(evHtml, buildExportViewerHtml(sdkBasePath), 'utf-8')
          console.log('[tatchi] emitted /export-viewer/index.html (minimal export viewer)')
        }

        // Emit offline-export assets (SW, workers, app, HTML, manifest, precache) via helper
        try {
          const sdkDistRoot = resolveSdkDistRoot()
          emitOfflineExportAssets({ outDir, sdkBasePath, sdkDistRoot })
        } catch (e) {
          console.warn('[tatchi] failed to emit offline-export assets:', e)
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
 * Dev-time (serve): applies COOP + Permissions-Policy, plus optional COEP/CORP, via tatchiAppServer.
 * Build-time (build): when `emitHeaders` is true, writes a Cloudflare Pages/Netlify
 * `_headers` file into Vite's `outDir` via tatchiBuildHeaders, scoping strict CSP to
 * wallet HTML routes only.
 *   - Emits: `COOP: same-origin`, `Permissions-Policy: …`, and (when `coepMode === 'strict'`) `COEP: require-corp` + `CORP: cross-origin`.
 *   - No-op if a `_headers` file already exists in `outDir` (avoids clobbering CI/platform rules).
 *
 * Notes
 * - Keeps production header emission opt-in to avoid surprising overrides when apps
 *   already manage headers via custom servers or platform rules.
 * - Returns a plugin array for ergonomics; Vite accepts arrays in the `plugins` list.
 */
export function tatchiApp(options: Omit<Web3AuthnDevOptions, 'mode'> & { emitHeaders?: boolean } = {}): any[] /* Vite Plugin[] */ {
  const { emitHeaders, ...devOpts } = options
  const walletOrigin = (devOpts.walletOrigin ?? process.env.VITE_WALLET_ORIGIN)?.trim()
  const app = tatchiAppServer(devOpts)
  // Build-time emission is opt-in and will no-op if `_headers` already exists.
  const hdr = emitHeaders ? tatchiBuildHeaders({ walletOrigin, coepMode: devOpts.coepMode }) : undefined
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
 *   - Emits: `COOP: same-origin` (wallet HTML routes use `unsafe-none`), `Permissions-Policy: …`, and (when `coepMode === 'strict'`) `COEP: require-corp` + `CORP: cross-origin`.
 *   - No-op if a `_headers` file already exists in `outDir` (avoids clobbering CI/platform rules).
 *
 * Notes
 * - Keeps production header emission opt-in to avoid overriding platform/server configs.
 * - Returns a plugin array for ergonomics; Vite accepts arrays in the `plugins` list.
 */
export function tatchiWallet(options: Omit<Web3AuthnDevOptions, 'mode'> & { emitHeaders?: boolean } = {}): any[] /* Vite Plugin[] */ {
  const { emitHeaders, ...devOpts } = options
  const walletOrigin = (devOpts.walletOrigin ?? process.env.VITE_WALLET_ORIGIN)?.trim()
  const wallet = tatchiWalletServer(devOpts)
  // Build-time emission is opt-in and will no-op if `_headers` already exists.
  const hdr = emitHeaders ? tatchiBuildHeaders({ walletOrigin, coepMode: devOpts.coepMode }) : undefined
  return [wallet, hdr].filter(Boolean) as any[]
}
