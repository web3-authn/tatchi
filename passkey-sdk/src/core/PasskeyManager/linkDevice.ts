import { KeyPair } from '@near-js/crypto';

import type { PasskeyManagerContext } from './index';
import { IndexedDBManager } from '../IndexedDBManager';
import { validateNearAccountId } from '../../utils/validation';
import { generateBootstrapVrfChallenge } from './registration';
import { base64UrlEncode } from '../../utils';
import { DEVICE_LINKING_CONFIG } from '../../config';

import { ActionType, type ActionArgsWasm } from '../types/actions';
import { toAccountId, type AccountId } from '../types/accountIds';
import { VRFChallenge, type EncryptedVRFKeypair, type ServerEncryptedVrfKeypair } from '../types/vrf-worker';
import type { WebAuthnRegistrationCredential } from '../types';
import { DEFAULT_WAIT_STATUS } from "../types/rpc";

import { getDeviceLinkingAccountContractCall } from "../rpcCalls";
import QRCode from 'qrcode'; // jsQR will be dynamically imported when needed
import type {
  DeviceLinkingQRData,
  DeviceLinkingSession,
  StartDeviceLinkingOptionsDevice2
} from '../types/linkDevice';
import { DeviceLinkingError, DeviceLinkingErrorCode } from '../types/linkDevice';
import { DeviceLinkingPhase, DeviceLinkingStatus } from '../types/passkeyManager';
import type { DeviceLinkingSSEEvent } from '../types/passkeyManager';
import { authenticatorsToAllowCredentials } from '../WebAuthnManager/touchIdPrompt';


async function generateQRCodeDataURL(data: string): Promise<string> {
  return QRCode.toDataURL(data, {
    width: 256,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff'
    },
    errorCorrectionLevel: 'M'
  });
}

/**
 * Device linking flow class - manages the complete device linking process
 *
 * Usage:
 * ```typescript
 * // Device2: Generate QR and start polling
 * const flow = new LinkDeviceFlow(context, options);
 * const { qrData, qrCodeDataURL } = await flow.generateQR(accountId);
 *
 * // Device1: Scan and authorize
 * const result = await LinkDeviceFlow.scanAndLink(context, options);
 *
 * // Device2: Flow automatically completes when AddKey is detected
 * const state = flow.getState();
 * ```
 */
export class LinkDeviceFlow {
  private context: PasskeyManagerContext;
  private options: StartDeviceLinkingOptionsDevice2;
  private session: DeviceLinkingSession | null = null;
  private error?: Error;
  // Track explicit cancellation to short-circuit in-flight ops and logs
  private cancelled: boolean = false;
  // AddKey polling
  private pollingInterval?: NodeJS.Timeout;
  private pollGeneration = 0; // invalidate late ticks when stopping/restarting
  private readonly KEY_POLLING_INTERVAL = DEVICE_LINKING_CONFIG.TIMEOUTS.POLLING_INTERVAL_MS;
  // Registration retries
  private registrationRetryTimeout?: NodeJS.Timeout;
  private registrationRetryCount = 0;
  private readonly MAX_REGISTRATION_RETRIES = DEVICE_LINKING_CONFIG.RETRY.MAX_REGISTRATION_ATTEMPTS;
  private readonly RETRY_DELAY_MS = DEVICE_LINKING_CONFIG.TIMEOUTS.REGISTRATION_RETRY_DELAY_MS;
  // Temporary key cleanup
  private tempKeyCleanupTimer?: NodeJS.Timeout;
  private readonly TEMP_KEY_CLEANUP_DELAY_MS = DEVICE_LINKING_CONFIG.TIMEOUTS.TEMP_KEY_CLEANUP_MS;

  constructor(
    context: PasskeyManagerContext,
    options: StartDeviceLinkingOptionsDevice2
  ) {
    this.context = context;
    this.options = options;
  }

  // Guard helpers
  private ifActive<T>(fn: () => T): T | undefined {
    if (this.cancelled) return;
    return fn();
  }

  private safeOnEvent(evt: DeviceLinkingSSEEvent) {
    this.ifActive(() => this.options?.onEvent?.(evt));
  }

