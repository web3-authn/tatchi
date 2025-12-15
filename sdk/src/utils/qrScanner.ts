import type { DeviceLinkingQRData } from '../core/types/linkDevice';
import { DeviceLinkingError, DeviceLinkingErrorCode } from '../core/types/linkDevice';
import { validateDeviceLinkingQRData } from '../core/TatchiPasskey/scanDevice';
import { DeviceLinkingSSEEvent } from '@/core/types/sdkSentEvents';

// ===========================
// TYPES AND INTERFACES
// ===========================

export interface ScanQRCodeFlowOptions {
  cameraId?: string;
  cameraConfigs?: {
    facingMode?: 'user' | 'environment';
    width?: number;
    height?: number;
  };
  timeout?: number; // in milliseconds, default 60000
}

export interface ScanQRCodeFlowEvents {
  onEvent?: (event: DeviceLinkingSSEEvent) => void;
  onQRDetected?: (qrData: DeviceLinkingQRData) => void;
  onError?: (error: Error) => void;
  onCameraReady?: (stream: MediaStream) => void;
  onScanProgress?: (duration: number) => void; // Called periodically during scanning
}

export enum ScanQRCodeFlowState {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  SCANNING = 'scanning',
  SUCCESS = 'success',
  ERROR = 'error',
  CANCELLED = 'cancelled'
}

// ===========================
// SCANQRCODEFLOW CLASS
// ===========================

/**
 * ScanQRCodeFlow - Encapsulates QR code scanning lifecycle
 * Can be used in both React (useQRCamera) and non-React (TatchiPasskey) contexts
 */
export class ScanQRCodeFlow {
  private state: ScanQRCodeFlowState = ScanQRCodeFlowState.IDLE;
  private mediaStream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animationId: number | null = null;
  private timeoutId: NodeJS.Timeout | null = null;
  private progressIntervalId: NodeJS.Timeout | null = null;
  private scanStartTime: number = 0;
  private currentError: Error | null = null;
  private detectedQRData: DeviceLinkingQRData | null = null;

