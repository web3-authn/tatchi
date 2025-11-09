import { RpcResponse } from './types/rpc';

type NearRpcErrorType = 'InvalidTxError' | 'ActionError' | 'TxExecutionError' | 'RpcError' | 'Failure' | 'Unknown';

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function firstKey(o: Record<string, unknown> | undefined): string | undefined {
  if (!o) return undefined;
  const keys = Object.keys(o);
  return keys.length ? keys[0] : undefined;
}

export class NearRpcError extends Error {
  code?: number;
  type: NearRpcErrorType;
  kind?: string;
  index?: number;
  short: string;
  details?: unknown;
  operation?: string;

  constructor(params: {
    message: string;
    short: string;
    type?: NearRpcErrorType;
    kind?: string;
    index?: number;
    code?: number;
    name?: string;
    operation?: string;
    details?: unknown;
  }) {
    super(params.message);
    this.name = params.name || 'NearRpcError';
    this.code = params.code;
    this.type = params.type || 'Unknown';
    this.kind = params.kind;
    this.index = params.index;
    this.short = params.short;
    this.details = params.details;
    this.operation = params.operation;
  }

  static fromRpcResponse(operationName: string, rpc: RpcResponse): NearRpcError {
    const err = rpc.error || {};
    const details = err.data as unknown;

    const { message, type, kind, index, short } = describeDetails(operationName, details);

    return new NearRpcError({
      message: message || err.message || `${operationName} RPC error`,
      short: short || kind || 'RPC error',
      type: type || 'RpcError',
      kind,
      index,
      code: err.code,
      name: err.name || 'NearRpcError',
      operation: operationName,
      details,
    });
  }

  static fromOutcome(operationName: string, outcome: any, failure: any): NearRpcError {
    const { message, type, kind, index, short } = describeFailure(operationName, failure);
    return new NearRpcError({
      message: message || `${operationName} failed`,
      short: short || kind || 'TxExecutionError',
      type: type || 'Failure',
      kind,
      index,
      name: 'TxExecutionFailure',
      operation: operationName,
      details: { Failure: failure, outcome },
    });
  }
}

function describeDetails(operationName: string, details: unknown): {
  message: string;
  type?: NearRpcErrorType;
  kind?: string;
  index?: number;
  short?: string;
} {
  const d = isObj(details) ? details : undefined;
  const txExec = isObj(d?.TxExecutionError) ? (d!.TxExecutionError as Record<string, unknown>) : undefined;
  if (!txExec) {
    const dataStr = d ? ` Details: ${JSON.stringify(d)}` : '';
    return { message: `${operationName} RPC error.${dataStr}` };
  }
  return describeTxExecution(operationName, txExec);
}

function describeFailure(operationName: string, failure: any): {
  message: string;
  type?: NearRpcErrorType;
  kind?: string;
  index?: number;
  short?: string;
} {
  const f = isObj(failure) ? (failure as Record<string, unknown>) : undefined;
  if (!f) {
    return { message: `${operationName} failed (Unknown Failure)` };
  }
  // Reuse TxExecutionError shape if available
  return describeTxExecution(operationName, f as Record<string, unknown>);
}

function describeTxExecution(operationName: string, exec: Record<string, unknown>): {
  message: string;
  type?: NearRpcErrorType;
  kind?: string;
  index?: number;
  short?: string;
} {
  // InvalidTxError
  if (isObj(exec.InvalidTxError)) {
    const inv = exec.InvalidTxError as Record<string, unknown>;
    let kind = firstKey(inv) || 'InvalidTxError';
    if (isObj(inv.ActionsValidation)) {
      kind = `ActionsValidation.${firstKey(inv.ActionsValidation as Record<string, unknown>)}`;
    }
    const short = kind.startsWith('ActionsValidation.')
      ? `InvalidTxError: ${kind.split('.')[1] || 'ActionsValidation'}`
      : `InvalidTxError: ${kind}`;
    return {
      message: `${operationName} failed (InvalidTxError: ${kind})`,
      type: 'InvalidTxError',
      kind,
      short,
    };
  }

  // ActionError
  if (isObj(exec.ActionError)) {
    const ae = exec.ActionError as Record<string, unknown>;
    const idx = typeof (ae.index as unknown) === 'number' ? (ae.index as number) : undefined;
    const kobj = isObj(ae.kind) ? (ae.kind as Record<string, unknown>) : undefined;
    const kind = firstKey(kobj) || 'ActionError';
    const idxStr = typeof idx === 'number' ? ` at action ${idx}` : '';
    const short = `ActionError: ${kind}`;
    return {
      message: `${operationName} failed${idxStr} (ActionError: ${kind})`,
      type: 'ActionError',
      kind,
      index: idx,
      short,
    };
  }

  // Fallback TxExecutionError without specifics
  return {
    message: `${operationName} failed (TxExecutionError)`,
    type: 'TxExecutionError',
    kind: 'TxExecutionError',
    short: 'TxExecutionError',
  };
}
