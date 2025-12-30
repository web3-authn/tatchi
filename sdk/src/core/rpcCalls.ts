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
import type { ContractStoredAuthenticator } from './TatchiPasskey/recoverAccount';
import type { PasskeyManagerContext } from './TatchiPasskey';
import type { AccountId } from './types/accountIds';
import type { DeviceLinkingSSEEvent } from './types/sdkSentEvents';
import type {
  StoredAuthenticator,
  WebAuthnRegistrationCredential,
  WebAuthnAuthenticationCredential
} from './types/webauthn';

import { ActionPhase, DeviceLinkingPhase, DeviceLinkingStatus } from './types/sdkSentEvents';
import { ActionType, type ActionArgs } from './types/actions';
import { VRFChallenge } from './types/vrf-worker';
import { DEFAULT_WAIT_STATUS, TransactionContext } from './types/rpc';
import type { AuthenticatorOptions } from './types/authenticatorOptions';
import type { ConfirmationConfig } from './types/signer-worker';
import { base64UrlDecode, base64UrlEncode } from '../utils/encoders';
import { errorMessage } from '../utils/errors';
import type { EmailRecoveryContracts } from './types/tatchi';
import { DEFAULT_EMAIL_RECOVERY_CONTRACTS } from './defaultConfigs';

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

export type RecoveryAttemptStatus =
  | "Started"
  | "VerifyingDkim"
  | "VerifyingZkEmail"
  | "DkimFailed"
  | "ZkEmailFailed"
  | "PolicyFailed"
  | "Recovering"
  | "AwaitingMoreEmails"
  | "Complete"
  | "Failed";

export type RecoveryAttempt = {
  request_id: string;
  status: RecoveryAttemptStatus | string;
  created_at_ms: number;
  updated_at_ms: number;
  error?: string | null;
  from_address?: string | null;
  email_timestamp_ms?: number | null;
  new_public_key?: string | null;
};

