import { DelegateAction, Signature } from './delegate';

// === TRANSACTION INPUT INTERFACES ===

export interface TransactionInput {
  receiverId: string;
  actions: ActionArgs[],
}

export interface TransactionInputWasm {
  receiverId: string;
  actions: ActionArgsWasm[],
  nonce?: string; // Optional - computed in confirmation flow if not provided
}

/**
 * Enum for all supported NEAR action types
 */
export enum ActionType {
  CreateAccount = "CreateAccount",
  DeployContract = "DeployContract",
  FunctionCall = "FunctionCall",
  Transfer = "Transfer",
  Stake = "Stake",
  AddKey = "AddKey",
  DeleteKey = "DeleteKey",
  DeleteAccount = "DeleteAccount",
  SignedDelegate = "SignedDelegate",
  DeployGlobalContract = "DeployGlobalContract",
  UseGlobalContract = "UseGlobalContract",
}

export enum TxExecutionStatus {
  NONE = 'NONE',
  INCLUDED = 'INCLUDED',
  INCLUDED_FINAL = 'INCLUDED_FINAL',
  EXECUTED = 'EXECUTED',
  FINAL = 'FINAL',
  EXECUTED_OPTIMISTIC = 'EXECUTED_OPTIMISTIC'
}

// === ACTION INTERFACES (camelCase for JS) ===

export interface FunctionCallAction {
  type: ActionType.FunctionCall;
  /** Name of the contract method to call */
  methodName: string;
  /** Arguments to pass to the method (will be JSON.stringify'd automatically) */
  args: Record<string, any>;
  /** Maximum gas to use for this call (default: '30000000000000' 30 TGas) */
  gas?: string;
  /** Amount of NEAR tokens to attach in yoctoNEAR (default: '0') */
  deposit?: string;
}

export interface TransferAction {
  type: ActionType.Transfer;
  /** Amount of NEAR tokens to transfer in yoctoNEAR */
  amount: string;
}

export interface CreateAccountAction {
  type: ActionType.CreateAccount;
}

export interface DeployContractAction {
  type: ActionType.DeployContract;
  /** Contract code as Uint8Array or base64 string */
  code: Uint8Array | string;
}

export interface DeployGlobalContractAction {
  type: ActionType.DeployGlobalContract;
  /** Global contract code as Uint8Array or base64 string */
  code: Uint8Array | string;
  /** Deployment mode: CodeHash | AccountId */
  deployMode: 'CodeHash' | 'AccountId';
}

export interface UseGlobalContractAction {
  type: ActionType.UseGlobalContract;
  /** Exactly one of these should be set */
  accountId?: string;
  /** bs58-encoded 32-byte code hash */
  codeHash?: string;
}

export interface StakeAction {
  type: ActionType.Stake;
  /** Amount to stake in yoctoNEAR */
  stake: string;
  /** Public key of the validator */
  publicKey: string;
}

export interface AddKeyAction {
  type: ActionType.AddKey;
  /** Public key to add */
  publicKey: string;
  /** Access key configuration */
  accessKey: {
    /** Starting nonce for the key */
    nonce?: number;
    /** Permission level for the key */
    permission: 'FullAccess' | {
      /** Function call permissions */
      FunctionCall: {
        /** Maximum allowance in yoctoNEAR (optional for unlimited) */
        allowance?: string;
        /** Contract that can be called (default: same as receiverId) */
        receiverId?: string;
        /** Method names that can be called (empty array = all methods) */
        methodNames?: string[];
      };
    };
  };
}

export interface DeleteKeyAction {
  type: ActionType.DeleteKey;
  /** Public key to remove */
  publicKey: string;
}

export interface DeleteAccountAction {
  type: ActionType.DeleteAccount;
  /** Account that will receive the remaining balance */
  beneficiaryId: string;
}

/**
 * Action types for all NEAR actions
 * camelCase for JS
 */
