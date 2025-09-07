import { useState, useRef, useEffect } from 'react'
import toast from 'react-hot-toast'

import { usePasskeyContext } from '../context'
import { DeviceLinkingPhase, DeviceLinkingStatus } from '../../core/types/passkeyManager'
import { ThemeScope, useTheme } from './theme'
import './ShowQRCode.css'
import QRCodeIcon from './QRCodeIcon'

function QRCodeModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
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
                onClose(); // Close modal on success
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
    onClose();
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

  // Auto-start QR generation when modal opens
  useEffect(() => {
    if (isOpen && deviceLinkingState.mode === 'idle') {
      onLinkDeviceAsDevice2();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <ThemeScope>
      <div className="qr-modal-backdrop" onClick={onCancelDeviceLinking}>
        <div className="qr-modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="qr-modal-header">
            <h2 className="qr-modal-title">Scan and Link Device</h2>
            <button className="qr-modal-close" onClick={onCancelDeviceLinking}>
              ×
            </button>
          </div>

          <div className="qr-modal-body">
            {deviceLinkingState.mode === 'device2' && (
              <div className="qr-code-section">
                {deviceLinkingState.qrCodeDataURL ? (
                  <div className="qr-code-display">
                    <img
                      src={deviceLinkingState.qrCodeDataURL}
                      alt="Device Linking QR Code"
                      className="qr-code-image"
                    />
                  </div>
                ) : (
                  <div className="qr-loading">
                    <p>Generating QR code...</p>
                  </div>
                )}
                {deviceLinkingState.qrCodeDataURL && (
                  <>
                    <div className="qr-instruction">Scan to backup your other device.</div>
                    <div className="qr-status">Waiting for your other device to scan<span className="animated-ellipsis"></span></div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ThemeScope>
  );
}

interface ShowQRCodeProps {
  className?: string;
  style?: React.CSSProperties;
}

export function ShowQRCode({ className, style }: ShowQRCodeProps = {}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { isDark, tokens } = useTheme();

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  return (
    <>
      <button
        onClick={handleOpenModal}
        className={`link-device-btn ${className || ''}`.trim()}
        style={{
          ...style,
          background: tokens.colors.colorSurface,
          color: tokens.colors.textPrimary,
          border: `1px solid ${tokens.colors.borderPrimary}`,
          boxShadow: tokens.shadows.sm,
          borderRadius: '2rem',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = tokens.colors.colorSurface2;
          e.currentTarget.style.boxShadow = tokens.shadows.md;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = tokens.colors.colorSurface;
          e.currentTarget.style.boxShadow = tokens.shadows.sm;
        }}
      >
        <QRCodeIcon width={18} height={18} strokeWidth={2} />
        Link Device with QR
      </button>

      <QRCodeModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </>
  );
}
