const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);

//#region src/react/hooks/useRelayer.ts
/**
* Hook for managing relayer usage state
*
* @param options - Configuration options
* @returns Object with relayer state and setters
*/
function useRelayer(options = {}) {
	const { initialValue = false } = options;
	const [useRelayer$1, setUseRelayer] = (0, react.useState)(initialValue);
	const toggleRelayer = (0, react.useCallback)(() => {
		setUseRelayer((prev) => !prev);
	}, []);
	return {
		useRelayer: useRelayer$1,
		setUseRelayer,
		toggleRelayer
	};
}

//#endregion
exports.useRelayer = useRelayer;
//# sourceMappingURL=useRelayer.js.map