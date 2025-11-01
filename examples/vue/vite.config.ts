import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { tatchiDevServer, tatchiHeaders, tatchiServeSdk } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const walletOrigin = env.VITE_WALLET_ORIGIN || 'https://wallet.example.localhost'

  // We run two Vite servers, with Caddy as proxy:
  //  - app server (mode !== 'wallet'): serves the Vue app + headers
  //  - wallet server (mode === 'wallet'): serves /wallet-service and /sdk via tatchiDevServer
  const isWallet = mode === 'wallet'
  const port = isWallet ? 5174 : 5176
  // Use cache dirs for app vs wallet to avoid optimizer lock contention
  const cacheDir = isWallet ? 'node_modules/.vite-wallet' : 'node_modules/.vite-app'

  const tatchiPlugins = isWallet
  ? [
      // Wallet instance: provide wallet service HTML + SDK + dev headers
      tatchiDevServer({
        mode: 'wallet-only',
        sdkBasePath: '/sdk',
        walletServicePath: '/wallet-service',
        walletOrigin,
        setDevHeaders: true,
      }),
    ]
  : [
      // App instance: SDK assets for local dev + headers delegating to the wallet origin
      tatchiServeSdk(),
      tatchiHeaders({ walletOrigin }),
    ]

  return {
    server: { port },
    cacheDir: cacheDir,
    plugins: [
      vue(),
      ...tatchiPlugins,
    ],
  }
})
