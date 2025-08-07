import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'

import { usePasskeyContext, DeviceLinkingPhase, DeviceLinkingStatus } from '@web3authn/passkey/react'
// Import the improved QRCodeScanner from the SDK
import { QRCodeScanner } from '@web3authn/passkey/react'

export function LinkDeviceScanQR() {
  const {
    loginState: { isLoggedIn }
  } = usePasskeyContext();

  const [isSecureContext] = useState(() => window.isSecureContext);
  const [deviceLinkingState, setDeviceLinkingState] = useState<{
    mode: 'idle' | 'device1';
    isProcessing: boolean;
    showScanner: boolean;
  }>({ mode: 'idle', isProcessing: false, showScanner: false });

  // Device linking handlers
  const onLinkDeviceAsDevice1 = async () => {
    if (!isLoggedIn) {
      toast.error('Please login first to scan and link devices');
      return;
    }
    setDeviceLinkingState({ mode: 'device1', isProcessing: false, showScanner: true });
  };

  const handleDeviceLinked = (result: any) => {
    toast.success(`Device linked successfully to ${result.linkedToAccount}!`);
    setDeviceLinkingState({ mode: 'idle', isProcessing: false, showScanner: false });
  };

  const handleError = (error: Error) => {
    console.error('Device linking error:', error);
    toast.error(`Device linking failed: ${error.message}`);
    setDeviceLinkingState({ mode: 'idle', isProcessing: false, showScanner: false });
  };

  const onCancelDeviceLinking = () => {
    console.log('LinkDeviceScanQR: onCancelDeviceLinking called - closing scanner');
    setDeviceLinkingState({ mode: 'idle', isProcessing: false, showScanner: false });
    toast.dismiss();
  };

  return (
    <>
      <div className="link-device-container-root">
        <div className="passkey-container">
          {deviceLinkingState.mode === 'idle' && (
            <div className="device-linking-section">
              <div className="auth-buttons">
                <button
                  onClick={onLinkDeviceAsDevice1}
                  className="action-button"
                  disabled={!isSecureContext || deviceLinkingState.isProcessing}
                >
                  Scan QR (Device1)
                </button>
              </div>
              <p className="device-linking-help">
                Device1: Scan a QR code to add Device2's key to your account<br/>
                Device2: Generate a QR code for Device1 to scan
              </p>
            </div>
          )}
        </div>
      </div>

      <QRCodeScanner
        isOpen={deviceLinkingState.showScanner}
        fundingAmount="0.05"
        onDeviceLinked={handleDeviceLinked}
        onError={handleError}
        onClose={onCancelDeviceLinking}
        onEvent={(event) => {
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
                toast.error(event.message || 'Registration failed', { id: 'device-linking' });
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
              }
          }
        }}
      />
    </>
  );
}