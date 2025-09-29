/**
 * Minimal NEAR RPC client that replaces @near-js/providers
 * Only includes the methods actually used by PasskeyManager
 *
 * If needed, we can just wrap @near-js if we require more complex
 * functionality and type definitions
 */

import type {
  FinalExecutionOutcome,
  QueryResponseKind,
  TxExecutionStatus,
  AccessKeyView,
  AccessKeyInfoView,
  AccessKeyList,
  FunctionCallPermissionView,
  AccountView,
  BlockResult,
  BlockReference,
  RpcQueryRequest,
  FinalityReference,
} from "@near-js/types";
import { base64Encode } from "../utils";
import { errorMessage } from "../utils/errors";
import { DEFAULT_WAIT_STATUS, RpcResponse } from "./types/rpc";
import { isFunction } from './WalletIframe/validation';
import {
  WasmTransaction,
  WasmSignature,
} from "../wasm_signer_worker/pkg/wasm_signer_worker.js";
// import { Provider } from "@near-js/providers";

// re-export near-js types
export type { AccessKeyList } from "@near-js/types";

// Type definitions for getAccessKeys function
export interface ViewAccountParams {
  account: string;
  block_id?: string;
}

export type FullAccessKey = Omit<AccessKeyInfoView, 'access_key'>
  & { access_key: Omit<AccessKeyView, 'permission'> & { permission: 'FullAccess' } }

export type FunctionCallAccessKey = Omit<AccessKeyInfoView, 'access_key'>
  & { access_key: Omit<AccessKeyView, 'permission'> & { permission: FunctionCallPermissionView } }

export interface ContractResult<T> extends QueryResponseKind {
  result?: T | string | number;
  logs: string[];
}

export enum RpcCallType {
  Query = "query",
  View = "view",
  Send = "send_tx",
  Block = "block",
  Call = "call_function",
}

export class SignedTransaction {
  transaction: WasmTransaction;
  signature: WasmSignature;
  borsh_bytes: number[];

  constructor(data: {
    transaction: WasmTransaction;
    signature: WasmSignature;
    borsh_bytes: number[]
  }) {
    this.transaction = data.transaction;
    this.signature = data.signature;
    this.borsh_bytes = data.borsh_bytes;
  }

  static fromPlain(input: { transaction: unknown; signature: unknown; borsh_bytes: number[] }): SignedTransaction {
    return new SignedTransaction({
      transaction: input.transaction as WasmTransaction,
      signature: input.signature as WasmSignature,
      borsh_bytes: input.borsh_bytes,
    });
  }

  encode(): ArrayBuffer {
    // If borsh_bytes are already available, use them
    return (new Uint8Array(this.borsh_bytes)).buffer;
  }

  base64Encode(): string {
    return base64Encode(this.encode());
  }

  static decode(bytes: Uint8Array): SignedTransaction {
    // This would need borsh deserialization
    throw new Error('SignedTransaction.decode(): borsh deserialization not implemented');
  }
}

/**
 * Serialize a signed transaction-like object to base64.
 * Accepts either our SignedTransaction instance or a plain object
 * with borsh bytes (borsh_bytes | borshBytes) from cross-origin RPC.
 */
type EncodableSignedTx =
  | SignedTransaction
  | { borsh_bytes?: number[]; borshBytes?: number[]; encode?: () => ArrayBuffer; base64Encode?: () => string };

export function encodeSignedTransactionBase64(signed: EncodableSignedTx): string {
  try {
    if (isFunction((signed as { base64Encode?: unknown }).base64Encode)) {
      return (signed as { base64Encode: () => string }).base64Encode();
    }
    if (isFunction((signed as { encode?: unknown }).encode)) {
      return base64Encode((signed as { encode: () => ArrayBuffer }).encode());
    }
    // Support both snake_case (borsh_bytes) and camelCase (borshBytes)
    const bytesSnake = (signed as { borsh_bytes?: number[] | Uint8Array }).borsh_bytes;
    if (Array.isArray(bytesSnake)) {
      return base64Encode(new Uint8Array(bytesSnake).buffer);
    }
    if (bytesSnake instanceof Uint8Array) {
      return base64Encode(bytesSnake.buffer);
    }
    const bytesCamel = (signed as { borshBytes?: number[] | Uint8Array }).borshBytes;
    if (Array.isArray(bytesCamel)) {
      return base64Encode(new Uint8Array(bytesCamel).buffer);
    }
    if (bytesCamel instanceof Uint8Array) {
      return base64Encode(bytesCamel.buffer);
    }
  } catch {
    // fall through
  }
  throw new Error('Invalid signed transaction payload: cannot serialize to base64');
}

/**
 * MinimalNearClient provides a simplified interface for NEAR protocol interactions
 */
