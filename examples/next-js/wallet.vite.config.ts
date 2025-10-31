import { tatchiDevServer } from '@tatchi-xyz/sdk/plugins/vite'

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
      tatchiDevServer({
        mode: 'wallet-only',
        sdkBasePath: '/sdk',
        walletServicePath: '/wallet-service',
        walletOrigin,
        setDevHeaders: true,
      }),
    ],
  }
}
