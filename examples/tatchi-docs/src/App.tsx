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
    document.body.setAttribute('data-w3a-theme', theme)
    // Let document-level CSS control background + pattern
    document.body.style.removeProperty('background')
    document.body.style.removeProperty('color')
  }, [theme, tokens])
  React.useEffect(() => {
    const onSetTheme = (e: Event) => {
      const ce = e as CustomEvent<'light' | 'dark'>
      const next = ce?.detail
      if (next === 'light' || next === 'dark') {
        // When logged in, persist to SDK (and wallet host). Logged out: local only.
        if (loginState?.isLoggedIn && passkeyManager?.setUserTheme) {
          passkeyManager.setUserTheme(next)
        } else {
          setTheme(next)
        }
      }
    }
    window.addEventListener('w3a:set-theme', onSetTheme as any)
    return () => { window.removeEventListener('w3a:set-theme', onSetTheme as any) }
  }, [setTheme, loginState?.isLoggedIn, passkeyManager])
  return null
}

const ThemeSyncMount: React.FC = () => { useSyncVitepressTheme(); return null }

// Bridge login state to <body> so VitePress theme can react (navbar, etc.)
const BodyLoginStateBridge: React.FC = () => {
  const { loginState } = usePasskeyContext()
  React.useEffect(() => {
    try {
      const loggedIn = !!loginState?.isLoggedIn
      const nearId = loginState?.nearAccountId || ''
      document.body.setAttribute('data-w3a-logged-in', loggedIn ? 'true' : 'false')
      if (loggedIn && nearId) document.body.setAttribute('data-w3a-near-account-id', nearId)
      else document.body.removeAttribute('data-w3a-near-account-id')
      try { window.dispatchEvent(new CustomEvent('w3a:login-state', { detail: { loggedIn, nearAccountId: nearId } })) } catch {}
    } catch {}
  }, [loginState?.isLoggedIn, loginState?.nearAccountId])
  return null
}

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
      <BodyLoginStateBridge />
      <HomePage />
      <ToasterThemed />
    </TatchiPasskeyProvider>
  )
}

export default App
