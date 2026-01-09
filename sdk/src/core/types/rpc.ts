import type { AccessKeyView, TxExecutionStatus } from "@near-js/types";

export const DEFAULT_WAIT_STATUS = {
  executeAction: "EXECUTED_OPTIMISTIC" as TxExecutionStatus,
  linkDeviceAddKey: "INCLUDED_FINAL" as TxExecutionStatus,
  // Threshold AddKey is safe to treat optimistically; finality will converge shortly after.
  thresholdAddKey: "EXECUTED_OPTIMISTIC" as TxExecutionStatus,
  linkDeviceSwapKey: "FINAL" as TxExecutionStatus,
  linkDeviceAccountMapping: "INCLUDED_FINAL" as TxExecutionStatus,
  linkDeviceDeleteKey: "INCLUDED_FINAL" as TxExecutionStatus,
   linkDeviceRegistration: "FINAL" as TxExecutionStatus,
  // See default finality settings:
  // https://github.com/near/near-api-js/blob/99f34864317725467a097dc3c7a3cc5f7a5b43d4/packages/accounts/src/account.ts#L68
}

// Transaction and Signature types - defined as TypeScript interfaces since they're handled as JSON
export interface TransactionStruct {
  signerAccount: string;
  publicKey: {
    keyType: number;
    keyData: number[];
  };
  nonce: number;
  receiverAccount: string;
  blockHash: number[];
  actions: any[]; // Actions are complex, handled as JSON
}

export interface SignatureStruct {
  keyType: number;
  signatureData: number[];
}

export interface NearRpcCallParams {
  jsonrpc: string;
  id: string;
  method: string;
  params: {
    signed_tx_base64: string;
    wait_until: TxExecutionStatus;
  }
}

export interface TransactionContext {
  nearPublicKeyStr: string;
  accessKeyInfo: AccessKeyView;
  nextNonce: string;
  txBlockHeight: string;
  txBlockHash: string;
}

export interface BlockInfo {
  header: {
    hash: string;
    height: number;
  };
}
export interface RpcErrorData {
  // NEAR error payloads vary; keep flexible but preserve common fields
  // Top-level helper message if present
  message?: string;
  // Anything else from the node (TxExecutionError, ActionError, etc.)
  [key: string]: any;
}

export interface RpcError {
  code?: number;
  name?: string;
  data?: RpcErrorData;
  message?: string;
}

export interface RpcResponse {
  error?: RpcError;
  result?: any;
}
