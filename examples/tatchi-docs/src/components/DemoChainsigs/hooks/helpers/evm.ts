import type { AccessList, TransactionRequest, TransactionSerializableEIP1559 } from 'viem';
import * as viem from 'viem';
import { explorerTxBaseForChainId } from './faucetLinks';
import type { EVMUnsignedTransaction } from './types';
import type { Hex as HexType, RSVSignature } from './parseMpcSignature';

export type Hex = HexType;

export function ensure0x(s: string): Hex {
  return (s.startsWith('0x') ? s : `0x${s}`) as Hex;
}

export function isValidEvmAddress(addr: string): boolean {
  const a = ensure0x(addr.toLowerCase());
  return /^0x[0-9a-fA-F]{40}$/.test(a);
}

export function lowercaseHex<T extends string>(hexish: T): T {
  return (hexish.startsWith('0x') ? (`0x${hexish.slice(2).toLowerCase()}`) : (`0x${hexish.toLowerCase()}`)) as T;
}

export function coerceNumber(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return fallback;
}

export function coerceBigInt(v: unknown, fallback: bigint): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(v);
  if (typeof v === 'string' && v.trim() !== '') return BigInt(v);
  return fallback;
}

export function coerceTxHash(x: unknown): string | null {
  if (typeof x === 'string') return x;
  if (x && typeof x === 'object') {
    const obj = x as Record<string, unknown> & { toString?: () => string };
    const cand = (obj as any).hash ?? (obj as any).transactionHash ?? (obj as any).txHash ?? (obj as any).result;
    if (typeof cand === 'string') return cand;
    if (typeof obj.toString === 'function') {
      const s = obj.toString();
      if (typeof s === 'string' && s.startsWith('0x') && s.length > 2) return s;
    }
  }
  return null;
}

export function normalizeRsvToAdapter(sig: RSVSignature): { r: string; s: string; v: number } {
  return {
    r: sig.r.startsWith('0x') ? sig.r.slice(2) : sig.r,
    s: sig.s.startsWith('0x') ? sig.s.slice(2) : sig.s,
    v: sig.v === 0 || sig.v === 1 ? sig.v + 27 : sig.v,
  };
}

export function buildEip1559FromTransaction(
  unsigned: EVMUnsignedTransaction,
  chainId: number,
  defaultTo: Hex,
): TransactionSerializableEIP1559 {
  return {
    chainId: coerceNumber(unsigned.chainId, chainId),
    nonce: coerceNumber(unsigned.nonce, 0),
    to: (unsigned.to || defaultTo) as Hex,
    gas: coerceBigInt(unsigned.gas, 21000n),
    maxFeePerGas: coerceBigInt(unsigned.maxFeePerGas, 0n),
    maxPriorityFeePerGas: coerceBigInt(unsigned.maxPriorityFeePerGas, 0n),
    value: coerceBigInt(unsigned.value, 0n),
    data: (unsigned.data ?? '0x') as Hex,
    accessList: (Array.isArray(unsigned.accessList) ? unsigned.accessList : []) as AccessList,
    type: 'eip1559',
  } as const;
}

export function extractFirstSigningHash(hashesToSign: unknown): Hex {
  const first = Array.isArray(hashesToSign) ? (hashesToSign as any[])[0] : (hashesToSign as any)?.[0] ?? hashesToSign;
  if (!first) throw new Error('No payload to sign returned by adapter');
  if (first instanceof Uint8Array) return viem.bytesToHex(first) as Hex;
  if (Array.isArray(first)) return viem.bytesToHex(Uint8Array.from(first as number[])) as Hex;
  throw new Error('Unsupported hash payload type');
}

export function buildExplorerTxUrl(chainId: number, txHash: string): string | null {
  const base = explorerTxBaseForChainId(chainId);
  if (!base) return null;
  return `${base}${txHash}`;
}

export function toFinalizeUnsigned(
  unsigned: EVMUnsignedTransaction,
  chainId: number,
  defaultTo: Hex,
): EVMUnsignedTransaction {
  return {
    ...unsigned,
    chainId: coerceNumber(unsigned.chainId, chainId),
    nonce: coerceNumber(unsigned.nonce, 0),
    to: (unsigned.to || defaultTo) as Hex,
    gas: coerceBigInt(unsigned.gas, 21000n),
    maxFeePerGas: coerceBigInt(unsigned.maxFeePerGas, 0n),
    maxPriorityFeePerGas: coerceBigInt(unsigned.maxPriorityFeePerGas, 0n),
    value: coerceBigInt(unsigned.value, 0n),
    data: (unsigned.data ?? '0x') as Hex,
    accessList: Array.isArray(unsigned.accessList) ? unsigned.accessList : [],
    type: 'eip1559',
  };
}
