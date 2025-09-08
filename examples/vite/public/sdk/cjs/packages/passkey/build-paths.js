
//#region build-paths.ts
const BUILD_PATHS = {
	BUILD: {
		ROOT: "dist",
		WORKERS: "dist/workers",
		ESM: "dist/esm",
		CJS: "dist/cjs",
		TYPES: "dist/types"
	},
	SOURCE: {
		ROOT: "src",
		CORE: "src/core",
		WASM_SIGNER: "src/wasm_signer_worker",
		WASM_VRF: "src/wasm_vrf_worker",
		CRITICAL_DIRS: [
			"src/core",
			"src/wasm_signer_worker",
			"src/wasm_vrf_worker"
		]
	},
	FRONTEND: {
		ROOT: "../../frontend/public",
		SDK: "../../frontend/public/sdk",
		WORKERS: "../../frontend/public/sdk/workers"
	},
	RUNTIME: {
		SDK_BASE: "/sdk",
		WORKERS_BASE: "/sdk/workers",
		VRF_WORKER: "/sdk/workers/web3authn-vrf.worker.js",
		SIGNER_WORKER: "/sdk/workers/web3authn-signer.worker.js"
	},
	WORKERS: {
		VRF: "web3authn-vrf.worker.js",
		SIGNER: "web3authn-signer.worker.js",
		WASM_VRF_JS: "wasm_vrf_worker.js",
		WASM_VRF_WASM: "wasm_vrf_worker_bg.wasm",
		WASM_SIGNER_JS: "wasm_signer_worker.js",
		WASM_SIGNER_WASM: "wasm_signer_worker_bg.wasm"
	},
	TEST_WORKERS: {
		VRF: "/sdk/workers/web3authn-vrf.worker.js",
		SIGNER: "/sdk/workers/web3authn-signer.worker.js",
		WASM_VRF_JS: "/sdk/workers/wasm_vrf_worker.js",
		WASM_VRF_WASM: "/sdk/workers/wasm_vrf_worker_bg.wasm",
		WASM_SIGNER_JS: "/sdk/workers/wasm_signer_worker.js",
		WASM_SIGNER_WASM: "/sdk/workers/wasm_signer_worker_bg.wasm"
	}
};

//#endregion
exports.BUILD_PATHS = BUILD_PATHS;
//# sourceMappingURL=build-paths.js.map