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
  try {
    // Resolve the installed package (works with workspace + node_modules)
    const pkgPath = requireCjs.resolve('@web3authn/passkey/package.json')
    const pkgDir = path.dirname(pkgPath)
    const dist = path.join(pkgDir, 'dist')
    return dist
  } catch (err) {
    // Fallback: try relative monorepo path common in this repo
    const guess = path.resolve(process.cwd(), '../../passkey-sdk/dist')
    return guess
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

export function web3authnServeSdk(opts: ServeSdkOptions = {}): VitePlugin {
  const configuredBase = normalizeBase(opts.sdkBasePath, '/sdk')
  const sdkDistRoot = resolveSdkDistRoot(opts.sdkDistRoot)
  const enableDebugRoutes = opts.enableDebugRoutes === true

  // In dev we want both '/sdk' and a custom base to work.
  const bases = Array.from(new Set([configuredBase, normalizeBase('/sdk')]))
    // Prefer longest base match first (e.g., '/sdk/esm/react' before '/sdk')
    .sort((a, b) => b.length - a.length)

  return {
    name: 'web3authn:serve-sdk',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
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

export function web3authnWalletService(opts: WalletServiceOptions = {}): VitePlugin {
  const walletServicePath = normalizeBase(opts.walletServicePath, '/wallet-service')
  const sdkBasePath = normalizeBase(opts.sdkBasePath, '/sdk')

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Web3Authn Wallet Service</title>
    <script>
      // Minimal shims some ESM bundles expect
      window.global ||= window;
      window.process ||= { env: {} };
    </script>
  </head>
  <body>
    <!-- sdkBasePath points to the SDK root (e.g. '/sdk'). Load the host directly. -->
    <script type="module" src="${sdkBasePath}/wallet-iframe-host.js"></script>
  </body>
</html>`

  return {
    name: 'web3authn:wallet-service',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (!req.url) return next()
        const url = req.url.split('?')[0]
        if (url !== walletServicePath) return next()
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(html)
      })
    },
  }
}

export function web3authnWasmMime(): VitePlugin {
  return {
    name: 'web3authn:wasm-mime',
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

export function web3authnDevHeaders(opts: DevHeadersOptions = {}): VitePlugin {
  const walletOriginRaw = opts.walletOrigin ?? process.env.VITE_WALLET_ORIGIN
  const walletOrigin = walletOriginRaw?.trim()
  const walletServicePath = normalizeBase(opts.walletServicePath || process.env.VITE_WALLET_SERVICE_PATH, '/wallet-service')
  const sdkBasePath = normalizeBase(opts.sdkBasePath || process.env.VITE_SDK_BASE_PATH, '/sdk')

  // Build a Permissions-Policy that only lists self unless a wallet origin is provided.
  const ppParts: string[] = []
  ppParts.push(`publickey-credentials-get=(self${walletOrigin ? ` "${walletOrigin}"` : ''})`)
  ppParts.push(`publickey-credentials-create=(self${walletOrigin ? ` "${walletOrigin}"` : ''})`)
  // Allow clipboard for top-level and wallet origin, so nested iframes can delegate
  ppParts.push(`clipboard-read=(self${walletOrigin ? ` "${walletOrigin}"` : ''})`)
  ppParts.push(`clipboard-write=(self${walletOrigin ? ` "${walletOrigin}"` : ''})`)
  const permissionsPolicy = ppParts.join(', ')

  return {
    name: 'web3authn:dev-headers',
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

        if (url.startsWith(`${sdkBasePath}/`)) {
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
        }
        next()
      })
    },
  }
}

export function web3authnDev(options: Web3AuthnDevOptions = {}): VitePlugin {
  const mode: Required<Web3AuthnDevOptions>['mode'] = options.mode || 'self-contained'
  const sdkBasePath = normalizeBase(options.sdkBasePath || process.env.VITE_SDK_BASE_PATH, '/sdk')
  const walletServicePath = normalizeBase(options.walletServicePath || process.env.VITE_WALLET_SERVICE_PATH, '/wallet-service')
  const walletOrigin = (options.walletOrigin ?? process.env.VITE_WALLET_ORIGIN)?.trim()
  const setDevHeaders = options.setDevHeaders !== false // default true
  const enableDebugRoutes = options.enableDebugRoutes === true
  const sdkDistRoot = resolveSdkDistRoot(options.sdkDistRoot)

  // Build the sub-plugins to keep logic small and testable
  const sdkPlugin = web3authnServeSdk({ sdkBasePath, sdkDistRoot, enableDebugRoutes })
  const walletPlugin = web3authnWalletService({ walletServicePath, sdkBasePath })
  const wasmMimePlugin = web3authnWasmMime()
  const headersPlugin = setDevHeaders ? web3authnDevHeaders({ walletOrigin, walletServicePath, sdkBasePath }) : undefined

  return {
    name: 'web3authn:dev',
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
export default web3authnDev

// === Build-time helper: emit Cloudflare Pages/Netlify _headers ===
// This plugin writes a _headers file into Vite's outDir with COOP/COEP and a
// Permissions-Policy delegating WebAuthn to the configured wallet origin.
// It is a no-op if a _headers file already exists (to avoid overriding app settings).
export function web3authnBuildHeaders(opts: { walletOrigin?: string } = {}): VitePlugin {
  const walletOriginRaw = opts.walletOrigin ?? process.env.VITE_WALLET_ORIGIN
  const walletOrigin = walletOriginRaw?.trim()
  const walletServicePath = normalizeBase(process.env.VITE_WALLET_SERVICE_PATH, '/wallet-service')

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
    name: 'web3authn:build-headers',
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
          console.warn('[web3authn] _headers already exists in outDir; skipping auto-emission')
          return
        }
        const content = `/*\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp\n  Cross-Origin-Resource-Policy: cross-origin\n  Permissions-Policy: ${permissionsPolicy}\n\n${walletServicePath}\n  Cross-Origin-Opener-Policy: unsafe-none\n${walletServicePath}/\n  Cross-Origin-Opener-Policy: unsafe-none\n`
        fs.mkdirSync(outDir, { recursive: true })
        fs.writeFileSync(hdrPath, content, 'utf-8')
        console.log('[web3authn] emitted _headers with COOP/COEP + Permissions-Policy')
      } catch (e) {
        console.warn('[web3authn] failed to emit _headers:', e)
      }
    },
  }

  return plugin as unknown as VitePlugin
}
