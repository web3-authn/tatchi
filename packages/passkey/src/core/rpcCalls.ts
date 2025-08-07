/**
 * Consolidated NEAR Contract Calls
 *
 * This file contains all the NEAR contract calls made to the web3authn contract
 * throughout the passkey SDK. It provides a centralized location for all
 * contract interactions and makes it easier to maintain and update contract
 * call patterns.
 */

import type { FinalExecutionOutcome } from '@near-js/types';
import type { NearClient, SignedTransaction } from './NearClient';
import type { AccountId } from './types/accountIds';
import type { ContractStoredAuthenticator } from './PasskeyManager/recoverAccount';
import type { PasskeyManagerContext } from './PasskeyManager';
import type { DeviceLinkingSSEEvent } from './types/passkeyManager';

import { StoredAuthenticator } from './types/webauthn';
import { ActionPhase } from './types/passkeyManager';
import { ActionType } from './types/actions';
import { VRFChallenge } from './types/vrf-worker';
import { DeviceLinkingPhase, DeviceLinkingStatus } from './types/passkeyManager';
import { DEFAULT_WAIT_STATUS } from './types/rpc';

// ===========================
// CONTRACT CALL RESPONSES
// ===========================

export interface DeviceLinkingResult {
  linkedAccountId: string;
  deviceNumber: number;
}

export interface CredentialIdsResult {
  credentialIds: string[];
}

export interface AuthenticatorsResult {
  authenticators: Array<[string, ContractStoredAuthenticator]>;
}

// ===========================
// DEVICE LINKING CONTRACT CALLS
// ===========================

/**
 * Query the contract to get the account linked to a device public key
 * Used in device linking flow to check if a device key has been added
 *
 * NEAR does not provide a way to lookup the AccountID an access key has access to.
 * So we store a temporary mapping in the contract to lookup pubkey -> account ID.
 */
export async function getDeviceLinkingAccountContractCall(
  nearClient: NearClient,
  contractId: string,
  devicePublicKey: string
): Promise<DeviceLinkingResult | null> {
  try {
    const result = await nearClient.callFunction<{ device_public_key: string }, [string, number]>(
      contractId,
      'get_device_linking_account',
      { device_public_key: devicePublicKey }
    );

    // Handle different result formats
    if (result && Array.isArray(result) && result.length >= 2) {
      const [linkedAccountId, deviceNumber] = result;
      return {
        linkedAccountId,
        deviceNumber
      };
    }

    return null;
  } catch (error: any) {
    console.warn('Failed to get device linking account:', error.message);
    return null;
  }
}

// ===========================
// DEVICE LINKING TRANSACTION CALLS
// ===========================

/**
 * Execute device1's linking transactions (AddKey + Contract mapping)
 * This function signs and broadcasts both transactions required for device linking
 */
