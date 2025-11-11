import React from 'react'
import { useTatchi } from '@tatchi-xyz/sdk/react'

// Reflects auth state to <body> dataset and emits a window event for external consumers.
export function useBodyLoginStateBridge() {
  const { loginState } = useTatchi()
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
}
