import { DeviceLinkingPhase } from "../packages/passkey/src/core/types/passkeyManager.js";
import { PasskeyManager } from "../packages/passkey/src/core/PasskeyManager/index.js";
import { useNearClient } from "../hooks/useNearClient.js";
import { useAccountInput } from "../hooks/useAccountInput.js";
import { useRelayer } from "../hooks/useRelayer.js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { jsx } from "react/jsx-runtime";

//#region src/react/context/index.tsx
const PasskeyContext = createContext(void 0);
let globalPasskeyManager = null;
let globalConfig = null;
const PASSKEY_MANAGER_DEFAULT_CONFIGS = {
	nearRpcUrl: "https://test.rpc.fastnear.com",
	nearNetwork: "testnet",
	contractId: "web3-authn-v5.testnet",
	nearExplorerUrl: "https://testnet.nearblocks.io",
	relayer: {
		accountId: "web3-authn-v5.testnet",
		url: "http://localhost:3000",
		initialUseRelayer: true
	},
	vrfWorkerConfigs: { shamir3pass: {
		p: "3N5w46AIGjGT2v5Vua_TMD5Ywfa9U2F7-WzW8SNDsIM",
		relayServerUrl: "http://localhost:3000",
		applyServerLockRoute: "/vrf/apply-server-lock",
		removeServerLockRoute: "/vrf/remove-server-lock"
	} }
};
const PasskeyProvider = ({ children, config = PASSKEY_MANAGER_DEFAULT_CONFIGS }) => {
	const [loginState, setLoginState] = useState({
		isLoggedIn: false,
		nearAccountId: null,
		nearPublicKey: null
	});
	const [accountInputState, setAccountInputState] = useState({
		inputUsername: "",
		lastLoggedInUsername: "",
		lastLoggedInDomain: "",
		targetAccountId: "",
		displayPostfix: "",
		isUsingExistingAccount: false,
		accountExists: false,
		indexDBAccounts: []
	});
	const nearClient = useNearClient();
	const passkeyManager = useMemo(() => {
		const finalConfig = {
			...PASSKEY_MANAGER_DEFAULT_CONFIGS,
			...config
		};
		const configChanged = JSON.stringify(globalConfig) !== JSON.stringify(finalConfig);
		if (!globalPasskeyManager || configChanged) {
			console.debug("PasskeyProvider: Creating new PasskeyManager instance with config:", finalConfig);
			globalPasskeyManager = new PasskeyManager(finalConfig, nearClient);
			globalConfig = finalConfig;
		}
		return globalPasskeyManager;
	}, [config]);
	useEffect(() => {
		(async () => {
			try {
				const walletOrigin = passkeyManager?.configs?.walletOrigin;
				if (walletOrigin) await passkeyManager.initServiceIframe();
			} catch (err) {
				console.warn("[PasskeyProvider] Service iframe init failed:", err);
			}
		})();
	}, [passkeyManager]);
	const relayerHook = useRelayer({ initialValue: config?.relayer.initialUseRelayer ?? false });
	const accountInputHook = useAccountInput({
		passkeyManager,
		relayerAccount: passkeyManager.configs.relayer.accountId,
		useRelayer: relayerHook.useRelayer,
		currentNearAccountId: loginState.nearAccountId,
		isLoggedIn: loginState.isLoggedIn
	});
	useEffect(() => {
		setAccountInputState({
			inputUsername: accountInputHook.inputUsername,
			lastLoggedInUsername: accountInputHook.lastLoggedInUsername,
			lastLoggedInDomain: accountInputHook.lastLoggedInDomain,
			targetAccountId: accountInputHook.targetAccountId,
			displayPostfix: accountInputHook.displayPostfix,
			isUsingExistingAccount: accountInputHook.isUsingExistingAccount,
			accountExists: accountInputHook.accountExists,
			indexDBAccounts: accountInputHook.indexDBAccounts
		});
	}, [
		accountInputHook.inputUsername,
		accountInputHook.lastLoggedInUsername,
		accountInputHook.lastLoggedInDomain,
		accountInputHook.targetAccountId,
		accountInputHook.displayPostfix,
		accountInputHook.isUsingExistingAccount,
		accountInputHook.accountExists,
		accountInputHook.indexDBAccounts
	]);
	const logout = useCallback(async () => {
		try {
			await passkeyManager.logoutAndClearVrfSession();
		} catch (error) {
			console.warn("VRF logout warning:", error);
		}
		setLoginState((prevState) => ({
			...prevState,
			isLoggedIn: false,
			nearAccountId: null,
			nearPublicKey: null
		}));
	}, [passkeyManager]);
	const loginPasskey = async (nearAccountId, options) => {
		const result = await passkeyManager.loginPasskey(nearAccountId, {
			...options,
			onEvent: async (event) => {
				if (event.phase === "login-complete" && event.status === "success") {
					const currentLoginState = await passkeyManager.getLoginState(nearAccountId);
					const isVRFLoggedIn = currentLoginState.vrfActive;
					setLoginState((prevState) => ({
						...prevState,
						isLoggedIn: isVRFLoggedIn,
						nearAccountId: event.nearAccountId || null,
						nearPublicKey: event.clientNearPublicKey || null
					}));
				}
				options?.onEvent?.(event);
			},
			onError: (error) => {
				logout();
				options?.onError?.(error);
			}
		});
		return result;
	};
	const registerPasskey = async (nearAccountId, options) => {
		const result = await passkeyManager.registerPasskey(nearAccountId, {
			...options,
			onEvent: async (event) => {
				if (event.phase === "registration-complete" && event.status === "success") {
					const currentLoginState = await passkeyManager.getLoginState(nearAccountId);
					const isVRFLoggedIn = currentLoginState.vrfActive;
					setLoginState((prevState) => ({
						...prevState,
						isLoggedIn: isVRFLoggedIn,
						nearAccountId,
						nearPublicKey: currentLoginState.publicKey || null
					}));
				}
				options?.onEvent?.(event);
			},
			onError: (error) => {
				logout();
				options?.onError?.(error);
			}
		});
		return result;
	};
	const startAccountRecoveryFlow = (options) => {
		return passkeyManager.startAccountRecoveryFlow(options);
	};
	/**
	* Device2: Start device linking flow
	* @param options - DeviceLinkingOptionsDevice2
	* @returns LinkDeviceFlow
	*/
	const startDeviceLinkingFlow = (options) => {
		return passkeyManager.startDeviceLinkingFlow({
			...options,
			onEvent: (event) => {
				options?.onEvent?.(event);
				if (event.phase === DeviceLinkingPhase.STEP_7_LINKING_COMPLETE && event.status === "success") refreshLoginState();
			}
		});
	};
	const executeAction = async (args) => {
		return await passkeyManager.executeAction({
			nearAccountId: args.nearAccountId,
			receiverId: args.receiverId,
			actionArgs: args.actionArgs,
			options: args.options
		});
	};
	const signNEP413Message = async (args) => {
		return await passkeyManager.signNEP413Message({
			nearAccountId: args.nearAccountId,
			params: args.params,
			options: args.options
		});
	};
	const refreshLoginState = useCallback(async (nearAccountId) => {
		try {
			const loginState$1 = await passkeyManager.getLoginState(nearAccountId);
			if (loginState$1.nearAccountId) {
				const isVRFLoggedIn = loginState$1.vrfActive;
				setLoginState((prevState) => ({
					...prevState,
					nearAccountId: loginState$1.nearAccountId,
					nearPublicKey: loginState$1.publicKey,
					isLoggedIn: isVRFLoggedIn
				}));
			}
		} catch (error) {
			console.error("Error refreshing login state:", error);
		}
	}, [passkeyManager]);
	useEffect(() => {
		refreshLoginState();
	}, [refreshLoginState]);
	const value = {
		passkeyManager,
		registerPasskey,
		loginPasskey,
		logout,
		executeAction,
		signNEP413Message,
		startAccountRecoveryFlow,
		startDeviceLinkingFlow,
		getLoginState: (nearAccountId) => passkeyManager.getLoginState(nearAccountId),
		refreshLoginState,
		loginState,
		accountInputState,
		setInputUsername: accountInputHook.setInputUsername,
		refreshAccountData: accountInputHook.refreshAccountData,
		useRelayer: relayerHook.useRelayer,
		setUseRelayer: relayerHook.setUseRelayer,
		toggleRelayer: relayerHook.toggleRelayer,
		setConfirmBehavior: (behavior) => passkeyManager.setConfirmBehavior(behavior),
		setConfirmationConfig: (config$1) => passkeyManager.setConfirmationConfig(config$1),
		setUserTheme: (theme) => passkeyManager.setUserTheme(theme),
		getConfirmationConfig: () => passkeyManager.getConfirmationConfig(),
		viewAccessKeyList: (accountId) => passkeyManager.viewAccessKeyList(accountId)
	};
	return /* @__PURE__ */ jsx(PasskeyContext.Provider, {
		value,
		children
	});
};
const usePasskeyContext = () => {
	const context = useContext(PasskeyContext);
	if (context === void 0) throw new Error("usePasskeyContext must be used within a PasskeyContextProvider");
	return context;
};

//#endregion
export { PASSKEY_MANAGER_DEFAULT_CONFIGS, PasskeyProvider, usePasskeyContext };
//# sourceMappingURL=index.js.map