export type ActionArgs =
  | FunctionCallAction
  | TransferAction
  | CreateAccountAction
  | DeployContractAction
  | StakeAction
  | AddKeyAction
  | DeleteKeyAction
  | DeleteAccountAction
  | DeployGlobalContractAction
  | UseGlobalContractAction;

// === ACTION TYPES ===

// ActionArgsWasm matches the Rust enum structure exactly
// snake_case for wasm
export type ActionArgsWasm =
  | { action_type: ActionType.CreateAccount }
  | { action_type: ActionType.DeployContract; code: number[] }
  | {
    action_type: ActionType.FunctionCall;
    method_name: string;
    args: string; // JSON string
    gas: string;
    deposit: string;
  }
  | { action_type: ActionType.Transfer; deposit: string }
  | { action_type: ActionType.Stake; stake: string; public_key: string }
  | { action_type: ActionType.AddKey; public_key: string; access_key: string }
  | { action_type: ActionType.DeleteKey; public_key: string }
  | { action_type: ActionType.DeleteAccount; beneficiary_id: string }
  | {
    action_type: ActionType.SignedDelegate;
    delegate_action: DelegateAction;
    signature: Signature;
  }
  | { action_type: ActionType.DeployGlobalContract; code: number[]; deploy_mode: 'CodeHash' | 'AccountId' }
  | { action_type: ActionType.UseGlobalContract; account_id?: string; code_hash?: string }

export function isActionArgsWasm(a?: any): a is ActionArgsWasm {
  return isObject(a) && 'action_type' in a;
}

export function toActionArgsWasm(action: ActionArgs): ActionArgsWasm {
  switch (action.type) {
    case ActionType.Transfer:
      return {
        action_type: ActionType.Transfer,
        deposit: action.amount
      };

    case ActionType.FunctionCall:
      return {
        action_type: ActionType.FunctionCall,
        method_name: action.methodName,
        args: JSON.stringify(action.args),
        gas: action.gas || "30000000000000",
        deposit: action.deposit || "0"
      };

    case ActionType.AddKey:
      // Ensure access key has proper format with nonce and permission object.
      // For FullAccess we emit the NEAR-style `{ FullAccess: {} }` shape to
      // match near-api-js and RPC JSON; FunctionCall permissions are passed
      // through as-is.
      const rawPermission = action.accessKey.permission;
      const permission = rawPermission === 'FullAccess'
          ? { FullAccess: {} }
          : rawPermission;
      const accessKey = {
        nonce: action.accessKey.nonce || 0,
        permission,
      };
      return {
        action_type: ActionType.AddKey,
        public_key: action.publicKey,
        access_key: JSON.stringify(accessKey)
      };

    case ActionType.DeleteKey:
      return {
        action_type: ActionType.DeleteKey,
        public_key: action.publicKey
      };

    case ActionType.CreateAccount:
      return {
        action_type: ActionType.CreateAccount
      };

    case ActionType.DeleteAccount:
      return {
        action_type: ActionType.DeleteAccount,
        beneficiary_id: action.beneficiaryId
      };

    case ActionType.DeployContract:
      return {
        action_type: ActionType.DeployContract,
        code: typeof action.code === 'string'
          ? Array.from(new TextEncoder().encode(action.code))
          : Array.from(action.code)
      };

    case ActionType.DeployGlobalContract:
      return {
        action_type: ActionType.DeployGlobalContract,
        code: typeof action.code === 'string'
          ? Array.from(new TextEncoder().encode(action.code))
          : Array.from(action.code),
        deploy_mode: action.deployMode,
      };

    case ActionType.UseGlobalContract:
      return {
        action_type: ActionType.UseGlobalContract,
        account_id: action.accountId,
        code_hash: action.codeHash,
      };

    case ActionType.Stake:
      return {
        action_type: ActionType.Stake,
        stake: action.stake,
        public_key: action.publicKey
      };

    default:
      throw new Error(`Action type ${(action as any).type} is not supported`);
  }
}

// === ACTION TYPE VALIDATION ===

/**
 * Validate action parameters before sending to worker
 */