export async function executeDeviceLinkingContractCalls({
  context,
  device1AccountId,
  device2PublicKey,
  nextNonce,
  nextNextNonce,
  nextNextNextNonce,
  txBlockHash,
  vrfChallenge,
  credential,
  onEvent,
}: {
  context: PasskeyManagerContext,
  device1AccountId: AccountId,
  device2PublicKey: string,
  nextNonce: string,
  nextNextNonce: string,
  nextNextNextNonce: string,
  txBlockHash: string,
  vrfChallenge: VRFChallenge,
  credential: any, // PublicKeyCredential type
  onEvent?: (event: DeviceLinkingSSEEvent) => void
}): Promise<{
  addKeyTxResult: FinalExecutionOutcome;
  storeDeviceLinkingTxResult: FinalExecutionOutcome;
  signedDeleteKeyTransaction: SignedTransaction
}> {

  // Sign three transactions with one PRF authentication
  const signedTransactions = await context.webAuthnManager.signTransactionsWithActions({
    transactions: [
      // Transaction 1: AddKey - Add Device2's key to Device1's account
      {
        nearAccountId: device1AccountId,
        receiverId: device1AccountId,
        actions: [{
          actionType: ActionType.AddKey,
          public_key: device2PublicKey,
          access_key: JSON.stringify({
            permission: { FullAccess: {} },
            // FullAccess required to addkey
          })
        }],
        nonce: nextNonce,
      },
      // Transaction 2: Store temporary mapping in contract so Device2 can lookup Device1's accountID.
      {
        nearAccountId: device1AccountId,
        receiverId: context.webAuthnManager.configs.contractId,
        actions: [{
          actionType: ActionType.FunctionCall,
          method_name: 'store_device_linking_mapping',
          args: JSON.stringify({
            device_public_key: device2PublicKey,
            target_account_id: device1AccountId,
          }),
          gas: '30000000000000', // 30 TGas for device linking with yield promise automatic cleanup
          deposit: '0'
        }],
        nonce: nextNextNonce,
      },
      // Transaction 3: Remove Device2's temporary key if it fails to complete linking after a timeout
      {
        nearAccountId: device1AccountId,
        receiverId: device1AccountId,
        actions: [{
          actionType: ActionType.DeleteKey,
          public_key: device2PublicKey
        }],
        nonce: nextNextNextNonce,
      }
    ],
    // Common parameters
    blockHash: txBlockHash,
    contractId: context.webAuthnManager.configs.contractId,
    vrfChallenge: vrfChallenge,
    credential: credential,
    nearRpcUrl: context.webAuthnManager.configs.nearRpcUrl,
    onEvent: (progress) => {
      if (progress.phase == ActionPhase.STEP_6_TRANSACTION_SIGNING_COMPLETE) {
        onEvent?.({
          step: 3,
          phase: DeviceLinkingPhase.STEP_3_AUTHORIZATION,
          status: DeviceLinkingStatus.SUCCESS,
          message: `Transactions signed`
        })
      }
    }
  });

  if (!signedTransactions[0].signedTransaction) {
    throw new Error('AddKey transaction signing failed');
  }
  if (!signedTransactions[1].signedTransaction) {
    throw new Error('Contract mapping transaction signing failed');
  }
  if (!signedTransactions[2].signedTransaction) {
    throw new Error('DeleteKey transaction signing failed');
  }

  // Broadcast just the first 2 transactions: addKey and store device linking mapping
  let addKeyTxResult: FinalExecutionOutcome;
  let storeDeviceLinkingTxResult: FinalExecutionOutcome;
  try {
    console.log('LinkDeviceFlow: Broadcasting AddKey transaction...');
    console.log('LinkDeviceFlow: AddKey transaction details:', {
      receiverId: signedTransactions[0].signedTransaction.transaction.receiverId,
      actions: JSON.parse(signedTransactions[0].signedTransaction.transaction.actionsJson || '[]'),
      transactionKeys: Object.keys(signedTransactions[0].signedTransaction.transaction),
    });

    addKeyTxResult = await context.nearClient.sendTransaction(
      signedTransactions[0].signedTransaction,
      DEFAULT_WAIT_STATUS.linkDeviceAddKey
    );
    console.log('LinkDeviceFlow: AddKey transaction result:', addKeyTxResult?.transaction?.hash);

    // Send success events immediately after AddKey succeeds
    onEvent?.({
      step: 3,
      phase: DeviceLinkingPhase.STEP_3_AUTHORIZATION,
      status: DeviceLinkingStatus.SUCCESS,
      message: `AddKey transaction completed successfully!`
    });

    // Check if contract mapping transaction is valid before attempting to broadcast
    const contractTx = signedTransactions[1].signedTransaction;
    console.log('LinkDeviceFlow: Contract mapping transaction details:', {
      receiverId: contractTx.transaction.receiverId,
      actions: JSON.parse(contractTx.transaction.actionsJson || '[]').length
    });

    // Standard timeout since nonce conflict should be resolved by the 2s delay
    storeDeviceLinkingTxResult = await context.nearClient.sendTransaction(
      contractTx,
      DEFAULT_WAIT_STATUS.linkDeviceAccountMapping
    );
    console.log('LinkDeviceFlow: Contract mapping transaction result:', storeDeviceLinkingTxResult?.transaction?.hash);
  } catch (txError: any) {
    console.error('LinkDeviceFlow: Transaction broadcasting failed:', txError);
    console.error('LinkDeviceFlow: Transaction error details:', {
      message: txError.message,
      stack: txError.stack,
      name: txError.name
    });
    throw new Error(`Transaction broadcasting failed: ${txError.message}`);
  }

  console.log('LinkDeviceFlow: Sending final success event...');
  onEvent?.({
    step: 6,
    phase: DeviceLinkingPhase.STEP_6_REGISTRATION,
    status: DeviceLinkingStatus.SUCCESS,
    message: `Device linking completed successfully!`
  });

  return {
    addKeyTxResult,
    storeDeviceLinkingTxResult,
    signedDeleteKeyTransaction: signedTransactions[2].signedTransaction
  };
}

