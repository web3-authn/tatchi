import { useState, useRef, useEffect } from 'react'
import toast from 'react-hot-toast'

import { usePasskeyContext, DeviceLinkingPhase, DeviceLinkingStatus } from '@web3authn/passkey/react'

export function LinkDeviceShowQR() {
  const {
    loginState,
    startDeviceLinkingFlow,
  } = usePasskeyContext();

  const [isSecureContext] = useState(() => window.isSecureContext);
  const [deviceLinkingState, setDeviceLinkingState] = useState<{
    mode: 'idle' | 'device1' | 'device2';
    qrCodeDataURL?: string;
    isProcessing: boolean;
  }>({ mode: 'idle', isProcessing: false });

  // Store the flow instance to allow proper cleanup
  const flowRef = useRef<any>(null);

  const onLinkDeviceAsDevice2 = async () => {
    // Immediate synchronous check to prevent multiple simultaneous calls
    if (deviceLinkingState.isProcessing || flowRef.current) {
      console.warn('Device linking already in progress, ignoring duplicate request');
      return;
    }

    setDeviceLinkingState({ mode: 'device2', isProcessing: true });

    try {
      toast.loading('Generating QR code...', { id: 'device-link' });

      console.log('Creating new device linking flow...');
      const device2Flow = startDeviceLinkingFlow({
        onEvent: (event) => {
          console.log('Device linking event:', event);
          switch (event.phase) {
            case DeviceLinkingPhase.STEP_1_QR_CODE_GENERATED:
              toast.success('QR code generated! Show this to Device1 to scan.', { id: 'device-link' });
              break;
            // Steps 2-4 are handled on Device1 (Scans QR code)
            case DeviceLinkingPhase.STEP_5_ADDKEY_DETECTED:
              toast.loading('Device linking detected, completing registration...', { id: 'device-link' });
              break;
            case DeviceLinkingPhase.STEP_6_REGISTRATION:
              if (event.status === DeviceLinkingStatus.SUCCESS) {
                toast.success('New device passkey registered onchain!', { id: 'device-link' });
              }
              break;
            case DeviceLinkingPhase.STEP_7_LINKING_COMPLETE:
              if (event.status === DeviceLinkingStatus.SUCCESS) {
                toast.success(event.message || 'Device linking completed!', { id: 'device-link' });
                setDeviceLinkingState({ mode: 'idle', isProcessing: false });
                flowRef.current = null; // Clear ref when completed
              }
              break;
            case DeviceLinkingPhase.REGISTRATION_ERROR:
                toast.error(event.message, { id: 'device-link' });
                setDeviceLinkingState({ mode: 'idle', isProcessing: false });
                flowRef.current = null; // Clear ref when completed
              break;
          }
        },
        onError: (error) => {
          console.error('Device linking error:', error);
          toast.error(`Device linking failed: ${error.message}`, { id: 'device-link' });
          setDeviceLinkingState({ mode: 'idle', isProcessing: false });
          flowRef.current = null; // Clear ref on error
        }
      });

      // Store flow for cleanup before calling generateQR
      flowRef.current = device2Flow;

      const { qrCodeDataURL } = await device2Flow.generateQR();
      setDeviceLinkingState(prev => ({ ...prev, qrCodeDataURL }));

    } catch (error: any) {
      console.error('QR generation error:', error);
      toast.error(`QR generation failed: ${error.message}`, { id: 'device-link' });
      setDeviceLinkingState({ mode: 'idle', isProcessing: false });
      flowRef.current = null; // Clear ref on error
    }
  };

  const onCancelDeviceLinking = () => {
    // Cancel the active flow if it exists
    if (flowRef.current) {
      flowRef.current.cancel();
      flowRef.current = null;
    }

    setDeviceLinkingState({ mode: 'idle', isProcessing: false });
    toast.dismiss('device-link');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (flowRef.current) {
        flowRef.current.cancel();
        flowRef.current = null;
      }
    };
  }, []);

  return (
    <div className="link-device-root">
      {deviceLinkingState.mode === 'idle' && (
        <div className="device-linking-section">
          <div className="auth-buttons">
            <button
              onClick={onLinkDeviceAsDevice2}
              className="action-button"
              disabled={!isSecureContext || deviceLinkingState.isProcessing}
            >
              Generate QR (Device2)
            </button>
          </div>
          <p className="device-linking-help">
            Device1: Scan a QR code to add Device2's key to your account<br/>
            Device2: Generate a QR code for Device1 to scan
          </p>
        </div>
      )}


      {deviceLinkingState.mode === 'device2' && (
        <div className="device-linking-active">
          <h4>Device2: QR Code Mode</h4>
          {deviceLinkingState.qrCodeDataURL ? (
            <div className="qr-code-display">
              <p>Show this QR code to Device1:</p>
              <img
                src={deviceLinkingState.qrCodeDataURL}
                alt="Device Linking QR Code"
                style={{ maxWidth: '200px', height: 'auto', border: '1px solid #ccc' }}
              />
              <p>Waiting for Device1 to scan...</p>
            </div>
          ) : (
            <p>Generating QR code...</p>
          )}
          <button onClick={onCancelDeviceLinking} className="action-button">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}