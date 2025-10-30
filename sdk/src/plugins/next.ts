// Minimal Next.js helpers: compose a headers() entry for cross-origin wallet embedding.
// Avoid importing Next types; keep shapes generic.

import { buildPermissionsPolicy, buildWalletCsp, type CspMode } from './headers'

export type NextHeader = { key: string; value: string }
export type NextHeaderEntry = { source: string; headers: NextHeader[] }

export function tatchiNextHeaders(opts: {
  walletOrigin: string
  cspMode?: CspMode
  extraFrameSrc?: string[]
}): NextHeaderEntry[] {
  const wallet = opts.walletOrigin
  const permissions = buildPermissionsPolicy(wallet)
  const csp = buildWalletCsp({ frameSrc: [wallet, ...(opts.extraFrameSrc || [])], mode: opts.cspMode || 'strict' })
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

