import { defineConfig, loadEnv } from 'vite'
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { tatchiDevHeaders, tatchiServeSdk, tatchiDevServer } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isWallet = mode === 'wallet'
  const walletOrigin = env.VITE_WALLET_ORIGIN || 'https://wallet.example.localhost'
  const port = isWallet ? 5174 : 5175
  const hmrHost = isWallet ? 'wallet.example.localhost' : 'svelte.example.localhost'

  const plugins = [
    svelte({ preprocess: vitePreprocess() }),
    ...(isWallet
      ? [
          // Wallet server: serve /wallet-service + /sdk + strict dev headers
          tatchiDevServer({
            mode: 'wallet-only',
            sdkBasePath: '/sdk',
            walletServicePath: '/wallet-service',
            walletOrigin,
            setDevHeaders: true,
          }),
        ]
      : [
          // App server: expose /sdk locally and delegate features to wallet origin
          tatchiServeSdk(),
          tatchiDevHeaders({ walletOrigin }),
        ]),
  ]

  return {
    cacheDir: isWallet ? 'node_modules/.vite-wallet' : 'node_modules/.vite-app',
    server: {
      port,
      host: '127.0.0.1',
      strictPort: true,
      hmr: { host: hmrHost, protocol: 'wss' },
    },
    plugins,
  }
})
