import React, { useCallback, useState } from 'react';
import { toast } from 'sonner';
import * as viem from 'viem';
import type { TransactionSerializableEIP1559 } from 'viem';
import { useTatchi, ActionPhase, ActionType, TxExecutionStatus } from '@tatchi-xyz/sdk/react';
import { createEvmAdapter, deriveEvmAddress } from './helpers/adapters';
// no direct RSVSignature use here; types handled in helpers
import { NEAR_EXPLORER_BASE_URL } from '../../../types';
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
  renderExplorerLink,
  toUserFriendlyNearErrorFromOutcome,
} from './helpers/near';
import type { EVMUnsignedTransaction } from './helpers/types';
import { finalizeViaAdapter, finalizeViaViem } from './helpers/finalize';
import { toUserFriendlyViemError } from './helpers/errors';

export type { EVMUnsignedTransaction };

export function useMpcEvmFlow() {

  const {
    loginState: { isLoggedIn, nearAccountId },
    tatchi
  } = useTatchi();

  const [isWorking, setIsWorking] = useState(false);

  const signAndSendErc20Transfer = useCallback(async (args: {
    tokenAddress: string;
    to: string;                 // recipient EVM address (e.g., depositAddress)
    amountUnits: string;        // amount in token smallest units (string BigInt)
    chainId: number;
    rpcOverride?: string;
    contractId: string;         // NEAR MPC contract
    path: string;               // e.g., 'ethereum-1'
    onDerivedAddress?: (from: Hex) => void;
    onTxHash?: (hash: string) => void;
    toastExplorerLink?: boolean;
  }) => {
    if (!isLoggedIn || !nearAccountId) return;
    const { tokenAddress, to, amountUnits, chainId, rpcOverride, contractId, path, onDerivedAddress, onTxHash } = args;

    setIsWorking(true);
    toast.loading('Preparing ERC‑20 transfer for MPC signing…', { id: 'chainsig:erc20', description: '' });
    try {
      const token = ensure0x(tokenAddress.toLowerCase());
      const toAddr = ensure0x(to.toLowerCase());
      if (!isValidEvmAddress(token)) throw new Error('Invalid token address');
      if (!isValidEvmAddress(toAddr)) throw new Error('Invalid recipient address');

      const { evm, publicClient } = await createEvmAdapter({ chainId, contractId, rpcOverride });
      const fromAddr: Hex = await deriveEvmAddress(evm, nearAccountId, path);
      onDerivedAddress?.(fromAddr);

      // Optional: preflight balance check to avoid opaque estimateGas reverts
      let tokenDecimals = 6;
      try {
        tokenDecimals = Number(await (publicClient as any).readContract({
          address: token,
          abi: viem.parseAbi(['function decimals() view returns (uint8)']),
          functionName: 'decimals',
        })) || 6;
      } catch {}
      try {
        const bal = await (publicClient as any).readContract({
          address: token,
          abi: viem.parseAbi(['function balanceOf(address) view returns (uint256)']),
          functionName: 'balanceOf',
          args: [fromAddr],
        }) as bigint;
        const want = BigInt(amountUnits || '0');
        if (want <= 0n) throw new Error('Amount must be greater than 0');
        if (bal < want) {
          const fmt = (n: bigint) => {
            const s = n.toString();
            if (tokenDecimals <= 0) return s;
            const pad = s.padStart(tokenDecimals + 1, '0');
            const head = pad.slice(0, -tokenDecimals) || '0';
            const tail = pad.slice(-tokenDecimals).replace(/0+$/, '');
            return tail ? `${head}.${tail}` : head;
          };
          toast.error(`Insufficient token balance: have ${fmt(bal)} need ${fmt(want)}`, { id: 'chainsig:erc20', description: '' });
          return;
        }
      } catch (preErr) {
        // Non-fatal: proceed even if balance precheck fails (e.g., token without standard ABI)
      }

      // encode ERC‑20 transfer(address,uint256)
      const abi = viem.parseAbi(['function transfer(address to, uint256 value) returns (bool)']);
      const data = viem.encodeFunctionData({ abi, functionName: 'transfer', args: [toAddr, BigInt(amountUnits)] });

      const { transaction, hashesToSign } = await evm.prepareTransactionForSigning({
        from: fromAddr,
        to: token,
        value: 0n,
        data,
      });
      let unsignedTx = transaction;
      const signingHash: Hex = extractFirstSigningHash(hashesToSign);

      toast.message('Prepared ERC‑20 payload for MPC signing', {
        description: `chainId=${unsignedTx.chainId} token=${token}`,
      });

      toast.loading('Sending request to NEAR…', { id: 'chainsig:erc20', description: '' });
      const payloadHexNo0x = signingHash.slice(2);
      const result = await tatchi.executeAction({
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
          gas: '100000000000000',
          deposit: '1',
        },
        options: {
          onEvent: (event) => {
            switch (event.phase) {
              case ActionPhase.STEP_8_ACTION_COMPLETE:
                toast.success('MPC signature retrieved', { id: 'chainsig:erc20', description: '' });
                break;
              case ActionPhase.ACTION_ERROR:
              case ActionPhase.WASM_ERROR:
                toast.error(`MPC signing failed: ${event.error}`, { id: 'chainsig:erc20' });
                break;
              default:
                toast.loading(event.message, { id: 'chainsig:erc20', description: '' });
                break;
            }
          },
          waitUntil: TxExecutionStatus.EXECUTED_OPTIMISTIC,
        }
      });

      // Announce NEAR transaction id (contract call) if available
      const txIdErc20 = extractNearTransactionId(result);
      if (txIdErc20) {
        const showLink = !!args.toastExplorerLink;
        const description = showLink && NEAR_EXPLORER_BASE_URL
          ? renderExplorerLink(`${NEAR_EXPLORER_BASE_URL}/transactions/${txIdErc20}`)
          : '' as any;
        toast.success(`NEAR tx: ${txIdErc20}`, { id: 'chainsig:erc20:near', description });
      }

      const successValue = extractNearSuccessValue(result);
      if (!successValue) {
        const nearPretty = toUserFriendlyNearErrorFromOutcome(result);
        if (nearPretty) {
          toast.error(nearPretty.title, { id: 'chainsig:erc20', description: nearPretty.description as any });
          return;
        }
        const fallbackMsg = (result && typeof (result as any).error === 'string') ? (result as any).error : 'NEAR transaction did not return a SuccessValue.';
        throw new Error(fallbackMsg);
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
        toast.success(`Broadcasted EVM tx: ${txHash}`, { id: 'chainsig:erc20:evm', description });
        console.info(`[chainsigs] ERC‑20 ${source} finalize OK (v=%s, txHash=%s)`, String(v), txHash);
        return txHash;
      };

      const tryViemFinalize = async (): Promise<string> => {
        const viemUnsigned: TransactionSerializableEIP1559 = buildEip1559FromTransaction(unsignedTx, chainId, token);
        const { txHashResp, v } = await finalizeViaViem(publicClient, viemUnsigned, rsvSignatures);
        return announceBroadcast(txHashResp, 'viem', v);
      };

      const tryAdapterFinalize = async (): Promise<string> => {
        const txForFinalize: EVMUnsignedTransaction = toFinalizeUnsigned(unsignedTx, chainId, token);
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
          throw (err2 ?? err1);
        }
      }
    } catch (e: unknown) {
      const pretty = toUserFriendlyViemError(e, { chainId, asset: 'USDC' });
      toast.error(pretty.title, { id: 'chainsig:erc20', description: pretty.description as any });
    } finally {
      setIsWorking(false);
    }
  }, [isLoggedIn, nearAccountId, tatchi]);

  const signAndSendEvmTransfer = useCallback(async (args: {
    to: string;
    amountEth: string;
    chainId: number;
    rpcOverride?: string;
    contractId: string; // NEAR MPC contract
    path: string;       // e.g., 'ethereum-1'
    onDerivedAddress?: (from: Hex) => void;
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
      const fromAddr: Hex = await deriveEvmAddress(evm, nearAccountId, path);
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
      const result = await tatchi.executeAction({
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
              case ActionPhase.STEP_8_ACTION_COMPLETE:
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
        const nearPretty = toUserFriendlyNearErrorFromOutcome(result);
        if (nearPretty) {
          toast.error(nearPretty.title, { id: 'chainsig', description: nearPretty.description as any });
          return;
        }
        const fallbackMsg = (result && typeof (result as any).error === 'string') ? (result as any).error : 'NEAR transaction did not return a SuccessValue.';
        throw new Error(fallbackMsg);
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
          throw (err2 ?? err1);
        }
      }
    } catch (e: unknown) {
      const pretty = toUserFriendlyViemError(e, { chainId, asset: 'ETH', amountEth });
      toast.error(pretty.title, { id: 'chainsig', description: pretty.description as any });
    } finally {
      setIsWorking(false);
    }
  }, [isLoggedIn, nearAccountId, tatchi]);

  return { isWorking, signAndSendEvmTransfer, signAndSendErc20Transfer } as const;
}
