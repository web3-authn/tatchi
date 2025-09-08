
//#region src/wasm_vrf_worker/wasm_vrf_worker.js
let wasm;
function addToExternrefTable0(obj) {
	const idx = wasm.__externref_table_alloc();
	wasm.__wbindgen_export_2.set(idx, obj);
	return idx;
}
function handleError(f, args) {
	try {
		return f.apply(this, args);
	} catch (e) {
		const idx = addToExternrefTable0(e);
		wasm.__wbindgen_exn_store(idx);
	}
}
const cachedTextDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", {
	ignoreBOM: true,
	fatal: true
}) : { decode: () => {
	throw Error("TextDecoder not available");
} };
if (typeof TextDecoder !== "undefined") cachedTextDecoder.decode();
let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
	if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
	return cachedUint8ArrayMemory0;
}
function getStringFromWasm0(ptr, len) {
	ptr = ptr >>> 0;
	return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}
let WASM_VECTOR_LEN = 0;
const cachedTextEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder("utf-8") : { encode: () => {
	throw Error("TextEncoder not available");
} };
const encodeString = typeof cachedTextEncoder.encodeInto === "function" ? function(arg, view) {
	return cachedTextEncoder.encodeInto(arg, view);
} : function(arg, view) {
	const buf = cachedTextEncoder.encode(arg);
	view.set(buf);
	return {
		read: arg.length,
		written: buf.length
	};
};
function passStringToWasm0(arg, malloc, realloc) {
	if (realloc === void 0) {
		const buf = cachedTextEncoder.encode(arg);
		const ptr$1 = malloc(buf.length, 1) >>> 0;
		getUint8ArrayMemory0().subarray(ptr$1, ptr$1 + buf.length).set(buf);
		WASM_VECTOR_LEN = buf.length;
		return ptr$1;
	}
	let len = arg.length;
	let ptr = malloc(len, 1) >>> 0;
	const mem = getUint8ArrayMemory0();
	let offset = 0;
	for (; offset < len; offset++) {
		const code = arg.charCodeAt(offset);
		if (code > 127) break;
		mem[ptr + offset] = code;
	}
	if (offset !== len) {
		if (offset !== 0) arg = arg.slice(offset);
		ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
		const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
		const ret = encodeString(arg, view);
		offset += ret.written;
		ptr = realloc(ptr, len, offset, 1) >>> 0;
	}
	WASM_VECTOR_LEN = offset;
	return ptr;
}
let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
	if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || cachedDataViewMemory0.buffer.detached === void 0 && cachedDataViewMemory0.buffer !== wasm.memory.buffer) cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
	return cachedDataViewMemory0;
}
function isLikeNone(x) {
	return x === void 0 || x === null;
}
const CLOSURE_DTORS = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((state) => {
	wasm.__wbindgen_export_6.get(state.dtor)(state.a, state.b);
});
function makeMutClosure(arg0, arg1, dtor, f) {
	const state = {
		a: arg0,
		b: arg1,
		cnt: 1,
		dtor
	};
	const real = (...args) => {
		state.cnt++;
		const a = state.a;
		state.a = 0;
		try {
			return f(a, state.b, ...args);
		} finally {
			if (--state.cnt === 0) {
				wasm.__wbindgen_export_6.get(state.dtor)(a, state.b);
				CLOSURE_DTORS.unregister(state);
			} else state.a = a;
		}
	};
	real.original = state;
	CLOSURE_DTORS.register(real, state, state);
	return real;
}
function debugString(val) {
	const type = typeof val;
	if (type == "number" || type == "boolean" || val == null) return `${val}`;
	if (type == "string") return `"${val}"`;
	if (type == "symbol") {
		const description = val.description;
		if (description == null) return "Symbol";
		else return `Symbol(${description})`;
	}
	if (type == "function") {
		const name = val.name;
		if (typeof name == "string" && name.length > 0) return `Function(${name})`;
		else return "Function";
	}
	if (Array.isArray(val)) {
		const length = val.length;
		let debug = "[";
		if (length > 0) debug += debugString(val[0]);
		for (let i = 1; i < length; i++) debug += ", " + debugString(val[i]);
		debug += "]";
		return debug;
	}
	const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
	let className;
	if (builtInMatches && builtInMatches.length > 1) className = builtInMatches[1];
	else return toString.call(val);
	if (className == "Object") try {
		return "Object(" + JSON.stringify(val) + ")";
	} catch (_) {
		return "Object";
	}
	if (val instanceof Error) return `${val.name}: ${val.message}\n${val.stack}`;
	return className;
}
/**
* @returns {string}
*/
function get_shamir_p_b64u() {
	let deferred1_0;
	let deferred1_1;
	try {
		const ret = wasm.get_shamir_p_b64u();
		deferred1_0 = ret[0];
		deferred1_1 = ret[1];
		return getStringFromWasm0(ret[0], ret[1]);
	} finally {
		wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
	}
}
/**
* @returns {string}
*/
function SHAMIR_P_B64U() {
	let deferred1_0;
	let deferred1_1;
	try {
		const ret = wasm.SHAMIR_P_B64U();
		deferred1_0 = ret[0];
		deferred1_1 = ret[1];
		return getStringFromWasm0(ret[0], ret[1]);
	} finally {
		wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
	}
}
function takeFromExternrefTable0(idx) {
	const value = wasm.__wbindgen_export_2.get(idx);
	wasm.__externref_table_dealloc(idx);
	return value;
}
/**
* Configure Shamir P at runtime (global manager instance)
* @param {string} p_b64u
*/
function configure_shamir_p(p_b64u) {
	const ptr0 = passStringToWasm0(p_b64u, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
	const len0 = WASM_VECTOR_LEN;
	const ret = wasm.configure_shamir_p(ptr0, len0);
	if (ret[1]) throw takeFromExternrefTable0(ret[0]);
}
/**
* @param {any} message
* @returns {Promise<any>}
*/
function handle_message(message) {
	const ret = wasm.handle_message(message);
	return ret;
}
function __wbg_adapter_28(arg0, arg1, arg2) {
	wasm.closure119_externref_shim(arg0, arg1, arg2);
}
function __wbg_adapter_205(arg0, arg1, arg2, arg3) {
	wasm.closure183_externref_shim(arg0, arg1, arg2, arg3);
}
/**
* @enum {0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13}
*/
const WorkerRequestType = Object.freeze({
	Ping: 0,
	"0": "Ping",
	GenerateVrfChallenge: 1,
	"1": "GenerateVrfChallenge",
	GenerateVrfKeypairBootstrap: 2,
	"2": "GenerateVrfKeypairBootstrap",
	UnlockVrfKeypair: 3,
	"3": "UnlockVrfKeypair",
	CheckVrfStatus: 4,
	"4": "CheckVrfStatus",
	Logout: 5,
	"5": "Logout",
	DeriveVrfKeypairFromPrf: 6,
	"6": "DeriveVrfKeypairFromPrf",
	Shamir3PassClientEncryptCurrentVrfKeypair: 7,
	"7": "Shamir3PassClientEncryptCurrentVrfKeypair",
	Shamir3PassClientDecryptVrfKeypair: 8,
	"8": "Shamir3PassClientDecryptVrfKeypair",
	Shamir3PassGenerateServerKeypair: 9,
	"9": "Shamir3PassGenerateServerKeypair",
	Shamir3PassApplyServerLock: 10,
	"10": "Shamir3PassApplyServerLock",
	Shamir3PassRemoveServerLock: 11,
	"11": "Shamir3PassRemoveServerLock",
	Shamir3PassConfigP: 12,
	"12": "Shamir3PassConfigP",
	Shamir3PassConfigServerUrls: 13,
	"13": "Shamir3PassConfigServerUrls"
});
/**
* Worker response types enum - corresponds to TypeScript WorkerResponseType
* @enum {0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13}
*/
const WorkerResponseType = Object.freeze({
	PingSuccess: 0,
	"0": "PingSuccess",
	GenerateVrfChallengeSuccess: 1,
	"1": "GenerateVrfChallengeSuccess",
	GenerateVrfKeypairBootstrapSuccess: 2,
	"2": "GenerateVrfKeypairBootstrapSuccess",
	UnlockVrfKeypairSuccess: 3,
	"3": "UnlockVrfKeypairSuccess",
	CheckVrfStatusSuccess: 4,
	"4": "CheckVrfStatusSuccess",
	LogoutSuccess: 5,
	"5": "LogoutSuccess",
	DeriveVrfKeypairFromPrfSuccess: 6,
	"6": "DeriveVrfKeypairFromPrfSuccess",
	Shamir3PassClientEncryptCurrentVrfKeypairSuccess: 7,
	"7": "Shamir3PassClientEncryptCurrentVrfKeypairSuccess",
	Shamir3PassClientDecryptVrfKeypairSuccess: 8,
	"8": "Shamir3PassClientDecryptVrfKeypairSuccess",
	Shamir3PassGenerateServerKeypairSuccess: 9,
	"9": "Shamir3PassGenerateServerKeypairSuccess",
	Shamir3PassApplyServerLockSuccess: 10,
	"10": "Shamir3PassApplyServerLockSuccess",
	Shamir3PassRemoveServerLockSuccess: 11,
	"11": "Shamir3PassRemoveServerLockSuccess",
	Shamir3PassConfigPSuccess: 12,
	"12": "Shamir3PassConfigPSuccess",
	Shamir3PassConfigServerUrlsSuccess: 13,
	"13": "Shamir3PassConfigServerUrlsSuccess"
});
const DeriveVrfKeypairFromPrfRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_derivevrfkeypairfromprfrequest_free(ptr >>> 0, 1));
const DeterministicVrfKeypairResponseFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_deterministicvrfkeypairresponse_free(ptr >>> 0, 1));
const EncryptedVRFKeypairFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_encryptedvrfkeypair_free(ptr >>> 0, 1));
const GenerateVrfChallengeRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_generatevrfchallengerequest_free(ptr >>> 0, 1));
const GenerateVrfKeypairBootstrapRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_generatevrfkeypairbootstraprequest_free(ptr >>> 0, 1));
const Shamir3PassApplyServerLockRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_shamir3passapplyserverlockrequest_free(ptr >>> 0, 1));
const Shamir3PassClientDecryptVrfKeypairRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_shamir3passclientdecryptvrfkeypairrequest_free(ptr >>> 0, 1));
const Shamir3PassClientEncryptCurrentVrfKeypairRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_shamir3passclientencryptcurrentvrfkeypairrequest_free(ptr >>> 0, 1));
const Shamir3PassConfigPRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_shamir3passconfigprequest_free(ptr >>> 0, 1));
const Shamir3PassConfigServerUrlsRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_shamir3passconfigserverurlsrequest_free(ptr >>> 0, 1));
const Shamir3PassEncryptVrfKeypairResultFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_shamir3passencryptvrfkeypairresult_free(ptr >>> 0, 1));
const Shamir3PassGenerateServerKeypairRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_shamir3passgenerateserverkeypairrequest_free(ptr >>> 0, 1));
const Shamir3PassRemoveServerLockRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_shamir3passremoveserverlockrequest_free(ptr >>> 0, 1));
const ShamirApplyServerLockHTTPRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_shamirapplyserverlockhttprequest_free(ptr >>> 0, 1));
const ShamirApplyServerLockHTTPResponseFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_shamirapplyserverlockhttpresponse_free(ptr >>> 0, 1));
const ShamirRemoveServerLockHTTPRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_shamirremoveserverlockhttprequest_free(ptr >>> 0, 1));
const ShamirRemoveServerLockHTTPResponseFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_shamirremoveserverlockhttpresponse_free(ptr >>> 0, 1));
const UnlockVrfKeypairRequestFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_unlockvrfkeypairrequest_free(ptr >>> 0, 1));
const VRFChallengeDataFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_vrfchallengedata_free(ptr >>> 0, 1));
const VRFInputDataFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_vrfinputdata_free(ptr >>> 0, 1));
async function __wbg_load(module$1, imports) {
	if (typeof Response === "function" && module$1 instanceof Response) {
		if (typeof WebAssembly.instantiateStreaming === "function") try {
			return await WebAssembly.instantiateStreaming(module$1, imports);
		} catch (e) {
			if (module$1.headers.get("Content-Type") != "application/wasm") console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
			else throw e;
		}
		const bytes = await module$1.arrayBuffer();
		return await WebAssembly.instantiate(bytes, imports);
	} else {
		const instance = await WebAssembly.instantiate(module$1, imports);
		if (instance instanceof WebAssembly.Instance) return {
			instance,
			module: module$1
		};
		else return instance;
	}
}
function __wbg_get_imports() {
	const imports = {};
	imports.wbg = {};
	imports.wbg.__wbg_buffer_609cc3eee51ed158 = function(arg0) {
		const ret = arg0.buffer;
		return ret;
	};
	imports.wbg.__wbg_call_672a4d21634d4a24 = function() {
		return handleError(function(arg0, arg1) {
			const ret = arg0.call(arg1);
			return ret;
		}, arguments);
	};
	imports.wbg.__wbg_call_7cccdd69e0791ae2 = function() {
		return handleError(function(arg0, arg1, arg2) {
			const ret = arg0.call(arg1, arg2);
			return ret;
		}, arguments);
	};
	imports.wbg.__wbg_crypto_574e78ad8b13b65f = function(arg0) {
		const ret = arg0.crypto;
		return ret;
	};
	imports.wbg.__wbg_debug_e17b51583ca6a632 = function(arg0, arg1, arg2, arg3) {
		console.debug(arg0, arg1, arg2, arg3);
	};
	imports.wbg.__wbg_error_524f506f44df1645 = function(arg0) {
		console.error(arg0);
	};
	imports.wbg.__wbg_error_7534b8e9a36f1ab4 = function(arg0, arg1) {
		let deferred0_0;
		let deferred0_1;
		try {
			deferred0_0 = arg0;
			deferred0_1 = arg1;
			console.error(getStringFromWasm0(arg0, arg1));
		} finally {
			wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
		}
	};
	imports.wbg.__wbg_error_80de38b3f7cc3c3c = function(arg0, arg1, arg2, arg3) {
		console.error(arg0, arg1, arg2, arg3);
	};
	imports.wbg.__wbg_fetch_b7bf320f681242d2 = function(arg0, arg1) {
		const ret = arg0.fetch(arg1);
		return ret;
	};
	imports.wbg.__wbg_getRandomValues_b8f5dbd5f3995a9e = function() {
		return handleError(function(arg0, arg1) {
			arg0.getRandomValues(arg1);
		}, arguments);
	};
	imports.wbg.__wbg_get_67b2ba62fc30de12 = function() {
		return handleError(function(arg0, arg1) {
			const ret = Reflect.get(arg0, arg1);
			return ret;
		}, arguments);
	};
	imports.wbg.__wbg_info_033d8b8a0838f1d3 = function(arg0, arg1, arg2, arg3) {
		console.info(arg0, arg1, arg2, arg3);
	};
	imports.wbg.__wbg_instanceof_Response_f2cc20d9f7dfd644 = function(arg0) {
		let result;
		try {
			result = arg0 instanceof Response;
		} catch (_) {
			result = false;
		}
		const ret = result;
		return ret;
	};
	imports.wbg.__wbg_instanceof_Window_def73ea0955fc569 = function(arg0) {
		let result;
		try {
			result = arg0 instanceof Window;
		} catch (_) {
			result = false;
		}
		const ret = result;
		return ret;
	};
	imports.wbg.__wbg_log_cad59bb680daec67 = function(arg0, arg1, arg2, arg3) {
		console.log(arg0, arg1, arg2, arg3);
	};
	imports.wbg.__wbg_msCrypto_a61aeb35a24c1329 = function(arg0) {
		const ret = arg0.msCrypto;
		return ret;
	};
	imports.wbg.__wbg_new_018dcc2d6c8c2f6a = function() {
		return handleError(function() {
			const ret = new Headers();
			return ret;
		}, arguments);
	};
	imports.wbg.__wbg_new_23a2665fac83c611 = function(arg0, arg1) {
		try {
			var state0 = {
				a: arg0,
				b: arg1
			};
			var cb0 = (arg0$1, arg1$1) => {
				const a = state0.a;
				state0.a = 0;
				try {
					return __wbg_adapter_205(a, state0.b, arg0$1, arg1$1);
				} finally {
					state0.a = a;
				}
			};
			const ret = new Promise(cb0);
			return ret;
		} finally {
			state0.a = state0.b = 0;
		}
	};
	imports.wbg.__wbg_new_405e22f390576ce2 = function() {
		const ret = /* @__PURE__ */ new Object();
		return ret;
	};
	imports.wbg.__wbg_new_8a6f238a6ece86ea = function() {
		const ret = /* @__PURE__ */ new Error();
		return ret;
	};
	imports.wbg.__wbg_new_a12002a7f91c75be = function(arg0) {
		const ret = new Uint8Array(arg0);
		return ret;
	};
	imports.wbg.__wbg_newnoargs_105ed471475aaf50 = function(arg0, arg1) {
		const ret = new Function(getStringFromWasm0(arg0, arg1));
		return ret;
	};
	imports.wbg.__wbg_newwithbyteoffsetandlength_d97e637ebe145a9a = function(arg0, arg1, arg2) {
		const ret = new Uint8Array(arg0, arg1 >>> 0, arg2 >>> 0);
		return ret;
	};
	imports.wbg.__wbg_newwithlength_a381634e90c276d4 = function(arg0) {
		const ret = new Uint8Array(arg0 >>> 0);
		return ret;
	};
	imports.wbg.__wbg_newwithstrandinit_06c535e0a867c635 = function() {
		return handleError(function(arg0, arg1, arg2) {
			const ret = new Request(getStringFromWasm0(arg0, arg1), arg2);
			return ret;
		}, arguments);
	};
	imports.wbg.__wbg_node_905d3e251edff8a2 = function(arg0) {
		const ret = arg0.node;
		return ret;
	};
	imports.wbg.__wbg_now_807e54c39636c349 = function() {
		const ret = Date.now();
		return ret;
	};
	imports.wbg.__wbg_ok_3aaf32d069979723 = function(arg0) {
		const ret = arg0.ok;
		return ret;
	};
	imports.wbg.__wbg_parse_31e8e5bc0216ac4b = function(arg0, arg1) {
		const ret = JSON.parse(getStringFromWasm0(arg0, arg1));
		return ret;
	};
	imports.wbg.__wbg_process_dc0fbacc7c1c06f7 = function(arg0) {
		const ret = arg0.process;
		return ret;
	};
	imports.wbg.__wbg_queueMicrotask_97d92b4fcc8a61c5 = function(arg0) {
		queueMicrotask(arg0);
	};
	imports.wbg.__wbg_queueMicrotask_d3219def82552485 = function(arg0) {
		const ret = arg0.queueMicrotask;
		return ret;
	};
	imports.wbg.__wbg_randomFillSync_ac0988aba3254290 = function() {
		return handleError(function(arg0, arg1) {
			arg0.randomFillSync(arg1);
		}, arguments);
	};
	imports.wbg.__wbg_require_60cc747a6bc5215a = function() {
		return handleError(function() {
			const ret = module.require;
			return ret;
		}, arguments);
	};
	imports.wbg.__wbg_resolve_4851785c9c5f573d = function(arg0) {
		const ret = Promise.resolve(arg0);
		return ret;
	};
	imports.wbg.__wbg_set_11cd83f45504cedf = function() {
		return handleError(function(arg0, arg1, arg2, arg3, arg4) {
			arg0.set(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
		}, arguments);
	};
	imports.wbg.__wbg_set_65595bdd868b3009 = function(arg0, arg1, arg2) {
		arg0.set(arg1, arg2 >>> 0);
	};
	imports.wbg.__wbg_setbody_5923b78a95eedf29 = function(arg0, arg1) {
		arg0.body = arg1;
	};
	imports.wbg.__wbg_setheaders_834c0bdb6a8949ad = function(arg0, arg1) {
		arg0.headers = arg1;
	};
	imports.wbg.__wbg_setmethod_3c5280fe5d890842 = function(arg0, arg1, arg2) {
		arg0.method = getStringFromWasm0(arg1, arg2);
	};
	imports.wbg.__wbg_stack_0ed75d68575b0f3c = function(arg0, arg1) {
		const ret = arg1.stack;
		const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
		const len1 = WASM_VECTOR_LEN;
		getDataViewMemory0().setInt32(arg0 + 4, len1, true);
		getDataViewMemory0().setInt32(arg0 + 0, ptr1, true);
	};
	imports.wbg.__wbg_static_accessor_GLOBAL_88a902d13a557d07 = function() {
		const ret = typeof global === "undefined" ? null : global;
		return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
	};
	imports.wbg.__wbg_static_accessor_GLOBAL_THIS_56578be7e9f832b0 = function() {
		const ret = typeof globalThis === "undefined" ? null : globalThis;
		return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
	};
	imports.wbg.__wbg_static_accessor_SELF_37c5d418e4bf5819 = function() {
		const ret = typeof self === "undefined" ? null : self;
		return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
	};
	imports.wbg.__wbg_static_accessor_WINDOW_5de37043a91a9c40 = function() {
		const ret = typeof window === "undefined" ? null : window;
		return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
	};
	imports.wbg.__wbg_statusText_207754230b39e67c = function(arg0, arg1) {
		const ret = arg1.statusText;
		const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
		const len1 = WASM_VECTOR_LEN;
		getDataViewMemory0().setInt32(arg0 + 4, len1, true);
		getDataViewMemory0().setInt32(arg0 + 0, ptr1, true);
	};
	imports.wbg.__wbg_status_f6360336ca686bf0 = function(arg0) {
		const ret = arg0.status;
		return ret;
	};
	imports.wbg.__wbg_stringify_c98a90896b212007 = function(arg0) {
		const ret = JSON.stringify(arg0);
		return ret;
	};
	imports.wbg.__wbg_subarray_aa9065fa9dc5df96 = function(arg0, arg1, arg2) {
		const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
		return ret;
	};
	imports.wbg.__wbg_text_7805bea50de2af49 = function() {
		return handleError(function(arg0) {
			const ret = arg0.text();
			return ret;
		}, arguments);
	};
	imports.wbg.__wbg_then_44b73946d2fb3e7d = function(arg0, arg1) {
		const ret = arg0.then(arg1);
		return ret;
	};
	imports.wbg.__wbg_then_48b406749878a531 = function(arg0, arg1, arg2) {
		const ret = arg0.then(arg1, arg2);
		return ret;
	};
	imports.wbg.__wbg_versions_c01dfd4722a88165 = function(arg0) {
		const ret = arg0.versions;
		return ret;
	};
	imports.wbg.__wbg_warn_aaf1f4664a035bd6 = function(arg0, arg1, arg2, arg3) {
		console.warn(arg0, arg1, arg2, arg3);
	};
	imports.wbg.__wbindgen_cb_drop = function(arg0) {
		const obj = arg0.original;
		if (obj.cnt-- == 1) {
			obj.a = 0;
			return true;
		}
		const ret = false;
		return ret;
	};
	imports.wbg.__wbindgen_closure_wrapper689 = function(arg0, arg1, arg2) {
		const ret = makeMutClosure(arg0, arg1, 120, __wbg_adapter_28);
		return ret;
	};
	imports.wbg.__wbindgen_debug_string = function(arg0, arg1) {
		const ret = debugString(arg1);
		const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
		const len1 = WASM_VECTOR_LEN;
		getDataViewMemory0().setInt32(arg0 + 4, len1, true);
		getDataViewMemory0().setInt32(arg0 + 0, ptr1, true);
	};
	imports.wbg.__wbindgen_init_externref_table = function() {
		const table = wasm.__wbindgen_export_2;
		const offset = table.grow(4);
		table.set(0, void 0);
		table.set(offset + 0, void 0);
		table.set(offset + 1, null);
		table.set(offset + 2, true);
		table.set(offset + 3, false);
	};
	imports.wbg.__wbindgen_is_function = function(arg0) {
		const ret = typeof arg0 === "function";
		return ret;
	};
	imports.wbg.__wbindgen_is_object = function(arg0) {
		const val = arg0;
		const ret = typeof val === "object" && val !== null;
		return ret;
	};
	imports.wbg.__wbindgen_is_string = function(arg0) {
		const ret = typeof arg0 === "string";
		return ret;
	};
	imports.wbg.__wbindgen_is_undefined = function(arg0) {
		const ret = arg0 === void 0;
		return ret;
	};
	imports.wbg.__wbindgen_memory = function() {
		const ret = wasm.memory;
		return ret;
	};
	imports.wbg.__wbindgen_string_get = function(arg0, arg1) {
		const obj = arg1;
		const ret = typeof obj === "string" ? obj : void 0;
		var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
		var len1 = WASM_VECTOR_LEN;
		getDataViewMemory0().setInt32(arg0 + 4, len1, true);
		getDataViewMemory0().setInt32(arg0 + 0, ptr1, true);
	};
	imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
		const ret = getStringFromWasm0(arg0, arg1);
		return ret;
	};
	imports.wbg.__wbindgen_throw = function(arg0, arg1) {
		throw new Error(getStringFromWasm0(arg0, arg1));
	};
	return imports;
}
function __wbg_init_memory(imports, memory) {}
function __wbg_finalize_init(instance, module$1) {
	wasm = instance.exports;
	__wbg_init.__wbindgen_wasm_module = module$1;
	cachedDataViewMemory0 = null;
	cachedUint8ArrayMemory0 = null;
	wasm.__wbindgen_start();
	return wasm;
}
async function __wbg_init(module_or_path) {
	if (wasm !== void 0) return wasm;
	if (typeof module_or_path !== "undefined") if (Object.getPrototypeOf(module_or_path) === Object.prototype) ({module_or_path} = module_or_path);
	else console.warn("using deprecated parameters for the initialization function; pass a single object instead");
	if (typeof module_or_path === "undefined") module_or_path = new URL("wasm_vrf_worker_bg.wasm", require("url").pathToFileURL(__filename).href);
	const imports = __wbg_get_imports();
	if (typeof module_or_path === "string" || typeof Request === "function" && module_or_path instanceof Request || typeof URL === "function" && module_or_path instanceof URL) module_or_path = fetch(module_or_path);
	__wbg_init_memory(imports);
	const { instance, module: module$1 } = await __wbg_load(await module_or_path, imports);
	return __wbg_finalize_init(instance, module$1);
}
var wasm_vrf_worker_default = __wbg_init;

//#endregion
exports.SHAMIR_P_B64U = SHAMIR_P_B64U;
exports.configure_shamir_p = configure_shamir_p;
exports.default = wasm_vrf_worker_default;
exports.get_shamir_p_b64u = get_shamir_p_b64u;
exports.handle_message = handle_message;
//# sourceMappingURL=wasm_vrf_worker.js.map