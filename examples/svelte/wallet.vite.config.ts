/*
  DEVELOPMENT ONLY
  - Dedicated wallet dev server for Svelte example. Serves /wallet-service and /sdk/*
    on its own origin so the app stays explicitly cross‑origin.
  - In production, deploy the wallet site separately and point VITE_WALLET_ORIGIN
    at that remote origin. Do not co‑host wallet pages on the app server.
*/
import { defineConfig, loadEnv } from 'vite'
import { tatchiWallet } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const walletOrigin = env.VITE_WALLET_ORIGIN || 'https://wallet.example.localhost'
  const walletServicePath = env.VITE_WALLET_SERVICE_PATH || '/wallet-service'
  const sdkBasePath = env.VITE_SDK_BASE_PATH || '/sdk'

  return {
    server: {
      port: 5174,
      host: 'localhost',
      allowedHosts: ['wallet.example.localhost', 'pta-m4.local'],
    },
    plugins: [
      tatchiWallet({ walletOrigin, walletServicePath, sdkBasePath, emitHeaders: true }),
    ],
    cacheDir: 'node_modules/.vite-wallet', // avoid lock contention with vite.config.ts
  }
})

