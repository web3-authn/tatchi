var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name] = () => newValue
    });
};

// src/wasm_vrf_worker/wasm_vrf_worker.js
var exports_wasm_vrf_worker = {};
__export(exports_wasm_vrf_worker, {
  main: () => main,
  initSync: () => initSync,
  handle_message: () => handle_message,
  get_shamir_p_b64u: () => get_shamir_p_b64u,
  default: () => wasm_vrf_worker_default,
  configure_shamir_server_urls: () => configure_shamir_server_urls,
  configure_shamir_p: () => configure_shamir_p,
  WorkerResponseType: () => WorkerResponseType,
  WorkerRequestType: () => WorkerRequestType,
  VRFInputData: () => VRFInputData,
  VRFChallengeData: () => VRFChallengeData,
  UnlockVrfKeypairRequest: () => UnlockVrfKeypairRequest,
  ShamirRemoveServerLockHTTPResponse: () => ShamirRemoveServerLockHTTPResponse,
  ShamirRemoveServerLockHTTPRequest: () => ShamirRemoveServerLockHTTPRequest,
  ShamirApplyServerLockHTTPResponse: () => ShamirApplyServerLockHTTPResponse,
  ShamirApplyServerLockHTTPRequest: () => ShamirApplyServerLockHTTPRequest,
  Shamir3PassRemoveServerLockRequest: () => Shamir3PassRemoveServerLockRequest,
  Shamir3PassGenerateServerKeypairRequest: () => Shamir3PassGenerateServerKeypairRequest,
  Shamir3PassEncryptVrfKeypairResult: () => Shamir3PassEncryptVrfKeypairResult,
  Shamir3PassConfigServerUrlsRequest: () => Shamir3PassConfigServerUrlsRequest,
  Shamir3PassConfigPRequest: () => Shamir3PassConfigPRequest,
  Shamir3PassClientEncryptCurrentVrfKeypairRequest: () => Shamir3PassClientEncryptCurrentVrfKeypairRequest,
  Shamir3PassClientDecryptVrfKeypairRequest: () => Shamir3PassClientDecryptVrfKeypairRequest,
  Shamir3PassApplyServerLockRequest: () => Shamir3PassApplyServerLockRequest,
  SHAMIR_P_B64U: () => SHAMIR_P_B64U,
  GenerateVrfKeypairBootstrapRequest: () => GenerateVrfKeypairBootstrapRequest,
  GenerateVrfChallengeRequest: () => GenerateVrfChallengeRequest,
  EncryptedVRFKeypair: () => EncryptedVRFKeypair,
  DeterministicVrfKeypairResponse: () => DeterministicVrfKeypairResponse,
  DeriveVrfKeypairFromPrfRequest: () => DeriveVrfKeypairFromPrfRequest
});
var wasm;
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
var cachedTextDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }) : { decode: () => {
  throw Error("TextDecoder not available");
} };
if (typeof TextDecoder !== "undefined") {
  cachedTextDecoder.decode();
}
var cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
  if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
    cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8ArrayMemory0;
}
function getStringFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}
var WASM_VECTOR_LEN = 0;
var cachedTextEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder("utf-8") : { encode: () => {
  throw Error("TextEncoder not available");
} };
var encodeString = typeof cachedTextEncoder.encodeInto === "function" ? function(arg, view) {
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
  if (realloc === undefined) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr2 = malloc(buf.length, 1) >>> 0;
    getUint8ArrayMemory0().subarray(ptr2, ptr2 + buf.length).set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr2;
  }
  let len = arg.length;
  let ptr = malloc(len, 1) >>> 0;
  const mem = getUint8ArrayMemory0();
  let offset = 0;
  for (;offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 127)
      break;
    mem[ptr + offset] = code;
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
    const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
    const ret = encodeString(arg, view);
    offset += ret.written;
    ptr = realloc(ptr, len, offset, 1) >>> 0;
  }
  WASM_VECTOR_LEN = offset;
  return ptr;
}
var cachedDataViewMemory0 = null;
function getDataViewMemory0() {
  if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer) {
    cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
  }
  return cachedDataViewMemory0;
}
function isLikeNone(x) {
  return x === undefined || x === null;
}
var CLOSURE_DTORS = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((state) => {
  wasm.__wbindgen_export_6.get(state.dtor)(state.a, state.b);
});
function makeMutClosure(arg0, arg1, dtor, f) {
  const state = { a: arg0, b: arg1, cnt: 1, dtor };
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
      } else {
        state.a = a;
      }
    }
  };
  real.original = state;
  CLOSURE_DTORS.register(real, state, state);
  return real;
}
function debugString(val) {
  const type = typeof val;
  if (type == "number" || type == "boolean" || val == null) {
    return `${val}`;
  }
  if (type == "string") {
    return `"${val}"`;
  }
  if (type == "symbol") {
    const description = val.description;
    if (description == null) {
      return "Symbol";
    } else {
      return `Symbol(${description})`;
    }
  }
  if (type == "function") {
    const name = val.name;
    if (typeof name == "string" && name.length > 0) {
      return `Function(${name})`;
    } else {
      return "Function";
    }
  }
  if (Array.isArray(val)) {
    const length = val.length;
    let debug = "[";
    if (length > 0) {
      debug += debugString(val[0]);
    }
    for (let i = 1;i < length; i++) {
      debug += ", " + debugString(val[i]);
    }
    debug += "]";
    return debug;
  }
  const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
  let className;
  if (builtInMatches && builtInMatches.length > 1) {
    className = builtInMatches[1];
  } else {
    return toString.call(val);
  }
  if (className == "Object") {
    try {
      return "Object(" + JSON.stringify(val) + ")";
    } catch (_) {
      return "Object";
    }
  }
  if (val instanceof Error) {
    return `${val.name}: ${val.message}
${val.stack}`;
  }
  return className;
}
function _assertClass(instance, klass) {
  if (!(instance instanceof klass)) {
    throw new Error(`expected instance of ${klass.name}`);
  }
}
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
function main() {
  wasm.main();
}
function takeFromExternrefTable0(idx) {
  const value = wasm.__wbindgen_export_2.get(idx);
  wasm.__externref_table_dealloc(idx);
  return value;
}
function configure_shamir_p(p_b64u) {
  const ptr0 = passStringToWasm0(p_b64u, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.configure_shamir_p(ptr0, len0);
  if (ret[1]) {
    throw takeFromExternrefTable0(ret[0]);
  }
}
function configure_shamir_server_urls(relay_server_url, apply_lock_route, remove_lock_route) {
  const ptr0 = passStringToWasm0(relay_server_url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
  const len0 = WASM_VECTOR_LEN;
  const ptr1 = passStringToWasm0(apply_lock_route, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
  const len1 = WASM_VECTOR_LEN;
  const ptr2 = passStringToWasm0(remove_lock_route, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
  const len2 = WASM_VECTOR_LEN;
  const ret = wasm.configure_shamir_server_urls(ptr0, len0, ptr1, len1, ptr2, len2);
  if (ret[1]) {
    throw takeFromExternrefTable0(ret[0]);
  }
}
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
var WorkerRequestType = Object.freeze({
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
var WorkerResponseType = Object.freeze({
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
var DeriveVrfKeypairFromPrfRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_derivevrfkeypairfromprfrequest_free(ptr >>> 0, 1));

class DeriveVrfKeypairFromPrfRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    DeriveVrfKeypairFromPrfRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_derivevrfkeypairfromprfrequest_free(ptr, 0);
  }
  get prfOutput() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_derivevrfkeypairfromprfrequest_prfOutput(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set prfOutput(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_derivevrfkeypairfromprfrequest_prfOutput(this.__wbg_ptr, ptr0, len0);
  }
  get nearAccountId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_derivevrfkeypairfromprfrequest_nearAccountId(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set nearAccountId(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_derivevrfkeypairfromprfrequest_nearAccountId(this.__wbg_ptr, ptr0, len0);
  }
  get saveInMemory() {
    const ret = wasm.__wbg_get_derivevrfkeypairfromprfrequest_saveInMemory(this.__wbg_ptr);
    return ret !== 0;
  }
  set saveInMemory(arg0) {
    wasm.__wbg_set_derivevrfkeypairfromprfrequest_saveInMemory(this.__wbg_ptr, arg0);
  }
  get vrfInputData() {
    const ret = wasm.__wbg_get_derivevrfkeypairfromprfrequest_vrfInputData(this.__wbg_ptr);
    return ret === 0 ? undefined : VRFInputData.__wrap(ret);
  }
  set vrfInputData(arg0) {
    let ptr0 = 0;
    if (!isLikeNone(arg0)) {
      _assertClass(arg0, VRFInputData);
      ptr0 = arg0.__destroy_into_raw();
    }
    wasm.__wbg_set_derivevrfkeypairfromprfrequest_vrfInputData(this.__wbg_ptr, ptr0);
  }
}
var DeterministicVrfKeypairResponseFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_deterministicvrfkeypairresponse_free(ptr >>> 0, 1));

class DeterministicVrfKeypairResponse {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    DeterministicVrfKeypairResponseFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_deterministicvrfkeypairresponse_free(ptr, 0);
  }
  get vrfPublicKey() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_deterministicvrfkeypairresponse_vrfPublicKey(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set vrfPublicKey(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_derivevrfkeypairfromprfrequest_prfOutput(this.__wbg_ptr, ptr0, len0);
  }
  get vrfChallengeData() {
    const ret = wasm.__wbg_get_deterministicvrfkeypairresponse_vrfChallengeData(this.__wbg_ptr);
    return ret === 0 ? undefined : VRFChallengeData.__wrap(ret);
  }
  set vrfChallengeData(arg0) {
    let ptr0 = 0;
    if (!isLikeNone(arg0)) {
      _assertClass(arg0, VRFChallengeData);
      ptr0 = arg0.__destroy_into_raw();
    }
    wasm.__wbg_set_deterministicvrfkeypairresponse_vrfChallengeData(this.__wbg_ptr, ptr0);
  }
  get encryptedVrfKeypair() {
    const ret = wasm.__wbg_get_deterministicvrfkeypairresponse_encryptedVrfKeypair(this.__wbg_ptr);
    return ret === 0 ? undefined : EncryptedVRFKeypair.__wrap(ret);
  }
  set encryptedVrfKeypair(arg0) {
    let ptr0 = 0;
    if (!isLikeNone(arg0)) {
      _assertClass(arg0, EncryptedVRFKeypair);
      ptr0 = arg0.__destroy_into_raw();
    }
    wasm.__wbg_set_deterministicvrfkeypairresponse_encryptedVrfKeypair(this.__wbg_ptr, ptr0);
  }
  get serverEncryptedVrfKeypair() {
    const ret = wasm.__wbg_get_deterministicvrfkeypairresponse_serverEncryptedVrfKeypair(this.__wbg_ptr);
    return ret === 0 ? undefined : Shamir3PassEncryptVrfKeypairResult.__wrap(ret);
  }
  set serverEncryptedVrfKeypair(arg0) {
    let ptr0 = 0;
    if (!isLikeNone(arg0)) {
      _assertClass(arg0, Shamir3PassEncryptVrfKeypairResult);
      ptr0 = arg0.__destroy_into_raw();
    }
    wasm.__wbg_set_deterministicvrfkeypairresponse_serverEncryptedVrfKeypair(this.__wbg_ptr, ptr0);
  }
  get success() {
    const ret = wasm.__wbg_get_deterministicvrfkeypairresponse_success(this.__wbg_ptr);
    return ret !== 0;
  }
  set success(arg0) {
    wasm.__wbg_set_deterministicvrfkeypairresponse_success(this.__wbg_ptr, arg0);
  }
}
var EncryptedVRFKeypairFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_encryptedvrfkeypair_free(ptr >>> 0, 1));

class EncryptedVRFKeypair {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(EncryptedVRFKeypair.prototype);
    obj.__wbg_ptr = ptr;
    EncryptedVRFKeypairFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    EncryptedVRFKeypairFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_encryptedvrfkeypair_free(ptr, 0);
  }
  get encryptedVrfDataB64u() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_encryptedvrfkeypair_encryptedVrfDataB64u(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set encryptedVrfDataB64u(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_encryptedvrfkeypair_encryptedVrfDataB64u(this.__wbg_ptr, ptr0, len0);
  }
  get chacha20NonceB64u() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_encryptedvrfkeypair_chacha20NonceB64u(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set chacha20NonceB64u(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_encryptedvrfkeypair_chacha20NonceB64u(this.__wbg_ptr, ptr0, len0);
  }
}
var GenerateVrfChallengeRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_generatevrfchallengerequest_free(ptr >>> 0, 1));

class GenerateVrfChallengeRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    GenerateVrfChallengeRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_generatevrfchallengerequest_free(ptr, 0);
  }
  get vrfInputData() {
    const ret = wasm.__wbg_get_generatevrfchallengerequest_vrfInputData(this.__wbg_ptr);
    return VRFInputData.__wrap(ret);
  }
  set vrfInputData(arg0) {
    _assertClass(arg0, VRFInputData);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_generatevrfchallengerequest_vrfInputData(this.__wbg_ptr, ptr0);
  }
}
var GenerateVrfKeypairBootstrapRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_generatevrfkeypairbootstraprequest_free(ptr >>> 0, 1));

class GenerateVrfKeypairBootstrapRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    GenerateVrfKeypairBootstrapRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_generatevrfkeypairbootstraprequest_free(ptr, 0);
  }
  get vrfInputData() {
    const ret = wasm.__wbg_get_generatevrfkeypairbootstraprequest_vrfInputData(this.__wbg_ptr);
    return ret === 0 ? undefined : VRFInputData.__wrap(ret);
  }
  set vrfInputData(arg0) {
    let ptr0 = 0;
    if (!isLikeNone(arg0)) {
      _assertClass(arg0, VRFInputData);
      ptr0 = arg0.__destroy_into_raw();
    }
    wasm.__wbg_set_generatevrfkeypairbootstraprequest_vrfInputData(this.__wbg_ptr, ptr0);
  }
}
var Shamir3PassApplyServerLockRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_shamir3passapplyserverlockrequest_free(ptr >>> 0, 1));

