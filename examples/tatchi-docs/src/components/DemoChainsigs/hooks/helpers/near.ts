import React from 'react';
import { parseMpcSignature } from './parseMpcSignature';
import type { RSVSignature } from './parseMpcSignature';

export function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function extractNearTransactionId(result: unknown): string | undefined {
  if (!isRecord(result)) return undefined;
  const txId = (result as any).transactionId;
  if (typeof txId === 'string') return txId;
  return undefined;
}

export function extractNearSuccessValue(result: unknown): string | null {
  try {
    if (!isRecord(result)) return null;
    const resObj = result as Record<string, unknown>;
    const topStatus = isRecord(resObj.result) ? (resObj.result as Record<string, unknown>).status : resObj.status;
    if (isRecord(topStatus) && typeof (topStatus as any).SuccessValue === 'string') {
      return (topStatus as any).SuccessValue as string;
    }
    const receiptsArr = isRecord(resObj.result) && Array.isArray((resObj.result as any).receipts_outcome)
      ? ((resObj.result as any).receipts_outcome as unknown[])
      : (Array.isArray((resObj as any).receipts_outcome) ? ((resObj as any).receipts_outcome as unknown[]) : []);
    for (const r of receiptsArr) {
      if (!isRecord(r)) continue;
      const out = (r as any).outcome;
      const st = isRecord(out) ? (out as any).status : undefined;
      if (isRecord(st) && typeof (st as any).SuccessValue === 'string') {
        return (st as any).SuccessValue as string;
      }
    }
  } catch {}
  return null;
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const Buf: any = (globalThis as any).Buffer;
  if (Buf && typeof Buf.from === 'function') {
    return new Uint8Array(Buf.from(b64, 'base64'));
  }
  throw new Error('No base64 decoder available in this environment');
}

export function decodeMpcRsvFromSuccessValue(successValueB64: string): RSVSignature[] {
  const decodedBytes = base64ToBytes(successValueB64);
  const rsvSignatures = parseMpcSignature(decodedBytes) || [];
  if (!rsvSignatures.length) throw new Error('Invalid MPC signature');
  return rsvSignatures;
}

export function renderExplorerLink(url: string): React.ReactElement {
  return React.createElement('a', { href: url, target: '_blank', rel: 'noreferrer' }, 'View on explorer');
}

