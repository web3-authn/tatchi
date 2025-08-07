import React, { useCallback } from 'react';
import type {
  DeviceLinkingQRData,
  LinkDeviceResult,
  DeviceLinkingSSEEvent
} from '@/index';
import { useQRCamera, QRScanMode } from '../hooks/useQRCamera';
import { useDeviceLinking } from '../hooks/useDeviceLinking';
import { useQRFileUpload } from '../hooks/useQRFileUpload';

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
  showFileUpload?: boolean;
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
  showFileUpload = false,
}) => {

  // Initialize device linking hook
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

  const fileUpload = useQRFileUpload({
    onQRDetected: async (qrData: DeviceLinkingQRData) => {
      onQRCodeScanned?.(qrData);
      await linkDevice(qrData, QRScanMode.FILE);
    },
    onError
  });

  // Handle close with camera cleanup
  const handleClose = useCallback(() => {
    qrCamera.stopScanning();
    onClose?.();
  }, [qrCamera.stopScanning, onClose]);

  // Enhanced file upload that stops camera first
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    // Stop camera scanning first to avoid conflicts
    if (qrCamera.isScanning) {
      qrCamera.stopScanning();
    }

    // Reset any camera errors
    qrCamera.setError(null);

    // Handle the file upload
    await fileUpload.handleFileUpload(event);
  }, [qrCamera, fileUpload.handleFileUpload]);

  // Don't render if not open
  if (!isOpen) return null;

  // Determine processing state from camera or file upload
  const isProcessing = qrCamera.isProcessing || fileUpload.isProcessing;

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
            <p className="qr-scanner-sub-instruction">
              {isProcessing
                ? 'Processing QR code...'
                : 'The camera will automatically scan when a QR code is detected'
              }
            </p>
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

      {/* File Upload Section */}
      {!showCamera && showFileUpload && (
        <div className="qr-scanner-file-section">
          <div className="qr-scanner-instructions">
            <p>Upload QR Code Image</p>
            <p className="qr-scanner-sub-instruction">
              Click the upload button below to select a QR code image from your device
            </p>
          </div>
        </div>
      )}

      {/* Mode Controls */}
      {(showCamera || showFileUpload) && (
        <div className="qr-scanner-mode-controls">
          {showCamera && (
            <button
              onClick={() => qrCamera.setScanMode(QRScanMode.CAMERA)}
              className={
                (qrCamera.scanMode === QRScanMode.CAMERA || qrCamera.scanMode === QRScanMode.AUTO)
                  ? 'qr-scanner-mode-button--active'
                  : 'qr-scanner-mode-button'
              }
            >
              Camera
            </button>
          )}
          {showFileUpload && (
            <button
              onClick={() => {
                qrCamera.setScanMode(QRScanMode.FILE);
                fileUpload.fileInputRef.current?.click();
              }}
              className="qr-scanner-mode-button"
              disabled={isProcessing}
            >
              Upload
            </button>
          )}
        </div>
      )}

      {/* Hidden File Input */}
      {showFileUpload && (
        <input
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          ref={fileUpload.fileInputRef}
          style={{ display: 'none' }}
        />
      )}

      {/* Close Button */}
      <button onClick={handleClose} className="qr-scanner-close">
        ✕
      </button>
    </div>
  );
};

export default QRCodeScanner;