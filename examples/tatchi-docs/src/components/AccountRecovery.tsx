import React from 'react'
import { usePasskeyContext, AuthMenuMode } from '@tatchi-xyz/sdk/react'
import { toast } from 'sonner'
import { friendlyWebAuthnMessage } from '../utils/strings'
import { LoadingButton } from './LoadingButton';
import { GlassBorder } from './GlassBorder'
import { BrowserWithQR } from './icons/BrowserWithQR'
import { IPhoneQRScanner } from './icons/IPhoneQRScanner'
import { useCarousel } from './Carousel2/CarouselProvider'
import { useAuthMenuControl } from '../contexts/AuthMenuControl'

export function AccountRecovery() {
  const { accountInputState, passkeyManager, refreshLoginState, loginState, logout } = usePasskeyContext()
  const [busy, setBusy] = React.useState(false)
  const target = accountInputState?.targetAccountId || ''
  const carousel = useCarousel()
  const authMenuControl = useAuthMenuControl()

  const onRecover = async () => {
    setBusy(true)
    try {
      // Ensure we are logged out, then navigate to the Login slide
      try { await logout(); } catch {}
      carousel.goTo(0)
      // Switch the PasskeyAuthMenu to the Recover segment on mount
      authMenuControl.setAndRemount(AuthMenuMode.Recover)
      toast.success('Switched to account recovery')
    } catch (err) {
      // Best-effort UX; show friendly error if anything goes wrong
      toast.error(friendlyWebAuthnMessage(err))
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
        padding: '1rem'
      }}>
        <div className="demo-page-header">
        <h2 className="demo-title">Account Recovery</h2>
        </div>
        <div className="action-text">
          Recover accounts on any device where your passkeys are located
          <br/>
          • Passkeys can be synced on iCloud Keychain or Google Password Manager
          <br/>
          • Synced passkeys across devices can recover the same wallet
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <LoadingButton
            onClick={onRecover}
            loading={busy}
            loadingText="Recovering..."
            variant="primary"
            size="medium"
          >
            Start Account Recovery
          </LoadingButton>
        </div>

        <div style={{
          marginTop: '2rem',
          paddingTop: '2rem',
          borderTop: '1px solid var(--fe-border)'
        }}>
          <h2 className="demo-title">Device Linking</h2>
          <div className="action-text">
            You can also use QR codes to scan and link a new device to your account. This serves as a
            password-less backup of your wallet.
          </div>
          <div
            aria-label="Illustration: iPhone scanning browser QR code"
            style={{
              marginTop: '2rem',
              marginBottom: '2rem',
              width: '100%',
              height: 230,
              position: 'relative',
              borderRadius: 12,
              overflow: 'visible',
            }}
          >
            <BrowserWithQR width="100%" height="100%" />
            <IPhoneQRScanner
              width={110}
              style={{
                position: 'absolute',
                right: 16,
                bottom: -8,
                transform: 'rotate(-6deg)',
                filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.28))',
              }}
            />
          </div>
        </div>
      </div>
    </GlassBorder>
  )
}

export default AccountRecovery
