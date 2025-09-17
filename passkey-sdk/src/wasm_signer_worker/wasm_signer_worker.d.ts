/* tslint:disable */
/* eslint-disable */
export function init_worker(): void;
/**
 * Unified message handler for all signer worker operations
 * This replaces the TypeScript-based message dispatching with a Rust-based approach
 * for better type safety and performance
 */
export function handle_signer_message(message_json: string): Promise<string>;
/**
 * Behavior mode for confirmation flow
 */
export enum ConfirmationBehavior {
  RequireClick = 0,
  AutoProceed = 1,
}
/**
 * UI mode for confirmation display
 */
export enum ConfirmationUIMode {
  Skip = 0,
  Modal = 1,
  Embedded = 2,
}
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
 */
export enum ProgressMessageType {
  RegistrationProgress = 18,
  RegistrationComplete = 19,
  ExecuteActionsProgress = 20,
  ExecuteActionsComplete = 21,
}
/**
 * Progress step identifiers for different phases of operations
 * Values start at 100 to avoid conflicts with WorkerResponseType enum
 */
export enum ProgressStep {
  Preparation = 100,
  UserConfirmation = 101,
  ContractVerification = 102,
  WebauthnAuthentication = 103,
  AuthenticationComplete = 104,
  TransactionSigningProgress = 105,
  TransactionSigningComplete = 106,
  Error = 107,
}
/**
 * User verification policy for WebAuthn authenticators
 */
export enum UserVerificationPolicy {
  Required = 0,
  Preferred = 1,
  Discouraged = 2,
}
export enum WorkerRequestType {
  DeriveNearKeypairAndEncrypt = 0,
  RecoverKeypairFromPasskey = 1,
  CheckCanRegisterUser = 2,
  DecryptPrivateKeyWithPrf = 3,
  SignTransactionsWithActions = 4,
  ExtractCosePublicKey = 5,
  SignTransactionWithKeyPair = 6,
  SignNep413Message = 7,
  RegistrationCredentialConfirmation = 8,
}
/**
 * Worker response types enum - corresponds to TypeScript WorkerResponseType
 */
export enum WorkerResponseType {
  DeriveNearKeypairAndEncryptSuccess = 0,
  RecoverKeypairFromPasskeySuccess = 1,
  CheckCanRegisterUserSuccess = 2,
  DecryptPrivateKeyWithPrfSuccess = 3,
  SignTransactionsWithActionsSuccess = 4,
  ExtractCosePublicKeySuccess = 5,
  SignTransactionWithKeyPairSuccess = 6,
  SignNep413MessageSuccess = 7,
  RegistrationCredentialConfirmationSuccess = 8,
  DeriveNearKeypairAndEncryptFailure = 9,
  RecoverKeypairFromPasskeyFailure = 10,
  CheckCanRegisterUserFailure = 11,
  DecryptPrivateKeyWithPrfFailure = 12,
  SignTransactionsWithActionsFailure = 13,
  ExtractCosePublicKeyFailure = 14,
  SignTransactionWithKeyPairFailure = 15,
  SignNep413MessageFailure = 16,
  RegistrationCredentialConfirmationFailure = 17,
  RegistrationProgress = 18,
  RegistrationComplete = 19,
  ExecuteActionsProgress = 20,
  ExecuteActionsComplete = 21,
}
export class AuthenticationResponse {
  private constructor();
  free(): void;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  get userHandle(): string | undefined;
  set userHandle(value: string | null | undefined);
}
/**
 * Options for configuring WebAuthn authenticator behavior during registration
 */
export class AuthenticatorOptions {
  private constructor();
  free(): void;
  get userVerification(): UserVerificationPolicy | undefined;
  set userVerification(value: UserVerificationPolicy | null | undefined);
  get originPolicy(): OriginPolicyInput | undefined;
  set originPolicy(value: OriginPolicyInput | null | undefined);
}
export class CheckCanRegisterUserRequest {
  private constructor();
  free(): void;
  vrfChallenge: VrfChallenge;
  credential: SerializedRegistrationCredential;
  contractId: string;
  nearRpcUrl: string;
  get authenticatorOptions(): AuthenticatorOptions | undefined;
  set authenticatorOptions(value: AuthenticatorOptions | null | undefined);
}
export class ClientExtensionResults {
  private constructor();
  free(): void;
  prf: PrfResults;
}
/**
 * Unified confirmation configuration passed from main thread to WASM worker
 */
export class ConfirmationConfig {
  private constructor();
  free(): void;
  /**
   * Type of UI to display for confirmation
   */
  uiMode: ConfirmationUIMode;
  /**
   * How the confirmation UI behaves
   */
  behavior: ConfirmationBehavior;
  /**
   * Delay in milliseconds before auto-proceeding (only used with autoProceedWithDelay)
   */
  get autoProceedDelay(): number | undefined;
  /**
   * Delay in milliseconds before auto-proceeding (only used with autoProceedWithDelay)
   */
  set autoProceedDelay(value: number | null | undefined);
  /**
   * UI theme preference (dark/light)
   */
  get theme(): string | undefined;
  /**
   * UI theme preference (dark/light)
   */
  set theme(value: string | null | undefined);
}
export class CoseExtractionResult {
  private constructor();
  free(): void;
  cosePublicKeyBytes: Uint8Array;
}
export class DecryptPrivateKeyRequest {
  free(): void;
  constructor(near_account_id: string, chacha20_prf_output: string, encrypted_private_key_data: string, encrypted_private_key_iv: string);
  nearAccountId: string;
  chacha20PrfOutput: string;
  encryptedPrivateKeyData: string;
  encryptedPrivateKeyIv: string;
}
export class DecryptPrivateKeyResult {
  free(): void;
  constructor(private_key: string, near_account_id: string);
  privateKey: string;
  nearAccountId: string;
}
export class Decryption {
  free(): void;
  constructor(chacha20_prf_output: string, encrypted_private_key_data: string, encrypted_private_key_iv: string);
  chacha20_prf_output: string;
  encrypted_private_key_data: string;
  encrypted_private_key_iv: string;
}
/**
 * Decryption payload (consolidated for deserialization and WASM binding)
 * Note: chacha20_prf_output is collected during user confirmation flow
 */
export class DecryptionPayload {
  free(): void;
  constructor(encrypted_private_key_data: string, encrypted_private_key_iv: string);
  encryptedPrivateKeyData: string;
  encryptedPrivateKeyIv: string;
}
export class DeriveNearKeypairAndEncryptRequest {
  private constructor();
  free(): void;
  dualPrfOutputs: DualPrfOutputsStruct;
  nearAccountId: string;
  credential: SerializedRegistrationCredential;
  get registrationTransaction(): LinkDeviceRegistrationTransaction | undefined;
  set registrationTransaction(value: LinkDeviceRegistrationTransaction | null | undefined);
  get authenticatorOptions(): AuthenticatorOptions | undefined;
  set authenticatorOptions(value: AuthenticatorOptions | null | undefined);
}
export class DeriveNearKeypairAndEncryptResult {
  free(): void;
  constructor(near_account_id: string, public_key: string, encrypted_data: string, iv: string, stored: boolean, signed_transaction?: WasmSignedTransaction | null);
  nearAccountId: string;
  publicKey: string;
  encryptedData: string;
  iv: string;
  stored: boolean;
  get signedTransaction(): WasmSignedTransaction | undefined;
  set signedTransaction(value: WasmSignedTransaction | null | undefined);
}
export class DualPrfOutputsStruct {
  private constructor();
  free(): void;
  chacha20PrfOutput: string;
  ed25519PrfOutput: string;
}
export class ExtractCoseRequest {
  private constructor();
  free(): void;
  attestationObjectBase64url: string;
}
export class KeyActionResult {
  free(): void;
  constructor(success: boolean, transaction_hash: string | null | undefined, signed_transaction: WasmSignedTransaction | null | undefined, logs: string[], error?: string | null);
  success: boolean;
  get transactionHash(): string | undefined;
  set transactionHash(value: string | null | undefined);
  get signedTransaction(): WasmSignedTransaction | undefined;
  set signedTransaction(value: WasmSignedTransaction | null | undefined);
  logs: string[];
  get error(): string | undefined;
  set error(value: string | null | undefined);
}
export class LinkDeviceRegistrationTransaction {
  private constructor();
  free(): void;
  vrfChallenge: VrfChallenge;
  contractId: string;
  nonce: string;
  blockHash: string;
  deterministicVrfPublicKey: string;
}
/**
 * Origin policy input for WebAuthn registration (user-provided)
 */
