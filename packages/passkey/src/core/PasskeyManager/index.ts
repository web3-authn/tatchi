import { WebAuthnManager } from '../WebAuthnManager';
import { registerPasskey } from './registration';
import { loginPasskey, getLoginState, getRecentLogins, logoutAndClearVrfSession } from './login';
import { executeAction } from './actions';
import { recoverAccount, AccountRecoveryFlow, type RecoveryResult } from './recoverAccount';
import { MinimalNearClient, type NearClient, type SignedTransaction } from '../NearClient';
import type {
  PasskeyManagerConfigs,
  RegistrationResult,
  LoginResult,
  BaseHooksOptions,
  RegistrationHooksOptions,
  LoginHooksOptions,
  ActionHooksOptions,
  ActionResult,
  LoginState,
  AccountRecoveryHooksOptions,
} from '../types/passkeyManager';
import { DEFAULT_AUTHENTICATOR_OPTIONS } from '../types/authenticatorOptions';
import { toAccountId, type AccountId } from '../types/accountIds';
import { ActionType, type ActionArgs } from '../types/actions';
import type {
  DeviceLinkingQRData,
  LinkDeviceResult,
  StartDeviceLinkingOptionsDevice2,
  ScanAndLinkDeviceOptionsDevice1
} from '../types/linkDevice';
import { LinkDeviceFlow } from './linkDevice';
import { linkDeviceWithQRCode } from './scanDevice';
import {
  ScanQRCodeFlow,
  type ScanQRCodeFlowOptions,
  type ScanQRCodeFlowEvents,
} from '../../utils/qrScanner';
import {
  signNEP413Message,
  type SignNEP413MessageParams,
  type SignNEP413MessageResult
} from './signNEP413';
import { getOptimalCameraFacingMode } from '@/utils';

///////////////////////////////////////
// PASSKEY MANAGER
///////////////////////////////////////

export interface PasskeyManagerContext {
  webAuthnManager: WebAuthnManager;
  nearClient: NearClient;
  configs: PasskeyManagerConfigs;
}

/**
 * Main PasskeyManager class that provides framework-agnostic passkey operations
 * with flexible event-based callbacks for custom UX implementation
 */
export class PasskeyManager {
  private readonly webAuthnManager: WebAuthnManager;
  private readonly nearClient: NearClient;
  readonly configs: PasskeyManagerConfigs;

  constructor(
    configs: PasskeyManagerConfigs,
    nearClient?: NearClient
  ) {
    this.configs = configs;
    // Use provided client or create default one
    this.nearClient = nearClient || new MinimalNearClient(configs.nearRpcUrl);
    this.webAuthnManager = new WebAuthnManager(configs);
    // VRF worker initializes automatically in the constructor
  }

  private getContext(): PasskeyManagerContext {
    return {
      webAuthnManager: this.webAuthnManager,
      nearClient: this.nearClient,
      configs: this.configs
    }
  }

  getNearClient(): NearClient {
    return this.nearClient;
  }

  ///////////////////////////////////////
  // === Registration and Login ===
  ///////////////////////////////////////

  /**
   * Register a new passkey for the given NEAR account ID
   * Uses AccountId for on-chain operations and PRF salt derivation
   */
  async registerPasskey(
    nearAccountId: string,
    options: RegistrationHooksOptions
  ): Promise<RegistrationResult> {
    return registerPasskey(
      this.getContext(),
      toAccountId(nearAccountId),
      options,
      this.configs.authenticatorOptions || DEFAULT_AUTHENTICATOR_OPTIONS,
      // Use config-based authenticator options with fallback to defaults
    );
  }

  /**
   * Login with an existing passkey
   * Uses AccountId for on-chain operations and VRF operations
   */
  async loginPasskey(
    nearAccountId: string,
    options?: LoginHooksOptions
  ): Promise<LoginResult> {
    return loginPasskey(this.getContext(), toAccountId(nearAccountId), options);
  }

