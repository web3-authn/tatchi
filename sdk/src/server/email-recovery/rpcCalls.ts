import type { ActionArgsWasm } from '../../core/types/actions';
import { ActionType, validateActionArgsWasm } from '../../core/types/actions';
import { parseContractExecutionError } from '../core/errors';
import { hashRecoveryEmailForAccount, type EmailEncryptionContext } from './emailEncryptor';
import { parseHeaderValue, parseRecoverSubjectBindings } from './emailParsers';
import type { EmailRecoveryResult, EmailRecoveryServiceDeps, EmailRecoveryRequest } from './types';
import { toSingleLine } from '../../utils/validation';

function formatEmailRecoveryTxError(error: unknown, receiverId: string): string {
  const kind = typeof (error as any)?.kind === 'string' ? String((error as any).kind) : '';
  const short = typeof (error as any)?.short === 'string' ? String((error as any).short) : '';
  const msg = toSingleLine((error as any)?.message || String(error || ''));

  // Non-existent target account (common when the Subject includes a typo / unknown account).
  if (
    kind === 'AccountDoesNotExist' ||
    /AccountDoesNotExist/i.test(short) ||
    /AccountDoesNotExist/i.test(msg) ||
    /account does not exist/i.test(msg)
  ) {
    return `Account "${receiverId}" does not exist`;
  }

  // Invalid / malformed account id.
  if (
    /Invalid(Account|Receiver)Id/i.test(kind) ||
    /Invalid(Account|Receiver)Id/i.test(short) ||
    /Invalid(Account|Receiver)Id/i.test(msg)
  ) {
    return `Invalid NEAR account ID "${receiverId}"`;
  }

  // Prefer concise NearRpcError "short" where available.
  if (short && short !== 'TxExecutionError' && short !== 'RPC error') {
    return `Transaction failed (${short})`;
  }

  return msg || 'Unknown email recovery error';
}

export async function getOutlayerEncryptionPublicKey(
  deps: Pick<EmailRecoveryServiceDeps, 'nearClient' | 'emailDkimVerifierContract'>,
): Promise<Uint8Array> {
  const { nearClient, emailDkimVerifierContract } = deps;

  const result = await nearClient.view<{}, unknown>({
    account: emailDkimVerifierContract,
    method: 'get_outlayer_encryption_public_key',
    args: {},
  });

  if (typeof result !== 'string' || !result) {
    throw new Error('Outlayer encryption public key is not configured on EmailDkimVerifier');
  }

  let bytes: Uint8Array;
  try {
    const decoded = typeof Buffer !== 'undefined'
      ? Buffer.from(result, 'base64')
      : Uint8Array.from(atob(result), c => c.charCodeAt(0));
    bytes = decoded instanceof Uint8Array ? decoded : new Uint8Array(decoded);
  } catch (e) {
    throw new Error(`Failed to decode Outlayer email DKIM public key: ${(e as Error).message}`);
  }

  if (bytes.length !== 32) {
    throw new Error(`Outlayer email DKIM public key must be 32 bytes, got ${bytes.length}`);
  }

  return bytes;
}

export async function buildEncryptedEmailRecoveryActions(
  deps: EmailRecoveryServiceDeps,
  input: {
    accountId: string;
    emailBlob: string;
    recipientPk: Uint8Array;
    encrypt: (args: {
      emailRaw: string;
      aeadContext: EmailEncryptionContext;
      recipientPk: Uint8Array;
    }) => Promise<{ envelope: { version: number; ephemeral_pub: string; nonce: string; ciphertext: string } }>;
  },
): Promise<{ actions: ActionArgsWasm[]; receiverId: string }> {
  const {
    relayerAccountId,
    networkId,
  } = deps;
  const { accountId, emailBlob, recipientPk, encrypt } = input;

  const aeadContext: EmailEncryptionContext = {
    account_id: accountId,
    network_id: networkId,
    payer_account_id: relayerAccountId,
  };

  const { envelope } = await encrypt({
    emailRaw: emailBlob,
    aeadContext,
    recipientPk,
  });

  const bindings = parseRecoverSubjectBindings(emailBlob);
  if (!bindings) {
    throw new Error('Encrypted email recovery requires Subject: recover-<request_id> <accountId> ed25519:<new_public_key>');
  }
  if (bindings.accountId !== accountId) {
    throw new Error(`Encrypted email recovery subject accountId mismatch (expected "${accountId}", got "${bindings.accountId}")`);
  }

  const fromHeader = parseHeaderValue(emailBlob, 'from');
  if (!fromHeader) {
    throw new Error('Encrypted email recovery requires a From: header');
  }
  const expectedHashedEmail = hashRecoveryEmailForAccount({ recoveryEmail: fromHeader, accountId });

  const contractArgs = {
    encrypted_email_blob: envelope,
    aead_context: aeadContext,
    expected_hashed_email: expectedHashedEmail,
    expected_new_public_key: bindings.newPublicKey,
    request_id: bindings.requestId,
  };

  const actions: ActionArgsWasm[] = [
    {
      action_type: ActionType.FunctionCall,
      method_name: 'verify_encrypted_email_and_recover',
      args: JSON.stringify(contractArgs),
      gas: '300000000000000',
      deposit: '10000000000000000000000',
    },
  ];
  actions.forEach(validateActionArgsWasm);

  return {
    actions,
    receiverId: accountId,
  };
}

