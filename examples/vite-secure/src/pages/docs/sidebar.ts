export type SidebarItem = { text: string; path: string }
export type SidebarGroup = { text: string; items: SidebarItem[] }

export const sidebar: SidebarGroup[] = [
  {
    text: 'Getting Started',
    items: [
      { text: 'Overview', path: '/docs' },
      { text: 'Install', path: '/docs/getting-started/install' },
      { text: 'Quickstart', path: '/docs/getting-started/quickstart' },
    ],
  },
  {
    text: 'Guides',
    items: [
      { text: 'Passkeys', path: '/docs/guides/passkeys' },
      { text: 'Wallet Iframe', path: '/docs/guides/wallet-iframe' },
      { text: 'Secure Tx Confirmation', path: '/docs/guides/tx-confirmation' },
      { text: 'Link Devices (QR)', path: '/docs/guides/device-linking' },
      { text: 'Relay Server (Node)', path: '/docs/guides/relay-server' },
      { text: 'Cloudflare Worker', path: '/docs/guides/cloudflare-worker' },
      { text: 'Cloudflare WASM Imports', path: '/docs/guides/cloudflare-wasm-imports' },
      { text: 'CF + GitHub Actions', path: '/docs/guides/cloudflare-github-actions-setup' },
      { text: 'Asset URL Resolution', path: '/docs/guides/asset-url-resolution' },
      { text: 'iPhone Dev', path: '/docs/guides/iphone-dev' },
      { text: 'iOS Safari Bar Fix', path: '/docs/guides/iphone-dev/safari-address-bar-fix' },
      { text: 'Reduce Logs', path: '/docs/guides/reduce-logs' },
      { text: 'Rename SDK', path: '/docs/guides/rename-sdk' },
    ],
  },
  {
    text: 'Concepts',
    items: [
      { text: 'Wallet Iframe Architecture', path: '/docs/concepts/wallet-iframe-architecture' },
      { text: 'VRF & PRF', path: '/docs/concepts/vrf-and-prf' },
      { text: 'Shamir3Pass', path: '/docs/concepts/shamir3pass' },
      { text: 'Nonce Manager', path: '/docs/concepts/nonce-manager' },
      { text: 'RPID Policy', path: '/docs/concepts/rpid-policy' },
      { text: 'Shamir Rotation', path: '/docs/concepts/shamir3pass-rotate-keys' },
      { text: 'Wallet‑Scoped Credentials', path: '/docs/concepts/wallet-scoped-credentials' },
    ],
  },
  {
    text: 'API Reference',
    items: [
      { text: 'Overview', path: '/docs/api' },
      { text: 'Client', path: '/docs/api/client' },
      { text: 'WebAuthn Manager', path: '/docs/api/webauthn-manager' },
      { text: 'Passkey Manager', path: '/docs/api/passkey-manager' },
      { text: 'React Components', path: '/docs/api/react-components' },
      { text: 'Server', path: '/docs/api/server' },
    ],
  },
]
