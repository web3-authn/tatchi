import { defineConfig } from 'vitepress'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { tatchiWallet } from '@tatchi-xyz/sdk/plugins/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const appSrc = fileURLToPath(new URL('../', import.meta.url))
const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url))

// VitePress defineConfig expects a plain object. Resolve env statically here.
const resolvedMode = (process.env.NODE_ENV === 'production' ? 'production' : 'development') as 'production' | 'development'
const env = loadEnv(resolvedMode, projectRoot, '')
// Forward VITE_* to process.env so Node-side plugins can read them
if (env.VITE_WEBAUTHN_CONTRACT_ID) process.env.VITE_WEBAUTHN_CONTRACT_ID = env.VITE_WEBAUTHN_CONTRACT_ID
if (env.VITE_NEAR_RPC_URL) process.env.VITE_NEAR_RPC_URL = env.VITE_NEAR_RPC_URL
if (env.VITE_ROR_METHOD) process.env.VITE_ROR_METHOD = env.VITE_ROR_METHOD
// Ensure rpId base is visible to Node-side SDK dev plugins (offline-export HTML)
if (env.VITE_RP_ID_BASE) process.env.VITE_RP_ID_BASE = env.VITE_RP_ID_BASE

export default defineConfig({
  // Hosted at the site root
  base: '/',
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
          { text: 'Next Steps', link: '/docs/getting-started/next-steps' },
          {
            text: 'Other Frameworks',
            collapsed: true,
            items: [
              { text: 'Vue', link: '/docs/getting-started/other-frameworks#vue-3-vanilla-sdk' },
              { text: 'Next.js', link: '/docs/getting-started/other-frameworks#next-js' },
              { text: 'Vanilla JS', link: '/docs/getting-started/other-frameworks#vanilla-js-expressjs-or-similar' },
              { text: 'Svelte', link: '/docs/getting-started/other-frameworks#svelte-vanilla-sdk' },
            ],
          },
        ],
      },
      {
        text: 'Guides',
        collapsed: false,
        items: [
          { text: 'Core Flows', items: [
            { text: 'Registration Flow', link: '/docs/guides/registration-flow' },
            { text: 'Passkeys', link: '/docs/guides/passkeys' },
            { text: 'Secure Tx Confirmation', link: '/docs/guides/tx-confirmation' },
            { text: 'Chainsigs Swap Demo', link: '/docs/guides/chainsigs-swap-demo' },
          ]},
          { text: 'Integration', items: [
            { text: 'Wallet Iframe', link: '/docs/guides/wallet-iframe' },
            { text: 'Relay Server', link: '/docs/guides/relay-server' },
            { text: 'Device Linking', link: '/docs/guides/device-linking' },
          ]},
          { text: 'Deployment', items: [
            { text: 'Self-hosting the Wallet SDK', link: '/docs/guides/selfhosting' },
            { text: 'Cloudflare Worker', link: '/docs/guides/cloudflare-worker' },
            { text: 'Cloudflare WASM Imports', link: '/docs/guides/cloudflare-wasm-imports' },
            { text: 'Cloudflare + GitHub Actions', link: '/docs/guides/cloudflare-github-actions-setup' },
            { text: 'Asset URL Resolution', link: '/docs/guides/asset-url-resolution' },
          ]},
        ],
      },
      {
        text: 'Concepts',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/docs/concepts/' },
          { text: 'Goals of the Wallet', link: '/docs/concepts/goals' },
          { text: 'Architecture Overview', link: '/docs/concepts/wallet-iframe-architecture' },
          { text: 'Iframe-Isolated Signing', link: '/docs/concepts/iframe-isolated-signing' },
          { text: 'Security Model', link: '/docs/concepts/security-model' },
          { text: 'Credential Scope (rpId)', link: '/docs/concepts/wallet-scoped-credentials' },
          { text: 'VRF & PRF', link: '/docs/concepts/vrf-and-prf' },
          { text: 'VRF Challenges', link: '/docs/concepts/vrf-challenges' },
          { text: 'Shamir 3‑pass', link: '/docs/concepts/shamir3pass' },
          { text: 'Server key rotation', link: '/docs/concepts/shamir3pass-rotate-keys' },
          { text: 'Nonce manager', link: '/docs/concepts/nonce-manager' },
          { text: 'Confirmation UX', link: '/docs/concepts/confirmation-ux' },
          { text: 'CSP for Lit Components', link: '/docs/concepts/csp-lit-components' },
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
      // Dev: serve /wallet-service and /sdk with headers (no files written).
      // Build-time: emit _headers for Cloudflare Pages/Netlify with COOP/COEP/CORP and
      // a Permissions-Policy delegating WebAuthn to the wallet origin. Wallet HTML gets
      // strict CSP. If your CI already writes a _headers file, this will no-op.
      tatchiWallet({
        enableDebugRoutes: true,
        sdkBasePath: env.VITE_SDK_BASE_PATH || '/sdk',
        walletServicePath: env.VITE_WALLET_SERVICE_PATH || '/wallet-service',
        walletOrigin: env.VITE_WALLET_ORIGIN,
        emitHeaders: true,
      }),
    ],
  },
})
