/**
 * Enum for all supported NEAR action types
 * Provides type safety and better developer experience
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
}

export enum TxExecutionStatus {
  NONE = 'NONE',
  INCLUDED = 'INCLUDED',
  INCLUDED_FINAL = 'INCLUDED_FINAL',
  EXECUTED = 'EXECUTED',
  FINAL = 'FINAL',
  EXECUTED_OPTIMISTIC = 'EXECUTED_OPTIMISTIC'
}

// === ACTION INTERFACES (NEAR-JS STYLE) ===

/**
 * Base interface for all NEAR actions
 * Following near-js patterns for better developer experience
 */
interface BaseAction {
  /** Account ID that will receive this action */
  receiverId: string;
}

/**
 * Call a smart contract function
 * Most commonly used action type
 */
export interface FunctionCallAction extends BaseAction {
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

/**
 * Transfer NEAR tokens to another account
 */
export interface TransferAction extends BaseAction {
  type: ActionType.Transfer;
  /** Amount of NEAR tokens to transfer in yoctoNEAR */
  amount: string;
}

/**
 * Create a new NEAR account
 */
export interface CreateAccountAction extends BaseAction {
  type: ActionType.CreateAccount;
}

/**
 * Deploy a smart contract
 */
export interface DeployContractAction extends BaseAction {
  type: ActionType.DeployContract;
  /** Contract code as Uint8Array or base64 string */
  code: Uint8Array | string;
}

/**
 * Stake NEAR tokens for validation
 */
export interface StakeAction extends BaseAction {
  type: ActionType.Stake;
  /** Amount to stake in yoctoNEAR */
  stake: string;
  /** Public key of the validator */
  publicKey: string;
}

/**
 * Add an access key to an account
 */
export interface AddKeyAction extends BaseAction {
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

/**
 * Remove an access key from an account
 */
export interface DeleteKeyAction extends BaseAction {
  type: ActionType.DeleteKey;
  /** Public key to remove */
  publicKey: string;
}

/**
 * Delete an account and transfer remaining balance
 */
export interface DeleteAccountAction extends BaseAction {
  type: ActionType.DeleteAccount;
  /** Account that will receive the remaining balance */
  beneficiaryId: string;
}

/**
 * Union type for all possible NEAR actions
 * Provides type safety and IntelliSense support
 */
export type ActionArgs =
  | FunctionCallAction
  | TransferAction
  | CreateAccountAction
  | DeployContractAction
  | StakeAction
  | AddKeyAction
  | DeleteKeyAction
  | DeleteAccountAction;
