import React from 'react'
import { usePasskeyContext } from '@tatchi/sdk/react'
import { toast } from 'sonner'
import { friendlyWebAuthnMessage } from '../utils/strings'
import { LoadingButton } from './LoadingButton';
import { GlassBorder } from './GlassBorder'

export function AccountRecovery() {
  const { accountInputState, passkeyManager, refreshLoginState, loginState, logout } = usePasskeyContext()
  const [busy, setBusy] = React.useState(false)
  const target = accountInputState?.targetAccountId || ''

  const onRecover = async () => {
    if (!target) {
      toast.error('Please enter an account ID above in the login field.')
      return
    }
    setBusy(true)
    // Track whether the user was logged in when starting recovery.
    // If the flow is cancelled or errors, logout to reflect cleared VRF session.
    const startedLoggedIn = !!loginState?.isLoggedIn
    try {
      const result = await passkeyManager.recoverAccountFlow({
        accountId: target,
        options: {
          onEvent: async (event: any) => {
            // No-op here; success handling is below
          },
          onError: async (err: any) => {
            // Recovery flows clear VRF session on error; if we started logged in, logout for consistency
            toast.error(friendlyWebAuthnMessage(err))
            if (startedLoggedIn) {
              try { await logout(); } catch {}
            }
          },
        }
      })
      if (result?.success) {
        toast.success(`Account ${target} recovered!`)
        await refreshLoginState()
      } else {
        toast.error(result?.error || 'Recovery failed')
        if (startedLoggedIn) {
          try { await logout(); } catch {}
        }
      }
    } catch (err) {
      toast.error(friendlyWebAuthnMessage(err))
      if (startedLoggedIn) {
        try { await logout(); } catch {}
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlassBorder style={{ maxWidth: 480, marginTop: '1rem' }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        padding: '2rem'
      }}>
        <h2 style={{ margin: 0 }}>Account Recovery</h2>
        <p style={{ margin: 0, color: 'var(--fe-text-secondary)' }}>
          Recover access to <strong>{target || '...'}</strong> using your existing device credentials.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <LoadingButton
            onClick={onRecover}
            loading={busy}
            loadingText="Recovering..."
            variant="primary"
            size="medium"
            className="greeting-btn"
            // disabled={busy}
            style={{ width: 200 }}
          >
            Start Recovery
          </LoadingButton>
        </div>
        <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: 'var(--fe-text-dim)' }}>
          Tip: the account ID is managed by the login box above; update it there before starting recovery.
        </p>
      </div>
    </GlassBorder>
  )
}

export default AccountRecovery
