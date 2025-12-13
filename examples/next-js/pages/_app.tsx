import React from 'react'
import type { AppProps, NextWebVitalsMetric } from 'next/app'
import dynamic from 'next/dynamic'
import '@tatchi-xyz/sdk/react/styles'
import { PasskeyAuthMenuSkeleton } from '@tatchi-xyz/sdk/react/passkey-auth-menu'
import { initW3APerfObservers, markOnce, measureOnce } from '../lib/perf'

const walletOrigin = process.env.NEXT_PUBLIC_WALLET_ORIGIN || 'https://wallet.example.localhost'
const relayerUrl = process.env.NEXT_PUBLIC_RELAYER_URL || 'https://relay-server.localhost'

const config = {
  nearNetwork: 'testnet' as const,
  nearRpcUrl: 'https://test.rpc.fastnear.com',
  contractId: 'w3a-v1.testnet',
  relayer: { url: relayerUrl },
  iframeWallet: { walletOrigin },
}

markOnce('w3a:boot')

function AppLoadingSkeleton() {
  React.useEffect(() => {
    markOnce('w3a:skeleton:provider:mounted')
    measureOnce('w3a:tt-skeleton:provider', 'w3a:boot', 'w3a:skeleton:provider:mounted')
  }, [])
  return (
    <main style={{ display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'system-ui, Arial' }}>
      <PasskeyAuthMenuSkeleton />
    </main>
  )
}

// Avoid importing the SDK React provider on the server — it touches browser APIs.
const TatchiPasskeyProvider = dynamic(async () => {
  markOnce('w3a:sdk:provider:import:start')
  const mod = await import('@tatchi-xyz/sdk/react/provider')
  markOnce('w3a:sdk:provider:import:end')
  measureOnce('w3a:sdk:provider:import', 'w3a:sdk:provider:import:start', 'w3a:sdk:provider:import:end')
  return mod.TatchiPasskeyProvider
}, { ssr: false, loading: () => <AppLoadingSkeleton /> })

export default function MyApp({ Component, pageProps }: AppProps) {
  React.useEffect(() => {
    initW3APerfObservers()
    markOnce('w3a:app:mounted')
    measureOnce('w3a:tt-app-mounted', 'w3a:boot', 'w3a:app:mounted')
  }, [])
  return (
    <TatchiPasskeyProvider config={config} children={<Component {...pageProps} />} />
  )
}

export function reportWebVitals(metric: NextWebVitalsMetric) {
  // https://nextjs.org/docs/pages/building-your-application/optimizing/analytics#web-vitals
  console.log('[web-vitals]', metric.name, metric.value, Math.round(metric.startTime))
}
