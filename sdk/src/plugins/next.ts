// Minimal Next.js helpers: compose a headers() entry for cross-origin wallet embedding.
// Avoid importing Next types; keep shapes generic.
//
// CSP policy note:
// - We RELAX CSP ONLY FOR NEXT DEV to accommodate the framework's dev runtime (Fast Refresh/overlay),
//   which requires 'unsafe-eval' and inline styles. This relaxation is not required by the Tatchi SDK itself.
// - In PRODUCTION you should keep a strict CSP (no 'unsafe-eval', no inline styles, and include "style-src-attr 'none'").

import { buildPermissionsPolicy, buildWalletCsp, type CspMode } from './headers'
import { fetchRorOriginsFromNear, resolveSdkDistRoot, toBasePath } from './plugin-utils'
import { emitOfflineExportAssets as emitOfflineAssetsCore } from './offline'
import * as path from 'node:path'

export type NextHeader = { key: string; value: string }
export type NextHeaderEntry = { source: string; headers: NextHeader[] }

export function tatchiNextHeaders(opts: {
  walletOrigin: string
  cspMode?: CspMode
  extraFrameSrc?: string[]
  /** Optional allowlist for script-src (e.g., wallet origin for modulepreload in dev) */
  extraScriptSrc?: string[]
  allowUnsafeEvalDev?: boolean
  compatibleInDev?: boolean
}): NextHeaderEntry[] {
  const wallet = opts.walletOrigin
  const permissions = buildPermissionsPolicy(wallet)
  const isDev = process.env.NODE_ENV !== 'production'
  const mode: CspMode = opts.cspMode ?? (isDev && (opts.compatibleInDev ?? true) ? 'compatible' : 'strict')
  const allowUnsafeEval = isDev && (opts.allowUnsafeEvalDev ?? true)
  const csp = buildWalletCsp({
    frameSrc: [wallet, ...(opts.extraFrameSrc || [])],
    scriptSrcAllowlist: [...(opts.extraScriptSrc || [])],
    mode,
    allowUnsafeEval,
  })
  return [
    { source: '/:path*', headers: [
      { key: 'Permissions-Policy', value: permissions },
      { key: 'Content-Security-Policy', value: csp },
    ]}
  ]
}

/**
 * Convenience wrapper for Next.js app origin.
 * Adds Permissions-Policy and a wallet-friendly CSP via Next's headers() API.
 * emitHeaders has no effect for Next.js; kept for parity with Vite wrappers.
 */
export function tatchiNextApp(opts: {
  walletOrigin: string
  emitHeaders?: boolean
  cspMode?: CspMode
  extraFrameSrc?: string[]
  extraScriptSrc?: string[]
  allowUnsafeEvalDev?: boolean
  compatibleInDev?: boolean
}) {
  if (opts.emitHeaders) {
    console.warn('[tatchi] tatchiNextApp: emitHeaders has no effect in Next.js; headers are applied via next.config.js headers().')
  }
  return (config: any) => {
    const existing = config?.headers
    return {
      ...config,
      async headers() {
        const user = typeof existing === 'function' ? await existing() : []
        return [...(user || []), ...tatchiNextHeaders(opts)]
      },
    }
  }
}

/**
 * Convenience wrapper for Next.js wallet origin.
 * Same behavior as tatchiNextApp — Next.js does not serve the SDK/wallet HTML; this
 * helper only sets headers via headers() so the wallet host can be prepped if you
 * proxy wallet routes through Next in dev.
 */
export function tatchiNextWallet(opts: {
  walletOrigin: string
  emitHeaders?: boolean
  cspMode?: CspMode
  extraFrameSrc?: string[]
  extraScriptSrc?: string[]
  allowUnsafeEvalDev?: boolean
  compatibleInDev?: boolean
}) {
  if (opts.emitHeaders) {
    console.warn('[tatchi] tatchiNextWallet: emitHeaders has no effect in Next.js; headers are applied via next.config.js headers().')
  }
  return (config: any) => {
    const existing = config?.headers
    return {
      ...config,
      async headers() {
        const user = typeof existing === 'function' ? await existing() : []
        return [...(user || []), ...tatchiNextHeaders(opts)]
      },
}
  }
}

