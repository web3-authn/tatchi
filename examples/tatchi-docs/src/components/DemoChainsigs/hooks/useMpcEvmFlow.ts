import React, { useCallback, useState } from 'react';
import { toast } from 'sonner';
import * as viem from 'viem';
import type {
  TransactionSerializableEIP1559,
  AccessList,
  TransactionRequest,
} from 'viem';
import { chainAdapters, contracts } from 'chainsig.js';
import { usePasskeyContext, ActionPhase, ActionType, TxExecutionStatus } from '@tatchi-xyz/sdk/react';
import { chooseRpc } from './useEvmRpc';
import { parseMpcSignature } from '../../../utils/parseMpcSignature';
import type { RSVSignature } from '../../../utils/parseMpcSignature';
import { base64ToBytes, explorerTxBaseForChainId } from '../utils';
import { NEAR_EXPLORER_BASE_URL } from '../../../config';

type Hex = `0x${string}`;
const hex = (s: string) => (s.startsWith('0x') ? s : `0x${s}`) as Hex;

export type EVMUnsignedTransaction = TransactionRequest & {
    type: 'eip1559';
    chainId: number;
};

export function useMpcEvmFlow() {

  const {
    loginState: { isLoggedIn, nearAccountId },
    passkeyManager
  } = usePasskeyContext();

  const [isWorking, setIsWorking] = useState(false);

  const signAndSendEvmTransfer = useCallback(async (args: {
    to: string;
    amountEth: string;
    chainId: number;
    rpcOverride?: string;
    contractId: string; // NEAR MPC contract
    path: string;       // e.g., 'ethereum-1'
    onDerivedAddress?: (from: string) => void;
    onTxHash?: (hash: string) => void;
    toastExplorerLink?: boolean; // when true, success toast includes explorer link
  }) => {
    if (!isLoggedIn || !nearAccountId) return;
    const { to, amountEth, chainId, rpcOverride, contractId, path, onDerivedAddress, onTxHash } = args;

    setIsWorking(true);
    toast.loading('Preparing MPC signing request…', { id: 'chainsig', description: '' });
    try {
      const toAddr = hex(to.toLowerCase());
      if (!/^0x[0-9a-fA-F]{40}$/.test(toAddr)) throw new Error('Invalid recipient address');

      // RPC + adapter
      const rpcUrl = await chooseRpc(chainId, rpcOverride);
      const publicClient = viem.createPublicClient({ transport: viem.http(rpcUrl, { timeout: 20000 }) });
      const contract = new contracts.ChainSignatureContract({ networkId: 'testnet', contractId });
      const evm = new chainAdapters.evm.EVM({ publicClient, contract });

      // Derive EVM address
      const { address } = await evm.deriveAddressAndPublicKey(nearAccountId, path);
      const fromAddr = hex(address.toLowerCase());
      onDerivedAddress?.(fromAddr);

      // Prepare unsigned tx + hash (via chainsig.js adapter only)
      let signingHash: Hex;
      const { transaction, hashesToSign } = await evm.prepareTransactionForSigning({
        from: fromAddr,
        to: toAddr,
        value: viem.parseEther(amountEth || '0'),
      });
      let unsignedTx = transaction;

      const first = hashesToSign?.[0];
      if (!first) {
        throw new Error('No payload to sign returned by adapter');
      }
      if (first instanceof Uint8Array) {
        signingHash = viem.bytesToHex(first) as Hex;
      } else if (Array.isArray(first)) {
        signingHash = viem.bytesToHex(Uint8Array.from(first as number[])) as Hex;
      } else {
        throw new Error('Unsupported hash payload type');
      }

      toast.message('Prepared EVM payload for MPC signing', {
        description: `chainId=${unsignedTx.chainId} to=${unsignedTx.to}`,
      });

      toast.loading('Sending request to NEAR…', { id: 'chainsig', description: '' });
      const payloadHexNo0x = signingHash.slice(2);
      const result = await passkeyManager.executeAction({
        nearAccountId,
        receiverId: contractId,
        actionArgs: {
          type: ActionType.FunctionCall,
          methodName: 'sign',
          args: {
            request: {
              payload_v2: { Ecdsa: payloadHexNo0x },
              path,
              domain_id: 0,
            },
          },
          gas: '300000000000000',
          deposit: '1',
        },
        options: {
          onEvent: (event) => {
            switch (event.phase) {
              case ActionPhase.STEP_9_ACTION_COMPLETE:
                toast.success('MPC signature retrieved', { id: 'chainsig', description: '' });
                break;
              case ActionPhase.ACTION_ERROR:
              case ActionPhase.WASM_ERROR:
                toast.error(`MPC signing failed: ${event.error}`, { id: 'chainsig' });
                break;
              default:
                toast.loading(event.message, { id: 'chainsig', description: '' });
                break;
            }
          },
          waitUntil: TxExecutionStatus.EXECUTED_OPTIMISTIC,
        }
      });

      const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';
      const txId = isObj(result) && typeof (result as Record<string, unknown>).transactionId === 'string'
        ? (result as Record<string, unknown>).transactionId as string
        : undefined;
      if (txId) {
        const showLink = !!args.toastExplorerLink;
        const description = showLink && NEAR_EXPLORER_BASE_URL
          ? React.createElement('a', { href: `${NEAR_EXPLORER_BASE_URL}/transactions/${txId}`, target: '_blank', rel: 'noreferrer' }, 'View on explorer')
          : '';
        toast.success(`NEAR tx: ${txId}`, { id: 'chainsig:near', description });
      }

      const successValue = (() => {
        try {
          if (!isObj(result)) return null;
          const resObj = result as Record<string, unknown>;
          const topStatus = isObj(resObj.result) ? (resObj.result as Record<string, unknown>).status : resObj.status;
          if (isObj(topStatus) && typeof (topStatus as Record<string, unknown>).SuccessValue === 'string') {
            return (topStatus as Record<string, unknown>).SuccessValue as string;
          }
          const receiptsArr = isObj(resObj.result) && Array.isArray((resObj.result as Record<string, unknown>).receipts_outcome)
            ? (resObj.result as Record<string, unknown>).receipts_outcome as unknown[]
            : (Array.isArray(resObj.receipts_outcome) ? resObj.receipts_outcome as unknown[] : []);
          for (const r of receiptsArr) {
            if (!isObj(r)) continue;
            const out = (r as Record<string, unknown>).outcome;
            const st = isObj(out) ? (out as Record<string, unknown>).status : undefined;
            if (isObj(st) && typeof (st as Record<string, unknown>).SuccessValue === 'string') {
              return (st as Record<string, unknown>).SuccessValue as string;
            }
          }
        } catch {}
        return null;
      })();

      if (!successValue) {
        throw new Error('No SuccessValue in result');
      }
      const decodedBytes = base64ToBytes(successValue);
      const rsvSignatures = parseMpcSignature(decodedBytes) || [];
      if (!rsvSignatures.length) throw new Error('Invalid MPC signature');


      const toBigInt = (v: unknown, fallback: bigint): bigint => {
        if (typeof v === 'bigint') return v;
        if (typeof v === 'number') return BigInt(v);
        if (typeof v === 'string' && v.trim() !== '') return BigInt(v);
        return fallback;
      };

      const coerceTxHash = (x: unknown): string | null => {
        if (typeof x === 'string') return x;
        if (x && typeof x === 'object') {
          const obj = x as Record<string, unknown>;
          const cand = obj.hash ?? obj.transactionHash ?? obj.txHash ?? obj.result;
          if (typeof cand === 'string') return cand;
          const toStr = (obj as { toString?: () => string }).toString;
          if (typeof toStr === 'function') {
            const s = toStr.call(obj);
            if (typeof s === 'string' && s.startsWith('0x') && s.length > 2) return s;
          }
        }
        return null;
      };

      const toNumber = (v: unknown, fallback: number): number => {
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'bigint') return Number(v);
        if (typeof v === 'string' && v.trim() !== '') return Number(v);
        return fallback;
      };

      const announceBroadcast = (
        txHashResp: unknown,
        source: 'viem' | 'adapter',
        v?: number,
      ) => {
        const txHash = coerceTxHash(txHashResp) || String(txHashResp);
        onTxHash?.(txHash);
        const showLink = !!args.toastExplorerLink;
        const base = explorerTxBaseForChainId(chainId);
        const description = showLink && base && txHash
          ? React.createElement('a', { href: `${base}${txHash}`, target: '_blank', rel: 'noreferrer' }, 'View on explorer')
          : '';
        toast.success(`Broadcasted EVM tx: ${txHash}`, { id: 'chainsig:evm', description });
        const verb = source === 'viem' ? 'serialize+send' : 'finalize+broadcast';
        console.info(`[chainsigs] ${source}: ${verb} OK (v=%s, txHash=%s)`, String(v), txHash);
        return txHash;
      };

      const tryViemFinalize = async (): Promise<string> => {
        // viem serialize + send for each v candidate (27/28)
        const viemUnsigned: TransactionSerializableEIP1559 = {
          chainId: toNumber(unsignedTx.chainId, chainId),
          nonce: toNumber(unsignedTx.nonce, 0),
          to: unsignedTx.to || toAddr,
          gas: toBigInt(unsignedTx.gas, 21000n),
          maxFeePerGas: toBigInt(unsignedTx.maxFeePerGas, 0n),
          maxPriorityFeePerGas: toBigInt(unsignedTx.maxPriorityFeePerGas, 0n),
          value: toBigInt(unsignedTx.value, 0n),
          data: unsignedTx.data ?? '0x',
          accessList: (Array.isArray(unsignedTx.accessList) ? unsignedTx.accessList : []) as AccessList,
          type: 'eip1559',
        } as const;
        let last: unknown = null;
        for (const cand of rsvSignatures) {
          try {
            console.debug('[chainsigs] viem adaptor: serialize+send start (v=%s)', cand.v);
            const rawSigned = viem.serializeTransaction(viemUnsigned, { r: cand.r, s: cand.s, v: BigInt(cand.v) });
            const txHashResp = await publicClient.sendRawTransaction({ serializedTransaction: rawSigned });
            return announceBroadcast(txHashResp, 'viem', cand.v);
          } catch (e) {
            last = e;
            console.warn('[chainsigs] viem: serialize/send failed (v=%s) err=%o', cand.v, e);
          }
        }
        throw last ?? new Error('All viem finalize attempts failed');
      };

      const toAdapterRSV = (sig: RSVSignature) => ({
        r: sig.r.startsWith('0x') ? sig.r.slice(2) : sig.r,
        s: sig.s.startsWith('0x') ? sig.s.slice(2) : sig.s,
        v: sig.v === 0 || sig.v === 1 ? sig.v + 27 : sig.v,
      });

      const tryAdapterFinalize = async (): Promise<string> => {
        // adapter finalize + broadcast for each v candidate, with normalized RSV
        let last: unknown = null;
        for (const cand of rsvSignatures) {
          try {
            console.debug('[chainsigs] adapter: finalize start (v=%s)', cand.v);
            const normalized = toAdapterRSV(cand);
            const txForFinalize: EVMUnsignedTransaction = {
              ...unsignedTx,
              chainId: toNumber(unsignedTx.chainId, chainId),
              nonce: toNumber(unsignedTx.nonce, 0),
              to: unsignedTx.to || toAddr,
              gas: toBigInt(unsignedTx.gas, 21000n),
              maxFeePerGas: toBigInt(unsignedTx.maxFeePerGas, 0n),
              maxPriorityFeePerGas: toBigInt(unsignedTx.maxPriorityFeePerGas, 0n),
              value: toBigInt(unsignedTx.value, 0n),
              data: unsignedTx.data ?? '0x',
              accessList: Array.isArray(unsignedTx.accessList) ? unsignedTx.accessList : [],
              type: 'eip1559',
            };
            const raw = await evm.finalizeTransactionSigning({
              transaction: txForFinalize,
              rsvSignatures: [normalized],
            });
            const txHashResp = await evm.broadcastTx(raw);
            return announceBroadcast(txHashResp, 'adapter', cand.v);
          } catch (e) {
            last = e;
            console.warn('[chainsigs] adapter: finalize/broadcast failed (v=%s) err=%o', cand.v, e);
          }
        }
        throw last ?? new Error('All adapter finalize attempts failed');
      };

      try {
        await tryAdapterFinalize();
        return; // success
      } catch (err1) {
        try {
          await tryViemFinalize();
          return; // success
        } catch (err2) {
          const err = (err2 ?? err1);
          const msg = (err instanceof Error ? err.message : String(err)) || 'Finalize/broadcast failed';
          const insufficient = /insufficient funds|fee|underpriced|base fee/i.test(msg);
          toast.error(insufficient ? 'Broadcast failed: insufficient funds. Fund the derived address and retry.' : `Broadcast failed: ${msg}`, { id: 'chainsig', description: '' });
          throw err instanceof Error ? err : new Error(String(err));
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
      toast.error(msg, { id: 'chainsig', description: '' });
    } finally {
      setIsWorking(false);
    }
  }, [isLoggedIn, nearAccountId, passkeyManager]);

  return { isWorking, signAndSendEvmTransfer } as const;
}