export class OriginPolicyInput {
  private constructor();
  free(): void;
  /**
   * Exactly one of these should be set
   */
  get single(): boolean | undefined;
  /**
   * Exactly one of these should be set
   */
  set single(value: boolean | null | undefined);
  get all_subdomains(): boolean | undefined;
  set all_subdomains(value: boolean | null | undefined);
  get multiple(): string[] | undefined;
  set multiple(value: string[] | null | undefined);
}
export class PrfOutputs {
  private constructor();
  free(): void;
  get first(): string | undefined;
  set first(value: string | null | undefined);
  get second(): string | undefined;
  set second(value: string | null | undefined);
}
export class PrfResults {
  private constructor();
  free(): void;
  results: PrfOutputs;
}
export class RecoverKeypairRequest {
  private constructor();
  free(): void;
  credential: SerializedCredential;
  get accountIdHint(): string | undefined;
  set accountIdHint(value: string | null | undefined);
}
export class RecoverKeypairResult {
  free(): void;
  constructor(public_key: string, encrypted_data: string, iv: string, account_id_hint?: string | null);
  publicKey: string;
  encryptedData: string;
  iv: string;
  get accountIdHint(): string | undefined;
  set accountIdHint(value: string | null | undefined);
}
export class RegistrationCheckRequest {
  free(): void;
  constructor(contract_id: string, near_rpc_url: string);
  contract_id: string;
  near_rpc_url: string;
}
export class RegistrationCheckResult {
  free(): void;
  constructor(verified: boolean, registration_info: RegistrationInfoStruct | null | undefined, logs: string[], signed_transaction?: WasmSignedTransaction | null, error?: string | null);
  verified: boolean;
  get registrationInfo(): RegistrationInfoStruct | undefined;
  set registrationInfo(value: RegistrationInfoStruct | null | undefined);
  logs: string[];
  get signedTransaction(): WasmSignedTransaction | undefined;
  set signedTransaction(value: WasmSignedTransaction | null | undefined);
  get error(): string | undefined;
  set error(value: string | null | undefined);
}
export class RegistrationCredentialConfirmationRequest {
  private constructor();
  free(): void;
  nearAccountId: string;
  deviceNumber: number;
  contractId: string;
  nearRpcUrl: string;
}
export class RegistrationCredentialConfirmationResult {
  private constructor();
  free(): void;
  confirmed: boolean;
  requestId: string;
  intentDigest: string;
  credential: any;
  get prfOutput(): string | undefined;
  set prfOutput(value: string | null | undefined);
  get vrfChallenge(): VrfChallenge | undefined;
  set vrfChallenge(value: VrfChallenge | null | undefined);
  get transactionContext(): TransactionContext | undefined;
  set transactionContext(value: TransactionContext | null | undefined);
  get error(): string | undefined;
  set error(value: string | null | undefined);
}
export class RegistrationInfoStruct {
  free(): void;
  constructor(credential_id: Uint8Array, credential_public_key: Uint8Array, user_id: string, vrf_public_key?: Uint8Array | null);
  credentialId: Uint8Array;
  credentialPublicKey: Uint8Array;
  userId: string;
  get vrfPublicKey(): Uint8Array | undefined;
  set vrfPublicKey(value: Uint8Array | null | undefined);
}
export class RegistrationPayload {
  private constructor();
  free(): void;
  nearAccountId: string;
  nonce: string;
  blockHash: string;
  get deterministicVrfPublicKey(): string | undefined;
  set deterministicVrfPublicKey(value: string | null | undefined);
  get deviceNumber(): number | undefined;
  set deviceNumber(value: number | null | undefined);
  get authenticatorOptions(): AuthenticatorOptions | undefined;
  set authenticatorOptions(value: AuthenticatorOptions | null | undefined);
}
export class RegistrationResponse {
  private constructor();
  free(): void;
  clientDataJSON: string;
  attestationObject: string;
  transports: string[];
}
/**
 * RPC call parameters for NEAR operations and VRF generation
 * Used to pass essential parameters for background operations
 */
export class RpcCallPayload {
  private constructor();
  free(): void;
  contractId: string;
  nearRpcUrl: string;
  nearAccountId: string;
}
export class SerializedCredential {
  private constructor();
  free(): void;
  id: string;
  rawId: string;
  type: string;
  get authenticatorAttachment(): string | undefined;
  set authenticatorAttachment(value: string | null | undefined);
  response: AuthenticationResponse;
  clientExtensionResults: ClientExtensionResults;
}
export class SerializedRegistrationCredential {
  private constructor();
  free(): void;
  id: string;
  rawId: string;
  type: string;
  get authenticatorAttachment(): string | undefined;
  set authenticatorAttachment(value: string | null | undefined);
  response: RegistrationResponse;
  clientExtensionResults: ClientExtensionResults;
}
export class SignNep413Request {
  private constructor();
  free(): void;
  message: string;
  recipient: string;
  nonce: string;
  get state(): string | undefined;
  set state(value: string | null | undefined);
  accountId: string;
  encryptedPrivateKeyData: string;
  encryptedPrivateKeyIv: string;
  prfOutput: string;
}
export class SignNep413Result {
  free(): void;
  constructor(account_id: string, public_key: string, signature: string, state?: string | null);
  accountId: string;
  publicKey: string;
  signature: string;
  get state(): string | undefined;
  set state(value: string | null | undefined);
}
export class SignTransactionWithKeyPairRequest {
  private constructor();
  free(): void;
  nearPrivateKey: string;
  signerAccountId: string;
  receiverId: string;
  nonce: string;
  blockHash: string;
  actions: string;
}
export class SignTransactionsWithActionsRequest {
  private constructor();
  free(): void;
  rpcCall: RpcCallPayload;
  decryption: DecryptionPayload;
  txSigningRequests: TransactionPayload[];
  /**
   * Unified confirmation configuration for controlling the confirmation flow
   */
  get confirmationConfig(): ConfirmationConfig | undefined;
  /**
   * Unified confirmation configuration for controlling the confirmation flow
   */
  set confirmationConfig(value: ConfirmationConfig | null | undefined);
}
/**
 * Transaction context containing NEAR blockchain data
 * Computed in the main thread confirmation flow
 */
export class TransactionContext {
  private constructor();
  free(): void;
  nearPublicKeyStr: string;
  nextNonce: string;
  txBlockHeight: string;
  txBlockHash: string;
}
export class TransactionPayload {
  private constructor();
  free(): void;
  nearAccountId: string;
  receiverId: string;
  actions: string;
}
export class TransactionSignResult {
  free(): void;
  constructor(success: boolean, transaction_hashes: string[] | null | undefined, signed_transactions: WasmSignedTransaction[] | null | undefined, logs: string[], error?: string | null);
  /**
   * Helper function to create a failed TransactionSignResult
   */
  static failed(logs: string[], error_msg: string): TransactionSignResult;
  success: boolean;
  get transactionHashes(): string[] | undefined;
  set transactionHashes(value: string[] | null | undefined);
  get signedTransactions(): WasmSignedTransaction[] | undefined;
  set signedTransactions(value: WasmSignedTransaction[] | null | undefined);
  logs: string[];
  get error(): string | undefined;
  set error(value: string | null | undefined);
}
/**
 * Consolidated verification type for all flows.
 * Credentials are collected during the confirmation flow via the main thread.
 * DEPRECATED: Use RpcCallPayload instead
 */
