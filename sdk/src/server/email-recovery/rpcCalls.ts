import type { ActionArgsWasm } from '../../core/types/actions';
import { ActionType, validateActionArgsWasm } from '../../core/types/actions';
import { parseContractExecutionError } from '../core/errors';
import type { EmailEncryptionContext } from './emailEncryptor';
import type { EmailRecoveryResult, EmailRecoveryServiceDeps, EmailRecoveryRequest } from './types';

export async function getOutlayerEncryptionPublicKey(
  deps: Pick<EmailRecoveryServiceDeps, 'nearClient' | 'emailDkimVerifierAccountId'>,
): Promise<Uint8Array> {
  const { nearClient, emailDkimVerifierAccountId } = deps;

  const result = await nearClient.view<{}, unknown>({
    account: emailDkimVerifierAccountId,
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

  const contractArgs = {
    encrypted_email_blob: envelope,
    aead_context: aeadContext,
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
      from_email: string;
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

  const actions: ActionArgsWasm[] = [
    {
      action_type: ActionType.FunctionCall,
      method_name: 'verify_email_onchain_and_recover',
      args: JSON.stringify({
        email_blob: emailBlob,
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
      const msg = error?.message || 'Unknown email recovery error';
      return {
        success: false,
        error: msg,
        message: msg,
      };
    }
  }, args.label);
}