class Shamir3PassApplyServerLockRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    Shamir3PassApplyServerLockRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_shamir3passapplyserverlockrequest_free(ptr, 0);
  }
  get e_s_b64u() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_shamir3passapplyserverlockrequest_e_s_b64u(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set e_s_b64u(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_shamir3passapplyserverlockrequest_e_s_b64u(this.__wbg_ptr, ptr0, len0);
  }
  get kek_c_b64u() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_shamir3passapplyserverlockrequest_kek_c_b64u(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set kek_c_b64u(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_shamir3passapplyserverlockrequest_kek_c_b64u(this.__wbg_ptr, ptr0, len0);
  }
}
var Shamir3PassClientDecryptVrfKeypairRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_shamir3passclientdecryptvrfkeypairrequest_free(ptr >>> 0, 1));

class Shamir3PassClientDecryptVrfKeypairRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    Shamir3PassClientDecryptVrfKeypairRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_shamir3passclientdecryptvrfkeypairrequest_free(ptr, 0);
  }
  get nearAccountId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_shamir3passclientdecryptvrfkeypairrequest_nearAccountId(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set nearAccountId(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_encryptedvrfkeypair_encryptedVrfDataB64u(this.__wbg_ptr, ptr0, len0);
  }
  get kek_s_b64u() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_shamir3passclientdecryptvrfkeypairrequest_kek_s_b64u(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set kek_s_b64u(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_encryptedvrfkeypair_chacha20NonceB64u(this.__wbg_ptr, ptr0, len0);
  }
  get ciphertextVrfB64u() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_shamir3passclientdecryptvrfkeypairrequest_ciphertextVrfB64u(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set ciphertextVrfB64u(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_shamir3passclientdecryptvrfkeypairrequest_ciphertextVrfB64u(this.__wbg_ptr, ptr0, len0);
  }
}
var Shamir3PassClientEncryptCurrentVrfKeypairRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_shamir3passclientencryptcurrentvrfkeypairrequest_free(ptr >>> 0, 1));

class Shamir3PassClientEncryptCurrentVrfKeypairRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    Shamir3PassClientEncryptCurrentVrfKeypairRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_shamir3passclientencryptcurrentvrfkeypairrequest_free(ptr, 0);
  }
}
var Shamir3PassConfigPRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_shamir3passconfigprequest_free(ptr >>> 0, 1));

