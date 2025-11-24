import React from 'react'
import { useTatchi, LoginPhase, RegistrationPhase, RegistrationStatus } from '@tatchi-xyz/sdk/react'
import dynamic from 'next/dynamic'

const ProfileSettingsButton = dynamic(() =>
  import('@tatchi-xyz/sdk/react/profile').then((m) => m.ProfileSettingsButton)
, { ssr: false })

const PasskeyAuthMenu = dynamic(() =>
  import('@tatchi-xyz/sdk/react/passkey-auth-menu').then((m) => m.PasskeyAuthMenu)
, { ssr: false })

export default function HomeClient() {
  const {
    loginState,
    accountInputState,
    loginPasskey,
    registerPasskey,
    refreshLoginState,
  } = useTatchi()
  const isLoggedIn = !!loginState?.isLoggedIn
  const targetAccountId = accountInputState?.targetAccountId

  const onLogin = React.useCallback(async () => {
    if (!targetAccountId) return
    return loginPasskey(targetAccountId, {
      onEvent: (event: any) => {
        // Minimal console feedback; integrators can add toasts if desired
        if (event.phase === LoginPhase.STEP_4_LOGIN_COMPLETE) {
          console.log(`Logged in as ${event.nearAccountId}`)
        }
        if (event.error) console.error('Login error:', event.error)
      },
    })
  }, [loginPasskey, targetAccountId])

  const onRegister = React.useCallback(async () => {
    if (!targetAccountId) return
    const result = await registerPasskey(targetAccountId, {
      onEvent: (event: any) => {
        if (event.phase === RegistrationPhase.STEP_8_REGISTRATION_COMPLETE && event.status === RegistrationStatus.SUCCESS) {
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
          <ProfileSettingsButton />
        ) : (
          <PasskeyAuthMenu onLogin={onLogin} onRegister={onRegister} />
        )}
      </div>
    </main>
  )
}
