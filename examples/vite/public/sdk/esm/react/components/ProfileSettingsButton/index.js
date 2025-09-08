import { usePasskeyContext } from "../../context/index.js";
import { UserAccountButton } from "./UserAccountButton.js";
import { ProfileDropdown } from "./ProfileDropdown2.js";
import { useProfileState } from "./hooks/useProfileState.js";
import { ThemeProvider, ThemeScope, useTheme } from "../theme/ThemeProvider.js";
import { QRCodeScanner } from "../QRCodeScanner.js";
import { AccessKeysModal } from "./AccessKeysModal2.js";
import "./Web3AuthProfileButton.js";
import React, { useEffect, useMemo, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { Key, Scan, Shield, Sliders } from "lucide-react";

//#region src/react/components/ProfileSettingsButton/index.tsx
/**
* Profile Settings Button Component
* Provides user settings, account management, and device linking.
* **Important:** This component must be used inside a PasskeyManager context.
* Wrap your app with PasskeyProvider or ensure PasskeyManager is available in context.
*
* @example
* ```tsx
* import { PasskeyProvider } from '@web3authn/passkey/react';
* import { ProfileSettingsButton } from '@web3authn/passkey/react';
*
* function App() {
*   return (
*     <PasskeyProvider configs={passkeyConfigs}>
*       <ProfileSettingsButton
*         username="alice"
*         onLogout={() => console.log('User logged out')}
*         deviceLinkingScannerParams={{
*           onDeviceLinked: (result) => console.log('Device linked:', result),
*           onError: (error) => console.error('Error:', error),
*           onClose: () => console.log('Scanner closed'),
*           onEvent: (event) => console.log('Event:', event),
*           fundingAmount: '0.05'
*         }}
*       />
*     </PasskeyProvider>
*   );
* }
* ```
*/
const ProfileSettingsButtonInner = ({ username: usernameProp, nearAccountId: nearAccountIdProp, onLogout, toggleColors, nearExplorerBaseUrl = "https://nearblocks.io", deviceLinkingScannerParams }) => {
	const { loginState, passkeyManager, logout, useRelayer, setUseRelayer } = usePasskeyContext();
	const accountName = usernameProp || nearAccountIdProp?.split(".")?.[0] || loginState.nearAccountId?.split(".")?.[0] || "User";
	const nearAccountId = nearAccountIdProp || loginState.nearAccountId;
	const [showQRScanner, setShowQRScanner] = useState(false);
	const [showAccessKeys, setShowAccessKeys] = useState(false);
	const [isLoadingKeys, setIsLoadingKeys] = useState(false);
	const [transactionSettingsOpen, setTransactionSettingsOpen] = useState(false);
	const [currentConfirmConfig, setCurrentConfirmConfig] = useState(null);
	useEffect(() => {
		try {
			const cfg = passkeyManager.getConfirmationConfig();
			setCurrentConfirmConfig(cfg);
		} catch (_) {}
	}, [passkeyManager]);
	const handleToggleShowDetails = () => {
		if (!currentConfirmConfig) return;
		const newUIMode = currentConfirmConfig.uiMode === "modal" ? "skip" : "modal";
		passkeyManager.setConfirmationConfig({
			...currentConfirmConfig,
			uiMode: newUIMode
		});
		setCurrentConfirmConfig((prev) => prev ? {
			...prev,
			uiMode: newUIMode
		} : prev);
	};
	const handleToggleSkipClick = () => {
		if (!currentConfirmConfig) return;
		const newBehavior = currentConfirmConfig.behavior === "requireClick" ? "autoProceed" : "requireClick";
		passkeyManager.setConfirmBehavior(newBehavior);
		setCurrentConfirmConfig((prev) => prev ? {
			...prev,
			behavior: newBehavior
		} : prev);
	};
	const handleSetDelay = (delay) => {
		if (!currentConfirmConfig) return;
		passkeyManager.setConfirmationConfig({
			...currentConfirmConfig,
			autoProceedDelay: delay
		});
		setCurrentConfirmConfig((prev) => prev ? {
			...prev,
			autoProceedDelay: delay
		} : prev);
	};
	const handleToggleTheme = () => {
		if (!currentConfirmConfig) return;
		const newTheme = currentConfirmConfig.theme === "dark" ? "light" : "dark";
		passkeyManager.setUserTheme(newTheme);
		setCurrentConfirmConfig((prev) => prev ? {
			...prev,
			theme: newTheme
		} : prev);
	};
	const MENU_ITEMS = useMemo(() => [
		{
			icon: /* @__PURE__ */ jsx(Key, {}),
			label: "Export Keys",
			description: "Export your NEAR keys",
			disabled: false,
			onClick: async () => {
				try {
					const { accountId, privateKey, publicKey } = await passkeyManager.exportNearKeypairWithTouchId(nearAccountId);
					await new Promise((resolve) => setTimeout(resolve, 150));
					const keypair_msg = `Account ID:\n${accountId}\n\nPublic key:\n${publicKey}\n\nPrivate key:\n${privateKey}`;
					if (navigator.clipboard && window.isSecureContext) {
						await navigator.clipboard.writeText(keypair_msg);
						alert(`NEAR keys copied to clipboard!\n${keypair_msg}`);
					} else alert(`Your NEAR Keys (copy manually):\n${keypair_msg}`);
				} catch (error) {
					console.error("Key export failed:", error);
					alert(`Key export failed: ${error.message}`);
				}
			}
		},
		{
			icon: /* @__PURE__ */ jsx(Scan, {}),
			label: "Scan and Link Device",
			description: "Scan a QR to link a device",
			disabled: !loginState.isLoggedIn,
			onClick: () => {
				console.log("ProfileSettingsButton: Opening QR Scanner");
				setShowQRScanner(true);
			},
			keepOpenOnClick: true
		},
		{
			icon: /* @__PURE__ */ jsx(Shield, {}),
			label: "Access Keys",
			description: "View your account access keys",
			disabled: !loginState.isLoggedIn,
			onClick: () => setShowAccessKeys(true),
			keepOpenOnClick: true
		},
		{
			icon: /* @__PURE__ */ jsx(Sliders, {}),
			label: "Transaction Settings",
			description: "Customize confirmation behavior",
			disabled: !loginState.isLoggedIn,
			onClick: () => setTransactionSettingsOpen((v) => !v),
			keepOpenOnClick: true
		}
	], [
		passkeyManager,
		nearAccountId,
		loginState.isLoggedIn
	]);
	const { isOpen, refs, handleToggle, handleClose } = useProfileState();
	const { theme } = useTheme();
	const handleLogout = () => {
		logout();
		onLogout?.();
		handleClose();
	};
	return /* @__PURE__ */ jsxs("div", {
		className: `w3a-profile-button-container`,
		children: [
			/* @__PURE__ */ jsxs("div", {
				ref: refs.buttonRef,
				className: `w3a-profile-button-morphable ${isOpen ? "open" : "closed"}`,
				"data-state": isOpen ? "open" : "closed",
				children: [/* @__PURE__ */ jsx(UserAccountButton, {
					username: accountName,
					fullAccountId: nearAccountId || void 0,
					isOpen,
					onClick: handleToggle,
					nearExplorerBaseUrl,
					theme
				}), /* @__PURE__ */ jsx(ProfileDropdown, {
					ref: refs.dropdownRef,
					isOpen,
					menuItems: MENU_ITEMS,
					useRelayer,
					onRelayerChange: setUseRelayer,
					onLogout: handleLogout,
					onClose: handleClose,
					menuItemsRef: refs.menuItemsRef,
					toggleColors,
					currentConfirmConfig,
					onToggleShowDetails: handleToggleShowDetails,
					onToggleSkipClick: handleToggleSkipClick,
					onSetDelay: handleSetDelay,
					onToggleTheme: handleToggleTheme,
					transactionSettingsOpen,
					theme
				})]
			}),
			/* @__PURE__ */ jsx(QRCodeScanner, {
				isOpen: showQRScanner,
				fundingAmount: deviceLinkingScannerParams?.fundingAmount || "0.05",
				onDeviceLinked: (result) => {
					console.log("ProfileSettingsButton: QR Scanner device linked");
					deviceLinkingScannerParams?.onDeviceLinked?.(result);
					setShowQRScanner(false);
				},
				onError: (error) => {
					console.log("ProfileSettingsButton: QR Scanner error");
					deviceLinkingScannerParams?.onError?.(error);
					setShowQRScanner(false);
				},
				onClose: () => {
					console.log("ProfileSettingsButton: QR Scanner close requested");
					deviceLinkingScannerParams?.onClose?.();
					setShowQRScanner(false);
				},
				onEvent: (event) => deviceLinkingScannerParams?.onEvent?.(event)
			}, "profile-qr-scanner"),
			/* @__PURE__ */ jsx(AccessKeysModal, {
				nearAccountId,
				isOpen: showAccessKeys,
				onClose: () => setShowAccessKeys(false)
			})
		]
	});
};
const ProfileSettingsButton = (props) => {
	return /* @__PURE__ */ jsx(ThemeProvider, { children: /* @__PURE__ */ jsx(ThemeScope, { children: /* @__PURE__ */ jsx(ProfileSettingsButtonInner, { ...props }) }) });
};

//#endregion
export { ProfileSettingsButton };
//# sourceMappingURL=index.js.map