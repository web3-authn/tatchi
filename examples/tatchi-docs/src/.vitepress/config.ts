import { defineConfig } from 'vitepress'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { tatchiDev, tatchiBuildHeaders } from '@tatchi/sdk/plugins/vite'

const appSrc = fileURLToPath(new URL('../', import.meta.url))
const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url))

// VitePress defineConfig expects a plain object. Resolve env statically here.
const resolvedMode = (process.env.NODE_ENV === 'production' ? 'production' : 'development') as 'production' | 'development'
const env = loadEnv(resolvedMode, projectRoot, '')

export default defineConfig({
  // Hosted at the site root
  base: '/',

  title: 'Tatchi SDK',
  description: 'Docs for the SDK and examples',
  // Use VitePress built-in appearance + nav; hidden on homepage via theme logic
  appearance: true,

  themeConfig: {
    // Show right-hand outline with H2/H3
    outline: [2, 3],
    search: { provider: 'local' },

    // Keep default navbar links for non-home pages
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Docs', link: '/docs/getting-started/install' },
    ],

    // Global sidebar: always show all sections (collapsible groups)
    sidebar: [
      {
        text: 'Getting Started',
        collapsed: false,
        items: [
          { text: 'Install', link: '/docs/getting-started/install' },
          { text: 'Quickstart', link: '/docs/getting-started/quickstart' },
        ],
      },
      {
        text: 'Guides',
        collapsed: false,
        items: [
          { text: 'Guides Index', link: '/docs/guides/' },
          { text: 'Wallet Iframe', link: '/docs/guides/wallet-iframe' },
          { text: 'Passkeys', link: '/docs/guides/passkeys' },
          { text: 'Secure Tx Confirmation', link: '/docs/guides/tx-confirmation' },
          { text: 'Asset URL Resolution', link: '/docs/guides/asset-url-resolution' },
          { text: 'Relay Server', link: '/docs/guides/relay-server' },
          { text: 'Device Linking', link: '/docs/guides/device-linking' },
          { text: 'Cloudflare Worker', link: '/docs/guides/cloudflare-worker' },
          { text: 'Cloudflare WASM Imports', link: '/docs/guides/cloudflare-wasm-imports' },
          { text: 'Cloudflare + GitHub Actions', link: '/docs/guides/cloudflare-github-actions-setup' },
          { text: 'iPhone (Safari) Dev', link: '/docs/guides/iphone-dev/' },
          { text: 'Safari address bar fix', link: '/docs/guides/iphone-dev/safari-address-bar-fix' },
        ],
      },
      {
        text: 'Concepts',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/docs/concepts/' },
          { text: 'Shamir 3‑pass', link: '/docs/concepts/shamir3pass' },
          { text: 'Server key rotation', link: '/docs/concepts/shamir3pass-rotate-keys' },
          { text: 'Nonce manager', link: '/docs/concepts/nonce-manager' },
          { text: 'RPID policy', link: '/docs/concepts/rpid-policy' },
          { text: 'Wallet iframe architecture', link: '/docs/concepts/wallet-iframe-architecture' },
          { text: 'Wallet‑scoped credentials', link: '/docs/concepts/wallet-scoped-credentials' },
          { text: 'VRF & PRF', link: '/docs/concepts/vrf-and-prf' },
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

  vite: {
    envDir: projectRoot,
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
        '@tatchi/sdk',
        '@tatchi/sdk/react',
        '@tatchi/sdk/plugins/vite',
      ],
      include: ['react', 'react-dom']
    },
    resolve: {
      alias: {
        '@app': appSrc,
      },
      dedupe: ['react', 'react-dom'],
    },
    plugins: [
      tatchiDev({
        mode: 'self-contained',
        enableDebugRoutes: true,
        sdkBasePath: env.VITE_SDK_BASE_PATH || '/sdk',
        walletServicePath: env.VITE_WALLET_SERVICE_PATH || '/wallet-service',
        walletOrigin: env.VITE_WALLET_ORIGIN,
      }),
      tatchiBuildHeaders({ walletOrigin: env.VITE_WALLET_ORIGIN })
    ],
  },
})
