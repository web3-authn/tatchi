import { defineConfig } from 'vitepress'
import { fileURLToPath } from 'node:url'

const appSrc = fileURLToPath(new URL('../../', import.meta.url))

export default defineConfig({
  // Hosted under /docs on the same origin (Caddy in dev, app dist in prod)
  base: '/docs/',

  title: 'Tatchi SDK',
  description: 'Docs for the SDK and examples',

  themeConfig: {
    // Show right-hand outline with H2/H3
    outline: [2, 3],
    search: { provider: 'local' },

    nav: [
      { text: '<- Back to Home', link: '/' },
      { text: 'SDK', link: '/' },
    ],

    // Global sidebar: always show all sections (collapsible groups)
    sidebar: [
      {
        text: 'Getting Started',
        collapsed: false,
        items: [
          { text: 'Install', link: '/getting-started/install' },
          { text: 'Quickstart', link: '/getting-started/quickstart' },
        ],
      },
      {
        text: 'Guides',
        collapsed: false,
        items: [
          { text: 'Guides Index', link: '/guides/' },
          { text: 'Wallet Iframe', link: '/guides/wallet-iframe' },
          { text: 'Passkeys', link: '/guides/passkeys' },
          { text: 'Secure Tx Confirmation', link: '/guides/tx-confirmation' },
          { text: 'Asset URL Resolution', link: '/guides/asset-url-resolution' },
          { text: 'Relay Server', link: '/guides/relay-server' },
          { text: 'Device Linking', link: '/guides/device-linking' },
          { text: 'Cloudflare Worker', link: '/guides/cloudflare-worker' },
          { text: 'Cloudflare WASM Imports', link: '/guides/cloudflare-wasm-imports' },
          { text: 'Cloudflare + GitHub Actions', link: '/guides/cloudflare-github-actions-setup' },
          { text: 'iPhone (Safari) Dev', link: '/guides/iphone-dev/' },
          { text: 'Safari address bar fix', link: '/guides/iphone-dev/safari-address-bar-fix' },
        ],
      },
      {
        text: 'Concepts',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/concepts/' },
          { text: 'Shamir 3‑pass', link: '/concepts/shamir3pass' },
          { text: 'Server key rotation', link: '/concepts/shamir3pass-rotate-keys' },
          { text: 'Nonce manager', link: '/concepts/nonce-manager' },
          { text: 'RPID policy', link: '/concepts/rpid-policy' },
          { text: 'Wallet iframe architecture', link: '/concepts/wallet-iframe-architecture' },
          { text: 'Wallet‑scoped credentials', link: '/concepts/wallet-scoped-credentials' },
          { text: 'VRF & PRF', link: '/concepts/vrf-and-prf' },
        ],
      },
      {
        text: 'API',
        collapsed: false,
        items: [
          { text: 'API Index', link: '/api/' },
          { text: 'Passkey Manager', link: '/api/passkey-manager' },
          { text: 'WebAuthn Manager', link: '/api/webauthn-manager' },
          { text: 'React Components', link: '/api/react-components' },
          { text: 'Client', link: '/api/client' },
          { text: 'Server', link: '/api/server' },
        ],
      },
    ],
  },

  vite: {
    server: {
      host: 'localhost',
      port: 5222,
      fs: { allow: [appSrc] },
      allowedHosts: ['example.localhost', 'pta-m4.local'],
    },
    resolve: {
      alias: {
        '@app': appSrc,
      },
    },
  },
})
