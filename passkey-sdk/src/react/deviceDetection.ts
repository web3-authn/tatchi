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
 * Basic Safari detection (desktop Safari). Note: all iOS browsers use WebKit,
 * so use isIOS() to capture iOS Safari-like restrictions.
 */
export const isSafari = (): boolean => {
  try {
    const ua = navigator.userAgent;
    const isSafariEngine = /safari/i.test(ua) && !/chrome|crios|crmo|chromium|edg|edge|opr|opera|brave/i.test(ua);
    return isSafariEngine;
  } catch {
    return false;
  }
};

/**
 * Detect iOS (covers iPhone/iPad/iPod and iPadOS with desktop UA).
 * iOS has WebAuthn user-activation quirks that are shared by all iOS browsers.
 */
export const isIOS = (): boolean => {
  try {
    const ua = navigator.userAgent;
    const platform = (navigator as any).platform || '';
    const maxTouch = Number(navigator.maxTouchPoints || 0);
    const iOSUA = /iPad|iPhone|iPod/.test(ua);
    const iPadOSMacLike = /Macintosh/.test(ua) && maxTouch > 1; // iPadOS masquerading as Mac
    const iOSPlatform = /iPad|iPhone|iPod/.test(platform);
    return iOSUA || iPadOSMacLike || iOSPlatform;
  } catch {
    return false;
  }
};

/**
 * Detect Mobile Safari (iOS Safari specifically). Chrome/Firefox on iOS still use WebKit,
 * so for WebAuthn activation rules, prefer checking isIOS() as well.
 */
export const isMobileSafari = (): boolean => {
  try {
    const ua = navigator.userAgent;
    if (!isIOS()) return false;
    // Exclude Chrome/Firefox/Edge branded iOS browsers (still WebKit underneath)
    const branded = /crios|fxios|edgios|opios|mercury/i.test(ua);
    const safariToken = /safari/i.test(ua);
    return safariToken && !branded;
  } catch {
    return false;
  }
};

/**
 * Returns true when the page currently has a transient user activation
 * (click/tap/key within the allowed time window).
 */
export const hasActiveUserActivation = (): boolean => {
  try {
    const ua = (navigator as any).userActivation;
    return !!(ua && typeof ua.isActive === 'boolean' && ua.isActive);
  } catch {
    return false;
  }
};

/**
 * Heuristic: when on Safari/iOS or on a mobile device AND no active user
 * activation, we should surface a clickable UI to capture activation.
 */
export const needsExplicitActivation = (): boolean => {
  try {
    if (hasActiveUserActivation()) return false;
    return isIOS() || isMobileDevice() || isSafari();
  } catch {
    // In non-browser or SSR/test environments, avoid forcing UI changes
    return false;
  }
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
