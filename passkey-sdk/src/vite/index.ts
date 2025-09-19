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
  const sdkBasePath = normalizeBase(opts.sdkBasePath, '/sdk')
  const sdkDistRoot = resolveSdkDistRoot(opts.sdkDistRoot)
  const enableDebugRoutes = opts.enableDebugRoutes === true

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

      // Serve files under sdkBasePath from sdkDistRoot with fallbacks
      server.middlewares.use((req: any, res: any, next: any) => {
        if (!req.url) return next()
        const url = req.url.split('?')[0]
        if (!url.startsWith(sdkBasePath + '/')) return next()

        const rel = url.slice((sdkBasePath + '/').length)
        // Try direct dist, then dist/esm, then dist/esm/react
        const candidate = tryFile(
          path.join(sdkDistRoot, rel),
          path.join(sdkDistRoot, 'esm', rel),
          path.join(sdkDistRoot, 'esm', 'react', rel)
        )

        if (!candidate) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: 'SDK asset not found', path: rel }))
          return
        }

        try {
          setContentType(res, candidate)
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
    <script type="module" src="${sdkBasePath}/esm/react/embedded/wallet-iframe-host.js"></script>
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
  const walletOrigin = (opts.walletOrigin || process.env.VITE_WALLET_ORIGIN || 'https://wallet.example.localhost').trim()
  const permissionsPolicy = [
    `publickey-credentials-get=(self "${walletOrigin}")`,
    `publickey-credentials-create=(self "${walletOrigin}")`,
  ].join(', ')

  return {
    name: 'web3authn:dev-headers',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req: any, res: any, next: any) => {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
        res.setHeader('Permissions-Policy', permissionsPolicy)
        next()
      })
    },
  }
}

export function web3authnDev(options: Web3AuthnDevOptions = {}): VitePlugin {
  const mode: Required<Web3AuthnDevOptions>['mode'] = options.mode || 'self-contained'
  const sdkBasePath = normalizeBase(options.sdkBasePath || process.env.VITE_WEB3AUTHN_SDK_BASE, '/sdk')
  const walletServicePath = normalizeBase(options.walletServicePath || process.env.VITE_WALLET_SERVICE_PATH, '/wallet-service')
  const walletOrigin = (options.walletOrigin || process.env.VITE_WALLET_ORIGIN || 'https://wallet.example.localhost').trim()
  const setDevHeaders = options.setDevHeaders !== false // default true
  const enableDebugRoutes = options.enableDebugRoutes === true
  const sdkDistRoot = resolveSdkDistRoot(options.sdkDistRoot)

  // Build the sub-plugins to keep logic small and testable
  const sdkPlugin = web3authnServeSdk({ sdkBasePath, sdkDistRoot, enableDebugRoutes })
  const walletPlugin = web3authnWalletService({ walletServicePath, sdkBasePath })
  const wasmMimePlugin = web3authnWasmMime()
  const headersPlugin = setDevHeaders ? web3authnDevHeaders({ walletOrigin }) : undefined

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
