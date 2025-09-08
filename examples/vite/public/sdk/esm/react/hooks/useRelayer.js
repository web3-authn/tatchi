import { useCallback, useState } from "react";

//#region src/react/hooks/useRelayer.ts
/**
* Hook for managing relayer usage state
*
* @param options - Configuration options
* @returns Object with relayer state and setters
*/
function useRelayer(options = {}) {
	const { initialValue = false } = options;
	const [useRelayer$1, setUseRelayer] = useState(initialValue);
	const toggleRelayer = useCallback(() => {
		setUseRelayer((prev) => !prev);
	}, []);
	return {
		useRelayer: useRelayer$1,
		setUseRelayer,
		toggleRelayer
	};
}

//#endregion
export { useRelayer };
//# sourceMappingURL=useRelayer.js.map