  /**
   * Device2 (companion device): Generate QR code and start polling for AddKey transaction
   *
   * Supports two flows:
   * - Option E: If accountId provided, generate proper NEAR keypair immediately (faster)
   * - Option F: If no accountId, generate temp NEAR keypair, replace later (seamless UX)
   */
  async generateQR(accountId?: AccountId): Promise<{
    qrData: DeviceLinkingQRData;
    qrCodeDataURL: string
  }> {
    try {
      if (accountId) {
        // === OPTION E: Account ID provided - generate proper keypair immediately ===
        console.log(`LinkDeviceFlow: Option E - Using provided account ID: ${accountId}`);

        // Validate account ID format
        validateNearAccountId(accountId);

        // validate account exists on-chain
        const accountExists = await this.context.nearClient.viewAccount(accountId);
        if (!accountExists) {
          throw new Error(`Account ${accountId} does not exist onchain`);
        }

        // Use generic secureConfirm flow to collect credential via in-iframe modal
        const confirm = await this.context.webAuthnManager.requestRegistrationCredentialConfirmation({
          nearAccountId: accountId,
          deviceNumber: 2, // default to device 2 for companion flow; server mapping may adjust later
          contractId: this.context.configs.contractId,
          nearRpcUrl: this.context.configs.nearRpcUrl,
        });
        if (!confirm.confirmed || !confirm.credential) {
          throw new Error('User cancelled link-device confirmation');
        }

        // Derive NEAR keypair using serialized WebAuthn registration credential
        const nearKeyResult = await this.context.webAuthnManager.deriveNearKeypairAndEncryptFromSerialized({
          credential: confirm.credential,
          nearAccountId: toAccountId(accountId),
          options: { deviceNumber: 2 }
        });

        if (!nearKeyResult.success || !nearKeyResult.publicKey) {
          throw new Error('Failed to generate NEAR keypair for provided account');
        }

        // Create session with real account ID from start
        this.session = {
          accountId: accountId,
          deviceNumber: 2,
          nearPublicKey: nearKeyResult.publicKey,
          credential: null,
          vrfChallenge: confirm.vrfChallenge || null,
          phase: DeviceLinkingPhase.IDLE,
          createdAt: Date.now(),
          expiresAt: Date.now() + DEVICE_LINKING_CONFIG.TIMEOUTS.SESSION_EXPIRATION_MS
        };

        console.log(`LinkDeviceFlow: Option E - Generated proper NEAR keypair for ${accountId}`);

      } else {
        // === OPTION F: No account ID - generate temporary keypair, replace later ===
        console.log(`LinkDeviceFlow: Option F - No account provided, using temporary keypair approach`);
        // Generate temporary NEAR keypair WITHOUT TouchID/VRF (just for QR generation)
        const tempNearKeyResult = await this.generateTemporaryNearKeypair();

        // Create session with null accountId (will be discovered from polling)
        this.session = {
          accountId: null, // Will be discovered from contract polling
          deviceNumber: undefined, // Will be discovered from contract polling
          nearPublicKey: tempNearKeyResult.publicKey,
          credential: null, // Will be generated later when we know real account
          vrfChallenge: null, // Will be generated later
          phase: DeviceLinkingPhase.IDLE,
          createdAt: Date.now(),
          expiresAt: Date.now() + DEVICE_LINKING_CONFIG.TIMEOUTS.SESSION_EXPIRATION_MS,
          tempPrivateKey: tempNearKeyResult.privateKey // Store temp private key for signing later
        };
        console.log(`LinkDeviceFlow: Option F - Generated temporary NEAR keypair`);
      }

      // Generate QR data (works for both options)
      const qrData: DeviceLinkingQRData = {
        device2PublicKey: this.session.nearPublicKey,
        accountId: this.session.accountId || undefined, // Convert null to undefined for optional field
        timestamp: Date.now(),
        version: '1.0'
      };

      // Create QR code data URL
      const qrDataString = JSON.stringify(qrData);
      const qrCodeDataURL = await generateQRCodeDataURL(qrDataString);
      const flowType = accountId
        ? 'Option E (provided account)'
        : 'Option F (account discovery)';

      this.safeOnEvent({
        step: 1,
        phase: DeviceLinkingPhase.STEP_1_QR_CODE_GENERATED,
        status: DeviceLinkingStatus.PROGRESS,
        message: `QR code generated using ${flowType}, waiting for Device1 to scan and authorize...`
      });

      // Start polling for AddKey transaction (guard if cancelled before reaching here)
      if (!this.cancelled) {
        this.startPolling();
      }
      this.safeOnEvent({
        step: 4,
        phase: DeviceLinkingPhase.STEP_4_POLLING,
        status: DeviceLinkingStatus.PROGRESS,
        message: `Polling contract for linked account...`
      });

      return { qrData, qrCodeDataURL };

    } catch (error: any) {
      this.error = error;
      this.safeOnEvent({
        step: 0,
        phase: DeviceLinkingPhase.DEVICE_LINKING_ERROR,
        status: DeviceLinkingStatus.ERROR,
        error: error.message,
        message: error.message,
      });
      throw new DeviceLinkingError(
        `Failed to generate device linking QR: ${error.message}`,
        DeviceLinkingErrorCode.REGISTRATION_FAILED,
        'generation'
      );
    }
  }

  /**
   * Generate temporary NEAR keypair without TouchID/VRF for Option F flow
   * This creates a proper Ed25519 keypair that can be used for the QR code
   * Includes memory cleanup and automatic expiration
   */
  private async generateTemporaryNearKeypair(): Promise<{ publicKey: string; privateKey: string }> {
    // Generate a temporary random NEAR Ed25519 keypair
    const keyPair = KeyPair.fromRandom('ed25519');
    const publicKeyNear = keyPair.getPublicKey().toString();
    const privateKeyNear = keyPair.toString();

    console.log(`LinkDeviceFlow: Generated temporary Ed25519 keypair with automatic cleanup`);

    // Schedule automatic cleanup of the temporary key from memory
    this.scheduleTemporaryKeyCleanup(publicKeyNear);

    return {
      publicKey: publicKeyNear,
      privateKey: privateKeyNear
    };
  }

  /**
   * Schedule automatic cleanup of temporary private key from memory
   * This provides defense-in-depth against memory exposure
   */
  private scheduleTemporaryKeyCleanup(publicKey: string): void {
    // Clear any existing cleanup timer
    if (this.tempKeyCleanupTimer) {
      clearTimeout(this.tempKeyCleanupTimer);
    }

    this.tempKeyCleanupTimer = setTimeout(() => {
      this.cleanupTemporaryKeyFromMemory();
      console.log(`LinkDeviceFlow: Automatic cleanup executed for temporary key: ${publicKey.substring(0, 20)}...`);
    }, this.TEMP_KEY_CLEANUP_DELAY_MS);

    console.log(`LinkDeviceFlow: Scheduled automatic cleanup in ${this.TEMP_KEY_CLEANUP_DELAY_MS / 1000 / 60} minutes for key: ${publicKey.substring(0, 20)}...`);
  }

