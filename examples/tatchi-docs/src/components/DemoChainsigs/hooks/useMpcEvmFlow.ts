import React, { useCallback, useState } from 'react';
import { toast } from 'sonner';
import * as viem from 'viem';
import type { TransactionSerializableEIP1559 } from 'viem';
import { usePasskeyContext, ActionPhase, ActionType, TxExecutionStatus } from '@tatchi-xyz/sdk/react';
import { createEvmAdapter, deriveEvmAddress } from './helpers/adapters';
// no direct RSVSignature use here; types handled in helpers
import { NEAR_EXPLORER_BASE_URL } from '../../../config';
import {
  Hex,
  ensure0x,
  isValidEvmAddress,
  coerceTxHash,
  buildEip1559FromTransaction,
  extractFirstSigningHash,
  buildExplorerTxUrl,
  toFinalizeUnsigned,
} from './helpers/evm';
import {
  decodeMpcRsvFromSuccessValue,
  extractNearSuccessValue,
  extractNearTransactionId,
  renderExplorerLink
} from './helpers/near';
import type { EVMUnsignedTransaction } from './helpers/types';
import { finalizeViaAdapter, finalizeViaViem } from './helpers/finalize';

export type { EVMUnsignedTransaction };

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
      const toAddr = ensure0x(to.toLowerCase());
      if (!isValidEvmAddress(toAddr)) throw new Error('Invalid recipient address');

      // RPC + adapter
      const { evm, publicClient } = await createEvmAdapter({ chainId, contractId, rpcOverride });

      // Derive EVM address
      const fromAddr = await deriveEvmAddress(evm, nearAccountId, path);
      onDerivedAddress?.(fromAddr);

      // Prepare unsigned tx + hash (via chainsig.js adapter only)
      const { transaction, hashesToSign } = await evm.prepareTransactionForSigning({
        from: fromAddr,
        to: toAddr,
        value: viem.parseEther(amountEth || '0'),
      });
      let unsignedTx = transaction;
      const signingHash: Hex = extractFirstSigningHash(hashesToSign);

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

      const txId = extractNearTransactionId(result);
      if (txId) {
        const showLink = !!args.toastExplorerLink;
        const description = showLink && NEAR_EXPLORER_BASE_URL
          ? renderExplorerLink(`${NEAR_EXPLORER_BASE_URL}/transactions/${txId}`)
          : '' as any;
        toast.success(`NEAR tx: ${txId}`, { id: 'chainsig:near', description });
      }

      const successValue = extractNearSuccessValue(result);

      if (!successValue) {
        throw new Error('No SuccessValue in result');
      }
      const rsvSignatures = decodeMpcRsvFromSuccessValue(successValue);

      const announceBroadcast = (
        txHashResp: unknown,
        source: 'viem' | 'adapter',
        v?: number,
      ) => {
        const txHash = coerceTxHash(txHashResp) || String(txHashResp);
        onTxHash?.(txHash);
        const showLink = !!args.toastExplorerLink;
        const url = showLink ? buildExplorerTxUrl(chainId, txHash) : null;
        const description = url ? renderExplorerLink(url) : '' as any;
        toast.success(`Broadcasted EVM tx: ${txHash}`, { id: 'chainsig:evm', description });
        const verb = source === 'viem' ? 'serialize+send' : 'finalize+broadcast';
        console.info(`[chainsigs] ${source}: ${verb} OK (v=%s, txHash=%s)`, String(v), txHash);
        return txHash;
      };

      const tryViemFinalize = async (): Promise<string> => {
        const viemUnsigned: TransactionSerializableEIP1559 = buildEip1559FromTransaction(unsignedTx, chainId, toAddr);
        const { txHashResp, v } = await finalizeViaViem(publicClient, viemUnsigned, rsvSignatures);
        return announceBroadcast(txHashResp, 'viem', v);
      };

      const tryAdapterFinalize = async (): Promise<string> => {
        const txForFinalize: EVMUnsignedTransaction = toFinalizeUnsigned(unsignedTx, chainId, toAddr);
        const { txHashResp, v } = await finalizeViaAdapter(evm as any, txForFinalize, rsvSignatures);
        return announceBroadcast(txHashResp, 'adapter', v);
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
