// Small shared helpers for Vite/Next plugins
import * as path from 'node:path'
import * as fs from 'node:fs'
import { createRequire } from 'node:module'

export function addPreconnectLink(res: any, origin?: string) {
  if (!origin) return
  try {
    const link = `<${origin}>; rel=preconnect; crossorigin`
    const existing = res.getHeader?.('Link')
    if (!existing) {
      res.setHeader?.('Link', link)
      return
    }
    if (typeof existing === 'string') {
      if (!existing.includes(link)) res.setHeader?.('Link', existing + ', ' + link)
      return
    }
    if (Array.isArray(existing)) {
      if (!existing.includes(link)) res.setHeader?.('Link', [...existing, link])
    }
  } catch {}
}

// Builds wallet service HTML that links only external CSS/JS (no inline),
// so strict CSP (style-src 'self'; style-src-attr 'none') works in dev/prod.
export function buildWalletServiceHtml(sdkBasePath: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Web3Authn Wallet Service</title>
    <!-- Surface styles are external so strict CSP can keep style-src 'self' -->
    <link rel="stylesheet" href="${sdkBasePath}/wallet-service.css" />
    <!-- Prefetch component styles so they are warmed without triggering preload warnings -->
    <link rel="prefetch" as="style" href="${sdkBasePath}/drawer.css" />
    <link rel="prefetch" as="style" href="${sdkBasePath}/tx-tree.css" />
    <link rel="prefetch" as="style" href="${sdkBasePath}/halo-border.css" />
    <link rel="prefetch" as="style" href="${sdkBasePath}/passkey-halo-loading.css" />
    <!-- Component theme CSS: shared tokens + component-scoped tokens -->
    <link rel="stylesheet" href="${sdkBasePath}/w3a-components.css" />
    <link rel="stylesheet" href="${sdkBasePath}/drawer.css" />
    <link rel="stylesheet" href="${sdkBasePath}/tx-tree.css" />
    <link rel="stylesheet" href="${sdkBasePath}/tx-confirmer.css" />
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
}

// Export viewer HTML is also fully externalized (no inline) to keep CSP strict.
export function buildExportViewerHtml(sdkBasePath: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <link rel="stylesheet" href="${sdkBasePath}/wallet-service.css">
    <link rel="stylesheet" href="${sdkBasePath}/w3a-components.css">
    <link rel="stylesheet" href="${sdkBasePath}/drawer.css">
    <link rel="stylesheet" href="${sdkBasePath}/tx-tree.css">
    <link rel="stylesheet" href="${sdkBasePath}/tx-confirmer.css">
    <script src="${sdkBasePath}/wallet-shims.js"></script>
    <link rel="modulepreload" href="${sdkBasePath}/export-private-key-viewer.js" crossorigin>
    <link rel="modulepreload" href="${sdkBasePath}/iframe-export-bootstrap.js" crossorigin>
  </head>
  <body>
    <w3a-drawer id="exp" theme="dark"></w3a-drawer>
    <script type="module" src="${sdkBasePath}/export-private-key-viewer.js" crossorigin></script>
    <script type="module" src="${sdkBasePath}/iframe-export-bootstrap.js" crossorigin></script>
  </body>
</html>`
}

export function resolveCoepMode(explicit?: 'strict' | 'off'): 'strict' | 'off' {
  if (explicit === 'strict' || explicit === 'off') return explicit
  const raw = String((globalThis as any)?.process?.env?.VITE_COEP_MODE || '').trim().toLowerCase()
  if (raw === 'strict' || raw === 'on' || raw === '1' || raw === 'require-corp') return 'strict'
  if (raw === 'off' || raw === '0' || raw === 'false') return 'off'
  return 'off'
}

export function applyCoepCorp(res: any) {
  res.setHeader?.('Cross-Origin-Embedder-Policy', 'require-corp')
  res.setHeader?.('Cross-Origin-Resource-Policy', 'cross-origin')
}

export function applyCoepCorpIfNeeded(res: any, coepMode?: 'strict' | 'off') {
  if (resolveCoepMode(coepMode) !== 'off') applyCoepCorp(res)
}

export function echoCorsFromRequest(
  res: any,
  req: any,
  opts: {
    honorExistingAcaOrigin?: boolean
    allowCredentialsWhenExplicit?: boolean
    methods?: string
    headers?: string
    handlePreflight?: boolean
  } = {}
) {
  const honorExisting = opts.honorExistingAcaOrigin === true
  const allowCreds = opts.allowCredentialsWhenExplicit !== false
  const methods = opts.methods || 'GET,OPTIONS'
  const headers = opts.headers || 'Content-Type,Authorization'
  const handlePreflight = opts.handlePreflight === true

  const origin = (req?.headers && (req.headers.origin as string)) || '*'
  const hasExisting = typeof res.getHeader === 'function' && !!res.getHeader('Access-Control-Allow-Origin')
  if (!honorExisting || !hasExisting) {
    res.setHeader?.('Access-Control-Allow-Origin', origin)
  }
  res.setHeader?.('Vary', 'Origin')
  res.setHeader?.('Access-Control-Allow-Methods', methods)
  res.setHeader?.('Access-Control-Allow-Headers', headers)
  if (origin !== '*' && allowCreds) res.setHeader?.('Access-Control-Allow-Credentials', 'true')
  if (handlePreflight) {
    const method = req?.method && String(req.method).toUpperCase()
    if (method === 'OPTIONS') {
      res.statusCode = 204
      res.end?.()
      return true
    }
  }
  return false
}

/**
 * Log and validate Related Origin Requests (ROR) configuration.
 * - Prints the well-known endpoint and the configured origins list.
 * - Warns if any origins are not absolute (e.g., missing protocol/hostname).
 */
export function logRorConfig(origins: string[], endpoint = '/.well-known/webauthn') {
  if (!Array.isArray(origins) || origins.length === 0) return
  const invalid: string[] = []
  for (const o of origins) {
    try {
      const u = new URL(o)
      if (!u.protocol || !u.hostname) invalid.push(o)
    } catch {
      invalid.push(o)
    }
  }
  const msg = `[tatchi] ROR enabled: GET ${endpoint} -> { origins: [${origins.join(', ')}] }`
  console.log(msg)
  if (invalid.length > 0) {
    console.warn(
      `[tatchi] ROR warning: invalid origins: ${invalid.join(
        ', '
      )} (expected absolute origins like https://app.example.com)`
    )
  }
}

