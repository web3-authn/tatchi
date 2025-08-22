import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'

import { usePasskeyContext, DeviceLinkingPhase, DeviceLinkingStatus } from '@web3authn/passkey/react'
// Import the improved QRCodeScanner from the SDK
import { QRCodeScanner } from '@web3authn/passkey/react'

import { GlassBorder } from './GlassBorder';
import './LinkDeviceScanQR.css'

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
    // Ensure any in-progress loading toast is cleared/replaced
    toast.dismiss('device-linking');
    toast.error(`Device linking failed: ${error.message}`, { id: 'device-linking' });
    setDeviceLinkingState({ mode: 'idle', isProcessing: false, showScanner: false });
  };

  const onCancelDeviceLinking = () => {
    console.log('LinkDeviceScanQR: onCancelDeviceLinking called - closing scanner');
    setDeviceLinkingState({ mode: 'idle', isProcessing: false, showScanner: false });
    toast.dismiss();
  };

  return (
    <>
      <GlassBorder style={{ marginTop: '1rem' }}>
        <div className="link-device-scan-content-area">
          <h3 className="link-device-scan-header">
            Scan and Link Device
          </h3>
          {deviceLinkingState.mode === 'idle' && (
            <div className="link-device-scan-section">
              <div className="link-device-scan-auth-buttons">
                <button
                  onClick={onLinkDeviceAsDevice1}
                  className="link-device-scan-btn link-device-scan-btn-primary link-device-scan-focus-ring"
                  disabled={!isSecureContext || deviceLinkingState.isProcessing}
                >
                  Scan QR (Device1)
                </button>
              </div>
              <p className="link-device-scan-help">
                Device1: Scan QR code to add Device2 to your account
              </p>
            </div>
          )}
        </div>
      </GlassBorder>
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
        }}
      />
    </>
  );
}