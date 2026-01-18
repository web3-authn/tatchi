import React from 'react'
import { useTatchi, LoginPhase, RegistrationPhase, RegistrationStatus } from '@tatchi-xyz/sdk/react'
import dynamic from 'next/dynamic'
import { PasskeyAuthMenuSkeleton } from '@tatchi-xyz/sdk/react/passkey-auth-menu'
import { markOnce, measureOnce } from '../lib/perf'

const AccountMenuButton = dynamic(async () => {
  markOnce('w3a:sdk:profile:import:start')
  const mod = await import('@tatchi-xyz/sdk/react/profile')
  markOnce('w3a:sdk:profile:import:end')
  measureOnce('w3a:sdk:profile:import', 'w3a:sdk:profile:import:start', 'w3a:sdk:profile:import:end')
  return mod.AccountMenuButton
}, { ssr: false })

function MenuLoadingSkeleton() {
  React.useEffect(() => {
    markOnce('w3a:skeleton:passkey-menu:mounted')
    measureOnce('w3a:tt-skeleton:passkey-menu', 'w3a:boot', 'w3a:skeleton:passkey-menu:mounted')
  }, [])
  return <PasskeyAuthMenuSkeleton />
}

const PasskeyAuthMenu = dynamic(async () => {
  markOnce('w3a:sdk:passkey-auth-menu:import:start')
  const mod = await import('@tatchi-xyz/sdk/react/passkey-auth-menu')
  markOnce('w3a:sdk:passkey-auth-menu:import:end')
  measureOnce(
    'w3a:sdk:passkey-auth-menu:import',
    'w3a:sdk:passkey-auth-menu:import:start',
    'w3a:sdk:passkey-auth-menu:import:end'
  )
  return mod.PasskeyAuthMenu
}, { ssr: false, loading: () => <MenuLoadingSkeleton /> })

export default function HomeClient() {
  const {
    loginState,
    accountInputState,
    loginAndCreateSession,
    registerPasskey,
    refreshLoginState,
  } = useTatchi()
  const isLoggedIn = !!loginState?.isLoggedIn
  const targetAccountId = accountInputState?.targetAccountId

  const onLogin = React.useCallback(async () => {
    if (!targetAccountId) return
    return loginAndCreateSession(targetAccountId, {
      onEvent: (event: any) => {
        // Minimal console feedback; integrators can add toasts if desired
        if (event.phase === LoginPhase.STEP_4_LOGIN_COMPLETE) {
          console.log(`Logged in as ${event.nearAccountId}`)
        }
        if (event.error) console.error('Login error:', event.error)
      },
    })
  }, [loginAndCreateSession, targetAccountId])

  const onRegister = React.useCallback(async () => {
    if (!targetAccountId) return
    const result = await registerPasskey(targetAccountId, {
      onEvent: (event: any) => {
        if (event.phase === RegistrationPhase.STEP_9_REGISTRATION_COMPLETE && event.status === RegistrationStatus.SUCCESS) {
          console.log('Registration completed successfully')
        }
        if (event.error) console.error('Registration error:', event.error)
      },
    })
    if (result?.success && result?.nearAccountId) {
      await refreshLoginState(result.nearAccountId)
    }
    return result
  }, [registerPasskey, refreshLoginState, targetAccountId])

  return (
    <main style={{
      display: 'grid',
      placeItems: 'center',
      padding: 24,
      fontFamily: 'system-ui, Arial'
    }}>
      <h1>Next.js Example</h1>
      <p>Wallet iframe runs on the wallet origin; this app delegates WebAuthn to the wallet.</p>
      <div style={{ marginTop: 16 }}>
        {isLoggedIn ? (
          loginState?.nearAccountId ? (
            <AccountMenuButton nearAccountId={loginState.nearAccountId} />
          ) : null
        ) : (
          <PasskeyAuthMenu onLogin={onLogin} onRegister={onRegister} />
        )}
      </div>
    </main>
  )
}