export interface NearClient {
  viewAccessKey(accountId: string, publicKey: string, finalityQuery?: FinalityReference): Promise<AccessKeyView>;
  viewAccessKeyList(accountId: string, finalityQuery?: FinalityReference): Promise<AccessKeyList>;
  viewAccount(accountId: string): Promise<AccountView>;
  viewBlock(params: BlockReference): Promise<BlockResult>;
  sendTransaction(
    signedTransaction: SignedTransaction,
    waitUntil?: TxExecutionStatus
  ): Promise<FinalExecutionOutcome>;
  query<T extends QueryResponseKind>(params: RpcQueryRequest): Promise<T>;
  callFunction<A, T>(
    contractId: string,
    method: string,
    args: A,
    blockQuery?: BlockReference
  ): Promise<T>;
  view<A, T>(params: { account: string; method: string; args: A }): Promise<T>;
  getAccessKeys(params: ViewAccountParams): Promise<{
    fullAccessKeys: FullAccessKey[];
    functionCallAccessKeys: FunctionCallAccessKey[];
  }>;
}

export class MinimalNearClient implements NearClient {
  private readonly rpcUrls: string[];

  constructor(rpcUrl: string | string[]) {
    this.rpcUrls = MinimalNearClient.normalizeRpcUrls(rpcUrl);
  }

  private static normalizeRpcUrls(input: string | string[]): string[] {
    const urls = Array.isArray(input)
      ? input
      : input
          .split(/[\s,]+/)
          .map(url => url.trim())
          .filter(Boolean);

    const normalized = urls.map(url => {
      try {
        return new URL(url).toString();
      } catch (err) {
        const message = errorMessage(err) || `Invalid NEAR RPC URL: ${url}`;
        throw new Error(message);
      }
    });

    if (!normalized.length) {
      throw new Error('NEAR RPC URL cannot be empty');
    }

    return Array.from(new Set(normalized));
  }

  // ===========================
  // PRIVATE HELPER FUNCTIONS
  // ===========================

  /** Build a JSON-RPC 2.0 POST body (stringified). */
  private buildRequestBody<P>(method: string, params: P): string {
    return JSON.stringify({
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method,
      params
    });
  }