  /**
   * Immediately clean up temporary private key from memory
   * Called on successful completion, cancellation, or timeout
   */
  private cleanupTemporaryKeyFromMemory(): void {
    if (this.session?.tempPrivateKey) {
      // Overwrite the private key string with zeros
      const keyLength = this.session.tempPrivateKey.length;
      this.session.tempPrivateKey = '0'.repeat(keyLength);

      // Then set to empty string to release memory
      this.session.tempPrivateKey = '';

      console.log('LinkDeviceFlow: Temporary private key cleaned from memory');
    }

    // Clear the cleanup timer
    if (this.tempKeyCleanupTimer) {
      clearTimeout(this.tempKeyCleanupTimer);
      this.tempKeyCleanupTimer = undefined;
    }
  }

  /**
   * Device2: Start polling blockchain for AddKey transaction
   */
  private startPolling(): void {
    if (!this.session || this.cancelled) return;

    // Stop any existing schedule and invalidate late ticks
    this.stopPolling();
    const myGen = ++this.pollGeneration;

    const tick = async () => {
      if (this.cancelled || this.pollGeneration !== myGen) return;

      if (!this.shouldContinuePolling()) {
        this.stopPolling();
        return;
      }
      try {
        const hasKeyAdded = await this.checkForDeviceKeyAdded();
        if (this.cancelled || this.pollGeneration !== myGen) return;
        if (hasKeyAdded && this.session) {
          this.stopPolling();
          this.safeOnEvent({
            step: 5,
            phase: DeviceLinkingPhase.STEP_5_ADDKEY_DETECTED,
            status: DeviceLinkingStatus.PROGRESS,
            message: 'AddKey transaction detected, starting registration...'
          });
          this.session.phase = DeviceLinkingPhase.STEP_5_ADDKEY_DETECTED;
          this.startRegistrationWithRetries();
          return;
        }
      } catch (error: any) {
        if (this.cancelled || this.pollGeneration !== myGen) return;
        console.error('Polling error:', error);
        if (error.message?.includes('Account not found')) {
          console.warn('Account not found - stopping polling');
          this.stopPolling();
          return;
        }
      }

      if (!this.cancelled && this.pollGeneration === myGen) {
        this.pollingInterval = setTimeout(tick, this.KEY_POLLING_INTERVAL) as any as NodeJS.Timeout;
      }
    };

    this.pollingInterval = setTimeout(tick, this.KEY_POLLING_INTERVAL) as any as NodeJS.Timeout;
  }

  private shouldContinuePolling(): boolean {
    if (!this.session) return false;

    // Stop polling if we've detected AddKey and moved to registration
    if (this.session.phase === DeviceLinkingPhase.STEP_5_ADDKEY_DETECTED) {
      return false;
    }
    // Stop polling if we've completed successfully
    if (this.session.phase === DeviceLinkingPhase.STEP_7_LINKING_COMPLETE) {
      return false;
    }
    if (Date.now() > this.session.expiresAt) {
      this.error = new Error('Session expired');
      this.safeOnEvent({
        step: 0,
        phase: DeviceLinkingPhase.DEVICE_LINKING_ERROR,
        status: DeviceLinkingStatus.ERROR,
        error: this.error?.message,
        message: 'Device linking session expired',
      });

      return false;
    }

    return true;
  }

  /**
   * Device2: Check if device key has been added by polling contract HashMap
   */
  private async checkForDeviceKeyAdded(): Promise<boolean> {
    // If polling was cancelled or cleared, bail out early to avoid noisy logs
    if (this.cancelled || !this.pollingInterval) {
      return false;
    }
    if (!this.session?.nearPublicKey) {
      console.error(`LinkDeviceFlow: No session or public key available for polling`);
      return false;
    }

    try {
      const linkingResult = await getDeviceLinkingAccountContractCall(
        this.context.nearClient,
        this.context.configs.contractId,
        this.session.nearPublicKey
      );

      // Check again after RPC returns in case cancel happened mid-flight
      if (this.cancelled || !this.pollingInterval) {
        return false;
      }

      this.safeOnEvent({
        step: 4,
        phase: DeviceLinkingPhase.STEP_4_POLLING,
        status: DeviceLinkingStatus.PROGRESS,
        message: 'Polling contract for linked account...'
      });

      if (
        linkingResult
        && linkingResult.linkedAccountId
        && linkingResult.deviceNumber !== undefined
      ) {
        // contract returns current deviceNumber, device should be assigned next number
        const nextDeviceNumber = linkingResult.deviceNumber + 1;
        console.log(`LinkDeviceFlow: Success! Discovered linked account:`, {
          linkedAccountId: linkingResult.linkedAccountId,
          currentCounter: linkingResult.deviceNumber,
          nextDeviceNumber: nextDeviceNumber,
        });
        this.session.accountId = linkingResult.linkedAccountId as AccountId;
        this.session.deviceNumber = nextDeviceNumber;
        // Store the next device number for this device
        return true;
      } else {
        if (!this.cancelled) console.log(`LinkDeviceFlow: No mapping found yet...`);
      }

      return false;
    } catch (error: any) {
      console.error(`LinkDeviceFlow: Error checking for device key addition:`, {
        error: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code
      });

      return false;
    }
  }

  /**
   * Device2: Start registration process with retry logic
   */
  private startRegistrationWithRetries(): void {
    this.registrationRetryCount = 0;
    this.attemptRegistration();
  }