export async function getEmailRecoveryAttempt(
  nearClient: NearClient,
  accountId: string,
  requestId: string
): Promise<RecoveryAttempt | null> {
  const raw = await nearClient.view<{ request_id: string }, Omit<RecoveryAttempt, 'status'> & { status: any } | null>({
    account: accountId,
    method: 'get_recovery_attempt',
    args: { request_id: requestId },
  });

  if (!raw) return null;

  // Normalization logic for status (string or object enum)
  const statusRaw = raw.status;
  const status = (() => {
    if (typeof statusRaw === 'string') return statusRaw.trim();
    if (statusRaw && typeof statusRaw === 'object') {
      const keys = Object.keys(statusRaw as Record<string, unknown>);
      if (keys.length === 1) {
        return String(keys[0] || '').trim();
      }
    }
    return '';
  })();

  return {
    ...raw,
    status: status as RecoveryAttemptStatus,
  };
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
    const result = await nearClient.callFunction<
      { device_public_key: string },
      [string, number | string]
    >(
      contractId,
      'get_device_linking_account',
      { device_public_key: devicePublicKey }
    );

    // Handle different result formats
    if (result && Array.isArray(result) && result.length >= 2) {
      const [linkedAccountId, deviceNumberRaw] = result;
      const deviceNumber = Number(deviceNumberRaw);
      if (!Number.isSafeInteger(deviceNumber) || deviceNumber < 0) {
        console.warn(
          'Invalid deviceNumber returned from get_device_linking_account:',
          deviceNumberRaw
        );
        return null;
      }
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
  onEvent,
  confirmationConfigOverride,
  confirmerText,
}: {
  context: PasskeyManagerContext,
  device1AccountId: AccountId,
  device2PublicKey: string,
  nextNonce: string,
  nextNextNonce: string,
  nextNextNextNonce: string,
  txBlockHash: string,
  vrfChallenge: VRFChallenge,
  onEvent?: (event: DeviceLinkingSSEEvent) => void;
  confirmationConfigOverride?: Partial<ConfirmationConfig>;
  confirmerText?: { title?: string; body?: string };
}): Promise<{
  addKeyTxResult: FinalExecutionOutcome;
  storeDeviceLinkingTxResult: FinalExecutionOutcome;
  signedDeleteKeyTransaction: SignedTransaction
}> {

  // Sign three transactions with one PRF authentication
  const signedTransactions = await context.webAuthnManager.signTransactionsWithActions({
    rpcCall: {
      contractId: context.webAuthnManager.tatchiPasskeyConfigs.contractId,
      nearRpcUrl: context.webAuthnManager.tatchiPasskeyConfigs.nearRpcUrl,
      nearAccountId: device1AccountId
    },
    confirmationConfigOverride,
    title: confirmerText?.title,
    body: confirmerText?.body,
    transactions: [
      // Transaction 1: AddKey - Add Device2's key to Device1's account
      {
        receiverId: device1AccountId,
        actions: [{
          action_type: ActionType.AddKey,
          public_key: device2PublicKey,
          access_key: JSON.stringify({
            // NEAR-style AccessKey JSON shape, matching near-api-js:
            // { nonce: number, permission: { FullAccess: {} } }
            nonce: 0,
            permission: { FullAccess: {} },
          }),
        }],
        nonce: nextNonce,
      },
      // Transaction 2: Store temporary mapping in contract so Device2 can lookup Device1's accountID.
      {
        receiverId: context.webAuthnManager.tatchiPasskeyConfigs.contractId,
        actions: [{
          action_type: ActionType.FunctionCall,
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
        receiverId: device1AccountId,
        actions: [{
          action_type: ActionType.DeleteKey,
          public_key: device2PublicKey
        }],
        nonce: nextNextNextNonce,
      }
    ],
    onEvent: (progress) => {
      // Bridge all action progress events to the parent so the wallet iframe overlay
      // can expand during user confirmation in wallet-iframe mode.
      try { onEvent?.(progress as any); } catch { }
      // Keep existing mapping for device linking semantics; surface signing as a loading state
      if (progress.phase == ActionPhase.STEP_6_TRANSACTION_SIGNING_COMPLETE) {
        onEvent?.({
          step: 3,
          phase: DeviceLinkingPhase.STEP_3_AUTHORIZATION,
          status: DeviceLinkingStatus.PROGRESS,
          message: progress.message || 'Transaction signing in progress...'
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
    console.debug('LinkDeviceFlow: AddKey transaction details:', {
      receiverId: signedTransactions[0].signedTransaction.transaction.receiverId,
      actions: signedTransactions[0].signedTransaction.transaction.actions || [],
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
      actions: (contractTx.transaction.actions || []).length
    });

    // Standard timeout since nonce conflict should be resolved by the 2s delay
    storeDeviceLinkingTxResult = await context.nearClient.sendTransaction(
      contractTx,
      DEFAULT_WAIT_STATUS.linkDeviceAccountMapping
    );

  } catch (txError: any) {
    console.error('LinkDeviceFlow: Transaction broadcasting failed:', txError);
    throw new Error(`Transaction broadcasting failed: ${txError.message}`);
  }

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

        const transports = Array.isArray(contractAuthenticator.transports)
          ? contractAuthenticator.transports
          : [];

        const registered = (() => {
          const raw = String((contractAuthenticator as any).registered ?? '');
          if (!raw) return new Date(0);
          if (/^\d+$/.test(raw)) {
            const ts = Number(raw);
            return Number.isFinite(ts) ? new Date(ts) : new Date(0);
          }
          const d = new Date(raw);
          return Number.isFinite(d.getTime()) ? d : new Date(0);
        })();

        const vrfPublicKeys = (() => {
          const raw = (contractAuthenticator as any).vrf_public_keys;
          if (!raw) return undefined;
          if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') {
            return raw as string[];
          }
          if (Array.isArray(raw)) {
            return raw
              .map((entry: unknown) => {
                if (!entry) return null;
                if (entry instanceof Uint8Array) return base64UrlEncode(entry);
                if (Array.isArray(entry)) return base64UrlEncode(new Uint8Array(entry));
                return null;
              })
              .filter((x): x is string => typeof x === 'string' && x.length > 0);
          }
          return undefined;
        })();

        return {
          credentialId,
          authenticator: {
            credentialId,
            credentialPublicKey: new Uint8Array(contractAuthenticator.credential_public_key),
            transports,
            userId: accountId,
            name: `Device ${contractAuthenticator.device_number} Authenticator`,
            registered,
            // Store the actual device number from contract (no fallback)
            deviceNumber: contractAuthenticator.device_number,
            vrfPublicKeys
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

// ===========================
// RECOVERY EMAIL CONTRACT CALLS
// ===========================

/**
 * Fetch on-chain recovery email hashes from the per-account contract.
 * Returns [] when no contract is deployed or on failure.
 */
export async function getRecoveryEmailHashesContractCall(
  nearClient: NearClient,
  accountId: AccountId
): Promise<number[][]> {
  try {
    const code = await nearClient.viewCode(accountId);
    const hasContract = !!code && code.byteLength > 0;
    if (!hasContract) return [];

    const hashes = await nearClient.view<Record<string, never>, number[][]>({
      account: accountId,
      method: 'get_recovery_emails',
      args: {} as Record<string, never>,
    });

    return Array.isArray(hashes) ? (hashes as number[][]) : [];
  } catch (error) {
    console.error('[rpcCalls] Failed to fetch recovery email hashes', error);
    return [];
  }
}

/**
 * Build action args to update on-chain recovery emails for an account.
 * If the per-account contract is missing, deploy/attach the global recoverer via `init_email_recovery`.
 */
export async function buildSetRecoveryEmailsActions(
  nearClient: NearClient,
  accountId: AccountId,
  recoveryEmailHashes: number[][],
  contracts: EmailRecoveryContracts = DEFAULT_EMAIL_RECOVERY_CONTRACTS
): Promise<ActionArgs[]> {
  let hasContract = false;
  try {
    const code = await nearClient.viewCode(accountId);
    hasContract = !!code && code.byteLength > 0;
  } catch {
    hasContract = false;
  }

  const {
    emailRecovererGlobalContract,
    zkEmailVerifierContract,
    emailDkimVerifierContract,
  } = contracts;

  return hasContract
    ? [
        {
          type: ActionType.UseGlobalContract,
          accountId: emailRecovererGlobalContract,
        },
        {
          type: ActionType.FunctionCall,
          methodName: 'set_recovery_emails',
          args: {
            recovery_emails: recoveryEmailHashes,
          },
          gas: '80000000000000',
          deposit: '0',
        },
      ]
    : [
        {
          type: ActionType.UseGlobalContract,
          accountId: emailRecovererGlobalContract,
        },
        {
          type: ActionType.FunctionCall,
          methodName: 'init_email_recovery',
          args: {
            zk_email_verifier: zkEmailVerifierContract,
            email_dkim_verifier: emailDkimVerifierContract,
            policy: null,
            recovery_emails: recoveryEmailHashes,
          },
          gas: '80000000000000',
          deposit: '0',
        },
      ];
}

export async function fetchNonceBlockHashAndHeight({ nearClient, nearPublicKeyStr, nearAccountId }: {
  nearClient: NearClient,
  nearPublicKeyStr: string,
  nearAccountId: AccountId
}): Promise<TransactionContext> {
  // Get access key and transaction block info concurrently
  const [accessKeyInfo, txBlockInfo] = await Promise.all([
    nearClient.viewAccessKey(nearAccountId, nearPublicKeyStr)
      .catch(e => { throw new Error(`Failed to fetch Access Key`) }),
    nearClient.viewBlock({ finality: 'final' })
      .catch(e => { throw new Error(`Failed to fetch Block Info`) })
  ]);
  if (!accessKeyInfo || accessKeyInfo.nonce === undefined) {
    throw new Error(`Access key not found or invalid for account ${nearAccountId} with public key ${nearPublicKeyStr}. Response: ${JSON.stringify(accessKeyInfo)}`);
  }
  const nextNonce = (BigInt(accessKeyInfo.nonce) + BigInt(1)).toString();
  const txBlockHeight = String(txBlockInfo.header.height);
  const txBlockHash = txBlockInfo.header.hash; // Keep original base58 string

  return {
    nearPublicKeyStr,
    accessKeyInfo,
    nextNonce,
    txBlockHeight,
    txBlockHash,
  };
}

// ===========================
// REGISTRATION PRE-CHECK CALL
// ===========================

export interface CheckCanRegisterUserResult {
  success: boolean;
  verified: boolean;
  logs: string[];
  error?: string;
}

/**
 * View-only registration pre-check.
 *
 * Calls the contract's `check_can_register_user` view method with VRF data
 * derived from the provided VRF challenge and a serialized WebAuthn
 * registration credential (typically with PRF outputs embedded).
 */
export async function checkCanRegisterUserContractCall({
  nearClient,
  contractId,
  vrfChallenge,
  credential,
  authenticatorOptions,
}: {
  nearClient: NearClient;
  contractId: string;
  vrfChallenge: VRFChallenge;
  credential: WebAuthnRegistrationCredential;
  authenticatorOptions?: AuthenticatorOptions;
}): Promise<CheckCanRegisterUserResult> {
  try {
    const vrfData = {
      vrf_input_data: Array.from(base64UrlDecode(vrfChallenge.vrfInput)),
      vrf_output: Array.from(base64UrlDecode(vrfChallenge.vrfOutput)),
      vrf_proof: Array.from(base64UrlDecode(vrfChallenge.vrfProof)),
      public_key: Array.from(base64UrlDecode(vrfChallenge.vrfPublicKey)),
      user_id: vrfChallenge.userId,
      rp_id: vrfChallenge.rpId,
      block_height: Number(vrfChallenge.blockHeight),
      block_hash: Array.from(base64UrlDecode(vrfChallenge.blockHash)),
    };

    const args = {
      vrf_data: vrfData,
      webauthn_registration: credential,
      authenticator_options: authenticatorOptions,
    };

    const response = await nearClient.callFunction<typeof args, any>(
      contractId,
      'check_can_register_user',
      args,
    );

    const verified = !!response?.verified;
    return {
      success: true,
      verified,
      logs: [],
      error: verified ? undefined : 'Contract registration check failed',
    };
  } catch (err: unknown) {
    return {
      success: false,
      verified: false,
      logs: [],
      error: errorMessage(err) || 'Failed to call check_can_register_user',
    };
  }
}


/**
 * Verify authentication response through relay server
 * Routes the request to relay server which calls the web3authn contract for verification
 * and issues a JWT or session credential
 */
export async function verifyAuthenticationResponse(
  relayServerUrl: string,
  routePath: string,
  sessionKind: 'jwt' | 'cookie',
  vrfChallenge: VRFChallenge,
  webauthnAuthentication: WebAuthnAuthenticationCredential
): Promise<{
  success: boolean;
  verified?: boolean;
  jwt?: string;
  sessionCredential?: any;
  error?: string;
  contractResponse?: any;
}> {
  try {
    // Map VRFChallenge into server ContractVrfData shape (number arrays)
    const toBytes = (b64u: string | undefined): number[] => {
      if (!b64u) return [];
      return Array.from(base64UrlDecode(b64u));
    };
    const vrf_data = {
      vrf_input_data: toBytes(vrfChallenge.vrfInput),
      vrf_output: toBytes(vrfChallenge.vrfOutput),
      vrf_proof: toBytes(vrfChallenge.vrfProof),
      public_key: toBytes(vrfChallenge.vrfPublicKey),
      user_id: vrfChallenge.userId,
      rp_id: vrfChallenge.rpId,
      block_height: Number(vrfChallenge.blockHeight || 0),
      block_hash: toBytes(vrfChallenge.blockHash),
    };

    // Normalize authenticatorAttachment and userHandle to null for server schema
    const webauthn_authentication = {
      ...webauthnAuthentication,
      authenticatorAttachment: webauthnAuthentication.authenticatorAttachment ?? null,
      response: {
        ...webauthnAuthentication.response,
        userHandle: webauthnAuthentication.response.userHandle ?? null,
      }
    };

    const url = `${relayServerUrl.replace(/\/$/, '')}${routePath.startsWith('/') ? routePath : `/${routePath}`}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: sessionKind === 'cookie' ? 'include' : 'omit',
      body: JSON.stringify({
        sessionKind: sessionKind,
        vrf_data,
        webauthn_authentication,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const result = await response.json();
    return {
      success: true,
      verified: result.verified,
      jwt: result.jwt,
      sessionCredential: result.sessionCredential,
      contractResponse: result.contractResponse,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to verify authentication response',
    };
  }
}