  /**
   * Logout: Clear VRF session (clear VRF keypair in worker)
   */
  async logoutAndClearVrfSession(): Promise<void> {
    return logoutAndClearVrfSession(this.getContext());
  }

  /**
   * Get comprehensive login state information
   * Uses AccountId for core account login state
   */
  async getLoginState(nearAccountId?: string): Promise<LoginState> {
    return getLoginState(
      this.getContext(),
      nearAccountId ? toAccountId(nearAccountId) : undefined
    );
  }

  /**
   * Get check if accountId has a passkey from IndexedDB
   */
  async hasPasskeyCredential(nearAccountId: AccountId): Promise<boolean> {
    // Convert device-specific ID to base account ID for IndexedDB lookup
    const baseAccountId = toAccountId(nearAccountId);
    return await this.webAuthnManager.hasPasskeyCredential(baseAccountId);
  }

  async getRecentLogins(): Promise<{
    accountIds: string[],
    lastUsedAccountId: {
      nearAccountId: AccountId,
      deviceNumber: number,
    } | null
  }> {
    return getRecentLogins(this.getContext());
  }

  ///////////////////////////////////////
  // === Transactions ===
  ///////////////////////////////////////

  /**
   * Execute a NEAR blockchain action using passkey-derived credentials
   * Supports all NEAR action types: Transfer, FunctionCall, AddKey, etc.
   *
   * @param nearAccountId - NEAR account ID to execute action with
   * @param actionArgs - Action to execute (single action or array for batched transactions)
   * @param options - Action options for event handling
   * - onEvent: EventCallback<ActionSSEEvent> - Optional event callback
   * - onError: (error: Error) => void - Optional error callback
   * - hooks: OperationHooks - Optional operation hooks
   * - waitUntil: TxExecutionStatus - Optional waitUntil status
   * @returns Promise resolving to action result
   *
   * @example
   * ```typescript
   * // Basic transfer
   * const result = await passkeyManager.executeAction('alice.near', {
   *   type: ActionType.Transfer,
   *   receiverId: 'bob.near',
   *   amount: '1000000000000000000000000' // 1 NEAR
   * });
   *
   * // Function call with gas and deposit (already available in ActionArgs)
   * const result = await passkeyManager.executeAction('alice.near', {
   *   type: ActionType.FunctionCall,
   *   receiverId: 'contract.near',
   *   methodName: 'set_value',
   *   args: { value: 42 },
   *   gas: '50000000000000', // 50 TGas
   *   deposit: '100000000000000000000000' // 0.1 NEAR
   * });
   *
   * // Batched transaction
   * const result = await passkeyManager.executeAction('alice.near', [
   *   {
   *     type: ActionType.Transfer,
   *     receiverId: 'bob.near',
   *     amount: '1000000000000000000000000'
   *   },
   *   {
   *     type: ActionType.FunctionCall,
   *     receiverId: 'contract.near',
   *     methodName: 'log_transfer',
   *     args: { recipient: 'bob.near' }
   *   }
   * ], {
   *   onEvent: (event) => console.log('Action progress:', event)
   * });
   * ```
   */
  async executeAction(
    nearAccountId: string,
    actionArgs: ActionArgs,
    options?: ActionHooksOptions
  ): Promise<ActionResult> {
    return executeAction(this.getContext(), toAccountId(nearAccountId), actionArgs, options);
  }

  ///////////////////////////////////////
  // === NEP-413 MESSAGE SIGNING ===
  ///////////////////////////////////////

