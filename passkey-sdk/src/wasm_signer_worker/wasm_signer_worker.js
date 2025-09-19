let wasm;

let WASM_VECTOR_LEN = 0;

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

const cachedTextEncoder = (typeof TextEncoder !== 'undefined' ? new TextEncoder('utf-8') : { encode: () => { throw Error('TextEncoder not available') } } );

const encodeString = (typeof cachedTextEncoder.encodeInto === 'function'
    ? function (arg, view) {
    return cachedTextEncoder.encodeInto(arg, view);
}
    : function (arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
        read: arg.length,
        written: buf.length
    };
});

function passStringToWasm0(arg, malloc, realloc) {

    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
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

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
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

const cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => { throw Error('TextDecoder not available') } } );

if (typeof TextDecoder !== 'undefined') { cachedTextDecoder.decode(); };

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => {
    wasm.__wbindgen_export_6.get(state.dtor)(state.a, state.b)
});

function makeMutClosure(arg0, arg1, dtor, f) {
    const state = { a: arg0, b: arg1, cnt: 1, dtor };
    const real = (...args) => {
        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
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
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayJsValueFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(wasm.__wbindgen_export_4.get(mem.getUint32(i, true)));
    }
    wasm.__externref_drop_slice(ptr, len);
    return result;
}

