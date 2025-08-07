import type { PasskeyManagerContext } from './index';
import { validateNearAccountId } from '../../utils/validation';
import { getLoginState } from './login';
import { getNonceBlockHashAndHeight } from './actions';
import type { VRFInputData } from '../types/vrf-worker';
import type {
  DeviceLinkingQRData,
  LinkDeviceResult,
  ScanAndLinkDeviceOptionsDevice1,
} from '../types/linkDevice';
import { DeviceLinkingPhase, DeviceLinkingStatus } from '../types/passkeyManager';
import { DeviceLinkingError, DeviceLinkingErrorCode } from '../types/linkDevice';
import { DEVICE_LINKING_CONFIG } from '../../config.js';
import { executeDeviceLinkingContractCalls } from '../rpcCalls';

/**
 * Device1 (original device): Link device using pre-scanned QR data
 */
export async function linkDeviceWithQRCode(
  context: PasskeyManagerContext,
  qrData: DeviceLinkingQRData,
  options: ScanAndLinkDeviceOptionsDevice1
): Promise<LinkDeviceResult> {
  const { onEvent, onError } = options || {};

  try {
    onEvent?.({
      step: 2,
      phase: DeviceLinkingPhase.STEP_2_SCANNING,
      status: DeviceLinkingStatus.PROGRESS,
      message: 'Validating QR data...'
    });

    // Validate QR data
    validateDeviceLinkingQRData(qrData);

    // 3. Get Device1's current account (the account that will receive the new key)
    const device1LoginState = await getLoginState(context);

    if (!device1LoginState.isLoggedIn || !device1LoginState.nearAccountId) {
      throw new Error('Device1 must be logged in to authorize device linking');
    }

    const device1AccountId = device1LoginState.nearAccountId;

    // 4. Execute batched transaction: AddKey + Contract notification
    const fundingAmount = options.fundingAmount;

    // Parse the device public key for AddKey action
    const device2PublicKey = qrData.device2PublicKey;
    if (!device2PublicKey.startsWith('ed25519:')) {
      throw new Error('Invalid device public key format');
    }

    onEvent?.({
      step: 3,
      phase: DeviceLinkingPhase.STEP_3_AUTHORIZATION,
      status: DeviceLinkingStatus.PROGRESS,
      message: `Performing TouchID authentication for device linking...`
    });

    const userData = await context.webAuthnManager.getUser(device1AccountId);
    const nearPublicKeyStr = userData?.clientNearPublicKey;
    if (!nearPublicKeyStr) {
      throw new Error('Client NEAR public key not found in user data');
    }
    // Generate VRF challenge once for both transactions
    const {
      accessKeyInfo,
      nextNonce,
      txBlockHeight,
      txBlockHash
    } = await getNonceBlockHashAndHeight({
      nearClient: context.nearClient,
      nearPublicKeyStr: nearPublicKeyStr,
      nearAccountId: device1AccountId
    });
    const nextNextNonce = (BigInt(nextNonce) + BigInt(1)).toString();
    const nextNextNextNonce = (BigInt(nextNonce) + BigInt(2)).toString();

    const vrfInputData: VRFInputData = {
      userId: device1AccountId,
      rpId: window.location.hostname,
      blockHeight: txBlockHeight,
      blockHash: txBlockHash,
    };

    const vrfChallenge = await context.webAuthnManager.generateVrfChallenge(vrfInputData);

    // Single TouchID prompt for both transactions
    const authenticators = await context.webAuthnManager.getAuthenticatorsByUser(device1AccountId);
    const credential = await context.webAuthnManager.touchIdPrompt.getCredentials({
      nearAccountId: device1AccountId,
      challenge: vrfChallenge.outputAs32Bytes(),
      authenticators,
    });

    onEvent?.({
      step: 6,
      phase: DeviceLinkingPhase.STEP_6_REGISTRATION,
      status: DeviceLinkingStatus.PROGRESS,
      message: 'TouchID successful! Signing AddKey transaction...'
    });

    // Execute device linking transactions using the centralized RPC function
    const {
      addKeyTxResult,
      storeDeviceLinkingTxResult,
      signedDeleteKeyTransaction
    } = await executeDeviceLinkingContractCalls({
      context,
      device1AccountId,
      device2PublicKey,
      nextNonce,
      nextNextNonce,
      nextNextNextNonce,
      txBlockHash,
      vrfChallenge,
      credential,
      onEvent
    });

    const result = {
      success: true,
      device2PublicKey: qrData.device2PublicKey,
      transactionId: addKeyTxResult?.transaction?.hash
        || storeDeviceLinkingTxResult?.transaction?.hash
        || 'unknown',
      fundingAmount,
      linkedToAccount: device1AccountId, // Include which account the key was added to
      signedDeleteKeyTransaction
    };

    onEvent?.({
      step: 6,
      phase: DeviceLinkingPhase.STEP_6_REGISTRATION,
      status: DeviceLinkingStatus.SUCCESS,
      message: `Device2's key added to ${device1AccountId} successfully!`
    });

    return result;

  } catch (error: any) {
    console.error('LinkDeviceFlow: linkDeviceWithQRData caught error:', error);

    const errorMessage = `Failed to scan and link device: ${error.message}`;
    onError?.(new Error(errorMessage));

    throw new DeviceLinkingError(
      errorMessage,
      DeviceLinkingErrorCode.AUTHORIZATION_TIMEOUT,
      'authorization'
    );
  }
}

export function validateDeviceLinkingQRData(qrData: DeviceLinkingQRData): void {
  if (!qrData.device2PublicKey) {
    throw new DeviceLinkingError(
      'Missing device public key',
      DeviceLinkingErrorCode.INVALID_QR_DATA,
      'authorization'
    );
  }

  if (!qrData.timestamp) {
    throw new DeviceLinkingError(
      'Missing timestamp',
      DeviceLinkingErrorCode.INVALID_QR_DATA,
      'authorization'
    );
  }

  // Check timestamp is not too old (max 15 minutes)
  const maxAge = DEVICE_LINKING_CONFIG.TIMEOUTS.QR_CODE_MAX_AGE_MS;
  if (Date.now() - qrData.timestamp > maxAge) {
    throw new DeviceLinkingError(
      'QR code expired',
      DeviceLinkingErrorCode.SESSION_EXPIRED,
      'authorization'
    );
  }

  // Account ID is optional - Device2 discovers it from contract logs
  if (qrData.accountId) {
    validateNearAccountId(qrData.accountId);
  }
}
