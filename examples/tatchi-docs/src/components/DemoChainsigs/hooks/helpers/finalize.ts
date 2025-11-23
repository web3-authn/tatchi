import * as viem from 'viem';
import type { PublicClient, TransactionSerializableEIP1559 } from 'viem';
import type { RSVSignature } from './parseMpcSignature';
import { normalizeRsvToAdapter } from './evm';
import type { EVMUnsignedTransaction } from './types';

export async function finalizeViaViem(
  publicClient: PublicClient,
  unsigned: TransactionSerializableEIP1559,
  rsvSignatures: RSVSignature[],
): Promise<{ txHashResp: unknown; v?: number }> {
  let last: unknown = null;
  for (const cand of rsvSignatures) {
    try {
      // helpful debug, mirrors existing behavior
      console.debug('[chainsigs] viem adaptor: serialize+send start (v=%s)', cand.v);
      const rawSigned = viem.serializeTransaction(unsigned, { r: cand.r, s: cand.s, v: BigInt(cand.v) });
      const txHashResp = await publicClient.sendRawTransaction({ serializedTransaction: rawSigned });
      return { txHashResp, v: cand.v };
    } catch (e) {
      last = e;
      console.warn('[chainsigs] viem: serialize/send failed (v=%s) err=%o', cand.v, e);
    }
  }
  throw last ?? new Error('All viem finalize attempts failed');
}

export async function finalizeViaAdapter(
  evm: any,
  unsigned: EVMUnsignedTransaction,
  rsvSignatures: RSVSignature[],
): Promise<{ txHashResp: unknown; v?: number }> {
  let last: unknown = null;
  for (const cand of rsvSignatures) {
    try {
      console.debug('[chainsigs] adapter: finalize start (v=%s)', cand.v);
      const normalized = normalizeRsvToAdapter(cand);
      const raw = await evm.finalizeTransactionSigning({
        transaction: unsigned,
        rsvSignatures: [normalized],
      });
      const txHashResp = await evm.broadcastTx(raw);
      return { txHashResp, v: cand.v };
    } catch (e) {
      last = e;
      console.warn('[chainsigs] adapter: finalize/broadcast failed (v=%s) err=%o', cand.v, e);
    }
  }
  throw last ?? new Error('All adapter finalize attempts failed');
}
