import { withTatchiHeaders } from '@tatchi-xyz/sdk/plugins/next'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

// ESM-compatible __dirname
const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const baseConfig = {
  // Silence Next.js monorepo root inference warning in workspaces
  outputFileTracingRoot: __dirname,
}

/**
 * Note on CSP in dev vs prod:
 * - We relax CSP ONLY for Next.js development to satisfy the framework’s dev runtime (Fast Refresh/overlay),
 *   which needs 'unsafe-eval' and inline styles.
 * - To allow the SDK to modulepreload the wallet host script from the wallet origin, we explicitly allow the wallet
 *   origin in script-src for development.
 * - In production, you should keep CSP strict (no 'unsafe-eval', no inline styles, include "style-src-attr 'none'").
 */
const walletOrigin = process.env.NEXT_PUBLIC_WALLET_ORIGIN || 'https://wallet.example.localhost'

const isDev = process.env.NODE_ENV !== 'production'
const nextConfig = withTatchiHeaders(baseConfig, {
  walletOrigin,
  cspMode: isDev ? 'compatible' : 'strict',
  allowUnsafeEvalDev: true,
  compatibleInDev: true,
  // Allow wallet origin in script-src for dev cross-origin modulepreload
  extraScriptSrc: isDev ? [walletOrigin] : [],
})

export default nextConfig
