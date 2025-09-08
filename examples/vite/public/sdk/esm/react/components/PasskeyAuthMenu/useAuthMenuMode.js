import React from "react";

//#region src/react/components/PasskeyAuthMenu/useAuthMenuMode.ts
function useAuthMenuMode({ defaultMode, accountExists, passkeyManager, currentValue, setCurrentValue }) {
	const preferredDefaultMode = defaultMode ?? (accountExists ? "login" : "register");
	const [mode, setMode] = React.useState(preferredDefaultMode);
	const [title, setTitle] = React.useState({
		title: "",
		subtitle: ""
	});
	const prefilledFromIdbRef = React.useRef(false);
	const prefilledValueRef = React.useRef("");
	const prevModeRef = React.useRef(null);
	React.useEffect(() => {
		let cancelled = false;
		const enteringLogin = mode === "login" && prevModeRef.current !== "login";
		if (enteringLogin && passkeyManager) (async () => {
			try {
				const { lastUsedAccountId } = await passkeyManager.getRecentLogins();
				if (!cancelled && lastUsedAccountId) {
					const username = (lastUsedAccountId.nearAccountId || "").split(".")[0] || "";
					if (!currentValue || currentValue.trim().length === 0) {
						setCurrentValue(username);
						prefilledFromIdbRef.current = true;
						prefilledValueRef.current = username;
					}
				}
			} catch {}
		})();
		prevModeRef.current = mode;
		return () => {
			cancelled = true;
		};
	}, [
		mode,
		passkeyManager,
		currentValue,
		setCurrentValue
	]);
	const getTitleForMode = (mode$1) => {
		if (mode$1 === "login") return {
			title: "Login",
			subtitle: "Fast passwordless, keyless login"
		};
		else if (mode$1 === "register") return {
			title: "Register Account",
			subtitle: "Create a wallet with a Passkey"
		};
		else if (mode$1 === "recover") return {
			title: "Recover Account",
			subtitle: "Restore a wallet with Passkey"
		};
		else return {
			title: "Login",
			subtitle: "Fast passwordless, keyless login"
		};
	};
	React.useEffect(() => {
		setTitle(getTitleForMode(mode));
	}, [mode]);
	const onSegmentChange = (nextMode) => {
		if (mode === "login" && nextMode !== "login") {
			if (prefilledFromIdbRef.current && currentValue === prefilledValueRef.current) setCurrentValue("");
			prefilledFromIdbRef.current = false;
			prefilledValueRef.current = "";
		}
		setMode(nextMode);
		setTitle(getTitleForMode(nextMode));
	};
	const onInputChange = (val) => {
		if (val !== prefilledValueRef.current) prefilledFromIdbRef.current = false;
		setCurrentValue(val);
	};
	const resetToDefault = () => {
		setMode(accountExists ? "login" : "register");
		setTitle(getTitleForMode(mode));
		prefilledFromIdbRef.current = false;
		prefilledValueRef.current = "";
	};
	return {
		mode,
		setMode,
		title,
		onSegmentChange,
		onInputChange,
		resetToDefault
	};
}

//#endregion
export { useAuthMenuMode };
//# sourceMappingURL=useAuthMenuMode.js.map