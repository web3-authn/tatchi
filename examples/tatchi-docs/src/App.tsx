import React from 'react'
import { TatchiPasskeyProvider } from '@tatchi-xyz/sdk/react'

import { HomePage } from './pages/HomePage'
import { ToasterThemed } from './components/ToasterThemed'
import { useSyncVitepressTheme } from './hooks/useSyncVitepressTheme'
import { useThemeBridge } from './hooks/useThemeBridge'
import { useBodyLoginStateBridge } from './hooks/useBodyLoginStateBridge'


export const App: React.FC = () => {
  const env = import.meta.env

  const VitepressStateSync: React.FC = () => {
    useSyncVitepressTheme();
    useThemeBridge();
    useBodyLoginStateBridge();
    return null
  }

  return (
    <TatchiPasskeyProvider
      config={{
        // Prefer reliable NEAR RPCs with fallback. You can override via VITE_NEAR_RPC_URL.
        nearRpcUrl: env.VITE_NEAR_RPC_URL || 'https://test.rpc.fastnear.com',
        relayer: {
          url: env.VITE_RELAYER_URL!,
          accountId: env.VITE_RELAYER_ACCOUNT_ID!
        },
        vrfWorkerConfigs: {
          shamir3pass: {
            relayServerUrl: env.VITE_RELAYER_URL!
          }
        },
        iframeWallet: {
          walletOrigin: env.VITE_WALLET_ORIGIN,
          walletServicePath: env.VITE_WALLET_SERVICE_PATH,
          rpIdOverride: env.VITE_RP_ID_BASE,
          sdkBasePath: env.VITE_SDK_BASE_PATH,
        },
      }}
    >
      <HomePage />
      <VitepressStateSync />
      <ToasterThemed />
    </TatchiPasskeyProvider>
  )
}

export default App
