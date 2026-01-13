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
import { createRandomVRFChallenge, type VRFChallenge } from './types/vrf-worker';
import { DEFAULT_WAIT_STATUS, TransactionContext } from './types/rpc';
import type { AuthenticatorOptions } from './types/authenticatorOptions';
import type { ConfirmationConfig } from './types/signer-worker';
import { base64UrlDecode, base64UrlEncode } from '../utils/encoders';
import { errorMessage } from '../utils/errors';
import { ensureEd25519Prefix } from '../utils/validation';
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
  /**
   * 32-byte SHA-256 hash of "<canonical_from>|<account_id_lower>".
   * Returned by newer EmailRecoverer contracts (replaces `from_address`).
   */
  from_address_hash?: number[] | null;
  /** Legacy field (string email address). */
  from_address?: string | null;
  email_timestamp_ms?: number | null;
  new_public_key?: string | null;
};

function normalizeByteArray(input: unknown): number[] | null | undefined {
  if (input == null) return input as null | undefined;

  if (Array.isArray(input)) {
    return input.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  }

  if (typeof input === 'string' && input) {
    try {
      const bytes =
        typeof Buffer !== 'undefined'
          ? Buffer.from(input, 'base64')
          : Uint8Array.from(atob(input), (c) => c.charCodeAt(0));
      const arr = bytes instanceof Uint8Array ? Array.from(bytes) : Array.from(new Uint8Array(bytes));
      return arr;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

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
    from_address_hash: normalizeByteArray((raw as any).from_address_hash) ?? (raw as any).from_address_hash,
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

  const signTransactions = () => context.webAuthnManager.signTransactionsWithActions({
    rpcCall: {
      contractId: context.webAuthnManager.tatchiPasskeyConfigs.contractId,
      nearRpcUrl: context.webAuthnManager.tatchiPasskeyConfigs.nearRpcUrl,
      nearAccountId: device1AccountId
    },
    // Prefer threshold signing when available; fall back to local signing if the account
    // is not enrolled with threshold key material.
    signerMode: { mode: 'threshold-signer', behavior: 'fallback' },
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

  // Sign three transactions with one PRF authentication
  let signedTransactions: Array<{ signedTransaction: SignedTransaction }> = [];
  try {
    signedTransactions = await signTransactions();
  } catch (e: unknown) {
    if (!isVrfSessionPasskeyMismatchError(e)) throw e;

    // This happens when:
    // - the VRF worker is unlocked for a different device's VRF keypair, but
    // - IndexedDB `lastUser` (and thus allowCredentials) points at another device.
    // Fix by re-unlocking the VRF keypair for the current deviceNumber, then retry once.
    onEvent?.({
      step: 3,
      phase: DeviceLinkingPhase.STEP_3_AUTHORIZATION,
      status: DeviceLinkingStatus.PROGRESS,
      message: 'Session mismatch detected; re-authenticating with TouchID...'
    });

    await repairVrfSessionForCurrentDevice({
      context,
      nearAccountId: device1AccountId,
      // Needs to cover 3 txs in a single batch.
      remainingUses: 3,
      ttlMs: 2 * 60 * 1000,
    });

    signedTransactions = await signTransactions();
  }

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

function isVrfSessionPasskeyMismatchError(err: unknown): boolean {
  const msg = errorMessage(err) || String(err || '');
  return msg.includes('different passkey/VRF session than the current device');
}

async function repairVrfSessionForCurrentDevice(args: {
  context: PasskeyManagerContext;
  nearAccountId: AccountId;
  ttlMs?: number;
  remainingUses?: number;
}): Promise<void> {
  const { context, nearAccountId } = args;
  const lastUser = await context.webAuthnManager.getLastUser();
  if (!lastUser || lastUser.nearAccountId !== nearAccountId) {
    throw new Error('Cannot repair VRF session: no lastUser for this account. Please log in again.');
  }
  const deviceNumber = lastUser.deviceNumber;
  if (!Number.isFinite(deviceNumber) || deviceNumber < 1) {
    throw new Error('Cannot repair VRF session: invalid lastUser.deviceNumber');
  }

  const authenticators = await context.webAuthnManager.getAuthenticatorsByUser(nearAccountId);
  const credentialIdsForDevice = authenticators
    .filter((a) => a.deviceNumber === deviceNumber)
    .map((a) => a.credentialId);

  const credentialIds = credentialIdsForDevice.length > 0
    ? credentialIdsForDevice
    : authenticators.map((a) => a.credentialId);

  if (credentialIds.length === 0) {
    throw new Error(`Cannot repair VRF session: no authenticators found for ${nearAccountId}`);
  }

  const challenge = createRandomVRFChallenge();
  const credential = await context.webAuthnManager.getAuthenticationCredentialsSerializedDualPrf({
    nearAccountId,
    challenge: challenge as VRFChallenge,
    credentialIds,
  });

  const unlockResult = await context.webAuthnManager.unlockVRFKeypair({
    nearAccountId,
    encryptedVrfKeypair: lastUser.encryptedVrfKeypair,
    credential: credential as WebAuthnAuthenticationCredential,
  });
  if (!unlockResult.success) {
    throw new Error(unlockResult.error || 'Failed to re-unlock VRF keypair for current device');
  }

  // Restore a minimal warm signing session so the retried batch can run without a second TouchID prompt.
  await context.webAuthnManager.mintSigningSessionFromCredential({
    nearAccountId,
    credential: credential as WebAuthnAuthenticationCredential,
    ttlMs: args.ttlMs,
    remainingUses: args.remainingUses,
  });
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
): Promise<Array<{ credentialId: string, authenticator: StoredAuthenticator, nearPublicKey?: string }>> {
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

        const nearPublicKey = (() => {
          const raw = (contractAuthenticator as any).near_public_key;
          if (typeof raw !== 'string') return undefined;
          const trimmed = raw.trim();
          return trimmed ? ensureEd25519Prefix(trimmed) : undefined;
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
          },
          ...(nearPublicKey ? { nearPublicKey } : {})
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

const EMPTY_NEAR_CODE_HASH = '11111111111111111111111111111111';

async function hasDeployedContractCode(nearClient: NearClient, accountId: AccountId): Promise<boolean> {
  try {
    const account = await nearClient.viewAccount(accountId);
    const codeHash = (account as { code_hash?: unknown } | null)?.code_hash;
    const globalContractHash = (account as { global_contract_hash?: unknown } | null)?.global_contract_hash;
    const globalContractAccountId = (account as { global_contract_account_id?: unknown } | null)?.global_contract_account_id;

    const hasLocalCode = typeof codeHash === 'string' && codeHash !== EMPTY_NEAR_CODE_HASH;
    const hasGlobalCode =
      (typeof globalContractHash === 'string' && globalContractHash.trim().length > 0) ||
      (typeof globalContractAccountId === 'string' && globalContractAccountId.trim().length > 0);

    return hasLocalCode || hasGlobalCode;
  } catch {
    return false;
  }
}

/**
 * Fetch on-chain recovery email hashes from the per-account contract.
 * Returns [] when no contract is deployed or on failure.
 */
export async function getRecoveryEmailHashesContractCall(
  nearClient: NearClient,
  accountId: AccountId
): Promise<number[][]> {
  try {
    // Prefer `view_account` over `view_code`:
    // - `view_code` is expected to fail for non-contract accounts and is noisy.
    // - `view_account` is lightweight and tells us whether the account uses local contract code
    //   or a NEAR "global contract" (via `global_contract_*` fields).
    const hasContract = await hasDeployedContractCode(nearClient, accountId);
    if (!hasContract) return [];

    const hashes = await nearClient.view<Record<string, never>, number[][]>({
      account: accountId,
      method: 'get_recovery_emails',
      args: {} as Record<string, never>,
    });

    return Array.isArray(hashes) ? (hashes as number[][]) : [];
  } catch (error) {
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
  const hasContract = await hasDeployedContractCode(nearClient, accountId);

  const {
    emailRecovererGlobalContract,
    zkEmailVerifierContract,
    emailDkimVerifierContract,
  } = contracts;

  // If the account already has a contract (local or global), it still might not be a readable
  // EmailRecoverer instance (e.g. stale state after upgrades). In that case, `set_recovery_emails`
  // would fail while `init_email_recovery` (#[init(ignore_state)]) can safely re-initialize.
  //
  // We keep this as a best-effort probe to avoid wiping state on transient RPC issues.
  let shouldInit = !hasContract;
  if (!shouldInit) {
    try {
      await nearClient.view<Record<string, never>, unknown>({
        account: accountId,
        method: 'get_recovery_emails',
        args: {} as Record<string, never>,
      });
    } catch (err: unknown) {
      const msg = errorMessage(err);
      // Common/expected cases where we should fall back to init:
      // - account has a global contract pointer but no EmailRecoverer-compatible state yet
      // - account has stale/incompatible state after a contract upgrade
      // - account has some other contract (method missing)
      if (/Cannot deserialize the contract state/i.test(msg)
        || /CodeDoesNotExist/i.test(msg)
        || /MethodNotFound/i.test(msg)) {
        shouldInit = true;
      }
    }
  }

  const base: ActionArgs[] = [
    {
      type: ActionType.UseGlobalContract,
      accountId: emailRecovererGlobalContract,
    },
  ];

  return shouldInit
    ? [
        ...base,
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
      ]
    : [
        ...base,
        {
          type: ActionType.FunctionCall,
          methodName: 'set_recovery_emails',
          args: {
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
// ACCESS KEY HELPERS
// ===========================

export type AccessKeyWaitOptions = {
  attempts?: number;
  delayMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function isAccessKeyNotFoundError(err: unknown): boolean {
  const msg = String(errorMessage(err) || '').toLowerCase();
  if (!msg) return false;

  // Common NEAR node / near-api-js phrasing for missing access keys.
  if (msg.includes('unknown access key') || msg.includes('unknown_access_key') || msg.includes('unknownaccesskey')) {
    return true;
  }
  if (msg.includes('accesskeydoesnotexist')) return true;
  if (msg.includes('access key does not exist')) return true;
  if (msg.includes("access key doesn't exist")) return true;
  if (msg.includes('access key not found')) return true;
  if (msg.includes('no such access key')) return true;
  if (msg.includes('viewing access key') && msg.includes('does not exist') && !msg.includes('account')) return true;

  return false;
}

export async function hasAccessKey(
  nearClient: NearClient,
  nearAccountId: string,
  publicKey: string,
  opts?: AccessKeyWaitOptions,
): Promise<boolean> {
  const expected = ensureEd25519Prefix(publicKey);
  if (!expected) return false;

  const attempts = Math.max(1, Math.floor(opts?.attempts ?? 6));
  const delayMs = Math.max(50, Math.floor(opts?.delayMs ?? 750));

  for (let i = 0; i < attempts; i++) {
    try {
      await nearClient.viewAccessKey(nearAccountId, expected);
      return true;
    } catch {
      // tolerate transient view errors during propagation; retry
    }
    if (i < attempts - 1) {
      await sleep(delayMs);
    }
  }
  return false;
}

export async function waitForAccessKeyAbsent(
  nearClient: NearClient,
  nearAccountId: string,
  publicKey: string,
  opts?: AccessKeyWaitOptions,
): Promise<boolean> {
  const expected = ensureEd25519Prefix(publicKey);
  if (!expected) return true;

  const attempts = Math.max(1, Math.floor(opts?.attempts ?? 6));
  const delayMs = Math.max(50, Math.floor(opts?.delayMs ?? 650));

  for (let i = 0; i < attempts; i++) {
    try {
      await nearClient.viewAccessKey(nearAccountId, expected);
    } catch (err: unknown) {
      if (isAccessKeyNotFoundError(err)) return true;
      // tolerate transient view errors during propagation; retry
    }
    if (i < attempts - 1) {
      await sleep(delayMs);
    }
  }
  return false;
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
    const intent_digest_32 = Array.from(base64UrlDecode(vrfChallenge.intentDigest || ''));
    if (intent_digest_32.length !== 32) {
      throw new Error('Missing or invalid vrfChallenge.intentDigest (expected base64url-encoded 32 bytes)');
    }
    const session_policy_digest_32 = vrfChallenge.sessionPolicyDigest32
      ? Array.from(base64UrlDecode(vrfChallenge.sessionPolicyDigest32))
      : [];
    if (session_policy_digest_32.length !== 0 && session_policy_digest_32.length !== 32) {
      throw new Error('Invalid vrfChallenge.sessionPolicyDigest32 (expected base64url-encoded 32 bytes)');
    }
    const vrfData = {
      vrf_input_data: Array.from(base64UrlDecode(vrfChallenge.vrfInput)),
      vrf_output: Array.from(base64UrlDecode(vrfChallenge.vrfOutput)),
      vrf_proof: Array.from(base64UrlDecode(vrfChallenge.vrfProof)),
      public_key: Array.from(base64UrlDecode(vrfChallenge.vrfPublicKey)),
      user_id: vrfChallenge.userId,
      rp_id: vrfChallenge.rpId,
      block_height: Number(vrfChallenge.blockHeight),
      block_hash: Array.from(base64UrlDecode(vrfChallenge.blockHash)),
      intent_digest_32,
      ...(session_policy_digest_32.length ? { session_policy_digest_32 } : {}),
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
    const intent_digest_32 = toBytes(vrfChallenge.intentDigest);
    if (intent_digest_32.length !== 32) {
      throw new Error('Missing or invalid vrfChallenge.intentDigest (expected base64url-encoded 32 bytes)');
    }
    const session_policy_digest_32 = toBytes(vrfChallenge.sessionPolicyDigest32);
    if (session_policy_digest_32.length !== 0 && session_policy_digest_32.length !== 32) {
      throw new Error('Invalid vrfChallenge.sessionPolicyDigest32 (expected base64url-encoded 32 bytes)');
    }
    const vrf_data = {
      vrf_input_data: toBytes(vrfChallenge.vrfInput),
      vrf_output: toBytes(vrfChallenge.vrfOutput),
      vrf_proof: toBytes(vrfChallenge.vrfProof),
      public_key: toBytes(vrfChallenge.vrfPublicKey),
      user_id: vrfChallenge.userId,
      rp_id: vrfChallenge.rpId,
      block_height: Number(vrfChallenge.blockHeight || 0),
      block_hash: toBytes(vrfChallenge.blockHash),
      intent_digest_32,
      ...(session_policy_digest_32.length ? { session_policy_digest_32 } : {}),
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

export async function authorizeThresholdEd25519(
  relayServerUrl: string,
  vrfChallenge: VRFChallenge,
  webauthnAuthentication: WebAuthnAuthenticationCredential,
  args: {
    relayerKeyId: string;
    clientVerifyingShareB64u: string;
    purpose: string;
    /**
     * Exact 32-byte digest that will be co-signed (tx hash / delegate hash / NEP-413 hash).
     * The relayer must bind this digest to the VRF-authorized `intent_digest_32`.
     */
    signingDigest32: number[];
    signingPayload?: unknown;
  },
): Promise<{
  ok: boolean;
  mpcSessionId?: string;
  expiresAt?: string;
  code?: string;
  message?: string;
  error?: string;
}> {
  try {
    const toBytes = (b64u: string | undefined): number[] => {
      if (!b64u) return [];
      return Array.from(base64UrlDecode(b64u));
    };
    const intent_digest_32 = toBytes(vrfChallenge.intentDigest);
    if (intent_digest_32.length !== 32) {
      throw new Error('Missing or invalid vrfChallenge.intentDigest (expected base64url-encoded 32 bytes)');
    }
    const vrf_data = {
      vrf_input_data: toBytes(vrfChallenge.vrfInput),
      vrf_output: toBytes(vrfChallenge.vrfOutput),
      vrf_proof: toBytes(vrfChallenge.vrfProof),
      public_key: toBytes(vrfChallenge.vrfPublicKey),
      user_id: vrfChallenge.userId,
      rp_id: vrfChallenge.rpId,
      block_height: Number(vrfChallenge.blockHeight || 0),
      block_hash: toBytes(vrfChallenge.blockHash),
      intent_digest_32,
    };

    const clientVerifyingShareBytes = toBytes(args.clientVerifyingShareB64u);
    if (clientVerifyingShareBytes.length !== 32) {
      throw new Error('Missing or invalid args.clientVerifyingShareB64u (expected base64url-encoded 32 bytes)');
    }

    // Strip extension results before sending to the relay (never send PRF outputs).
    const webauthn_authentication = {
      ...webauthnAuthentication,
      authenticatorAttachment: webauthnAuthentication.authenticatorAttachment ?? null,
      response: {
        ...webauthnAuthentication.response,
        userHandle: webauthnAuthentication.response.userHandle ?? null,
      },
      clientExtensionResults: null,
    };

    const url = `${relayServerUrl.replace(/\/$/, '')}/threshold-ed25519/authorize`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        relayerKeyId: args.relayerKeyId,
        clientVerifyingShareB64u: args.clientVerifyingShareB64u,
        purpose: args.purpose,
        signing_digest_32: (() => {
          const d = args.signingDigest32;
          if (!Array.isArray(d) || d.length !== 32) {
            throw new Error('Missing or invalid args.signingDigest32 (expected number[32])');
          }
          return d;
        })(),
        signingPayload: args.signingPayload,
        vrf_data,
        webauthn_authentication,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { ok: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const json = await response.json();
    return {
      ok: !!json?.ok,
      mpcSessionId: json?.mpcSessionId,
      expiresAt: json?.expiresAt,
      code: json?.code,
      message: json?.message,
    };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Failed to authorize threshold-ed25519 signing' };
  }
}

export async function thresholdEd25519Keygen(
  relayServerUrl: string,
  vrfChallenge: VRFChallenge,
  webauthnAuthentication: WebAuthnAuthenticationCredential,
  args: {
    clientVerifyingShareB64u: string;
    nearAccountId: string;
  },
): Promise<{
  ok: boolean;
  clientParticipantId?: number;
  relayerParticipantId?: number;
  participantIds?: number[];
  relayerKeyId?: string;
  publicKey?: string;
  relayerVerifyingShareB64u?: string;
  code?: string;
  message?: string;
  error?: string;
}> {
  try {
    const base = String(relayServerUrl || '').trim().replace(/\/$/, '');
    if (!base) throw new Error('Missing relayServerUrl');

    const clientVerifyingShareB64u = String(args.clientVerifyingShareB64u || '').trim();
    if (!clientVerifyingShareB64u) throw new Error('Missing clientVerifyingShareB64u');

    const nearAccountId = String(args.nearAccountId || '').trim();
    if (!nearAccountId) throw new Error('Missing nearAccountId');

    const toBytes = (b64u: string | undefined): number[] => {
      if (!b64u) return [];
      return Array.from(base64UrlDecode(b64u));
    };
    const intent_digest_32 = toBytes(vrfChallenge.intentDigest);
    if (intent_digest_32.length !== 32) {
      throw new Error('Missing or invalid vrfChallenge.intentDigest (expected base64url-encoded 32 bytes)');
    }
    const vrf_data = {
      vrf_input_data: toBytes(vrfChallenge.vrfInput),
      vrf_output: toBytes(vrfChallenge.vrfOutput),
      vrf_proof: toBytes(vrfChallenge.vrfProof),
      public_key: toBytes(vrfChallenge.vrfPublicKey),
      user_id: vrfChallenge.userId,
      rp_id: vrfChallenge.rpId,
      block_height: Number(vrfChallenge.blockHeight || 0),
      block_hash: toBytes(vrfChallenge.blockHash),
      intent_digest_32,
    };

    // Strip extension results before sending to the relay (never send PRF outputs).
    const webauthn_authentication = {
      ...webauthnAuthentication,
      authenticatorAttachment: webauthnAuthentication.authenticatorAttachment ?? null,
      response: {
        ...webauthnAuthentication.response,
        userHandle: webauthnAuthentication.response.userHandle ?? null,
      },
      clientExtensionResults: null,
    };

    const url = `${base}/threshold-ed25519/keygen`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        clientVerifyingShareB64u,
        nearAccountId,
        vrf_data,
        webauthn_authentication,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { ok: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const json = await response.json();
    return {
      ok: !!json?.ok,
      clientParticipantId: json?.clientParticipantId,
      relayerParticipantId: json?.relayerParticipantId,
      participantIds: json?.participantIds,
      relayerKeyId: json?.relayerKeyId,
      publicKey: json?.publicKey,
      relayerVerifyingShareB64u: json?.relayerVerifyingShareB64u,
      code: json?.code,
      message: json?.message,
    };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Failed to keygen threshold-ed25519' };
  }
}

export async function thresholdEd25519KeygenFromRegistrationTx(
  relayServerUrl: string,
  args: {
    clientVerifyingShareB64u: string;
    nearAccountId: string;
    registrationTxHash: string;
  },
): Promise<{
  ok: boolean;
  clientParticipantId?: number;
  relayerParticipantId?: number;
  participantIds?: number[];
  relayerKeyId?: string;
  publicKey?: string;
  relayerVerifyingShareB64u?: string;
  code?: string;
  message?: string;
  error?: string;
}> {
  try {
    const base = String(relayServerUrl || '').trim().replace(/\/$/, '');
    if (!base) throw new Error('Missing relayServerUrl');

    const clientVerifyingShareB64u = String(args.clientVerifyingShareB64u || '').trim();
    if (!clientVerifyingShareB64u) throw new Error('Missing clientVerifyingShareB64u');

    const nearAccountId = String(args.nearAccountId || '').trim();
    if (!nearAccountId) throw new Error('Missing nearAccountId');

    const registrationTxHash = String(args.registrationTxHash || '').trim();
    if (!registrationTxHash) throw new Error('Missing registrationTxHash');

    const url = `${base}/threshold-ed25519/keygen`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        clientVerifyingShareB64u,
        nearAccountId,
        registrationTxHash,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { ok: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const json = await response.json();
    return {
      ok: !!json?.ok,
      clientParticipantId: json?.clientParticipantId,
      relayerParticipantId: json?.relayerParticipantId,
      participantIds: json?.participantIds,
      relayerKeyId: json?.relayerKeyId,
      publicKey: json?.publicKey,
      relayerVerifyingShareB64u: json?.relayerVerifyingShareB64u,
      code: json?.code,
      message: json?.message,
    };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Failed to keygen threshold-ed25519 from registration tx' };
  }
}
