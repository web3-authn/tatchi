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

/**
 * Attempt to extract a human‑readable failure from a NEAR execution outcome
 * or an RPC error object returned by the provider.
 */
export function toUserFriendlyNearErrorFromOutcome(
  result: unknown
): { title: string; description?: string } | null {
  try {
    const fmtYocto = (yocto: string): string => {
      // format yoctoNEAR (1e-24) to NEAR with up to 5 decimals
      try {
        const NEG = yocto.startsWith('-');
        const s = NEG ? yocto.slice(1) : yocto;
        if (!/^[0-9]+$/.test(s)) return yocto;
        const pad = s.padStart(25, '0');
        const whole = pad.slice(0, -24).replace(/^0+/, '') || '0';
        let frac = pad.slice(-24).replace(/0+$/, '');
        if (frac.length > 5) frac = frac.slice(0, 5).replace(/0+$/, '');
        const out = frac ? `${whole}.${frac}` : whole;
        return NEG ? `-${out}` : out;
      } catch {
        return yocto;
      }
    };

    const pickFailure = (container: any): any | undefined => {
      if (!container || typeof container !== 'object') return undefined;
      const status = container.status ?? container?.outcome?.status;
      if (status && typeof status === 'object' && 'Failure' in status) return (status as any).Failure;
      return undefined;
    };

    // 1) Try FinalExecutionOutcome‑like shape
    if (isRecord(result)) {
      const resObj: any = result;
      const top = isRecord(resObj.result) ? (resObj.result as any) : resObj;
      let failure = pickFailure(top);
      if (!failure && Array.isArray(top?.receipts_outcome)) {
        for (const r of top.receipts_outcome) {
          failure = pickFailure(r);
          if (failure) break;
        }
      }

      if (failure) {
        // InvalidTxError.NotEnoughBalance
        const notEnough = failure?.InvalidTxError?.NotEnoughBalance
          || failure?.NotEnoughBalance
          || failure?.ActionError?.kind?.NotEnoughBalance; // various shapes
        if (notEnough && typeof notEnough === 'object') {
          const balance = String((notEnough as any).balance ?? '0');
          const cost = String((notEnough as any).cost ?? '0');
          const haveNear = fmtYocto(balance);
          const needNear = fmtYocto(cost);
          return {
            title: 'NotEnoughBalance',
            description: `balance: ${balance} (≈ ${haveNear} NEAR), cost: ${cost} (≈ ${needNear} NEAR)`,
          };
        }

        // FunctionCallError.ExecutionError message
        const execErr = failure?.ActionError?.kind?.FunctionCallError?.ExecutionError;
        if (typeof execErr === 'string') {
          return { title: 'Contract execution failed.', description: execErr };
        }

        // Fallback to JSON of failure kind
        const kind = failure?.ActionError?.kind || failure?.InvalidTxError || failure?.TxExecutionError || failure;
        return { title: 'Transaction failed on NEAR.', description: JSON.stringify(kind) };
      }

    // 2) Try RPC error passthrough shape (name/cause/data)
    //    Prefer structured details returned by SDK ActionResult.errorDetails
    const err = (resObj as any).errorDetails ?? (resObj as any).error;
    if (isRecord(err)) {
      // NotEnoughBalance under data.TxExecutionError.InvalidTxError.NotEnoughBalance
      const ne = (err as any)?.data?.TxExecutionError?.InvalidTxError?.NotEnoughBalance;
      if (ne && typeof ne === 'object') {
        const balance = String((ne as any).balance ?? '0');
        const cost = String((ne as any).cost ?? '0');
        return {
          title: 'NotEnoughBalance',
          description: `balance: ${balance} (≈ ${fmtYocto(balance)} NEAR), cost: ${cost} (≈ ${fmtYocto(cost)} NEAR)`,
        };
      }
      // Some providers use data.Failure
      const ne2 = (err as any)?.data?.Failure?.NotEnoughBalance
        || (err as any)?.data?.Failure?.InvalidTxError?.NotEnoughBalance;
      if (ne2 && typeof ne2 === 'object') {
        const balance = String((ne2 as any).balance ?? '0');
        const cost = String((ne2 as any).cost ?? '0');
        return {
          title: 'NotEnoughBalance',
          description: `balance: ${balance} (≈ ${fmtYocto(balance)} NEAR), cost: ${cost} (≈ ${fmtYocto(cost)} NEAR)`,
        };
      }
      const name = (err as any).name || (err as any).code || 'NEAR RPC error';
      return { title: String(name), description: JSON.stringify(err) };
    }
    // If errorDetails was a string, surface it directly
    if (typeof ((resObj as any).errorDetails) === 'string') {
      const s = String((resObj as any).errorDetails);
      if (/NotEnoughBalance/i.test(s)) {
        return { title: 'Not enough NEAR to cover transaction cost.', description: s };
      }
      return { title: 'NEAR RPC error', description: s };
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
