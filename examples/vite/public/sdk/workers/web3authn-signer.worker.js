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

// src/wasm_signer_worker/wasm_signer_worker.js
var exports_wasm_signer_worker = {};
__export(exports_wasm_signer_worker, {
  init_worker: () => init_worker,
  initSync: () => initSync,
  handle_signer_message: () => handle_signer_message,
  default: () => wasm_signer_worker_default,
  WorkerResponseType: () => WorkerResponseType,
  WorkerRequestType: () => WorkerRequestType,
  WorkerProgressMessage: () => WorkerProgressMessage,
  WebAuthnRegistrationCredentialStruct: () => WebAuthnRegistrationCredentialStruct,
  WebAuthnAuthenticationCredentialStruct: () => WebAuthnAuthenticationCredentialStruct,
  WasmTransaction: () => WasmTransaction,
  WasmSignedTransaction: () => WasmSignedTransaction,
  WasmSignature: () => WasmSignature,
  WasmPublicKey: () => WasmPublicKey,
  VrfChallenge: () => VrfChallenge,
  VerificationPayload: () => VerificationPayload,
  UserVerificationPolicy: () => UserVerificationPolicy,
  TransactionSignResult: () => TransactionSignResult,
  TransactionPayload: () => TransactionPayload,
  TransactionContext: () => TransactionContext,
  SignVerifyAndRegisterUserRequest: () => SignVerifyAndRegisterUserRequest,
  SignTransactionsWithActionsRequest: () => SignTransactionsWithActionsRequest,
  SignTransactionWithKeyPairRequest: () => SignTransactionWithKeyPairRequest,
  SignNep413Result: () => SignNep413Result,
  SignNep413Request: () => SignNep413Request,
  SerializedRegistrationCredential: () => SerializedRegistrationCredential,
  SerializedCredential: () => SerializedCredential,
  RpcCallPayload: () => RpcCallPayload,
  RegistrationResult: () => RegistrationResult,
  RegistrationResponse: () => RegistrationResponse,
  RegistrationPayload: () => RegistrationPayload,
  RegistrationInfoStruct: () => RegistrationInfoStruct,
  RegistrationCheckResult: () => RegistrationCheckResult,
  RegistrationCheckRequest: () => RegistrationCheckRequest,
  RecoverKeypairResult: () => RecoverKeypairResult,
  RecoverKeypairRequest: () => RecoverKeypairRequest,
  ProgressStep: () => ProgressStep,
  ProgressMessageType: () => ProgressMessageType,
  PrfResults: () => PrfResults,
  PrfOutputs: () => PrfOutputs,
  OriginPolicyInput: () => OriginPolicyInput,
  LinkDeviceRegistrationTransaction: () => LinkDeviceRegistrationTransaction,
  KeyActionResult: () => KeyActionResult,
  ExtractCoseRequest: () => ExtractCoseRequest,
  DualPrfOutputsStruct: () => DualPrfOutputsStruct,
  DeriveNearKeypairAndEncryptResult: () => DeriveNearKeypairAndEncryptResult,
  DeriveNearKeypairAndEncryptRequest: () => DeriveNearKeypairAndEncryptRequest,
  DecryptionPayload: () => DecryptionPayload,
  Decryption: () => Decryption,
  DecryptPrivateKeyResult: () => DecryptPrivateKeyResult,
  DecryptPrivateKeyRequest: () => DecryptPrivateKeyRequest,
  CoseExtractionResult: () => CoseExtractionResult,
  ConfirmationUIMode: () => ConfirmationUIMode,
  ConfirmationConfig: () => ConfirmationConfig,
  ConfirmationBehavior: () => ConfirmationBehavior,
  ClientExtensionResults: () => ClientExtensionResults,
  CheckCanRegisterUserRequest: () => CheckCanRegisterUserRequest,
  AuthenticatorOptions: () => AuthenticatorOptions,
  AuthenticationResponse: () => AuthenticationResponse
});
var wasm;
var WASM_VECTOR_LEN = 0;
var cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
  if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
    cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8ArrayMemory0;
}
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
var cachedTextDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }) : { decode: () => {
  throw Error("TextDecoder not available");
} };
if (typeof TextDecoder !== "undefined") {
  cachedTextDecoder.decode();
}
function getStringFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}
function addToExternrefTable0(obj) {
  const idx = wasm.__externref_table_alloc();
  wasm.__wbindgen_export_4.set(idx, obj);
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
function getArrayJsValueFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  const mem = getDataViewMemory0();
  const result = [];
  for (let i = ptr;i < ptr + 4 * len; i += 4) {
    result.push(wasm.__wbindgen_export_4.get(mem.getUint32(i, true)));
  }
  wasm.__externref_drop_slice(ptr, len);
  return result;
}
function passArrayJsValueToWasm0(array, malloc) {
  const ptr = malloc(array.length * 4, 4) >>> 0;
  for (let i = 0;i < array.length; i++) {
    const add = addToExternrefTable0(array[i]);
    getDataViewMemory0().setUint32(ptr + 4 * i, add, true);
  }
  WASM_VECTOR_LEN = array.length;
  return ptr;
}
function _assertClass(instance, klass) {
  if (!(instance instanceof klass)) {
    throw new Error(`expected instance of ${klass.name}`);
  }
}
function getArrayU8FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}
function passArray8ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 1, 1) >>> 0;
  getUint8ArrayMemory0().set(arg, ptr / 1);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}
function init_worker() {
  wasm.init_worker();
}
function handle_signer_message(message_json) {
  const ptr0 = passStringToWasm0(message_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.handle_signer_message(ptr0, len0);
  return ret;
}
function __wbg_adapter_48(arg0, arg1, arg2) {
  wasm.closure208_externref_shim(arg0, arg1, arg2);
}
function __wbg_adapter_568(arg0, arg1, arg2, arg3) {
  wasm.closure239_externref_shim(arg0, arg1, arg2, arg3);
}
var ConfirmationBehavior = Object.freeze({
  RequireClick: 0,
  "0": "RequireClick",
  AutoProceed: 1,
  "1": "AutoProceed"
});
var ConfirmationUIMode = Object.freeze({
  Skip: 0,
  "0": "Skip",
  Modal: 1,
  "1": "Modal",
  Embedded: 2,
  "2": "Embedded"
});
var ProgressMessageType = Object.freeze({
  RegistrationProgress: 18,
  "18": "RegistrationProgress",
  RegistrationComplete: 19,
  "19": "RegistrationComplete",
  ExecuteActionsProgress: 20,
  "20": "ExecuteActionsProgress",
  ExecuteActionsComplete: 21,
  "21": "ExecuteActionsComplete"
});
var ProgressStep = Object.freeze({
  Preparation: 100,
  "100": "Preparation",
  UserConfirmation: 101,
  "101": "UserConfirmation",
  ContractVerification: 102,
  "102": "ContractVerification",
  WebauthnAuthentication: 103,
  "103": "WebauthnAuthentication",
  AuthenticationComplete: 104,
  "104": "AuthenticationComplete",
  TransactionSigningProgress: 105,
  "105": "TransactionSigningProgress",
  TransactionSigningComplete: 106,
  "106": "TransactionSigningComplete",
  Error: 107,
  "107": "Error"
});
var UserVerificationPolicy = Object.freeze({
  Required: 0,
  "0": "Required",
  Preferred: 1,
  "1": "Preferred",
  Discouraged: 2,
  "2": "Discouraged"
});
var WorkerRequestType = Object.freeze({
  DeriveNearKeypairAndEncrypt: 0,
  "0": "DeriveNearKeypairAndEncrypt",
  RecoverKeypairFromPasskey: 1,
  "1": "RecoverKeypairFromPasskey",
  CheckCanRegisterUser: 2,
  "2": "CheckCanRegisterUser",
  DecryptPrivateKeyWithPrf: 3,
  "3": "DecryptPrivateKeyWithPrf",
  SignTransactionsWithActions: 4,
  "4": "SignTransactionsWithActions",
  ExtractCosePublicKey: 5,
  "5": "ExtractCosePublicKey",
  SignTransactionWithKeyPair: 6,
  "6": "SignTransactionWithKeyPair",
  SignNep413Message: 7,
  "7": "SignNep413Message",
  SignVerifyAndRegisterUser: 8,
  "8": "SignVerifyAndRegisterUser"
});
var WorkerResponseType = Object.freeze({
  DeriveNearKeypairAndEncryptSuccess: 0,
  "0": "DeriveNearKeypairAndEncryptSuccess",
  RecoverKeypairFromPasskeySuccess: 1,
  "1": "RecoverKeypairFromPasskeySuccess",
  CheckCanRegisterUserSuccess: 2,
  "2": "CheckCanRegisterUserSuccess",
  DecryptPrivateKeyWithPrfSuccess: 3,
  "3": "DecryptPrivateKeyWithPrfSuccess",
  SignTransactionsWithActionsSuccess: 4,
  "4": "SignTransactionsWithActionsSuccess",
  ExtractCosePublicKeySuccess: 5,
  "5": "ExtractCosePublicKeySuccess",
  SignTransactionWithKeyPairSuccess: 6,
  "6": "SignTransactionWithKeyPairSuccess",
  SignNep413MessageSuccess: 7,
  "7": "SignNep413MessageSuccess",
  SignVerifyAndRegisterUserSuccess: 8,
  "8": "SignVerifyAndRegisterUserSuccess",
  DeriveNearKeypairAndEncryptFailure: 9,
  "9": "DeriveNearKeypairAndEncryptFailure",
  RecoverKeypairFromPasskeyFailure: 10,
  "10": "RecoverKeypairFromPasskeyFailure",
  CheckCanRegisterUserFailure: 11,
  "11": "CheckCanRegisterUserFailure",
  DecryptPrivateKeyWithPrfFailure: 12,
  "12": "DecryptPrivateKeyWithPrfFailure",
  SignTransactionsWithActionsFailure: 13,
  "13": "SignTransactionsWithActionsFailure",
  ExtractCosePublicKeyFailure: 14,
  "14": "ExtractCosePublicKeyFailure",
  SignTransactionWithKeyPairFailure: 15,
  "15": "SignTransactionWithKeyPairFailure",
  SignNep413MessageFailure: 16,
  "16": "SignNep413MessageFailure",
  SignVerifyAndRegisterUserFailure: 17,
  "17": "SignVerifyAndRegisterUserFailure",
  RegistrationProgress: 18,
  "18": "RegistrationProgress",
  RegistrationComplete: 19,
  "19": "RegistrationComplete",
  ExecuteActionsProgress: 20,
  "20": "ExecuteActionsProgress",
  ExecuteActionsComplete: 21,
  "21": "ExecuteActionsComplete"
});
var __wbindgen_enum_RequestMode = ["same-origin", "no-cors", "cors", "navigate"];
var AuthenticationResponseFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_authenticationresponse_free(ptr >>> 0, 1));