  /**
   * Sign a NEP-413 message using the user's passkey-derived private key
   *
   * This function implements the NEP-413 standard for off-chain message signing:
   * - Creates a payload with message, recipient, nonce, and state
   * - Serializes using Borsh
   * - Adds NEP-413 prefix (2^31 + 413)
   * - Hashes with SHA-256
   * - Signs with Ed25519
   * - Returns base64-encoded signature
   *
   * @param nearAccountId - NEAR account ID to sign with
   * @param params - NEP-413 signing parameters
   * - message: string - The message to sign
   * - recipient: string - The recipient of the message
   * - state: string - Optional state parameter
   * @param options - Action options for event handling
   * - onEvent: EventCallback<ActionSSEEvent> - Optional event callback
   * - onError: (error: Error) => void - Optional error callback
   * - hooks: OperationHooks - Optional operation hooks
   * - waitUntil: TxExecutionStatus - Optional waitUntil status
   * @returns Promise resolving to signing result
   *
   * @example
   * ```typescript
   * const result = await passkeyManager.signNEP413Message('alice.near', {
   *   message: 'Hello World',
   *   recipient: 'app.example.com',
   *   state: 'optional-state'
   * });
   *
   * if (result.success) {
   *   console.log('Signature:', result.signature);
   *   console.log('Public key:', result.publicKey);
   * }
   * ```
   */
  async signNEP413Message(
    nearAccountId: string,
    params: SignNEP413MessageParams,
    options?: BaseHooksOptions
  ): Promise<SignNEP413MessageResult> {
    return signNEP413Message(this.getContext(), toAccountId(nearAccountId), params, options);
  }

  ///////////////////////////////////////
  // === KEY MANAGEMENT ===
  ///////////////////////////////////////

  /**
   * Export key pair (both private and public keys)
   * Uses AccountId for consistent PRF salt derivation
   */
  async exportNearKeypairWithTouchId(nearAccountId: string): Promise<{
    accountId: string;
    privateKey: string;
    publicKey: string
  }> {
    // Export private key using the method above
    return await this.webAuthnManager.exportNearKeypairWithTouchId(toAccountId(nearAccountId))
  }

  ///////////////////////////////////////
  // === Account Recovery Flow ===
  ///////////////////////////////////////

  /**
   * Creates an AccountRecoveryFlow instance, for step-by-step account recovery UX
   *
   * @example
   * ```typescript
   * const flow = passkeyManager.startAccountRecoveryFlow();
   *
   * // Phase 1: Discover available accounts
   * const options = await flow.discover(); // Returns PasskeyOptionWithoutCredential[]
   *
   * // Phase 2: User selects account in UI
   * const selectedOption = await waitForUserSelection(options);
   *
   * // Phase 3: Execute recovery with secure credential lookup
   * const result = await flow.recover({
   *   credentialId: selectedOption.credentialId,
   *   accountId: selectedOption.accountId
   * });
   * console.log('Recovery state:', flow.getState());
   * ```
   */
  startAccountRecoveryFlow(options?: AccountRecoveryHooksOptions): AccountRecoveryFlow {
    return new AccountRecoveryFlow(this.getContext(), options);
  }

  ///////////////////////////////////////
  // === Link Device ===
  ///////////////////////////////////////

  /**
   * Creates a LinkDeviceFlow instance for step-by-step device linking UX
   * for Device2 (the companion device is the one that generates the QR code)
   * Device1 (the original device) scans the QR code and executes the AddKey
   * and `store_device_linking_mapping` contract calls.
   *
   * @example
   * ```typescript
   *
   * // Device2: First generates a QR code and start polling
   * const device2Flow = passkeyManager.startDeviceLinkingFlow({ onEvent: ... });
   * const { qrData, qrCodeDataURL } = await device2Flow.generateQR('alice.near');
   *
   * // Device1: Scan QR and automatically link device
   * const device1Flow = passkeyManager.createScanQRCodeFlow({
   *   deviceLinkingOptions: {
   *     fundingAmount: '5000000000000000000000',
   *     onEvent: (event) => console.log('Device linking:', event)
   *   }
   * });
   * device1Flow.attachVideoElement(videoRef.current);
   * await device1Flow.start(); // Automatically links when QR is detected
   *
   * // Device2: Flow automatically completes when AddKey is detected
   * // it polls the chain for `store_device_linking_mapping` contract events
   * const state = device2Flow.getState();
   * ```
   */
  startDeviceLinkingFlow(options: StartDeviceLinkingOptionsDevice2): LinkDeviceFlow {
    return new LinkDeviceFlow(this.getContext(), options);
  }

