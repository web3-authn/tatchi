// Minimal Vite dev plugin(s) to support Passkey Manager modes
// See docs/passkey-manager-modes.md (Vite Plugin section)
// The plugin serves SDK assets under a base path, exposes a wallet service route,
// adds dev headers (COOP/COEP + Permissions-Policy), and enforces WASM MIME type.

import * as fs from 'node:fs'
import * as path from 'node:path'
import { createRequire } from 'node:module'

// Avoid importing 'vite' types to keep this package light. Define a minimal shape.
export type VitePlugin = {
  name: string
  apply?: 'serve' | 'build'
  enforce?: 'pre' | 'post'
  configureServer?: (server: any) => void | Promise<void>
}

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

function normalizeBase(p?: string, fallback = '/sdk'): string {
  let out = (p || fallback).trim()
  if (!out.startsWith('/')) out = '/' + out
  // keep trailing slash off for consistent join logic
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1)
  return out
}

function resolveSdkDistRoot(explicit?: string): string {
  if (explicit) return path.resolve(explicit)
  // Resolve the installed package (works with workspace + node_modules)
  const pkgPath = requireCjs.resolve('@tatchi/sdk/package.json')
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

function tryFile(...candidates: string[]): string | undefined {
  for (const file of candidates) {
    try {
      const stat = fs.statSync(file)
      if (stat.isFile()) return file
    } catch {}
  }
  return undefined
}

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
  ':root {',
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
        try {
          const url = (req.url || '').split('?')[0]
          if (url === configuredBase + '/wallet-shims.js') {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
            // Align with SDK asset headers so COEP/CORP environments can import cross‑origin
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
            res.setHeader('Access-Control-Allow-Credentials', 'true')
            res.end(WALLET_SHIM_SOURCE)
            return
          }
          if (url === configuredBase + '/wallet-service.css') {
            res.statusCode = 200
            res.setHeader('Content-Type', 'text/css; charset=utf-8')
            // Important: provide CORP for cross‑origin CSS so COEP documents can load it
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
            res.setHeader('Access-Control-Allow-Credentials', 'true')
            res.end(WALLET_SURFACE_CSS)
            return
          }
        } catch {}
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

        try {
          setContentType(res, candidate)
          // SDK assets need COEP headers to work in wallet iframe with COEP enabled
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
          // Allow cross-origin ESM/worker fetches during development
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
          res.setHeader('Access-Control-Allow-Credentials', 'true')
          const stream = fs.createReadStream(candidate)
          stream.on('error', () => next())
          stream.pipe(res)
        } catch (e) {
          next()
        }
      })
    },
  }
}

