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

export function buildWalletCsp(opts: { frameSrc?: string[]; mode?: CspMode } = {}): string {
  const mode: CspMode = opts.mode || 'strict'
  const frame = (opts.frameSrc || []).filter(Boolean)
  const base: string[] = [
    "default-src 'self'",
    `script-src 'self'${mode === 'compatible' ? " 'unsafe-inline'" : ''}`,
    `style-src 'self'${mode === 'compatible' ? " 'unsafe-inline'" : ''}`,
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
