import React from 'react';
import { toast } from 'sonner';
import {
  useTatchi,
  DeviceLinkingPhase,
  DeviceLinkingStatus,
  useTheme,
  DeviceLinkingSSEEvent,
} from '@tatchi-xyz/sdk/react';
import { AccountMenuButton } from '@tatchi-xyz/sdk/react/profile';
import { useProfileMenuControl } from '../contexts/ProfileMenuControl';

export interface TatchiProfileSettingsButtonProps {
  className?: string;
  style?: React.CSSProperties;
}

export const TatchiProfileSettingsButton: React.FC<TatchiProfileSettingsButtonProps> = ({
  className,
  style
}) => {

  const { loginState, tatchi } = useTatchi();
  const { theme, setTheme } = useTheme();
  const [isMobile, setIsMobile] = React.useState<boolean>(false);
  const {
    isMenuOpen,
    highlightedMenuItem,
    setMenuOpen,
    clearHighlight,
  } = useProfileMenuControl();

  const handleDeviceLinkingEvents = (event: DeviceLinkingSSEEvent) => {
    switch (event.phase) {
      case DeviceLinkingPhase.STEP_2_SCANNING:
        toast.loading('Scanning QR code...', { id: 'device-linking' });
        break;
      case DeviceLinkingPhase.STEP_3_AUTHORIZATION:
        if (event.status === DeviceLinkingStatus.PROGRESS) {
          toast.loading('Authorizing...', { id: 'device-linking' });
        } else if (event.status === DeviceLinkingStatus.SUCCESS) {
          toast.success(event.message || 'Authorization completed successfully!', { id: 'device-linking' });
        }
        break;
      case DeviceLinkingPhase.STEP_6_REGISTRATION:
        if (event.status === DeviceLinkingStatus.PROGRESS) {
          toast.loading('Registering device...', { id: 'device-linking' });
        } else if (event.status === DeviceLinkingStatus.SUCCESS) {
          toast.success(event.message || 'Device linked successfully!', { id: 'device-linking' });
        }
        break;
      case DeviceLinkingPhase.REGISTRATION_ERROR:
        if (event.status === DeviceLinkingStatus.ERROR) {
          toast.dismiss('device-linking');
          toast.error(event.message || 'Registration failed', { id: 'device-linking' });
        }
        break;
      case DeviceLinkingPhase.LOGIN_ERROR:
        if (event.status === DeviceLinkingStatus.ERROR) {
          toast.dismiss('device-linking');
          toast.error(event.message || 'Login failed', { id: 'device-linking' });
        }
        break;
      case DeviceLinkingPhase.DEVICE_LINKING_ERROR:
        if (event.status === DeviceLinkingStatus.ERROR) {
          toast.dismiss('device-linking');
          toast.error(event.message || 'Device linking failed', { id: 'device-linking' });
        }
        break;
      case DeviceLinkingPhase.STEP_7_LINKING_COMPLETE:
        if (event.status === DeviceLinkingStatus.SUCCESS) {
          toast.success(event.message || 'Device linking completed successfully!', { id: 'device-linking' });
        }
        break;
      default:
        if (event.status === DeviceLinkingStatus.PROGRESS) {
          toast.loading(event.message || 'Processing...', { id: 'device-linking' });
        } else if (event.status === DeviceLinkingStatus.ERROR) {
          toast.dismiss('device-linking');
          toast.error(event.message || 'Operation failed', { id: 'device-linking' });
        }
    }
  }

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    if ('addEventListener' in mq) mq.addEventListener('change', onChange);
    return () => { if ('removeEventListener' in mq) mq.removeEventListener('change', onChange); };
  }, []);

  // Expose login state to VitePress DOM for conditional styling + event bridge
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    try {
      const loggedIn = !!loginState.isLoggedIn;
      const nearId = loginState.nearAccountId || '';
      document.body.setAttribute('data-w3a-logged-in', loggedIn ? 'true' : 'false');
      if (loggedIn && nearId) document.body.setAttribute('data-w3a-near-account-id', nearId);
      else document.body.removeAttribute('data-w3a-near-account-id');
      try { window.dispatchEvent(new CustomEvent('w3a:login-state', { detail: { loggedIn, nearAccountId: nearId } })) } catch {}
    } catch {}
  }, [loginState.isLoggedIn, loginState.nearAccountId]);

  React.useEffect(() => {
    if (!loginState.isLoggedIn) {
      clearHighlight();
      setMenuOpen(false);
    }
  }, [loginState.isLoggedIn, clearHighlight, setMenuOpen]);

  if (!loginState.isLoggedIn) {
    return null;
  } else {
    return (
      <div className="tatchi-profile-button-container" style={style}>
        <AccountMenuButton
          nearAccountId={loginState.nearAccountId!}
          nearExplorerBaseUrl="https://testnet.nearblocks.io"
          hideUsername={isMobile}
          className={className}
          style={{
            // border: 'none',
            // background: 'none',
          }}
          deviceLinkingScannerParams={{
            fundingAmount: '0.05',
            onDeviceLinked: (result: any) => {
              toast.success(`Device linked successfully to ${result.linkedToAccount}!`);
            },
            onError: (error: Error) => {
              console.error('Device linking error:', error);
              toast.dismiss('device-linking');
              toast.error(`Device linking failed: ${error.message}`, { id: 'device-linking' });
            },
            onClose: () => { toast.dismiss(); },
            onEvent: (event) => handleDeviceLinkingEvents(event),
          }}
          isMenuOpen={isMenuOpen}
          onMenuOpenChange={setMenuOpen}
          highlightedMenuItem={highlightedMenuItem}
        />
      </div>
    );
  }
};

export default TatchiProfileSettingsButton;
