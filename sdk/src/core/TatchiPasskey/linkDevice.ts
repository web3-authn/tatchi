import { DEVICE_LINKING_CONFIG } from '../../config';
import { createNearKeypair } from '../nearCrypto';
import { IndexedDBManager } from '../IndexedDBManager';
import { ActionType, type ActionArgsWasm } from '../types/actions';
import { toAccountId, type AccountId } from '../types/accountIds';
import {
  VRFChallenge,
  type EncryptedVRFKeypair,
  type ServerEncryptedVrfKeypair
} from '../types/vrf-worker';
import { getLoginSession } from './login';
import type { PasskeyManagerContext } from './index';
import type { WebAuthnRegistrationCredential } from '../types';
import { DEFAULT_WAIT_STATUS } from "../types/rpc";
import { getDeviceLinkingAccountContractCall } from "../rpcCalls";

// Lazy-load QRCode to keep it an optional peer and reduce baseline bundle size
async function generateQRCodeDataURL(data: string): Promise<string> {
  const { default: QRCode } = await import('qrcode');
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
import type {
  DeviceLinkingQRData,
  DeviceLinkingSession,
  StartDeviceLinkingOptionsDevice2
} from '../types/linkDevice';
import { DeviceLinkingError, DeviceLinkingErrorCode } from '../types/linkDevice';
import { DeviceLinkingPhase, DeviceLinkingStatus } from '../types/sdkSentEvents';
import type { DeviceLinkingSSEEvent } from '../types/sdkSentEvents';
import { authenticatorsToAllowCredentials } from '../WebAuthnManager/touchIdPrompt';
import { parseDeviceNumber } from '../WebAuthnManager/SignerWorkerManager/getDeviceNumber';


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
   * Single flow:
   * - Generate a temporary NEAR keypair, discover the real account via AddKey mapping,
   *   then swap the temporary key for a deterministic key derived from a passkey.
   */
  async generateQR(): Promise<{ qrData: DeviceLinkingQRData; qrCodeDataURL: string }> {
    try {
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
      this.safeOnEvent({
        step: 1,
        phase: DeviceLinkingPhase.STEP_1_QR_CODE_GENERATED,
        status: DeviceLinkingStatus.PROGRESS,
        message: `QR code generated for device linking, waiting for Device1 to scan and authorize...`
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
    // Generate a temporary random NEAR Ed25519 keypair (browser-safe)
    const { publicKey: publicKeyNear, privateKey: privateKeyNear } = await createNearKeypair();
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
    }, this.TEMP_KEY_CLEANUP_DELAY_MS);
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
        const currentCounter = parseDeviceNumber(linkingResult.deviceNumber, { min: 0 });
        if (currentCounter === null) {
          console.warn(
            'LinkDeviceFlow: Invalid deviceNumber counter returned from contract:',
            linkingResult.deviceNumber
          );
          return false;
        }
        const nextDeviceNumber = currentCounter + 1;
        console.debug(`LinkDeviceFlow: Success! Discovered linked account:`, {
          linkedAccountId: linkingResult.linkedAccountId,
          currentCounter,
          nextDeviceNumber: nextDeviceNumber,
        });
        this.session.accountId = linkingResult.linkedAccountId as AccountId;
        this.session.deviceNumber = nextDeviceNumber;
        // Store the next device number for this device
        return true;
      } else {
        if (!this.cancelled) {
          console.log(`LinkDeviceFlow: No mapping found yet...`);
        }
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
   * 3. Stores authenticator and VRF data locally, performs on-chain Device2 registration, and then auto-login.
   */
  private async swapKeysAndRegisterAccount(): Promise<void> {
    if (!this.session || !this.session.accountId) {
      throw new Error('AccountID not available for registration');
    }

    const realAccountId = this.session.accountId;

    this.safeOnEvent({
      step: 6,
      phase: DeviceLinkingPhase.STEP_6_REGISTRATION,
      status: DeviceLinkingStatus.PROGRESS,
      message: 'Storing device authenticator data locally...'
    });

    // Migrate/generate deterministic VRF credentials for the real account
    const deterministicKeysResult = await this.deriveDeterministicKeysAndRegisterAccount();

    if (!deterministicKeysResult) {
      throw new Error('Failed to derive deterministic keys');
    }

    if (!deterministicKeysResult.vrfChallenge) {
      throw new Error('Missing VRF challenge from deterministic key derivation');
    }

    // Store authenticator data locally on Device2
    await this.storeDeviceAuthenticator(deterministicKeysResult);

    // === NEW: Sign Device2 registration WITHOUT new prompt ===
    // Use the credential we already collected to sign the registration transaction
    // This reuses PRF outputs from the stored credential to re-derive WrapKeySeed and sign
    const registrationResult = await this.context.webAuthnManager.signDevice2RegistrationWithStoredKey({
      nearAccountId: realAccountId,
      credential: deterministicKeysResult.credential,
      vrfChallenge: deterministicKeysResult.vrfChallenge,
      deterministicVrfPublicKey: deterministicKeysResult.vrfPublicKey,
      deviceNumber: this.session.deviceNumber!,
    });

    if (!registrationResult.success || !registrationResult.signedTransaction) {
      throw new Error(registrationResult.error || 'Device2 registration failed');
    }

    // Send the signed registration transaction to NEAR
    await this.context.nearClient.sendTransaction(
      registrationResult.signedTransaction,
      DEFAULT_WAIT_STATUS.linkDeviceRegistration,
    );

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
      if (this.cancelled) {
        console.warn('LinkDeviceFlow: Auto-login aborted because flow was cancelled');
        return;
      }

      const sessionSnapshot = this.session;

      // Send additional event after successful auto-login to update React state
      options?.onEvent?.({
        step: 8,
        phase: DeviceLinkingPhase.STEP_8_AUTO_LOGIN,
        status: DeviceLinkingStatus.PROGRESS,
        message: 'Logging in...'
      });

      if (
        !sessionSnapshot || !sessionSnapshot.accountId ||
        !sessionSnapshot.credential || !deterministicKeysResult
      ) {
        const missing = [];
        if (!sessionSnapshot) missing.push('session');
        if (!sessionSnapshot?.accountId) missing.push('accountId');
        if (!sessionSnapshot?.credential) missing.push('credential');
        if (!deterministicKeysResult) missing.push('deterministicKeysResult');
        throw new Error(`Missing required data for auto-login: ${missing.join(', ')}`);
      }

      const { accountId } = sessionSnapshot;
      const deviceNumberRaw = sessionSnapshot.deviceNumber;

      if (deviceNumberRaw == null) {
        throw new Error('Device number missing for auto-login');
      }

      const deviceNumber = parseDeviceNumber(deviceNumberRaw, { min: 1 });
      if (deviceNumber === null) {
        throw new Error(`Invalid device number for auto-login: ${String(deviceNumberRaw)}`);
      }

      // Try Shamir 3-pass unlock first if available
      if (
        deterministicKeysResult.serverEncryptedVrfKeypair &&
        deterministicKeysResult.serverEncryptedVrfKeypair.serverKeyId &&
        this.context.configs.vrfWorkerConfigs?.shamir3pass?.relayServerUrl
      ) {
        try {
          const unlockResult = await this.context.webAuthnManager.shamir3PassDecryptVrfKeypair({
            nearAccountId: accountId,
            kek_s_b64u: deterministicKeysResult.serverEncryptedVrfKeypair.kek_s_b64u,
            ciphertextVrfB64u: deterministicKeysResult.serverEncryptedVrfKeypair.ciphertextVrfB64u,
            serverKeyId: deterministicKeysResult.serverEncryptedVrfKeypair.serverKeyId,
          });

          if (unlockResult.success) {
            console.log('LinkDeviceFlow: Shamir 3-pass unlock successful for auto-login');

            if (this.cancelled) {
              console.warn('LinkDeviceFlow: Auto-login aborted after Shamir unlock because flow was cancelled');
              return;
            }

            // Initialize current user after successful VRF unlock
            await this.context.webAuthnManager.initializeCurrentUser(accountId, this.context.nearClient);
            // Ensure last-user device number reflects Device2 for future lookups
            await this.context.webAuthnManager.setLastUser(accountId, deviceNumber);

            this.options?.onEvent?.({
              step: 8,
              phase: DeviceLinkingPhase.STEP_8_AUTO_LOGIN,
              status: DeviceLinkingStatus.SUCCESS,
              message: `Welcome ${accountId}`
            });
            return; // Success, no need to try TouchID
          } else {
            console.log('LinkDeviceFlow: Shamir 3-pass unlock failed, falling back to TouchID');
          }
        } catch (error) {
          console.log('LinkDeviceFlow: Shamir 3-pass unlock error, falling back to TouchID:', error);
        }
      }

      // TouchID fallback unlock (no Shamir): unlock VRF keypair directly using the
      // encrypted VRF key from deterministicKeysResult. This ensures that the VRF
      // session in WASM is bound to the correct deterministic VRF key for this device.
      try {
        const nonceManager = this.context.webAuthnManager.getNonceManager();
        const {
          nextNonce: _nextNonce,
          txBlockHash,
          txBlockHeight
        } = await nonceManager.getNonceBlockHashAndHeight(this.context.nearClient);

        const authChallenge = await this.context.webAuthnManager.generateVrfChallengeOnce({
          userId: accountId,
          rpId: this.context.webAuthnManager.getRpId(),
          blockHash: txBlockHash,
          blockHeight: txBlockHeight,
        });

        const authenticators = await this.context.webAuthnManager.getAuthenticatorsByUser(accountId);
        const authCredential = await this.context.webAuthnManager.getAuthenticationCredentialsSerializedDualPrf({
          nearAccountId: accountId,
          challenge: authChallenge,
          credentialIds: authenticators.map((a) => a.credentialId),
        });

        const vrfUnlockResult = await this.context.webAuthnManager.unlockVRFKeypair({
          nearAccountId: accountId,
          encryptedVrfKeypair: deterministicKeysResult.encryptedVrfKeypair,
          credential: authCredential,
        });

        if (!vrfUnlockResult.success) {
          throw new Error(vrfUnlockResult.error || 'VRF unlock failed during auto-login');
        }

        // Initialize current user after successful VRF unlock
        await this.context.webAuthnManager.initializeCurrentUser(accountId, this.context.nearClient);
        // Ensure last-user device number reflects Device2 for future lookups
        await this.context.webAuthnManager.setLastUser(accountId, deviceNumber);

        this.options?.onEvent?.({
          step: 8,
          phase: DeviceLinkingPhase.STEP_8_AUTO_LOGIN,
          status: DeviceLinkingStatus.SUCCESS,
          message: `Welcome ${accountId}`
        });
        // Refresh local login state so downstream consumers pick up the device-specific
        // public key without requiring a manual re-login.
        try { await getLoginSession(this.context, accountId); } catch {}
      } catch (unlockError: any) {
        console.warn('LinkDeviceFlow: TouchID VRF unlock failed during auto-login:', unlockError);
        // Initialize current user even if VRF unlock fails; transactions will surface
        // a clearer error if VRF session is missing.
        await this.context.webAuthnManager.initializeCurrentUser(accountId, this.context.nearClient);
        await this.context.webAuthnManager.setLastUser(accountId, deviceNumber);

        this.options?.onEvent?.({
          step: 0,
          phase: DeviceLinkingPhase.LOGIN_ERROR,
          status: DeviceLinkingStatus.ERROR,
          error: unlockError.message,
          message: unlockError.message,
        });
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

      const deviceNumber = parseDeviceNumber(this.session.deviceNumber, { min: 1 });
      if (deviceNumber === null) {
        throw new Error(`Invalid device number in session: ${String(this.session.deviceNumber)}`);
      }
      // Normalize to a number in case something wrote a numeric string.
      this.session.deviceNumber = deviceNumber;

      console.debug("Storing device authenticator data with device number: ", deviceNumber);
      // Generate device-specific account ID for storage with deviceNumber
      await webAuthnManager.storeUserData({
        nearAccountId: accountId,
        deviceNumber,
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
        deviceNumber,
        credentialId: credential.rawId,
        credentialPublicKey,
        transports: ['internal'],
        name: `Device ${deviceNumber} Passkey for ${accountId.split('.')[0]}`,
        registered: new Date().toISOString(),
        syncedAt: new Date().toISOString(),
        vrfPublicKey: deterministicKeysResult.vrfPublicKey,
      });

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
   * 3. Stores authenticator and VRF data; on-chain registration is handled separately via VRF-driven flow.
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

    // Use secureConfirm to collect passkey with device number inside wallet iframe
    const confirm = await this.context.webAuthnManager.requestRegistrationCredentialConfirmation({
      nearAccountId: realAccountId,
      deviceNumber: this.session.deviceNumber!,
    });
    if (!confirm.confirmed || !confirm.credential) {
      throw new Error('User cancelled link-device confirmation');
    }

    // Store serialized credential and vrf challenge in session
    this.session.credential = confirm.credential;
    this.session.vrfChallenge = confirm.vrfChallenge || null;

    // Derive deterministic VRF keypair from PRF output embedded in the credential.
    // This also loads the VRF keypair into the worker's memory (saveInMemory=true by default)
    // and automatically tracks the account ID at the TypeScript level.
    const vrfDerivationResult = await this.context.webAuthnManager.deriveVrfKeypair({
      credential: confirm.credential,
      nearAccountId: realAccountId,
    });

    if (!vrfDerivationResult.success || !vrfDerivationResult.encryptedVrfKeypair) {
      throw new Error('Failed to derive VRF keypair from PRF for real account');
    }

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

    // After the key swap, initialize NonceManager with the newly added deterministic key
    // so future transactions and VRF flows use the correct on-chain key.
    this.context.webAuthnManager.getNonceManager().initializeUser(
      realAccountId,
      nearKeyResultStep1.publicKey
    );

    // Clean up any temp account VRF data.
    if (this.session?.tempPrivateKey) {
      try {
        await IndexedDBManager.nearKeysDB.deleteEncryptedKey('temp-device-linking.testnet');
      } catch {}
      // Clean up temporary private key from memory after successful completion
      this.cleanupTemporaryKeyFromMemory();
    }

    if (!this.session.credential) {
      throw new Error('WebAuthn credential not available after VRF migration');
    }

    // Return all derived values.
    const result = {
      encryptedVrfKeypair: vrfDerivationResult.encryptedVrfKeypair,
      serverEncryptedVrfKeypair: vrfDerivationResult.serverEncryptedVrfKeypair,
      vrfPublicKey: vrfDerivationResult.vrfPublicKey,
      nearPublicKey: nearKeyResultStep1.publicKey,
      credential: this.session.credential,
      vrfChallenge: this.session.vrfChallenge!
    };

    return result;
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
      // Build actions: AddKey new + DeleteKey old
      const actions: ActionArgsWasm[] = [
        {
          action_type: ActionType.AddKey,
          public_key: newPublicKey,
          access_key: JSON.stringify({
            // NEAR-style AccessKey JSON shape: { nonce, permission: { FullAccess: {} } }
            nonce: 0,
            permission: { FullAccess: {} },
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

    } catch (error) {
      console.error(`LinkDeviceFlow: Key replacement transaction failed:`, error);
      throw new Error(`Key replacement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean up failed linking attempts - remove any partially stored data
   */
  private async cleanupFailedLinkingAttempt(): Promise<void> {
    if (!this.session) {
      return;
    }
    try {
      const { credential, accountId, nearPublicKey } = this.session;
      // Clean up temporary private key from memory first
      this.cleanupTemporaryKeyFromMemory();
      // Remove any authenticator data for both base and device-specific accounts (if they were discovered)
      if (accountId && credential) {
        try { await IndexedDBManager.clientDB.deleteAllAuthenticatorsForUser(accountId); } catch {}
        try { await IndexedDBManager.clientDB.deleteUser(accountId); } catch {}
        try { await IndexedDBManager.nearKeysDB.deleteEncryptedKey(accountId); } catch {}
      }
      // Always clean up temp account VRF data (this is where initial QR generation stores data)
      try { await IndexedDBManager.nearKeysDB.deleteEncryptedKey('temp-device-linking.testnet'); } catch {}
    } catch (error) {
      console.error(`LinkDeviceFlow: Error during cleanup:`, error);
    }
  }

  /**
   * Stop polling - guaranteed to clear any existing interval
   */
  private stopPolling(): void {
    if (this.pollingInterval) {
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
