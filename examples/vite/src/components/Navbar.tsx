import React from 'react';
import toast from 'react-hot-toast';

import {
  useTatchi,
  DeviceLinkingPhase,
  DeviceLinkingStatus,
} from '@tatchi-xyz/sdk/react';
import { AccountMenuButton } from '@tatchi-xyz/sdk/react/profile';
import { DebugBanner } from './DebugBanner';

export const Navbar: React.FC = () => {

  const { loginState } = useTatchi();

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

  return (
    <nav className="navbar-container">
      <div className="navbar-title">
        Tatchi.xyz
      </div>
      <DebugBanner />
      {
        loginState.isLoggedIn &&
        <div style={{ position: 'fixed', top: '0.5rem', right: '0.5rem' }}>
          <AccountMenuButton
            nearAccountId={loginState.nearAccountId!}
            nearExplorerBaseUrl="https://testnet.nearblocks.io"
            hideUsername={isMobile}
            onLogout={() => console.log('logged out')}
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
                // only handle Device1 events here
                switch (event.phase) {
                  case DeviceLinkingPhase.STEP_2_SCANNING:
                    toast.loading('Scanning QR code...', { id: 'device-linking' });
                    break;
                  case DeviceLinkingPhase.STEP_3_AUTHORIZATION:
                    if (event.status === DeviceLinkingStatus.PROGRESS) {
                      toast.loading(event.message, { id: 'device-linking' });
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