export function tatchiWalletService(opts: WalletServiceOptions = {}): VitePlugin {
  const walletServicePath = normalizeBase(opts.walletServicePath, '/wallet-service')
  const sdkBasePath = normalizeBase(opts.sdkBasePath, '/sdk')

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Web3Authn Wallet Service</title>
    <!-- Surface styles are external so strict CSP can keep style-src 'self' -->
    <link rel="stylesheet" href="${sdkBasePath}/wallet-service.css" />
    <!-- Preload critical styles to minimize first paint delay -->
    <link rel="preload" as="style" href="${sdkBasePath}/drawer.css" />
    <link rel="preload" as="style" href="${sdkBasePath}/tx-tree.css" />
    <link rel="preload" as="style" href="${sdkBasePath}/halo-border.css" />
    <link rel="preload" as="style" href="${sdkBasePath}/passkey-halo-loading.css" />
    <!-- Component theme CSS: shared tokens + component-scoped tokens -->
    <link rel="stylesheet" href="${sdkBasePath}/w3a-components.css" />
    <link rel="stylesheet" href="${sdkBasePath}/drawer.css" />
    <link rel="stylesheet" href="${sdkBasePath}/tx-tree.css" />
    <link rel="stylesheet" href="${sdkBasePath}/modal-confirmer.css" />
    <!-- Minimal shims some ESM bundles expect (externalized to enable strict CSP) -->
    <script src="${sdkBasePath}/wallet-shims.js"></script>
    <!-- Hint the browser to fetch the host script earlier -->
    <link rel="modulepreload" href="${sdkBasePath}/wallet-iframe-host.js" crossorigin>
  </head>
  <body>
    <!-- sdkBasePath points to the SDK root (e.g. '/sdk'). Load the host directly. -->
    <script type="module" src="${sdkBasePath}/wallet-iframe-host.js"></script>
  </body>
</html>`

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
        // Enable cross-origin isolation to make module workers + WASM more reliable in Safari
        // These headers mirror the SDK asset responses and help ensure the iframe document
        // participates in the same agent cluster required by some engines.
        try {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
          // Allow SDK assets to load across origins when needed
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
          // Explicitly allow features used by the wallet service itself
          res.setHeader('Permissions-Policy', `publickey-credentials-get=(self), publickey-credentials-create=(self), clipboard-read=(self), clipboard-write=(self)`)
        } catch {}
        res.end(html)
      })
    },
  }
}

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

export function tatchiDevHeaders(opts: DevHeadersOptions = {}): VitePlugin {
  const walletOriginRaw = opts.walletOrigin ?? process.env.VITE_WALLET_ORIGIN
  const walletOrigin = walletOriginRaw?.trim()
  const walletServicePath = normalizeBase(opts.walletServicePath || process.env.VITE_WALLET_SERVICE_PATH, '/wallet-service')
  const sdkBasePath = normalizeBase(opts.sdkBasePath || process.env.VITE_SDK_BASE_PATH, '/sdk')
  const devCSPMode = (opts.devCSP ?? (process.env.VITE_WALLET_DEV_CSP as 'strict' | 'compatible' | undefined))

  // Build a Permissions-Policy that only lists self unless a wallet origin is provided.
  const ppParts: string[] = []
  ppParts.push(`publickey-credentials-get=(self${walletOrigin ? ` "${walletOrigin}"` : ''})`)
  ppParts.push(`publickey-credentials-create=(self${walletOrigin ? ` "${walletOrigin}"` : ''})`)
  // Allow clipboard for top-level and wallet origin, so nested iframes can delegate
  ppParts.push(`clipboard-read=(self${walletOrigin ? ` "${walletOrigin}"` : ''})`)
  ppParts.push(`clipboard-write=(self${walletOrigin ? ` "${walletOrigin}"` : ''})`)
  const permissionsPolicy = ppParts.join(', ')

  // Optional: Related Origin Requests (ROR) dev endpoint support
  const rorEnv = process.env.VITE_ROR_ALLOWED_ORIGINS
  const rorAllowedOrigins = (rorEnv || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  return {
    name: 'tatchi:dev-headers',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = (req.url || '').split('?')[0] || ''
        const isWalletRoute = url === walletServicePath || url === `${walletServicePath}/` || url === `${walletServicePath}//`
        res.setHeader('Cross-Origin-Opener-Policy', isWalletRoute ? 'unsafe-none' : 'same-origin')
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
        res.setHeader('Permissions-Policy', permissionsPolicy)
        // Optional dev-time CSP for the wallet service page only
        if (isWalletRoute && devCSPMode) {
          const strictCsp = [
            "default-src 'self'",
            "script-src 'self'",
            // Strict style policy for dev: external styles only, no style attributes
            "style-src 'self'",
            "style-src-attr 'none'",
            "img-src 'self' data:",
            "font-src 'self'",
            "connect-src 'self' https:",
            "worker-src 'self' blob:",
            "frame-src 'self'",
            "object-src 'none'",
            "base-uri 'none'",
            "form-action 'none'",
          ].join('; ')
          const compatibleCsp = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self'",
            "connect-src 'self' https:",
            "worker-src 'self' blob:",
            "frame-src 'self'",
            "object-src 'none'",
            "base-uri 'none'",
            "form-action 'none'",
          ].join('; ')
          res.setHeader('Content-Security-Policy', devCSPMode === 'strict' ? strictCsp : compatibleCsp)
        }
        // Resource hints: help parent pages preconnect to the wallet origin early in dev
        try {
          if (walletOrigin) {
            // Multiple Link headers are allowed; keep idempotent behavior simple.
            const link = `<${walletOrigin}>; rel=preconnect; crossorigin`;
            const existing = res.getHeader('Link');
            if (!existing) {
              res.setHeader('Link', link);
            } else if (typeof existing === 'string' && !existing.includes(link)) {
              res.setHeader('Link', existing + ', ' + link);
            } else if (Array.isArray(existing) && !existing.includes(link)) {
              res.setHeader('Link', [...existing, link]);
            }
          }
        } catch {}

        // Serve /.well-known/webauthn for ROR when configured
        if (url === '/.well-known/webauthn' && rorAllowedOrigins.length > 0) {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ origins: rorAllowedOrigins }))
          return
        }

        if (url.startsWith(`${sdkBasePath}/`)) {
          // Allow cross‑origin ESM/worker fetches during development
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
          res.setHeader('Access-Control-Allow-Credentials', 'true')
          if (req.method && String(req.method).toUpperCase() === 'OPTIONS') {
            res.statusCode = 204
            res.end()
            return
          }
        }
        next()
      })
    },
  }
}