// ===========================
// ACCOUNT RECOVERY CONTRACT CALLS
// ===========================

/**
 * Get credential IDs associated with an account from the contract
 * Used in account recovery to discover available credentials
 */
export async function getCredentialIdsContractCall(
  nearClient: NearClient,
  contractId: string,
  accountId: AccountId
): Promise<string[]> {
  try {
    const credentialIds = await nearClient.callFunction<{ account_id: AccountId }, string[]>(
      contractId,
      'get_credential_ids_by_account',
      { account_id: accountId }
    );
    return credentialIds || [];
  } catch (error: any) {
    console.warn('Failed to fetch credential IDs from contract:', error.message);
    return [];
  }
}

/**
 * Get all authenticators stored for a user from the contract
 * Used in account recovery to sync authenticator data
 */
export async function getAuthenticatorsByUser(
  nearClient: NearClient,
  contractId: string,
  accountId: AccountId
): Promise<[string, ContractStoredAuthenticator][]> {
  try {
    const authenticatorsResult = await nearClient.view<{ user_id: AccountId }, [string, ContractStoredAuthenticator][]>({
      account: contractId,
      method: 'get_authenticators_by_user',
      args: { user_id: accountId }
    });

    if (authenticatorsResult && Array.isArray(authenticatorsResult)) {
      return authenticatorsResult;
    }
    return [];
  } catch (error: any) {
    console.warn('Failed to fetch authenticators from contract:', error.message);
    return [];
  }
}

export async function syncAuthenticatorsContractCall(
  nearClient: NearClient,
  contractId: string,
  accountId: AccountId
): Promise<Array<{ credentialId: string, authenticator: StoredAuthenticator }>> {
  try {
    const authenticatorsResult = await getAuthenticatorsByUser(nearClient, contractId, accountId);
    if (authenticatorsResult && Array.isArray(authenticatorsResult)) {
      return authenticatorsResult.map(([credentialId, contractAuthenticator]) => {
        console.log(`Contract authenticator device_number for ${credentialId}:`, contractAuthenticator.device_number);
        return {
          credentialId,
          authenticator: {
            credentialId,
            credentialPublicKey: new Uint8Array(contractAuthenticator.credential_public_key),
            transports: contractAuthenticator.transports,
            userId: accountId,
            name: `Device ${contractAuthenticator.device_number} Authenticator`,
            registered: new Date(parseInt(contractAuthenticator.registered as string)),
            // Store the actual device number from contract (no fallback)
            deviceNumber: contractAuthenticator.device_number,
            vrfPublicKeys: contractAuthenticator.vrf_public_keys
          }
        };
      });
    }
    return [];
  } catch (error: any) {
    console.warn('Failed to fetch authenticators from contract:', error.message);
    return [];
  }
}
