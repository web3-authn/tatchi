import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { tatchiApp } from '@tatchi-xyz/sdk/plugins/vite'

// App-only dev server. Wallet server runs separately via wallet.vite.config.ts.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    server: {
      port: 5176,
      allowedHosts: ['vue.example.localhost', 'pta-m4.local'],
    },
    plugins: [
      vue(),
      tatchiApp({
        walletOrigin: env.VITE_WALLET_ORIGIN || 'https://wallet.example.localhost',
        emitHeaders: true // At build-time: emit _headers when emitHeaders=true
      }),
    ],
    cacheDir: 'node_modules/.vite-app',
    // Use cacheDir to avoid lock contention with wallet.vite.config.ts (wallet server)
  }
})