export function validateActionArgsWasm(actionArgsWasm: ActionArgsWasm): void {
  switch (actionArgsWasm.action_type) {
    case ActionType.FunctionCall:
      if (!actionArgsWasm.method_name) {
        throw new Error('method_name required for FunctionCall');
      }
      if (!actionArgsWasm.args) {
        throw new Error('args required for FunctionCall');
      }
      if (!actionArgsWasm.gas) {
        throw new Error('gas required for FunctionCall');
      }
      if (!actionArgsWasm.deposit) {
        throw new Error('deposit required for FunctionCall');
      }
      // Validate args is valid JSON string
      if (typeof actionArgsWasm.args !== 'string') {
        throw new Error('FunctionCall action args must be a valid JSON string');
      }
      try {
        JSON.parse(actionArgsWasm.args);
      } catch {
        throw new Error('FunctionCall action args must be valid JSON string');
      }
      break;
    case ActionType.Transfer:
      if (!actionArgsWasm.deposit) {
        throw new Error('deposit required for Transfer');
      }
      break;
    case ActionType.CreateAccount:
      // No additional validation needed
      break;
    case ActionType.DeployContract:
      if (!actionArgsWasm.code || actionArgsWasm.code.length === 0) {
        throw new Error('code required for DeployContract');
      }
      break;
    case ActionType.Stake:
      if (!actionArgsWasm.stake) {
        throw new Error('stake amount required for Stake');
      }
      if (!actionArgsWasm.public_key) {
        throw new Error('public_key required for Stake');
      }
      break;
    case ActionType.AddKey:
      if (!actionArgsWasm.public_key) {
        throw new Error('public_key required for AddKey');
      }
      if (!actionArgsWasm.access_key) {
        throw new Error('access_key required for AddKey');
      }
      // Validate access_key is valid JSON string
      if (typeof actionArgsWasm.access_key !== 'string') {
        throw new Error('AddKey action access_key must be a valid JSON string');
      }
      try {
        JSON.parse(actionArgsWasm.access_key);
      } catch {
        throw new Error('AddKey action access_key must be valid JSON string');
      }
      break;
    case ActionType.DeleteKey:
      if (!actionArgsWasm.public_key) {
        throw new Error('public_key required for DeleteKey');
      }
      break;
    case ActionType.DeleteAccount:
      if (!actionArgsWasm.beneficiary_id) {
        throw new Error('beneficiary_id required for DeleteAccount');
      }
      break;
    case ActionType.SignedDelegate: {
      const payload = actionArgsWasm as {
        delegate_action?: unknown;
        signature?: unknown;
      };
      if (!payload.delegate_action || typeof payload.delegate_action !== 'object') {
        throw new Error('delegate_action required for SignedDelegate');
      }
      if (!payload.signature || typeof payload.signature !== 'object') {
        throw new Error('signature required for SignedDelegate');
      }
      break;
    }
    case ActionType.DeployGlobalContract:
      if (!actionArgsWasm.code || actionArgsWasm.code.length === 0) {
        throw new Error('code required for DeployGlobalContract');
      }
      if (!actionArgsWasm.deploy_mode || (actionArgsWasm.deploy_mode !== 'CodeHash' && actionArgsWasm.deploy_mode !== 'AccountId')) {
        throw new Error('deploy_mode must be CodeHash or AccountId for DeployGlobalContract');
      }
      break;
    case ActionType.UseGlobalContract: {
      const hasAccountId = !!actionArgsWasm.account_id;
      const hasCodeHash = !!actionArgsWasm.code_hash;
      if (hasAccountId === hasCodeHash) {
        throw new Error('UseGlobalContract requires exactly one of account_id or code_hash');
      }
      break;
    }
    default:
      throw new Error(`Unsupported action type: ${(actionArgsWasm as any).action_type}`);
  }
}

// === CONVERSIONS: WASM -> JS ACTIONS ===

interface FunctionCallPermissionView {
  FunctionCall: {
    allowance: string;
    receiver_id: string;
    method_names: string[];
  };
}

