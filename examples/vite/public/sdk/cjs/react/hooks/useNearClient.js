const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_NearClient = require('../packages/passkey/src/core/NearClient.js');
const require_index = require('../context/index.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);

//#region src/react/hooks/useNearClient.ts
const useNearClient = (rpcNodeURL = require_index.PASSKEY_MANAGER_DEFAULT_CONFIGS.nearRpcUrl) => {
	const nearClient = (0, react.useMemo)(() => {
		return new require_NearClient.MinimalNearClient(rpcNodeURL);
	}, [rpcNodeURL]);
	return nearClient;
};

//#endregion
exports.useNearClient = useNearClient;
//# sourceMappingURL=useNearClient.js.map