class Shamir3PassConfigPRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    Shamir3PassConfigPRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_shamir3passconfigprequest_free(ptr, 0);
  }
  get p_b64u() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_shamir3passconfigprequest_p_b64u(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set p_b64u(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_shamir3passconfigprequest_p_b64u(this.__wbg_ptr, ptr0, len0);
  }
}
var Shamir3PassConfigServerUrlsRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_shamir3passconfigserverurlsrequest_free(ptr >>> 0, 1));

class Shamir3PassConfigServerUrlsRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    Shamir3PassConfigServerUrlsRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_shamir3passconfigserverurlsrequest_free(ptr, 0);
  }
  get relayServerUrl() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_shamir3passconfigserverurlsrequest_relayServerUrl(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set relayServerUrl(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_shamir3passconfigprequest_p_b64u(this.__wbg_ptr, ptr0, len0);
  }
  get applyLockRoute() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_shamir3passconfigserverurlsrequest_applyLockRoute(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set applyLockRoute(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_shamir3passconfigserverurlsrequest_applyLockRoute(this.__wbg_ptr, ptr0, len0);
  }
  get removeLockRoute() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_shamir3passconfigserverurlsrequest_removeLockRoute(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set removeLockRoute(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_shamir3passconfigserverurlsrequest_removeLockRoute(this.__wbg_ptr, ptr0, len0);
  }
}
var Shamir3PassEncryptVrfKeypairResultFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_shamir3passencryptvrfkeypairresult_free(ptr >>> 0, 1));

class Shamir3PassEncryptVrfKeypairResult {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(Shamir3PassEncryptVrfKeypairResult.prototype);
    obj.__wbg_ptr = ptr;
    Shamir3PassEncryptVrfKeypairResultFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    Shamir3PassEncryptVrfKeypairResultFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_shamir3passencryptvrfkeypairresult_free(ptr, 0);
  }
  get ciphertextVrfB64u() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_shamir3passencryptvrfkeypairresult_ciphertextVrfB64u(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set ciphertextVrfB64u(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_encryptedvrfkeypair_encryptedVrfDataB64u(this.__wbg_ptr, ptr0, len0);
  }
  get kek_s_b64u() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_shamir3passencryptvrfkeypairresult_kek_s_b64u(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set kek_s_b64u(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_encryptedvrfkeypair_chacha20NonceB64u(this.__wbg_ptr, ptr0, len0);
  }
  get vrfPublicKey() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_shamir3passencryptvrfkeypairresult_vrfPublicKey(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set vrfPublicKey(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_shamir3passclientdecryptvrfkeypairrequest_ciphertextVrfB64u(this.__wbg_ptr, ptr0, len0);
  }
}
var Shamir3PassGenerateServerKeypairRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_shamir3passgenerateserverkeypairrequest_free(ptr >>> 0, 1));

class Shamir3PassGenerateServerKeypairRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    Shamir3PassGenerateServerKeypairRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_shamir3passgenerateserverkeypairrequest_free(ptr, 0);
  }
}
var Shamir3PassRemoveServerLockRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_shamir3passremoveserverlockrequest_free(ptr >>> 0, 1));