  /** Perform a single POST to one endpoint and return parsed RpcResponse. */
  private async postOnce(url: string, requestBody: string): Promise<RpcResponse> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody
    });

    if (!response.ok) {
      throw new Error(`RPC request failed: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    if (!text?.trim()) {
      throw new Error('Empty response from RPC server');
    }

    return JSON.parse(text) as RpcResponse;
  }

  /** Try each configured RPC endpoint in order and return the first successful RpcResponse. */
  private async requestWithFallback(requestBody: string): Promise<RpcResponse> {
    let lastError: unknown;
    for (const [index, url] of this.rpcUrls.entries()) {
      try {
        const result = await this.postOnce(url, requestBody);
        if (index > 0) console.warn(`[NearClient] RPC succeeded via fallback: ${url}`);
        return result;
      } catch (err) {
        lastError = err;
        const remaining = index < this.rpcUrls.length - 1;
        console.warn(`[NearClient] RPC call to ${url} failed${remaining ? ', trying next' : ''}: ${errorMessage(err) || 'RPC request failed'}`);
        if (!remaining) throw err instanceof Error ? err : new Error(String(err));
      }
    }
    throw new Error(errorMessage(lastError) || 'RPC request failed');
  }

  /** Validate and unwrap RpcResponse into the typed result. */
  private unwrapRpcResult<T>(rpc: RpcResponse, operationName: string): T {
    if (rpc.error) {
      const msg = rpc.error?.data?.message || rpc.error?.message || 'RPC error';
      throw new Error(msg);
    }
    const result = rpc.result as any;
    if (result?.error) {
      throw new Error(`${operationName} Error: ${result.error}`);
    }
    return rpc.result as T;
  }

  /**
   * Execute RPC call with proper error handling and result extraction
   */
  private async makeRpcCall<P, T>(
    method: string,
    params: P,
    operationName: string
  ): Promise<T> {
    const requestBody = this.buildRequestBody(method, params);
    const rpc = await this.requestWithFallback(requestBody);
    return this.unwrapRpcResult<T>(rpc, operationName);
  }

  // ===========================
  // PUBLIC API METHODS
  // ===========================

  async query<T extends QueryResponseKind>(params: RpcQueryRequest): Promise<T> {
    return this.makeRpcCall<RpcQueryRequest, T>(RpcCallType.Query, params, 'Query');
  }

  async viewAccessKey(accountId: string, publicKey: string, finalityQuery?: FinalityReference): Promise<AccessKeyView> {
    const publicKeyStr = publicKey;
    const finality = finalityQuery?.finality || 'final';
    const params = {
      request_type: 'view_access_key',
      finality: finality,
      account_id: accountId,
      public_key: publicKeyStr
    };
    return this.makeRpcCall<typeof params, AccessKeyView>(
      RpcCallType.Query,
      params,
      'View Access Key'
    );
  }

  async viewAccessKeyList(accountId: string, finalityQuery?: FinalityReference): Promise<AccessKeyList> {
    const finality = finalityQuery?.finality || 'final';
    const params = {
      request_type: 'view_access_key_list',
      finality: finality,
      account_id: accountId
    };
    return this.makeRpcCall<typeof params, AccessKeyList>(RpcCallType.Query, params, 'View Access Key List');
  }

  async viewAccount(accountId: string): Promise<AccountView> {
    const params = {
      request_type: 'view_account',
      finality: 'final',
      account_id: accountId
    };
    return this.makeRpcCall<typeof params, AccountView>(RpcCallType.Query, params, 'View Account');
  }

  async viewBlock(params: BlockReference): Promise<BlockResult> {
    return this.makeRpcCall<BlockReference, BlockResult>(RpcCallType.Block, params, 'View Block');
  }

  async sendTransaction(
    signedTransaction: SignedTransaction,
    waitUntil: TxExecutionStatus = DEFAULT_WAIT_STATUS.executeAction
  ): Promise<FinalExecutionOutcome> {
    const params = {
      signed_tx_base64: encodeSignedTransactionBase64(signedTransaction),
      wait_until: waitUntil
    };

    // Retry on transient RPC errors commonly seen with shared/public nodes
    const maxAttempts = 5;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.makeRpcCall<typeof params, FinalExecutionOutcome>(RpcCallType.Send, params, 'Send Transaction');
      } catch (err: unknown) {
        lastError = err;
        const msg = errorMessage(err);
        const retryable = /server error|internal|temporar|timeout|too many requests|429|unavailable|bad gateway|gateway timeout/i.test(msg || '');
        if (!retryable || attempt === maxAttempts) {
          throw err;
        }
        // Exponential backoff with jitter (200–1200ms approx across attempts)
        const base = 200 * Math.pow(2, attempt - 1);
        const jitter = Math.floor(Math.random() * 150);
        await new Promise(r => setTimeout(r, base + jitter));
      }
    }
    // Should be unreachable
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async callFunction<A, T>(
    contractId: string,
    method: string,
    args: A,
    blockQuery?: BlockReference
  ): Promise<T> {
    const rpcParams = {
      request_type: 'call_function',
      finality: 'final',
      account_id: contractId,
      method_name: method,
      args_base64: base64Encode(new TextEncoder().encode(JSON.stringify(args)).buffer)
    };
    const result = await this.makeRpcCall<typeof rpcParams, ContractResult<T>>(
      RpcCallType.Query,
      rpcParams,
      'View Function'
    );

    // Parse result bytes to string/JSON
    const resultBytes = result.result;

    if (!Array.isArray(resultBytes)) {
      // If result is not bytes array, it might already be parsed
      return result as unknown as T;
    }

    const resultString = String.fromCharCode(...resultBytes);

    if (!resultString.trim()) {
      return null as T;
    }

    try {
      const parsed = JSON.parse(resultString);
      return parsed as T;
    } catch (parseError) {
      console.warn('Failed to parse result as JSON, returning as string:', parseError);
      console.warn('Raw result string:', resultString);
      // Return the string value if it's not valid JSON
      const cleanString = resultString.replace(/^"|"$/g, ''); // Remove quotes
      return cleanString as T;
    }
  }

  async view<A, T>(params: { account: string; method: string; args: A }): Promise<T> {
    return this.callFunction<A, T>(params.account, params.method, params.args);
  }

  async getAccessKeys({ account, block_id }: ViewAccountParams): Promise<{
    fullAccessKeys: FullAccessKey[];
    functionCallAccessKeys: FunctionCallAccessKey[];
  }> {
    // Build RPC parameters similar to the official implementation
    const params: Record<string, unknown> = {
      request_type: 'view_access_key_list',
      account_id: account,
      finality: 'final'
    };

    // Add block_id if provided (for specific block queries)
    if (block_id) {
      params.block_id = block_id;
      delete params.finality; // block_id takes precedence over finality
    }

    // Make the RPC call directly to match the official implementation
    const accessKeyList = await this.makeRpcCall<typeof params, AccessKeyList>(
      RpcCallType.Query,
      params,
      'View Access Key List'
    );

    // Separate full access keys and function call access keys
    const fullAccessKeys: FullAccessKey[] = [];
    const functionCallAccessKeys: FunctionCallAccessKey[] = [];

    // Process each access key (matching the official categorization logic)
    for (const key of accessKeyList.keys) {
      if (key.access_key.permission === 'FullAccess') {
        // Full Access Keys: Keys with FullAccess permission
        fullAccessKeys.push(key as FullAccessKey);
      } else if (key.access_key.permission && typeof key.access_key.permission === 'object' && 'FunctionCall' in key.access_key.permission) {
        // Function Call Keys: Keys with limited permissions for specific contract calls
        functionCallAccessKeys.push(key as FunctionCallAccessKey);
      }
    }

    return {
      fullAccessKeys,
      functionCallAccessKeys
    };
  }
}

// errorMessage moved to utils/errors