  /**
   * Device2: Attempt registration with retry logic
   */
  private attemptRegistration(): void {
    this.swapKeysAndRegisterAccount().catch((error: any) => {
      // Check if this is a retryable error
      if (this.isRetryableError(error)) {
        this.registrationRetryCount++;

        if (this.registrationRetryCount > this.MAX_REGISTRATION_RETRIES) {
          console.error('LinkDeviceFlow: Max registration retries exceeded, failing permanently');
          // Non-retryable error - fail permanently
          this.session!.phase = DeviceLinkingPhase.REGISTRATION_ERROR;
          this.error = error;
          this.options?.onEvent?.({
            step: 0,
            phase: DeviceLinkingPhase.REGISTRATION_ERROR,
            status: DeviceLinkingStatus.ERROR,
            error: error.message,
            message: error.message,
          });
        } else {
          console.warn(`LinkDeviceFlow: Registration failed with retryable error (attempt ${this.registrationRetryCount}/${this.MAX_REGISTRATION_RETRIES}), will retry in ${this.RETRY_DELAY_MS}ms:`, error.message);
          this.options?.onEvent?.({
            step: 5,
            phase: DeviceLinkingPhase.STEP_5_ADDKEY_DETECTED,
            status: DeviceLinkingStatus.PROGRESS,
            message: `Registration failed (${error.message}), retrying in ${this.RETRY_DELAY_MS}ms... (${this.registrationRetryCount}/${this.MAX_REGISTRATION_RETRIES})`
          });
          // Schedule retry with setTimeout
          this.registrationRetryTimeout = setTimeout(() => {
            this.attemptRegistration();
          }, this.RETRY_DELAY_MS);
        }
      } else {
        // Non-retryable error - fail permanently
        this.session!.phase = DeviceLinkingPhase.REGISTRATION_ERROR;
        this.error = error;
        this.options?.onEvent?.({
          step: 0,
          phase: DeviceLinkingPhase.REGISTRATION_ERROR,
          status: DeviceLinkingStatus.ERROR,
          error: error.message,
          message: error.message,
        });
      }
    });
  }

  /**
   * Device2: Complete device linking
   * 1. Derives deterministic VRF and NEAR keys using real accountID (instead of temporary keys)
   * 2. Executes Key Replacement transaction to replace temporary key with the real key
   * 3. Signs the registration transaction and broadcasts it.
   */
  private async swapKeysAndRegisterAccount(): Promise<void> {
    if (!this.session || !this.session.accountId) {
      throw new Error('AccountID not available for registration');
    }

    try {
      this.safeOnEvent({
        step: 6,
        phase: DeviceLinkingPhase.STEP_6_REGISTRATION,
        status: DeviceLinkingStatus.PROGRESS,
        message: 'Storing device authenticator data locally...'
      });

      // Migrate/generate deterministic VRF credentials for the real account
      const deterministicKeysResult = await this.deriveDeterministicKeysAndRegisterAccount();

      // Store authenticator data locally on Device2
      await this.storeDeviceAuthenticator(deterministicKeysResult);

      this.session.phase = DeviceLinkingPhase.STEP_7_LINKING_COMPLETE;
      this.registrationRetryCount = 0; // Reset retry counter on success
      this.safeOnEvent({
        step: 7,
        phase: DeviceLinkingPhase.STEP_7_LINKING_COMPLETE,
        status: DeviceLinkingStatus.SUCCESS,
        message: 'Device linking completed successfully'
      });

      // Auto-login for Device2 after successful device linking
      await this.attemptAutoLogin(deterministicKeysResult, this.options);

    } catch (error: any) {
      // Re-throw error to be handled by attemptRegistration
      throw error;
    }
  }

  /**
   * Check if an error is retryable (temporary issues that can be resolved)
   */
  private isRetryableError(error: any): boolean {
    const retryableErrorMessages = [
      'page does not have focus',
      'a request is already pending',
      'request is already pending',
      'operationerror',
      'notallowederror',
      'the operation is not allowed at this time',
      'network error',
      'timeout',
      'temporary',
      'transient'
    ];

    const errorMessage = error.message?.toLowerCase() || '';
    const errorName = error.name?.toLowerCase() || '';

    return retryableErrorMessages.some(msg =>
      errorMessage.includes(msg.toLowerCase()) ||
      errorName.includes(msg.toLowerCase())
    );
  }

