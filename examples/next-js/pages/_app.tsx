import type { AppProps } from 'next/app'
import dynamic from 'next/dynamic'
import '@tatchi-xyz/sdk/react/styles'

const walletOrigin = process.env.NEXT_PUBLIC_WALLET_ORIGIN || 'https://wallet.example.localhost'
const relayerUrl = process.env.NEXT_PUBLIC_RELAYER_URL || 'https://relay-server.localhost'

const config = {
  nearNetwork: 'testnet',
  nearRpcUrl: 'https://test.rpc.fastnear.com',
  contractId: 'w3a-v1.testnet',
  relayer: { accountId: 'w3a-v1.testnet', url: relayerUrl },
  iframeWallet: { walletOrigin },
}

// Avoid importing the SDK React entry on the server — it touches browser APIs.
const TatchiPasskeyProvider = dynamic(() =>
  import('@tatchi-xyz/sdk/react').then((m) => m.TatchiPasskeyProvider)
, { ssr: false })

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <TatchiPasskeyProvider config={config}>
      <Component {...pageProps} />
    </TatchiPasskeyProvider>
  )
}