class Shamir3PassRemoveServerLockRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    Shamir3PassRemoveServerLockRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_shamir3passremoveserverlockrequest_free(ptr, 0);
  }
  get d_s_b64u() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_shamir3passremoveserverlockrequest_d_s_b64u(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set d_s_b64u(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_shamir3passapplyserverlockrequest_e_s_b64u(this.__wbg_ptr, ptr0, len0);
  }
  get kek_cs_b64u() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_shamir3passremoveserverlockrequest_kek_cs_b64u(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set kek_cs_b64u(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_shamir3passapplyserverlockrequest_kek_c_b64u(this.__wbg_ptr, ptr0, len0);
  }
}
var ShamirApplyServerLockHTTPRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_shamirapplyserverlockhttprequest_free(ptr >>> 0, 1));

class ShamirApplyServerLockHTTPRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    ShamirApplyServerLockHTTPRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_shamirapplyserverlockhttprequest_free(ptr, 0);
  }
  get kek_c_b64u() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_shamirapplyserverlockhttprequest_kek_c_b64u(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set kek_c_b64u(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_shamirapplyserverlockhttprequest_kek_c_b64u(this.__wbg_ptr, ptr0, len0);
  }
}
var ShamirApplyServerLockHTTPResponseFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_shamirapplyserverlockhttpresponse_free(ptr >>> 0, 1));