    /**
   * Device1: Create a ScanQRCodeFlow for QR scanning with custom QR detection handling
   * Provides a flexible flow that scans for QR codes and calls your custom handler when detected
   *
   * @param options Configuration for device linking and QR scanning
   * @param options.deviceLinkingOptions Options for the device linking process (funding, callbacks)
   * @param options.scanQRCodeFlowOptions Optional QR scanning configuration (camera, timeout)
   * @param options.scanQRCodeFlowEvents Optional event handlers for scanning progress and QR detection
   *
   * @example
   * ```typescript
   * const flow = passkeyManager.createScanQRCodeFlow({
   *   deviceLinkingOptions: {
   *     fundingAmount: '5000000000000000000000', // 0.005 NEAR
   *     onEvent: (event) => console.log('Device linking event:', event),
   *     onError: (error) => console.error('Device linking error:', error)
   *   },
   *   scanQRCodeFlowOptions: {
   *     cameraId: 'camera1',
   *     timeout: 30000
   *   },
   *   scanQRCodeFlowEvents: {
   *     onQRDetected: async (qrData) => {
   *       // Handle QR detection - automatically link the device
   *       console.log('QR detected:', qrData);
   *       const result = await passkeyManager.linkDeviceWithQRCode(qrData, {
   *         fundingAmount: '5000000000000000000000',
   *         onEvent: (event) => console.log('Device linking:', event),
   *         onError: (error) => console.error('Linking error:', error)
   *       });
   *       console.log('Device linked successfully:', result);
   *     },
   *     onScanProgress: (duration) => console.log('Scanning for', duration, 'ms'),
   *     onCameraReady: (stream) => console.log('Camera ready')
   *   }
   * });
   *
   * // Attach to video element and start scanning
   * flow.attachVideoElement(videoRef.current);
   * await flow.start();
   *
   * // QR detection and device linking is handled by your onQRDetected callback
   * ```
   */
  createScanQRCodeFlow(
    options: {
      deviceLinkingOptions: ScanAndLinkDeviceOptionsDevice1;
      scanQRCodeFlowOptions?: ScanQRCodeFlowOptions;
      scanQRCodeFlowEvents?: ScanQRCodeFlowEvents;
      cameraConfigs?: {
        facingMode?: 'user' | 'environment';
        width?: number;
        height?: number;
      };
      timeout?: number;
    }
  ): ScanQRCodeFlow {
    return new ScanQRCodeFlow(
      {
        cameraId: options?.scanQRCodeFlowOptions?.cameraId,
        cameraConfigs: {
          facingMode: getOptimalCameraFacingMode(),
          ...options?.cameraConfigs
        },
        timeout: 20000 // 20 seconds waiting for QR camera
      },
      {
        onQRDetected: (qrData) => {
          options?.scanQRCodeFlowEvents?.onQRDetected?.(qrData);
        },
        onError: (err) => {
          console.error('useQRCamera: QR scan error -', err);
          options?.scanQRCodeFlowEvents?.onError?.(err);
        },
        onCameraReady: (stream) => {
          // Camera stream is ready, but video element attachment is handled separately
          options?.scanQRCodeFlowEvents?.onCameraReady?.(stream);
        },
        onScanProgress: (duration) => {
          options?.scanQRCodeFlowEvents?.onScanProgress?.(duration);
        }
      }
    );
  }

