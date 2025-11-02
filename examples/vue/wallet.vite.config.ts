/*
  DEVELOPMENT ONLY
  - Dedicated wallet dev server for Vue example. Serves /wallet-service and /sdk/*
    on its own origin so the app stays explicitly cross‑origin.
  - In production, deploy the wallet site separately and point VITE_WALLET_ORIGIN
    at that remote origin. Do not co‑host wallet pages on the app server.
*/
import { defineConfig, loadEnv } from 'vite'
import { tatchiWallet } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    server: {
      port: 5174,
      allowedHosts: ['wallet.example.localhost', 'pta-m4.local'],
    },
    plugins: [
      tatchiWallet({
        walletOrigin: env.VITE_WALLET_ORIGIN || 'https://wallet.example.localhost',
        walletServicePath: '/wallet-service',
        sdkBasePath: '/sdk',
        emitHeaders: true
      }),
    ],
    cacheDir: 'node_modules/.vite-wallet',
    // Use cacheDir to avoid lock contention with vite.config.ts (app-server).
  }
})
