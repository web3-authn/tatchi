import { defineConfig } from 'vitepress'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { loadEnv, type Plugin } from 'vite'
import { tatchiWallet } from '@tatchi-xyz/sdk/plugins/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const appSrc = fileURLToPath(new URL('../', import.meta.url))
const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url))

const DOCS_ROOT_PATH = '/docs'
const DOCS_ROOT_REDIRECT_TARGET = '/docs/getting-started/overview'

function docsRootRedirectPlugin(target: string): Plugin {
  function redirectIfDocsRoot(req: { url?: string }, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: () => void }, next: () => void) {
    const path = (req.url || '').split('?')[0]
    if (path !== DOCS_ROOT_PATH && path !== `${DOCS_ROOT_PATH}/`) return next()

    res.statusCode = 302
    res.setHeader('Location', target)
    res.end()
  }

  return {
    name: 'tatchi-docs-root-redirect',
    configureServer(server) {
      server.middlewares.use(redirectIfDocsRoot)
    },
    configurePreviewServer(server) {
      server.middlewares.use(redirectIfDocsRoot)
    },
  }
}

function docsRootRedirectHtml(target: string) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=${target}" />
    <link rel="canonical" href="https://tatchi.xyz${target}" />
    <meta name="robots" content="noindex" />
    <title>Redirecting…</title>
  </head>
  <body>
    <p>Redirecting to <a href="${target}">${target}</a>…</p>
    <script>window.location.replace(${JSON.stringify(target)})</script>
  </body>