  constructor(
    private options: ScanQRCodeFlowOptions = {},
    private events: ScanQRCodeFlowEvents = {}
  ) {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to get canvas 2D context');
    }
    this.ctx = ctx;
  }

  /**
   * Get current flow state
   */
  getState(): {
    state: ScanQRCodeFlowState;
    isScanning: boolean;
    scanDuration: number;
    error: Error | null;
    qrData: DeviceLinkingQRData | null;
  } {
    return {
      state: this.state,
      isScanning: this.state === ScanQRCodeFlowState.SCANNING,
      scanDuration: this.scanStartTime ? Date.now() - this.scanStartTime : 0,
      error: this.currentError,
      qrData: this.detectedQRData
    };
  }

  /**
   * Start scanning for QR codes
   */
  async startQRScanner(): Promise<void> {
    if (
      this.state !== ScanQRCodeFlowState.IDLE &&
      this.state !== ScanQRCodeFlowState.ERROR &&
      this.state !== ScanQRCodeFlowState.CANCELLED
    ) {
      return; // Already running
    }

    this.setState(ScanQRCodeFlowState.INITIALIZING);
    this.currentError = null;
    this.detectedQRData = null;

    try {
      // Build camera constraints
      const constraints = this.buildCameraConstraints();

      // Get camera stream
      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Create video element if not provided externally
      if (!this.video) {
        this.video = document.createElement('video');
        this.video.playsInline = true;
        this.video.muted = true;
      }

      this.video.srcObject = this.mediaStream;
      await this.video.play();

      // Notify camera is ready
      this.events.onCameraReady?.(this.mediaStream);

      this.setState(ScanQRCodeFlowState.SCANNING);
      this.scanStartTime = Date.now();

      // Start progress tracking
      this.startProgressTracking();

      // Set timeout if specified
      const timeout = this.options.timeout ?? 60000;
      if (timeout > 0) {
        this.timeoutId = setTimeout(() => {
          this.handleError(new Error(`Camera scan timeout - no QR code detected within ${timeout}ms`));
        }, timeout);
      }

      // Start scanning loop
      this.scanFrame();

    } catch (error: any) {
      this.handleError(new Error(`Camera access failed: ${error.message}`));
    }
  }

  /**
   * Stop scanning and cleanup resources
   *
   * This method stops the scanning process and cleans up all internal resources.
   * For React contexts with external video elements, use destroy() instead.
   */
  stop(): void {
    this.setState(ScanQRCodeFlowState.CANCELLED);
    this.cleanup();
  }

  /**
   * Attach an external video element (for React contexts)
   */
  attachVideoElement(video: HTMLVideoElement): void {
    this.video = video;
    if (this.mediaStream && this.state === ScanQRCodeFlowState.SCANNING) {
      this.video.srcObject = this.mediaStream;
      this.video.play();
    }
  }

  /**
   * Detach the video element
   */
  detachVideoElement(): void {
    if (this.video) {
      this.video.srcObject = null;
    }
    this.video = null;
  }

  /**
   * Switch to a different camera
   */
  async switchCamera(cameraId: string): Promise<void> {
    const wasScanning = this.state === ScanQRCodeFlowState.SCANNING;
    if (wasScanning) {
      this.stop();
    }

    this.options.cameraId = cameraId;

    if (wasScanning) {
      await this.startQRScanner();
    }
  }

  /**
   * Get available video devices
   */
  async getAvailableCameras(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'videoinput');
    } catch (error) {
      console.error('Error enumerating cameras:', error);
      throw new Error('Failed to access camera devices');
    }
  }

  /**
   * Get the current media stream (for external video elements)
   */
  getMediaStream(): MediaStream | null {
    return this.mediaStream;
  }

  // Private methods

  private setState(newState: ScanQRCodeFlowState): void {
    this.state = newState;
  }

  private buildCameraConstraints(): MediaStreamConstraints {
    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: this.options.cameraId || undefined,
        width: { ideal: 720, min: 480 },
        height: { ideal: 720, min: 480 },
        aspectRatio: { ideal: 1.0 },
        facingMode: this.options.cameraId ? undefined : this.options.cameraConfigs?.facingMode
      }
    };

    // Override with custom width/height if provided
    if (this.options.cameraConfigs?.width || this.options.cameraConfigs?.height) {
      const videoConstraints = constraints.video as MediaTrackConstraints;
      if (this.options.cameraConfigs.width) {
        videoConstraints.width = { ideal: this.options.cameraConfigs.width, min: 480 };
      }
      if (this.options.cameraConfigs.height) {
        videoConstraints.height = { ideal: this.options.cameraConfigs.height, min: 480 };
      }
    }

    return constraints;
  }

  private startProgressTracking(): void {
    this.progressIntervalId = setInterval(() => {
      if (this.state === ScanQRCodeFlowState.SCANNING) {
        const duration = Date.now() - this.scanStartTime;
        this.events.onScanProgress?.(duration);
      }
    }, 100); // Update every 100ms
  }

  private async scanFrame(): Promise<void> {
    if (
      this.state !== ScanQRCodeFlowState.SCANNING
      || !this.video
      || !this.mediaStream
    ) {
      return;
    }

    try {
      // Check if video is ready
      if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
        // Draw video frame to canvas
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

        // Scan for QR code
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const qrData = await this.scanQRFromImageData(imageData);

        if (qrData) {
          const parsedData = this.parseAndValidateQRData(qrData);
          this.handleSuccess(parsedData);
          return;
        }
      }
    } catch (error: any) {
      // Fail the scan on validation or frame errors
      this.handleError(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    // Schedule next frame
    if (this.state === ScanQRCodeFlowState.SCANNING) {
      this.animationId = requestAnimationFrame(() => this.scanFrame());
    }
  }

  private async scanQRFromImageData(imageData: ImageData): Promise<string | null> {
    const { default: jsQR } = await import('jsqr');
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert"
    });
    return code ? code.data : null;
  }

  private parseAndValidateQRData(qrData: string): DeviceLinkingQRData {
    let parsedData: DeviceLinkingQRData;
    try {
      parsedData = JSON.parse(qrData);
    } catch {
      if (qrData.startsWith('http')) {
        throw new Error('QR code contains a URL, not device linking data');
      }
      if (qrData.includes('ed25519:')) {
        throw new Error('QR code contains a NEAR key, not device linking data');
      }
      throw new Error('Invalid QR code format - expected JSON device linking data');
    }

    // Use the validation function from scanDevice.ts
    validateDeviceLinkingQRData(parsedData);
    return parsedData;
  }

  private handleSuccess(qrData: DeviceLinkingQRData): void {
    this.setState(ScanQRCodeFlowState.SUCCESS);
    this.detectedQRData = qrData;
    this.cleanup();
    this.events.onQRDetected?.(qrData);
  }

  private handleError(error: Error): void {
    this.setState(ScanQRCodeFlowState.ERROR);
    this.currentError = error;
    this.cleanup();
    this.events.onError?.(error);
  }

  private cleanup(): void {
    // Stop animation frame
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // Clear timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // Stop progress tracking
    if (this.progressIntervalId) {
      clearInterval(this.progressIntervalId);
      this.progressIntervalId = null;
    }

    // MediaStream Cleanup: Stop all tracks and clear all video references
    // This ensures camera light turns off regardless of how the video element is managed
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // Clear all video sources to ensure no lingering MediaStream references
    if (this.video) {
      this.video.srcObject = null;
    }
  }
}

