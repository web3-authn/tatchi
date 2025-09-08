import { MinimalNearClient } from "../packages/passkey/src/core/NearClient.js";
import { PASSKEY_MANAGER_DEFAULT_CONFIGS } from "../context/index.js";
import { useMemo } from "react";

//#region src/react/hooks/useNearClient.ts
const useNearClient = (rpcNodeURL = PASSKEY_MANAGER_DEFAULT_CONFIGS.nearRpcUrl) => {
	const nearClient = useMemo(() => {
		return new MinimalNearClient(rpcNodeURL);
	}, [rpcNodeURL]);
	return nearClient;
};

//#endregion
export { useNearClient };
//# sourceMappingURL=useNearClient.js.map