export class VerificationPayload {
  private constructor();
  free(): void;
  contractId: string;
  nearRpcUrl: string;
  get vrfChallenge(): VrfChallenge | undefined;
  set vrfChallenge(value: VrfChallenge | null | undefined);
}
export class VrfChallenge {
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
export class WasmPublicKey {
  free(): void;
  constructor(keyType: number, keyData: Uint8Array);
  keyType: number;
  keyData: Uint8Array;
}
export class WasmSignature {
  free(): void;
  constructor(keyType: number, signatureData: Uint8Array);
  keyType: number;
  signatureData: Uint8Array;
}
export class WasmSignedTransaction {
  free(): void;
  constructor(transaction: WasmTransaction, signature: WasmSignature, borshBytes: Uint8Array);
  transaction: WasmTransaction;
  signature: WasmSignature;
  borshBytes: Uint8Array;
}
export class WasmTransaction {
  free(): void;
  constructor(signerId: string, publicKey: WasmPublicKey, nonce: bigint, receiverId: string, blockHash: Uint8Array, actionsJson: string);
  signerId: string;
  publicKey: WasmPublicKey;
  nonce: bigint;
  receiverId: string;
  blockHash: Uint8Array;
  actionsJson: string;
}
export class WebAuthnAuthenticationCredentialStruct {
  free(): void;
  constructor(id: string, raw_id: string, credential_type: string, authenticator_attachment: string | null | undefined, client_data_json: string, authenticator_data: string, signature: string, user_handle?: string | null);
  id: string;
  raw_id: string;
  credential_type: string;
  get authenticator_attachment(): string | undefined;
  set authenticator_attachment(value: string | null | undefined);
  client_data_json: string;
  authenticator_data: string;
  signature: string;
  get user_handle(): string | undefined;
  set user_handle(value: string | null | undefined);
}
export class WebAuthnRegistrationCredentialStruct {
  free(): void;
  constructor(id: string, raw_id: string, credential_type: string, authenticator_attachment: string | null | undefined, client_data_json: string, attestation_object: string, transports?: string[] | null, ed25519_prf_output?: string | null);
  id: string;
  raw_id: string;
  credential_type: string;
  get authenticator_attachment(): string | undefined;
  set authenticator_attachment(value: string | null | undefined);
  client_data_json: string;
  attestation_object: string;
  get transports(): string[] | undefined;
  set transports(value: string[] | null | undefined);
  get ed25519_prf_output(): string | undefined;
  set ed25519_prf_output(value: string | null | undefined);
}
/**
 * Base progress message structure sent from WASM to TypeScript
 * Auto-generates TypeScript interface: WorkerProgressMessage
 */
export class WorkerProgressMessage {
  free(): void;
  constructor(message_type: string, step: string, message: string, status: string, timestamp: number, data?: string | null);
  message_type: string;
  step: string;
  message: string;
  status: string;
  timestamp: number;
  get data(): string | undefined;
  set data(value: string | null | undefined);
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_webauthnregistrationcredentialstruct_free: (a: number, b: number) => void;
  readonly __wbg_get_webauthnregistrationcredentialstruct_authenticator_attachment: (a: number) => [number, number];
  readonly __wbg_set_webauthnregistrationcredentialstruct_authenticator_attachment: (a: number, b: number, c: number) => void;
  readonly __wbg_get_webauthnregistrationcredentialstruct_transports: (a: number) => [number, number];
  readonly __wbg_set_webauthnregistrationcredentialstruct_transports: (a: number, b: number, c: number) => void;
  readonly webauthnregistrationcredentialstruct_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number) => number;
  readonly __wbg_webauthnauthenticationcredentialstruct_free: (a: number, b: number) => void;
  readonly webauthnauthenticationcredentialstruct_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number) => number;
  readonly __wbg_serializedcredential_free: (a: number, b: number) => void;
  readonly __wbg_get_serializedcredential_authenticatorAttachment: (a: number) => [number, number];
  readonly __wbg_set_serializedcredential_authenticatorAttachment: (a: number, b: number, c: number) => void;
  readonly __wbg_get_serializedcredential_response: (a: number) => number;
  readonly __wbg_set_serializedcredential_response: (a: number, b: number) => void;
  readonly __wbg_get_serializedcredential_clientExtensionResults: (a: number) => number;
  readonly __wbg_set_serializedcredential_clientExtensionResults: (a: number, b: number) => void;
  readonly __wbg_serializedregistrationcredential_free: (a: number, b: number) => void;
  readonly __wbg_get_serializedregistrationcredential_authenticatorAttachment: (a: number) => [number, number];
  readonly __wbg_set_serializedregistrationcredential_authenticatorAttachment: (a: number, b: number, c: number) => void;
  readonly __wbg_get_serializedregistrationcredential_response: (a: number) => number;
  readonly __wbg_set_serializedregistrationcredential_response: (a: number, b: number) => void;
  readonly __wbg_get_serializedregistrationcredential_clientExtensionResults: (a: number) => number;
  readonly __wbg_set_serializedregistrationcredential_clientExtensionResults: (a: number, b: number) => void;
  readonly __wbg_authenticationresponse_free: (a: number, b: number) => void;
  readonly __wbg_get_authenticationresponse_clientDataJSON: (a: number) => [number, number];
  readonly __wbg_set_authenticationresponse_clientDataJSON: (a: number, b: number, c: number) => void;
  readonly __wbg_get_authenticationresponse_authenticatorData: (a: number) => [number, number];
  readonly __wbg_set_authenticationresponse_authenticatorData: (a: number, b: number, c: number) => void;
  readonly __wbg_get_authenticationresponse_signature: (a: number) => [number, number];
  readonly __wbg_set_authenticationresponse_signature: (a: number, b: number, c: number) => void;
  readonly __wbg_get_authenticationresponse_userHandle: (a: number) => [number, number];
  readonly __wbg_set_authenticationresponse_userHandle: (a: number, b: number, c: number) => void;
  readonly __wbg_registrationresponse_free: (a: number, b: number) => void;
  readonly __wbg_get_registrationresponse_transports: (a: number) => [number, number];
  readonly __wbg_set_registrationresponse_transports: (a: number, b: number, c: number) => void;
  readonly __wbg_clientextensionresults_free: (a: number, b: number) => void;
  readonly __wbg_get_clientextensionresults_prf: (a: number) => number;
  readonly __wbg_set_clientextensionresults_prf: (a: number, b: number) => void;
  readonly __wbg_prfresults_free: (a: number, b: number) => void;
  readonly __wbg_prfoutputs_free: (a: number, b: number) => void;
  readonly __wbg_get_prfoutputs_first: (a: number) => [number, number];
  readonly __wbg_set_prfoutputs_first: (a: number, b: number, c: number) => void;
  readonly __wbg_get_prfoutputs_second: (a: number) => [number, number];
  readonly __wbg_set_prfoutputs_second: (a: number, b: number, c: number) => void;
  readonly __wbg_vrfchallenge_free: (a: number, b: number) => void;
  readonly __wbg_get_vrfchallenge_vrfPublicKey: (a: number) => [number, number];
  readonly __wbg_set_vrfchallenge_vrfPublicKey: (a: number, b: number, c: number) => void;
  readonly __wbg_get_vrfchallenge_userId: (a: number) => [number, number];
  readonly __wbg_set_vrfchallenge_userId: (a: number, b: number, c: number) => void;
  readonly __wbg_get_vrfchallenge_rpId: (a: number) => [number, number];
  readonly __wbg_set_vrfchallenge_rpId: (a: number, b: number, c: number) => void;
  readonly __wbg_get_vrfchallenge_blockHeight: (a: number) => [number, number];
  readonly __wbg_set_vrfchallenge_blockHeight: (a: number, b: number, c: number) => void;
  readonly __wbg_get_vrfchallenge_blockHash: (a: number) => [number, number];
  readonly __wbg_set_vrfchallenge_blockHash: (a: number, b: number, c: number) => void;
  readonly __wbg_get_webauthnregistrationcredentialstruct_id: (a: number) => [number, number];
  readonly __wbg_get_webauthnregistrationcredentialstruct_raw_id: (a: number) => [number, number];
  readonly __wbg_get_webauthnregistrationcredentialstruct_credential_type: (a: number) => [number, number];
  readonly __wbg_get_webauthnregistrationcredentialstruct_client_data_json: (a: number) => [number, number];
  readonly __wbg_get_webauthnregistrationcredentialstruct_attestation_object: (a: number) => [number, number];
  readonly __wbg_get_webauthnauthenticationcredentialstruct_id: (a: number) => [number, number];
  readonly __wbg_get_webauthnauthenticationcredentialstruct_raw_id: (a: number) => [number, number];
  readonly __wbg_get_webauthnauthenticationcredentialstruct_credential_type: (a: number) => [number, number];
  readonly __wbg_get_serializedregistrationcredential_id: (a: number) => [number, number];
  readonly __wbg_get_serializedregistrationcredential_rawId: (a: number) => [number, number];
  readonly __wbg_get_serializedregistrationcredential_type: (a: number) => [number, number];
  readonly __wbg_get_serializedcredential_id: (a: number) => [number, number];
  readonly __wbg_get_serializedcredential_rawId: (a: number) => [number, number];
  readonly __wbg_get_serializedcredential_type: (a: number) => [number, number];
  readonly __wbg_get_registrationresponse_clientDataJSON: (a: number) => [number, number];
  readonly __wbg_get_registrationresponse_attestationObject: (a: number) => [number, number];
  readonly __wbg_get_vrfchallenge_vrfInput: (a: number) => [number, number];
  readonly __wbg_get_vrfchallenge_vrfOutput: (a: number) => [number, number];
  readonly __wbg_get_vrfchallenge_vrfProof: (a: number) => [number, number];
  readonly __wbg_get_webauthnauthenticationcredentialstruct_client_data_json: (a: number) => [number, number];
  readonly __wbg_get_webauthnauthenticationcredentialstruct_authenticator_data: (a: number) => [number, number];
  readonly __wbg_get_webauthnauthenticationcredentialstruct_signature: (a: number) => [number, number];
  readonly __wbg_set_webauthnregistrationcredentialstruct_ed25519_prf_output: (a: number, b: number, c: number) => void;
  readonly __wbg_set_webauthnauthenticationcredentialstruct_user_handle: (a: number, b: number, c: number) => void;
  readonly __wbg_set_webauthnauthenticationcredentialstruct_authenticator_attachment: (a: number, b: number, c: number) => void;
  readonly __wbg_set_prfresults_results: (a: number, b: number) => void;
  readonly __wbg_get_webauthnregistrationcredentialstruct_ed25519_prf_output: (a: number) => [number, number];
  readonly __wbg_get_webauthnauthenticationcredentialstruct_user_handle: (a: number) => [number, number];
  readonly __wbg_get_webauthnauthenticationcredentialstruct_authenticator_attachment: (a: number) => [number, number];
  readonly __wbg_get_prfresults_results: (a: number) => number;
  readonly __wbg_set_webauthnregistrationcredentialstruct_id: (a: number, b: number, c: number) => void;
  readonly __wbg_set_webauthnregistrationcredentialstruct_raw_id: (a: number, b: number, c: number) => void;
  readonly __wbg_set_webauthnregistrationcredentialstruct_credential_type: (a: number, b: number, c: number) => void;
  readonly __wbg_set_webauthnregistrationcredentialstruct_client_data_json: (a: number, b: number, c: number) => void;
  readonly __wbg_set_webauthnregistrationcredentialstruct_attestation_object: (a: number, b: number, c: number) => void;
  readonly __wbg_set_webauthnauthenticationcredentialstruct_id: (a: number, b: number, c: number) => void;
  readonly __wbg_set_webauthnauthenticationcredentialstruct_raw_id: (a: number, b: number, c: number) => void;
  readonly __wbg_set_webauthnauthenticationcredentialstruct_credential_type: (a: number, b: number, c: number) => void;
  readonly __wbg_set_serializedregistrationcredential_id: (a: number, b: number, c: number) => void;
  readonly __wbg_set_serializedregistrationcredential_rawId: (a: number, b: number, c: number) => void;
  readonly __wbg_set_serializedregistrationcredential_type: (a: number, b: number, c: number) => void;
  readonly __wbg_set_serializedcredential_id: (a: number, b: number, c: number) => void;
  readonly __wbg_set_serializedcredential_rawId: (a: number, b: number, c: number) => void;
  readonly __wbg_set_serializedcredential_type: (a: number, b: number, c: number) => void;
  readonly __wbg_set_registrationresponse_clientDataJSON: (a: number, b: number, c: number) => void;
  readonly __wbg_set_registrationresponse_attestationObject: (a: number, b: number, c: number) => void;
  readonly __wbg_set_vrfchallenge_vrfInput: (a: number, b: number, c: number) => void;
  readonly __wbg_set_vrfchallenge_vrfOutput: (a: number, b: number, c: number) => void;
  readonly __wbg_set_vrfchallenge_vrfProof: (a: number, b: number, c: number) => void;
  readonly __wbg_set_webauthnauthenticationcredentialstruct_client_data_json: (a: number, b: number, c: number) => void;
  readonly __wbg_set_webauthnauthenticationcredentialstruct_authenticator_data: (a: number, b: number, c: number) => void;
  readonly __wbg_set_webauthnauthenticationcredentialstruct_signature: (a: number, b: number, c: number) => void;
  readonly __wbg_recoverkeypairrequest_free: (a: number, b: number) => void;
  readonly __wbg_get_recoverkeypairrequest_credential: (a: number) => number;
  readonly __wbg_set_recoverkeypairrequest_credential: (a: number, b: number) => void;
  readonly __wbg_get_recoverkeypairrequest_accountIdHint: (a: number) => [number, number];
  readonly __wbg_set_recoverkeypairrequest_accountIdHint: (a: number, b: number, c: number) => void;
  readonly __wbg_recoverkeypairresult_free: (a: number, b: number) => void;
  readonly __wbg_get_recoverkeypairresult_iv: (a: number) => [number, number];
  readonly __wbg_set_recoverkeypairresult_iv: (a: number, b: number, c: number) => void;
  readonly __wbg_get_recoverkeypairresult_accountIdHint: (a: number) => [number, number];
  readonly __wbg_set_recoverkeypairresult_accountIdHint: (a: number, b: number, c: number) => void;
  readonly recoverkeypairresult_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
  readonly __wbg_originpolicyinput_free: (a: number, b: number) => void;
  readonly __wbg_get_originpolicyinput_single: (a: number) => number;
  readonly __wbg_set_originpolicyinput_single: (a: number, b: number) => void;
  readonly __wbg_get_originpolicyinput_all_subdomains: (a: number) => number;
  readonly __wbg_set_originpolicyinput_all_subdomains: (a: number, b: number) => void;
  readonly __wbg_get_originpolicyinput_multiple: (a: number) => [number, number];
  readonly __wbg_set_originpolicyinput_multiple: (a: number, b: number, c: number) => void;
  readonly __wbg_authenticatoroptions_free: (a: number, b: number) => void;
  readonly __wbg_get_authenticatoroptions_userVerification: (a: number) => number;
  readonly __wbg_set_authenticatoroptions_userVerification: (a: number, b: number) => void;
  readonly __wbg_get_authenticatoroptions_originPolicy: (a: number) => number;
  readonly __wbg_set_authenticatoroptions_originPolicy: (a: number, b: number) => void;
  readonly __wbg_rpccallpayload_free: (a: number, b: number) => void;
  readonly __wbg_transactioncontext_free: (a: number, b: number) => void;
  readonly __wbg_get_transactioncontext_txBlockHash: (a: number) => [number, number];
  readonly __wbg_set_transactioncontext_txBlockHash: (a: number, b: number, c: number) => void;
  readonly __wbg_verificationpayload_free: (a: number, b: number) => void;
  readonly __wbg_get_verificationpayload_vrfChallenge: (a: number) => number;
  readonly __wbg_set_verificationpayload_vrfChallenge: (a: number, b: number) => void;
  readonly __wbg_confirmationconfig_free: (a: number, b: number) => void;
  readonly __wbg_get_confirmationconfig_uiMode: (a: number) => number;
  readonly __wbg_set_confirmationconfig_uiMode: (a: number, b: number) => void;
  readonly __wbg_get_confirmationconfig_behavior: (a: number) => number;
  readonly __wbg_set_confirmationconfig_behavior: (a: number, b: number) => void;
  readonly __wbg_get_confirmationconfig_autoProceedDelay: (a: number) => number;
  readonly __wbg_set_confirmationconfig_autoProceedDelay: (a: number, b: number) => void;
  readonly __wbg_get_confirmationconfig_theme: (a: number) => [number, number];
  readonly __wbg_set_confirmationconfig_theme: (a: number, b: number, c: number) => void;
  readonly __wbg_decryptionpayload_free: (a: number, b: number) => void;
  readonly __wbg_get_decryptionpayload_encryptedPrivateKeyData: (a: number) => [number, number];
  readonly __wbg_set_decryptionpayload_encryptedPrivateKeyData: (a: number, b: number, c: number) => void;
  readonly __wbg_get_decryptionpayload_encryptedPrivateKeyIv: (a: number) => [number, number];
  readonly __wbg_set_decryptionpayload_encryptedPrivateKeyIv: (a: number, b: number, c: number) => void;
  readonly decryptionpayload_new: (a: number, b: number, c: number, d: number) => number;
  readonly __wbg_registrationpayload_free: (a: number, b: number) => void;
  readonly __wbg_get_registrationpayload_deviceNumber: (a: number) => number;
  readonly __wbg_set_registrationpayload_deviceNumber: (a: number, b: number) => void;
  readonly __wbg_get_registrationpayload_authenticatorOptions: (a: number) => number;
  readonly __wbg_set_registrationpayload_authenticatorOptions: (a: number, b: number) => void;
  readonly handle_signer_message: (a: number, b: number) => any;
  readonly __wbg_get_registrationpayload_deterministicVrfPublicKey: (a: number) => [number, number];
  readonly __wbg_set_registrationpayload_deterministicVrfPublicKey: (a: number, b: number, c: number) => void;
  readonly __wbg_set_rpccallpayload_contractId: (a: number, b: number, c: number) => void;
  readonly __wbg_set_rpccallpayload_nearRpcUrl: (a: number, b: number, c: number) => void;
  readonly __wbg_set_rpccallpayload_nearAccountId: (a: number, b: number, c: number) => void;
  readonly __wbg_set_transactioncontext_nearPublicKeyStr: (a: number, b: number, c: number) => void;
  readonly __wbg_set_transactioncontext_nextNonce: (a: number, b: number, c: number) => void;
  readonly __wbg_set_transactioncontext_txBlockHeight: (a: number, b: number, c: number) => void;
  readonly __wbg_set_verificationpayload_contractId: (a: number, b: number, c: number) => void;
  readonly __wbg_set_verificationpayload_nearRpcUrl: (a: number, b: number, c: number) => void;
  readonly __wbg_set_recoverkeypairresult_publicKey: (a: number, b: number, c: number) => void;
  readonly __wbg_set_recoverkeypairresult_encryptedData: (a: number, b: number, c: number) => void;
  readonly __wbg_set_registrationpayload_nearAccountId: (a: number, b: number, c: number) => void;
  readonly __wbg_set_registrationpayload_nonce: (a: number, b: number, c: number) => void;
  readonly __wbg_set_registrationpayload_blockHash: (a: number, b: number, c: number) => void;
  readonly init_worker: () => void;
  readonly __wbg_get_rpccallpayload_contractId: (a: number) => [number, number];
  readonly __wbg_get_rpccallpayload_nearRpcUrl: (a: number) => [number, number];
  readonly __wbg_get_rpccallpayload_nearAccountId: (a: number) => [number, number];
  readonly __wbg_get_transactioncontext_nearPublicKeyStr: (a: number) => [number, number];
  readonly __wbg_get_transactioncontext_nextNonce: (a: number) => [number, number];
  readonly __wbg_get_transactioncontext_txBlockHeight: (a: number) => [number, number];
  readonly __wbg_get_verificationpayload_contractId: (a: number) => [number, number];
  readonly __wbg_get_verificationpayload_nearRpcUrl: (a: number) => [number, number];
  readonly __wbg_get_recoverkeypairresult_publicKey: (a: number) => [number, number];
  readonly __wbg_get_recoverkeypairresult_encryptedData: (a: number) => [number, number];
  readonly __wbg_get_registrationpayload_nearAccountId: (a: number) => [number, number];
  readonly __wbg_get_registrationpayload_nonce: (a: number) => [number, number];
  readonly __wbg_get_registrationpayload_blockHash: (a: number) => [number, number];
  readonly __wbg_derivenearkeypairandencryptrequest_free: (a: number, b: number) => void;
  readonly __wbg_get_derivenearkeypairandencryptrequest_dualPrfOutputs: (a: number) => number;
  readonly __wbg_set_derivenearkeypairandencryptrequest_dualPrfOutputs: (a: number, b: number) => void;
  readonly __wbg_get_derivenearkeypairandencryptrequest_nearAccountId: (a: number) => [number, number];
  readonly __wbg_set_derivenearkeypairandencryptrequest_nearAccountId: (a: number, b: number, c: number) => void;
  readonly __wbg_get_derivenearkeypairandencryptrequest_credential: (a: number) => number;
  readonly __wbg_set_derivenearkeypairandencryptrequest_credential: (a: number, b: number) => void;
  readonly __wbg_get_derivenearkeypairandencryptrequest_registrationTransaction: (a: number) => number;
  readonly __wbg_set_derivenearkeypairandencryptrequest_registrationTransaction: (a: number, b: number) => void;
  readonly __wbg_get_derivenearkeypairandencryptrequest_authenticatorOptions: (a: number) => number;
  readonly __wbg_set_derivenearkeypairandencryptrequest_authenticatorOptions: (a: number, b: number) => void;
  readonly __wbg_dualprfoutputsstruct_free: (a: number, b: number) => void;
  readonly __wbg_get_dualprfoutputsstruct_chacha20PrfOutput: (a: number) => [number, number];
  readonly __wbg_set_dualprfoutputsstruct_chacha20PrfOutput: (a: number, b: number, c: number) => void;
  readonly __wbg_get_dualprfoutputsstruct_ed25519PrfOutput: (a: number) => [number, number];
  readonly __wbg_set_dualprfoutputsstruct_ed25519PrfOutput: (a: number, b: number, c: number) => void;
  readonly __wbg_linkdeviceregistrationtransaction_free: (a: number, b: number) => void;
  readonly __wbg_get_linkdeviceregistrationtransaction_vrfChallenge: (a: number) => number;
  readonly __wbg_set_linkdeviceregistrationtransaction_vrfChallenge: (a: number, b: number) => void;
  readonly __wbg_get_linkdeviceregistrationtransaction_contractId: (a: number) => [number, number];
  readonly __wbg_set_linkdeviceregistrationtransaction_contractId: (a: number, b: number, c: number) => void;
  readonly __wbg_set_linkdeviceregistrationtransaction_nonce: (a: number, b: number, c: number) => void;
  readonly __wbg_set_linkdeviceregistrationtransaction_deterministicVrfPublicKey: (a: number, b: number, c: number) => void;
  readonly __wbg_derivenearkeypairandencryptresult_free: (a: number, b: number) => void;
  readonly __wbg_get_derivenearkeypairandencryptresult_nearAccountId: (a: number) => [number, number];
  readonly __wbg_set_derivenearkeypairandencryptresult_nearAccountId: (a: number, b: number, c: number) => void;
  readonly __wbg_get_derivenearkeypairandencryptresult_publicKey: (a: number) => [number, number];
  readonly __wbg_set_derivenearkeypairandencryptresult_publicKey: (a: number, b: number, c: number) => void;
  readonly __wbg_get_derivenearkeypairandencryptresult_encryptedData: (a: number) => [number, number];
  readonly __wbg_set_derivenearkeypairandencryptresult_encryptedData: (a: number, b: number, c: number) => void;
  readonly __wbg_get_derivenearkeypairandencryptresult_iv: (a: number) => [number, number];
  readonly __wbg_set_derivenearkeypairandencryptresult_iv: (a: number, b: number, c: number) => void;
  readonly __wbg_get_derivenearkeypairandencryptresult_stored: (a: number) => number;
  readonly __wbg_set_derivenearkeypairandencryptresult_stored: (a: number, b: number) => void;
  readonly __wbg_get_derivenearkeypairandencryptresult_signedTransaction: (a: number) => number;
  readonly __wbg_set_derivenearkeypairandencryptresult_signedTransaction: (a: number, b: number) => void;
  readonly derivenearkeypairandencryptresult_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => number;
  readonly __wbg_get_linkdeviceregistrationtransaction_nonce: (a: number) => [number, number];
  readonly __wbg_get_linkdeviceregistrationtransaction_blockHash: (a: number) => [number, number];
  readonly __wbg_get_linkdeviceregistrationtransaction_deterministicVrfPublicKey: (a: number) => [number, number];
  readonly __wbg_set_linkdeviceregistrationtransaction_blockHash: (a: number, b: number, c: number) => void;
  readonly __wbg_decryptprivatekeyrequest_free: (a: number, b: number) => void;
  readonly __wbg_get_decryptprivatekeyrequest_nearAccountId: (a: number) => [number, number];
  readonly __wbg_set_decryptprivatekeyrequest_nearAccountId: (a: number, b: number, c: number) => void;
  readonly __wbg_get_decryptprivatekeyrequest_chacha20PrfOutput: (a: number) => [number, number];
  readonly __wbg_set_decryptprivatekeyrequest_chacha20PrfOutput: (a: number, b: number, c: number) => void;
  readonly __wbg_get_decryptprivatekeyrequest_encryptedPrivateKeyData: (a: number) => [number, number];
  readonly __wbg_set_decryptprivatekeyrequest_encryptedPrivateKeyData: (a: number, b: number, c: number) => void;
  readonly __wbg_get_decryptprivatekeyrequest_encryptedPrivateKeyIv: (a: number) => [number, number];
  readonly __wbg_set_decryptprivatekeyrequest_encryptedPrivateKeyIv: (a: number, b: number, c: number) => void;
  readonly decryptprivatekeyrequest_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
  readonly __wbg_decryptprivatekeyresult_free: (a: number, b: number) => void;
  readonly decryptprivatekeyresult_new: (a: number, b: number, c: number, d: number) => number;
  readonly __wbg_get_decryptprivatekeyresult_privateKey: (a: number) => [number, number];
  readonly __wbg_get_decryptprivatekeyresult_nearAccountId: (a: number) => [number, number];
  readonly __wbg_set_decryptprivatekeyresult_privateKey: (a: number, b: number, c: number) => void;
  readonly __wbg_set_decryptprivatekeyresult_nearAccountId: (a: number, b: number, c: number) => void;
  readonly __wbg_extractcoserequest_free: (a: number, b: number) => void;
  readonly __wbg_get_extractcoserequest_attestationObjectBase64url: (a: number) => [number, number];
  readonly __wbg_coseextractionresult_free: (a: number, b: number) => void;
  readonly __wbg_get_coseextractionresult_cosePublicKeyBytes: (a: number) => [number, number];
  readonly __wbg_set_coseextractionresult_cosePublicKeyBytes: (a: number, b: number, c: number) => void;
  readonly __wbg_signnep413request_free: (a: number, b: number) => void;
  readonly __wbg_get_signnep413request_recipient: (a: number) => [number, number];
  readonly __wbg_set_signnep413request_recipient: (a: number, b: number, c: number) => void;
  readonly __wbg_get_signnep413request_nonce: (a: number) => [number, number];
  readonly __wbg_set_signnep413request_nonce: (a: number, b: number, c: number) => void;
  readonly __wbg_get_signnep413request_state: (a: number) => [number, number];
  readonly __wbg_set_signnep413request_state: (a: number, b: number, c: number) => void;
  readonly __wbg_get_signnep413request_accountId: (a: number) => [number, number];
  readonly __wbg_set_signnep413request_accountId: (a: number, b: number, c: number) => void;
  readonly __wbg_get_signnep413request_encryptedPrivateKeyData: (a: number) => [number, number];
  readonly __wbg_set_signnep413request_encryptedPrivateKeyData: (a: number, b: number, c: number) => void;
  readonly __wbg_get_signnep413request_encryptedPrivateKeyIv: (a: number) => [number, number];
  readonly __wbg_set_signnep413request_encryptedPrivateKeyIv: (a: number, b: number, c: number) => void;
  readonly __wbg_get_signnep413request_prfOutput: (a: number) => [number, number];
  readonly __wbg_set_signnep413request_prfOutput: (a: number, b: number, c: number) => void;
  readonly __wbg_signnep413result_free: (a: number, b: number) => void;
  readonly __wbg_get_signnep413result_state: (a: number) => [number, number];
  readonly __wbg_set_signnep413result_state: (a: number, b: number, c: number) => void;
  readonly signnep413result_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
  readonly __wbg_signtransactionwithkeypairrequest_free: (a: number, b: number) => void;
  readonly __wbg_get_signnep413request_message: (a: number) => [number, number];
  readonly __wbg_get_signnep413result_accountId: (a: number) => [number, number];
  readonly __wbg_get_signnep413result_publicKey: (a: number) => [number, number];
  readonly __wbg_get_signnep413result_signature: (a: number) => [number, number];
  readonly __wbg_get_signtransactionwithkeypairrequest_nearPrivateKey: (a: number) => [number, number];
  readonly __wbg_get_signtransactionwithkeypairrequest_signerAccountId: (a: number) => [number, number];
  readonly __wbg_get_signtransactionwithkeypairrequest_receiverId: (a: number) => [number, number];
  readonly __wbg_get_signtransactionwithkeypairrequest_nonce: (a: number) => [number, number];
  readonly __wbg_get_signtransactionwithkeypairrequest_blockHash: (a: number) => [number, number];
  readonly __wbg_get_signtransactionwithkeypairrequest_actions: (a: number) => [number, number];
  readonly __wbg_set_extractcoserequest_attestationObjectBase64url: (a: number, b: number, c: number) => void;
  readonly __wbg_set_signnep413request_message: (a: number, b: number, c: number) => void;
  readonly __wbg_set_signnep413result_accountId: (a: number, b: number, c: number) => void;
  readonly __wbg_set_signnep413result_publicKey: (a: number, b: number, c: number) => void;
  readonly __wbg_set_signnep413result_signature: (a: number, b: number, c: number) => void;
  readonly __wbg_set_signtransactionwithkeypairrequest_nearPrivateKey: (a: number, b: number, c: number) => void;
  readonly __wbg_set_signtransactionwithkeypairrequest_signerAccountId: (a: number, b: number, c: number) => void;
  readonly __wbg_set_signtransactionwithkeypairrequest_receiverId: (a: number, b: number, c: number) => void;
  readonly __wbg_set_signtransactionwithkeypairrequest_nonce: (a: number, b: number, c: number) => void;
  readonly __wbg_set_signtransactionwithkeypairrequest_blockHash: (a: number, b: number, c: number) => void;
  readonly __wbg_set_signtransactionwithkeypairrequest_actions: (a: number, b: number, c: number) => void;
  readonly __wbg_registrationinfostruct_free: (a: number, b: number) => void;
  readonly __wbg_get_registrationinfostruct_credentialId: (a: number) => [number, number];
  readonly __wbg_get_registrationinfostruct_credentialPublicKey: (a: number) => [number, number];
  readonly __wbg_get_registrationinfostruct_vrfPublicKey: (a: number) => [number, number];
  readonly __wbg_set_registrationinfostruct_vrfPublicKey: (a: number, b: number, c: number) => void;
  readonly registrationinfostruct_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
  readonly __wbg_checkcanregisteruserrequest_free: (a: number, b: number) => void;
  readonly __wbg_get_checkcanregisteruserrequest_vrfChallenge: (a: number) => number;
  readonly __wbg_set_checkcanregisteruserrequest_vrfChallenge: (a: number, b: number) => void;
  readonly __wbg_get_checkcanregisteruserrequest_credential: (a: number) => number;
  readonly __wbg_set_checkcanregisteruserrequest_credential: (a: number, b: number) => void;
  readonly __wbg_get_checkcanregisteruserrequest_contractId: (a: number) => [number, number];
  readonly __wbg_set_checkcanregisteruserrequest_contractId: (a: number, b: number, c: number) => void;
  readonly __wbg_get_checkcanregisteruserrequest_nearRpcUrl: (a: number) => [number, number];
  readonly __wbg_set_checkcanregisteruserrequest_nearRpcUrl: (a: number, b: number, c: number) => void;
  readonly __wbg_get_checkcanregisteruserrequest_authenticatorOptions: (a: number) => number;
  readonly __wbg_set_checkcanregisteruserrequest_authenticatorOptions: (a: number, b: number) => void;
  readonly __wbg_registrationcheckrequest_free: (a: number, b: number) => void;
  readonly registrationcheckrequest_new: (a: number, b: number, c: number, d: number) => number;
  readonly __wbg_registrationcheckresult_free: (a: number, b: number) => void;
  readonly __wbg_get_registrationcheckresult_verified: (a: number) => number;
  readonly __wbg_set_registrationcheckresult_verified: (a: number, b: number) => void;
  readonly __wbg_get_registrationcheckresult_registrationInfo: (a: number) => number;
  readonly __wbg_set_registrationcheckresult_registrationInfo: (a: number, b: number) => void;
  readonly __wbg_get_registrationcheckresult_logs: (a: number) => [number, number];
  readonly __wbg_set_registrationcheckresult_logs: (a: number, b: number, c: number) => void;
  readonly __wbg_get_registrationcheckresult_signedTransaction: (a: number) => number;
  readonly __wbg_set_registrationcheckresult_signedTransaction: (a: number, b: number) => void;
  readonly __wbg_get_registrationcheckresult_error: (a: number) => [number, number];
  readonly __wbg_set_registrationcheckresult_error: (a: number, b: number, c: number) => void;
  readonly registrationcheckresult_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
  readonly __wbg_signtransactionswithactionsrequest_free: (a: number, b: number) => void;
  readonly __wbg_get_signtransactionswithactionsrequest_rpcCall: (a: number) => number;
  readonly __wbg_set_signtransactionswithactionsrequest_rpcCall: (a: number, b: number) => void;
  readonly __wbg_get_signtransactionswithactionsrequest_decryption: (a: number) => number;
  readonly __wbg_set_signtransactionswithactionsrequest_decryption: (a: number, b: number) => void;
  readonly __wbg_get_signtransactionswithactionsrequest_txSigningRequests: (a: number) => [number, number];
  readonly __wbg_set_signtransactionswithactionsrequest_txSigningRequests: (a: number, b: number, c: number) => void;
  readonly __wbg_get_signtransactionswithactionsrequest_confirmationConfig: (a: number) => number;
  readonly __wbg_set_signtransactionswithactionsrequest_confirmationConfig: (a: number, b: number) => void;
  readonly __wbg_transactionpayload_free: (a: number, b: number) => void;
  readonly __wbg_transactionsignresult_free: (a: number, b: number) => void;
  readonly __wbg_get_transactionsignresult_success: (a: number) => number;
  readonly __wbg_set_transactionsignresult_success: (a: number, b: number) => void;
  readonly __wbg_get_transactionsignresult_transactionHashes: (a: number) => [number, number];
  readonly __wbg_set_transactionsignresult_transactionHashes: (a: number, b: number, c: number) => void;
  readonly __wbg_get_transactionsignresult_signedTransactions: (a: number) => [number, number];
  readonly __wbg_set_transactionsignresult_signedTransactions: (a: number, b: number, c: number) => void;
  readonly __wbg_get_transactionsignresult_logs: (a: number) => [number, number];
  readonly __wbg_set_transactionsignresult_logs: (a: number, b: number, c: number) => void;
  readonly __wbg_get_transactionsignresult_error: (a: number) => [number, number];
  readonly transactionsignresult_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => number;
  readonly transactionsignresult_failed: (a: number, b: number, c: number, d: number) => number;
  readonly __wbg_keyactionresult_free: (a: number, b: number) => void;
  readonly __wbg_get_keyactionresult_success: (a: number) => number;
  readonly __wbg_set_keyactionresult_success: (a: number, b: number) => void;
  readonly __wbg_get_keyactionresult_transactionHash: (a: number) => [number, number];
  readonly __wbg_set_keyactionresult_transactionHash: (a: number, b: number, c: number) => void;
  readonly __wbg_get_keyactionresult_signedTransaction: (a: number) => number;
  readonly __wbg_set_keyactionresult_signedTransaction: (a: number, b: number) => void;
  readonly __wbg_get_keyactionresult_logs: (a: number) => [number, number];
  readonly __wbg_set_keyactionresult_logs: (a: number, b: number, c: number) => void;
  readonly __wbg_get_keyactionresult_error: (a: number) => [number, number];
  readonly __wbg_set_keyactionresult_error: (a: number, b: number, c: number) => void;
  readonly keyactionresult_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
  readonly __wbg_decryption_free: (a: number, b: number) => void;
  readonly __wbg_get_decryption_chacha20_prf_output: (a: number) => [number, number];
  readonly __wbg_set_decryption_chacha20_prf_output: (a: number, b: number, c: number) => void;
  readonly __wbg_get_decryption_encrypted_private_key_data: (a: number) => [number, number];
  readonly __wbg_set_decryption_encrypted_private_key_data: (a: number, b: number, c: number) => void;
  readonly __wbg_get_decryption_encrypted_private_key_iv: (a: number) => [number, number];
  readonly __wbg_set_decryption_encrypted_private_key_iv: (a: number, b: number, c: number) => void;
  readonly decryption_new: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
  readonly __wbg_get_transactionpayload_nearAccountId: (a: number) => [number, number];
  readonly __wbg_get_transactionpayload_receiverId: (a: number) => [number, number];
  readonly __wbg_get_transactionpayload_actions: (a: number) => [number, number];
  readonly __wbg_get_registrationcheckrequest_contract_id: (a: number) => [number, number];
  readonly __wbg_get_registrationcheckrequest_near_rpc_url: (a: number) => [number, number];
  readonly __wbg_get_registrationinfostruct_userId: (a: number) => [number, number];
  readonly __wbg_set_transactionsignresult_error: (a: number, b: number, c: number) => void;
  readonly __wbg_set_registrationinfostruct_credentialId: (a: number, b: number, c: number) => void;
  readonly __wbg_set_registrationinfostruct_credentialPublicKey: (a: number, b: number, c: number) => void;
  readonly __wbg_set_transactionpayload_nearAccountId: (a: number, b: number, c: number) => void;
  readonly __wbg_set_transactionpayload_receiverId: (a: number, b: number, c: number) => void;
  readonly __wbg_set_transactionpayload_actions: (a: number, b: number, c: number) => void;
  readonly __wbg_set_registrationcheckrequest_contract_id: (a: number, b: number, c: number) => void;
  readonly __wbg_set_registrationcheckrequest_near_rpc_url: (a: number, b: number, c: number) => void;
  readonly __wbg_set_registrationinfostruct_userId: (a: number, b: number, c: number) => void;
  readonly __wbg_wasmpublickey_free: (a: number, b: number) => void;
  readonly __wbg_get_wasmpublickey_keyType: (a: number) => number;
  readonly __wbg_set_wasmpublickey_keyType: (a: number, b: number) => void;
  readonly __wbg_get_wasmpublickey_keyData: (a: number) => [number, number];
  readonly __wbg_set_wasmpublickey_keyData: (a: number, b: number, c: number) => void;
  readonly wasmpublickey_new: (a: number, b: number, c: number) => number;
  readonly __wbg_wasmsignature_free: (a: number, b: number) => void;
  readonly __wbg_wasmtransaction_free: (a: number, b: number) => void;
  readonly __wbg_get_wasmtransaction_signerId: (a: number) => [number, number];
  readonly __wbg_set_wasmtransaction_signerId: (a: number, b: number, c: number) => void;
  readonly __wbg_get_wasmtransaction_publicKey: (a: number) => number;
  readonly __wbg_set_wasmtransaction_publicKey: (a: number, b: number) => void;
  readonly __wbg_get_wasmtransaction_nonce: (a: number) => bigint;
  readonly __wbg_set_wasmtransaction_nonce: (a: number, b: bigint) => void;
  readonly __wbg_get_wasmtransaction_receiverId: (a: number) => [number, number];
  readonly __wbg_set_wasmtransaction_receiverId: (a: number, b: number, c: number) => void;
  readonly __wbg_get_wasmtransaction_blockHash: (a: number) => [number, number];
  readonly __wbg_set_wasmtransaction_blockHash: (a: number, b: number, c: number) => void;
  readonly __wbg_get_wasmtransaction_actionsJson: (a: number) => [number, number];
  readonly __wbg_set_wasmtransaction_actionsJson: (a: number, b: number, c: number) => void;
  readonly wasmtransaction_new: (a: number, b: number, c: number, d: bigint, e: number, f: number, g: number, h: number, i: number, j: number) => number;
  readonly __wbg_wasmsignedtransaction_free: (a: number, b: number) => void;
  readonly __wbg_get_wasmsignedtransaction_transaction: (a: number) => number;
  readonly __wbg_set_wasmsignedtransaction_transaction: (a: number, b: number) => void;
  readonly __wbg_get_wasmsignedtransaction_signature: (a: number) => number;
  readonly __wbg_set_wasmsignedtransaction_signature: (a: number, b: number) => void;
  readonly __wbg_get_wasmsignedtransaction_borshBytes: (a: number) => [number, number];
  readonly __wbg_set_wasmsignedtransaction_borshBytes: (a: number, b: number, c: number) => void;
  readonly wasmsignedtransaction_new: (a: number, b: number, c: number, d: number) => number;
  readonly __wbg_set_wasmsignature_keyType: (a: number, b: number) => void;
  readonly __wbg_set_wasmsignature_signatureData: (a: number, b: number, c: number) => void;
  readonly __wbg_get_wasmsignature_keyType: (a: number) => number;
  readonly wasmsignature_new: (a: number, b: number, c: number) => number;
  readonly __wbg_get_wasmsignature_signatureData: (a: number) => [number, number];
  readonly __wbg_registrationcredentialconfirmationrequest_free: (a: number, b: number) => void;
  readonly __wbg_get_registrationcredentialconfirmationrequest_nearAccountId: (a: number) => [number, number];
  readonly __wbg_set_registrationcredentialconfirmationrequest_nearAccountId: (a: number, b: number, c: number) => void;
  readonly __wbg_get_registrationcredentialconfirmationrequest_deviceNumber: (a: number) => number;
  readonly __wbg_set_registrationcredentialconfirmationrequest_deviceNumber: (a: number, b: number) => void;
  readonly __wbg_get_registrationcredentialconfirmationrequest_contractId: (a: number) => [number, number];
  readonly __wbg_set_registrationcredentialconfirmationrequest_contractId: (a: number, b: number, c: number) => void;
  readonly __wbg_get_registrationcredentialconfirmationrequest_nearRpcUrl: (a: number) => [number, number];
  readonly __wbg_set_registrationcredentialconfirmationrequest_nearRpcUrl: (a: number, b: number, c: number) => void;
  readonly __wbg_registrationcredentialconfirmationresult_free: (a: number, b: number) => void;
  readonly __wbg_get_registrationcredentialconfirmationresult_confirmed: (a: number) => number;
  readonly __wbg_set_registrationcredentialconfirmationresult_confirmed: (a: number, b: number) => void;
  readonly __wbg_get_registrationcredentialconfirmationresult_credential: (a: number) => any;
  readonly __wbg_set_registrationcredentialconfirmationresult_credential: (a: number, b: any) => void;
  readonly __wbg_get_registrationcredentialconfirmationresult_prfOutput: (a: number) => [number, number];
  readonly __wbg_set_registrationcredentialconfirmationresult_prfOutput: (a: number, b: number, c: number) => void;
  readonly __wbg_get_registrationcredentialconfirmationresult_vrfChallenge: (a: number) => number;
  readonly __wbg_set_registrationcredentialconfirmationresult_vrfChallenge: (a: number, b: number) => void;
  readonly __wbg_get_registrationcredentialconfirmationresult_transactionContext: (a: number) => number;
  readonly __wbg_set_registrationcredentialconfirmationresult_transactionContext: (a: number, b: number) => void;
  readonly __wbg_get_registrationcredentialconfirmationresult_error: (a: number) => [number, number];
  readonly __wbg_set_registrationcredentialconfirmationresult_error: (a: number, b: number, c: number) => void;
  readonly __wbg_workerprogressmessage_free: (a: number, b: number) => void;
  readonly __wbg_set_workerprogressmessage_message_type: (a: number, b: number, c: number) => void;
  readonly __wbg_get_workerprogressmessage_message: (a: number) => [number, number];
  readonly __wbg_set_workerprogressmessage_message: (a: number, b: number, c: number) => void;
  readonly __wbg_get_workerprogressmessage_status: (a: number) => [number, number];
  readonly __wbg_set_workerprogressmessage_status: (a: number, b: number, c: number) => void;
  readonly __wbg_get_workerprogressmessage_timestamp: (a: number) => number;
  readonly __wbg_set_workerprogressmessage_timestamp: (a: number, b: number) => void;
  readonly __wbg_get_workerprogressmessage_data: (a: number) => [number, number];
  readonly __wbg_set_workerprogressmessage_data: (a: number, b: number, c: number) => void;
  readonly workerprogressmessage_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => number;
  readonly __wbg_get_registrationcredentialconfirmationresult_requestId: (a: number) => [number, number];
  readonly __wbg_get_registrationcredentialconfirmationresult_intentDigest: (a: number) => [number, number];
  readonly __wbg_get_workerprogressmessage_message_type: (a: number) => [number, number];
  readonly __wbg_get_workerprogressmessage_step: (a: number) => [number, number];
  readonly __wbg_set_registrationcredentialconfirmationresult_requestId: (a: number, b: number, c: number) => void;
  readonly __wbg_set_registrationcredentialconfirmationresult_intentDigest: (a: number, b: number, c: number) => void;
  readonly __wbg_set_workerprogressmessage_step: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_4: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_export_6: WebAssembly.Table;
  readonly __externref_drop_slice: (a: number, b: number) => void;
  readonly closure207_externref_shim: (a: number, b: number, c: any) => void;
  readonly closure239_externref_shim: (a: number, b: number, c: any, d: any) => void;
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