  /**
   * Device2: Attempt auto-login after successful device linking
   */
  private async attemptAutoLogin(
    deterministicKeysResult?: {
      encryptedVrfKeypair: EncryptedVRFKeypair;
      serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
      vrfPublicKey: string;
      nearPublicKey: string;
      credential: WebAuthnRegistrationCredential;
      vrfChallenge?: VRFChallenge;
    },
    options?: StartDeviceLinkingOptionsDevice2
  ): Promise<void> {
    try {
      // Send additional event after successful auto-login to update React state
      options?.onEvent?.({
        step: 8,
        phase: DeviceLinkingPhase.STEP_8_AUTO_LOGIN,
        status: DeviceLinkingStatus.PROGRESS,
        message: 'Logging in...'
      });

      if (
        !this.session || !this.session.accountId ||
        !this.session.credential || !deterministicKeysResult
      ) {
        const missing = [];
        if (!this.session) missing.push('session');
        if (!this.session?.accountId) missing.push('accountId');
        if (!this.session?.credential) missing.push('credential');
        if (!deterministicKeysResult) missing.push('deterministicKeysResult');
        throw new Error(`Missing required data for auto-login: ${missing.join(', ')}`);
      }

      // Try Shamir 3-pass unlock first if available
      if (
        deterministicKeysResult.serverEncryptedVrfKeypair &&
        this.context.configs.vrfWorkerConfigs?.shamir3pass?.relayServerUrl
      ) {
        try {
          console.log('LinkDeviceFlow: Attempting Shamir 3-pass unlock for auto-login');
          const unlockResult = await this.context.webAuthnManager.shamir3PassDecryptVrfKeypair({
            nearAccountId: this.session.accountId,
            kek_s_b64u: deterministicKeysResult.serverEncryptedVrfKeypair.kek_s_b64u,
            ciphertextVrfB64u: deterministicKeysResult.serverEncryptedVrfKeypair.ciphertextVrfB64u,
          });

          if (unlockResult.success) {
            console.log('LinkDeviceFlow: Shamir 3-pass unlock successful for auto-login');

            // Initialize current user after successful VRF unlock
            try {
              await this.context.webAuthnManager.initializeCurrentUser(this.session.accountId, this.context.nearClient);
              // Ensure last-user device number reflects Device2 for future lookups
              try { await this.context.webAuthnManager.setLastUser(this.session.accountId, this.session.deviceNumber!); } catch {}
            } catch (initErr) {
              console.warn('Failed to initialize current user after Shamir 3-pass unlock:', initErr);
            }

            this.options?.onEvent?.({
              step: 8,
              phase: DeviceLinkingPhase.STEP_8_AUTO_LOGIN,
              status: DeviceLinkingStatus.SUCCESS,
              message: `Welcome ${this.session.accountId}`
            });
            return; // Success, no need to try TouchID
          } else {
            console.log('LinkDeviceFlow: Shamir 3-pass unlock failed, falling back to TouchID');
          }
        } catch (error) {
          console.log('LinkDeviceFlow: Shamir 3-pass unlock error, falling back to TouchID:', error);
        }
      }

      // Fall back to TouchID unlock
      console.log('LinkDeviceFlow: Using TouchID unlock for auto-login');
      // Obtain an authentication credential (separate from registration credential)
      const { txBlockHash, txBlockHeight } = await this.context.webAuthnManager.getNonceManager().getNonceBlockHashAndHeight(this.context.nearClient);
      const authChallenge = await this.context.webAuthnManager.generateVrfChallenge({
        userId: this.session.accountId,
        rpId: window.location.hostname,
        blockHash: txBlockHash,
        blockHeight: txBlockHeight,
      });
      const authenticators = await this.context.webAuthnManager.getAuthenticatorsByUser(this.session.accountId);
      const authCredential = await this.context.webAuthnManager.getAuthenticationCredentialsSerialized({
        nearAccountId: this.session.accountId,
        challenge: authChallenge,
        allowCredentials: authenticatorsToAllowCredentials(authenticators),
      });
      const vrfUnlockResult = await this.context.webAuthnManager.unlockVRFKeypair({
        nearAccountId: this.session.accountId,
        encryptedVrfKeypair: deterministicKeysResult.encryptedVrfKeypair,
        credential: authCredential,
      });

      if (vrfUnlockResult.success) {
        // Initialize current user after successful VRF unlock
        try {
          await this.context.webAuthnManager.initializeCurrentUser(this.session.accountId, this.context.nearClient);
          // Ensure last-user device number reflects Device2 for future lookups
          try { await this.context.webAuthnManager.setLastUser(this.session.accountId, this.session.deviceNumber!); } catch {}
        } catch (initErr) {
          console.warn('Failed to initialize current user after TouchID unlock:', initErr);
        }

        this.options?.onEvent?.({
          step: 8,
          phase: DeviceLinkingPhase.STEP_8_AUTO_LOGIN,
          status: DeviceLinkingStatus.SUCCESS,
          message: `Welcome ${this.session.accountId}`
        });
      } else {
        throw new Error(vrfUnlockResult.error || 'VRF unlock failed');
      }
    } catch(loginError: any) {
      console.warn('Login failed after device linking:', loginError);
      // Don't fail the whole linking process if auto-login fails
      options?.onEvent?.({
        step: 0,
        phase: DeviceLinkingPhase.LOGIN_ERROR,
        status: DeviceLinkingStatus.ERROR,
        error: loginError.message,
        message: loginError.message,
      });
    }
  }

  /**
   * Device2: Store authenticator data locally on Device2
   */
  private async storeDeviceAuthenticator(deterministicKeysResult: {
    encryptedVrfKeypair: EncryptedVRFKeypair;
    serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
    vrfPublicKey: string;
    nearPublicKey: string;
    credential: WebAuthnRegistrationCredential;
    vrfChallenge?: VRFChallenge;
  } | undefined): Promise<void> {
    if (!this.session || !this.session.accountId) {
      throw new Error('Session or account ID not available for storing authenticator');
    }

    try {
      const { webAuthnManager } = this.context;
      const { credential, accountId } = this.session;

      // check for credential after migration (should be available for both Option E and F)
      if (!credential) {
        throw new Error('WebAuthn credential not available after VRF migration');
      }
      if (!deterministicKeysResult?.encryptedVrfKeypair) {
        throw new Error('VRF credentials not available after migration');
      }

      if (this.session.deviceNumber === undefined || this.session.deviceNumber === null) {
        throw new Error('Device number not available - cannot determine device-specific account ID');
      }

      // Generate device-specific account ID for storage
      console.log("Storing device authenticator data with device number: ", this.session.deviceNumber);
      // Store user data with deviceNumber

      await webAuthnManager.storeUserData({
        nearAccountId: accountId,
        deviceNumber: this.session.deviceNumber,
        clientNearPublicKey: deterministicKeysResult.nearPublicKey,
        lastUpdated: Date.now(),
        passkeyCredential: {
          id: credential.id,
          rawId: credential.rawId
        },
        encryptedVrfKeypair: {
          encryptedVrfDataB64u: deterministicKeysResult.encryptedVrfKeypair.encryptedVrfDataB64u,
          chacha20NonceB64u: deterministicKeysResult.encryptedVrfKeypair.chacha20NonceB64u,
        },
        serverEncryptedVrfKeypair: deterministicKeysResult.serverEncryptedVrfKeypair || undefined, // Device linking now uses Shamir 3-pass encryption
      });

      // Store authenticator with deviceNumber
      const attestationB64u = credential.response.attestationObject;
      const credentialPublicKey = await webAuthnManager.extractCosePublicKey(attestationB64u);
      await webAuthnManager.storeAuthenticator({
        nearAccountId: accountId,
        deviceNumber: this.session.deviceNumber,
        credentialId: credential.rawId,
        credentialPublicKey,
        transports: ['internal'],
        name: `Device ${this.session.deviceNumber || 'Unknown'} Passkey for ${accountId.split('.')[0]}`,
        registered: new Date().toISOString(),
        syncedAt: new Date().toISOString(),
        vrfPublicKey: deterministicKeysResult.vrfPublicKey,
      });
      console.log(`LinkDeviceFlow: Successfully stored authenticator data for account: ${accountId}, device number: ${this.session.deviceNumber}`);

    } catch (error) {
      console.error(`LinkDeviceFlow: Failed to store authenticator data:`, error);
      // Clean up any partial data on failure
      await this.cleanupFailedLinkingAttempt();
      throw error;
    }
  }

