/* tslint:disable */
/* eslint-disable */
export function get_shamir_p_b64u(): string;
export function SHAMIR_P_B64U(): string;
export function main(): void;
/**
 * Configure Shamir P at runtime (global manager instance)
 */
export function configure_shamir_p(p_b64u: string): void;
export function configure_shamir_server_urls(relay_server_url: string, apply_lock_route: string, remove_lock_route: string): void;
export function handle_message(message: any): Promise<any>;
export enum WorkerRequestType {
  Ping = 0,
  GenerateVrfChallenge = 1,
  GenerateVrfKeypairBootstrap = 2,
  UnlockVrfKeypair = 3,
  CheckVrfStatus = 4,
  Logout = 5,
  DeriveVrfKeypairFromPrf = 6,
  Shamir3PassClientEncryptCurrentVrfKeypair = 7,
  Shamir3PassClientDecryptVrfKeypair = 8,
  Shamir3PassGenerateServerKeypair = 9,
  Shamir3PassApplyServerLock = 10,
  Shamir3PassRemoveServerLock = 11,
  Shamir3PassConfigP = 12,
  Shamir3PassConfigServerUrls = 13,
}
/**
 * Worker response types enum - corresponds to TypeScript WorkerResponseType
 */
export enum WorkerResponseType {
  PingSuccess = 0,
  GenerateVrfChallengeSuccess = 1,
  GenerateVrfKeypairBootstrapSuccess = 2,
  UnlockVrfKeypairSuccess = 3,
  CheckVrfStatusSuccess = 4,
  LogoutSuccess = 5,
  DeriveVrfKeypairFromPrfSuccess = 6,
  Shamir3PassClientEncryptCurrentVrfKeypairSuccess = 7,
  Shamir3PassClientDecryptVrfKeypairSuccess = 8,
  Shamir3PassGenerateServerKeypairSuccess = 9,
  Shamir3PassApplyServerLockSuccess = 10,
  Shamir3PassRemoveServerLockSuccess = 11,
  Shamir3PassConfigPSuccess = 12,
  Shamir3PassConfigServerUrlsSuccess = 13,
}
export class DeriveVrfKeypairFromPrfRequest {
  private constructor();
  free(): void;
  prfOutput: string;
  nearAccountId: string;
  saveInMemory: boolean;
  get vrfInputData(): VRFInputData | undefined;
  set vrfInputData(value: VRFInputData | null | undefined);
}
export class DeterministicVrfKeypairResponse {
  private constructor();
  free(): void;
  vrfPublicKey: string;
  get vrfChallengeData(): VRFChallengeData | undefined;
  set vrfChallengeData(value: VRFChallengeData | null | undefined);
  get encryptedVrfKeypair(): EncryptedVRFKeypair | undefined;
  set encryptedVrfKeypair(value: EncryptedVRFKeypair | null | undefined);
  get serverEncryptedVrfKeypair(): Shamir3PassEncryptVrfKeypairResult | undefined;
  set serverEncryptedVrfKeypair(value: Shamir3PassEncryptVrfKeypairResult | null | undefined);
  success: boolean;
}
export class EncryptedVRFKeypair {
  private constructor();
  free(): void;
  encryptedVrfDataB64u: string;
  chacha20NonceB64u: string;
}
export class GenerateVrfChallengeRequest {
  private constructor();
  free(): void;
  vrfInputData: VRFInputData;
}
export class GenerateVrfKeypairBootstrapRequest {
  private constructor();
  free(): void;
  get vrfInputData(): VRFInputData | undefined;
  set vrfInputData(value: VRFInputData | null | undefined);
}
export class Shamir3PassApplyServerLockRequest {
  private constructor();
  free(): void;
  e_s_b64u: string;
  kek_c_b64u: string;
}
export class Shamir3PassClientDecryptVrfKeypairRequest {
  private constructor();
  free(): void;
  nearAccountId: string;
  kek_s_b64u: string;
  ciphertextVrfB64u: string;
}
export class Shamir3PassClientEncryptCurrentVrfKeypairRequest {
  private constructor();
  free(): void;
}
export class Shamir3PassConfigPRequest {
  private constructor();
  free(): void;
  p_b64u: string;
}
export class Shamir3PassConfigServerUrlsRequest {
  private constructor();
  free(): void;
  relayServerUrl: string;
  applyLockRoute: string;
  removeLockRoute: string;
}
export class Shamir3PassEncryptVrfKeypairResult {
  private constructor();
  free(): void;
  ciphertextVrfB64u: string;
  kek_s_b64u: string;
  vrfPublicKey: string;
}
export class Shamir3PassGenerateServerKeypairRequest {
  private constructor();
  free(): void;
}
export class Shamir3PassRemoveServerLockRequest {
  private constructor();
  free(): void;
  d_s_b64u: string;
  kek_cs_b64u: string;
}
export class ShamirApplyServerLockHTTPRequest {
  private constructor();
  free(): void;
  kek_c_b64u: string;
}
export class ShamirApplyServerLockHTTPResponse {
  private constructor();
  free(): void;
  kek_cs_b64u: string;
}
export class ShamirRemoveServerLockHTTPRequest {
  private constructor();
  free(): void;
  kek_cs_b64u: string;
}
export class ShamirRemoveServerLockHTTPResponse {
  private constructor();
  free(): void;
  kek_c_b64u: string;
}
export class UnlockVrfKeypairRequest {
  private constructor();
  free(): void;
  nearAccountId: string;
  encryptedVrfKeypair: EncryptedVRFKeypair;
  prfKey: string;
}
export class VRFChallengeData {
  private constructor();
  free(): void;
  vrfInput: string;
  vrfOutput: string;
  vrfProof: string;
  vrfPublicKey: string;
  userId: string;
  rpId: string;
  blockHeight: string;
  blockHash: string;
}
export class VRFInputData {
  private constructor();
  free(): void;
  userId: string;
  rpId: string;
  blockHeight: string;
  blockHash: string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_shamir3passgenerateserverkeypairrequest_free: (a: number, b: number) => void;
  readonly __wbg_shamir3passapplyserverlockrequest_free: (a: number, b: number) => void;
  readonly __wbg_get_shamir3passapplyserverlockrequest_e_s_b64u: (a: number) => [number, number];
  readonly __wbg_set_shamir3passapplyserverlockrequest_e_s_b64u: (a: number, b: number, c: number) => void;
  readonly __wbg_get_shamir3passapplyserverlockrequest_kek_c_b64u: (a: number) => [number, number];
  readonly __wbg_set_shamir3passapplyserverlockrequest_kek_c_b64u: (a: number, b: number, c: number) => void;
  readonly __wbg_shamir3passremoveserverlockrequest_free: (a: number, b: number) => void;
  readonly __wbg_unlockvrfkeypairrequest_free: (a: number, b: number) => void;
  readonly __wbg_get_unlockvrfkeypairrequest_encryptedVrfKeypair: (a: number) => number;
  readonly __wbg_set_unlockvrfkeypairrequest_encryptedVrfKeypair: (a: number, b: number) => void;
  readonly __wbg_get_unlockvrfkeypairrequest_prfKey: (a: number) => [number, number];
  readonly __wbg_set_unlockvrfkeypairrequest_prfKey: (a: number, b: number, c: number) => void;
  readonly __wbg_get_shamir3passremoveserverlockrequest_d_s_b64u: (a: number) => [number, number];
  readonly __wbg_get_shamir3passremoveserverlockrequest_kek_cs_b64u: (a: number) => [number, number];
  readonly __wbg_get_unlockvrfkeypairrequest_nearAccountId: (a: number) => [number, number];
  readonly __wbg_set_shamir3passremoveserverlockrequest_d_s_b64u: (a: number, b: number, c: number) => void;
  readonly __wbg_set_shamir3passremoveserverlockrequest_kek_cs_b64u: (a: number, b: number, c: number) => void;
  readonly __wbg_set_unlockvrfkeypairrequest_nearAccountId: (a: number, b: number, c: number) => void;
  readonly SHAMIR_P_B64U: () => [number, number];
  readonly get_shamir_p_b64u: () => [number, number];
  readonly __wbg_derivevrfkeypairfromprfrequest_free: (a: number, b: number) => void;
  readonly __wbg_get_derivevrfkeypairfromprfrequest_prfOutput: (a: number) => [number, number];
  readonly __wbg_set_derivevrfkeypairfromprfrequest_prfOutput: (a: number, b: number, c: number) => void;
  readonly __wbg_get_derivevrfkeypairfromprfrequest_nearAccountId: (a: number) => [number, number];
  readonly __wbg_set_derivevrfkeypairfromprfrequest_nearAccountId: (a: number, b: number, c: number) => void;
  readonly __wbg_get_derivevrfkeypairfromprfrequest_saveInMemory: (a: number) => number;
  readonly __wbg_set_derivevrfkeypairfromprfrequest_saveInMemory: (a: number, b: number) => void;
  readonly __wbg_get_derivevrfkeypairfromprfrequest_vrfInputData: (a: number) => number;
  readonly __wbg_set_derivevrfkeypairfromprfrequest_vrfInputData: (a: number, b: number) => void;
  readonly __wbg_deterministicvrfkeypairresponse_free: (a: number, b: number) => void;
  readonly __wbg_get_deterministicvrfkeypairresponse_vrfChallengeData: (a: number) => number;
  readonly __wbg_set_deterministicvrfkeypairresponse_vrfChallengeData: (a: number, b: number) => void;
  readonly __wbg_get_deterministicvrfkeypairresponse_encryptedVrfKeypair: (a: number) => number;
  readonly __wbg_set_deterministicvrfkeypairresponse_encryptedVrfKeypair: (a: number, b: number) => void;
  readonly __wbg_get_deterministicvrfkeypairresponse_serverEncryptedVrfKeypair: (a: number) => number;
  readonly __wbg_set_deterministicvrfkeypairresponse_serverEncryptedVrfKeypair: (a: number, b: number) => void;
  readonly __wbg_get_deterministicvrfkeypairresponse_success: (a: number) => number;
  readonly __wbg_set_deterministicvrfkeypairresponse_success: (a: number, b: number) => void;
  readonly __wbg_get_deterministicvrfkeypairresponse_vrfPublicKey: (a: number) => [number, number];
  readonly __wbg_set_deterministicvrfkeypairresponse_vrfPublicKey: (a: number, b: number, c: number) => void;
  readonly __wbg_shamir3passconfigprequest_free: (a: number, b: number) => void;
  readonly __wbg_get_shamir3passconfigprequest_p_b64u: (a: number) => [number, number];
  readonly __wbg_set_shamir3passconfigprequest_p_b64u: (a: number, b: number, c: number) => void;
  readonly __wbg_shamir3passconfigserverurlsrequest_free: (a: number, b: number) => void;
  readonly __wbg_get_shamir3passconfigserverurlsrequest_applyLockRoute: (a: number) => [number, number];
  readonly __wbg_set_shamir3passconfigserverurlsrequest_applyLockRoute: (a: number, b: number, c: number) => void;
  readonly __wbg_get_shamir3passconfigserverurlsrequest_removeLockRoute: (a: number) => [number, number];
  readonly __wbg_set_shamir3passconfigserverurlsrequest_removeLockRoute: (a: number, b: number, c: number) => void;
  readonly __wbg_generatevrfchallengerequest_free: (a: number, b: number) => void;
  readonly __wbg_get_generatevrfchallengerequest_vrfInputData: (a: number) => number;
  readonly __wbg_set_generatevrfchallengerequest_vrfInputData: (a: number, b: number) => void;
  readonly __wbg_generatevrfkeypairbootstraprequest_free: (a: number, b: number) => void;
  readonly __wbg_get_generatevrfkeypairbootstraprequest_vrfInputData: (a: number) => number;
  readonly __wbg_set_generatevrfkeypairbootstraprequest_vrfInputData: (a: number, b: number) => void;
  readonly main: () => void;
  readonly configure_shamir_p: (a: number, b: number) => [number, number];
  readonly configure_shamir_server_urls: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
  readonly handle_message: (a: any) => any;
  readonly __wbg_get_shamir3passconfigserverurlsrequest_relayServerUrl: (a: number) => [number, number];
  readonly __wbg_set_shamir3passconfigserverurlsrequest_relayServerUrl: (a: number, b: number, c: number) => void;
  readonly __wbg_shamirapplyserverlockhttprequest_free: (a: number, b: number) => void;
  readonly __wbg_get_shamirapplyserverlockhttprequest_kek_c_b64u: (a: number) => [number, number];
  readonly __wbg_set_shamirapplyserverlockhttprequest_kek_c_b64u: (a: number, b: number, c: number) => void;
  readonly __wbg_shamirapplyserverlockhttpresponse_free: (a: number, b: number) => void;
  readonly __wbg_shamirremoveserverlockhttprequest_free: (a: number, b: number) => void;
  readonly __wbg_shamirremoveserverlockhttpresponse_free: (a: number, b: number) => void;
  readonly __wbg_get_shamirapplyserverlockhttpresponse_kek_cs_b64u: (a: number) => [number, number];
  readonly __wbg_get_shamirremoveserverlockhttprequest_kek_cs_b64u: (a: number) => [number, number];
  readonly __wbg_get_shamirremoveserverlockhttpresponse_kek_c_b64u: (a: number) => [number, number];
  readonly __wbg_set_shamirapplyserverlockhttpresponse_kek_cs_b64u: (a: number, b: number, c: number) => void;
  readonly __wbg_set_shamirremoveserverlockhttprequest_kek_cs_b64u: (a: number, b: number, c: number) => void;
  readonly __wbg_set_shamirremoveserverlockhttpresponse_kek_c_b64u: (a: number, b: number, c: number) => void;
  readonly __wbg_shamir3passclientencryptcurrentvrfkeypairrequest_free: (a: number, b: number) => void;
  readonly __wbg_shamir3passclientdecryptvrfkeypairrequest_free: (a: number, b: number) => void;
  readonly __wbg_get_shamir3passclientdecryptvrfkeypairrequest_ciphertextVrfB64u: (a: number) => [number, number];
  readonly __wbg_set_shamir3passclientdecryptvrfkeypairrequest_ciphertextVrfB64u: (a: number, b: number, c: number) => void;
  readonly __wbg_shamir3passencryptvrfkeypairresult_free: (a: number, b: number) => void;
  readonly __wbg_encryptedvrfkeypair_free: (a: number, b: number) => void;
  readonly __wbg_get_encryptedvrfkeypair_encryptedVrfDataB64u: (a: number) => [number, number];
  readonly __wbg_set_encryptedvrfkeypair_encryptedVrfDataB64u: (a: number, b: number, c: number) => void;
  readonly __wbg_get_encryptedvrfkeypair_chacha20NonceB64u: (a: number) => [number, number];
  readonly __wbg_set_encryptedvrfkeypair_chacha20NonceB64u: (a: number, b: number, c: number) => void;
  readonly __wbg_vrfinputdata_free: (a: number, b: number) => void;
  readonly __wbg_vrfchallengedata_free: (a: number, b: number) => void;
  readonly __wbg_get_vrfchallengedata_vrfPublicKey: (a: number) => [number, number];
  readonly __wbg_set_vrfchallengedata_vrfPublicKey: (a: number, b: number, c: number) => void;
  readonly __wbg_get_vrfchallengedata_userId: (a: number) => [number, number];
  readonly __wbg_set_vrfchallengedata_userId: (a: number, b: number, c: number) => void;
  readonly __wbg_get_vrfchallengedata_rpId: (a: number) => [number, number];
  readonly __wbg_set_vrfchallengedata_rpId: (a: number, b: number, c: number) => void;
  readonly __wbg_get_vrfchallengedata_blockHeight: (a: number) => [number, number];
  readonly __wbg_set_vrfchallengedata_blockHeight: (a: number, b: number, c: number) => void;
  readonly __wbg_get_vrfchallengedata_blockHash: (a: number) => [number, number];
  readonly __wbg_set_vrfchallengedata_blockHash: (a: number, b: number, c: number) => void;
  readonly __wbg_get_shamir3passencryptvrfkeypairresult_ciphertextVrfB64u: (a: number) => [number, number];
  readonly __wbg_get_shamir3passencryptvrfkeypairresult_kek_s_b64u: (a: number) => [number, number];
  readonly __wbg_get_shamir3passencryptvrfkeypairresult_vrfPublicKey: (a: number) => [number, number];
  readonly __wbg_get_shamir3passclientdecryptvrfkeypairrequest_nearAccountId: (a: number) => [number, number];
  readonly __wbg_get_shamir3passclientdecryptvrfkeypairrequest_kek_s_b64u: (a: number) => [number, number];
  readonly __wbg_get_vrfinputdata_userId: (a: number) => [number, number];
  readonly __wbg_get_vrfinputdata_rpId: (a: number) => [number, number];
  readonly __wbg_get_vrfinputdata_blockHeight: (a: number) => [number, number];
  readonly __wbg_get_vrfchallengedata_vrfInput: (a: number) => [number, number];
  readonly __wbg_get_vrfchallengedata_vrfOutput: (a: number) => [number, number];
  readonly __wbg_get_vrfchallengedata_vrfProof: (a: number) => [number, number];
  readonly __wbg_get_vrfinputdata_blockHash: (a: number) => [number, number];
  readonly __wbg_set_shamir3passencryptvrfkeypairresult_ciphertextVrfB64u: (a: number, b: number, c: number) => void;
  readonly __wbg_set_shamir3passencryptvrfkeypairresult_kek_s_b64u: (a: number, b: number, c: number) => void;
  readonly __wbg_set_shamir3passencryptvrfkeypairresult_vrfPublicKey: (a: number, b: number, c: number) => void;
  readonly __wbg_set_shamir3passclientdecryptvrfkeypairrequest_nearAccountId: (a: number, b: number, c: number) => void;
  readonly __wbg_set_shamir3passclientdecryptvrfkeypairrequest_kek_s_b64u: (a: number, b: number, c: number) => void;
  readonly __wbg_set_vrfinputdata_userId: (a: number, b: number, c: number) => void;
  readonly __wbg_set_vrfinputdata_rpId: (a: number, b: number, c: number) => void;
  readonly __wbg_set_vrfinputdata_blockHeight: (a: number, b: number, c: number) => void;
  readonly __wbg_set_vrfchallengedata_vrfInput: (a: number, b: number, c: number) => void;
  readonly __wbg_set_vrfchallengedata_vrfOutput: (a: number, b: number, c: number) => void;
  readonly __wbg_set_vrfchallengedata_vrfProof: (a: number, b: number, c: number) => void;
  readonly __wbg_set_vrfinputdata_blockHash: (a: number, b: number, c: number) => void;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_2: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_export_6: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly closure119_externref_shim: (a: number, b: number, c: any) => void;
  readonly closure183_externref_shim: (a: number, b: number, c: any, d: any) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