class AuthenticationResponse {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(AuthenticationResponse.prototype);
    obj.__wbg_ptr = ptr;
    AuthenticationResponseFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    AuthenticationResponseFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_authenticationresponse_free(ptr, 0);
  }
  get clientDataJSON() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_authenticationresponse_clientDataJSON(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set clientDataJSON(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_authenticationresponse_clientDataJSON(this.__wbg_ptr, ptr0, len0);
  }
  get authenticatorData() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_authenticationresponse_authenticatorData(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set authenticatorData(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_authenticationresponse_authenticatorData(this.__wbg_ptr, ptr0, len0);
  }
  get signature() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_authenticationresponse_signature(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set signature(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_authenticationresponse_signature(this.__wbg_ptr, ptr0, len0);
  }
  get userHandle() {
    const ret = wasm.__wbg_get_authenticationresponse_userHandle(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getStringFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set userHandle(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_authenticationresponse_userHandle(this.__wbg_ptr, ptr0, len0);
  }
}
var AuthenticatorOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_authenticatoroptions_free(ptr >>> 0, 1));

class AuthenticatorOptions {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(AuthenticatorOptions.prototype);
    obj.__wbg_ptr = ptr;
    AuthenticatorOptionsFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    AuthenticatorOptionsFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_authenticatoroptions_free(ptr, 0);
  }
  get userVerification() {
    const ret = wasm.__wbg_get_authenticatoroptions_userVerification(this.__wbg_ptr);
    return ret === 3 ? undefined : ret;
  }
  set userVerification(arg0) {
    wasm.__wbg_set_authenticatoroptions_userVerification(this.__wbg_ptr, isLikeNone(arg0) ? 3 : arg0);
  }
  get originPolicy() {
    const ret = wasm.__wbg_get_authenticatoroptions_originPolicy(this.__wbg_ptr);
    return ret === 0 ? undefined : OriginPolicyInput.__wrap(ret);
  }
  set originPolicy(arg0) {
    let ptr0 = 0;
    if (!isLikeNone(arg0)) {
      _assertClass(arg0, OriginPolicyInput);
      ptr0 = arg0.__destroy_into_raw();
    }
    wasm.__wbg_set_authenticatoroptions_originPolicy(this.__wbg_ptr, ptr0);
  }
}
var CheckCanRegisterUserRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_checkcanregisteruserrequest_free(ptr >>> 0, 1));

class CheckCanRegisterUserRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    CheckCanRegisterUserRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_checkcanregisteruserrequest_free(ptr, 0);
  }
  get vrfChallenge() {
    const ret = wasm.__wbg_get_checkcanregisteruserrequest_vrfChallenge(this.__wbg_ptr);
    return VrfChallenge.__wrap(ret);
  }
  set vrfChallenge(arg0) {
    _assertClass(arg0, VrfChallenge);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_checkcanregisteruserrequest_vrfChallenge(this.__wbg_ptr, ptr0);
  }
  get credential() {
    const ret = wasm.__wbg_get_checkcanregisteruserrequest_credential(this.__wbg_ptr);
    return SerializedRegistrationCredential.__wrap(ret);
  }
  set credential(arg0) {
    _assertClass(arg0, SerializedRegistrationCredential);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_checkcanregisteruserrequest_credential(this.__wbg_ptr, ptr0);
  }
  get contractId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_checkcanregisteruserrequest_contractId(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set contractId(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_checkcanregisteruserrequest_contractId(this.__wbg_ptr, ptr0, len0);
  }
  get nearRpcUrl() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_checkcanregisteruserrequest_nearRpcUrl(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set nearRpcUrl(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_checkcanregisteruserrequest_nearRpcUrl(this.__wbg_ptr, ptr0, len0);
  }
  get authenticatorOptions() {
    const ret = wasm.__wbg_get_checkcanregisteruserrequest_authenticatorOptions(this.__wbg_ptr);
    return ret === 0 ? undefined : AuthenticatorOptions.__wrap(ret);
  }
  set authenticatorOptions(arg0) {
    let ptr0 = 0;
    if (!isLikeNone(arg0)) {
      _assertClass(arg0, AuthenticatorOptions);
      ptr0 = arg0.__destroy_into_raw();
    }
    wasm.__wbg_set_checkcanregisteruserrequest_authenticatorOptions(this.__wbg_ptr, ptr0);
  }
}
var ClientExtensionResultsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_clientextensionresults_free(ptr >>> 0, 1));

class ClientExtensionResults {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(ClientExtensionResults.prototype);
    obj.__wbg_ptr = ptr;
    ClientExtensionResultsFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    ClientExtensionResultsFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_clientextensionresults_free(ptr, 0);
  }
  get prf() {
    const ret = wasm.__wbg_get_clientextensionresults_prf(this.__wbg_ptr);
    return PrfResults.__wrap(ret);
  }
  set prf(arg0) {
    _assertClass(arg0, PrfResults);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_clientextensionresults_prf(this.__wbg_ptr, ptr0);
  }
}
var ConfirmationConfigFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_confirmationconfig_free(ptr >>> 0, 1));

class ConfirmationConfig {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(ConfirmationConfig.prototype);
    obj.__wbg_ptr = ptr;
    ConfirmationConfigFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    ConfirmationConfigFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_confirmationconfig_free(ptr, 0);
  }
  get uiMode() {
    const ret = wasm.__wbg_get_confirmationconfig_uiMode(this.__wbg_ptr);
    return ret;
  }
  set uiMode(arg0) {
    wasm.__wbg_set_confirmationconfig_uiMode(this.__wbg_ptr, arg0);
  }
  get behavior() {
    const ret = wasm.__wbg_get_confirmationconfig_behavior(this.__wbg_ptr);
    return ret;
  }
  set behavior(arg0) {
    wasm.__wbg_set_confirmationconfig_behavior(this.__wbg_ptr, arg0);
  }
  get autoProceedDelay() {
    const ret = wasm.__wbg_get_confirmationconfig_autoProceedDelay(this.__wbg_ptr);
    return ret === 4294967297 ? undefined : ret;
  }
  set autoProceedDelay(arg0) {
    wasm.__wbg_set_confirmationconfig_autoProceedDelay(this.__wbg_ptr, isLikeNone(arg0) ? 4294967297 : arg0 >>> 0);
  }
  get theme() {
    const ret = wasm.__wbg_get_confirmationconfig_theme(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getStringFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set theme(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_confirmationconfig_theme(this.__wbg_ptr, ptr0, len0);
  }
}
var CoseExtractionResultFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_coseextractionresult_free(ptr >>> 0, 1));

class CoseExtractionResult {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    CoseExtractionResultFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_coseextractionresult_free(ptr, 0);
  }
  get cosePublicKeyBytes() {
    const ret = wasm.__wbg_get_coseextractionresult_cosePublicKeyBytes(this.__wbg_ptr);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
  }
  set cosePublicKeyBytes(arg0) {
    const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_coseextractionresult_cosePublicKeyBytes(this.__wbg_ptr, ptr0, len0);
  }
}
var DecryptPrivateKeyRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_decryptprivatekeyrequest_free(ptr >>> 0, 1));

class DecryptPrivateKeyRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    DecryptPrivateKeyRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_decryptprivatekeyrequest_free(ptr, 0);
  }
  get nearAccountId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_decryptprivatekeyrequest_nearAccountId(this.__wbg_ptr);
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
    wasm.__wbg_set_decryptprivatekeyrequest_nearAccountId(this.__wbg_ptr, ptr0, len0);
  }
  get chacha20PrfOutput() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_decryptprivatekeyrequest_chacha20PrfOutput(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set chacha20PrfOutput(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryptprivatekeyrequest_chacha20PrfOutput(this.__wbg_ptr, ptr0, len0);
  }
  get encryptedPrivateKeyData() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_decryptprivatekeyrequest_encryptedPrivateKeyData(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set encryptedPrivateKeyData(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryptprivatekeyrequest_encryptedPrivateKeyData(this.__wbg_ptr, ptr0, len0);
  }
  get encryptedPrivateKeyIv() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_decryptprivatekeyrequest_encryptedPrivateKeyIv(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set encryptedPrivateKeyIv(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryptprivatekeyrequest_encryptedPrivateKeyIv(this.__wbg_ptr, ptr0, len0);
  }
  constructor(near_account_id, chacha20_prf_output, encrypted_private_key_data, encrypted_private_key_iv) {
    const ptr0 = passStringToWasm0(near_account_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(chacha20_prf_output, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(encrypted_private_key_data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passStringToWasm0(encrypted_private_key_iv, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.decryptprivatekeyrequest_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
    this.__wbg_ptr = ret >>> 0;
    DecryptPrivateKeyRequestFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
}
var DecryptPrivateKeyResultFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_decryptprivatekeyresult_free(ptr >>> 0, 1));

class DecryptPrivateKeyResult {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    DecryptPrivateKeyResultFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_decryptprivatekeyresult_free(ptr, 0);
  }
  get privateKey() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_decryptprivatekeyresult_privateKey(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set privateKey(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryptprivatekeyrequest_nearAccountId(this.__wbg_ptr, ptr0, len0);
  }
  get nearAccountId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_decryptprivatekeyresult_nearAccountId(this.__wbg_ptr);
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
    wasm.__wbg_set_decryptprivatekeyrequest_chacha20PrfOutput(this.__wbg_ptr, ptr0, len0);
  }
  constructor(private_key, near_account_id) {
    const ptr0 = passStringToWasm0(private_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(near_account_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.decryptprivatekeyresult_new(ptr0, len0, ptr1, len1);
    this.__wbg_ptr = ret >>> 0;
    DecryptPrivateKeyResultFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
}
var DecryptionFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_decryption_free(ptr >>> 0, 1));

class Decryption {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    DecryptionFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_decryption_free(ptr, 0);
  }
  get chacha20_prf_output() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_decryption_chacha20_prf_output(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set chacha20_prf_output(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryption_chacha20_prf_output(this.__wbg_ptr, ptr0, len0);
  }
  get encrypted_private_key_data() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_decryption_encrypted_private_key_data(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set encrypted_private_key_data(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryption_encrypted_private_key_data(this.__wbg_ptr, ptr0, len0);
  }
  get encrypted_private_key_iv() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_decryption_encrypted_private_key_iv(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set encrypted_private_key_iv(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryption_encrypted_private_key_iv(this.__wbg_ptr, ptr0, len0);
  }
  constructor(chacha20_prf_output, encrypted_private_key_data, encrypted_private_key_iv) {
    const ptr0 = passStringToWasm0(chacha20_prf_output, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(encrypted_private_key_data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(encrypted_private_key_iv, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.decryption_new(ptr0, len0, ptr1, len1, ptr2, len2);
    this.__wbg_ptr = ret >>> 0;
    DecryptionFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
}
var DecryptionPayloadFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_decryptionpayload_free(ptr >>> 0, 1));

class DecryptionPayload {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(DecryptionPayload.prototype);
    obj.__wbg_ptr = ptr;
    DecryptionPayloadFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    DecryptionPayloadFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_decryptionpayload_free(ptr, 0);
  }
  get encryptedPrivateKeyData() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_decryptionpayload_encryptedPrivateKeyData(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set encryptedPrivateKeyData(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyData(this.__wbg_ptr, ptr0, len0);
  }
  get encryptedPrivateKeyIv() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_decryptionpayload_encryptedPrivateKeyIv(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set encryptedPrivateKeyIv(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyIv(this.__wbg_ptr, ptr0, len0);
  }
  constructor(encrypted_private_key_data, encrypted_private_key_iv) {
    const ptr0 = passStringToWasm0(encrypted_private_key_data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(encrypted_private_key_iv, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.decryptionpayload_new(ptr0, len0, ptr1, len1);
    this.__wbg_ptr = ret >>> 0;
    DecryptionPayloadFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
}
var DeriveNearKeypairAndEncryptRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_derivenearkeypairandencryptrequest_free(ptr >>> 0, 1));

class DeriveNearKeypairAndEncryptRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    DeriveNearKeypairAndEncryptRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_derivenearkeypairandencryptrequest_free(ptr, 0);
  }
  get dualPrfOutputs() {
    const ret = wasm.__wbg_get_derivenearkeypairandencryptrequest_dualPrfOutputs(this.__wbg_ptr);
    return DualPrfOutputsStruct.__wrap(ret);
  }
  set dualPrfOutputs(arg0) {
    _assertClass(arg0, DualPrfOutputsStruct);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_derivenearkeypairandencryptrequest_dualPrfOutputs(this.__wbg_ptr, ptr0);
  }
  get nearAccountId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_derivenearkeypairandencryptrequest_nearAccountId(this.__wbg_ptr);
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
    wasm.__wbg_set_derivenearkeypairandencryptrequest_nearAccountId(this.__wbg_ptr, ptr0, len0);
  }
  get credential() {
    const ret = wasm.__wbg_get_derivenearkeypairandencryptrequest_credential(this.__wbg_ptr);
    return SerializedRegistrationCredential.__wrap(ret);
  }
  set credential(arg0) {
    _assertClass(arg0, SerializedRegistrationCredential);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_derivenearkeypairandencryptrequest_credential(this.__wbg_ptr, ptr0);
  }
  get registrationTransaction() {
    const ret = wasm.__wbg_get_derivenearkeypairandencryptrequest_registrationTransaction(this.__wbg_ptr);
    return ret === 0 ? undefined : LinkDeviceRegistrationTransaction.__wrap(ret);
  }
  set registrationTransaction(arg0) {
    let ptr0 = 0;
    if (!isLikeNone(arg0)) {
      _assertClass(arg0, LinkDeviceRegistrationTransaction);
      ptr0 = arg0.__destroy_into_raw();
    }
    wasm.__wbg_set_derivenearkeypairandencryptrequest_registrationTransaction(this.__wbg_ptr, ptr0);
  }
  get authenticatorOptions() {
    const ret = wasm.__wbg_get_derivenearkeypairandencryptrequest_authenticatorOptions(this.__wbg_ptr);
    return ret === 0 ? undefined : AuthenticatorOptions.__wrap(ret);
  }
  set authenticatorOptions(arg0) {
    let ptr0 = 0;
    if (!isLikeNone(arg0)) {
      _assertClass(arg0, AuthenticatorOptions);
      ptr0 = arg0.__destroy_into_raw();
    }
    wasm.__wbg_set_derivenearkeypairandencryptrequest_authenticatorOptions(this.__wbg_ptr, ptr0);
  }
}
var DeriveNearKeypairAndEncryptResultFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_derivenearkeypairandencryptresult_free(ptr >>> 0, 1));

class DeriveNearKeypairAndEncryptResult {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    DeriveNearKeypairAndEncryptResultFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_derivenearkeypairandencryptresult_free(ptr, 0);
  }
  get nearAccountId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_derivenearkeypairandencryptresult_nearAccountId(this.__wbg_ptr);
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
    wasm.__wbg_set_derivenearkeypairandencryptresult_nearAccountId(this.__wbg_ptr, ptr0, len0);
  }
  get publicKey() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_derivenearkeypairandencryptresult_publicKey(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set publicKey(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_derivenearkeypairandencryptresult_publicKey(this.__wbg_ptr, ptr0, len0);
  }
  get encryptedData() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_derivenearkeypairandencryptresult_encryptedData(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set encryptedData(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_derivenearkeypairandencryptresult_encryptedData(this.__wbg_ptr, ptr0, len0);
  }
  get iv() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_derivenearkeypairandencryptresult_iv(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set iv(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_derivenearkeypairandencryptresult_iv(this.__wbg_ptr, ptr0, len0);
  }
  get stored() {
    const ret = wasm.__wbg_get_derivenearkeypairandencryptresult_stored(this.__wbg_ptr);
    return ret !== 0;
  }
  set stored(arg0) {
    wasm.__wbg_set_derivenearkeypairandencryptresult_stored(this.__wbg_ptr, arg0);
  }
  get signedTransaction() {
    const ret = wasm.__wbg_get_derivenearkeypairandencryptresult_signedTransaction(this.__wbg_ptr);
    return ret === 0 ? undefined : WasmSignedTransaction.__wrap(ret);
  }
  set signedTransaction(arg0) {
    let ptr0 = 0;
    if (!isLikeNone(arg0)) {
      _assertClass(arg0, WasmSignedTransaction);
      ptr0 = arg0.__destroy_into_raw();
    }
    wasm.__wbg_set_derivenearkeypairandencryptresult_signedTransaction(this.__wbg_ptr, ptr0);
  }
  constructor(near_account_id, public_key, encrypted_data, iv, stored, signed_transaction) {
    const ptr0 = passStringToWasm0(near_account_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(public_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(encrypted_data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passStringToWasm0(iv, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len3 = WASM_VECTOR_LEN;
    let ptr4 = 0;
    if (!isLikeNone(signed_transaction)) {
      _assertClass(signed_transaction, WasmSignedTransaction);
      ptr4 = signed_transaction.__destroy_into_raw();
    }
    const ret = wasm.derivenearkeypairandencryptresult_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, stored, ptr4);
    this.__wbg_ptr = ret >>> 0;
    DeriveNearKeypairAndEncryptResultFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
}
var DualPrfOutputsStructFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_dualprfoutputsstruct_free(ptr >>> 0, 1));

class DualPrfOutputsStruct {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(DualPrfOutputsStruct.prototype);
    obj.__wbg_ptr = ptr;
    DualPrfOutputsStructFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    DualPrfOutputsStructFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_dualprfoutputsstruct_free(ptr, 0);
  }
  get chacha20PrfOutput() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_dualprfoutputsstruct_chacha20PrfOutput(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set chacha20PrfOutput(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_dualprfoutputsstruct_chacha20PrfOutput(this.__wbg_ptr, ptr0, len0);
  }
  get ed25519PrfOutput() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_dualprfoutputsstruct_ed25519PrfOutput(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set ed25519PrfOutput(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_dualprfoutputsstruct_ed25519PrfOutput(this.__wbg_ptr, ptr0, len0);
  }
}
var ExtractCoseRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_extractcoserequest_free(ptr >>> 0, 1));

class ExtractCoseRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    ExtractCoseRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_extractcoserequest_free(ptr, 0);
  }
  get attestationObjectBase64url() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_extractcoserequest_attestationObjectBase64url(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set attestationObjectBase64url(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_coseextractionresult_cosePublicKeyBytes(this.__wbg_ptr, ptr0, len0);
  }
}
var KeyActionResultFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_keyactionresult_free(ptr >>> 0, 1));

class KeyActionResult {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    KeyActionResultFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_keyactionresult_free(ptr, 0);
  }
  get success() {
    const ret = wasm.__wbg_get_keyactionresult_success(this.__wbg_ptr);
    return ret !== 0;
  }
  set success(arg0) {
    wasm.__wbg_set_keyactionresult_success(this.__wbg_ptr, arg0);
  }
  get transactionHash() {
    const ret = wasm.__wbg_get_keyactionresult_transactionHash(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getStringFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set transactionHash(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_keyactionresult_transactionHash(this.__wbg_ptr, ptr0, len0);
  }
  get signedTransaction() {
    const ret = wasm.__wbg_get_keyactionresult_signedTransaction(this.__wbg_ptr);
    return ret === 0 ? undefined : WasmSignedTransaction.__wrap(ret);
  }
  set signedTransaction(arg0) {
    let ptr0 = 0;
    if (!isLikeNone(arg0)) {
      _assertClass(arg0, WasmSignedTransaction);
      ptr0 = arg0.__destroy_into_raw();
    }
    wasm.__wbg_set_keyactionresult_signedTransaction(this.__wbg_ptr, ptr0);
  }
  get logs() {
    const ret = wasm.__wbg_get_keyactionresult_logs(this.__wbg_ptr);
    var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
  }
  set logs(arg0) {
    const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_keyactionresult_logs(this.__wbg_ptr, ptr0, len0);
  }
  get error() {
    const ret = wasm.__wbg_get_keyactionresult_error(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getStringFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set error(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_keyactionresult_error(this.__wbg_ptr, ptr0, len0);
  }
  constructor(success, transaction_hash, signed_transaction, logs, error) {
    var ptr0 = isLikeNone(transaction_hash) ? 0 : passStringToWasm0(transaction_hash, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    let ptr1 = 0;
    if (!isLikeNone(signed_transaction)) {
      _assertClass(signed_transaction, WasmSignedTransaction);
      ptr1 = signed_transaction.__destroy_into_raw();
    }
    const ptr2 = passArrayJsValueToWasm0(logs, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    var ptr3 = isLikeNone(error) ? 0 : passStringToWasm0(error, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len3 = WASM_VECTOR_LEN;
    const ret = wasm.keyactionresult_new(success, ptr0, len0, ptr1, ptr2, len2, ptr3, len3);
    this.__wbg_ptr = ret >>> 0;
    KeyActionResultFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
}
var LinkDeviceRegistrationTransactionFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_linkdeviceregistrationtransaction_free(ptr >>> 0, 1));

class LinkDeviceRegistrationTransaction {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(LinkDeviceRegistrationTransaction.prototype);
    obj.__wbg_ptr = ptr;
    LinkDeviceRegistrationTransactionFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    LinkDeviceRegistrationTransactionFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_linkdeviceregistrationtransaction_free(ptr, 0);
  }
  get vrfChallenge() {
    const ret = wasm.__wbg_get_linkdeviceregistrationtransaction_vrfChallenge(this.__wbg_ptr);
    return VrfChallenge.__wrap(ret);
  }
  set vrfChallenge(arg0) {
    _assertClass(arg0, VrfChallenge);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_linkdeviceregistrationtransaction_vrfChallenge(this.__wbg_ptr, ptr0);
  }
  get contractId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_linkdeviceregistrationtransaction_contractId(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set contractId(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_linkdeviceregistrationtransaction_contractId(this.__wbg_ptr, ptr0, len0);
  }
  get nonce() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_linkdeviceregistrationtransaction_nonce(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set nonce(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_linkdeviceregistrationtransaction_nonce(this.__wbg_ptr, ptr0, len0);
  }
  get blockHash() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_linkdeviceregistrationtransaction_blockHash(this.__wbg_ptr);
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
    wasm.__wbg_set_derivenearkeypairandencryptresult_publicKey(this.__wbg_ptr, ptr0, len0);
  }
  get deterministicVrfPublicKey() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_linkdeviceregistrationtransaction_deterministicVrfPublicKey(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set deterministicVrfPublicKey(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_linkdeviceregistrationtransaction_deterministicVrfPublicKey(this.__wbg_ptr, ptr0, len0);
  }
}
var OriginPolicyInputFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_originpolicyinput_free(ptr >>> 0, 1));

class OriginPolicyInput {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(OriginPolicyInput.prototype);
    obj.__wbg_ptr = ptr;
    OriginPolicyInputFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    OriginPolicyInputFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_originpolicyinput_free(ptr, 0);
  }
  get single() {
    const ret = wasm.__wbg_get_originpolicyinput_single(this.__wbg_ptr);
    return ret === 16777215 ? undefined : ret !== 0;
  }
  set single(arg0) {
    wasm.__wbg_set_originpolicyinput_single(this.__wbg_ptr, isLikeNone(arg0) ? 16777215 : arg0 ? 1 : 0);
  }
  get all_subdomains() {
    const ret = wasm.__wbg_get_originpolicyinput_all_subdomains(this.__wbg_ptr);
    return ret === 16777215 ? undefined : ret !== 0;
  }
  set all_subdomains(arg0) {
    wasm.__wbg_set_originpolicyinput_all_subdomains(this.__wbg_ptr, isLikeNone(arg0) ? 16777215 : arg0 ? 1 : 0);
  }
  get multiple() {
    const ret = wasm.__wbg_get_originpolicyinput_multiple(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    }
    return v1;
  }
  set multiple(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_originpolicyinput_multiple(this.__wbg_ptr, ptr0, len0);
  }
}
var PrfOutputsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_prfoutputs_free(ptr >>> 0, 1));

class PrfOutputs {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(PrfOutputs.prototype);
    obj.__wbg_ptr = ptr;
    PrfOutputsFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    PrfOutputsFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_prfoutputs_free(ptr, 0);
  }
  get first() {
    const ret = wasm.__wbg_get_prfoutputs_first(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getStringFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set first(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_prfoutputs_first(this.__wbg_ptr, ptr0, len0);
  }
  get second() {
    const ret = wasm.__wbg_get_prfoutputs_second(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getStringFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set second(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_prfoutputs_second(this.__wbg_ptr, ptr0, len0);
  }
}
var PrfResultsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_prfresults_free(ptr >>> 0, 1));

class PrfResults {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(PrfResults.prototype);
    obj.__wbg_ptr = ptr;
    PrfResultsFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    PrfResultsFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_prfresults_free(ptr, 0);
  }
  get results() {
    const ret = wasm.__wbg_get_clientextensionresults_prf(this.__wbg_ptr);
    return PrfOutputs.__wrap(ret);
  }
  set results(arg0) {
    _assertClass(arg0, PrfOutputs);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_clientextensionresults_prf(this.__wbg_ptr, ptr0);
  }
}
var RecoverKeypairRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_recoverkeypairrequest_free(ptr >>> 0, 1));

class RecoverKeypairRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    RecoverKeypairRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_recoverkeypairrequest_free(ptr, 0);
  }
  get credential() {
    const ret = wasm.__wbg_get_recoverkeypairrequest_credential(this.__wbg_ptr);
    return SerializedCredential.__wrap(ret);
  }
  set credential(arg0) {
    _assertClass(arg0, SerializedCredential);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_recoverkeypairrequest_credential(this.__wbg_ptr, ptr0);
  }
  get accountIdHint() {
    const ret = wasm.__wbg_get_recoverkeypairrequest_accountIdHint(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getStringFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set accountIdHint(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_keyactionresult_error(this.__wbg_ptr, ptr0, len0);
  }
}
var RecoverKeypairResultFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_recoverkeypairresult_free(ptr >>> 0, 1));

class RecoverKeypairResult {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    RecoverKeypairResultFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_recoverkeypairresult_free(ptr, 0);
  }
  get publicKey() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_recoverkeypairresult_publicKey(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set publicKey(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryption_chacha20_prf_output(this.__wbg_ptr, ptr0, len0);
  }
  get encryptedData() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_recoverkeypairresult_encryptedData(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set encryptedData(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryption_encrypted_private_key_data(this.__wbg_ptr, ptr0, len0);
  }
  get iv() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_recoverkeypairresult_iv(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set iv(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryption_encrypted_private_key_iv(this.__wbg_ptr, ptr0, len0);
  }
  get accountIdHint() {
    const ret = wasm.__wbg_get_recoverkeypairresult_accountIdHint(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getStringFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set accountIdHint(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_recoverkeypairresult_accountIdHint(this.__wbg_ptr, ptr0, len0);
  }
  constructor(public_key, encrypted_data, iv, account_id_hint) {
    const ptr0 = passStringToWasm0(public_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(encrypted_data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(iv, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    var ptr3 = isLikeNone(account_id_hint) ? 0 : passStringToWasm0(account_id_hint, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len3 = WASM_VECTOR_LEN;
    const ret = wasm.recoverkeypairresult_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
    this.__wbg_ptr = ret >>> 0;
    RecoverKeypairResultFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
}
var RegistrationCheckRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_registrationcheckrequest_free(ptr >>> 0, 1));

class RegistrationCheckRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    RegistrationCheckRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_registrationcheckrequest_free(ptr, 0);
  }
  get contract_id() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_registrationcheckrequest_contract_id(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set contract_id(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyData(this.__wbg_ptr, ptr0, len0);
  }
  get near_rpc_url() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_registrationcheckrequest_near_rpc_url(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set near_rpc_url(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyIv(this.__wbg_ptr, ptr0, len0);
  }
  constructor(contract_id, near_rpc_url) {
    const ptr0 = passStringToWasm0(contract_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(near_rpc_url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.decryptionpayload_new(ptr0, len0, ptr1, len1);
    this.__wbg_ptr = ret >>> 0;
    RegistrationCheckRequestFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
}
var RegistrationCheckResultFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_registrationcheckresult_free(ptr >>> 0, 1));

class RegistrationCheckResult {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    RegistrationCheckResultFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_registrationcheckresult_free(ptr, 0);
  }
  get verified() {
    const ret = wasm.__wbg_get_registrationcheckresult_verified(this.__wbg_ptr);
    return ret !== 0;
  }
  set verified(arg0) {
    wasm.__wbg_set_registrationcheckresult_verified(this.__wbg_ptr, arg0);
  }
  get registrationInfo() {
    const ret = wasm.__wbg_get_registrationcheckresult_registrationInfo(this.__wbg_ptr);
    return ret === 0 ? undefined : RegistrationInfoStruct.__wrap(ret);
  }
  set registrationInfo(arg0) {
    let ptr0 = 0;
    if (!isLikeNone(arg0)) {
      _assertClass(arg0, RegistrationInfoStruct);
      ptr0 = arg0.__destroy_into_raw();
    }
    wasm.__wbg_set_registrationcheckresult_registrationInfo(this.__wbg_ptr, ptr0);
  }
  get logs() {
    const ret = wasm.__wbg_get_registrationcheckresult_logs(this.__wbg_ptr);
    var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
  }
  set logs(arg0) {
    const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_registrationcheckresult_logs(this.__wbg_ptr, ptr0, len0);
  }
  get signedTransaction() {
    const ret = wasm.__wbg_get_registrationcheckresult_signedTransaction(this.__wbg_ptr);
    return ret === 0 ? undefined : WasmSignedTransaction.__wrap(ret);
  }
  set signedTransaction(arg0) {
    let ptr0 = 0;
    if (!isLikeNone(arg0)) {
      _assertClass(arg0, WasmSignedTransaction);
      ptr0 = arg0.__destroy_into_raw();
    }
    wasm.__wbg_set_registrationcheckresult_signedTransaction(this.__wbg_ptr, ptr0);
  }
  get error() {
    const ret = wasm.__wbg_get_registrationcheckresult_error(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getStringFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set error(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_registrationcheckresult_error(this.__wbg_ptr, ptr0, len0);
  }
  constructor(verified, registration_info, logs, signed_transaction, error) {
    let ptr0 = 0;
    if (!isLikeNone(registration_info)) {
      _assertClass(registration_info, RegistrationInfoStruct);
      ptr0 = registration_info.__destroy_into_raw();
    }
    const ptr1 = passArrayJsValueToWasm0(logs, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    let ptr2 = 0;
    if (!isLikeNone(signed_transaction)) {
      _assertClass(signed_transaction, WasmSignedTransaction);
      ptr2 = signed_transaction.__destroy_into_raw();
    }
    var ptr3 = isLikeNone(error) ? 0 : passStringToWasm0(error, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len3 = WASM_VECTOR_LEN;
    const ret = wasm.registrationcheckresult_new(verified, ptr0, ptr1, len1, ptr2, ptr3, len3);
    this.__wbg_ptr = ret >>> 0;
    RegistrationCheckResultFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
}
var RegistrationInfoStructFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_registrationinfostruct_free(ptr >>> 0, 1));

class RegistrationInfoStruct {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(RegistrationInfoStruct.prototype);
    obj.__wbg_ptr = ptr;
    RegistrationInfoStructFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    RegistrationInfoStructFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_registrationinfostruct_free(ptr, 0);
  }
  get credentialId() {
    const ret = wasm.__wbg_get_registrationinfostruct_credentialId(this.__wbg_ptr);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
  }
  set credentialId(arg0) {
    const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_registrationinfostruct_credentialId(this.__wbg_ptr, ptr0, len0);
  }
  get credentialPublicKey() {
    const ret = wasm.__wbg_get_registrationinfostruct_credentialPublicKey(this.__wbg_ptr);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
  }
  set credentialPublicKey(arg0) {
    const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_registrationinfostruct_credentialPublicKey(this.__wbg_ptr, ptr0, len0);
  }
  get userId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_registrationinfostruct_userId(this.__wbg_ptr);
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
    wasm.__wbg_set_decryption_encrypted_private_key_iv(this.__wbg_ptr, ptr0, len0);
  }
  get vrfPublicKey() {
    const ret = wasm.__wbg_get_registrationinfostruct_vrfPublicKey(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set vrfPublicKey(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_registrationinfostruct_vrfPublicKey(this.__wbg_ptr, ptr0, len0);
  }
  constructor(credential_id, credential_public_key, user_id, vrf_public_key) {
    const ptr0 = passArray8ToWasm0(credential_id, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(credential_public_key, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(user_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    var ptr3 = isLikeNone(vrf_public_key) ? 0 : passArray8ToWasm0(vrf_public_key, wasm.__wbindgen_malloc);
    var len3 = WASM_VECTOR_LEN;
    const ret = wasm.recoverkeypairresult_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
    this.__wbg_ptr = ret >>> 0;
    RegistrationInfoStructFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
}
var RegistrationPayloadFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_registrationpayload_free(ptr >>> 0, 1));

class RegistrationPayload {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(RegistrationPayload.prototype);
    obj.__wbg_ptr = ptr;
    RegistrationPayloadFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    RegistrationPayloadFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_registrationpayload_free(ptr, 0);
  }
  get nearAccountId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_registrationpayload_nearAccountId(this.__wbg_ptr);
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
    wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyData(this.__wbg_ptr, ptr0, len0);
  }
  get nonce() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_registrationpayload_nonce(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set nonce(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyIv(this.__wbg_ptr, ptr0, len0);
  }
  get blockHash() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_registrationpayload_blockHash(this.__wbg_ptr);
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
    wasm.__wbg_set_registrationpayload_blockHash(this.__wbg_ptr, ptr0, len0);
  }
  get deterministicVrfPublicKey() {
    const ret = wasm.__wbg_get_registrationpayload_deterministicVrfPublicKey(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getStringFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set deterministicVrfPublicKey(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_registrationpayload_deterministicVrfPublicKey(this.__wbg_ptr, ptr0, len0);
  }
  get deviceNumber() {
    const ret = wasm.__wbg_get_registrationpayload_deviceNumber(this.__wbg_ptr);
    return ret === 16777215 ? undefined : ret;
  }
  set deviceNumber(arg0) {
    wasm.__wbg_set_registrationpayload_deviceNumber(this.__wbg_ptr, isLikeNone(arg0) ? 16777215 : arg0);
  }
  get authenticatorOptions() {
    const ret = wasm.__wbg_get_registrationpayload_authenticatorOptions(this.__wbg_ptr);
    return ret === 0 ? undefined : AuthenticatorOptions.__wrap(ret);
  }
  set authenticatorOptions(arg0) {
    let ptr0 = 0;
    if (!isLikeNone(arg0)) {
      _assertClass(arg0, AuthenticatorOptions);
      ptr0 = arg0.__destroy_into_raw();
    }
    wasm.__wbg_set_registrationpayload_authenticatorOptions(this.__wbg_ptr, ptr0);
  }
}
var RegistrationResponseFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_registrationresponse_free(ptr >>> 0, 1));

class RegistrationResponse {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(RegistrationResponse.prototype);
    obj.__wbg_ptr = ptr;
    RegistrationResponseFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    RegistrationResponseFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_registrationresponse_free(ptr, 0);
  }
  get clientDataJSON() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_registrationresponse_clientDataJSON(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set clientDataJSON(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_authenticationresponse_clientDataJSON(this.__wbg_ptr, ptr0, len0);
  }
  get attestationObject() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_registrationresponse_attestationObject(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set attestationObject(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_authenticationresponse_authenticatorData(this.__wbg_ptr, ptr0, len0);
  }
  get transports() {
    const ret = wasm.__wbg_get_registrationresponse_transports(this.__wbg_ptr);
    var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
  }
  set transports(arg0) {
    const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_registrationresponse_transports(this.__wbg_ptr, ptr0, len0);
  }
}
var RegistrationResultFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_registrationresult_free(ptr >>> 0, 1));

class RegistrationResult {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    RegistrationResultFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_registrationresult_free(ptr, 0);
  }
  get verified() {
    const ret = wasm.__wbg_get_registrationresult_verified(this.__wbg_ptr);
    return ret !== 0;
  }
  set verified(arg0) {
    wasm.__wbg_set_registrationresult_verified(this.__wbg_ptr, arg0);
  }
  get registrationInfo() {
    const ret = wasm.__wbg_get_registrationresult_registrationInfo(this.__wbg_ptr);
    return ret === 0 ? undefined : RegistrationInfoStruct.__wrap(ret);
  }
  set registrationInfo(arg0) {
    let ptr0 = 0;
    if (!isLikeNone(arg0)) {
      _assertClass(arg0, RegistrationInfoStruct);
      ptr0 = arg0.__destroy_into_raw();
    }
    wasm.__wbg_set_registrationresult_registrationInfo(this.__wbg_ptr, ptr0);
  }
  get logs() {
    const ret = wasm.__wbg_get_registrationresult_logs(this.__wbg_ptr);
    var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
  }
  set logs(arg0) {
    const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_registrationresult_logs(this.__wbg_ptr, ptr0, len0);
  }
  get signedTransaction() {
    const ret = wasm.__wbg_get_registrationresult_signedTransaction(this.__wbg_ptr);
    return ret === 0 ? undefined : WasmSignedTransaction.__wrap(ret);
  }
  set signedTransaction(arg0) {
    let ptr0 = 0;
    if (!isLikeNone(arg0)) {
      _assertClass(arg0, WasmSignedTransaction);
      ptr0 = arg0.__destroy_into_raw();
    }
    wasm.__wbg_set_registrationresult_signedTransaction(this.__wbg_ptr, ptr0);
  }
  get preSignedDeleteTransaction() {
    const ret = wasm.__wbg_get_registrationresult_preSignedDeleteTransaction(this.__wbg_ptr);
    return ret === 0 ? undefined : WasmSignedTransaction.__wrap(ret);
  }
  set preSignedDeleteTransaction(arg0) {
    let ptr0 = 0;
    if (!isLikeNone(arg0)) {
      _assertClass(arg0, WasmSignedTransaction);
      ptr0 = arg0.__destroy_into_raw();
    }
    wasm.__wbg_set_registrationresult_preSignedDeleteTransaction(this.__wbg_ptr, ptr0);
  }
  get error() {
    const ret = wasm.__wbg_get_registrationresult_error(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getStringFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set error(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_registrationresult_error(this.__wbg_ptr, ptr0, len0);
  }
  constructor(verified, registration_info, logs, signed_transaction, pre_signed_delete_transaction, error) {
    let ptr0 = 0;
    if (!isLikeNone(registration_info)) {
      _assertClass(registration_info, RegistrationInfoStruct);
      ptr0 = registration_info.__destroy_into_raw();
    }
    const ptr1 = passArrayJsValueToWasm0(logs, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    let ptr2 = 0;
    if (!isLikeNone(signed_transaction)) {
      _assertClass(signed_transaction, WasmSignedTransaction);
      ptr2 = signed_transaction.__destroy_into_raw();
    }
    let ptr3 = 0;
    if (!isLikeNone(pre_signed_delete_transaction)) {
      _assertClass(pre_signed_delete_transaction, WasmSignedTransaction);
      ptr3 = pre_signed_delete_transaction.__destroy_into_raw();
    }
    var ptr4 = isLikeNone(error) ? 0 : passStringToWasm0(error, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len4 = WASM_VECTOR_LEN;
    const ret = wasm.registrationresult_new(verified, ptr0, ptr1, len1, ptr2, ptr3, ptr4, len4);
    this.__wbg_ptr = ret >>> 0;
    RegistrationResultFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
}
var RpcCallPayloadFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_rpccallpayload_free(ptr >>> 0, 1));

class RpcCallPayload {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(RpcCallPayload.prototype);
    obj.__wbg_ptr = ptr;
    RpcCallPayloadFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    RpcCallPayloadFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_rpccallpayload_free(ptr, 0);
  }
  get contractId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_rpccallpayload_contractId(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set contractId(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyData(this.__wbg_ptr, ptr0, len0);
  }
  get nearRpcUrl() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_rpccallpayload_nearRpcUrl(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set nearRpcUrl(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyIv(this.__wbg_ptr, ptr0, len0);
  }
  get nearAccountId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_rpccallpayload_nearAccountId(this.__wbg_ptr);
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
    wasm.__wbg_set_registrationpayload_blockHash(this.__wbg_ptr, ptr0, len0);
  }
}
var SerializedCredentialFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_serializedcredential_free(ptr >>> 0, 1));

class SerializedCredential {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(SerializedCredential.prototype);
    obj.__wbg_ptr = ptr;
    SerializedCredentialFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    SerializedCredentialFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_serializedcredential_free(ptr, 0);
  }
  get id() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_serializedcredential_id(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set id(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_authenticationresponse_clientDataJSON(this.__wbg_ptr, ptr0, len0);
  }
  get rawId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_serializedcredential_rawId(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set rawId(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_authenticationresponse_authenticatorData(this.__wbg_ptr, ptr0, len0);
  }
  get type() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_serializedcredential_type(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set type(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_authenticationresponse_signature(this.__wbg_ptr, ptr0, len0);
  }
  get authenticatorAttachment() {
    const ret = wasm.__wbg_get_serializedcredential_authenticatorAttachment(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getStringFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set authenticatorAttachment(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_serializedcredential_authenticatorAttachment(this.__wbg_ptr, ptr0, len0);
  }
  get response() {
    const ret = wasm.__wbg_get_serializedcredential_response(this.__wbg_ptr);
    return AuthenticationResponse.__wrap(ret);
  }
  set response(arg0) {
    _assertClass(arg0, AuthenticationResponse);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_serializedcredential_response(this.__wbg_ptr, ptr0);
  }
  get clientExtensionResults() {
    const ret = wasm.__wbg_get_serializedcredential_clientExtensionResults(this.__wbg_ptr);
    return ClientExtensionResults.__wrap(ret);
  }
  set clientExtensionResults(arg0) {
    _assertClass(arg0, ClientExtensionResults);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_serializedcredential_clientExtensionResults(this.__wbg_ptr, ptr0);
  }
}
var SerializedRegistrationCredentialFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_serializedregistrationcredential_free(ptr >>> 0, 1));

class SerializedRegistrationCredential {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(SerializedRegistrationCredential.prototype);
    obj.__wbg_ptr = ptr;
    SerializedRegistrationCredentialFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    SerializedRegistrationCredentialFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_serializedregistrationcredential_free(ptr, 0);
  }
  get id() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_serializedregistrationcredential_id(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set id(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_authenticationresponse_clientDataJSON(this.__wbg_ptr, ptr0, len0);
  }
  get rawId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_serializedregistrationcredential_rawId(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set rawId(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_authenticationresponse_authenticatorData(this.__wbg_ptr, ptr0, len0);
  }
  get type() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_serializedregistrationcredential_type(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set type(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_authenticationresponse_signature(this.__wbg_ptr, ptr0, len0);
  }
  get authenticatorAttachment() {
    const ret = wasm.__wbg_get_serializedregistrationcredential_authenticatorAttachment(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getStringFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set authenticatorAttachment(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_serializedregistrationcredential_authenticatorAttachment(this.__wbg_ptr, ptr0, len0);
  }
  get response() {
    const ret = wasm.__wbg_get_serializedregistrationcredential_response(this.__wbg_ptr);
    return RegistrationResponse.__wrap(ret);
  }
  set response(arg0) {
    _assertClass(arg0, RegistrationResponse);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_serializedregistrationcredential_response(this.__wbg_ptr, ptr0);
  }
  get clientExtensionResults() {
    const ret = wasm.__wbg_get_serializedregistrationcredential_clientExtensionResults(this.__wbg_ptr);
    return ClientExtensionResults.__wrap(ret);
  }
  set clientExtensionResults(arg0) {
    _assertClass(arg0, ClientExtensionResults);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_serializedregistrationcredential_clientExtensionResults(this.__wbg_ptr, ptr0);
  }
}
var SignNep413RequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_signnep413request_free(ptr >>> 0, 1));

class SignNep413Request {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    SignNep413RequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_signnep413request_free(ptr, 0);
  }
  get message() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_signnep413request_message(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set message(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_coseextractionresult_cosePublicKeyBytes(this.__wbg_ptr, ptr0, len0);
  }
  get recipient() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_signnep413request_recipient(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set recipient(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_signnep413request_recipient(this.__wbg_ptr, ptr0, len0);
  }
  get nonce() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_signnep413request_nonce(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set nonce(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_signnep413request_nonce(this.__wbg_ptr, ptr0, len0);
  }
  get state() {
    const ret = wasm.__wbg_get_signnep413request_state(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getStringFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set state(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_signnep413request_state(this.__wbg_ptr, ptr0, len0);
  }
  get accountId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_signnep413request_accountId(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set accountId(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_signnep413request_accountId(this.__wbg_ptr, ptr0, len0);
  }
  get encryptedPrivateKeyData() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_signnep413request_encryptedPrivateKeyData(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set encryptedPrivateKeyData(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_signnep413request_encryptedPrivateKeyData(this.__wbg_ptr, ptr0, len0);
  }
  get encryptedPrivateKeyIv() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_signnep413request_encryptedPrivateKeyIv(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set encryptedPrivateKeyIv(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_signnep413request_encryptedPrivateKeyIv(this.__wbg_ptr, ptr0, len0);
  }
  get prfOutput() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_signnep413request_prfOutput(this.__wbg_ptr);
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
    wasm.__wbg_set_signnep413request_prfOutput(this.__wbg_ptr, ptr0, len0);
  }
}
var SignNep413ResultFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_signnep413result_free(ptr >>> 0, 1));

class SignNep413Result {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    SignNep413ResultFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_signnep413result_free(ptr, 0);
  }
  get accountId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_signnep413result_accountId(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set accountId(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_coseextractionresult_cosePublicKeyBytes(this.__wbg_ptr, ptr0, len0);
  }
  get publicKey() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_signnep413result_publicKey(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set publicKey(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_signnep413request_recipient(this.__wbg_ptr, ptr0, len0);
  }
  get signature() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_signnep413result_signature(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set signature(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_signnep413request_nonce(this.__wbg_ptr, ptr0, len0);
  }
  get state() {
    const ret = wasm.__wbg_get_signnep413result_state(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getStringFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set state(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_signnep413result_state(this.__wbg_ptr, ptr0, len0);
  }
  constructor(account_id, public_key, signature, state) {
    const ptr0 = passStringToWasm0(account_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(public_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(signature, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    var ptr3 = isLikeNone(state) ? 0 : passStringToWasm0(state, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len3 = WASM_VECTOR_LEN;
    const ret = wasm.signnep413result_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
    this.__wbg_ptr = ret >>> 0;
    SignNep413ResultFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
}
var SignTransactionWithKeyPairRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_signtransactionwithkeypairrequest_free(ptr >>> 0, 1));

class SignTransactionWithKeyPairRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    SignTransactionWithKeyPairRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_signtransactionwithkeypairrequest_free(ptr, 0);
  }
  get nearPrivateKey() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_signtransactionwithkeypairrequest_nearPrivateKey(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set nearPrivateKey(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_dualprfoutputsstruct_chacha20PrfOutput(this.__wbg_ptr, ptr0, len0);
  }
  get signerAccountId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_signtransactionwithkeypairrequest_signerAccountId(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set signerAccountId(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_dualprfoutputsstruct_ed25519PrfOutput(this.__wbg_ptr, ptr0, len0);
  }
  get receiverId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_signtransactionwithkeypairrequest_receiverId(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set receiverId(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_derivenearkeypairandencryptrequest_nearAccountId(this.__wbg_ptr, ptr0, len0);
  }
  get nonce() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_signtransactionwithkeypairrequest_nonce(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set nonce(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_signtransactionwithkeypairrequest_nonce(this.__wbg_ptr, ptr0, len0);
  }
  get blockHash() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_signtransactionwithkeypairrequest_blockHash(this.__wbg_ptr);
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
    wasm.__wbg_set_signtransactionwithkeypairrequest_blockHash(this.__wbg_ptr, ptr0, len0);
  }
  get actions() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_signtransactionwithkeypairrequest_actions(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set actions(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_signtransactionwithkeypairrequest_actions(this.__wbg_ptr, ptr0, len0);
  }
}
var SignTransactionsWithActionsRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_signtransactionswithactionsrequest_free(ptr >>> 0, 1));

class SignTransactionsWithActionsRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    SignTransactionsWithActionsRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_signtransactionswithactionsrequest_free(ptr, 0);
  }
  get rpcCall() {
    const ret = wasm.__wbg_get_signtransactionswithactionsrequest_rpcCall(this.__wbg_ptr);
    return RpcCallPayload.__wrap(ret);
  }
  set rpcCall(arg0) {
    _assertClass(arg0, RpcCallPayload);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_signtransactionswithactionsrequest_rpcCall(this.__wbg_ptr, ptr0);
  }
  get decryption() {
    const ret = wasm.__wbg_get_signtransactionswithactionsrequest_decryption(this.__wbg_ptr);
    return DecryptionPayload.__wrap(ret);
  }
  set decryption(arg0) {
    _assertClass(arg0, DecryptionPayload);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_signtransactionswithactionsrequest_decryption(this.__wbg_ptr, ptr0);
  }
  get txSigningRequests() {
    const ret = wasm.__wbg_get_signtransactionswithactionsrequest_txSigningRequests(this.__wbg_ptr);
    var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
  }
  set txSigningRequests(arg0) {
    const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_signtransactionswithactionsrequest_txSigningRequests(this.__wbg_ptr, ptr0, len0);
  }
  get confirmationConfig() {
    const ret = wasm.__wbg_get_signtransactionswithactionsrequest_confirmationConfig(this.__wbg_ptr);
    return ret === 0 ? undefined : ConfirmationConfig.__wrap(ret);
  }
  set confirmationConfig(arg0) {
    let ptr0 = 0;
    if (!isLikeNone(arg0)) {
      _assertClass(arg0, ConfirmationConfig);
      ptr0 = arg0.__destroy_into_raw();
    }
    wasm.__wbg_set_signtransactionswithactionsrequest_confirmationConfig(this.__wbg_ptr, ptr0);
  }
}
var SignVerifyAndRegisterUserRequestFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_signverifyandregisteruserrequest_free(ptr >>> 0, 1));

class SignVerifyAndRegisterUserRequest {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    SignVerifyAndRegisterUserRequestFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_signverifyandregisteruserrequest_free(ptr, 0);
  }
  get verification() {
    const ret = wasm.__wbg_get_signverifyandregisteruserrequest_verification(this.__wbg_ptr);
    return VerificationPayload.__wrap(ret);
  }
  set verification(arg0) {
    _assertClass(arg0, VerificationPayload);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_signverifyandregisteruserrequest_verification(this.__wbg_ptr, ptr0);
  }
  get decryption() {
    const ret = wasm.__wbg_get_signverifyandregisteruserrequest_decryption(this.__wbg_ptr);
    return DecryptionPayload.__wrap(ret);
  }
  set decryption(arg0) {
    _assertClass(arg0, DecryptionPayload);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_signverifyandregisteruserrequest_decryption(this.__wbg_ptr, ptr0);
  }
  get registration() {
    const ret = wasm.__wbg_get_signverifyandregisteruserrequest_registration(this.__wbg_ptr);
    return RegistrationPayload.__wrap(ret);
  }
  set registration(arg0) {
    _assertClass(arg0, RegistrationPayload);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_signverifyandregisteruserrequest_registration(this.__wbg_ptr, ptr0);
  }
}
var TransactionContextFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_transactioncontext_free(ptr >>> 0, 1));

class TransactionContext {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    TransactionContextFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_transactioncontext_free(ptr, 0);
  }
  get nearPublicKeyStr() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_transactioncontext_nearPublicKeyStr(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set nearPublicKeyStr(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyData(this.__wbg_ptr, ptr0, len0);
  }
  get nextNonce() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_transactioncontext_nextNonce(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set nextNonce(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyIv(this.__wbg_ptr, ptr0, len0);
  }
  get txBlockHeight() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_transactioncontext_txBlockHeight(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set txBlockHeight(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_registrationpayload_blockHash(this.__wbg_ptr, ptr0, len0);
  }
  get txBlockHash() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_transactioncontext_txBlockHash(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set txBlockHash(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_transactioncontext_txBlockHash(this.__wbg_ptr, ptr0, len0);
  }
}
var TransactionPayloadFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_transactionpayload_free(ptr >>> 0, 1));

class TransactionPayload {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(TransactionPayload.prototype);
    obj.__wbg_ptr = ptr;
    TransactionPayloadFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  static __unwrap(jsValue) {
    if (!(jsValue instanceof TransactionPayload)) {
      return 0;
    }
    return jsValue.__destroy_into_raw();
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    TransactionPayloadFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_transactionpayload_free(ptr, 0);
  }
  get nearAccountId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_transactionpayload_nearAccountId(this.__wbg_ptr);
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
    wasm.__wbg_set_decryption_chacha20_prf_output(this.__wbg_ptr, ptr0, len0);
  }
  get receiverId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_transactionpayload_receiverId(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set receiverId(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryption_encrypted_private_key_data(this.__wbg_ptr, ptr0, len0);
  }
  get actions() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_transactionpayload_actions(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set actions(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryption_encrypted_private_key_iv(this.__wbg_ptr, ptr0, len0);
  }
}
var TransactionSignResultFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_transactionsignresult_free(ptr >>> 0, 1));

class TransactionSignResult {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(TransactionSignResult.prototype);
    obj.__wbg_ptr = ptr;
    TransactionSignResultFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    TransactionSignResultFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_transactionsignresult_free(ptr, 0);
  }
  get success() {
    const ret = wasm.__wbg_get_transactionsignresult_success(this.__wbg_ptr);
    return ret !== 0;
  }
  set success(arg0) {
    wasm.__wbg_set_transactionsignresult_success(this.__wbg_ptr, arg0);
  }
  get transactionHashes() {
    const ret = wasm.__wbg_get_transactionsignresult_transactionHashes(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    }
    return v1;
  }
  set transactionHashes(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_transactionsignresult_transactionHashes(this.__wbg_ptr, ptr0, len0);
  }
  get signedTransactions() {
    const ret = wasm.__wbg_get_transactionsignresult_signedTransactions(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    }
    return v1;
  }
  set signedTransactions(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_transactionsignresult_signedTransactions(this.__wbg_ptr, ptr0, len0);
  }
  get logs() {
    const ret = wasm.__wbg_get_transactionsignresult_logs(this.__wbg_ptr);
    var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
  }
  set logs(arg0) {
    const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_transactionsignresult_logs(this.__wbg_ptr, ptr0, len0);
  }
  get error() {
    const ret = wasm.__wbg_get_transactionsignresult_error(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getStringFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set error(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_recoverkeypairresult_accountIdHint(this.__wbg_ptr, ptr0, len0);
  }
  constructor(success, transaction_hashes, signed_transactions, logs, error) {
    var ptr0 = isLikeNone(transaction_hashes) ? 0 : passArrayJsValueToWasm0(transaction_hashes, wasm.__wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    var ptr1 = isLikeNone(signed_transactions) ? 0 : passArrayJsValueToWasm0(signed_transactions, wasm.__wbindgen_malloc);
    var len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayJsValueToWasm0(logs, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    var ptr3 = isLikeNone(error) ? 0 : passStringToWasm0(error, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len3 = WASM_VECTOR_LEN;
    const ret = wasm.transactionsignresult_new(success, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
    this.__wbg_ptr = ret >>> 0;
    TransactionSignResultFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
  static failed(logs, error_msg) {
    const ptr0 = passArrayJsValueToWasm0(logs, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(error_msg, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.transactionsignresult_failed(ptr0, len0, ptr1, len1);
    return TransactionSignResult.__wrap(ret);
  }
}
var VerificationPayloadFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_verificationpayload_free(ptr >>> 0, 1));

class VerificationPayload {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(VerificationPayload.prototype);
    obj.__wbg_ptr = ptr;
    VerificationPayloadFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    VerificationPayloadFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_verificationpayload_free(ptr, 0);
  }
  get contractId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_verificationpayload_contractId(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set contractId(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyData(this.__wbg_ptr, ptr0, len0);
  }
  get nearRpcUrl() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_verificationpayload_nearRpcUrl(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set nearRpcUrl(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyIv(this.__wbg_ptr, ptr0, len0);
  }
  get vrfChallenge() {
    const ret = wasm.__wbg_get_verificationpayload_vrfChallenge(this.__wbg_ptr);
    return ret === 0 ? undefined : VrfChallenge.__wrap(ret);
  }
  set vrfChallenge(arg0) {
    let ptr0 = 0;
    if (!isLikeNone(arg0)) {
      _assertClass(arg0, VrfChallenge);
      ptr0 = arg0.__destroy_into_raw();
    }
    wasm.__wbg_set_verificationpayload_vrfChallenge(this.__wbg_ptr, ptr0);
  }
}
var VrfChallengeFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_vrfchallenge_free(ptr >>> 0, 1));

class VrfChallenge {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(VrfChallenge.prototype);
    obj.__wbg_ptr = ptr;
    VrfChallengeFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    VrfChallengeFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_vrfchallenge_free(ptr, 0);
  }
  get vrfInput() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_vrfchallenge_vrfInput(this.__wbg_ptr);
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
    wasm.__wbg_set_authenticationresponse_clientDataJSON(this.__wbg_ptr, ptr0, len0);
  }
  get vrfOutput() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_vrfchallenge_vrfOutput(this.__wbg_ptr);
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
    wasm.__wbg_set_authenticationresponse_authenticatorData(this.__wbg_ptr, ptr0, len0);
  }
  get vrfProof() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_vrfchallenge_vrfProof(this.__wbg_ptr);
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
    wasm.__wbg_set_authenticationresponse_signature(this.__wbg_ptr, ptr0, len0);
  }
  get vrfPublicKey() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_vrfchallenge_vrfPublicKey(this.__wbg_ptr);
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
    wasm.__wbg_set_vrfchallenge_vrfPublicKey(this.__wbg_ptr, ptr0, len0);
  }
  get userId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_vrfchallenge_userId(this.__wbg_ptr);
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
    wasm.__wbg_set_vrfchallenge_userId(this.__wbg_ptr, ptr0, len0);
  }
  get rpId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_vrfchallenge_rpId(this.__wbg_ptr);
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
    wasm.__wbg_set_vrfchallenge_rpId(this.__wbg_ptr, ptr0, len0);
  }
  get blockHeight() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_vrfchallenge_blockHeight(this.__wbg_ptr);
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
    wasm.__wbg_set_vrfchallenge_blockHeight(this.__wbg_ptr, ptr0, len0);
  }
  get blockHash() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_vrfchallenge_blockHash(this.__wbg_ptr);
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
    wasm.__wbg_set_vrfchallenge_blockHash(this.__wbg_ptr, ptr0, len0);
  }
}
var WasmPublicKeyFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_wasmpublickey_free(ptr >>> 0, 1));

class WasmPublicKey {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(WasmPublicKey.prototype);
    obj.__wbg_ptr = ptr;
    WasmPublicKeyFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    WasmPublicKeyFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_wasmpublickey_free(ptr, 0);
  }
  get keyType() {
    const ret = wasm.__wbg_get_wasmpublickey_keyType(this.__wbg_ptr);
    return ret;
  }
  set keyType(arg0) {
    wasm.__wbg_set_wasmpublickey_keyType(this.__wbg_ptr, arg0);
  }
  get keyData() {
    const ret = wasm.__wbg_get_wasmpublickey_keyData(this.__wbg_ptr);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
  }
  set keyData(arg0) {
    const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_wasmpublickey_keyData(this.__wbg_ptr, ptr0, len0);
  }
  constructor(keyType, keyData) {
    const ptr0 = passArray8ToWasm0(keyData, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.wasmpublickey_new(keyType, ptr0, len0);
    this.__wbg_ptr = ret >>> 0;
    WasmPublicKeyFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
}
var WasmSignatureFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_wasmsignature_free(ptr >>> 0, 1));

class WasmSignature {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(WasmSignature.prototype);
    obj.__wbg_ptr = ptr;
    WasmSignatureFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    WasmSignatureFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_wasmsignature_free(ptr, 0);
  }
  get keyType() {
    const ret = wasm.__wbg_get_wasmpublickey_keyType(this.__wbg_ptr);
    return ret;
  }
  set keyType(arg0) {
    wasm.__wbg_set_wasmpublickey_keyType(this.__wbg_ptr, arg0);
  }
  get signatureData() {
    const ret = wasm.__wbg_get_wasmsignature_signatureData(this.__wbg_ptr);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
  }
  set signatureData(arg0) {
    const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_wasmpublickey_keyData(this.__wbg_ptr, ptr0, len0);
  }
  constructor(keyType, signatureData) {
    const ptr0 = passArray8ToWasm0(signatureData, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.wasmpublickey_new(keyType, ptr0, len0);
    this.__wbg_ptr = ret >>> 0;
    WasmSignatureFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
}
var WasmSignedTransactionFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_wasmsignedtransaction_free(ptr >>> 0, 1));

class WasmSignedTransaction {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(WasmSignedTransaction.prototype);
    obj.__wbg_ptr = ptr;
    WasmSignedTransactionFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  static __unwrap(jsValue) {
    if (!(jsValue instanceof WasmSignedTransaction)) {
      return 0;
    }
    return jsValue.__destroy_into_raw();
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    WasmSignedTransactionFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_wasmsignedtransaction_free(ptr, 0);
  }
  get transaction() {
    const ret = wasm.__wbg_get_wasmsignedtransaction_transaction(this.__wbg_ptr);
    return WasmTransaction.__wrap(ret);
  }
  set transaction(arg0) {
    _assertClass(arg0, WasmTransaction);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_wasmsignedtransaction_transaction(this.__wbg_ptr, ptr0);
  }
  get signature() {
    const ret = wasm.__wbg_get_wasmsignedtransaction_signature(this.__wbg_ptr);
    return WasmSignature.__wrap(ret);
  }
  set signature(arg0) {
    _assertClass(arg0, WasmSignature);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_wasmsignedtransaction_signature(this.__wbg_ptr, ptr0);
  }
  get borshBytes() {
    const ret = wasm.__wbg_get_wasmsignedtransaction_borshBytes(this.__wbg_ptr);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
  }
  set borshBytes(arg0) {
    const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_wasmsignedtransaction_borshBytes(this.__wbg_ptr, ptr0, len0);
  }
  constructor(transaction, signature, borshBytes) {
    _assertClass(transaction, WasmTransaction);
    var ptr0 = transaction.__destroy_into_raw();
    _assertClass(signature, WasmSignature);
    var ptr1 = signature.__destroy_into_raw();
    const ptr2 = passArray8ToWasm0(borshBytes, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.wasmsignedtransaction_new(ptr0, ptr1, ptr2, len2);
    this.__wbg_ptr = ret >>> 0;
    WasmSignedTransactionFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
}
var WasmTransactionFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_wasmtransaction_free(ptr >>> 0, 1));

class WasmTransaction {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(WasmTransaction.prototype);
    obj.__wbg_ptr = ptr;
    WasmTransactionFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    WasmTransactionFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_wasmtransaction_free(ptr, 0);
  }
  get signerId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_wasmtransaction_signerId(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set signerId(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_wasmtransaction_signerId(this.__wbg_ptr, ptr0, len0);
  }
  get publicKey() {
    const ret = wasm.__wbg_get_wasmtransaction_publicKey(this.__wbg_ptr);
    return WasmPublicKey.__wrap(ret);
  }
  set publicKey(arg0) {
    _assertClass(arg0, WasmPublicKey);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_wasmtransaction_publicKey(this.__wbg_ptr, ptr0);
  }
  get nonce() {
    const ret = wasm.__wbg_get_wasmtransaction_nonce(this.__wbg_ptr);
    return BigInt.asUintN(64, ret);
  }
  set nonce(arg0) {
    wasm.__wbg_set_wasmtransaction_nonce(this.__wbg_ptr, arg0);
  }
  get receiverId() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_wasmtransaction_receiverId(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set receiverId(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_wasmtransaction_receiverId(this.__wbg_ptr, ptr0, len0);
  }
  get blockHash() {
    const ret = wasm.__wbg_get_wasmtransaction_blockHash(this.__wbg_ptr);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
  }
  set blockHash(arg0) {
    const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_wasmtransaction_blockHash(this.__wbg_ptr, ptr0, len0);
  }
  get actionsJson() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_wasmtransaction_actionsJson(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set actionsJson(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_wasmtransaction_actionsJson(this.__wbg_ptr, ptr0, len0);
  }
  constructor(signerId, publicKey, nonce, receiverId, blockHash, actionsJson) {
    const ptr0 = passStringToWasm0(signerId, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    _assertClass(publicKey, WasmPublicKey);
    var ptr1 = publicKey.__destroy_into_raw();
    const ptr2 = passStringToWasm0(receiverId, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArray8ToWasm0(blockHash, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ptr4 = passStringToWasm0(actionsJson, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len4 = WASM_VECTOR_LEN;
    const ret = wasm.wasmtransaction_new(ptr0, len0, ptr1, nonce, ptr2, len2, ptr3, len3, ptr4, len4);
    this.__wbg_ptr = ret >>> 0;
    WasmTransactionFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
}
var WebAuthnAuthenticationCredentialStructFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_webauthnauthenticationcredentialstruct_free(ptr >>> 0, 1));

class WebAuthnAuthenticationCredentialStruct {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    WebAuthnAuthenticationCredentialStructFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_webauthnauthenticationcredentialstruct_free(ptr, 0);
  }
  get id() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_webauthnauthenticationcredentialstruct_id(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set id(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_authenticationresponse_clientDataJSON(this.__wbg_ptr, ptr0, len0);
  }
  get raw_id() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_webauthnauthenticationcredentialstruct_raw_id(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set raw_id(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_authenticationresponse_authenticatorData(this.__wbg_ptr, ptr0, len0);
  }
  get credential_type() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_webauthnauthenticationcredentialstruct_credential_type(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set credential_type(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_authenticationresponse_signature(this.__wbg_ptr, ptr0, len0);
  }
  get authenticator_attachment() {
    const ret = wasm.__wbg_get_webauthnauthenticationcredentialstruct_authenticator_attachment(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getStringFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set authenticator_attachment(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_serializedregistrationcredential_authenticatorAttachment(this.__wbg_ptr, ptr0, len0);
  }
  get client_data_json() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_webauthnauthenticationcredentialstruct_client_data_json(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set client_data_json(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_vrfchallenge_vrfPublicKey(this.__wbg_ptr, ptr0, len0);
  }
  get authenticator_data() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_webauthnauthenticationcredentialstruct_authenticator_data(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set authenticator_data(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_vrfchallenge_userId(this.__wbg_ptr, ptr0, len0);
  }
  get signature() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_webauthnauthenticationcredentialstruct_signature(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set signature(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_vrfchallenge_rpId(this.__wbg_ptr, ptr0, len0);
  }
  get user_handle() {
    const ret = wasm.__wbg_get_webauthnauthenticationcredentialstruct_user_handle(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getStringFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set user_handle(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_serializedcredential_authenticatorAttachment(this.__wbg_ptr, ptr0, len0);
  }
  constructor(id, raw_id, credential_type, authenticator_attachment, client_data_json, authenticator_data, signature, user_handle) {
    const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(raw_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(credential_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    var ptr3 = isLikeNone(authenticator_attachment) ? 0 : passStringToWasm0(authenticator_attachment, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len3 = WASM_VECTOR_LEN;
    const ptr4 = passStringToWasm0(client_data_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len4 = WASM_VECTOR_LEN;
    const ptr5 = passStringToWasm0(authenticator_data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len5 = WASM_VECTOR_LEN;
    const ptr6 = passStringToWasm0(signature, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len6 = WASM_VECTOR_LEN;
    var ptr7 = isLikeNone(user_handle) ? 0 : passStringToWasm0(user_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len7 = WASM_VECTOR_LEN;
    const ret = wasm.webauthnauthenticationcredentialstruct_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6, ptr7, len7);
    this.__wbg_ptr = ret >>> 0;
    WebAuthnAuthenticationCredentialStructFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
}
var WebAuthnRegistrationCredentialStructFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_webauthnregistrationcredentialstruct_free(ptr >>> 0, 1));

class WebAuthnRegistrationCredentialStruct {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    WebAuthnRegistrationCredentialStructFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_webauthnregistrationcredentialstruct_free(ptr, 0);
  }
  get id() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_webauthnregistrationcredentialstruct_id(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set id(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_authenticationresponse_clientDataJSON(this.__wbg_ptr, ptr0, len0);
  }
  get raw_id() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_webauthnregistrationcredentialstruct_raw_id(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set raw_id(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_authenticationresponse_authenticatorData(this.__wbg_ptr, ptr0, len0);
  }
  get credential_type() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_webauthnregistrationcredentialstruct_credential_type(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set credential_type(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_authenticationresponse_signature(this.__wbg_ptr, ptr0, len0);
  }
  get authenticator_attachment() {
    const ret = wasm.__wbg_get_webauthnregistrationcredentialstruct_authenticator_attachment(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getStringFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set authenticator_attachment(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_webauthnregistrationcredentialstruct_authenticator_attachment(this.__wbg_ptr, ptr0, len0);
  }
  get client_data_json() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_webauthnregistrationcredentialstruct_client_data_json(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set client_data_json(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_vrfchallenge_vrfPublicKey(this.__wbg_ptr, ptr0, len0);
  }
  get attestation_object() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_webauthnregistrationcredentialstruct_attestation_object(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set attestation_object(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_vrfchallenge_userId(this.__wbg_ptr, ptr0, len0);
  }
  get transports() {
    const ret = wasm.__wbg_get_webauthnregistrationcredentialstruct_transports(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    }
    return v1;
  }
  set transports(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_webauthnregistrationcredentialstruct_transports(this.__wbg_ptr, ptr0, len0);
  }
  get ed25519_prf_output() {
    const ret = wasm.__wbg_get_webauthnregistrationcredentialstruct_ed25519_prf_output(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getStringFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set ed25519_prf_output(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_serializedcredential_authenticatorAttachment(this.__wbg_ptr, ptr0, len0);
  }
  constructor(id, raw_id, credential_type, authenticator_attachment, client_data_json, attestation_object, transports, ed25519_prf_output) {
    const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(raw_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(credential_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    var ptr3 = isLikeNone(authenticator_attachment) ? 0 : passStringToWasm0(authenticator_attachment, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len3 = WASM_VECTOR_LEN;
    const ptr4 = passStringToWasm0(client_data_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len4 = WASM_VECTOR_LEN;
    const ptr5 = passStringToWasm0(attestation_object, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len5 = WASM_VECTOR_LEN;
    var ptr6 = isLikeNone(transports) ? 0 : passArrayJsValueToWasm0(transports, wasm.__wbindgen_malloc);
    var len6 = WASM_VECTOR_LEN;
    var ptr7 = isLikeNone(ed25519_prf_output) ? 0 : passStringToWasm0(ed25519_prf_output, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len7 = WASM_VECTOR_LEN;
    const ret = wasm.webauthnregistrationcredentialstruct_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6, ptr7, len7);
    this.__wbg_ptr = ret >>> 0;
    WebAuthnRegistrationCredentialStructFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
}
var WorkerProgressMessageFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_workerprogressmessage_free(ptr >>> 0, 1));

class WorkerProgressMessage {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    WorkerProgressMessageFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_workerprogressmessage_free(ptr, 0);
  }
  get message_type() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_workerprogressmessage_message_type(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set message_type(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_workerprogressmessage_message_type(this.__wbg_ptr, ptr0, len0);
  }
  get step() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_workerprogressmessage_step(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set step(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_workerprogressmessage_step(this.__wbg_ptr, ptr0, len0);
  }
  get message() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_workerprogressmessage_message(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set message(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_workerprogressmessage_message(this.__wbg_ptr, ptr0, len0);
  }
  get status() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_workerprogressmessage_status(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  set status(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_workerprogressmessage_status(this.__wbg_ptr, ptr0, len0);
  }
  get timestamp() {
    const ret = wasm.__wbg_get_workerprogressmessage_timestamp(this.__wbg_ptr);
    return ret;
  }
  set timestamp(arg0) {
    wasm.__wbg_set_workerprogressmessage_timestamp(this.__wbg_ptr, arg0);
  }
  get data() {
    const ret = wasm.__wbg_get_workerprogressmessage_data(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getStringFromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
  }
  set data(arg0) {
    var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_workerprogressmessage_data(this.__wbg_ptr, ptr0, len0);
  }
  constructor(message_type, step, message, status, timestamp, data) {
    const ptr0 = passStringToWasm0(message_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(step, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(message, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passStringToWasm0(status, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len3 = WASM_VECTOR_LEN;
    var ptr4 = isLikeNone(data) ? 0 : passStringToWasm0(data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len4 = WASM_VECTOR_LEN;
    const ret = wasm.workerprogressmessage_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, timestamp, ptr4, len4);
    this.__wbg_ptr = ret >>> 0;
    WorkerProgressMessageFinalization.register(this, this.__wbg_ptr, this);
    return this;
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
  imports.wbg.__wbg_String_8f0eb39a4a4c2f66 = function(arg0, arg1) {
    const ret = String(arg1);
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbg_awaitSecureConfirmation_d61224543ac80ce1 = function(arg0, arg1, arg2, arg3, arg4, arg5) {
    const ret = awaitSecureConfirmation(getStringFromWasm0(arg0, arg1), arg2, arg3, getStringFromWasm0(arg4, arg5));
    return ret;
  };
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
  imports.wbg.__wbg_done_769e5ede4b31c67b = function(arg0) {
    const ret = arg0.done;
    return ret;
  };
  imports.wbg.__wbg_entries_3265d4158b33e5dc = function(arg0) {
    const ret = Object.entries(arg0);
    return ret;
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
  imports.wbg.__wbg_get_b9b93047fe3cf45b = function(arg0, arg1) {
    const ret = arg0[arg1 >>> 0];
    return ret;
  };
  imports.wbg.__wbg_getwithrefkey_1dc361bd10053bfe = function(arg0, arg1) {
    const ret = arg0[arg1];
    return ret;
  };
  imports.wbg.__wbg_info_033d8b8a0838f1d3 = function(arg0, arg1, arg2, arg3) {
    console.info(arg0, arg1, arg2, arg3);
  };
  imports.wbg.__wbg_instanceof_ArrayBuffer_e14585432e3737fc = function(arg0) {
    let result;
    try {
      result = arg0 instanceof ArrayBuffer;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_instanceof_Map_f3469ce2244d2430 = function(arg0) {
    let result;
    try {
      result = arg0 instanceof Map;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_instanceof_Promise_935168b8f4b49db3 = function(arg0) {
    let result;
    try {
      result = arg0 instanceof Promise;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
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
  imports.wbg.__wbg_instanceof_Uint8Array_17156bcf118086a9 = function(arg0) {
    let result;
    try {
      result = arg0 instanceof Uint8Array;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_isArray_a1eab7e0d067391b = function(arg0) {
    const ret = Array.isArray(arg0);
    return ret;
  };
  imports.wbg.__wbg_isSafeInteger_343e2beeeece1bb0 = function(arg0) {
    const ret = Number.isSafeInteger(arg0);
    return ret;
  };
  imports.wbg.__wbg_iterator_9a24c88df860dc65 = function() {
    const ret = Symbol.iterator;
    return ret;
  };
  imports.wbg.__wbg_json_1671bfa3e3625686 = function() {
    return handleError(function(arg0) {
      const ret = arg0.json();
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_length_a446193dc22c12f8 = function(arg0) {
    const ret = arg0.length;
    return ret;
  };
  imports.wbg.__wbg_length_e2d2a49132c1b256 = function(arg0) {
    const ret = arg0.length;
    return ret;
  };
  imports.wbg.__wbg_log_4aa07facca81ff45 = function(arg0, arg1) {
    console.log(getStringFromWasm0(arg0, arg1));
  };
  imports.wbg.__wbg_log_c222819a41e063d3 = function(arg0) {
    console.log(arg0);
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
          return __wbg_adapter_568(a, state0.b, arg02, arg12);
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
  imports.wbg.__wbg_next_25feadfc0913fea9 = function(arg0) {
    const ret = arg0.next;
    return ret;
  };
  imports.wbg.__wbg_next_6574e1a8a62d1055 = function() {
    return handleError(function(arg0) {
      const ret = arg0.next();
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
  imports.wbg.__wbg_random_3ad904d98382defe = function() {
    const ret = Math.random();
    return ret;
  };
  imports.wbg.__wbg_require_60cc747a6bc5215a = function() {
    return handleError(function() {
      const ret = module_wasm_signer_worker.require;
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_resolve_4851785c9c5f573d = function(arg0) {
    const ret = Promise.resolve(arg0);
    return ret;
  };
  imports.wbg.__wbg_sendProgressMessage_f12fbbae1e730197 = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10, arg11) {
    sendProgressMessage(arg0 >>> 0, getStringFromWasm0(arg1, arg2), arg3 >>> 0, getStringFromWasm0(arg4, arg5), getStringFromWasm0(arg6, arg7), getStringFromWasm0(arg8, arg9), getStringFromWasm0(arg10, arg11));
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
  imports.wbg.__wbg_setmode_5dc300b865044b65 = function(arg0, arg1) {
    arg0.mode = __wbindgen_enum_RequestMode[arg1];
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
  imports.wbg.__wbg_transactionpayload_new = function(arg0) {
    const ret = TransactionPayload.__wrap(arg0);
    return ret;
  };
  imports.wbg.__wbg_transactionpayload_unwrap = function(arg0) {
    const ret = TransactionPayload.__unwrap(arg0);
    return ret;
  };
  imports.wbg.__wbg_value_cd1ffa7b1ab794f1 = function(arg0) {
    const ret = arg0.value;
    return ret;
  };
  imports.wbg.__wbg_versions_c01dfd4722a88165 = function(arg0) {
    const ret = arg0.versions;
    return ret;
  };
  imports.wbg.__wbg_warn_aaf1f4664a035bd6 = function(arg0, arg1, arg2, arg3) {
    console.warn(arg0, arg1, arg2, arg3);
  };
  imports.wbg.__wbg_wasmsignedtransaction_new = function(arg0) {
    const ret = WasmSignedTransaction.__wrap(arg0);
    return ret;
  };
  imports.wbg.__wbg_wasmsignedtransaction_unwrap = function(arg0) {
    const ret = WasmSignedTransaction.__unwrap(arg0);
    return ret;
  };
  imports.wbg.__wbindgen_bigint_from_i64 = function(arg0) {
    const ret = arg0;
    return ret;
  };
  imports.wbg.__wbindgen_bigint_from_u64 = function(arg0) {
    const ret = BigInt.asUintN(64, arg0);
    return ret;
  };
  imports.wbg.__wbindgen_bigint_get_as_i64 = function(arg0, arg1) {
    const v = arg1;
    const ret = typeof v === "bigint" ? v : undefined;
    getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
  };
  imports.wbg.__wbindgen_boolean_get = function(arg0) {
    const v = arg0;
    const ret = typeof v === "boolean" ? v ? 1 : 0 : 2;
    return ret;
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
  imports.wbg.__wbindgen_closure_wrapper1639 = function(arg0, arg1, arg2) {
    const ret = makeMutClosure(arg0, arg1, 209, __wbg_adapter_48);
    return ret;
  };
  imports.wbg.__wbindgen_debug_string = function(arg0, arg1) {
    const ret = debugString(arg1);
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbindgen_error_new = function(arg0, arg1) {
    const ret = new Error(getStringFromWasm0(arg0, arg1));
    return ret;
  };
  imports.wbg.__wbindgen_in = function(arg0, arg1) {
    const ret = arg0 in arg1;
    return ret;
  };
  imports.wbg.__wbindgen_init_externref_table = function() {
    const table = wasm.__wbindgen_export_4;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
  };
  imports.wbg.__wbindgen_is_bigint = function(arg0) {
    const ret = typeof arg0 === "bigint";
    return ret;
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
  imports.wbg.__wbindgen_jsval_eq = function(arg0, arg1) {
    const ret = arg0 === arg1;
    return ret;
  };
  imports.wbg.__wbindgen_jsval_loose_eq = function(arg0, arg1) {
    const ret = arg0 == arg1;
    return ret;
  };
  imports.wbg.__wbindgen_memory = function() {
    const ret = wasm.memory;
    return ret;
  };
  imports.wbg.__wbindgen_number_get = function(arg0, arg1) {
    const obj = arg1;
    const ret = typeof obj === "number" ? obj : undefined;
    getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
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
    module_or_path = new URL("wasm_signer_worker_bg.wasm", import.meta.url);
  }
  const imports = __wbg_get_imports();
  if (typeof module_or_path === "string" || typeof Request === "function" && module_or_path instanceof Request || typeof URL === "function" && module_or_path instanceof URL) {
    module_or_path = fetch(module_or_path);
  }
  __wbg_init_memory(imports);
  const { instance, module } = await __wbg_load(await module_or_path, imports);
  return __wbg_finalize_init(instance, module);
}
var wasm_signer_worker_default = __wbg_init;

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

// src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/awaitSecureConfirmation.ts
function awaitSecureConfirmation2(requestId, summary, confirmationData, txSigningRequestsJson) {
  return new Promise((resolve, reject) => {
    let parsedSummary;
    let parsedConfirmationData;
    let parsedTxSigningRequests = [];
    try {
      parsedSummary = parseSummary(summary);
      parsedConfirmationData = parseConfirmationData(confirmationData);
      parsedTxSigningRequests = parseTxSigningRequests(txSigningRequestsJson);
    } catch (error) {
      return reject(error);
    }
    const onDecisionReceived = (messageEvent) => {
      const { data } = messageEvent;
      if (data?.type === "USER_PASSKEY_CONFIRM_RESPONSE" /* USER_PASSKEY_CONFIRM_RESPONSE */ && data?.data?.requestId === requestId) {
        self.removeEventListener("message", onDecisionReceived);
        if (typeof data?.data?.confirmed !== "boolean") {
          return reject(new Error('[signer-worker]: Invalid confirmation response: missing boolean "confirmed"'));
        }
        resolve({
          request_id: requestId,
          intent_digest: data.data?.intentDigest,
          confirmed: !!data.data?.confirmed,
          credential: data.data?.credential,
          prf_output: data.data?.prfOutput,
          vrf_challenge: data.data?.vrfChallenge,
          transaction_context: data.data?.transactionContext,
          error: data.data?.error
        });
      }
    };
    self.addEventListener("message", onDecisionReceived);
    self.postMessage({
      type: "PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD" /* PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD */,
      data: {
        requestId,
        summary: parsedSummary,
        intentDigest: parsedConfirmationData?.intentDigest,
        rpcCall: parsedConfirmationData?.rpcCall,
        tx_signing_requests: parsedTxSigningRequests,
        confirmationConfig: parsedConfirmationData?.confirmationConfig
      }
    });
  });
}
function safeJsonParseStrict(jsonString, context) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error(`[signer-worker]: Failed to parse ${context} JSON:`, error);
    throw error instanceof Error ? error : new Error(`Invalid JSON in ${context}`);
  }
}
function parseSummary(summary) {
  if (summary.includes("to") && summary.includes("totalAmount")) {
    return safeJsonParseStrict(summary, "action summary");
  } else {
    return safeJsonParseStrict(summary, "registration summary");
  }
}
function parseConfirmationData(confirmationData) {
  let parsedConfirmationData = safeJsonParseStrict(confirmationData, "confirmationData");
  return parsedConfirmationData;
}
function parseTxSigningRequests(txSigningRequestsJson) {
  if (!txSigningRequestsJson) {
    return [];
  }
  return safeJsonParseStrict(txSigningRequestsJson, "txSigningRequestsJson");
}

// src/core/web3authn-signer.worker.ts
var wasmUrl = resolveWasmUrl("wasm_signer_worker_bg.wasm", "Signer Worker");
var { handle_signer_message: handle_signer_message2 } = exports_wasm_signer_worker;
var messageProcessed = false;
function sendProgressMessage2(messageType, messageTypeName, step, stepName, message, data, logs) {
  try {
    const parsedData = safeJsonParse(data, {});
    const parsedLogs = safeJsonParse(logs || "", []);
    const progressPayload = {
      step,
      phase: stepName,
      status: messageTypeName === "REGISTRATION_COMPLETE" || messageTypeName === "EXECUTE_ACTIONS_COMPLETE" ? "success" : "progress",
      message,
      data: parsedData,
      logs: parsedLogs
    };
    const progressMessage = {
      type: messageType,
      payload: progressPayload
    };
    self.postMessage(progressMessage);
  } catch (error) {
    console.error("[signer-worker]: Failed to send progress message:", error);
    self.postMessage({
      type: WorkerResponseType.DeriveNearKeypairAndEncryptFailure,
      payload: {
        error: `Progress message failed: ${extractErrorMessage(error)}`,
        context: { messageType, step, message }
      }
    });
  }
}
globalThis.sendProgressMessage = sendProgressMessage2;
globalThis.awaitSecureConfirmation = awaitSecureConfirmation2;
async function initializeWasm() {
  try {
    await wasm_signer_worker_default({ module_or_path: wasmUrl });
  } catch (error) {
    console.error("[signer-worker]: WASM initialization failed:", error);
    throw new Error(`WASM initialization failed: ${extractErrorMessage(error)}`);
  }
}
try {
  setTimeout(() => {
    try {
      self.postMessage({ type: "WORKER_READY", ready: true });
    } catch {}
  }, 0);
} catch (_) {}
async function processWorkerMessage(event) {
  messageProcessed = true;
  try {
    await initializeWasm();
    const messageJson = JSON.stringify(event.data);
    const responseJson = await handle_signer_message2(messageJson);
    const response = JSON.parse(responseJson);
    self.postMessage(response);
    self.close();
  } catch (error) {
    console.error("[signer-worker]: Message processing failed:", error);
    self.postMessage({
      type: WorkerResponseType.DeriveNearKeypairAndEncryptFailure,
      payload: {
        error: extractErrorMessage(error),
        context: { type: event.data.type }
      }
    });
    self.close();
  }
}
function sendInvalidMessageError(reason) {
  self.postMessage({
    type: WorkerResponseType.DeriveNearKeypairAndEncryptFailure,
    payload: { error: reason }
  });
  self.close();
}
self.onmessage = async (event) => {
  const eventType = event.data?.type;
  switch (true) {
    case !messageProcessed:
      await processWorkerMessage(event);
      break;
    case eventType === "USER_PASSKEY_CONFIRM_RESPONSE" /* USER_PASSKEY_CONFIRM_RESPONSE */:
      break;
    case messageProcessed:
      console.error("[signer-worker]: Invalid message - worker already processed initial message");
      sendInvalidMessageError("Worker has already processed a message");
      break;
    default:
      console.error("[signer-worker]: Unexpected message state");
      sendInvalidMessageError("Unexpected message state");
      break;
  }
};
self.onerror = (message, filename, lineno, colno, error) => {
  console.error("[signer-worker]: error:", {
    message: typeof message === "string" ? message : "Unknown error",
    filename: filename || "unknown",
    lineno: lineno || 0,
    colno: colno || 0,
    error
  });
};
self.onunhandledrejection = (event) => {
  console.error("[signer-worker]: Unhandled promise rejection:", event.reason);
  event.preventDefault();
};
function safeJsonParse(jsonString, fallback = {}) {
  try {
    return jsonString ? JSON.parse(jsonString) : fallback;
  } catch (error) {
    console.warn("[signer-worker]: Failed to parse JSON:", error);
    return Array.isArray(fallback) ? [jsonString] : { rawData: jsonString };
  }
}
function extractErrorMessage(error) {
  if (error && typeof error === "object") {
    if (error.message)
      return error.message;
    if (error.toString)
      return error.toString();
    return JSON.stringify(error);
  }
  return typeof error === "string" ? error : "Unknown error occurred";
}
