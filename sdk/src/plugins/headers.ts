// Framework-agnostic header helpers to minimize configuration surface.
// Keep types local to avoid coupling to framework packages.

export type CspMode = 'strict' | 'compatible'

function normalizeOrigin(input?: string): string | undefined {
  try {
    const v = (input || '').trim()
    if (!v) return undefined
    // Next/Caddy/etc. expect an origin, not a path
    return new URL(v, 'http://dummy').origin === 'http://dummy' ? new URL(v).origin : v
  } catch {
    return input?.trim() || undefined
  }
}

export function buildPermissionsPolicy(walletOrigin?: string): string {
  const o = normalizeOrigin(walletOrigin)
  const part = (name: string) => `${name}=(self${o ? ` "${o}"` : ''})`
  return [
    part('publickey-credentials-get'),
    part('publickey-credentials-create'),
    part('clipboard-read'),
    part('clipboard-write'),
  ].join(', ')
}

/**
 * Build a wallet-friendly Content Security Policy string.
 *
 * mode:
 *  - 'strict' (default): no inline styles, injects "style-src-attr 'none'", and forbids 'unsafe-eval'.
 *  - 'compatible': allows inline styles/scripts via 'unsafe-inline' for friendlier dev/local setups.
 *
 * allowUnsafeEval:
 *  - false by default. Set to true only for development servers that require eval (e.g., Next.js Fast Refresh).
 *  - Tatchi SDK does not require 'unsafe-eval' in production.
 */
export function buildWalletCsp(opts: {
  frameSrc?: string[]
  mode?: CspMode
  allowUnsafeEval?: boolean
  scriptSrcAllowlist?: string[]
} = {}): string {
  const mode: CspMode = opts.mode || 'strict'
  const frame = (opts.frameSrc || []).filter(Boolean)
  const scriptAllow = (opts.scriptSrcAllowlist || [])
    .map((s) => normalizeOrigin(s) || s)
    .filter(Boolean) as string[]
  const scriptUnsafeInline = mode === 'compatible' ? " 'unsafe-inline'" : ''
  const styleUnsafeInline = mode === 'compatible' ? " 'unsafe-inline'" : ''
  const scriptUnsafeEval = opts.allowUnsafeEval ? " 'unsafe-eval'" : ''
  const base: string[] = [
    "default-src 'self'",
    `script-src 'self'${scriptUnsafeInline}${scriptUnsafeEval}${scriptAllow.length ? ' ' + scriptAllow.join(' ') : ''}`,
    `style-src 'self'${styleUnsafeInline}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https:",
    "worker-src 'self' blob:",
    `frame-src 'self'${frame.length ? ' ' + frame.join(' ') : ''}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ]
  if (mode === 'strict') base.splice(2, 0, "style-src-attr 'none'")
  return base.join('; ')
}
