import React, { useCallback, useEffect } from 'react';
import type {
  DeviceLinkingQRData,
  LinkDeviceResult,
  DeviceLinkingSSEEvent
} from '@/index';
import { useQRCamera, QRScanMode } from '../hooks/useQRCamera';
import { useDeviceLinking } from '../hooks/useDeviceLinking';

/**
 * QR Code Scanner Component for Device Linking
 *
 * This component provides a complete QR code scanning interface for device linking.
 * It supports both camera-based scanning and file upload scanning.
 *
 * **Important:** This component must be used inside a PasskeyManager context.
 * Wrap your app with PasskeyProvider or ensure PasskeyManager is available in context.
 *
 * @example
 * ```tsx
 * import { PasskeyProvider } from '@web3authn/passkey/react';
 * import { QRCodeScanner } from '@web3authn/passkey/react';
 *
 * function App() {
 *   return (
 *     <PasskeyProvider configs={passkeyConfigs}>
 *       <QRCodeScanner
 *         onDeviceLinked={(result) => console.log('Device linked:', result)}
 *         onError={(error) => console.error('Error:', error)}
 *       />
 *     </PasskeyProvider>
 *   );
 * }
 * ```
 */
export interface QRCodeScannerProps {
  onQRCodeScanned?: (qrData: DeviceLinkingQRData) => void;
  onDeviceLinked?: (result: LinkDeviceResult) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
  onEvent?: (event: DeviceLinkingSSEEvent) => void;
  fundingAmount?: string;
  isOpen?: boolean;
  cameraId?: string;
  className?: string;
  style?: React.CSSProperties;
  showCamera?: boolean;
}

export const QRCodeScanner: React.FC<QRCodeScannerProps> = ({
  onQRCodeScanned,
  onDeviceLinked,
  onError,
  onClose,
  onEvent,
  fundingAmount = '0.05', // 0.05 NEAR
  isOpen = true,
  cameraId,
  className,
  style,
  showCamera = true,
}) => {

  const { linkDevice } = useDeviceLinking({
    onDeviceLinked,
    onError,
    onClose,
    onEvent,
    fundingAmount
  });

  const qrCamera = useQRCamera({
    onQRDetected: async (qrData: DeviceLinkingQRData) => {
      onQRCodeScanned?.(qrData);
      await linkDevice(qrData, QRScanMode.CAMERA);
    },
    onError,
    isOpen: showCamera ? isOpen : false, // Only active when camera should be shown
    cameraId
  });

  // Camera Cleanup Point 1: User-initiated close
  const handleClose = useCallback(() => {
    qrCamera.stopScanning();
    onClose?.();
  }, [qrCamera.stopScanning, qrCamera.isScanning, qrCamera.videoRef, onClose]);

  // Camera Cleanup Point 2: Component unmount
  useEffect(() => {
    return () => {
      if (qrCamera.isScanning) {
        qrCamera.stopScanning();
      }
    };
  }, []);

  // Camera Cleanup Point 3: Modal state changes (isOpen prop)
  useEffect(() => {
    if (!isOpen && qrCamera.isScanning) {
      qrCamera.stopScanning();
    }
  }, [isOpen, qrCamera.isScanning, qrCamera.stopScanning, qrCamera.videoRef]);

  // Camera Cleanup Point 4: ESC key handling
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClose]);

  // Early return for closed state to prevent unnecessary rendering when modal is closed
  // Note: Camera cleanup is handled by useEffect() above, not by conditional rendering
  if (!isOpen) {
    return null;
  }

  if (qrCamera.error) {
    return (
      <div className="qr-scanner-error-container">
        <div className="qr-scanner-error-message">
          <p>{qrCamera.error}</p>
          <button
            onClick={() => qrCamera.setError(null)}
            className="qr-scanner-error-button"
          >
            Try Again
          </button>
          <button
            onClick={handleClose}
            className="qr-scanner-error-button"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`qr-scanner-modal ${className || ''}`} style={style}>
      {/* Camera Scanner Section */}
      {showCamera
        && (qrCamera.scanMode === QRScanMode.CAMERA || qrCamera.scanMode === QRScanMode.AUTO)
        && (
        <div className="qr-scanner-camera-section">
          {/* Camera Feed */}
          <div className="qr-scanner-camera-container">
            <video
              ref={qrCamera.videoRef}
              className="qr-scanner-video"
              style={{
                transform: qrCamera.isFrontCamera ? 'scaleX(-1)' : 'none'
              }}
              playsInline
              autoPlay
              muted
            />
            <canvas
              ref={qrCamera.canvasRef}
              className="qr-scanner-canvas"
            />

            {/* Scanner Overlay */}
            <div className="qr-scanner-overlay">
              <div className="qr-scanner-box">
                <div className="qr-scanner-corner-top-left" />
                <div className="qr-scanner-corner-top-right" />
                <div className="qr-scanner-corner-bottom-left" />
                <div className="qr-scanner-corner-bottom-right" />
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="qr-scanner-instructions">
            <p>Position the QR code within the frame</p>
            {qrCamera.isScanning && (
              <p className="qr-scanner-sub-instruction qr-scanner-sub-instruction--small">
                Scanning...
              </p>
            )}
          </div>

          {/* Camera Controls */}
          {qrCamera.cameras.length > 1 && (
            <div className="qr-scanner-camera-controls">
              <select
                value={qrCamera.selectedCamera}
                onChange={(e) => qrCamera.handleCameraChange(e.target.value)}
                className="qr-scanner-camera-selector"
              >
                {qrCamera.cameras.map(camera => (
                  <option key={camera.deviceId} value={camera.deviceId}>
                    {camera.label || `Camera ${camera.deviceId.substring(0, 8)}...`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Close Button */}
      <button onClick={handleClose} className="qr-scanner-close">
        ✕
      </button>
    </div>
  );
};

export default QRCodeScanner;