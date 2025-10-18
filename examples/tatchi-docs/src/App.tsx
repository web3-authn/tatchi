import React from 'react'
import { TatchiPasskeyProvider, useTheme } from '@tatchi/sdk/react'
import '@tatchi/sdk/react/styles'

import NavbarStatic from './components/NavbarStatic'
import { HomePage } from './pages/HomePage'
import { ToasterThemed } from './components/ToasterThemed'
import { useSyncVitepressTheme } from './hooks/useSyncVitepressTheme'


const BodyThemeSync: React.FC = () => {
  const { theme, tokens } = useTheme()
  React.useEffect(() => {
    try {
      document.body.setAttribute('data-w3a-theme', theme)
      // Let document-level CSS control background + pattern
      try { document.body.style.removeProperty('background') } catch {}
      try { document.body.style.removeProperty('color') } catch {}
    } catch {}
  }, [theme, tokens])
  return null
}

const ThemeSyncMount: React.FC = () => { useSyncVitepressTheme(); return null }

export const App: React.FC = () => {
  const env = import.meta.env
  return (
    <TatchiPasskeyProvider
      config={{
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
      <BodyThemeSync />
      <ThemeSyncMount />
      <NavbarStatic />
      <HomePage />
      <ToasterThemed />
    </TatchiPasskeyProvider>
  )
}

export default App