  /**
   * 1. Derives deterministic VRF and NEAR keys using real accountID (instead of temporary keys)
   * 2. Executes Key Replacement transaction to replace temporary key with the real key
   * 3. Signs the registration transaction and broadcasts it.
   *
   * For Option E: VRF credentials already exist, just ensure they're stored
   * For Option F: Generate WebAuthn credential + derive VRF credentials
   */
  private async deriveDeterministicKeysAndRegisterAccount(): Promise<{
    encryptedVrfKeypair: EncryptedVRFKeypair;
    serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
    vrfPublicKey: string;
    nearPublicKey: string;
    credential: WebAuthnRegistrationCredential;
    vrfChallenge?: VRFChallenge;
  } | undefined> {

    if (!this.session || !this.session.accountId) {
      throw new Error('Session account ID not available for migration');
    };
    const realAccountId = this.session.accountId;

    try {
      console.log(`LinkDeviceFlow: Processing VRF credentials for real account: ${realAccountId}`);

      if (!this.session.credential) {
        // === OPTION F: Need to generate WebAuthn credential + derive VRF ===
        console.log(`LinkDeviceFlow: Option F - Generating WebAuthn credential for ${realAccountId}`);

        // Use secureConfirm to collect passkey with device number inside wallet iframe
        const confirm = await this.context.webAuthnManager.requestRegistrationCredentialConfirmation({
          nearAccountId: realAccountId,
          deviceNumber: this.session.deviceNumber!,
          contractId: this.context.configs.contractId,
          nearRpcUrl: this.context.configs.nearRpcUrl,
        });
        if (!confirm.confirmed || !confirm.credential) {
          throw new Error('User cancelled link-device confirmation (Option F)');
        }

        // Store serialized credential and vrf challenge in session
        this.session.credential = confirm.credential;
        this.session.vrfChallenge = confirm.vrfChallenge || null;

        // Derive VRF keypair using raw PRF output from secureConfirm
        const vrfDerivationResult = await this.context.webAuthnManager.deriveVrfKeypairFromRawPrf({
          prfOutput: confirm.prfOutput!,
          nearAccountId: realAccountId,
        });

        if (!vrfDerivationResult.success || !vrfDerivationResult.encryptedVrfKeypair) {
          throw new Error('Failed to derive VRF keypair from PRF for real account');
        }

        console.log(`LinkDeviceFlow: Option F - Generated proper credentials, implementing 3-step flow`);

        // === STEP 1: Generate NEAR keypair (deterministic, no transaction signing) ===
        // Use base account ID for consistent keypair derivation across devices
        const nearKeyResultStep1 = await this.context.webAuthnManager.deriveNearKeypairAndEncryptFromSerialized({
          nearAccountId: realAccountId, // Use base account ID for consistency
          credential: confirm.credential,
          options: { deviceNumber: this.session.deviceNumber },
          // No options - just generate the keypair, don't sign registration tx yet.
          // We need the deterministic NEAR public key to get the nonce for the key replacement transaction first
          // Then once the key replacement transaction is executed, we use the deterministic key
          // to sign the registration transaction
        });

        if (!nearKeyResultStep1.success || !nearKeyResultStep1.publicKey) {
          throw new Error('Failed to derive NEAR keypair in step 1');
        }
        console.log(`LinkDeviceFlow: Step 1 - Generated keypair: ${nearKeyResultStep1.publicKey}`);

        // === STEP 2: Execute Key Replacement Transaction ===
        this.context.webAuthnManager.getNonceManager().initializeUser(realAccountId, this.session!.nearPublicKey);
        // Initialize NonceManager with current (temporary) on-chain key
        const {
          nextNonce,
          txBlockHash
        } = await this.context.webAuthnManager.getNonceManager()
          .getNonceBlockHashAndHeight(this.context.nearClient);

        await this.executeKeySwapTransaction(
          nearKeyResultStep1.publicKey,
          nextNonce,
          txBlockHash
        );

        // === STEP 3: Get new key's actual nonce and sign registration transaction ===
        const {
          nextNonce: newKeyNonce,
          txBlockHash: newTxBlockHash,
        } = await (async () => {
          try {
            // Switch NonceManager to the newly added deterministic key
            this.context.webAuthnManager.getNonceManager().initializeUser(realAccountId, nearKeyResultStep1.publicKey);
          } catch {}
          return await this.context.webAuthnManager.getNonceManager().getNonceBlockHashAndHeight(this.context.nearClient);
        })();
        console.log("Key Replacement Transaction Block Hash retrieved.");
        console.log("NewKey's actual nonce >>>> newKeyNonce", newKeyNonce);

        // Generate the same keypair again (deterministic) but now with with the correct nonce for the registration transaction
        const nearKeyResultStep3 = await this.context.webAuthnManager.deriveNearKeypairAndEncryptFromSerialized({
          nearAccountId: realAccountId, // Use base account ID for consistency
          credential: this.session.credential!,
          options: {
            vrfChallenge: this.session.vrfChallenge,
            contractId: this.context.configs.contractId,
            nonce: newKeyNonce, // Use NEW key's actual nonce for the registration transaction
            blockHash: newTxBlockHash,
            // Pass the deterministic VRF public key for contract call
            deterministicVrfPublicKey: vrfDerivationResult.vrfPublicKey,
            deviceNumber: this.session.deviceNumber,
          }
        });

        if (!nearKeyResultStep3.success || !nearKeyResultStep3.signedTransaction) {
          throw new Error('Failed to sign registration transaction');
        }

        // === STEP 3: Broadcast Registration Transaction ===
        console.log(`LinkDeviceFlow: Broadcasting Device2 authenticator registration transaction`);
        const registrationTxResult = await this.context.nearClient.sendTransaction(nearKeyResultStep3.signedTransaction);
        // Advance NonceManager immediately after broadcast to avoid reusing the same nonce
        try {
          await this.context.webAuthnManager.getNonceManager().updateNonceFromBlockchain(
            this.context.nearClient,
            newKeyNonce
          );
        } catch (e) {
          console.warn('[LinkDeviceFlow]: Failed to update nonce after registration broadcast:', e);
        }
        console.log(`LinkDeviceFlow: Device2 authenticator registered on-chain:`, registrationTxResult?.transaction?.hash);

        // === OPTION F: Clean up temp account VRF data ===
        // Clean up any temp account VRF data (Option F only)
        if (this.session?.tempPrivateKey) {
          try {
            await IndexedDBManager.nearKeysDB.deleteEncryptedKey('temp-device-linking.testnet');
            console.log(`LinkDeviceFlow: Cleaned up temp VRF credentials`);
          } catch (err) {
            console.warn(`️LinkDeviceFlow: Could not clean up temp VRF credentials:`, err);
          }

          // Clean up temporary private key from memory after successful completion
          this.cleanupTemporaryKeyFromMemory();
        }

        if (!this.session.credential) {
          throw new Error('WebAuthn credential not available after VRF migration');
        }

        // Return all derived values - no more session state confusion!
        const result = {
          encryptedVrfKeypair: vrfDerivationResult.encryptedVrfKeypair,
          serverEncryptedVrfKeypair: vrfDerivationResult.serverEncryptedVrfKeypair,
          vrfPublicKey: vrfDerivationResult.vrfPublicKey,
          nearPublicKey: nearKeyResultStep1.publicKey,
          credential: this.session.credential,
          vrfChallenge: this.session.vrfChallenge!
        };

        return result;

      } else {
        // === OPTION E: Regenerate credential with device number ===
        console.log(`LinkDeviceFlow: Option E - Regenerating credentials with device number for ${realAccountId}`);

        // Use secureConfirm again to regenerate credential with device number discovered during polling
        const confirm2 = await this.context.webAuthnManager.requestRegistrationCredentialConfirmation({
          nearAccountId: realAccountId,
          deviceNumber: this.session.deviceNumber!,
          contractId: this.context.configs.contractId,
          nearRpcUrl: this.context.configs.nearRpcUrl,
        });
        if (!confirm2.confirmed || !confirm2.credential) {
          throw new Error('User cancelled link-device confirmation (Option E regen)');
        }

        // Store regenerated credential and challenge in session
        this.session.credential = confirm2.credential;
        this.session.vrfChallenge = confirm2.vrfChallenge || null;

        // For Option E, derive VRF keypair using raw PRF
        const vrfDerivationResult = await this.context.webAuthnManager.deriveVrfKeypairFromRawPrf({
          prfOutput: confirm2.prfOutput!,
          nearAccountId: realAccountId,
        });

        if (!vrfDerivationResult.success || !vrfDerivationResult.encryptedVrfKeypair) {
          throw new Error('Failed to derive VRF keypair from PRF for Option E');
        }
        console.log(`LinkDeviceFlow: Option E - VRF credentials derived for ${realAccountId}`);
        if (!this.session.credential) {
          throw new Error('WebAuthn credential not available after VRF migration');
        }

        const result = {
          encryptedVrfKeypair: vrfDerivationResult.encryptedVrfKeypair,
          serverEncryptedVrfKeypair: vrfDerivationResult.serverEncryptedVrfKeypair,
          vrfPublicKey: vrfDerivationResult.vrfPublicKey,
          nearPublicKey: this.session.nearPublicKey, // For Option E, use existing NEAR public key
          credential: this.session.credential,
          vrfChallenge: this.session.vrfChallenge!
        };

        return result;
      }

    } catch (error) {
      console.error(`LinkDeviceFlow: Failed to process VRF credentials:`, error);
      throw error;
    }
  }

