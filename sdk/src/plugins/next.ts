// Minimal Next.js helpers: compose a headers() entry for cross-origin wallet embedding.
// Avoid importing Next types; keep shapes generic.
//
// CSP policy note:
// - We RELAX CSP ONLY FOR NEXT DEV to accommodate the framework's dev runtime (Fast Refresh/overlay),
//   which requires 'unsafe-eval' and inline styles. This relaxation is not required by the Tatchi SDK itself.
// - In PRODUCTION you should keep a strict CSP (no 'unsafe-eval', no inline styles, and include "style-src-attr 'none'").

import { buildPermissionsPolicy, buildWalletCsp, type CspMode } from './headers'

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

export function withTatchiHeaders(config: any, opts: {
  walletOrigin: string
  cspMode?: CspMode
  extraFrameSrc?: string[]
  extraScriptSrc?: string[]
  allowUnsafeEvalDev?: boolean
  compatibleInDev?: boolean
}): any {
  const existing = config?.headers
  return {
    ...config,
    async headers() {
      const user = typeof existing === 'function' ? await existing() : []
      return [...(user || []), ...tatchiNextHeaders(opts)]
    }
  }
}
