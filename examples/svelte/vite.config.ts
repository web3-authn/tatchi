import { defineConfig, loadEnv } from 'vite'
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { tatchiApp } from '@tatchi-xyz/sdk/plugins/vite'

// App-only dev server. Wallet server runs separately via wallet.vite.config.ts.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const walletOrigins = (env.VITE_WALLET_ORIGIN || 'https://wallet.example.localhost')
    .split(/[,\s]+/)
    .map((v) => v.trim())
    .filter(Boolean)

  return {
    server: {
      port: 5175,
      host: 'localhost',
      allowedHosts: ['svelte.example.localhost', 'pta-m4.local'],
    },
    plugins: [
      svelte({ preprocess: vitePreprocess() }),
      // Dev: headers only; Build: emit _headers when emitHeaders=true
      tatchiApp({ walletOrigins, emitHeaders: true }),
    ],
    cacheDir: 'node_modules/.vite-app', // avoid lock contention with wallet.vite.config.ts
  }
})
