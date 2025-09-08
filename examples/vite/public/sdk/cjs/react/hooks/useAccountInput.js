const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_accountIds = require('../packages/passkey/src/core/types/accountIds.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);

//#region src/react/hooks/useAccountInput.ts
function useAccountInput({ passkeyManager, relayerAccount, useRelayer, currentNearAccountId, isLoggedIn }) {
	const [state, setState] = (0, react.useState)({
		inputUsername: "",
		lastLoggedInUsername: "",
		lastLoggedInDomain: "",
		targetAccountId: "",
		displayPostfix: "",
		isUsingExistingAccount: false,
		accountExists: false,
		indexDBAccounts: []
	});
	const refreshAccountData = (0, react.useCallback)(async () => {
		try {
			const { accountIds, lastUsedAccountId } = await passkeyManager.getRecentLogins();
			let lastUsername = "";
			let lastDomain = "";
			if (lastUsedAccountId) {
				const parts = lastUsedAccountId.nearAccountId.split(".");
				lastUsername = parts[0];
				lastDomain = `.${parts.slice(1).join(".")}`;
			}
			setState((prevState) => ({
				...prevState,
				indexDBAccounts: accountIds,
				lastLoggedInUsername: lastUsername,
				lastLoggedInDomain: lastDomain
			}));
		} catch (error) {
			console.warn("Error loading account data:", error);
		}
	}, [passkeyManager]);
	const updateDerivedState = (0, react.useCallback)((username, accounts) => {
		if (!username.trim()) {
			setState((prevState) => ({
				...prevState,
				targetAccountId: "",
				displayPostfix: "",
				isUsingExistingAccount: false,
				accountExists: false
			}));
			return;
		}
		const existingAccount = accounts.find((accountId) => accountId.split(".")[0].toLowerCase() === username.toLowerCase());
		let targetAccountId;
		let displayPostfix;
		let isUsingExistingAccount;
		if (existingAccount) {
			targetAccountId = existingAccount;
			const parts = existingAccount.split(".");
			displayPostfix = `.${parts.slice(1).join(".")}`;
			isUsingExistingAccount = true;
		} else {
			const postfix = useRelayer ? relayerAccount : "testnet";
			targetAccountId = `${username}.${postfix}`;
			displayPostfix = `.${postfix}`;
			isUsingExistingAccount = false;
		}
		setState((prevState) => ({
			...prevState,
			targetAccountId,
			displayPostfix,
			isUsingExistingAccount
		}));
		checkAccountExists(targetAccountId);
	}, [
		useRelayer,
		relayerAccount,
		passkeyManager
	]);
	const checkAccountExists = (0, react.useCallback)(async (accountId) => {
		if (!accountId) {
			setState((prevState) => ({
				...prevState,
				accountExists: false
			}));
			return;
		}
		try {
			const hasCredential = await passkeyManager.hasPasskeyCredential(require_accountIds.toAccountId(accountId));
			setState((prevState) => ({
				...prevState,
				accountExists: hasCredential
			}));
		} catch (error) {
			console.warn("Error checking credentials:", error);
			setState((prevState) => ({
				...prevState,
				accountExists: false
			}));
		}
	}, [passkeyManager]);
	const setInputUsername = (0, react.useCallback)((username) => {
		setState((prevState) => ({
			...prevState,
			inputUsername: username
		}));
		updateDerivedState(username, state.indexDBAccounts);
	}, [state.indexDBAccounts, updateDerivedState]);
	(0, react.useEffect)(() => {
		const initializeAccountInput = async () => {
			await refreshAccountData();
			if (isLoggedIn && currentNearAccountId) {
				const username = currentNearAccountId.split(".")[0];
				setState((prevState) => ({
					...prevState,
					inputUsername: username
				}));
			} else {
				const { lastUsedAccountId } = await passkeyManager.getRecentLogins();
				if (lastUsedAccountId) {
					const username = lastUsedAccountId.nearAccountId.split(".")[0];
					setState((prevState) => ({
						...prevState,
						inputUsername: username
					}));
				}
			}
		};
		initializeAccountInput();
	}, [
		passkeyManager,
		isLoggedIn,
		currentNearAccountId,
		passkeyManager
	]);
	(0, react.useEffect)(() => {
		const handleLogoutReset = async () => {
			if (!isLoggedIn && !currentNearAccountId) try {
				const { lastUsedAccountId } = await passkeyManager.getRecentLogins();
				if (lastUsedAccountId) {
					const username = lastUsedAccountId.nearAccountId.split(".")[0];
					setState((prevState) => ({
						...prevState,
						inputUsername: username
					}));
				}
			} catch (error) {
				console.warn("Error resetting username after logout:", error);
			}
		};
		handleLogoutReset();
	}, [
		isLoggedIn,
		currentNearAccountId,
		passkeyManager
	]);
	(0, react.useEffect)(() => {
		updateDerivedState(state.inputUsername, state.indexDBAccounts);
	}, [
		state.inputUsername,
		state.indexDBAccounts,
		updateDerivedState
	]);
	return {
		...state,
		setInputUsername,
		refreshAccountData
	};
}

//#endregion
exports.useAccountInput = useAccountInput;
//# sourceMappingURL=useAccountInput.js.map