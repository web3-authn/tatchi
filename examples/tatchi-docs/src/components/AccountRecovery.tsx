import React from 'react'
import { usePasskeyContext } from '@tatchi/sdk/react'
import { toast } from 'sonner'
import { friendlyWebAuthnMessage } from '../utils/strings'
import { LoadingButton } from './LoadingButton';
import { GlassBorder } from './GlassBorder'

export function AccountRecovery() {
  const { accountInputState, passkeyManager, refreshLoginState } = usePasskeyContext()
  const [busy, setBusy] = React.useState(false)
  const target = accountInputState?.targetAccountId || ''

  const onRecover = async () => {
    if (!target) {
      toast.error('Please enter an account ID above in the login field.')
      return
    }
    setBusy(true)
    try {
      const result = await passkeyManager.recoverAccountFlow({
        accountId: target,
        options: {
          onEvent: async () => {},
          onError: (err: any) => { toast.error(friendlyWebAuthnMessage(err)) },
        }
      })
      if (result?.success) {
        toast.success(`Account ${target} recovered!`)
        await refreshLoginState()
      } else {
        toast.error(result?.error || 'Recovery failed')
      }
    } catch (err) {
      toast.error(friendlyWebAuthnMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlassBorder style={{ maxWidth: 480 }}>
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

