import React from 'react'
import { useTatchi, AuthMenuMode, PROFILE_MENU_ITEM_IDS } from '@tatchi-xyz/sdk/react'
import { toast } from 'sonner'
import { friendlyWebAuthnMessage } from '../utils/strings'
import { LoadingButton } from './LoadingButton';
import { GlassBorder } from './GlassBorder'
import { BrowserWithQR } from './icons/BrowserWithQR'
import { IPhoneQRScanner } from './icons/IPhoneQRScanner'
import { useCarousel } from './Carousel2/CarouselProvider'
import { useAuthMenuControl } from '../contexts/AuthMenuControl'
import { useProfileMenuControl } from '../contexts/ProfileMenuControl'
import './AccountRecovery.css'

export function AccountRecovery() {
  const { accountInputState, tatchi, refreshLoginState, loginState, logout } = useTatchi()
  const [busy, setBusy] = React.useState(false)
  const target = accountInputState?.targetAccountId || ''
  const carousel = useCarousel()
  const authMenuControl = useAuthMenuControl()
  const { requestHighlight: requestProfileHighlight } = useProfileMenuControl()

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

  const onLinkDevice = React.useCallback(() => {
    if (!loginState.isLoggedIn) {
      toast.error('Log in to link another device')
      return
    }
    requestProfileHighlight({
      id: PROFILE_MENU_ITEM_IDS.SCAN_LINK_DEVICE,
      focus: true,
    })
  }, [loginState.isLoggedIn, requestProfileHighlight])

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
            style={{ width: 200 }}
          >
            Start Recovery
          </LoadingButton>
        </div>

        <div style={{
          marginTop: '2rem',
          paddingTop: '2rem',
          borderTop: '1px solid var(--fe-border)'
        }}>
          <h2 className="demo-title">Device Linking</h2>
          <div className="action-text">
            Use QR codes to scan and link a new device to your account.
            Backup your wallet on multiple devices without remembering keys, or passphrases.
          </div>
          <div className="account-recovery-link-device-button">
            <LoadingButton
              onClick={onLinkDevice}
              variant="secondary"
              size="medium"
              style={{ width: 200 }}
            >
              Link Device
            </LoadingButton>
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