export function tatchiDev(options: Web3AuthnDevOptions = {}): VitePlugin {
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
  // VITE_WALLET_DEV_CSP or by composing tatchiDevHeaders directly.
  const headersPlugin = setDevHeaders
    ? tatchiDevHeaders({ walletOrigin, walletServicePath, sdkBasePath, devCSP: 'strict' })
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

// Named exports for advanced composition
export default tatchiDev

// === Build-time helper: emit Cloudflare Pages/Netlify _headers ===
// This plugin writes a _headers file into Vite's outDir with COOP/COEP and a
// Permissions-Policy delegating WebAuthn to the configured wallet origin.
// It is a no-op if a _headers file already exists (to avoid overriding app settings).
export function tatchiBuildHeaders(opts: { walletOrigin?: string } = {}): VitePlugin {
  const walletOriginRaw = opts.walletOrigin ?? process.env.VITE_WALLET_ORIGIN
  const walletOrigin = walletOriginRaw?.trim()
  const walletServicePath = normalizeBase(process.env.VITE_WALLET_SERVICE_PATH, '/wallet-service')
  const sdkBasePath = normalizeBase(process.env.VITE_SDK_BASE_PATH, '/sdk')
  // Allow hosts that already inject CORS for /sdk to disable emitting ACAO to avoid duplicates
  const emitCorsForSdk = String(process.env.VITE_SDK_ADD_ACAO ?? 'true').toLowerCase() !== 'false'

  // Build Permissions-Policy mirroring the dev plugin format
  const ppParts: string[] = []
  ppParts.push(`publickey-credentials-get=(self${walletOrigin ? ` "${walletOrigin}"` : ''})`)
  ppParts.push(`publickey-credentials-create=(self${walletOrigin ? ` "${walletOrigin}"` : ''})`)
  ppParts.push(`clipboard-read=(self${walletOrigin ? ` "${walletOrigin}"` : ''})`)
  ppParts.push(`clipboard-write=(self${walletOrigin ? ` "${walletOrigin}"` : ''})`)
  const permissionsPolicy = ppParts.join(', ')

  let outDir = 'dist'

  // We intentionally return a broader shape than VitePlugin; cast at the end
  const plugin = {
    name: 'tatchi:build-headers',
    apply: 'build' as const,
    enforce: 'post' as const,
    // Capture the resolved outDir
    configResolved(config: any) {
      try { outDir = (config?.build?.outDir as string) || outDir } catch {}
    },
    generateBundle() {
      try {
        const hdrPath = path.join(outDir, '_headers')
        if (fs.existsSync(hdrPath)) {
          // Do not override existing headers; leave a note in build logs
          console.warn('[tatchi] _headers already exists in outDir; skipping auto-emission')
        } else {
          const walletCsp = [
            "default-src 'self'",
            "script-src 'self'",
            // Strict style policy: external styles only, no style attributes
            "style-src 'self'",
            "style-src-attr 'none'",
            "img-src 'self' data:",
            "font-src 'self'",
            "connect-src 'self' https:",
            "worker-src 'self' blob:",
            "frame-src 'self'",
            "object-src 'none'",
            "base-uri 'none'",
            "form-action 'none'",
            "upgrade-insecure-requests",
          ].join('; ')
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
          if (emitCorsForSdk) {
            contentLines.push(
              `${sdkBasePath}/*`,
              '  Access-Control-Allow-Origin: *',
            )
          }
          const content = contentLines.join('\n') + '\n'
          fs.mkdirSync(outDir, { recursive: true })
          fs.writeFileSync(hdrPath, content, 'utf-8')
          console.log('[tatchi] emitted _headers with COOP/COEP + Permissions-Policy + SDK CORS rules')
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
    <link rel=\"preload\" as=\"style\" href=\"${sdkBasePath}/tx-tree.css\"> 
    <link rel="preload" as="style" href="${sdkBasePath}/drawer.css">
    <link rel=\"preload\" as=\"style\" href=\"${sdkBasePath}/halo-border.css\"> 
    <link rel=\"preload\" as=\"style\" href=\"${sdkBasePath}/passkey-halo-loading.css\"> 
    <link rel="stylesheet" href="${sdkBasePath}/wallet-service.css">
    <link rel="stylesheet" href="${sdkBasePath}/w3a-components.css">
    <link rel="stylesheet" href="${sdkBasePath}/drawer.css">
    <link rel="stylesheet" href="${sdkBasePath}/tx-tree.css">
    <link rel="stylesheet" href="${sdkBasePath}/modal-confirmer.css">
    <script src="${sdkBasePath}/wallet-shims.js"></script>
    <link rel="modulepreload" href="${sdkBasePath}/wallet-iframe-host.js" crossorigin>
  </head>
  <body>
    <script type="module" src="${sdkBasePath}/wallet-iframe-host.js"></script>
  </body>
</html>
`
          fs.writeFileSync(wsHtml, html, 'utf-8')
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
    <link rel="stylesheet" href="${sdkBasePath}/modal-confirmer.css">
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
          fs.writeFileSync(evHtml, ev, 'utf-8')
          console.log('[tatchi] emitted /export-viewer/index.html (minimal export viewer)')
        }
      } catch (e) {
        console.warn('[tatchi] failed to emit _headers:', e)
      }
    },
  }

  return plugin as unknown as VitePlugin
}