function passArrayJsValueToWasm0(array, malloc) {
    const ptr = malloc(array.length * 4, 4) >>> 0;
    for (let i = 0; i < array.length; i++) {
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

export function init_worker() {
    wasm.init_worker();
}

/**
 * Unified message handler for all signer worker operations
 * This replaces the TypeScript-based message dispatching with a Rust-based approach
 * for better type safety and performance
 * @param {string} message_json
 * @returns {Promise<string>}
 */
export function handle_signer_message(message_json) {
    const ptr0 = passStringToWasm0(message_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.handle_signer_message(ptr0, len0);
    return ret;
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
function __wbg_adapter_52(arg0, arg1, arg2) {
    wasm.closure207_externref_shim(arg0, arg1, arg2);
}

function __wbg_adapter_587(arg0, arg1, arg2, arg3) {
    wasm.closure239_externref_shim(arg0, arg1, arg2, arg3);
}

/**
 * Behavior mode for confirmation flow
 * @enum {0 | 1}
 */
export const ConfirmationBehavior = Object.freeze({
    RequireClick: 0, "0": "RequireClick",
    AutoProceed: 1, "1": "AutoProceed",
});
/**
 * UI mode for confirmation display
 * @enum {0 | 1 | 2}
 */
export const ConfirmationUIMode = Object.freeze({
    Skip: 0, "0": "Skip",
    Modal: 1, "1": "Modal",
    Embedded: 2, "2": "Embedded",
});
/**
 * Progress message types that can be sent during WASM operations
 * Values align with TypeScript WorkerResponseType enum for proper mapping
 *
 * Should match the Progress WorkerResponseTypes in worker_messages.rs:
 * - WorkerResponseType::RegistrationProgress
 * - WorkerResponseType::RegistrationComplete,
 * - WorkerResponseType::WebauthnAuthenticationProgress
 * - WorkerResponseType::AuthenticationComplete
 * - WorkerResponseType::TransactionSigningProgress
 * - WorkerResponseType::TransactionSigningComplete
 * @enum {18 | 19 | 20 | 21}
 */
export const ProgressMessageType = Object.freeze({
    RegistrationProgress: 18, "18": "RegistrationProgress",
    RegistrationComplete: 19, "19": "RegistrationComplete",
    ExecuteActionsProgress: 20, "20": "ExecuteActionsProgress",
    ExecuteActionsComplete: 21, "21": "ExecuteActionsComplete",
});
/**
 * Progress step identifiers for different phases of operations
 * Values start at 100 to avoid conflicts with WorkerResponseType enum
 * @enum {100 | 101 | 102 | 103 | 104 | 105 | 106 | 107}
 */
export const ProgressStep = Object.freeze({
    Preparation: 100, "100": "Preparation",
    UserConfirmation: 101, "101": "UserConfirmation",
    ContractVerification: 102, "102": "ContractVerification",
    WebauthnAuthentication: 103, "103": "WebauthnAuthentication",
    AuthenticationComplete: 104, "104": "AuthenticationComplete",
    TransactionSigningProgress: 105, "105": "TransactionSigningProgress",
    TransactionSigningComplete: 106, "106": "TransactionSigningComplete",
    Error: 107, "107": "Error",
});
/**
 * User verification policy for WebAuthn authenticators
 * @enum {0 | 1 | 2}
 */
export const UserVerificationPolicy = Object.freeze({
    Required: 0, "0": "Required",
    Preferred: 1, "1": "Preferred",
    Discouraged: 2, "2": "Discouraged",
});
/**
 * @enum {0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}
 */
export const WorkerRequestType = Object.freeze({
    DeriveNearKeypairAndEncrypt: 0, "0": "DeriveNearKeypairAndEncrypt",
    RecoverKeypairFromPasskey: 1, "1": "RecoverKeypairFromPasskey",
    CheckCanRegisterUser: 2, "2": "CheckCanRegisterUser",
    DecryptPrivateKeyWithPrf: 3, "3": "DecryptPrivateKeyWithPrf",
    SignTransactionsWithActions: 4, "4": "SignTransactionsWithActions",
    ExtractCosePublicKey: 5, "5": "ExtractCosePublicKey",
    SignTransactionWithKeyPair: 6, "6": "SignTransactionWithKeyPair",
    SignNep413Message: 7, "7": "SignNep413Message",
    RegistrationCredentialConfirmation: 8, "8": "RegistrationCredentialConfirmation",
});
/**
 * Worker response types enum - corresponds to TypeScript WorkerResponseType
 * @enum {0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21}
 */
export const WorkerResponseType = Object.freeze({
    DeriveNearKeypairAndEncryptSuccess: 0, "0": "DeriveNearKeypairAndEncryptSuccess",
    RecoverKeypairFromPasskeySuccess: 1, "1": "RecoverKeypairFromPasskeySuccess",
    CheckCanRegisterUserSuccess: 2, "2": "CheckCanRegisterUserSuccess",
    DecryptPrivateKeyWithPrfSuccess: 3, "3": "DecryptPrivateKeyWithPrfSuccess",
    SignTransactionsWithActionsSuccess: 4, "4": "SignTransactionsWithActionsSuccess",
    ExtractCosePublicKeySuccess: 5, "5": "ExtractCosePublicKeySuccess",
    SignTransactionWithKeyPairSuccess: 6, "6": "SignTransactionWithKeyPairSuccess",
    SignNep413MessageSuccess: 7, "7": "SignNep413MessageSuccess",
    RegistrationCredentialConfirmationSuccess: 8, "8": "RegistrationCredentialConfirmationSuccess",
    DeriveNearKeypairAndEncryptFailure: 9, "9": "DeriveNearKeypairAndEncryptFailure",
    RecoverKeypairFromPasskeyFailure: 10, "10": "RecoverKeypairFromPasskeyFailure",
    CheckCanRegisterUserFailure: 11, "11": "CheckCanRegisterUserFailure",
    DecryptPrivateKeyWithPrfFailure: 12, "12": "DecryptPrivateKeyWithPrfFailure",
    SignTransactionsWithActionsFailure: 13, "13": "SignTransactionsWithActionsFailure",
    ExtractCosePublicKeyFailure: 14, "14": "ExtractCosePublicKeyFailure",
    SignTransactionWithKeyPairFailure: 15, "15": "SignTransactionWithKeyPairFailure",
    SignNep413MessageFailure: 16, "16": "SignNep413MessageFailure",
    RegistrationCredentialConfirmationFailure: 17, "17": "RegistrationCredentialConfirmationFailure",
    RegistrationProgress: 18, "18": "RegistrationProgress",
    RegistrationComplete: 19, "19": "RegistrationComplete",
    ExecuteActionsProgress: 20, "20": "ExecuteActionsProgress",
    ExecuteActionsComplete: 21, "21": "ExecuteActionsComplete",
});

const __wbindgen_enum_RequestMode = ["same-origin", "no-cors", "cors", "navigate"];

const AuthenticationResponseFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_authenticationresponse_free(ptr >>> 0, 1));

export class AuthenticationResponse {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set clientDataJSON(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_authenticationresponse_clientDataJSON(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set authenticatorData(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_authenticationresponse_authenticatorData(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set signature(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_authenticationresponse_signature(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string | undefined}
     */
    get userHandle() {
        const ret = wasm.__wbg_get_authenticationresponse_userHandle(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {string | null} [arg0]
     */
    set userHandle(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_authenticationresponse_userHandle(this.__wbg_ptr, ptr0, len0);
    }
}

const AuthenticatorOptionsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_authenticatoroptions_free(ptr >>> 0, 1));
/**
 * Options for configuring WebAuthn authenticator behavior during registration
 */
export class AuthenticatorOptions {

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
    /**
     * @returns {UserVerificationPolicy | undefined}
     */
    get userVerification() {
        const ret = wasm.__wbg_get_authenticatoroptions_userVerification(this.__wbg_ptr);
        return ret === 3 ? undefined : ret;
    }
    /**
     * @param {UserVerificationPolicy | null} [arg0]
     */
    set userVerification(arg0) {
        wasm.__wbg_set_authenticatoroptions_userVerification(this.__wbg_ptr, isLikeNone(arg0) ? 3 : arg0);
    }
    /**
     * @returns {OriginPolicyInput | undefined}
     */
    get originPolicy() {
        const ret = wasm.__wbg_get_authenticatoroptions_originPolicy(this.__wbg_ptr);
        return ret === 0 ? undefined : OriginPolicyInput.__wrap(ret);
    }
    /**
     * @param {OriginPolicyInput | null} [arg0]
     */
    set originPolicy(arg0) {
        let ptr0 = 0;
        if (!isLikeNone(arg0)) {
            _assertClass(arg0, OriginPolicyInput);
            ptr0 = arg0.__destroy_into_raw();
        }
        wasm.__wbg_set_authenticatoroptions_originPolicy(this.__wbg_ptr, ptr0);
    }
}

const CheckCanRegisterUserRequestFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_checkcanregisteruserrequest_free(ptr >>> 0, 1));

export class CheckCanRegisterUserRequest {

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
    /**
     * @returns {VrfChallenge}
     */
    get vrfChallenge() {
        const ret = wasm.__wbg_get_checkcanregisteruserrequest_vrfChallenge(this.__wbg_ptr);
        return VrfChallenge.__wrap(ret);
    }
    /**
     * @param {VrfChallenge} arg0
     */
    set vrfChallenge(arg0) {
        _assertClass(arg0, VrfChallenge);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_checkcanregisteruserrequest_vrfChallenge(this.__wbg_ptr, ptr0);
    }
    /**
     * @returns {SerializedRegistrationCredential}
     */
    get credential() {
        const ret = wasm.__wbg_get_checkcanregisteruserrequest_credential(this.__wbg_ptr);
        return SerializedRegistrationCredential.__wrap(ret);
    }
    /**
     * @param {SerializedRegistrationCredential} arg0
     */
    set credential(arg0) {
        _assertClass(arg0, SerializedRegistrationCredential);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_checkcanregisteruserrequest_credential(this.__wbg_ptr, ptr0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set contractId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_checkcanregisteruserrequest_contractId(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set nearRpcUrl(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_checkcanregisteruserrequest_nearRpcUrl(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {AuthenticatorOptions | undefined}
     */
    get authenticatorOptions() {
        const ret = wasm.__wbg_get_checkcanregisteruserrequest_authenticatorOptions(this.__wbg_ptr);
        return ret === 0 ? undefined : AuthenticatorOptions.__wrap(ret);
    }
    /**
     * @param {AuthenticatorOptions | null} [arg0]
     */
    set authenticatorOptions(arg0) {
        let ptr0 = 0;
        if (!isLikeNone(arg0)) {
            _assertClass(arg0, AuthenticatorOptions);
            ptr0 = arg0.__destroy_into_raw();
        }
        wasm.__wbg_set_checkcanregisteruserrequest_authenticatorOptions(this.__wbg_ptr, ptr0);
    }
}

const ClientExtensionResultsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_clientextensionresults_free(ptr >>> 0, 1));

export class ClientExtensionResults {

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
    /**
     * @returns {PrfResults}
     */
    get prf() {
        const ret = wasm.__wbg_get_clientextensionresults_prf(this.__wbg_ptr);
        return PrfResults.__wrap(ret);
    }
    /**
     * @param {PrfResults} arg0
     */
    set prf(arg0) {
        _assertClass(arg0, PrfResults);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_clientextensionresults_prf(this.__wbg_ptr, ptr0);
    }
}

const ConfirmationConfigFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_confirmationconfig_free(ptr >>> 0, 1));
/**
 * Unified confirmation configuration passed from main thread to WASM worker
 */
export class ConfirmationConfig {

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
    /**
     * Type of UI to display for confirmation
     * @returns {ConfirmationUIMode}
     */
    get uiMode() {
        const ret = wasm.__wbg_get_confirmationconfig_uiMode(this.__wbg_ptr);
        return ret;
    }
    /**
     * Type of UI to display for confirmation
     * @param {ConfirmationUIMode} arg0
     */
    set uiMode(arg0) {
        wasm.__wbg_set_confirmationconfig_uiMode(this.__wbg_ptr, arg0);
    }
    /**
     * How the confirmation UI behaves
     * @returns {ConfirmationBehavior}
     */
    get behavior() {
        const ret = wasm.__wbg_get_confirmationconfig_behavior(this.__wbg_ptr);
        return ret;
    }
    /**
     * How the confirmation UI behaves
     * @param {ConfirmationBehavior} arg0
     */
    set behavior(arg0) {
        wasm.__wbg_set_confirmationconfig_behavior(this.__wbg_ptr, arg0);
    }
    /**
     * Delay in milliseconds before auto-proceeding (only used with autoProceedWithDelay)
     * @returns {number | undefined}
     */
    get autoProceedDelay() {
        const ret = wasm.__wbg_get_confirmationconfig_autoProceedDelay(this.__wbg_ptr);
        return ret === 0x100000001 ? undefined : ret;
    }
    /**
     * Delay in milliseconds before auto-proceeding (only used with autoProceedWithDelay)
     * @param {number | null} [arg0]
     */
    set autoProceedDelay(arg0) {
        wasm.__wbg_set_confirmationconfig_autoProceedDelay(this.__wbg_ptr, isLikeNone(arg0) ? 0x100000001 : (arg0) >>> 0);
    }
    /**
     * UI theme preference (dark/light)
     * @returns {string | undefined}
     */
    get theme() {
        const ret = wasm.__wbg_get_confirmationconfig_theme(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * UI theme preference (dark/light)
     * @param {string | null} [arg0]
     */
    set theme(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_confirmationconfig_theme(this.__wbg_ptr, ptr0, len0);
    }
}

const CoseExtractionResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_coseextractionresult_free(ptr >>> 0, 1));

export class CoseExtractionResult {

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
    /**
     * @returns {Uint8Array}
     */
    get cosePublicKeyBytes() {
        const ret = wasm.__wbg_get_coseextractionresult_cosePublicKeyBytes(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @param {Uint8Array} arg0
     */
    set cosePublicKeyBytes(arg0) {
        const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_coseextractionresult_cosePublicKeyBytes(this.__wbg_ptr, ptr0, len0);
    }
}

const DecryptPrivateKeyRequestFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_decryptprivatekeyrequest_free(ptr >>> 0, 1));

export class DecryptPrivateKeyRequest {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set nearAccountId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryptprivatekeyrequest_nearAccountId(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set chacha20PrfOutput(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryptprivatekeyrequest_chacha20PrfOutput(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set encryptedPrivateKeyData(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryptprivatekeyrequest_encryptedPrivateKeyData(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set encryptedPrivateKeyIv(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryptprivatekeyrequest_encryptedPrivateKeyIv(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {string} near_account_id
     * @param {string} chacha20_prf_output
     * @param {string} encrypted_private_key_data
     * @param {string} encrypted_private_key_iv
     */
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

const DecryptPrivateKeyResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_decryptprivatekeyresult_free(ptr >>> 0, 1));

export class DecryptPrivateKeyResult {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set privateKey(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryptprivatekeyrequest_nearAccountId(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set nearAccountId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryptprivatekeyrequest_chacha20PrfOutput(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {string} private_key
     * @param {string} near_account_id
     */
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

const DecryptionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_decryption_free(ptr >>> 0, 1));

export class Decryption {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set chacha20_prf_output(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryption_chacha20_prf_output(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set encrypted_private_key_data(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryption_encrypted_private_key_data(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set encrypted_private_key_iv(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryption_encrypted_private_key_iv(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {string} chacha20_prf_output
     * @param {string} encrypted_private_key_data
     * @param {string} encrypted_private_key_iv
     */
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

const DecryptionPayloadFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_decryptionpayload_free(ptr >>> 0, 1));
/**
 * Decryption payload (consolidated for deserialization and WASM binding)
 * Note: chacha20_prf_output is collected during user confirmation flow
 */
export class DecryptionPayload {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set encryptedPrivateKeyData(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyData(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set encryptedPrivateKeyIv(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyIv(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {string} encrypted_private_key_data
     * @param {string} encrypted_private_key_iv
     */
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

const DeriveNearKeypairAndEncryptRequestFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_derivenearkeypairandencryptrequest_free(ptr >>> 0, 1));

export class DeriveNearKeypairAndEncryptRequest {

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
    /**
     * @returns {DualPrfOutputsStruct}
     */
    get dualPrfOutputs() {
        const ret = wasm.__wbg_get_derivenearkeypairandencryptrequest_dualPrfOutputs(this.__wbg_ptr);
        return DualPrfOutputsStruct.__wrap(ret);
    }
    /**
     * @param {DualPrfOutputsStruct} arg0
     */
    set dualPrfOutputs(arg0) {
        _assertClass(arg0, DualPrfOutputsStruct);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_derivenearkeypairandencryptrequest_dualPrfOutputs(this.__wbg_ptr, ptr0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set nearAccountId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_derivenearkeypairandencryptrequest_nearAccountId(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {SerializedRegistrationCredential}
     */
    get credential() {
        const ret = wasm.__wbg_get_derivenearkeypairandencryptrequest_credential(this.__wbg_ptr);
        return SerializedRegistrationCredential.__wrap(ret);
    }
    /**
     * @param {SerializedRegistrationCredential} arg0
     */
    set credential(arg0) {
        _assertClass(arg0, SerializedRegistrationCredential);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_derivenearkeypairandencryptrequest_credential(this.__wbg_ptr, ptr0);
    }
    /**
     * @returns {LinkDeviceRegistrationTransaction | undefined}
     */
    get registrationTransaction() {
        const ret = wasm.__wbg_get_derivenearkeypairandencryptrequest_registrationTransaction(this.__wbg_ptr);
        return ret === 0 ? undefined : LinkDeviceRegistrationTransaction.__wrap(ret);
    }
    /**
     * @param {LinkDeviceRegistrationTransaction | null} [arg0]
     */
    set registrationTransaction(arg0) {
        let ptr0 = 0;
        if (!isLikeNone(arg0)) {
            _assertClass(arg0, LinkDeviceRegistrationTransaction);
            ptr0 = arg0.__destroy_into_raw();
        }
        wasm.__wbg_set_derivenearkeypairandencryptrequest_registrationTransaction(this.__wbg_ptr, ptr0);
    }
    /**
     * @returns {AuthenticatorOptions | undefined}
     */
    get authenticatorOptions() {
        const ret = wasm.__wbg_get_derivenearkeypairandencryptrequest_authenticatorOptions(this.__wbg_ptr);
        return ret === 0 ? undefined : AuthenticatorOptions.__wrap(ret);
    }
    /**
     * @param {AuthenticatorOptions | null} [arg0]
     */
    set authenticatorOptions(arg0) {
        let ptr0 = 0;
        if (!isLikeNone(arg0)) {
            _assertClass(arg0, AuthenticatorOptions);
            ptr0 = arg0.__destroy_into_raw();
        }
        wasm.__wbg_set_derivenearkeypairandencryptrequest_authenticatorOptions(this.__wbg_ptr, ptr0);
    }
}

const DeriveNearKeypairAndEncryptResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_derivenearkeypairandencryptresult_free(ptr >>> 0, 1));

export class DeriveNearKeypairAndEncryptResult {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set nearAccountId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_derivenearkeypairandencryptresult_nearAccountId(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set publicKey(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_derivenearkeypairandencryptresult_publicKey(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set encryptedData(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_derivenearkeypairandencryptresult_encryptedData(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set iv(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_derivenearkeypairandencryptresult_iv(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {boolean}
     */
    get stored() {
        const ret = wasm.__wbg_get_derivenearkeypairandencryptresult_stored(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {boolean} arg0
     */
    set stored(arg0) {
        wasm.__wbg_set_derivenearkeypairandencryptresult_stored(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {WasmSignedTransaction | undefined}
     */
    get signedTransaction() {
        const ret = wasm.__wbg_get_derivenearkeypairandencryptresult_signedTransaction(this.__wbg_ptr);
        return ret === 0 ? undefined : WasmSignedTransaction.__wrap(ret);
    }
    /**
     * @param {WasmSignedTransaction | null} [arg0]
     */
    set signedTransaction(arg0) {
        let ptr0 = 0;
        if (!isLikeNone(arg0)) {
            _assertClass(arg0, WasmSignedTransaction);
            ptr0 = arg0.__destroy_into_raw();
        }
        wasm.__wbg_set_derivenearkeypairandencryptresult_signedTransaction(this.__wbg_ptr, ptr0);
    }
    /**
     * @param {string} near_account_id
     * @param {string} public_key
     * @param {string} encrypted_data
     * @param {string} iv
     * @param {boolean} stored
     * @param {WasmSignedTransaction | null} [signed_transaction]
     */
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

const DualPrfOutputsStructFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_dualprfoutputsstruct_free(ptr >>> 0, 1));

export class DualPrfOutputsStruct {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set chacha20PrfOutput(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_dualprfoutputsstruct_chacha20PrfOutput(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set ed25519PrfOutput(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_dualprfoutputsstruct_ed25519PrfOutput(this.__wbg_ptr, ptr0, len0);
    }
}

const ExtractCoseRequestFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_extractcoserequest_free(ptr >>> 0, 1));

export class ExtractCoseRequest {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set attestationObjectBase64url(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_coseextractionresult_cosePublicKeyBytes(this.__wbg_ptr, ptr0, len0);
    }
}

const KeyActionResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_keyactionresult_free(ptr >>> 0, 1));

export class KeyActionResult {

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
    /**
     * @returns {boolean}
     */
    get success() {
        const ret = wasm.__wbg_get_keyactionresult_success(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {boolean} arg0
     */
    set success(arg0) {
        wasm.__wbg_set_keyactionresult_success(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {string | undefined}
     */
    get transactionHash() {
        const ret = wasm.__wbg_get_keyactionresult_transactionHash(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {string | null} [arg0]
     */
    set transactionHash(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_keyactionresult_transactionHash(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {WasmSignedTransaction | undefined}
     */
    get signedTransaction() {
        const ret = wasm.__wbg_get_keyactionresult_signedTransaction(this.__wbg_ptr);
        return ret === 0 ? undefined : WasmSignedTransaction.__wrap(ret);
    }
    /**
     * @param {WasmSignedTransaction | null} [arg0]
     */
    set signedTransaction(arg0) {
        let ptr0 = 0;
        if (!isLikeNone(arg0)) {
            _assertClass(arg0, WasmSignedTransaction);
            ptr0 = arg0.__destroy_into_raw();
        }
        wasm.__wbg_set_keyactionresult_signedTransaction(this.__wbg_ptr, ptr0);
    }
    /**
     * @returns {string[]}
     */
    get logs() {
        const ret = wasm.__wbg_get_keyactionresult_logs(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @param {string[]} arg0
     */
    set logs(arg0) {
        const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_keyactionresult_logs(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string | undefined}
     */
    get error() {
        const ret = wasm.__wbg_get_keyactionresult_error(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {string | null} [arg0]
     */
    set error(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_keyactionresult_error(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {boolean} success
     * @param {string | null | undefined} transaction_hash
     * @param {WasmSignedTransaction | null | undefined} signed_transaction
     * @param {string[]} logs
     * @param {string | null} [error]
     */
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

const LinkDeviceRegistrationTransactionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_linkdeviceregistrationtransaction_free(ptr >>> 0, 1));

export class LinkDeviceRegistrationTransaction {

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
    /**
     * @returns {VrfChallenge}
     */
    get vrfChallenge() {
        const ret = wasm.__wbg_get_linkdeviceregistrationtransaction_vrfChallenge(this.__wbg_ptr);
        return VrfChallenge.__wrap(ret);
    }
    /**
     * @param {VrfChallenge} arg0
     */
    set vrfChallenge(arg0) {
        _assertClass(arg0, VrfChallenge);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_linkdeviceregistrationtransaction_vrfChallenge(this.__wbg_ptr, ptr0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set contractId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_linkdeviceregistrationtransaction_contractId(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set nonce(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_linkdeviceregistrationtransaction_nonce(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set blockHash(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_derivenearkeypairandencryptresult_publicKey(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set deterministicVrfPublicKey(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_linkdeviceregistrationtransaction_deterministicVrfPublicKey(this.__wbg_ptr, ptr0, len0);
    }
}

const OriginPolicyInputFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_originpolicyinput_free(ptr >>> 0, 1));
/**
 * Origin policy input for WebAuthn registration (user-provided)
 */
export class OriginPolicyInput {

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
    /**
     * Exactly one of these should be set
     * @returns {boolean | undefined}
     */
    get single() {
        const ret = wasm.__wbg_get_originpolicyinput_single(this.__wbg_ptr);
        return ret === 0xFFFFFF ? undefined : ret !== 0;
    }
    /**
     * Exactly one of these should be set
     * @param {boolean | null} [arg0]
     */
    set single(arg0) {
        wasm.__wbg_set_originpolicyinput_single(this.__wbg_ptr, isLikeNone(arg0) ? 0xFFFFFF : arg0 ? 1 : 0);
    }
    /**
     * @returns {boolean | undefined}
     */
    get all_subdomains() {
        const ret = wasm.__wbg_get_originpolicyinput_all_subdomains(this.__wbg_ptr);
        return ret === 0xFFFFFF ? undefined : ret !== 0;
    }
    /**
     * @param {boolean | null} [arg0]
     */
    set all_subdomains(arg0) {
        wasm.__wbg_set_originpolicyinput_all_subdomains(this.__wbg_ptr, isLikeNone(arg0) ? 0xFFFFFF : arg0 ? 1 : 0);
    }
    /**
     * @returns {string[] | undefined}
     */
    get multiple() {
        const ret = wasm.__wbg_get_originpolicyinput_multiple(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        }
        return v1;
    }
    /**
     * @param {string[] | null} [arg0]
     */
    set multiple(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_originpolicyinput_multiple(this.__wbg_ptr, ptr0, len0);
    }
}

const PrfOutputsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_prfoutputs_free(ptr >>> 0, 1));

export class PrfOutputs {

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
    /**
     * @returns {string | undefined}
     */
    get first() {
        const ret = wasm.__wbg_get_prfoutputs_first(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {string | null} [arg0]
     */
    set first(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_prfoutputs_first(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string | undefined}
     */
    get second() {
        const ret = wasm.__wbg_get_prfoutputs_second(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {string | null} [arg0]
     */
    set second(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_prfoutputs_second(this.__wbg_ptr, ptr0, len0);
    }
}

const PrfResultsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_prfresults_free(ptr >>> 0, 1));

export class PrfResults {

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
    /**
     * @returns {PrfOutputs}
     */
    get results() {
        const ret = wasm.__wbg_get_clientextensionresults_prf(this.__wbg_ptr);
        return PrfOutputs.__wrap(ret);
    }
    /**
     * @param {PrfOutputs} arg0
     */
    set results(arg0) {
        _assertClass(arg0, PrfOutputs);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_clientextensionresults_prf(this.__wbg_ptr, ptr0);
    }
}

const RecoverKeypairRequestFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_recoverkeypairrequest_free(ptr >>> 0, 1));

export class RecoverKeypairRequest {

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
    /**
     * @returns {SerializedCredential}
     */
    get credential() {
        const ret = wasm.__wbg_get_recoverkeypairrequest_credential(this.__wbg_ptr);
        return SerializedCredential.__wrap(ret);
    }
    /**
     * @param {SerializedCredential} arg0
     */
    set credential(arg0) {
        _assertClass(arg0, SerializedCredential);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_recoverkeypairrequest_credential(this.__wbg_ptr, ptr0);
    }
    /**
     * @returns {string | undefined}
     */
    get accountIdHint() {
        const ret = wasm.__wbg_get_recoverkeypairrequest_accountIdHint(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {string | null} [arg0]
     */
    set accountIdHint(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_recoverkeypairrequest_accountIdHint(this.__wbg_ptr, ptr0, len0);
    }
}

const RecoverKeypairResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_recoverkeypairresult_free(ptr >>> 0, 1));

export class RecoverKeypairResult {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set publicKey(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyData(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set encryptedData(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyIv(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set iv(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_recoverkeypairresult_iv(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string | undefined}
     */
    get accountIdHint() {
        const ret = wasm.__wbg_get_recoverkeypairresult_accountIdHint(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {string | null} [arg0]
     */
    set accountIdHint(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_recoverkeypairresult_accountIdHint(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {string} public_key
     * @param {string} encrypted_data
     * @param {string} iv
     * @param {string | null} [account_id_hint]
     */
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

const RegistrationCheckRequestFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_registrationcheckrequest_free(ptr >>> 0, 1));

export class RegistrationCheckRequest {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set contract_id(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryption_chacha20_prf_output(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set near_rpc_url(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryption_encrypted_private_key_data(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {string} contract_id
     * @param {string} near_rpc_url
     */
    constructor(contract_id, near_rpc_url) {
        const ptr0 = passStringToWasm0(contract_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(near_rpc_url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.registrationcheckrequest_new(ptr0, len0, ptr1, len1);
        this.__wbg_ptr = ret >>> 0;
        RegistrationCheckRequestFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}

const RegistrationCheckResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_registrationcheckresult_free(ptr >>> 0, 1));

export class RegistrationCheckResult {

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
    /**
     * @returns {boolean}
     */
    get verified() {
        const ret = wasm.__wbg_get_registrationcheckresult_verified(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {boolean} arg0
     */
    set verified(arg0) {
        wasm.__wbg_set_registrationcheckresult_verified(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {RegistrationInfoStruct | undefined}
     */
    get registrationInfo() {
        const ret = wasm.__wbg_get_registrationcheckresult_registrationInfo(this.__wbg_ptr);
        return ret === 0 ? undefined : RegistrationInfoStruct.__wrap(ret);
    }
    /**
     * @param {RegistrationInfoStruct | null} [arg0]
     */
    set registrationInfo(arg0) {
        let ptr0 = 0;
        if (!isLikeNone(arg0)) {
            _assertClass(arg0, RegistrationInfoStruct);
            ptr0 = arg0.__destroy_into_raw();
        }
        wasm.__wbg_set_registrationcheckresult_registrationInfo(this.__wbg_ptr, ptr0);
    }
    /**
     * @returns {string[]}
     */
    get logs() {
        const ret = wasm.__wbg_get_registrationcheckresult_logs(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @param {string[]} arg0
     */
    set logs(arg0) {
        const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_registrationcheckresult_logs(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {WasmSignedTransaction | undefined}
     */
    get signedTransaction() {
        const ret = wasm.__wbg_get_registrationcheckresult_signedTransaction(this.__wbg_ptr);
        return ret === 0 ? undefined : WasmSignedTransaction.__wrap(ret);
    }
    /**
     * @param {WasmSignedTransaction | null} [arg0]
     */
    set signedTransaction(arg0) {
        let ptr0 = 0;
        if (!isLikeNone(arg0)) {
            _assertClass(arg0, WasmSignedTransaction);
            ptr0 = arg0.__destroy_into_raw();
        }
        wasm.__wbg_set_registrationcheckresult_signedTransaction(this.__wbg_ptr, ptr0);
    }
    /**
     * @returns {string | undefined}
     */
    get error() {
        const ret = wasm.__wbg_get_registrationcheckresult_error(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {string | null} [arg0]
     */
    set error(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_registrationcheckresult_error(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {boolean} verified
     * @param {RegistrationInfoStruct | null | undefined} registration_info
     * @param {string[]} logs
     * @param {WasmSignedTransaction | null} [signed_transaction]
     * @param {string | null} [error]
     */
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

const RegistrationCredentialConfirmationRequestFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_registrationcredentialconfirmationrequest_free(ptr >>> 0, 1));

export class RegistrationCredentialConfirmationRequest {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RegistrationCredentialConfirmationRequestFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_registrationcredentialconfirmationrequest_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get nearAccountId() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.__wbg_get_registrationcredentialconfirmationrequest_nearAccountId(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} arg0
     */
    set nearAccountId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_registrationcredentialconfirmationrequest_nearAccountId(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {number}
     */
    get deviceNumber() {
        const ret = wasm.__wbg_get_registrationcredentialconfirmationrequest_deviceNumber(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} arg0
     */
    set deviceNumber(arg0) {
        wasm.__wbg_set_registrationcredentialconfirmationrequest_deviceNumber(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {string}
     */
    get contractId() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.__wbg_get_registrationcredentialconfirmationrequest_contractId(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} arg0
     */
    set contractId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_registrationcredentialconfirmationrequest_contractId(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
    get nearRpcUrl() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.__wbg_get_registrationcredentialconfirmationrequest_nearRpcUrl(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} arg0
     */
    set nearRpcUrl(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_registrationcredentialconfirmationrequest_nearRpcUrl(this.__wbg_ptr, ptr0, len0);
    }
}

const RegistrationCredentialConfirmationResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_registrationcredentialconfirmationresult_free(ptr >>> 0, 1));

export class RegistrationCredentialConfirmationResult {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RegistrationCredentialConfirmationResultFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_registrationcredentialconfirmationresult_free(ptr, 0);
    }
    /**
     * @returns {boolean}
     */
    get confirmed() {
        const ret = wasm.__wbg_get_registrationcredentialconfirmationresult_confirmed(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {boolean} arg0
     */
    set confirmed(arg0) {
        wasm.__wbg_set_registrationcredentialconfirmationresult_confirmed(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {string}
     */
    get requestId() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.__wbg_get_registrationcredentialconfirmationresult_requestId(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} arg0
     */
    set requestId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_registrationcredentialconfirmationrequest_nearAccountId(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
    get intentDigest() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.__wbg_get_registrationcredentialconfirmationresult_intentDigest(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} arg0
     */
    set intentDigest(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_registrationcredentialconfirmationrequest_contractId(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {any}
     */
    get credential() {
        const ret = wasm.__wbg_get_registrationcredentialconfirmationresult_credential(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {any} arg0
     */
    set credential(arg0) {
        wasm.__wbg_set_registrationcredentialconfirmationresult_credential(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {string | undefined}
     */
    get prfOutput() {
        const ret = wasm.__wbg_get_registrationcredentialconfirmationresult_prfOutput(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {string | null} [arg0]
     */
    set prfOutput(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_registrationcredentialconfirmationresult_prfOutput(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {VrfChallenge | undefined}
     */
    get vrfChallenge() {
        const ret = wasm.__wbg_get_registrationcredentialconfirmationresult_vrfChallenge(this.__wbg_ptr);
        return ret === 0 ? undefined : VrfChallenge.__wrap(ret);
    }
    /**
     * @param {VrfChallenge | null} [arg0]
     */
    set vrfChallenge(arg0) {
        let ptr0 = 0;
        if (!isLikeNone(arg0)) {
            _assertClass(arg0, VrfChallenge);
            ptr0 = arg0.__destroy_into_raw();
        }
        wasm.__wbg_set_registrationcredentialconfirmationresult_vrfChallenge(this.__wbg_ptr, ptr0);
    }
    /**
     * @returns {TransactionContext | undefined}
     */
    get transactionContext() {
        const ret = wasm.__wbg_get_registrationcredentialconfirmationresult_transactionContext(this.__wbg_ptr);
        return ret === 0 ? undefined : TransactionContext.__wrap(ret);
    }
    /**
     * @param {TransactionContext | null} [arg0]
     */
    set transactionContext(arg0) {
        let ptr0 = 0;
        if (!isLikeNone(arg0)) {
            _assertClass(arg0, TransactionContext);
            ptr0 = arg0.__destroy_into_raw();
        }
        wasm.__wbg_set_registrationcredentialconfirmationresult_transactionContext(this.__wbg_ptr, ptr0);
    }
    /**
     * @returns {string | undefined}
     */
    get error() {
        const ret = wasm.__wbg_get_registrationcredentialconfirmationresult_error(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {string | null} [arg0]
     */
    set error(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_registrationcredentialconfirmationresult_error(this.__wbg_ptr, ptr0, len0);
    }
}

const RegistrationInfoStructFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_registrationinfostruct_free(ptr >>> 0, 1));

export class RegistrationInfoStruct {

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
    /**
     * @returns {Uint8Array}
     */
    get credentialId() {
        const ret = wasm.__wbg_get_registrationinfostruct_credentialId(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @param {Uint8Array} arg0
     */
    set credentialId(arg0) {
        const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryption_chacha20_prf_output(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {Uint8Array}
     */
    get credentialPublicKey() {
        const ret = wasm.__wbg_get_registrationinfostruct_credentialPublicKey(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @param {Uint8Array} arg0
     */
    set credentialPublicKey(arg0) {
        const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryption_encrypted_private_key_data(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set userId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryption_encrypted_private_key_iv(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {Uint8Array | undefined}
     */
    get vrfPublicKey() {
        const ret = wasm.__wbg_get_registrationinfostruct_vrfPublicKey(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {Uint8Array | null} [arg0]
     */
    set vrfPublicKey(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_registrationinfostruct_vrfPublicKey(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {Uint8Array} credential_id
     * @param {Uint8Array} credential_public_key
     * @param {string} user_id
     * @param {Uint8Array | null} [vrf_public_key]
     */
    constructor(credential_id, credential_public_key, user_id, vrf_public_key) {
        const ptr0 = passArray8ToWasm0(credential_id, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(credential_public_key, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(user_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        var ptr3 = isLikeNone(vrf_public_key) ? 0 : passArray8ToWasm0(vrf_public_key, wasm.__wbindgen_malloc);
        var len3 = WASM_VECTOR_LEN;
        const ret = wasm.registrationinfostruct_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        this.__wbg_ptr = ret >>> 0;
        RegistrationInfoStructFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}

const RegistrationPayloadFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_registrationpayload_free(ptr >>> 0, 1));

export class RegistrationPayload {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set nearAccountId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyData(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set nonce(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyIv(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set blockHash(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_recoverkeypairresult_iv(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string | undefined}
     */
    get deterministicVrfPublicKey() {
        const ret = wasm.__wbg_get_registrationpayload_deterministicVrfPublicKey(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {string | null} [arg0]
     */
    set deterministicVrfPublicKey(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_recoverkeypairresult_accountIdHint(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {number | undefined}
     */
    get deviceNumber() {
        const ret = wasm.__wbg_get_registrationpayload_deviceNumber(this.__wbg_ptr);
        return ret === 0xFFFFFF ? undefined : ret;
    }
    /**
     * @param {number | null} [arg0]
     */
    set deviceNumber(arg0) {
        wasm.__wbg_set_registrationpayload_deviceNumber(this.__wbg_ptr, isLikeNone(arg0) ? 0xFFFFFF : arg0);
    }
    /**
     * @returns {AuthenticatorOptions | undefined}
     */
    get authenticatorOptions() {
        const ret = wasm.__wbg_get_registrationpayload_authenticatorOptions(this.__wbg_ptr);
        return ret === 0 ? undefined : AuthenticatorOptions.__wrap(ret);
    }
    /**
     * @param {AuthenticatorOptions | null} [arg0]
     */
    set authenticatorOptions(arg0) {
        let ptr0 = 0;
        if (!isLikeNone(arg0)) {
            _assertClass(arg0, AuthenticatorOptions);
            ptr0 = arg0.__destroy_into_raw();
        }
        wasm.__wbg_set_registrationpayload_authenticatorOptions(this.__wbg_ptr, ptr0);
    }
}

const RegistrationResponseFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_registrationresponse_free(ptr >>> 0, 1));

export class RegistrationResponse {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set clientDataJSON(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_authenticationresponse_clientDataJSON(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set attestationObject(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_authenticationresponse_authenticatorData(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string[]}
     */
    get transports() {
        const ret = wasm.__wbg_get_registrationresponse_transports(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @param {string[]} arg0
     */
    set transports(arg0) {
        const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_registrationresponse_transports(this.__wbg_ptr, ptr0, len0);
    }
}

const RpcCallPayloadFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_rpccallpayload_free(ptr >>> 0, 1));
/**
 * RPC call parameters for NEAR operations and VRF generation
 * Used to pass essential parameters for background operations
 */
export class RpcCallPayload {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set contractId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyData(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set nearRpcUrl(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyIv(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set nearAccountId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_recoverkeypairresult_iv(this.__wbg_ptr, ptr0, len0);
    }
}

const SerializedCredentialFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_serializedcredential_free(ptr >>> 0, 1));

export class SerializedCredential {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set id(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_authenticationresponse_clientDataJSON(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set rawId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_authenticationresponse_authenticatorData(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set type(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_authenticationresponse_signature(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string | undefined}
     */
    get authenticatorAttachment() {
        const ret = wasm.__wbg_get_serializedcredential_authenticatorAttachment(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {string | null} [arg0]
     */
    set authenticatorAttachment(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_serializedcredential_authenticatorAttachment(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {AuthenticationResponse}
     */
    get response() {
        const ret = wasm.__wbg_get_serializedcredential_response(this.__wbg_ptr);
        return AuthenticationResponse.__wrap(ret);
    }
    /**
     * @param {AuthenticationResponse} arg0
     */
    set response(arg0) {
        _assertClass(arg0, AuthenticationResponse);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_serializedcredential_response(this.__wbg_ptr, ptr0);
    }
    /**
     * @returns {ClientExtensionResults}
     */
    get clientExtensionResults() {
        const ret = wasm.__wbg_get_serializedcredential_clientExtensionResults(this.__wbg_ptr);
        return ClientExtensionResults.__wrap(ret);
    }
    /**
     * @param {ClientExtensionResults} arg0
     */
    set clientExtensionResults(arg0) {
        _assertClass(arg0, ClientExtensionResults);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_serializedcredential_clientExtensionResults(this.__wbg_ptr, ptr0);
    }
}

const SerializedRegistrationCredentialFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_serializedregistrationcredential_free(ptr >>> 0, 1));

export class SerializedRegistrationCredential {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set id(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_authenticationresponse_clientDataJSON(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set rawId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_authenticationresponse_authenticatorData(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set type(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_authenticationresponse_signature(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string | undefined}
     */
    get authenticatorAttachment() {
        const ret = wasm.__wbg_get_serializedregistrationcredential_authenticatorAttachment(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {string | null} [arg0]
     */
    set authenticatorAttachment(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_serializedregistrationcredential_authenticatorAttachment(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {RegistrationResponse}
     */
    get response() {
        const ret = wasm.__wbg_get_serializedregistrationcredential_response(this.__wbg_ptr);
        return RegistrationResponse.__wrap(ret);
    }
    /**
     * @param {RegistrationResponse} arg0
     */
    set response(arg0) {
        _assertClass(arg0, RegistrationResponse);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_serializedregistrationcredential_response(this.__wbg_ptr, ptr0);
    }
    /**
     * @returns {ClientExtensionResults}
     */
    get clientExtensionResults() {
        const ret = wasm.__wbg_get_serializedregistrationcredential_clientExtensionResults(this.__wbg_ptr);
        return ClientExtensionResults.__wrap(ret);
    }
    /**
     * @param {ClientExtensionResults} arg0
     */
    set clientExtensionResults(arg0) {
        _assertClass(arg0, ClientExtensionResults);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_serializedregistrationcredential_clientExtensionResults(this.__wbg_ptr, ptr0);
    }
}

const SignNep413RequestFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_signnep413request_free(ptr >>> 0, 1));

export class SignNep413Request {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set message(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_coseextractionresult_cosePublicKeyBytes(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set recipient(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_signnep413request_recipient(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set nonce(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_signnep413request_nonce(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string | undefined}
     */
    get state() {
        const ret = wasm.__wbg_get_signnep413request_state(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {string | null} [arg0]
     */
    set state(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_signnep413request_state(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set accountId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_signnep413request_accountId(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set encryptedPrivateKeyData(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_signnep413request_encryptedPrivateKeyData(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set encryptedPrivateKeyIv(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_signnep413request_encryptedPrivateKeyIv(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set prfOutput(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_signnep413request_prfOutput(this.__wbg_ptr, ptr0, len0);
    }
}

const SignNep413ResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_signnep413result_free(ptr >>> 0, 1));

export class SignNep413Result {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set accountId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_coseextractionresult_cosePublicKeyBytes(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set publicKey(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_signnep413request_recipient(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set signature(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_signnep413request_nonce(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string | undefined}
     */
    get state() {
        const ret = wasm.__wbg_get_signnep413result_state(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {string | null} [arg0]
     */
    set state(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_signnep413result_state(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {string} account_id
     * @param {string} public_key
     * @param {string} signature
     * @param {string | null} [state]
     */
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

const SignTransactionWithKeyPairRequestFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_signtransactionwithkeypairrequest_free(ptr >>> 0, 1));

export class SignTransactionWithKeyPairRequest {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set nearPrivateKey(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_coseextractionresult_cosePublicKeyBytes(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set signerAccountId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_signnep413request_recipient(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set receiverId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_signnep413request_nonce(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set nonce(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_signnep413request_accountId(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set blockHash(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_signnep413request_encryptedPrivateKeyData(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set actions(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_signnep413request_encryptedPrivateKeyIv(this.__wbg_ptr, ptr0, len0);
    }
}

const SignTransactionsWithActionsRequestFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_signtransactionswithactionsrequest_free(ptr >>> 0, 1));

export class SignTransactionsWithActionsRequest {

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
    /**
     * @returns {RpcCallPayload}
     */
    get rpcCall() {
        const ret = wasm.__wbg_get_signtransactionswithactionsrequest_rpcCall(this.__wbg_ptr);
        return RpcCallPayload.__wrap(ret);
    }
    /**
     * @param {RpcCallPayload} arg0
     */
    set rpcCall(arg0) {
        _assertClass(arg0, RpcCallPayload);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_signtransactionswithactionsrequest_rpcCall(this.__wbg_ptr, ptr0);
    }
    /**
     * @returns {DecryptionPayload}
     */
    get decryption() {
        const ret = wasm.__wbg_get_signtransactionswithactionsrequest_decryption(this.__wbg_ptr);
        return DecryptionPayload.__wrap(ret);
    }
    /**
     * @param {DecryptionPayload} arg0
     */
    set decryption(arg0) {
        _assertClass(arg0, DecryptionPayload);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_signtransactionswithactionsrequest_decryption(this.__wbg_ptr, ptr0);
    }
    /**
     * @returns {TransactionPayload[]}
     */
    get txSigningRequests() {
        const ret = wasm.__wbg_get_signtransactionswithactionsrequest_txSigningRequests(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @param {TransactionPayload[]} arg0
     */
    set txSigningRequests(arg0) {
        const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_signtransactionswithactionsrequest_txSigningRequests(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Unified confirmation configuration for controlling the confirmation flow
     * @returns {ConfirmationConfig | undefined}
     */
    get confirmationConfig() {
        const ret = wasm.__wbg_get_signtransactionswithactionsrequest_confirmationConfig(this.__wbg_ptr);
        return ret === 0 ? undefined : ConfirmationConfig.__wrap(ret);
    }
    /**
     * Unified confirmation configuration for controlling the confirmation flow
     * @param {ConfirmationConfig | null} [arg0]
     */
    set confirmationConfig(arg0) {
        let ptr0 = 0;
        if (!isLikeNone(arg0)) {
            _assertClass(arg0, ConfirmationConfig);
            ptr0 = arg0.__destroy_into_raw();
        }
        wasm.__wbg_set_signtransactionswithactionsrequest_confirmationConfig(this.__wbg_ptr, ptr0);
    }
}

const TransactionContextFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_transactioncontext_free(ptr >>> 0, 1));
/**
 * Transaction context containing NEAR blockchain data
 * Computed in the main thread confirmation flow
 */
export class TransactionContext {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(TransactionContext.prototype);
        obj.__wbg_ptr = ptr;
        TransactionContextFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set nearPublicKeyStr(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyData(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set nextNonce(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyIv(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set txBlockHeight(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_recoverkeypairresult_iv(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set txBlockHash(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_transactioncontext_txBlockHash(this.__wbg_ptr, ptr0, len0);
    }
}

const TransactionPayloadFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_transactionpayload_free(ptr >>> 0, 1));

export class TransactionPayload {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set nearAccountId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryption_chacha20_prf_output(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set receiverId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryption_encrypted_private_key_data(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set actions(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryption_encrypted_private_key_iv(this.__wbg_ptr, ptr0, len0);
    }
}

const TransactionSignResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_transactionsignresult_free(ptr >>> 0, 1));

export class TransactionSignResult {

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
    /**
     * @returns {boolean}
     */
    get success() {
        const ret = wasm.__wbg_get_transactionsignresult_success(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {boolean} arg0
     */
    set success(arg0) {
        wasm.__wbg_set_transactionsignresult_success(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {string[] | undefined}
     */
    get transactionHashes() {
        const ret = wasm.__wbg_get_transactionsignresult_transactionHashes(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        }
        return v1;
    }
    /**
     * @param {string[] | null} [arg0]
     */
    set transactionHashes(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_transactionsignresult_transactionHashes(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {WasmSignedTransaction[] | undefined}
     */
    get signedTransactions() {
        const ret = wasm.__wbg_get_transactionsignresult_signedTransactions(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        }
        return v1;
    }
    /**
     * @param {WasmSignedTransaction[] | null} [arg0]
     */
    set signedTransactions(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_transactionsignresult_signedTransactions(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string[]}
     */
    get logs() {
        const ret = wasm.__wbg_get_transactionsignresult_logs(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @param {string[]} arg0
     */
    set logs(arg0) {
        const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_transactionsignresult_logs(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string | undefined}
     */
    get error() {
        const ret = wasm.__wbg_get_transactionsignresult_error(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {string | null} [arg0]
     */
    set error(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_registrationinfostruct_vrfPublicKey(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {boolean} success
     * @param {string[] | null | undefined} transaction_hashes
     * @param {WasmSignedTransaction[] | null | undefined} signed_transactions
     * @param {string[]} logs
     * @param {string | null} [error]
     */
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
    /**
     * Helper function to create a failed TransactionSignResult
     * @param {string[]} logs
     * @param {string} error_msg
     * @returns {TransactionSignResult}
     */
    static failed(logs, error_msg) {
        const ptr0 = passArrayJsValueToWasm0(logs, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(error_msg, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.transactionsignresult_failed(ptr0, len0, ptr1, len1);
        return TransactionSignResult.__wrap(ret);
    }
}

const VerificationPayloadFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_verificationpayload_free(ptr >>> 0, 1));
/**
 * Consolidated verification type for all flows.
 * Credentials are collected during the confirmation flow via the main thread.
 * DEPRECATED: Use RpcCallPayload instead
 */
export class VerificationPayload {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set contractId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyData(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set nearRpcUrl(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_decryptionpayload_encryptedPrivateKeyIv(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {VrfChallenge | undefined}
     */
    get vrfChallenge() {
        const ret = wasm.__wbg_get_verificationpayload_vrfChallenge(this.__wbg_ptr);
        return ret === 0 ? undefined : VrfChallenge.__wrap(ret);
    }
    /**
     * @param {VrfChallenge | null} [arg0]
     */
    set vrfChallenge(arg0) {
        let ptr0 = 0;
        if (!isLikeNone(arg0)) {
            _assertClass(arg0, VrfChallenge);
            ptr0 = arg0.__destroy_into_raw();
        }
        wasm.__wbg_set_verificationpayload_vrfChallenge(this.__wbg_ptr, ptr0);
    }
}

const VrfChallengeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_vrfchallenge_free(ptr >>> 0, 1));

export class VrfChallenge {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set vrfInput(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_authenticationresponse_clientDataJSON(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set vrfOutput(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_authenticationresponse_authenticatorData(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set vrfProof(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_authenticationresponse_signature(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set vrfPublicKey(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_vrfchallenge_vrfPublicKey(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set userId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_vrfchallenge_userId(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set rpId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_vrfchallenge_rpId(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set blockHeight(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_vrfchallenge_blockHeight(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set blockHash(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_vrfchallenge_blockHash(this.__wbg_ptr, ptr0, len0);
    }
}

const WasmPublicKeyFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpublickey_free(ptr >>> 0, 1));

export class WasmPublicKey {

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
    /**
     * @returns {number}
     */
    get keyType() {
        const ret = wasm.__wbg_get_wasmpublickey_keyType(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set keyType(arg0) {
        wasm.__wbg_set_wasmpublickey_keyType(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {Uint8Array}
     */
    get keyData() {
        const ret = wasm.__wbg_get_wasmpublickey_keyData(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @param {Uint8Array} arg0
     */
    set keyData(arg0) {
        const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_wasmpublickey_keyData(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {number} keyType
     * @param {Uint8Array} keyData
     */
    constructor(keyType, keyData) {
        const ptr0 = passArray8ToWasm0(keyData, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpublickey_new(keyType, ptr0, len0);
        this.__wbg_ptr = ret >>> 0;
        WasmPublicKeyFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}

const WasmSignatureFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmsignature_free(ptr >>> 0, 1));

export class WasmSignature {

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
    /**
     * @returns {number}
     */
    get keyType() {
        const ret = wasm.__wbg_get_wasmpublickey_keyType(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set keyType(arg0) {
        wasm.__wbg_set_wasmpublickey_keyType(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {Uint8Array}
     */
    get signatureData() {
        const ret = wasm.__wbg_get_wasmsignature_signatureData(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @param {Uint8Array} arg0
     */
    set signatureData(arg0) {
        const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_wasmpublickey_keyData(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {number} keyType
     * @param {Uint8Array} signatureData
     */
    constructor(keyType, signatureData) {
        const ptr0 = passArray8ToWasm0(signatureData, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpublickey_new(keyType, ptr0, len0);
        this.__wbg_ptr = ret >>> 0;
        WasmSignatureFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}

const WasmSignedTransactionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmsignedtransaction_free(ptr >>> 0, 1));

export class WasmSignedTransaction {

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
    /**
     * @returns {WasmTransaction}
     */
    get transaction() {
        const ret = wasm.__wbg_get_wasmsignedtransaction_transaction(this.__wbg_ptr);
        return WasmTransaction.__wrap(ret);
    }
    /**
     * @param {WasmTransaction} arg0
     */
    set transaction(arg0) {
        _assertClass(arg0, WasmTransaction);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_wasmsignedtransaction_transaction(this.__wbg_ptr, ptr0);
    }
    /**
     * @returns {WasmSignature}
     */
    get signature() {
        const ret = wasm.__wbg_get_wasmsignedtransaction_signature(this.__wbg_ptr);
        return WasmSignature.__wrap(ret);
    }
    /**
     * @param {WasmSignature} arg0
     */
    set signature(arg0) {
        _assertClass(arg0, WasmSignature);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_wasmsignedtransaction_signature(this.__wbg_ptr, ptr0);
    }
    /**
     * @returns {Uint8Array}
     */
    get borshBytes() {
        const ret = wasm.__wbg_get_wasmsignedtransaction_borshBytes(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @param {Uint8Array} arg0
     */
    set borshBytes(arg0) {
        const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_wasmsignedtransaction_borshBytes(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {WasmTransaction} transaction
     * @param {WasmSignature} signature
     * @param {Uint8Array} borshBytes
     */
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

const WasmTransactionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmtransaction_free(ptr >>> 0, 1));

export class WasmTransaction {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set signerId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_wasmtransaction_signerId(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {WasmPublicKey}
     */
    get publicKey() {
        const ret = wasm.__wbg_get_wasmtransaction_publicKey(this.__wbg_ptr);
        return WasmPublicKey.__wrap(ret);
    }
    /**
     * @param {WasmPublicKey} arg0
     */
    set publicKey(arg0) {
        _assertClass(arg0, WasmPublicKey);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_wasmtransaction_publicKey(this.__wbg_ptr, ptr0);
    }
    /**
     * @returns {bigint}
     */
    get nonce() {
        const ret = wasm.__wbg_get_wasmtransaction_nonce(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * @param {bigint} arg0
     */
    set nonce(arg0) {
        wasm.__wbg_set_wasmtransaction_nonce(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set receiverId(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_wasmtransaction_receiverId(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {Uint8Array}
     */
    get blockHash() {
        const ret = wasm.__wbg_get_wasmtransaction_blockHash(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @param {Uint8Array} arg0
     */
    set blockHash(arg0) {
        const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_wasmtransaction_blockHash(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set actionsJson(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_wasmtransaction_actionsJson(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {string} signerId
     * @param {WasmPublicKey} publicKey
     * @param {bigint} nonce
     * @param {string} receiverId
     * @param {Uint8Array} blockHash
     * @param {string} actionsJson
     */
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

const WebAuthnAuthenticationCredentialStructFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_webauthnauthenticationcredentialstruct_free(ptr >>> 0, 1));

export class WebAuthnAuthenticationCredentialStruct {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set id(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_authenticationresponse_clientDataJSON(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set raw_id(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_authenticationresponse_authenticatorData(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set credential_type(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_authenticationresponse_signature(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string | undefined}
     */
    get authenticator_attachment() {
        const ret = wasm.__wbg_get_webauthnauthenticationcredentialstruct_authenticator_attachment(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {string | null} [arg0]
     */
    set authenticator_attachment(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_serializedregistrationcredential_authenticatorAttachment(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set client_data_json(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_vrfchallenge_vrfPublicKey(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set authenticator_data(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_vrfchallenge_userId(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set signature(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_vrfchallenge_rpId(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string | undefined}
     */
    get user_handle() {
        const ret = wasm.__wbg_get_webauthnauthenticationcredentialstruct_user_handle(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {string | null} [arg0]
     */
    set user_handle(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_serializedcredential_authenticatorAttachment(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {string} id
     * @param {string} raw_id
     * @param {string} credential_type
     * @param {string | null | undefined} authenticator_attachment
     * @param {string} client_data_json
     * @param {string} authenticator_data
     * @param {string} signature
     * @param {string | null} [user_handle]
     */
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

const WebAuthnRegistrationCredentialStructFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_webauthnregistrationcredentialstruct_free(ptr >>> 0, 1));

export class WebAuthnRegistrationCredentialStruct {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set id(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_authenticationresponse_clientDataJSON(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set raw_id(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_authenticationresponse_authenticatorData(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set credential_type(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_authenticationresponse_signature(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string | undefined}
     */
    get authenticator_attachment() {
        const ret = wasm.__wbg_get_webauthnregistrationcredentialstruct_authenticator_attachment(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {string | null} [arg0]
     */
    set authenticator_attachment(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_webauthnregistrationcredentialstruct_authenticator_attachment(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set client_data_json(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_vrfchallenge_vrfPublicKey(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set attestation_object(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_vrfchallenge_userId(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string[] | undefined}
     */
    get transports() {
        const ret = wasm.__wbg_get_webauthnregistrationcredentialstruct_transports(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        }
        return v1;
    }
    /**
     * @param {string[] | null} [arg0]
     */
    set transports(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_webauthnregistrationcredentialstruct_transports(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string | undefined}
     */
    get ed25519_prf_output() {
        const ret = wasm.__wbg_get_webauthnregistrationcredentialstruct_ed25519_prf_output(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {string | null} [arg0]
     */
    set ed25519_prf_output(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_serializedcredential_authenticatorAttachment(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {string} id
     * @param {string} raw_id
     * @param {string} credential_type
     * @param {string | null | undefined} authenticator_attachment
     * @param {string} client_data_json
     * @param {string} attestation_object
     * @param {string[] | null} [transports]
     * @param {string | null} [ed25519_prf_output]
     */
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

const WorkerProgressMessageFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_workerprogressmessage_free(ptr >>> 0, 1));
/**
 * Base progress message structure sent from WASM to TypeScript
 * Auto-generates TypeScript interface: WorkerProgressMessage
 */
export class WorkerProgressMessage {

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
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set message_type(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_workerprogressmessage_message_type(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set step(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_registrationcredentialconfirmationrequest_nearRpcUrl(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set message(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_workerprogressmessage_message(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
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
    /**
     * @param {string} arg0
     */
    set status(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_workerprogressmessage_status(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {number}
     */
    get timestamp() {
        const ret = wasm.__wbg_get_workerprogressmessage_timestamp(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set timestamp(arg0) {
        wasm.__wbg_set_workerprogressmessage_timestamp(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {string | undefined}
     */
    get data() {
        const ret = wasm.__wbg_get_workerprogressmessage_data(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {string | null} [arg0]
     */
    set data(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_workerprogressmessage_data(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {string} message_type
     * @param {string} step
     * @param {string} message
     * @param {string} status
     * @param {number} timestamp
     * @param {string | null} [data]
     */
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
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
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
    imports.wbg.__wbg_awaitSecureConfirmationV2_74c72980d9e8f44d = function(arg0) {
        const ret = awaitSecureConfirmationV2(arg0);
        return ret;
    };
    imports.wbg.__wbg_buffer_609cc3eee51ed158 = function(arg0) {
        const ret = arg0.buffer;
        return ret;
    };
    imports.wbg.__wbg_call_672a4d21634d4a24 = function() { return handleError(function (arg0, arg1) {
        const ret = arg0.call(arg1);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_call_7cccdd69e0791ae2 = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = arg0.call(arg1, arg2);
        return ret;
    }, arguments) };
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
    imports.wbg.__wbg_getRandomValues_b8f5dbd5f3995a9e = function() { return handleError(function (arg0, arg1) {
        arg0.getRandomValues(arg1);
    }, arguments) };
    imports.wbg.__wbg_get_67b2ba62fc30de12 = function() { return handleError(function (arg0, arg1) {
        const ret = Reflect.get(arg0, arg1);
        return ret;
    }, arguments) };
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
    imports.wbg.__wbg_json_1671bfa3e3625686 = function() { return handleError(function (arg0) {
        const ret = arg0.json();
        return ret;
    }, arguments) };
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
    imports.wbg.__wbg_new_018dcc2d6c8c2f6a = function() { return handleError(function () {
        const ret = new Headers();
        return ret;
    }, arguments) };
    imports.wbg.__wbg_new_23a2665fac83c611 = function(arg0, arg1) {
        try {
            var state0 = {a: arg0, b: arg1};
            var cb0 = (arg0, arg1) => {
                const a = state0.a;
                state0.a = 0;
                try {
                    return __wbg_adapter_587(a, state0.b, arg0, arg1);
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
        const ret = new Object();
        return ret;
    };
    imports.wbg.__wbg_new_5e0be73521bc8c17 = function() {
        const ret = new Map();
        return ret;
    };
    imports.wbg.__wbg_new_78feb108b6472713 = function() {
        const ret = new Array();
        return ret;
    };
    imports.wbg.__wbg_new_8a6f238a6ece86ea = function() {
        const ret = new Error();
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
    imports.wbg.__wbg_newwithstrandinit_06c535e0a867c635 = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = new Request(getStringFromWasm0(arg0, arg1), arg2);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_next_25feadfc0913fea9 = function(arg0) {
        const ret = arg0.next;
        return ret;
    };
    imports.wbg.__wbg_next_6574e1a8a62d1055 = function() { return handleError(function (arg0) {
        const ret = arg0.next();
        return ret;
    }, arguments) };
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
    imports.wbg.__wbg_randomFillSync_ac0988aba3254290 = function() { return handleError(function (arg0, arg1) {
        arg0.randomFillSync(arg1);
    }, arguments) };
    imports.wbg.__wbg_random_3ad904d98382defe = function() {
        const ret = Math.random();
        return ret;
    };
    imports.wbg.__wbg_require_60cc747a6bc5215a = function() { return handleError(function () {
        const ret = module.require;
        return ret;
    }, arguments) };
    imports.wbg.__wbg_resolve_4851785c9c5f573d = function(arg0) {
        const ret = Promise.resolve(arg0);
        return ret;
    };
    imports.wbg.__wbg_sendProgressMessage_f12fbbae1e730197 = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10, arg11) {
        sendProgressMessage(arg0 >>> 0, getStringFromWasm0(arg1, arg2), arg3 >>> 0, getStringFromWasm0(arg4, arg5), getStringFromWasm0(arg6, arg7), getStringFromWasm0(arg8, arg9), getStringFromWasm0(arg10, arg11));
    };
    imports.wbg.__wbg_set_11cd83f45504cedf = function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
        arg0.set(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
    }, arguments) };
    imports.wbg.__wbg_set_37837023f3d740e8 = function(arg0, arg1, arg2) {
        arg0[arg1 >>> 0] = arg2;
    };
    imports.wbg.__wbg_set_3f1d0b984ed272ed = function(arg0, arg1, arg2) {
        arg0[arg1] = arg2;
    };
    imports.wbg.__wbg_set_65595bdd868b3009 = function(arg0, arg1, arg2) {
        arg0.set(arg1, arg2 >>> 0);
    };
    imports.wbg.__wbg_set_8fc6bf8a5b1071d1 = function(arg0, arg1, arg2) {
        const ret = arg0.set(arg1, arg2);
        return ret;
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
        const ret = typeof global === 'undefined' ? null : global;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_static_accessor_GLOBAL_THIS_56578be7e9f832b0 = function() {
        const ret = typeof globalThis === 'undefined' ? null : globalThis;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_static_accessor_SELF_37c5d418e4bf5819 = function() {
        const ret = typeof self === 'undefined' ? null : self;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_static_accessor_WINDOW_5de37043a91a9c40 = function() {
        const ret = typeof window === 'undefined' ? null : window;
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
    imports.wbg.__wbg_text_7805bea50de2af49 = function() { return handleError(function (arg0) {
        const ret = arg0.text();
        return ret;
    }, arguments) };
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
        const ret = typeof(v) === 'bigint' ? v : undefined;
        getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
    };
    imports.wbg.__wbindgen_boolean_get = function(arg0) {
        const v = arg0;
        const ret = typeof(v) === 'boolean' ? (v ? 1 : 0) : 2;
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
    imports.wbg.__wbindgen_closure_wrapper1617 = function(arg0, arg1, arg2) {
        const ret = makeMutClosure(arg0, arg1, 208, __wbg_adapter_52);
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
        ;
    };
    imports.wbg.__wbindgen_is_bigint = function(arg0) {
        const ret = typeof(arg0) === 'bigint';
        return ret;
    };
    imports.wbg.__wbindgen_is_function = function(arg0) {
        const ret = typeof(arg0) === 'function';
        return ret;
    };
    imports.wbg.__wbindgen_is_null = function(arg0) {
        const ret = arg0 === null;
        return ret;
    };
    imports.wbg.__wbindgen_is_object = function(arg0) {
        const val = arg0;
        const ret = typeof(val) === 'object' && val !== null;
        return ret;
    };
    imports.wbg.__wbindgen_is_string = function(arg0) {
        const ret = typeof(arg0) === 'string';
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
        const ret = typeof(obj) === 'number' ? obj : undefined;
        getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
    };
    imports.wbg.__wbindgen_number_new = function(arg0) {
        const ret = arg0;
        return ret;
    };
    imports.wbg.__wbindgen_string_get = function(arg0, arg1) {
        const obj = arg1;
        const ret = typeof(obj) === 'string' ? obj : undefined;
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

function __wbg_init_memory(imports, memory) {

}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
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
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('wasm_signer_worker_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    __wbg_init_memory(imports);

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
