import React from 'react';
import { toast } from 'sonner';

import {
  usePasskeyContext,
  ProfileSettingsButton,
  DeviceLinkingPhase,
  DeviceLinkingStatus,
  Theme,
  useTheme,
} from '@tatchi/sdk/react';
import { DebugBanner } from './DebugBanner';

export const NavbarStatic: React.FC = () => {
  const { loginState, passkeyManager } = usePasskeyContext();
  const { theme, setTheme } = useTheme();

  const [isMobile, setIsMobile] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    if ('addEventListener' in mq) mq.addEventListener('change', onChange);
    return () => { if ('removeEventListener' in mq) mq.removeEventListener('change', onChange); };
  }, []);

  // Theme hydration and syncing now handled inside Theme provider to avoid loops

  // Mirror SDK theme to VitePress appearance (toggle html.dark + persist)
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    try {
      const root = document.documentElement;
      if (theme === 'dark') root.classList.add('dark');
      else root.classList.remove('dark');
      try { localStorage.setItem('vitepress-theme-appearance', theme); } catch {}
    } catch {}
  }, [theme]);

  // Expose login state to VitePress DOM for conditional styling
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    try {
      document.body.setAttribute('data-w3a-logged-in', loginState.isLoggedIn ? 'true' : 'false');
    } catch {}
  }, [loginState.isLoggedIn]);

  return (
    <Theme mode="scope-only">
      {loginState.isLoggedIn && (
        <div style={{
          position: 'fixed',
          zIndex: 100,
          top: '0.5rem',
          right: '0.5rem'
        }}>
          <ProfileSettingsButton
            nearAccountId={loginState.nearAccountId!}
            nearExplorerBaseUrl="https://testnet.nearblocks.io"
            hideUsername={isMobile}
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
      )}
    </Theme>
  );
};

export default NavbarStatic;
