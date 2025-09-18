import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { web3authnDev, web3authnDevHeaders } from '@web3authn/passkey/vite'

export default defineConfig({
  server: {
    port: 5174,
    host: 'localhost',
    open: false,
    fs: {
      allow: [
        '..',
        '../..',
        '../../passkey-sdk/dist'
        // serve SDK dist directly from workspace
      ]
    },
  },
  plugins: [
    react(),
    // Web3Authn dev integration: serves SDK, wallet service route, WASM MIME.
    web3authnDev({ mode: 'self-contained', setDevHeaders: false, enableDebugRoutes: true }),
    // SDK dev headers middleware (COOP/COEP + Permissions-Policy delegating WebAuthn)
    // Enable this if your proxy (e.g., Caddy) is not already setting these headers.
    web3authnDevHeaders({ walletOrigin: process.env.VITE_WALLET_ORIGIN || 'https://wallet.example.localhost' }),
  ],
  define: {
    // Shim minimal globals some legacy/browserified deps expect
    global: 'globalThis',
  },
})