  /**
   * Device1: Link device using pre-scanned QR data.
   * Either use a QR scanning library, or call this function in
   * the onQRDetected(qrData) => {} callback of createScanQRCodeFlow.
   *
   * @param qrData The QR data obtained from scanning Device2's QR code
   * @param options Device linking options including funding amount and event callbacks
   * @returns Promise that resolves to the linking result
   *
   * @example
   * ```typescript
   * // If you have QR data from somewhere else (not from createScanQRCodeFlow)
   * const qrData = await passkeyManager.scanQRCodeWithCamera();
   * const result = await passkeyManager.linkDeviceWithQRCode(qrData, {
   *   fundingAmount: '5000000000000000000000', // 0.005 NEAR
   *   onEvent: (event) => console.log('Device linking event:', event),
   *   onError: (error) => console.error('Device linking error:', error)
   * });
   * console.log('Device linked:', result);
   * ```
   *
   * Or with createScanQRCodeFlow:
   *
   * @example
   * ```typescript
   * const flow = passkeyManager.createScanQRCodeFlow({
   *   ...
   *   scanQRCodeFlowEvents: {
   *     onQRDetected: async (qrData) => {
   *       const result = await passkeyManager.linkDeviceWithQRCode(qrData, {
   *         fundingAmount: '5000000000000000000000',
   *         onEvent: (event) => console.log('Device linking:', event),
   *         onError: (error) => console.error('Linking error:', error)
   *       });
   *     },
   *     ...
   *   }
   * });
   * ```
   */
  async linkDeviceWithQRCode(
    qrData: DeviceLinkingQRData,
    options: ScanAndLinkDeviceOptionsDevice1
  ): Promise<LinkDeviceResult> {
    return linkDeviceWithQRCode(this.getContext(), qrData, options);
  }

  /**
   * Delete a device key from an account
   */
  async deleteDeviceKey(
    accountId: string,
    publicKeyToDelete: string,
    options?: ActionHooksOptions
  ): Promise<ActionResult> {
    // Validate that we're not deleting the last key
    const keysView = await this.nearClient.viewAccessKeyList(toAccountId(accountId));
    if (keysView.keys.length <= 1) {
      throw new Error('Cannot delete the last access key from an account');
    }

    // Find the key to delete
    const keyToDelete = keysView.keys.find(k => k.public_key === publicKeyToDelete);
    if (!keyToDelete) {
      throw new Error(`Access key ${publicKeyToDelete} not found on account ${accountId}`);
    }

    // Use the executeAction method with DeleteKey action
    return this.executeAction(accountId, {
      type: ActionType.DeleteKey,
      receiverId: accountId,
      publicKey: publicKeyToDelete
    }, options);
  }


}

// Re-export types for convenience
export type {
  PasskeyManagerConfigs,
  RegistrationHooksOptions,
  RegistrationResult,
  RegistrationSSEEvent,
  LoginHooksOptions,
  LoginResult,
  LoginSSEvent,
  BaseHooksOptions,
  ActionHooksOptions,
  ActionResult,
  EventCallback,
  OperationHooks,
} from '../types/passkeyManager';

export type {
  DeviceLinkingQRData,
  DeviceLinkingSession,
  LinkDeviceResult
} from '../types/linkDevice';

// Re-export device linking error types and classes
export {
  DeviceLinkingPhase,
  DeviceLinkingError,
  DeviceLinkingErrorCode
} from '../types/linkDevice';

// Re-export device linking flow class
export {
  LinkDeviceFlow
} from './linkDevice';

// Re-export account recovery types and classes
export type {
  RecoveryResult,
  AccountLookupResult,
  PasskeyOption,
  PasskeyOptionWithoutCredential,
  PasskeySelection
} from './recoverAccount';

export {
  AccountRecoveryFlow
} from './recoverAccount';

// Re-export NEP-413 types
export type {
  SignNEP413MessageParams,
  SignNEP413MessageResult
} from './signNEP413';

// Re-export QR scanning flow
export {
  ScanQRCodeFlow,
  type ScanQRCodeFlowOptions,
  type ScanQRCodeFlowEvents,
  ScanQRCodeFlowState
} from '../../utils/qrScanner';