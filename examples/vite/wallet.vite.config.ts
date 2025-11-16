/*
  DEVELOPMENT ONLY
  - This config starts a dedicated wallet dev server so the app can connect to a
    different wallet origin during local development (cross‑origin).
  - In production, this example uses a remote wallet origin (cross‑origin) for
    security and does not co‑host the wallet on the app server.
  - Do not deploy this server with the app. Instead, deploy the wallet site
    separately and point VITE_WALLET_ORIGIN at that remote origin. The app
    dev server remains app‑only via `tatchiAppServer` in `vite.config.ts`.
*/
import { defineConfig, loadEnv } from 'vite'
import { tatchiWallet } from '@tatchi-xyz/sdk/plugins/vite'

// Dedicated wallet dev server. Serves /wallet-service and /sdk/* under the
// wallet origin while the app dev server uses tatchiAppServer (headers only).
// Caddy proxies wallet.example.localhost → localhost:5175.

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const walletOrigin = env.VITE_WALLET_ORIGIN || 'https://wallet.example.localhost'
  const walletServicePath = env.VITE_WALLET_SERVICE_PATH || '/wallet-service'
  const sdkBasePath = env.VITE_SDK_BASE_PATH || '/sdk'
  // Surface VITE_* into process.env so SDK dev plugins (Node-side) can read them
  if (env.VITE_WEBAUTHN_CONTRACT_ID) process.env.VITE_WEBAUTHN_CONTRACT_ID = env.VITE_WEBAUTHN_CONTRACT_ID
  if (env.VITE_NEAR_RPC_URL) process.env.VITE_NEAR_RPC_URL = env.VITE_NEAR_RPC_URL
  if (env.VITE_ROR_METHOD) process.env.VITE_ROR_METHOD = env.VITE_ROR_METHOD

  return {
    clearScreen: false,
    logLevel: 'info',
    server: {
      port: 5175,
      allowedHosts: ['wallet.example.localhost', 'pta-m4.local'],
    },
    plugins: [
      tatchiWallet({ walletOrigin, walletServicePath, sdkBasePath, enableDebugRoutes: true, emitHeaders: true }),
    ],
    cacheDir: 'node_modules/.vite-wallet',
    // Use cacheDir to avoid lock contention with vite.config.ts (app-server).
  }
})
