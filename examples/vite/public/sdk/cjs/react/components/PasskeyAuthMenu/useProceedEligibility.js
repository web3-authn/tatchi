
//#region src/react/components/PasskeyAuthMenu/useProceedEligibility.ts
function useProceedEligibility({ mode, currentValue, accountExists, secure }) {
	const canShowContinue = mode === "register" ? currentValue.length > 0 && !accountExists : mode === "login" ? currentValue.length > 0 && !!accountExists : currentValue.trim().length > 0;
	const canSubmit = mode === "register" ? currentValue.length > 0 && secure && !accountExists : mode === "login" ? currentValue.length > 0 && !!accountExists : currentValue.trim().length > 0;
	return {
		canShowContinue,
		canSubmit
	};
}

//#endregion
exports.useProceedEligibility = useProceedEligibility;
//# sourceMappingURL=useProceedEligibility.js.map