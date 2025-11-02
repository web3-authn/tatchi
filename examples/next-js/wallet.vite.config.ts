/*
  DEVELOPMENT ONLY
  - Dedicated wallet dev server used alongside Next.js app. Serves /wallet-service
    and /sdk/* on the wallet origin so the app stays cross‑origin in dev.
  - In production, deploy the wallet site separately and point NEXT_PUBLIC_WALLET_ORIGIN
    at that remote origin.
*/
import { tatchiWallet } from '@tatchi-xyz/sdk/plugins/vite'

export default () => {
  const walletOrigin = process.env.NEXT_PUBLIC_WALLET_ORIGIN || 'https://wallet.example.localhost'
  const hmrHost = 'wallet.example.localhost'

  return {
    cacheDir: 'node_modules/.vite-wallet',
    server: {
      port: 5174,
      host: '127.0.0.1',
      strictPort: true,
      hmr: { host: hmrHost, protocol: 'wss' },
    },
    plugins: [
      tatchiWallet({
        sdkBasePath: '/sdk',
        walletServicePath: '/wallet-service',
        walletOrigin,
        emitHeaders: true,
      }),
    ],
  }
}
