import React from 'react'
import { TatchiPasskeyProvider, useTheme, usePasskeyContext } from '@tatchi/sdk/react'
import '@tatchi/sdk/react/styles'

import { HomePage } from './pages/HomePage'
import { ToasterThemed } from './components/ToasterThemed'
import { useSyncVitepressTheme } from './hooks/useSyncVitepressTheme'


const BodyThemeSync: React.FC = () => {
  const { theme, tokens, setTheme } = useTheme()
  const { loginState, passkeyManager } = usePasskeyContext()
  React.useEffect(() => {
    try {
      document.body.setAttribute('data-w3a-theme', theme)
      // Let document-level CSS control background + pattern
      try { document.body.style.removeProperty('background') } catch {}
      try { document.body.style.removeProperty('color') } catch {}
    } catch {}
  }, [theme, tokens])
  React.useEffect(() => {
    const onSetTheme = (e: Event) => {
      try {
        const ce = e as CustomEvent<'light' | 'dark'>
        const next = ce?.detail
        if (next === 'light' || next === 'dark') {
          // When logged in, persist to SDK (and wallet host). Logged out: local only.
          if (loginState?.isLoggedIn && passkeyManager) {
            try { passkeyManager.setUserTheme(next) } catch { setTheme(next) }
          } else {
            setTheme(next)
          }
        }
      } catch {}
    }
    try { window.addEventListener('w3a:set-theme', onSetTheme as any) } catch {}
    return () => { try { window.removeEventListener('w3a:set-theme', onSetTheme as any) } catch {} }
  }, [setTheme, loginState?.isLoggedIn, passkeyManager])
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
      <HomePage />
      <ToasterThemed />
    </TatchiPasskeyProvider>
  )
}

export default App
