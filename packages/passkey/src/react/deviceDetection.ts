/**
 * Device detection utilities for camera and UI optimization
 */

export type DeviceType = 'mobile' | 'tablet' | 'desktop';
export type CameraFacingMode = 'user' | 'environment';

/**
 * Detects the current device type based on multiple indicators
 */
export const detectDeviceType = (): DeviceType => {
  // Method 1: User agent detection
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobileUA = /android|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  const isTabletUA = /ipad|tablet|kindle|playbook|silk/i.test(userAgent);

  // Method 2: Touch and screen size detection
  const isTouchDevice = navigator.maxTouchPoints > 0;
  const screenWidth = window.screen.width;
  const isSmallScreen = screenWidth <= 480;
  const isMediumScreen = screenWidth <= 1024;

  // Method 3: Orientation support (mobile/tablet indicator)
  const hasOrientation = 'orientation' in window;

  // Determine device type with priority: mobile > tablet > desktop
  if (isMobileUA || (isTouchDevice && isSmallScreen)) {
    return 'mobile';
  }

  if (isTabletUA || (isTouchDevice && isMediumScreen && hasOrientation)) {
    return 'tablet';
  }

  return 'desktop';
};

/**
 * Determines optimal camera facing mode based on device type
 * - Mobile/Tablet: Back camera (environment) for QR scanning
 * - Desktop/Laptop: Front camera (user) for video calls/selfies
 */
export const getOptimalCameraFacingMode = (): CameraFacingMode => {
  const deviceType = detectDeviceType();

  switch (deviceType) {
    case 'mobile':
    case 'tablet':
      console.log(`${deviceType} device detected - using back camera (environment)`);
      return 'environment';

    case 'desktop':
    default:
      console.log('Desktop device detected - using front camera (user)');
      return 'user';
  }
};

/**
 * Check if the current device is likely mobile
 */
export const isMobileDevice = (): boolean => {
  return detectDeviceType() === 'mobile';
};

/**
 * Check if the current device supports touch
 */
export const isTouchDevice = (): boolean => {
  return navigator.maxTouchPoints > 0;
};

/**
 * Get device capabilities for camera constraints
 */
export const getDeviceCapabilities = () => {
  const deviceType = detectDeviceType();
  const isTouch = isTouchDevice();
  const facingMode = getOptimalCameraFacingMode();

  return {
    deviceType,
    isTouch,
    recommendedFacingMode: facingMode,
    // Recommended camera constraints based on device
    cameraConstraints: {
      video: {
        facingMode,
        width: deviceType === 'mobile' ? { ideal: 720, min: 480 } : { ideal: 1280, min: 720 },
        height: deviceType === 'mobile' ? { ideal: 720, min: 480 } : { ideal: 720, min: 480 },
        aspectRatio: deviceType === 'mobile' ? { ideal: 1.0 } : { ideal: 16/9 }
      }
    }
  };
};