import React, { useCallback, useMemo, useState } from 'react';
import * as viem from 'viem';
import * as chainsig from 'chainsig.js';
import { toast } from 'sonner';
import { LoadingButton } from './LoadingButton';

import {
  ActionPhase,
  ActionStatus,
  ActionType,
  TxExecutionStatus,
  usePasskeyContext,
} from '@tatchi-xyz/sdk/react';

import { chainAdapters, contracts } from "chainsig.js";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";


type Hex = `0x${string}`;

function sanitizeHex(input: string): Hex {
  const h = input.startsWith('0x') ? input : `0x${input}`;
  return h.toLowerCase() as Hex;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function extractSuccessValue(outcome: any): string | null {
  try {
    const sv = outcome?.result?.status?.SuccessValue || outcome?.status?.SuccessValue;
    if (sv) return sv as string;
    const receipts = outcome?.result?.receipts_outcome || outcome?.receipts_outcome || [];
    for (const r of receipts) {
      const s = r?.outcome?.status?.SuccessValue;
      if (s) return s as string;
    }
  } catch {}
  return null;
}

function rpcForChainId(chainId: number): string | null {
  switch (chainId) {
    case 11155111: // Ethereum Sepolia
      return 'https://sepolia.drpc.org';
    case 84532: // Base Sepolia
      return 'https://base-sepolia.drpc.org';
    case 80002: // Polygon Amoy
      return 'https://rpc-amoy.polygon.technology';
    case 43113: // Avalanche Fuji
      return 'https://api.avax-test.network/ext/bc/C/rpc';
    case 97: // BSC testnet
      return 'https://data-seed-prebsc-1-s1.binance.org:8545/';
    case 421614: // Arbitrum Sepolia
      return 'https://sepolia-rollup.arbitrum.io/rpc';
    default:
      return null;
  }
}

export const DemoChainsigs: React.FC = () => {
  const {
    loginState: { isLoggedIn, nearAccountId },
    passkeyManager,
  } = usePasskeyContext();

  const [isWorking, setIsWorking] = useState(false);

  // EVM tx inputs (simple EIP-1559 transfer)
  const [chainId, setChainId] = useState<string>('11155111'); // Sepolia default
  const [to, setTo] = useState<string>('0x8454d149Beb26E3E3FC5eD1C87Fb0B2a1b7B6c2c');
  const [amountEth, setAmountEth] = useState<string>('0.01');
  const [maxFeePerGasGwei, setMaxFeePerGasGwei] = useState<string>('5');
  const [maxPriorityFeePerGasGwei, setMaxPriorityFeePerGasGwei] = useState<string>('1');
  const [gasLimit, setGasLimit] = useState<string>('21000');
  const [nonce, setNonce] = useState<string>('');

  // MPC parameters
  const [mpcContractId, setMpcContractId] = useState<string>('v1.signer-prod.testnet');
  const [path, setPath] = useState<string>('ethereum-1');
  const [keyVersion, setKeyVersion] = useState<string>('0');

  const chainIdNum = useMemo(() => {
    const n = Number(chainId);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [chainId]);

  // Amount conversions moved next to viem import for accuracy

  const handleSignViaMpc = useCallback(async () => {
    if (!isLoggedIn || !nearAccountId) return;
    if (!mpcContractId || !path || keyVersion.trim() === '') {
      toast.error('Configure MPC contract, path, and key_version');
      return;
    }

    setIsWorking(true);
    try {
      // Validate inputs we can check locally
      if (!chainIdNum) throw new Error('Invalid chainId');
      const toAddr = sanitizeHex(to);
      if (!to || !/^0x[0-9a-fA-F]{40}$/.test(toAddr)) throw new Error('Invalid recipient address');

      // Build adapter + public client
      const rpcUrl = rpcForChainId(chainIdNum);
      if (!rpcUrl) {
        toast.error(`Unsupported chainId ${chainIdNum}. Add an RPC mapping.`);
        setIsWorking(false);
        return;
      }
      const publicClient = viem.createPublicClient({ transport: viem.http(rpcUrl) });
      const { contracts, chainAdapters } = chainsig;
      const contract = new contracts.ChainSignatureContract({
        networkId: 'testnet',
        contractId: mpcContractId,
      });
      const evm = new chainAdapters.evm.EVM({ publicClient, contract });

      // Derive EVM address for preview and to use as from
      const { address } = await evm.deriveAddressAndPublicKey(nearAccountId, path);
      const fromAddr: Hex = sanitizeHex(address);

      // Prepare unsigned EVM tx and the hashes to sign
      const { transaction: unsignedTx, hashesToSign } = await evm.prepareTransactionForSigning({
        from: fromAddr,
        to: toAddr,
        value: viem.parseEther(amountEth || '0'),
      });
      const firstPayload = hashesToSign?.[0];
      if (!firstPayload) throw new Error('No payload to sign returned by adapter');
      const signingHash: Hex = (() => {
        if (typeof firstPayload === 'string') return sanitizeHex(firstPayload);
        if (firstPayload instanceof Uint8Array) return viem.bytesToHex(firstPayload) as Hex;
        if (Array.isArray(firstPayload)) return viem.bytesToHex(Uint8Array.from(firstPayload)) as Hex;
        throw new Error('Unsupported hash payload type');
      })();
      console.log('[Chainsigs] prepared via chainsig.js', { from: fromAddr, to: toAddr, signingHash });

      // Show a quick preview toast
      toast.message('Prepared EVM payload for MPC signing', {
        description: `chainId=${unsignedTx.chainId} to=${unsignedTx.to} value=${amountEth} ETH`,
      });

      // Request MPC signature by calling NEAR MPC contract
      // Domain: 0 for Ecdsa (EVM), 1 for Eddsa per chainsig.js
      const domain_id = 0;
      await passkeyManager.executeAction({
        nearAccountId,
        receiverId: mpcContractId,
        actionArgs: {
          type: ActionType.FunctionCall,
          methodName: 'sign',
          args: {
            // Match chainsig.js: request.payload_v2.{Ecdsa|Eddsa}: 0x-hex
            request: {
              payload_v2: { Ecdsa: signingHash },
              path,
              domain_id,
            },
          },
          // Use conservative gas like the legacy flow (150 Tgas)
          gas: '150000000000000',
          // Legacy flow dispatched with 0 deposit; keep it for key/allowance compatibility
          deposit: '0',
        },
        options: {
          onEvent: (event) => {
            switch (event.phase) {
              case ActionPhase.STEP_1_PREPARATION:
              case ActionPhase.STEP_2_USER_CONFIRMATION:
              case ActionPhase.STEP_3_CONTRACT_VERIFICATION:
              case ActionPhase.STEP_4_WEBAUTHN_AUTHENTICATION:
              case ActionPhase.STEP_5_AUTHENTICATION_COMPLETE:
              case ActionPhase.STEP_6_TRANSACTION_SIGNING_PROGRESS:
              case ActionPhase.STEP_7_TRANSACTION_SIGNING_COMPLETE:
              case ActionPhase.STEP_8_BROADCASTING:
                toast.loading(event.message, { id: 'chainsig' });
                break;
              case ActionPhase.STEP_9_ACTION_COMPLETE:
                toast.success('MPC signature request sent', { id: 'chainsig' });
                break;
              case ActionPhase.ACTION_ERROR:
              case ActionPhase.WASM_ERROR:
                toast.error(`MPC request failed: ${event.error}`, { id: 'chainsig' });
                break;
            }
          },
          // Wait until FINAL so we can decode SuccessValue and extract the signature
          waitUntil: TxExecutionStatus.FINAL,
          afterCall: async (success: boolean, result?: any) => {
            try {
              if (success) {
                const txId = (result as any)?.transactionId;
                if (txId) toast.success(`NEAR tx submitted: ${txId}`, { id: 'chainsig' });
                console.log('[Chainsigs] FinalExecutionOutcome', result);
                // Decode SuccessValue (base64) → parse MPC signature → finalize and broadcast
                const successValue = extractSuccessValue((result as any)?.result || result);
                if (!successValue) {
                  console.warn('[Chainsigs] No SuccessValue found in outcome; cannot finalize');
                  return;
                }
                const bytes = base64ToBytes(successValue);
                // Try to interpret bytes as UTF-8 JSON first
                let parsed: any | null = null;
                try {
                  const jsonStr = new TextDecoder().decode(bytes);
                  parsed = JSON.parse(jsonStr);
                } catch {
                  parsed = null;
                }

                // Build RSV from known shapes
                let rsvSignatures: Array<{ r: Hex; s: Hex; v: number }> | null = null;

                // Case 1: raw 65-byte RSV
                if (bytes.length === 65) {
                  const r = ('0x' + Array.from(bytes.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join('')) as Hex;
                  const s = ('0x' + Array.from(bytes.slice(32, 64)).map(b => b.toString(16).padStart(2, '0')).join('')) as Hex;
                  const vRaw = bytes[64];
                  const v = vRaw === 0 || vRaw === 1 ? vRaw + 27 : vRaw; // normalize if needed
                  rsvSignatures = [{ r, s, v }];
                }

                // Case 2: parsed JSON with r/s/v or yParity
                if (!rsvSignatures && parsed && typeof parsed === 'object') {
                  const r0: string | undefined = parsed.r || parsed.R;
                  const s0: string | undefined = parsed.s || parsed.S;
                  let v0: number | undefined = parsed.v ?? parsed.V ?? parsed.yParity ?? parsed.y_parity;
                  if (typeof r0 === 'string' && typeof s0 === 'string' && (typeof v0 === 'number' || v0 === 0 || v0 === 1)) {
                    const r = sanitizeHex(r0);
                    const s = sanitizeHex(s0);
                    const v = v0 === 0 || v0 === 1 ? v0 + 27 : v0;
                    rsvSignatures = [{ r, s, v }];
                  }
                }

                // Case 3: bytes are hex text (e.g., "0x…") containing concatenated RSV? Try to split
                if (!rsvSignatures) {
                  const str = new TextDecoder().decode(bytes).trim();
                  if (str.startsWith('0x') && str.length === 2 + 65 * 2) {
                    const hex = str.slice(2);
                    const r = ('0x' + hex.slice(0, 64)) as Hex;
                    const s = ('0x' + hex.slice(64, 128)) as Hex;
                    const vByte = parseInt(hex.slice(128, 130), 16);
                    const v = vByte === 0 || vByte === 1 ? vByte + 27 : vByte;
                    rsvSignatures = [{ r, s, v }];
                  }
                }

                if (!rsvSignatures) {
                  toast.error('Could not parse MPC signature from contract result');
                  return;
                }

                // Finalize signed transaction and broadcast
                let rawSigned: string;
                try {
                  rawSigned = await evm.finalizeTransactionSigning({ transaction: unsignedTx, rsvSignatures });
                } catch (e) {
                  console.error('[Chainsigs] finalizeTransactionSigning failed', e);
                  toast.error('Failed to attach MPC signature to transaction');
                  return;
                }

                try {
                  const txHash = await evm.broadcastTx(rawSigned);
                  toast.success(`EVM tx broadcasted: ${txHash}`);
                  console.log('[Chainsigs] EVM tx hash', txHash);
                } catch (e) {
                  console.error('[Chainsigs] broadcastTx failed', e);
                  toast.error('Failed to broadcast EVM transaction');
                }
              } else {
                console.error('[Chainsigs] NEAR call failed', result);
                toast.error('NEAR call failed — check console for details', { id: 'chainsig' });
              }
            } catch (e) {
              console.error('[Chainsigs] afterCall handler error', e);
            }
          },
          onError: (err) => {
            console.error('[Chainsigs] onError', err);
            toast.error('RPC error while sending transaction');
          },
        },
      });

      // NOTE: At this point, read the MPC signature from the NEAR function result
      // and attach it to the unsignedTx (RSV). This example focuses on the request path.

    } catch (err) {
      console.error('[DemoChainsigs] Error', err);
      toast.error('Failed to prepare or send MPC signing request');
    } finally {
      setIsWorking(false);
    }
  }, [isLoggedIn, nearAccountId, mpcContractId, path, keyVersion, amountEth, passkeyManager, chainIdNum, to, gasLimit, maxFeePerGasGwei, maxPriorityFeePerGasGwei, nonce]);

  if (!isLoggedIn || !nearAccountId) return null;

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 8px' }}>Chain Signatures (EVM) — Demo</h2>
      <p style={{ marginTop: 0 }}>Prepare an EVM transfer payload, request a Chain Signature via the NEAR MPC contract, then finalize client-side.</p>

      <div style={{ display: 'grid', gap: 8 }}>
        <label>
          <div>chainId</div>
          <input value={chainId} onChange={(e) => setChainId(e.target.value)} placeholder="11155111 (Sepolia)" />
        </label>
        <label>
          <div>to (EVM address)</div>
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" />
        </label>
        <label>
          <div>amount (ETH)</div>
          <input value={amountEth} onChange={(e) => setAmountEth(e.target.value)} placeholder="0.01" />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label>
            <div>maxFeePerGas (gwei)</div>
            <input value={maxFeePerGasGwei} onChange={(e) => setMaxFeePerGasGwei(e.target.value)} placeholder="5" />
          </label>
          <label>
            <div>maxPriorityFeePerGas (gwei)</div>
            <input value={maxPriorityFeePerGasGwei} onChange={(e) => setMaxPriorityFeePerGasGwei(e.target.value)} placeholder="1" />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label>
            <div>gasLimit</div>
            <input value={gasLimit} onChange={(e) => setGasLimit(e.target.value)} placeholder="21000" />
          </label>
          <label>
            <div>nonce (optional)</div>
            <input value={nonce} onChange={(e) => setNonce(e.target.value)} placeholder="" />
          </label>
        </div>
        <hr />
        <label>
          <div>MPC Contract ID (NEAR)</div>
          <input value={mpcContractId} onChange={(e) => setMpcContractId(e.target.value)} placeholder="v1.signer-prod.testnet" />
        </label>
        <label>
          <div>path</div>
          <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="ethereum-1" />
        </label>
        <label>
          <div>key_version</div>
          <input value={keyVersion} onChange={(e) => setKeyVersion(e.target.value)} placeholder="0" />
        </label>
      </div>

      <div style={{ marginTop: 16 }}>
        <LoadingButton
          onClick={handleSignViaMpc}
          loading={isWorking}
          loadingText="Processing..."
          variant="primary"
          size="medium"
          style={{ width: 260 }}
        >
          Prepare + Sign via MPC
        </LoadingButton>
      </div>
    </div>
  );
};

export default DemoChainsigs;
