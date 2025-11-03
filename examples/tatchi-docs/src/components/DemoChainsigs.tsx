import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CopyButton } from './CopyButton';
import { toast } from 'sonner';
import { LoadingButton } from './LoadingButton';
import { GlassBorder } from './GlassBorder';
import './DemoChainsigs.css';

import {
  ActionPhase,
  ActionStatus,
  ActionType,
  TxExecutionStatus,
  usePasskeyContext,
} from '@tatchi-xyz/sdk/react';

import * as viem from 'viem';
import * as chainsig from 'chainsig.js';
import { chainAdapters, contracts } from "chainsig.js";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { parseMpcSignature } from '../utils/parseMpcSignature';


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
      return 'https://rpc.sepolia.org';
    case 84532: // Base Sepolia
      return 'https://sepolia.base.org';
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

function rpcCandidatesForChainId(chainId: number): string[] {
  switch (chainId) {
    case 11155111: // Ethereum Sepolia
      return [
        'https://rpc.sepolia.org',
        'https://ethereum-sepolia.publicnode.com',
        'https://sepolia.gateway.tenderly.co',
        'https://eth-sepolia.g.alchemy.com/v2/demo',
      ];
    case 84532: // Base Sepolia
      return [
        'https://sepolia.base.org',
        'https://base-sepolia.gateway.tenderly.co',
      ];
    case 80002: // Polygon Amoy
      return ['https://rpc-amoy.polygon.technology'];
    case 43113: // Avalanche Fuji
      return ['https://api.avax-test.network/ext/bc/C/rpc'];
    case 97: // BSC testnet
      return ['https://data-seed-prebsc-1-s1.binance.org:8545/'];
    case 421614: // Arbitrum Sepolia
      return ['https://sepolia-rollup.arbitrum.io/rpc'];
    default:
      return [];
  }
}

async function chooseRpc(chainId: number, override?: string): Promise<string> {
  if (override && override.trim()) return override.trim();
  const first = rpcForChainId(chainId);
  const candidates = [first, ...rpcCandidatesForChainId(chainId)].filter(Boolean) as string[];
  for (const url of candidates) {
    try {
      const client = viem.createPublicClient({ transport: viem.http(url, { timeout: 8000 }) });
      await client.getBlockNumber();
      return url;
    } catch {
      // try next
    }
  }
  throw new Error('No responsive RPC for selected chain. Provide an override.');
}

function faucetLinksForChainId(chainId: number): Array<{ label: string; url: string }> {
  switch (chainId) {
    case 11155111: // Ethereum Sepolia
      return [
        { label: 'Alchemy Sepolia Faucet', url: 'https://www.alchemy.com/faucets/ethereum-sepolia' },
        { label: 'DRPC Sepolia Faucet', url: 'https://drpc.org/faucet/ethereum/sepolia' },
        { label: 'Infura Sepolia Faucet', url: 'https://www.infura.io/faucet/sepolia' },
      ];
    case 84532: // Base Sepolia
      return [
        { label: 'Alchemy Base Sepolia Faucet', url: 'https://www.alchemy.com/faucets/base-sepolia' },
        { label: 'QuickNode Base Sepolia Faucet', url: 'https://faucet.quicknode.com/base/sepolia' },
      ];
    case 80002: // Polygon Amoy
      return [
        { label: 'Alchemy Polygon Amoy Faucet', url: 'https://www.alchemy.com/faucets/polygon-amoy' },
      ];
    case 43113: // Avalanche Fuji
      return [
        { label: 'Avalanche Fuji Faucet', url: 'https://core.app/tools/testnet-faucet/?subnet=c&token=c' },
      ];
    case 97: // BSC testnet
      return [
        { label: 'BSC Testnet Faucet', url: 'https://testnet.bnbchain.org/faucet-smart' },
      ];
    case 421614: // Arbitrum Sepolia
      return [
        { label: 'QuickNode Arbitrum Sepolia Faucet', url: 'https://faucet.quicknode.com/arbitrum/sepolia' },
      ];
    default:
      return [
        { label: 'Chainlist (find faucet)', url: 'https://chainlist.org/?testnets=true' },
      ];
  }
}