// Sanitize a dynamic allowlist into a normalized set of absolute origins.
export function sanitizeOrigins(values: unknown): string[] {
  const out = new Set<string>()
  if (Array.isArray(values)) {
    for (const v of values) {
      if (typeof v !== 'string') continue
      try {
        const u = new URL(v.trim())
        const scheme = u.protocol
        const host = u.hostname.toLowerCase()
        const port = u.port ? `:${u.port}` : ''
        const isHttps = scheme === 'https:'
        const isLocalhostHttp = scheme === 'http:' && host === 'localhost'
        if (!isHttps && !isLocalhostHttp) continue
        if ((u.pathname && u.pathname !== '/') || u.search || u.hash) continue
        out.add(`${scheme}//${host}${port}`)
      } catch {}
    }
  }
  return Array.from(out)
}

/**
 * Fetch the wallet ROR allowlist from NEAR RPC and return sanitized origins.
 * Throws on transport/HTTP errors; caller may respond with an empty list on failure.
 */
const __rorCache = new Map<string, { origins: string[]; expiresAt: number }>()
const __rorInflight = new Map<string, Promise<string[]>>()

export async function fetchRorOriginsFromNear(opts: {
  rpcUrl: string
  contractId: string
  method: string
  cacheTtlMs?: number
}): Promise<string[]> {
  const { rpcUrl, contractId } = opts
  const method = opts.method || 'get_allowed_origins'
  const ttl = Math.max(0, Number(opts.cacheTtlMs ?? (process.env.VITE_ROR_CACHE_TTL_MS as any) ?? 60000)) || 60000
  const key = `${rpcUrl}|${contractId}|${method}`

  const now = Date.now()
  const cached = __rorCache.get(key)
  if (cached && now < cached.expiresAt) {
    return cached.origins
  }

  if (!__rorInflight.has(key)) {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: String(Date.now()),
      method: 'query',
      params: {
        request_type: 'call_function',
        finality: 'final',
        account_id: contractId,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify({})).toString('base64'),
      },
    })

    const p = (async () => {
      const resp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (!resp.ok) {
        throw new Error(`RPC ${resp.status} ${resp.statusText}`)
      }
      const jsonResponse = await resp.json()
      const bytes: unknown = jsonResponse?.result?.result
      let parsed: unknown = []
      if (Array.isArray(bytes)) {
        const str = String.fromCharCode(...(bytes as number[]))
        try { parsed = JSON.parse(str) } catch { parsed = [] }
      }
      const origins = sanitizeOrigins(parsed as unknown[])
      __rorCache.set(key, { origins, expiresAt: Date.now() + ttl })
      return origins
    })()

    __rorInflight.set(key, p.finally(() => __rorInflight.delete(key)))
  }

  return __rorInflight.get(key) as Promise<string[]>
}

/**
 * Infer and set a proper Content-Type header for a given file path.
 * Shared by both app and wallet-iframe dev servers.
 */
export function setContentType(res: any, filePath: string) {
  const ext = path.extname(filePath)
  switch (ext) {
    case '.js':
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      break
    case '.css':
      res.setHeader('Content-Type', 'text/css; charset=utf-8')
      break
    case '.map':
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

// === Shared path helpers across Vite/Next plugins ===

export { toBasePath } from '../utils/validation'

const requireCjs = createRequire(import.meta.url)

export function resolveSdkDistRoot(explicit?: string): string {
  if (explicit) return path.resolve(explicit)
  const pkgPath = requireCjs.resolve('@tatchi-xyz/sdk/package.json')
  const pkgDir = path.dirname(pkgPath)
  try {
    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { module?: string }
    const esmEntry = pkgJson.module || 'dist/esm/index.js'
    const esmAbs = path.resolve(pkgDir, esmEntry)
    return path.resolve(path.dirname(esmAbs), '..')
  } catch {
    return path.join(pkgDir, 'dist')
  }
}
