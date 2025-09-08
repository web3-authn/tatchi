//#region src/react/deviceDetection.ts
/**
* Detects the current device type based on multiple indicators
*/
const detectDeviceType = () => {
	const userAgent = navigator.userAgent.toLowerCase();
	const isMobileUA = /android|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
	const isTabletUA = /ipad|tablet|kindle|playbook|silk/i.test(userAgent);
	const isTouchDevice = navigator.maxTouchPoints > 0;
	const screenWidth = window.screen.width;
	const isSmallScreen = screenWidth <= 480;
	const isMediumScreen = screenWidth <= 1024;
	const hasOrientation = "orientation" in window;
	if (isMobileUA || isTouchDevice && isSmallScreen) return "mobile";
	if (isTabletUA || isTouchDevice && isMediumScreen && hasOrientation) return "tablet";
	return "desktop";
};
/**
* Determines optimal camera facing mode based on device type
* - Mobile/Tablet: Back camera (environment) for QR scanning
* - Desktop/Laptop: Front camera (user) for video calls/selfies
*/
const getOptimalCameraFacingMode = () => {
	const deviceType = detectDeviceType();
	switch (deviceType) {
		case "mobile":
		case "tablet":
			console.log(`${deviceType} device detected - using back camera (environment)`);
			return "environment";
		case "desktop":
		default: return "user";
	}
};

//#endregion
export { getOptimalCameraFacingMode };
//# sourceMappingURL=deviceDetection.js.map