// ===========================
// CONVENIENCE FUNCTIONS
// ===========================

/**
 * Scan QR code from file with lazy loading
 */
export async function scanQRCodeFromFile(file: File): Promise<DeviceLinkingQRData> {
  // Setup canvas
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw createQRError('Unable to get canvas 2D context');

  // Load and process image
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        resolve(e.target.result as string);
      } else {
        reject(createQRError('Failed to read file'));
      }
    };
    reader.onerror = () => reject(createQRError('Failed to read file'));
    reader.readAsDataURL(file);
  });

  // Process image
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(createQRError('Failed to load image file'));
    image.src = dataUrl;
  });

  // Scan QR code using shared logic
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const qrData = await scanQRFromImageData(imageData);

  if (!qrData) {
    throw createQRError('No QR code found in image');
  }

  return parseAndValidateQRData(qrData);
}

// ===========================
// UTILITY FUNCTIONS
// ===========================

/**
 * Enumerate available video input devices
 */
export async function enumerateVideoDevices(): Promise<MediaDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'videoinput');
  } catch (error) {
    console.error('Error enumerating cameras:', error);
    throw new Error('Failed to access camera devices');
  }
}

/**
 * Detect if a camera is front-facing based on its label
 */
export function detectFrontCamera(camera: MediaDeviceInfo): boolean {
  const label = camera.label.toLowerCase();
  return label.includes('front') ||
         label.includes('user') ||
         label.includes('selfie') ||
         label.includes('facetime') ||
         label.includes('facing front');
}

/**
 * Detect camera facing mode from media stream settings
 */
export function detectCameraFacingMode(stream: MediaStream): boolean {
  const videoTrack = stream.getVideoTracks()[0];
  if (videoTrack) {
    const settings = videoTrack.getSettings();
    return settings.facingMode === 'user';
  }
  return false;
}

// ===========================
// PRIVATE HELPER FUNCTIONS
// ===========================

async function scanQRFromImageData(imageData: ImageData): Promise<string | null> {
  const { default: jsQR } = await import('jsqr');
  const code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "dontInvert"
  });
  return code ? code.data : null;
}

function parseAndValidateQRData(qrData: string): DeviceLinkingQRData {
  let parsedData: DeviceLinkingQRData;
  try {
    parsedData = JSON.parse(qrData);
  } catch {
    if (qrData.startsWith('http')) {
      throw new Error('QR code contains a URL, not device linking data');
    }
    if (qrData.includes('ed25519:')) {
      throw new Error('QR code contains a NEAR key, not device linking data');
    }
    throw new Error('Invalid QR code format - expected JSON device linking data');
  }

  // Use the validation function from scanDevice.ts
  validateDeviceLinkingQRData(parsedData);
  return parsedData;
}

function createQRError(message: string): DeviceLinkingError {
  return new DeviceLinkingError(message, DeviceLinkingErrorCode.INVALID_QR_DATA, 'authorization');
}