/**
 * Convert a single ActionArgsWasm (snake_case, stringified fields) to ActionArgs (camelCase, typed fields)
 */
export function fromActionArgsWasm(a: ActionArgsWasm): ActionArgs {
  switch (a.action_type) {
    case ActionType.FunctionCall: {
      let parsedArgs: Record<string, any> = {};
      try {
        if (typeof a.args === 'string') {
          parsedArgs = a.args ? JSON.parse(a.args) : {};
        } else {
          parsedArgs = a.args || {};
        }
      } catch {
        // leave as empty object if parsing fails
        parsedArgs = {};
      }
      return {
        type: ActionType.FunctionCall,
        methodName: a.method_name,
        args: parsedArgs,
        gas: a.gas,
        deposit: a.deposit
      };
    }
    case ActionType.Transfer:
      return {
        type: ActionType.Transfer,
        amount: a.deposit
      };
    case ActionType.CreateAccount:
      return {
        type: ActionType.CreateAccount
      };
    case ActionType.DeployContract: {
      // Represent code as Uint8Array for consistency
      const codeBytes = Array.isArray(a.code) ? new Uint8Array(a.code) : new Uint8Array();
      return {
        type: ActionType.DeployContract,
        code: codeBytes
      };
    }
    case ActionType.DeployGlobalContract: {
      const codeBytes = Array.isArray(a.code) ? new Uint8Array(a.code) : new Uint8Array();
      return {
        type: ActionType.DeployGlobalContract,
        code: codeBytes,
        deployMode: a.deploy_mode,
      };
    }
    case ActionType.Stake:
      return {
        type: ActionType.Stake,
        stake: a.stake,
        publicKey: a.public_key
      };
    case ActionType.AddKey: {
      // access_key is a JSON string of { nonce, permission: ... }
      let accessKey: { nonce: bigint; permission: 'FullAccess' | FunctionCallPermissionView; }
      try {
        accessKey = JSON.parse(a.access_key);
      } catch {
        accessKey = { nonce: BigInt(0), permission: 'FullAccess' };
      }
      // Normalize permission back to SDK shape
      const permission = accessKey?.permission;
      let normalizedPermission: 'FullAccess' | FunctionCallPermissionView = 'FullAccess';

      if (isObject(permission)) {
        if ('FullAccess' in permission) {
          normalizedPermission = 'FullAccess';
        } else if ('FunctionCall' in permission) {
          const fc = (permission as FunctionCallPermissionView).FunctionCall;
          normalizedPermission = {
            FunctionCall: {
              allowance: fc.allowance,
              receiver_id: fc.receiver_id,
              method_names: fc.method_names
            }
          };
        }
      }
      return {
        type: ActionType.AddKey,
        publicKey: a.public_key,
        accessKey: {
          nonce: typeof accessKey?.nonce === 'number' ? accessKey.nonce : 0,
          permission: normalizedPermission
        }
      };
    }
    case ActionType.DeleteKey:
      return {
        type: ActionType.DeleteKey,
        publicKey: a.public_key
      };
    case ActionType.DeleteAccount:
      return {
        type: ActionType.DeleteAccount,
        beneficiaryId: a.beneficiary_id
      };
    case ActionType.UseGlobalContract:
      return {
        type: ActionType.UseGlobalContract,
        accountId: a.account_id,
        codeHash: a.code_hash,
      };
    default:
      // Exhaustive guard
      throw new Error(`Unsupported wasm action_type: ${(a as any)?.action_type}`);
  }
}

/** Convert a TransactionInputWasm structure to TransactionInput */
export function fromTransactionInputWasm(tx: TransactionInputWasm): TransactionInput {
  return {
    receiverId: tx.receiverId,
    actions: tx.actions.map(fromActionArgsWasm)
  };
}

/** Convert an array of TransactionInputWasm to TransactionInput[] */
export function fromTransactionInputsWasm(txs: TransactionInputWasm[]): TransactionInput[] {
  return (txs || []).map(fromTransactionInputWasm);
}
import { isObject } from '@/utils/validation';
