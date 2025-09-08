const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_wasm_vrf_worker = require('../wasm_vrf_worker/wasm_vrf_worker.js');
let fs = require("fs");
fs = require_rolldown_runtime.__toESM(fs);
let url = require("url");
url = require_rolldown_runtime.__toESM(url);
let path = require("path");
path = require_rolldown_runtime.__toESM(path);

//#region src/server/core/shamirWorker.ts
let wasmInitialized = false;
async function ensureWasmInitialized() {
	if (wasmInitialized) return;
	const __filename$1 = (0, url.fileURLToPath)(require("url").pathToFileURL(__filename).href);
	const __dirname$1 = (0, path.dirname)(__filename$1);
	const candidates = [
		(0, path.join)(__dirname$1, "../../wasm_vrf_worker/wasm_vrf_worker_bg.wasm"),
		(0, path.join)(__dirname$1, "../wasm_vrf_worker/wasm_vrf_worker_bg.wasm"),
		(0, path.join)(__dirname$1, "../../../src/wasm_vrf_worker/wasm_vrf_worker_bg.wasm"),
		(0, path.join)(__dirname$1, "../../../../src/wasm_vrf_worker/wasm_vrf_worker_bg.wasm"),
		(0, path.join)(__dirname$1, "../../../../../src/wasm_vrf_worker/wasm_vrf_worker_bg.wasm"),
		(0, path.join)(__dirname$1, "../../../../../../packages/passkey/src/wasm_vrf_worker/wasm_vrf_worker_bg.wasm")
	];
	let bytes;
	for (const p of candidates) try {
		bytes = (0, fs.readFileSync)(p);
		break;
	} catch {}
	if (!bytes) throw new Error("Could not find WASM file for Shamir3Pass");
	await require_wasm_vrf_worker.default({ module_or_path: bytes });
	wasmInitialized = true;
}
var Shamir3PassUtils = class {
	p_b64u;
	e_s_b64u;
	d_s_b64u;
	constructor(opts) {
		this.p_b64u = opts.p_b64u ?? "";
		this.e_s_b64u = opts.e_s_b64u ?? "";
		this.d_s_b64u = opts.d_s_b64u ?? "";
	}
	async initialize() {
		await ensureWasmInitialized();
		if (!this.p_b64u) {
			console.log("No p_b64u provided, using default");
			let default_p_b64u = await getShamirPB64uFromWasm();
			this.p_b64u = default_p_b64u;
		}
		await require_wasm_vrf_worker.configure_shamir_p(this.p_b64u);
		return { p_b64u: this.p_b64u };
	}
	async generateServerKeypair() {
		await ensureWasmInitialized();
		const msg = {
			type: "SHAMIR3PASS_GENERATE_SERVER_KEYPAIR",
			id: `srv_${Date.now()}`,
			payload: {}
		};
		const res = await require_wasm_vrf_worker.handle_message(msg);
		if (!res?.success) throw new Error(res?.error || "generateServerKeypair failed");
		return {
			e_s_b64u: res.data.e_s_b64u,
			d_s_b64u: res.data.d_s_b64u
		};
	}
	async applyServerLock(req) {
		await ensureWasmInitialized();
		if (!this.e_s_b64u) throw new Error("Server exponent e_s_b64u not configured");
		const msg = {
			type: "SHAMIR3PASS_APPLY_SERVER_LOCK_KEK",
			id: `srv_${Date.now()}`,
			payload: {
				e_s_b64u: this.e_s_b64u,
				kek_c_b64u: req.kek_c_b64u
			}
		};
		const res = await require_wasm_vrf_worker.handle_message(msg);
		if (!res?.success) throw new Error(res?.error || "applyServerLock failed");
		return { kek_cs_b64u: res.data.kek_cs_b64u };
	}
	async removeServerLock(req) {
		await ensureWasmInitialized();
		if (!this.d_s_b64u) throw new Error("Server exponent d_s_b64u not configured");
		const msg = {
			type: "SHAMIR3PASS_REMOVE_SERVER_LOCK_KEK",
			id: `srv_${Date.now()}`,
			payload: {
				d_s_b64u: this.d_s_b64u,
				kek_cs_b64u: req.kek_cs_b64u
			}
		};
		const res = await require_wasm_vrf_worker.handle_message(msg);
		if (!res?.success) throw new Error(res?.error || "removeServerLock failed");
		return { kek_c_b64u: res.data.kek_c_b64u };
	}
};
async function getShamirPB64uFromWasm() {
	await ensureWasmInitialized();
	return require_wasm_vrf_worker.get_shamir_p_b64u();
}

//#endregion
exports.Shamir3PassUtils = Shamir3PassUtils;
exports.getShamirPB64uFromWasm = getShamirPB64uFromWasm;
//# sourceMappingURL=shamirWorker.js.map