class ShamirApplyServerLockHTTPResponse {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    ShamirApplyServerLockHTTPResponseFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_shamirapplyserverlockhttpresponse_free(ptr, 0);
  }
  get kek_cs_b64u() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_shamirapplyserverlockhttpresponse_kek_cs_b64u(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set kek_cs_b64u(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_shamirapplyserverlockhttprequest_kek_c_b64u(this.__wbg_ptr, ptr0, len0);
  }
}
var ShamirRemoveServerLockHTTPRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_shamirremoveserverlockhttprequest_free(ptr >>> 0, 1));

class ShamirRemoveServerLockHTTPRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    ShamirRemoveServerLockHTTPRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_shamirremoveserverlockhttprequest_free(ptr, 0);
  }
  get kek_cs_b64u() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_shamirremoveserverlockhttprequest_kek_cs_b64u(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set kek_cs_b64u(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_shamirapplyserverlockhttprequest_kek_c_b64u(this.__wbg_ptr, ptr0, len0);
  }
}
var ShamirRemoveServerLockHTTPResponseFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_shamirremoveserverlockhttpresponse_free(ptr >>> 0, 1));

class ShamirRemoveServerLockHTTPResponse {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    ShamirRemoveServerLockHTTPResponseFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_shamirremoveserverlockhttpresponse_free(ptr, 0);
  }
  get kek_c_b64u() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_shamirremoveserverlockhttpresponse_kek_c_b64u(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set kek_c_b64u(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_shamirapplyserverlockhttprequest_kek_c_b64u(this.__wbg_ptr, ptr0, len0);
  }
}
var UnlockVrfKeypairRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_unlockvrfkeypairrequest_free(ptr >>> 0, 1));

class UnlockVrfKeypairRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    UnlockVrfKeypairRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_unlockvrfkeypairrequest_free(ptr, 0);
  }
  get nearAccountId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_unlockvrfkeypairrequest_nearAccountId(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set nearAccountId(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_shamir3passapplyserverlockrequest_e_s_b64u(this.__wbg_ptr, ptr0, len0);
  }
  get encryptedVrfKeypair() {
    const ret = wasm.__wbg_get_unlockvrfkeypairrequest_encryptedVrfKeypair(this.__wbg_ptr);
    return EncryptedVRFKeypair.__wrap(ret);
  }
  set encryptedVrfKeypair(arg0) {
    _assertClass(arg0, EncryptedVRFKeypair);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_unlockvrfkeypairrequest_encryptedVrfKeypair(this.__wbg_ptr, ptr0);
  }
  get prfKey() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_unlockvrfkeypairrequest_prfKey(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set prfKey(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_unlockvrfkeypairrequest_prfKey(this.__wbg_ptr, ptr0, len0);
  }
}
var VRFChallengeDataFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_vrfchallengedata_free(ptr >>> 0, 1));

class VRFChallengeData {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(VRFChallengeData.prototype);
    obj.__wbg_ptr = ptr;
    VRFChallengeDataFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    VRFChallengeDataFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_vrfchallengedata_free(ptr, 0);
  }
  get vrfInput() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_vrfchallengedata_vrfInput(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set vrfInput(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_encryptedvrfkeypair_encryptedVrfDataB64u(this.__wbg_ptr, ptr0, len0);
  }
  get vrfOutput() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_vrfchallengedata_vrfOutput(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set vrfOutput(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_encryptedvrfkeypair_chacha20NonceB64u(this.__wbg_ptr, ptr0, len0);
  }
  get vrfProof() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_vrfchallengedata_vrfProof(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set vrfProof(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_shamir3passclientdecryptvrfkeypairrequest_ciphertextVrfB64u(this.__wbg_ptr, ptr0, len0);
  }
  get vrfPublicKey() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_vrfchallengedata_vrfPublicKey(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set vrfPublicKey(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_vrfchallengedata_vrfPublicKey(this.__wbg_ptr, ptr0, len0);
  }
  get userId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_vrfchallengedata_userId(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set userId(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_vrfchallengedata_userId(this.__wbg_ptr, ptr0, len0);
  }
  get rpId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_vrfchallengedata_rpId(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set rpId(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_vrfchallengedata_rpId(this.__wbg_ptr, ptr0, len0);
  }
  get blockHeight() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_vrfchallengedata_blockHeight(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set blockHeight(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_vrfchallengedata_blockHeight(this.__wbg_ptr, ptr0, len0);
  }
  get blockHash() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_vrfchallengedata_blockHash(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set blockHash(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_vrfchallengedata_blockHash(this.__wbg_ptr, ptr0, len0);
  }
}
var VRFInputDataFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_vrfinputdata_free(ptr >>> 0, 1));

class VRFInputData {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(VRFInputData.prototype);
    obj.__wbg_ptr = ptr;
    VRFInputDataFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    VRFInputDataFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_vrfinputdata_free(ptr, 0);
  }
  get userId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_vrfinputdata_userId(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set userId(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_encryptedvrfkeypair_encryptedVrfDataB64u(this.__wbg_ptr, ptr0, len0);
  }
  get rpId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_vrfinputdata_rpId(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set rpId(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_encryptedvrfkeypair_chacha20NonceB64u(this.__wbg_ptr, ptr0, len0);
  }
  get blockHeight() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_vrfinputdata_blockHeight(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set blockHeight(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_shamir3passclientdecryptvrfkeypairrequest_ciphertextVrfB64u(this.__wbg_ptr, ptr0, len0);
  }
  get blockHash() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_vrfinputdata_blockHash(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set blockHash(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_vrfchallengedata_vrfPublicKey(this.__wbg_ptr, ptr0, len0);
  }
}
async function __wbg_load(module, imports) {
  if (typeof Response === "function" && module instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(module, imports);
      } catch (e) {
        if (module.headers.get("Content-Type") != "application/wasm") {
          console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
        } else {
          throw e;
        }
      }
    }
    const bytes = await module.arrayBuffer();
    return await WebAssembly.instantiate(bytes, imports);
  } else {
    const instance = await WebAssembly.instantiate(module, imports);
    if (instance instanceof WebAssembly.Instance) {
      return { instance, module };
    } else {
      return instance;
    }
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
      const ret = new Headers;
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_new_23a2665fac83c611 = function(arg0, arg1) {
    try {
      var state0 = { a: arg0, b: arg1 };
      var cb0 = (arg02, arg12) => {
        const a = state0.a;
        state0.a = 0;
        try {
          return __wbg_adapter_205(a, state0.b, arg02, arg12);
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
    const ret = new Object;
    return ret;
  };
  imports.wbg.__wbg_new_8a6f238a6ece86ea = function() {
    const ret = new Error;
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
      const ret = module_wasm_vrf_worker.require;
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
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
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
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
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
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbindgen_init_externref_table = function() {
    const table = wasm.__wbindgen_export_2;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
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
    const ret = arg0 === undefined;
    return ret;
  };
  imports.wbg.__wbindgen_memory = function() {
    const ret = wasm.memory;
    return ret;
  };
  imports.wbg.__wbindgen_string_get = function(arg0, arg1) {
    const obj = arg1;
    const ret = typeof obj === "string" ? obj : undefined;
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
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
function __wbg_finalize_init(instance, module) {
  wasm = instance.exports;
  __wbg_init.__wbindgen_wasm_module = module;
  cachedDataViewMemory0 = null;
  cachedUint8ArrayMemory0 = null;
  wasm.__wbindgen_start();
  return wasm;
}
function initSync(module) {
  if (wasm !== undefined)
    return wasm;
  if (typeof module !== "undefined") {
    if (Object.getPrototypeOf(module) === Object.prototype) {
      ({ module } = module);
    } else {
      console.warn("using deprecated parameters for `initSync()`; pass a single object instead");
    }
  }
  const imports = __wbg_get_imports();
  __wbg_init_memory(imports);
  if (!(module instanceof WebAssembly.Module)) {
    module = new WebAssembly.Module(module);
  }
  const instance = new WebAssembly.Instance(module, imports);
  return __wbg_finalize_init(instance, module);
}
async function __wbg_init(module_or_path) {
  if (wasm !== undefined)
    return wasm;
  if (typeof module_or_path !== "undefined") {
    if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
      ({ module_or_path } = module_or_path);
    } else {
      console.warn("using deprecated parameters for the initialization function; pass a single object instead");
    }
  }
  if (typeof module_or_path === "undefined") {
    module_or_path = new URL("wasm_vrf_worker_bg.wasm", import.meta.url);
  }
  const imports = __wbg_get_imports();
  if (typeof module_or_path === "string" || typeof Request === "function" && module_or_path instanceof Request || typeof URL === "function" && module_or_path instanceof URL) {
    module_or_path = fetch(module_or_path);
  }
  __wbg_init_memory(imports);
  const { instance, module } = await __wbg_load(await module_or_path, imports);
  return __wbg_finalize_init(instance, module);
}
var wasm_vrf_worker_default = __wbg_init;

// src/core/wasm/wasmLoader.ts
function resolveWasmUrl(wasmFilename, workerName, customBaseUrl) {
  if (customBaseUrl) {
    console.debug(`[wasmLoader: ${workerName}] Using custom WASM base URL: ${customBaseUrl}`);
    return new URL(wasmFilename, customBaseUrl);
  }
  if (typeof process !== "undefined" && process.env?.WASM_BASE_URL) {
    console.debug(`[wasmLoader: ${workerName}] Using environment WASM base URL: ${process.env.WASM_BASE_URL}`);
    return new URL(wasmFilename, process.env.WASM_BASE_URL);
  }
  const workerEnvVar = workerName.toUpperCase().replace(/[^A-Z]/g, "_") + "_WASM_BASE_URL";
  if (typeof process !== "undefined" && process.env?.[workerEnvVar]) {
    console.debug(`[wasmLoader: ${workerName}] Using worker-specific environment WASM base URL: ${process.env[workerEnvVar]}`);
    return new URL(wasmFilename, process.env[workerEnvVar]);
  }
  if (typeof self !== "undefined" && self.WASM_BASE_URL) {
    console.debug(`[wasmLoader: ${workerName}] Using global WASM base URL: ${self.WASM_BASE_URL}`);
    return new URL(wasmFilename, self.WASM_BASE_URL);
  }
  console.debug(`[wasmLoader: ${workerName}] Using default import.meta.url path: ${import.meta.url}`);
  return new URL(`./${wasmFilename}`, import.meta.url);
}

// src/core/web3authn-vrf.worker.ts
var wasmUrl = resolveWasmUrl("wasm_vrf_worker_bg.wasm", "vrf-worker");
console.debug(`[vrf-worker] WASM URL resolved to: ${wasmUrl.href}`);
var { handle_message: handle_message2 } = exports_wasm_vrf_worker;
var wasmReady = false;
var messageQueue = [];
async function initializeWasmModule() {
  try {
    await wasm_vrf_worker_default(wasmUrl);
    wasmReady = true;
    await processQueuedMessages();
  } catch (error) {
    console.error("[vrf-worker] WASM initialization failed:", error);
    for (const event of messageQueue) {
      const errorResponse = createErrorResponse(event.data?.id, error);
      self.postMessage(errorResponse);
    }
    messageQueue = [];
    throw error;
  }
}
self.onmessage = async (event) => {
  await handleMessage(event);
};
async function processQueuedMessages() {
  const queuedMessages = [...messageQueue];
  messageQueue = [];
  for (const event of queuedMessages) {
    try {
      await handleMessage(event);
    } catch (error) {
      console.error("[vrf-worker] Error processing queued message:", error);
      const errorResponse = createErrorResponse(event.data?.id, error);
      self.postMessage(errorResponse);
    }
  }
}
async function handleMessage(event) {
  const data = event.data;
  if (!wasmReady) {
    messageQueue.push(event);
    return;
  }
  try {
    const response = await handle_message2(data);
    self.postMessage(response);
  } catch (error) {
    console.error(`[vrf-worker] Message handling error for ${data.type}:`, error);
    const errorResponse = createErrorResponse(data?.id, error);
    self.postMessage(errorResponse);
  }
}
function createErrorResponse(messageId, error) {
  let errorMessage = "Unknown error in VRF Web Worker";
  if (error instanceof Error) {
    errorMessage = error.message;
    console.error("[vrf-worker] Full error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
  } else if (typeof error === "string") {
    errorMessage = error;
  } else {
    console.error("[vrf-worker] Non-Error object thrown:", error);
    errorMessage = String(error);
  }
  return {
    id: messageId,
    success: false,
    error: errorMessage
  };
}
self.onerror = (error) => {
  console.error("[vrf-worker] error:", error);
};
self.onunhandledrejection = (event) => {
  console.error("[vrf-worker] Unhandled promise rejection:", event.reason);
  event.preventDefault();
};
initializeWasmModule().catch((error) => {
  console.error("[vrf-worker] Startup initialization failed:", error);
});