// === Well-known (/.well-known/webauthn) helpers for Next.js ===
// These helpers mirror the Vite dev server behavior and let Next apps expose
// a dynamic allowlist fetched from chain without a relay in development.

type RorOpts = {
  rpcUrl?: string
  contractId?: string
  method?: string
  cacheTtlMs?: number
}

function resolveRorParams(opts: RorOpts) {
  const rpcUrl = (opts.rpcUrl || process.env.VITE_NEAR_RPC_URL || 'https://test.rpc.fastnear.com').toString().trim()
  const contractId = (opts.contractId || process.env.VITE_WEBAUTHN_CONTRACT_ID || '').toString().trim()
  const method = (opts.method || process.env.VITE_ROR_METHOD || 'get_allowed_origins').toString().trim()
  const cacheTtlMs = Number(opts.cacheTtlMs ?? process.env.VITE_ROR_CACHE_TTL_MS ?? 60000)
  return { rpcUrl, contractId, method, cacheTtlMs }
}

/**
 * Pages Router compatible handler (Node runtime).
 * Usage (pages/api/.well-known/webauthn.ts):
 *   export default (req, res) => handleWellKnownRorNode(req, res)
 */
export async function handleWellKnownRorNode(req: any, res: any, opts: RorOpts = {}) {
  try {
    const params = resolveRorParams(opts)
    const origins = params.contractId
      ? await fetchRorOriginsFromNear(params)
      : []
    res.statusCode = 200
    res.setHeader?.('Content-Type', 'application/json; charset=utf-8')
    res.setHeader?.('Cache-Control', 'max-age=60, stale-while-revalidate=600')
    res.end?.(JSON.stringify({ origins }))
  } catch (e) {
    console.warn('[tatchi][next] ROR fetch failed:', e)
    res.statusCode = 200
    res.setHeader?.('Content-Type', 'application/json; charset=utf-8')
    res.setHeader?.('Cache-Control', 'max-age=60, stale-while-revalidate=600')
    res.end?.(JSON.stringify({ origins: [] }))
  }
}

/**
 * App Router compatible handler (Edge/Route Handler style).
 * Usage (app/.well-known/webauthn/route.ts):
 *   export async function GET(req: Request) { return handleWellKnownRorEdge(req) }
 */
export async function handleWellKnownRorEdge(_request: Request, opts: RorOpts = {}): Promise<Response> {
  try {
    const params = resolveRorParams(opts)
    const origins = params.contractId
      ? await fetchRorOriginsFromNear(params)
      : []
    return new Response(JSON.stringify({ origins }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'max-age=60, stale-while-revalidate=600',
      },
    })
  } catch (e) {
    console.warn('[tatchi][next] ROR fetch failed:', e)
    const origins: string[] = []
    return new Response(JSON.stringify({ origins }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'max-age=60, stale-while-revalidate=600',
      },
    })
  }
}

// === Build-time helper: emit offline-export assets (Next.js parity) ===
// Exported for parity with the Vite plugin helper. Can be invoked from a
// custom Next build script or post-build step to copy SW/workers and emit
// offline-export HTML, manifest, and precache manifest into your public dir.

export function nextEmitOfflineExportAssets(opts: { outDir: string; sdkBasePath?: string; sdkDistRoot?: string }): void {
  const outDir = path.resolve(opts.outDir)
  const sdkBasePath = toBasePath(opts.sdkBasePath, '/sdk')
  const sdkDistRoot = resolveSdkDistRoot(opts.sdkDistRoot)
  emitOfflineAssetsCore({ outDir, sdkBasePath, sdkDistRoot })
}
