import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import {
  usePasskeyContext,
  ProfileSettingsButton,
  DeviceLinkingPhase,
  DeviceLinkingStatus,
  Theme,
  useTheme,
} from '@tatchi-xyz/sdk/react';
import { DebugBanner } from './DebugBanner';

export const Navbar: React.FC = () => {
  const { loginState, passkeyManager } = usePasskeyContext();
  const navigate = useNavigate();
  const { setTheme } = useTheme();

  const [isMobile, setIsMobile] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    // Set initial state
    setIsMobile(mq.matches);
    if ('addEventListener' in mq) mq.addEventListener('change', onChange);

    return () => {
      if ('removeEventListener' in mq) mq.removeEventListener('change', onChange);
    };
  }, []);

  // Keep Theme synchronized with user preference (per-component)
  React.useEffect(() => {
    const up = passkeyManager?.userPreferences;
    if (!up) return;

    try {
      const t = up.getUserTheme?.();
      if (t === 'light' || t === 'dark') setTheme(t);
    } catch {}

    let unsub: (() => void) | undefined;
    try { unsub = up.onThemeChange?.((t: 'light' | 'dark') => setTheme(t)); } catch {}
    return () => { try { unsub?.(); } catch {} };
  }, [passkeyManager, setTheme]);

  return (
    <nav className="navbar-container">
      <div className="navbar-title">
        <Link to="/">
          Tatchi.xyz
        </Link>
      </div>

      <div className="navbar-links">
        <Link to="/">
          Home
        </Link>
        <Link to="/multitx">
          Demos
        </Link>
      </div>

      <DebugBanner />

      {
        loginState.isLoggedIn &&
        <div style={{ position: 'fixed', top: '0.5rem', right: '0.5rem' }}>
          <ProfileSettingsButton
            nearAccountId={loginState.nearAccountId!}
            nearExplorerBaseUrl="https://testnet.nearblocks.io"
            hideUsername={isMobile}
            onLogout={() => navigate('/')}
            deviceLinkingScannerParams={{
              fundingAmount: "0.05",
              onDeviceLinked: (result: any) => {
                toast.success(`Device linked successfully to ${result.linkedToAccount}!`);
              },
              onError: (error: Error) => {
                console.error('Device linking error:', error);
                // Ensure any in-progress loading toast is cleared/replaced
                toast.dismiss('device-linking');
                toast.error(`Device linking failed: ${error.message}`, { id: 'device-linking' });
              },
              onClose: () => {
                toast.dismiss();
              },
              onEvent: (event) => {
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
              },
            }}
          />
        </div>
      }
      </nav>
  );
};