</html>
`
}

// VitePress defineConfig expects a plain object. Resolve env statically here.
const resolvedMode = (process.env.NODE_ENV === 'production' ? 'production' : 'development') as 'production' | 'development'
const env = loadEnv(resolvedMode, projectRoot, '')
// Bitwarden and other password managers inject extension iframes/scripts that are blocked
// by COEP=require-corp on the host page. Default to COEP off for the docs site; switch
// back on explicitly when you need cross-origin isolation testing.
const coepMode = (env.VITE_COEP_MODE === 'strict' ? 'strict' : 'off') as 'strict' | 'off'
// Forward VITE_* to process.env so Node-side plugins can read them
if (env.VITE_WEBAUTHN_CONTRACT_ID) process.env.VITE_WEBAUTHN_CONTRACT_ID = env.VITE_WEBAUTHN_CONTRACT_ID
if (env.VITE_NEAR_RPC_URL) process.env.VITE_NEAR_RPC_URL = env.VITE_NEAR_RPC_URL
if (env.VITE_ROR_METHOD) process.env.VITE_ROR_METHOD = env.VITE_ROR_METHOD
// Ensure rpId base is visible to Node-side SDK dev plugins (offline-export HTML)
if (env.VITE_RP_ID_BASE) process.env.VITE_RP_ID_BASE = env.VITE_RP_ID_BASE

// When bundling workspace packages (like `sdk/dist/*`) from outside the docs tree,
// Vite's resolver may not look inside `examples/tatchi-docs/node_modules` for
// subpath imports. Explicit aliases keep polyfill shim imports resolvable.
const polyfillShim = (p: string) => fileURLToPath(new URL(`../../node_modules/vite-plugin-node-polyfills/shims/${p}/dist/index.js`, import.meta.url))

export default defineConfig({
  // Hosted at the site root
  base: '/',

  sitemap: {
    hostname: 'https://tatchi.xyz',
  },
  buildEnd: (siteConfig) => {
    const outDir = siteConfig.outDir

    // Static fallback for hosts that don't support _redirects.
    const docsIndexPath = join(outDir, 'docs', 'index.html')
    mkdirSync(dirname(docsIndexPath), { recursive: true })
    writeFileSync(docsIndexPath, docsRootRedirectHtml(DOCS_ROOT_REDIRECT_TARGET), 'utf8')

    // Netlify/Cloudflare Pages compatible redirect (true HTTP redirect).
    const redirectsPath = join(outDir, '_redirects')
    const redirectLines = [
      '',
      '# Docs root → Getting Started overview',
      `${DOCS_ROOT_PATH}  ${DOCS_ROOT_REDIRECT_TARGET}  301`,
      `${DOCS_ROOT_PATH}/  ${DOCS_ROOT_REDIRECT_TARGET}  301`,
      '',
    ].join('\n')

    if (!existsSync(redirectsPath)) {
      writeFileSync(redirectsPath, redirectLines.trimStart(), 'utf8')
      return
    }

    const existing = readFileSync(redirectsPath, 'utf8')
    if (existing.includes(`${DOCS_ROOT_PATH}  ${DOCS_ROOT_REDIRECT_TARGET}`)) return
    writeFileSync(redirectsPath, existing.replace(/\s*$/, '') + redirectLines, 'utf8')
  },
  head: [
    ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
    // Hanken Grotesk for headings and UI; restrict to used weights for perf
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    // Preload stylesheet to reduce a round‑trip before applying fonts
    ['link', { rel: 'preload', as: 'style', href: 'https://fonts.googleapis.com/css2?family=Hanken+Grotesk:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&display=fallback' }],
    // Use display=fallback to minimize FOUT/FOUC without delaying first paint
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Hanken+Grotesk:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&display=fallback' }],
  ],

  title: 'Tatchi Passkey',
  description: 'A serverless embedded wallet SDK',
  // Use VitePress built-in appearance + nav; hidden on homepage via theme logic
  appearance: true,

  markdown: {
    languageAlias: {
      caddy: 'nginx',
    },
  },

  themeConfig: {
    siteTitle: 'Tatchi.xyz',
    // Show right-hand outline with H2/H3
    outline: [2, 3],
    search: { provider: 'local' },

    // Keep default navbar links for non-home pages
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Docs', link: '/docs/getting-started/overview' },
    ],

    // Global sidebar: always show all sections (collapsible groups)
    sidebar: [
      {
        text: 'Getting Started',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/docs/getting-started/overview' },
          { text: 'Installation', link: '/docs/getting-started/installation' },
          {
            text: 'Quick Start: Next Steps',
            link: '/docs/getting-started/next-steps',
            collapsed: false,
            items: [
              { text: 'Registration', link: '/docs/getting-started/next-steps#register-a-passkey' },
              { text: 'Login', link: '/docs/getting-started/next-steps#login' },
              { text: 'Send Transaction', link: '/docs/getting-started/next-steps#send-transaction' },
            ]
          },
          { text: 'React Recipes', link: '/docs/getting-started/react-recipes' },
          {
            text: 'Other Frameworks',
            collapsed: true,
            items: [
              { text: 'Next.js', link: '/docs/getting-started/other-frameworks#next-js' },
              { text: 'Vue 3', link: '/docs/getting-started/other-frameworks#vue-3' },
              { text: 'Svelte', link: '/docs/getting-started/other-frameworks#svelte' },
              { text: 'Vanilla JS / Express', link: '/docs/getting-started/other-frameworks#vanilla-js-express' },
            ],
          },
        ],
      },
      {
        text: 'Concepts',
        collapsed: false,
        items: [
          { text: 'Design Goals', link: '/docs/concepts/' },
          {
            text: 'Architecture',
            link: '/docs/concepts/architecture',
            items: [
              { text: 'Overview', link: '/docs/concepts/architecture#overview' },
              {
                text: 'Transaction Lifecycle',
                link: '/docs/concepts/architecture#transaction-lifecycle',
                collapsed: false,
                items: [
                  { text: 'Registration', link: '/docs/concepts/architecture#registration-flow' },
                  { text: 'Login', link: '/docs/concepts/architecture#login-flow' },
                  { text: 'Sign Transactions', link: '/docs/concepts/architecture#transaction-flow' },
                ]
              },
              {
                text: 'VRF WebAuthn',
                link: '/docs/concepts/vrf-webauthn',
                items: [
                  { text: 'Challenge Construction', link: '/docs/concepts/vrf-webauthn#vrf-challenge-construction' },
                  { text: 'WebAuthn Contract', link: '/docs/concepts/vrf-webauthn#webauthn-contract-verification' },
                ]
              },
            ],
          },
          {
            text: 'Threshold Signing',
            link: '/docs/concepts/threshold-signing',
            items: [
              { text: 'Key Material', link: '/docs/concepts/threshold-signing#key-material' },
              { text: 'Enrollment Flow', link: '/docs/concepts/threshold-signing#enrollment-flow' },
              { text: 'Signing Flow', link: '/docs/concepts/threshold-signing#signing-flow' },
              { text: 'Protocol Math', link: '/docs/concepts/threshold-signing#protocol-math' },
              { text: 'Threshold Sessions', link: '/docs/concepts/threshold-signing#threshold-sessions' },
            ]
          },
          {
            text: 'Passkey Scope',
            link: '/docs/concepts/passkey-scope',
            items: [
              { text: 'Wallet Scope', link: '/docs/concepts/passkey-scope#option-a-wallet-scoped-credentials' },
              { text: 'App Scope', link: '/docs/concepts/passkey-scope#option-b-app-scoped-credentials' },
            ]
          },
          { text: 'Security Model', link: '/docs/concepts/security-model' },
        ],
      },
      {
        text: 'Detailed Guides',
        collapsed: false,
        items: [
          { text: 'Install and Wallet Setup', link: '/docs/guides/wallet-iframe-integration' },
          { text: 'Registration (Detailed)', link: '/docs/guides/registration-login-detailed' },
          { text: 'Progress Events', link: '/docs/guides/progress-events' },
          { text: 'Sending Transactions', link: '/docs/guides/sending-transaction' },
          { text: 'Gasless Delegate Tranasctions', link: '/docs/guides/delegate-actions' },
          { text: 'Advanced Features',
            collapsed: false,
            items: [
              { text: 'Device Linking', link: '/docs/guides/device-linking' },
              { text: 'Authentication Sessions', link: '/docs/guides/authentication-sessions' },
              { text: 'Offline Key Export', link: '/docs/guides/offline-key-export' },
              { text: 'Shamir 3-Pass Protocol', link: '/docs/guides/shamir-3-pass-protocol' },
              { text: 'Nonce Manager', link: '/docs/guides/nonce-manager' },
            ]
          },
          { text: 'Deployment', items: [
            { text: 'Relay Server Deployment', link: '/docs/guides/relay-server-deployment' },
            { text: 'Self-Hosting the Wallet SDK', link: '/docs/guides/self-hosting-the-wallet-sdk' },
            { text: 'Cloudflare GitHub Actions', link: '/docs/guides/cloudflare-github-actions' },
          ]},
        ],
      },
      {
        text: 'API',
        collapsed: false,
        items: [
          { text: 'API Index', link: '/docs/api/' },
          { text: 'Passkey Manager', link: '/docs/api/passkey-manager' },
          { text: 'WebAuthn Manager', link: '/docs/api/webauthn-manager' },
          { text: 'React Components', link: '/docs/api/react-components' },
          { text: 'Client', link: '/docs/api/client' },
          { text: 'Server', link: '/docs/api/server' },
          { text: 'Web3Authn Contract', link: '/docs/api/web3authn-contract' },
        ],
      },
    ],
  },

  // Tell Vue compiler to treat hyphenated tags as native custom elements.
  // This prevents warnings like "Failed to resolve component: wallet-app".
  vue: {
    template: {
      compilerOptions: {
        isCustomElement: (tag) => tag.includes('-'),
      },
    },
  },

  vite: {
    clearScreen: false,
    logLevel: 'info',
    envDir: projectRoot,
    // Use VitePress default public directory: <docsDir>/public (i.e. src/public)
    // This keeps assets tracked in git and bundled consistently.
    server: {
      host: 'localhost',
      port: 5222,
      fs: { allow: [appSrc, workspaceRoot] },
      // Allow reverse‑proxied custom hosts for cross‑origin wallet + mdns testing
      allowedHosts: ['example.localhost', 'wallet.example.localhost', 'pta-m4.local'],
    },
    // Force a fresh pre-bundle when the cache gets stale and avoid
    // optimizing our local SDK packages which can confuse the dep optimizer
    // in monorepo/workspace setups.
    cacheDir: fileURLToPath(new URL('../../../.vitepress-cache', import.meta.url)),
    optimizeDeps: {
      force: true,
      exclude: [
        '@tatchi-xyz/sdk',
        '@tatchi-xyz/sdk/react',
        '@tatchi-xyz/sdk/plugins/vite',
      ],
      include: [
        'react',
        'react-dom',
        'buffer',
        'events',
        'util',
        'stream-browserify',
        'crypto-browserify',
        'mermaid',
        'dayjs',
      ],
      esbuildOptions: {
        define: {
          global: 'globalThis',
          'process.env': '{}',
          'process.browser': 'true',
          'process.version': '"v0.0.0"',
        },
      },
    },
    resolve: {
      alias: {
        '@app': appSrc,
        '@': appSrc,
        'vite-plugin-node-polyfills/shims/buffer': polyfillShim('buffer'),
        'vite-plugin-node-polyfills/shims/process': polyfillShim('process'),
        'vite-plugin-node-polyfills/shims/global': polyfillShim('global'),
        process: 'process/browser',
        stream: 'stream-browserify',
        crypto: 'crypto-browserify',
        util: 'util',
        events: 'events',
        buffer: 'buffer',
      },
      dedupe: ['react', 'react-dom'],
    },
    define: {
      global: 'globalThis',
      'process.env': {},
    },
    plugins: [
      // Polyfill Node globals/builtins used by chainsig.js (Buffer, process, etc.)
      nodePolyfills({
        protocolImports: true,
        globals: {
          Buffer: true,
          process: true,
        },
      }),
      docsRootRedirectPlugin(DOCS_ROOT_REDIRECT_TARGET),
      // Dev: serve /wallet-service and /sdk with headers (no files written).
      // Build-time: emit _headers for Cloudflare Pages/Netlify with COOP + Permissions-Policy
      // (and optional COEP/CORP when enabled) and
      // a Permissions-Policy delegating WebAuthn to the wallet origin. Wallet HTML gets
      // strict CSP. If your CI already writes a _headers file, this will no-op.
      tatchiWallet({
        enableDebugRoutes: true,
        sdkBasePath: env.VITE_SDK_BASE_PATH || '/sdk',
        walletServicePath: env.VITE_WALLET_SERVICE_PATH || '/wallet-service',
        walletOrigin: env.VITE_WALLET_ORIGIN,
        emitHeaders: true,
        coepMode,
      }),
    ],
  },
})
