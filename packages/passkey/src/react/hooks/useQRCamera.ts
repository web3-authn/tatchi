import { useEffect, useRef, useState, useCallback } from 'react';
import { getOptimalCameraFacingMode } from '../deviceDetection';
import type { DeviceLinkingQRData } from '@/index';
import { ScanQRCodeFlow, enumerateVideoDevices, detectFrontCamera } from '../../utils/qrScanner';

/**
 * QR Camera Scanning Hook
 *
 * Provides camera-based QR code scanning functionality for device linking.
 *
 * **Important:** This hook must be used inside a PasskeyManager context.
 * Wrap your app with PasskeyProvider or ensure PasskeyManager is available in context.
 *
 * @example
 * ```tsx
 * import { PasskeyProvider } from '@web3authn/passkey/react';
 * import { useQRCamera } from '@web3authn/passkey/react';
 *
 * function QRScanner() {
 *   const qrCamera = useQRCamera({
 *     onQRDetected: (qrData) => console.log('QR detected:', qrData),
 *     onError: (error) => console.error('Error:', error)
 *   });
 *
 *   return <video ref={qrCamera.videoRef} />;
 * }
 * ```
 */
export enum QRScanMode {
  CAMERA = 'camera',
  FILE = 'file',
  AUTO = 'auto'
}

export interface UseQRCameraOptions {
  onQRDetected?: (qrData: DeviceLinkingQRData) => void;
  onError?: (error: Error) => void;
  isOpen?: boolean;
  cameraId?: string;
}

export interface UseQRCameraReturn {
  // State
  isScanning: boolean;
  isProcessing: boolean;
  error: string | null;
  cameras: MediaDeviceInfo[];
  selectedCamera: string;
  scanMode: QRScanMode;
  isFrontCamera: boolean;
  scanDurationMs: number;

  // Refs for UI
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;

  // Controls
  startScanning: () => Promise<void>;
  stopScanning: () => void;
  handleCameraChange: (deviceId: string) => void;
  setScanMode: (mode: QRScanMode) => void;
  setError: (error: string | null) => void;

  // Utilities
  getOptimalFacingMode: () => 'user' | 'environment';
}

export const useQRCamera = (options: UseQRCameraOptions): UseQRCameraReturn => {
  const {
    onQRDetected,
    onError,
    isOpen = true,
    cameraId
  } = options;

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flowRef = useRef<ScanQRCodeFlow | null>(null);

  // State
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>(cameraId || '');
  const [scanMode, setScanMode] = useState<QRScanMode>(QRScanMode.CAMERA);
  const [isFrontCamera, setIsFrontCamera] = useState<boolean>(false);
  const [scanDurationMs, setScanDurationMs] = useState<number>(0);

  // Initialize flow
  useEffect(() => {
    flowRef.current = new ScanQRCodeFlow(
      {
        cameraId: selectedCamera,
        cameraConfigs: {
          facingMode: getOptimalCameraFacingMode()
        },
        timeout: 60000 // 60 seconds
      },
      {
        onQRDetected: (qrData) => {
          console.log('useQRCamera: Valid QR data detected -', {
            devicePublicKey: qrData.device2PublicKey,
            accountId: qrData.accountId,
            timestamp: new Date(qrData.timestamp || 0).toISOString()
          });
          setIsProcessing(false);
          setIsScanning(false);
          setScanDurationMs(0);
          onQRDetected?.(qrData);
        },
        onError: (err) => {
          console.error('useQRCamera: QR scan error -', err);
          setError(err.message);
          setIsProcessing(false);
          setIsScanning(false);
          setScanDurationMs(0);
          onError?.(err);
        },
        onCameraReady: (stream) => {
          // Camera stream is ready, but video element attachment is handled separately
          console.log('useQRCamera: Camera stream ready');
        },
        onScanProgress: (duration) => {
          setScanDurationMs(duration);
        }
      }
    );

    return () => {
      if (flowRef.current) {
        flowRef.current.destroy();
        flowRef.current = null;
      }
    };
  }, []); // Only initialize once

  // Load cameras on mount
  useEffect(() => {
    const loadCameras = async () => {
      try {
        const videoDevices = await enumerateVideoDevices();
        setCameras(videoDevices);

        if (videoDevices.length > 0 && !selectedCamera) {
          const firstCamera = videoDevices[0];
          setSelectedCamera(firstCamera.deviceId);
          setIsFrontCamera(detectFrontCamera(firstCamera));
        }
      } catch (error: any) {
        setError(error.message);
      }
    };

    loadCameras();
  }, []);

  // Update flow camera when selectedCamera changes
  useEffect(() => {
    if (flowRef.current && selectedCamera) {
      flowRef.current.switchCamera(selectedCamera);
    }
  }, [selectedCamera]);

  // Attach/detach video element when ref changes
  useEffect(() => {
    if (videoRef.current && flowRef.current) {
      flowRef.current.attachVideoElement(videoRef.current);
    }

    return () => {
      if (flowRef.current) {
        flowRef.current.detachVideoElement();
      }
    };
  }, [videoRef.current]);

  // Start/stop scanning based on isOpen and scanMode
  useEffect(() => {
    const flow = flowRef.current;
    if (!flow) return;

    if (isOpen && scanMode === QRScanMode.CAMERA) {
      setError(null);
      setIsProcessing(true);
      setIsScanning(true);
      setScanDurationMs(0);
      flow.startQRScanner();
    } else {
      flow.stop();
      setIsScanning(false);
      setIsProcessing(false);
      setScanDurationMs(0);
    }
  }, [isOpen, scanMode]);

  // Manual controls
  const startScanning = useCallback(async () => {
    if (flowRef.current) {
      setError(null);
      setIsProcessing(true);
      setIsScanning(true);
      setScanDurationMs(0);
      await flowRef.current.startQRScanner();
    }
  }, []);

  const stopScanning = useCallback(() => {
    if (flowRef.current) {
      flowRef.current.stop();
      setIsScanning(false);
      setIsProcessing(false);
      setScanDurationMs(0);
    }
  }, []);

  // Handle camera change
  const handleCameraChange = useCallback(async (deviceId: string) => {
    setSelectedCamera(deviceId);

    const selectedCameraDevice = cameras.find(camera => camera.deviceId === deviceId);
    if (selectedCameraDevice) {
      setIsFrontCamera(detectFrontCamera(selectedCameraDevice));
    }

    // The useEffect will handle updating the flow
  }, [cameras]);

  const getOptimalFacingMode = useCallback(() => getOptimalCameraFacingMode(), []);

  return {
    // State
    isScanning,
    isProcessing,
    error,
    cameras,
    selectedCamera,
    scanMode,
    isFrontCamera,
    scanDurationMs,

    // Refs for UI
    videoRef,
    canvasRef,

    // Controls
    startScanning,
    stopScanning,
    handleCameraChange,
    setScanMode,
    setError,

    // Utilities
    getOptimalFacingMode
  };
};