export async function buildZkEmailRecoveryActions(
  deps: EmailRecoveryServiceDeps,
  input: {
    accountId: string;
    contractArgs: {
      proof: unknown;
      public_inputs: string[];
      account_id: string;
      new_public_key: string;
      request_id: string;
      from_address_hash: number[];
      timestamp: string;
    };
  },
): Promise<{ actions: ActionArgsWasm[]; receiverId: string }> {
  const { accountId, contractArgs } = input;

  const actions: ActionArgsWasm[] = [
    {
      action_type: ActionType.FunctionCall,
      method_name: 'verify_zkemail_and_recover',
      args: JSON.stringify(contractArgs),
      gas: '300000000000000',
      deposit: '10000000000000000000000',
    },
  ];
  actions.forEach(validateActionArgsWasm);

  return {
    actions,
    receiverId: accountId,
  };
}

export async function buildOnchainEmailRecoveryActions(
  _deps: EmailRecoveryServiceDeps,
  input: { accountId: string; emailBlob: string },
): Promise<{ actions: ActionArgsWasm[]; receiverId: string }> {
  const { accountId, emailBlob } = input;

  const bindings = parseRecoverSubjectBindings(emailBlob);
  if (!bindings) {
    throw new Error('On-chain email recovery requires Subject: recover-<request_id> <accountId> ed25519:<new_public_key>');
  }
  if (bindings.accountId !== accountId) {
    throw new Error(`On-chain email recovery subject accountId mismatch (expected "${accountId}", got "${bindings.accountId}")`);
  }

  const actions: ActionArgsWasm[] = [
    {
      action_type: ActionType.FunctionCall,
      method_name: 'verify_email_onchain_and_recover',
      args: JSON.stringify({
        email_blob: emailBlob,
        request_id: bindings.requestId,
      }),
      gas: '300000000000000',
      deposit: '10000000000000000000000',
    },
  ];
  actions.forEach(validateActionArgsWasm);

  return {
    actions,
    receiverId: accountId,
  };
}

export async function sendEmailRecoveryTransaction(
  deps: EmailRecoveryServiceDeps,
  args: {
    receiverId: string;
    actions: ActionArgsWasm[];
    label: string;
  },
): Promise<EmailRecoveryResult> {
  const {
    relayerAccountId,
    relayerPrivateKey,
    nearClient,
    queueTransaction,
    fetchTxContext,
    signWithPrivateKey,
    getRelayerPublicKey,
  } = deps;

  const { receiverId, actions, label } = args;

  return queueTransaction(async () => {
    try {
      const relayerPublicKey = getRelayerPublicKey();
      const { nextNonce, blockHash } = await fetchTxContext(relayerAccountId, relayerPublicKey);

      const signed = await signWithPrivateKey({
        nearPrivateKey: relayerPrivateKey,
        signerAccountId: relayerAccountId,
        receiverId,
        nonce: nextNonce,
        blockHash,
        actions,
      });

      const result = await nearClient.sendTransaction(signed);

      const contractError = parseContractExecutionError(result, receiverId);
      if (contractError) {
        return {
          success: false,
          error: contractError,
          message: contractError,
        };
      }

      return {
        success: true,
        transactionHash: result.transaction.hash,
        message: label,
      };
    } catch (error: any) {
      const msg = formatEmailRecoveryTxError(error, receiverId);
      return {
        success: false,
        error: msg,
        message: msg,
      };
    }
  }, args.label);
}
