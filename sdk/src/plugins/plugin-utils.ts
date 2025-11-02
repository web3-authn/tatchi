// Small shared helpers for Vite/Next plugins

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
</html>`
}

export function applyCoepCorp(res: any) {
  res.setHeader?.('Cross-Origin-Embedder-Policy', 'require-corp')
  res.setHeader?.('Cross-Origin-Resource-Policy', 'cross-origin')
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