  /**
   * Execute key replacement transaction for Option F flow
   * Replace temporary key with properly derived key using AddKey + DeleteKey
   */
  private async executeKeySwapTransaction(
    newPublicKey: string,
    nextNonce: string,
    txBlockHash: string
  ): Promise<void> {
    if (!this.session?.tempPrivateKey || !this.session?.accountId) {
      throw new Error('Missing temporary private key or account ID for key replacement');
    }

    const { tempPrivateKey, accountId, nearPublicKey: oldPublicKey } = this.session;

    try {
      console.log(`LinkDeviceFlow: Executing key replacement transaction for ${accountId}`);
      console.log(`   - Old key: ${oldPublicKey}`);
      console.log(`   - New key: ${newPublicKey}`);

      // Build actions: AddKey new + DeleteKey old
      const actions: ActionArgsWasm[] = [
        {
          action_type: ActionType.AddKey,
          public_key: newPublicKey,
          access_key: JSON.stringify({
            // nonce: 0, // nonce should be 0 for the new key, specifying nonce here does not seem to do anything
            permission: { FullAccess: {} }
          })
        },
        {
          action_type: ActionType.DeleteKey,
          public_key: oldPublicKey
        }
      ];

      // Use the webAuthnManager to sign with the temporary private key
      const keySwapResult = await this.context.webAuthnManager.signTransactionWithKeyPair({
        nearPrivateKey: tempPrivateKey,
        signerAccountId: accountId,
        receiverId: accountId,
        nonce: nextNonce,
        blockHash: txBlockHash,
        actions
      });

      // Broadcast the transaction
      const txResult = await this.context.nearClient.sendTransaction(
        keySwapResult.signedTransaction,
        DEFAULT_WAIT_STATUS.linkDeviceSwapKey
      );
      // Keep NonceManager in sync for the temporary key that signed this swap
      try {
        await this.context.webAuthnManager.getNonceManager().updateNonceFromBlockchain(
          this.context.nearClient,
          nextNonce
        );
      } catch (e) {
        console.warn('[LinkDeviceFlow]: Failed to update nonce after key swap broadcast:', e);
      }

      console.log(`LinkDeviceFlow: Key replacement transaction successful:`, txResult?.transaction?.hash);

    } catch (error) {
      console.error(`LinkDeviceFlow: Key replacement transaction failed:`, error);
      throw new Error(`Key replacement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean up failed linking attempts - remove any partially stored data
   */
  private async cleanupFailedLinkingAttempt(): Promise<void> {
    if (!this.session) return;

    try {
      const { credential, accountId, nearPublicKey } = this.session;

      console.log(`LinkDeviceFlow: Cleaning up failed linking attempt for ${accountId || 'unknown account'}`);

      // Clean up temporary private key from memory first
      this.cleanupTemporaryKeyFromMemory();

      // Remove any authenticator data for both base and device-specific accounts (if they were discovered)
      if (accountId && credential) {

        try {
          await IndexedDBManager.clientDB.deleteAllAuthenticatorsForUser(accountId);
          console.log(`LinkDeviceFlow: Removed authenticators for ${accountId}`);
        } catch (err) {
          console.warn(`️LinkDeviceFlow: Could not remove authenticators for ${accountId}:`, err);
        }

        try {
          await IndexedDBManager.clientDB.deleteUser(accountId);
          console.log(`LinkDeviceFlow: Removed user data for ${accountId}`);
        } catch (err) {
          console.warn(`️LinkDeviceFlow: Could not remove user data for ${accountId}:`, err);
        }

        // Remove any VRF credentials for both device-specific and base accounts (in case re-derivation happened)
        try {
          await IndexedDBManager.nearKeysDB.deleteEncryptedKey(accountId);
          console.log(`LinkDeviceFlow: Removed VRF credentials for device-specific account ${accountId}`);
        } catch (err) {
          console.warn(`️LinkDeviceFlow: Could not remove VRF credentials for ${accountId}:`, err);
        }
      }

      // Always clean up temp account VRF data (this is where initial QR generation stores data)
      try {
        await IndexedDBManager.nearKeysDB.deleteEncryptedKey('temp-device-linking.testnet');
        console.log(`LinkDeviceFlow: Removed temp VRF credentials`);
      } catch (err) {
        console.warn(`️LinkDeviceFlow: Could not remove temp VRF credentials:`, err);
      }

    } catch (error) {
      console.error(`LinkDeviceFlow: Error during cleanup:`, error);
    }
  }

  /**
   * Stop polling - guaranteed to clear any existing interval
   */
  private stopPolling(): void {
    if (this.pollingInterval) {
      console.log(`LinkDeviceFlow: Stopping polling interval`);
      clearTimeout(this.pollingInterval);
      this.pollingInterval = undefined;
    }
    this.pollGeneration++;
  }

  /**
   * Stop registration retry timeout
   */
  private stopRegistrationRetry(): void {
    if (this.registrationRetryTimeout) {
      console.log(`LinkDeviceFlow: Stopping registration retry timeout`);
      clearTimeout(this.registrationRetryTimeout);
      this.registrationRetryTimeout = undefined;
    }
  }

  /**
   * Get current flow state
   */
  getState() {
    return {
      phase: this.session?.phase,
      session: this.session,
      error: this.error,
    };
  }

  /**
   * Cancel the flow and cleanup
   */
  cancel(): void {
    console.log(`LinkDeviceFlow: Cancel called`);
    this.cancelled = true;
    this.stopPolling();
    this.stopRegistrationRetry();
    this.cleanupTemporaryKeyFromMemory(); // Clean up temporary private key
    this.session = null;
    this.error = undefined;
    this.registrationRetryCount = 0;
  }

  /**
   * Reset flow to initial state
   */
  reset(): void {
    this.cancel();
  }
}