function explorerTxBaseForChainId(chainId: number): string | null {
  switch (chainId) {
    case 11155111: // Ethereum Sepolia
      return 'https://sepolia.etherscan.io/tx/';
    case 84532: // Base Sepolia
      return 'https://sepolia.basescan.org/tx/';
    case 80002: // Polygon Amoy
      return 'https://www.oklink.com/amoy/tx/';
    case 43113: // Avalanche Fuji
      return 'https://subnets-test.avax.network/c-chain/tx/';
    case 97: // BSC testnet
      return 'https://testnet.bscscan.com/tx/';
    case 421614: // Arbitrum Sepolia
      return 'https://sepolia.arbiscan.io/tx/';
    default:
      return null;
  }
}

function nearExplorerTxUrl(txId: string): string {
  // This demo uses NEAR testnet (v1.signer-prod.testnet)
  return `https://testnet.nearblocks.io/txns/${txId}`;
}

export const DemoChainsigs: React.FC = () => {
  const {
    loginState: { isLoggedIn, nearAccountId },
    passkeyManager,
  } = usePasskeyContext();

  const [isWorking, setIsWorking] = useState(false);
  const [rpcOverride, setRpcOverride] = useState<string>('');
  const [derivedAddress, setDerivedAddress] = useState<string>('');
  // Collapsible chain fields card
  const [chainFieldsExpanded, setChainFieldsExpanded] = useState<boolean>(false);

  // EVM tx inputs (simple EIP-1559 transfer)
  const [chainId, setChainId] = useState<string>(''); // use placeholder; fallback programmatically
  const [to, setTo] = useState<string>('0x8454d149Beb26E3E3FC5eD1C87Fb0B2a1b7B6c2c');
  const [amountEth, setAmountEth] = useState<string>('0.00123');
  const [maxFeePerGasGwei, setMaxFeePerGasGwei] = useState<string>('5');
  const [maxPriorityFeePerGasGwei, setMaxPriorityFeePerGasGwei] = useState<string>('1');
  const [gasLimit, setGasLimit] = useState<string>('21000');
  const [nonce, setNonce] = useState<string>('');

  // MPC parameters
  const [mpcContractId, setMpcContractId] = useState<string>('');
  const [path, setPath] = useState<string>('ethereum-1');
  const [keyVersion, setKeyVersion] = useState<string>('0');

  // Local cache for derived address to avoid repeated view calls
  const cacheKey = useCallback(() => {
    return nearAccountId ? `w3a:chainsigs:derived:${nearAccountId}:${mpcContractId}:${path}` : '';
  }, [nearAccountId, mpcContractId, path]);

  const chainIdNum = useMemo(() => {
    const n = Number((chainId || '').trim() || '84532');
    return Number.isFinite(n) && n > 0 ? n : 84532;
  }, [chainId]);

  const mpcContractIdEffective = useMemo(() => (mpcContractId && mpcContractId.trim()) || 'v1.signer-prod.testnet', [mpcContractId]);

  // Amount conversions moved next to viem import for accuracy

  const handleSignViaMpc = useCallback(async () => {
    if (!isLoggedIn || !nearAccountId) return;
    if (!path || keyVersion.trim() === '') {
      toast.error('Configure signing parameters');
      return;
    }

    setIsWorking(true);
    // Show a persistent loading toast while preparing the MPC request
    toast.loading('Preparing MPC signing request…', { id: 'chainsig' });
    try {
      // Validate inputs we can check locally
      if (!chainIdNum) throw new Error('Invalid chainId');
      const toAddr = sanitizeHex(to);
      if (!to || !/^0x[0-9a-fA-F]{40}$/.test(toAddr)) throw new Error('Invalid recipient address');

      // Build adapter + public client
      const rpcUrl = await chooseRpc(chainIdNum, rpcOverride);
      const publicClient = viem.createPublicClient({ transport: viem.http(rpcUrl, { timeout: 20000 }) });
      console.log('[Chainsigs] Using RPC URL:', rpcUrl);
      const contract = new contracts.ChainSignatureContract({
        networkId: 'testnet',
        contractId: mpcContractIdEffective,
      });
      const evm = new chainAdapters.evm.EVM({ publicClient, contract });

      // Derive EVM address for preview and to use as from
      const { address } = await evm.deriveAddressAndPublicKey(nearAccountId, path);
      const fromAddr: Hex = sanitizeHex(address);
      setDerivedAddress(fromAddr);
      console.log('[Chainsigs] Derived EVM address to fund:', fromAddr);
      // Persist derived address via SDK (keyed by contractId + chainId + path)
      try {
        if (chainIdNum) {
          await passkeyManager.setDerivedAddress(nearAccountId, {
            contractId: mpcContractIdEffective,
            path: `evm:${chainIdNum}:${path}`,
            address: fromAddr,
          });
        }
      } catch (e) {
        console.warn('[Chainsigs] Failed to cache derived address in IndexedDB', e);
      }

      // Prepare unsigned EVM tx and the hashes to sign
      let unsignedTx: any;
      let signingHash: Hex;
      let useViemFinalize = false;
      try {
        const { transaction, hashesToSign } = await evm.prepareTransactionForSigning({
          from: fromAddr,
          to: toAddr,
          value: viem.parseEther(amountEth || '0'),
        });
        unsignedTx = transaction;
        const firstPayload = hashesToSign?.[0];
        if (!firstPayload) throw new Error('No payload to sign returned by adapter');
        signingHash = (() => {
          if (typeof firstPayload === 'string') return sanitizeHex(firstPayload);
          if (firstPayload instanceof Uint8Array) return viem.bytesToHex(firstPayload) as Hex;
          if (Array.isArray(firstPayload)) return viem.bytesToHex(Uint8Array.from(firstPayload)) as Hex;
          throw new Error('Unsupported hash payload type');
        })();
        console.log('[Chainsigs] prepared via chainsig.js', { from: fromAddr, to: toAddr, signingHash });
      } catch (err: any) {
        // Fallback when estimateGas fails due to insufficient funds.
        const msg = String(err?.message || err);
        const insufficient = /insufficient funds|EstimateGasExecutionError/i.test(msg);
        if (!insufficient) throw err;
        console.warn('[Chainsigs] Falling back to viem tx prep due to insufficient funds');

        const valueWei = viem.parseEther(amountEth || '0');
        const maxPriorityFeePerGas = viem.parseGwei((maxPriorityFeePerGasGwei || '1'));
        const maxFeePerGas = viem.parseGwei((maxFeePerGasGwei || '5'));
        const gas = 21000n; // simple transfer
        const resolvedNonce = await publicClient.getTransactionCount({ address: fromAddr, blockTag: 'pending' });
        unsignedTx = {
          chainId: chainIdNum,
          nonce: resolvedNonce,
          to: toAddr,
          gas,
          maxFeePerGas: maxFeePerGas >= maxPriorityFeePerGas ? maxFeePerGas : maxPriorityFeePerGas,
          maxPriorityFeePerGas,
          value: valueWei,
          accessList: [],
          data: '0x',
          type: 'eip1559',
        } as viem.TransactionSerializableEIP1559;
        const unsignedSerialized = viem.serializeTransaction(unsignedTx);
        signingHash = viem.keccak256(unsignedSerialized) as Hex;
        useViemFinalize = true;
        console.log('[Chainsigs] prepared via viem fallback', { from: fromAddr, to: toAddr, signingHash });
        toast.message('Prepared EVM payload (fallback, unfunded account)', {
          description: 'Signature will be produced, but broadcast requires funds.',
        });
      }

      // Show a quick preview toast
      toast.message('Prepared EVM payload for MPC signing', {
        description: `chainId=${unsignedTx.chainId} to=${unsignedTx.to} value=${amountEth} ETH`,
      });

      // Update toast before sending request to NEAR
      toast.loading('Sending request to NEAR…', { id: 'chainsig' });
      // Request MPC signature by calling NEAR MPC contract
      // v1.signer-prod.testnet expects request.payload_v2, and hex WITHOUT 0x
      const payloadHexNo0x = signingHash.startsWith('0x') ? signingHash.slice(2) : signingHash;
      await passkeyManager.executeAction({
        nearAccountId,
        receiverId: mpcContractIdEffective,
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
          // Use chainsig.js defaults
          gas: '300000000000000',
          deposit: '1',
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
          // Some RPCs return "Server error" on FINAL; use optimistic to improve reliability
          waitUntil: TxExecutionStatus.EXECUTED_OPTIMISTIC,
          afterCall: async (success: boolean, result?: any) => {
            try {
              if (success) {
                const txId = (result as any)?.transactionId || (result as any)?.transaction?.hash || (result as any)?.transaction_outcome?.id;
                if (txId) {
                  const href = nearExplorerTxUrl(txId);
                  toast.success('NEAR tx submitted', {
                    id: 'chainsig',
                    description: (
                      <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
                        View on NEAR Explorer
                      </a>
                    )
                  });
                }
                console.log('[Chainsigs] ActionResult', result);
                // Decode SuccessValue (base64) → parse MPC signature → finalize and broadcast
                const successValue = extractSuccessValue(result);
                if (!successValue) {
                  console.warn('[Chainsigs] No SuccessValue found in outcome; cannot finalize');
                  return;
                }
                const bytes = base64ToBytes(successValue);
                // Try to interpret bytes as UTF-8 JSON (or JSON-encoded string) first
                let parsed: any | null = null;
                try {
                  const text = new TextDecoder().decode(bytes).trim();
                  try {
                    parsed = JSON.parse(text);
                  } catch {
                    // Some contracts return a JSON-encoded string value; try one more pass
                    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
                      const unquoted = text.slice(1, -1);
                      try { parsed = JSON.parse(unquoted); } catch { parsed = unquoted; }
                    } else {
                      parsed = text;
                    }
                  }
                } catch {
                  parsed = null;
                }

                // Normalize MPC output to RSV
                const rsvSignatures = parseMpcSignature(bytes);

                if (!rsvSignatures) {
                  const debugText = (() => {
                    try { return new TextDecoder().decode(bytes); } catch { return '(binary)'; }
                  })();
                  console.warn('[Chainsigs] Could not parse MPC signature. bytes.len=', bytes.length, 'text=', debugText);
                  toast.error('Could not parse MPC signature from contract result');
                  return;
                }

                // Finalize signed transaction and broadcast
                try {
                  let txHash: string | undefined;
                  if (useViemFinalize) {
                    // Try all candidates until one succeeds (handles missing recovery id)
                    let lastErr: any = null;
                    for (const cand of rsvSignatures) {
                      const { r, s, v } = cand;
                      const rawSigned = viem.serializeTransaction(unsignedTx, { r, s, v: BigInt(v) });
                    try {
                      txHash = await publicClient.sendRawTransaction({ serializedTransaction: rawSigned });
                      const base = explorerTxBaseForChainId(chainIdNum!);
                      const href = base && txHash ? `${base}${txHash}` : undefined;
                      toast.success('EVM tx broadcasted', {
                        description: href ? (
                          <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
                            View on Explorer
                          </a>
                        ) : undefined,
                      });
                      console.log('[Chainsigs] EVM tx hash', txHash);
                      break;
                    } catch (e: any) {
                        lastErr = e;
                        console.warn('[Chainsigs] broadcast (fallback) failed for v=', v, e);
                      }
                    }
                    if (!txHash) {
                      if (lastErr && /insufficient funds/i.test(String(lastErr?.message || lastErr))) {
                        toast.error('Broadcast failed: insufficient funds. Fund the derived address and retry.');
                      } else {
                        toast.error('Failed to broadcast EVM transaction');
                      }
                    }
                  } else {
                    // Adapter path; try candidates via adapter, then fall back to viem serialization if needed
                    let sent = false;
                    let lastErr: any = null;
                    for (const cand of rsvSignatures) {
                      try {
                        const rawSigned = await evm.finalizeTransactionSigning({ transaction: unsignedTx, rsvSignatures: [cand] as any });
                        txHash = await evm.broadcastTx(rawSigned);
                        const base = explorerTxBaseForChainId(chainIdNum!);
                        const href = base && txHash ? `${base}${txHash}` : undefined;
                        toast.success('EVM tx broadcasted', {
                          description: href ? (
                            <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
                              View on Explorer
                            </a>
                          ) : undefined,
                        });
                        console.log('[Chainsigs] EVM tx hash', txHash);
                        sent = true;
                        break;
                      } catch (e) {
                        lastErr = e;
                        console.warn('[Chainsigs] finalize/broadcast (adapter) failed for candidate v=', cand.v, e);
                      }
                    }
                    if (!sent) {
                      // Fallback: attempt viem serialization using the adapter unsignedTx shape
                      try {
                        for (const cand of rsvSignatures) {
                          const { r, s, v } = cand;
                          // Map common fields used by viem serialize for EIP-1559
                          // The adapter-provided transaction is expected to expose these fields
                          const viemUnsigned: any = {
                            chainId: BigInt(unsignedTx.chainId ?? unsignedTx.chain_id ?? 0),
                            nonce: BigInt(unsignedTx.nonce ?? 0),
                            to: unsignedTx.to as Hex,
                            gas: BigInt(unsignedTx.gas ?? unsignedTx.gasLimit ?? 21000n),
                            maxFeePerGas: BigInt(unsignedTx.maxFeePerGas ?? unsignedTx.max_fee_per_gas ?? 0),
                            maxPriorityFeePerGas: BigInt(unsignedTx.maxPriorityFeePerGas ?? unsignedTx.max_priority_fee_per_gas ?? 0),
                            value: BigInt(unsignedTx.value ?? 0),
                            data: (unsignedTx.data ?? '0x') as Hex,
                            accessList: Array.isArray(unsignedTx.accessList) ? unsignedTx.accessList : [],
                            type: 'eip1559',
                          };
                          const rawSigned = viem.serializeTransaction(viemUnsigned, { r, s, v: BigInt(v) });
                          try {
                            txHash = await publicClient.sendRawTransaction({ serializedTransaction: rawSigned });
                            const base = explorerTxBaseForChainId(chainIdNum!);
                            const href = base && txHash ? `${base}${txHash}` : undefined;
                            toast.success('EVM tx broadcasted', {
                              description: href ? (
                                <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
                                  View on Explorer
                                </a>
                              ) : undefined,
                            });
                            console.log('[Chainsigs] EVM tx hash', txHash);
                            sent = true;
                            break;
                          } catch (e2) {
                            lastErr = e2;
                            console.warn('[Chainsigs] broadcast (viem fallback) failed for v=', v, e2);
                          }
                        }
                      } catch (eMap) {
                        lastErr = eMap;
                        console.warn('[Chainsigs] viem fallback mapping failed', eMap);
                      }
                    }
                    if (!sent) throw new Error('All signature candidates failed to broadcast');
                  }
                } catch (e) {
                  console.error('[Chainsigs] finalize/broadcast failed', e);
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
            toast.error('RPC error while sending transaction', { id: 'chainsig' });
          },
        },
      });

      // NOTE: At this point, read the MPC signature from the NEAR function result
      // and attach it to the unsignedTx (RSV). This example focuses on the request path.

    } catch (err) {
      console.error('[DemoChainsigs] Error', err);
      toast.error('Failed to prepare or send MPC signing request', { id: 'chainsig' });
    } finally {
      setIsWorking(false);
    }
  }, [isLoggedIn, nearAccountId, mpcContractId, path, keyVersion, amountEth, passkeyManager, chainIdNum, to, gasLimit, maxFeePerGasGwei, maxPriorityFeePerGasGwei, nonce]);

  const handleDeriveAddressOnly = useCallback(async () => {
    if (!isLoggedIn || !nearAccountId) return;
    try {
      if (!chainIdNum) throw new Error('Invalid chainId');
      // Derivation does not require a live RPC roundtrip; pick a sensible URL without probing
      const rpcUrl = (rpcOverride && rpcOverride.trim())
        ? rpcOverride.trim()
        : (rpcForChainId(chainIdNum) || (rpcCandidatesForChainId(chainIdNum)[0] || 'https://rpc.sepolia.org'));
      const publicClient = viem.createPublicClient({ transport: viem.http(rpcUrl) });
      const contract = new contracts.ChainSignatureContract({ networkId: 'testnet', contractId: mpcContractIdEffective });
      const evm = new chainAdapters.evm.EVM({ publicClient, contract });
      const { address } = await evm.deriveAddressAndPublicKey(nearAccountId, path);
      const addr = sanitizeHex(address);
      setDerivedAddress(addr);
      // Cache via SDK for quick subsequent retrievals
      try {
        if (chainIdNum) {
          await passkeyManager.setDerivedAddress(nearAccountId, {
            contractId: mpcContractIdEffective,
            path: `evm:${chainIdNum}:${path}`,
            address: addr,
          });
        }
      } catch (e) {
        console.warn('[Chainsigs] Failed to cache derived address in IndexedDB', e);
      }
      console.log('[Chainsigs] Derived EVM address to fund:', addr);
      toast.success('Derived MPC EVM address');
    } catch (e) {
      console.error('[Chainsigs] derive address failed', e);
      toast.error('Failed to derive address');
    }
  }, [isLoggedIn, nearAccountId, chainIdNum, mpcContractIdEffective, path, cacheKey]);

  // Auto-derive address on mount and when key inputs change (use cache first)
  useEffect(() => {
    if (!nearAccountId || !chainIdNum) return;
    let cancelled = false;
    (async () => {
      // Try SDK cache first
      try {
        const cached = await passkeyManager.getDerivedAddress(nearAccountId, {
          contractId: mpcContractIdEffective,
          path: `evm:${chainIdNum}:${path}`,
        });
        if (!cancelled && cached && cached.startsWith('0x')) {
          setDerivedAddress(sanitizeHex(cached));
          return;
        }
      } catch {}
      if (!cancelled) {
        void handleDeriveAddressOnly();
      }
    })();
    return () => { cancelled = true; };
  }, [nearAccountId, chainIdNum, mpcContractIdEffective, path, handleDeriveAddressOnly]);

  if (!isLoggedIn || !nearAccountId) return null;

  return (
    <GlassBorder style={{ maxWidth: 480, marginTop: '1rem' }} >
      <div className="dmeo-chainsigs-root">

        <div className="action-section">

          <div className="demo-page-header">
            <h2 className="demo-title">NEAR Intents Demo</h2>
          </div>
          <div className="action-text">
            Send an EVM transaction on Base using touchID.<br />
            Request a Chain Signature from the NEAR MPC contract,
            then finalize and broadcast to Base Sepolia network.
          </div>

          {/* Derived address first */}
          <div className="input-group">
            <label>Derived sender address</label>
            <div className="derived-address-pill">
              <span className="derived-address-text">{derivedAddress || 'Deriving address…'}</span>
              <CopyButton
                text={derivedAddress || ''}
                ariaLabel="Copy derived address"
                size={16}
              />
            </div>
          </div>

          {derivedAddress ? (
            <div className="action-text" style={{ marginTop: 6 }}>
              Fund your derived address with Base Sepolia ETH for this demo
              <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {faucetLinksForChainId(chainIdNum).map((f) => (
                  <a key={f.url} href={f.url} target="_blank" rel="noreferrer">
                    {f.label}
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {/* Chain config + EVM tx fields card */}
          <div className="chain-fields-card">
            <div className="input-group">
              <label>
                to (EVM address)
              </label>
              <input className="multi-tx-input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" />
            </div>

            <div
              id="chain-fields-advanced"
              className={`chain-fields-advanced ${chainFieldsExpanded ? 'expanded' : ''}`}
            >
              <div className="input-group">
                <label>
                  amount (ETH)
                </label>
                <input className="multi-tx-input" value={amountEth} onChange={(e) => setAmountEth(e.target.value)} placeholder="0.01" />
              </div>

              <div className="input-group">
                <label>
                  chainId
                </label>
                <input className="multi-tx-input" value={chainId} onChange={(e) => setChainId(e.target.value)} placeholder="84532 (Base Sepolia)" />
              </div>

              <div className="input-group">
                <label>
                  RPC override (optional)
                </label>
                <input className="multi-tx-input" value={rpcOverride} onChange={(e) => setRpcOverride(e.target.value)} placeholder="https://sepolia.base.org" />
              </div>

              <div className="input-group">
                <label>
                  MPC Contract ID (NEAR)
                </label>
                <input className="multi-tx-input" value={mpcContractId} onChange={(e) => setMpcContractId(e.target.value)} placeholder="v1.signer-prod.testnet" />
              </div>
            </div>

            <div className="chain-fields-toggle-row">
              <button
                type="button"
                className="chain-fields-toggle"
                onClick={() => setChainFieldsExpanded((v) => !v)}
                aria-expanded={chainFieldsExpanded}
                aria-controls="chain-fields-advanced"
              >
                <span className="chevron" aria-hidden>
                  {chainFieldsExpanded ? '▾' : '▸'}
                </span>
                Transaction details
              </button>
            </div>
          </div>



          {/** Hidden advanced EIP-1559 and nonce fields (not shown in UI) */}
          {false && (
            <>
              <div className="input-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label>
                  maxFeePerGas (gwei)
                </label>
                <input className="multi-tx-input" value={maxFeePerGasGwei} onChange={(e) => setMaxFeePerGasGwei(e.target.value)} placeholder="5" />
                <label>
                  maxPriorityFeePerGas (gwei)
                </label>
                <input className="multi-tx-input" value={maxPriorityFeePerGasGwei} onChange={(e) => setMaxPriorityFeePerGasGwei(e.target.value)} placeholder="1" />
              </div>

              <div className="input-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label>
                  gasLimit
                </label>
                <input className="multi-tx-input" value={gasLimit} onChange={(e) => setGasLimit(e.target.value)} placeholder="21000" />
                <label>
                  nonce (optional)
                </label>
                <input className="multi-tx-input" value={nonce} onChange={(e) => setNonce(e.target.value)} placeholder="" />
              </div>
            </>
          )}

          {/** Hide path and key_version in the UI (keep defaults in state) */}
          {false && (
            <>
              <div className="input-group">
                <label>
                  path
                  <input className="multi-tx-input" value={path} onChange={(e) => setPath(e.target.value)} placeholder="ethereum-1" />
                </label>
              </div>
              <div className="input-group">
                <label>
                  key_version
                  <input className="multi-tx-input" value={keyVersion} onChange={(e) => setKeyVersion(e.target.value)} placeholder="0" />
                </label>
              </div>
            </>
          )}

          <LoadingButton
            onClick={handleSignViaMpc}
            loading={isWorking}
            loadingText="Processing..."
            variant="primary"
            size="medium"
            style={{ width: 260 }}
          >
            Sign and Send Base Transfer
          </LoadingButton>
        </div>
      </div>
    </GlassBorder>
  );
};

export default DemoChainsigs;
