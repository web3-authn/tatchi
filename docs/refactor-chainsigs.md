# Chainsigs Flow Refactor Plan

This plan outlines how to refactor the Demo Chainsigs EVM flow into a modular, testable, and strongly‑typed implementation, while keeping current behavior intact and improving reliability of both the `viem` and `chainsig.js` paths.

## Goals

- Strong typing end‑to‑end (no `any`/`unknown` leaked through public surfaces).
- Clear phases: prepare → request signature → finalize → broadcast.
- Small, focused helpers with single responsibility; easy to unit test.
- Pluggable finalize strategies (ordered fallback, default viem or adapter).
- Consistent toasts/logs (single formatting point) and predictable error handling.

## High‑Level Structure

Split the current hook into focused modules colocated under the demo:

- `useMpcEvmFlow.ts` (orchestration only)
- `evmIntent.ts` (prepare unsigned EVM tx + typing)
- `mpcSignature.ts` (NEAR call + decoding + RSV parse)
- `finalizers.ts` (adapter + viem finalize strategies)
- `toasts.tsx` (announce/loading/error helpers for consistent UX)

These files reside under `examples/tatchi-docs/src/components/DemoChainsigs/hooks/`.

## Types (new)

- Input intent (sign)
  - `interface SignTransferParams { to: Hex; amountEth: string; chainId: number; contractId: string; path: string; rpcOverride?: string }`
- Prepared EVM
  - `interface PreparedEvm { unsigned: TransactionSerializableEIP1559; adapterUnsigned: EvmUnsignedForAdapter; signingHash: Hex; from: Hex; to: Hex }`
- Signature (RSV)
  - `type V = 27 | 28`
  - `interface ChainSignatureRSV { r: Hex; s: Hex; v: V }`
- Broadcast result
  - `interface BroadcastResult { txHash: Hex; strategy: 'adapter' | 'viem' }`

Notes:
- `EvmUnsignedForAdapter` matches chainsig.js finalize expectations (numbers for `chainId/nonce`, bigint for gas/fees/value, `data: Hex`, `accessList: AccessList | []`).
- Use viem’s `TransactionSerializableEIP1559` for the viem strategy.

## Utilities (new)

- Hex + coercers
  - `ensureHexAddress(s: string): Hex` — lowercases + validates EVM address.
  - `toNumberStrict(v: unknown, fallback: number): number` — typed numeric coercion.
  - `toBigIntStrict(v: unknown, fallback: bigint): bigint` — typed bigint coercion.
  - `coerceTxHash(x: unknown): Hex | null` — extracts hash from common shapes (`hash | transactionHash | txHash | result | toString()`).
  - `buildExplorerLink(chainId: number, tx: Hex): string | null`.

- Toasts + logs
  - `phaseToast(message: string)` — single loading/info path.
  - `announceBroadcast({ txHash, chainId, source, withLink }): void` — formats the success toast + explorer link + logs.
  - `errorToast(err): void` — humanized errors; “insufficient funds” hint.

## Prepare Phase (evmIntent.ts)

`async function prepareEvmTransfer(params: SignTransferParams, publicClient, evmAdapter): Promise<PreparedEvm>`

- Derive address with `evmAdapter.deriveAddressAndPublicKey(nearAccountId, path)`.
- Build unsigned tx and hash with `evmAdapter.prepareTransactionForSigning`.
- Convert adapter tx → `TransactionSerializableEIP1559` (numbers: number; gas/fees/value: bigint), keep `adapterUnsigned` for adapter finalize.
- Return `{ unsigned, adapterUnsigned, signingHash, from, to }`.

## Request Signature (mpcSignature.ts)

`async function requestMpcSignature(passkeyManager, args): Promise<{ nearTxId?: string; rsv: ChainSignatureRSV[] }>`

- Send NEAR FunctionCall to MPC contract using the `payload_v2` schema and provided `path`.
- Extract `transactionId` (optional) for UI.
- Decode base64 `SuccessValue` (bytes) and parse to RSV with `v` normalized to 27/28.

## Finalize Strategies (finalizers.ts)

Define a common interface and two concrete strategies.

```ts
export interface Finalizer {
  name: 'adapter' | 'viem';
  finalize(prep: PreparedEvm, rsvs: ChainSignatureRSV[]): Promise<BroadcastResult>;
}
```

- Adapter finalizer
  - Normalize RSV for adapter: `r/s` without 0x; `v` in 27/28.
  - Normalize `adapterUnsigned`: `chainId/nonce` as number; `gas/maxFeePerGas/maxPriorityFeePerGas/value` as bigint; defaults for `data` and `accessList`.
  - Call `evm.finalizeTransactionSigning({ transaction, rsvSignatures: [one] })` then `evm.broadcastTx(raw)`.

- Viem finalizer (primary)
  - Take `prepared.unsigned` (`TransactionSerializableEIP1559`).
  - For each RSV candidate, `serializeTransaction(unsigned, {r,s,v})` → `sendRawTransaction`.
  - Return first success; otherwise throw last error.

## Orchestration (useMpcEvmFlow.ts)

Hook remains small and readable:

```ts
export function useMpcEvmFlow() {
  const { loginState, passkeyManager } = usePasskeyContext();
  const [isWorking, setIsWorking] = useState(false);

  const signAndSendEvmTransfer = useCallback(async (params: SignTransferParams & {
    onDerivedAddress?: (from: Hex) => void;
    onTxHash?: (hash: Hex) => void;
    toastExplorerLink?: boolean;
    order?: Array<'viem' | 'adapter'>; // default: ['viem', 'adapter']
  }) => {
    if (!loginState.isLoggedIn) return;
    setIsWorking(true);
    try {
      // 1) Prepare
      phaseToast('Preparing MPC signing request…');
      const { publicClient, evmAdapter } = await makeClients(params);
      const prepared = await prepareEvmTransfer(params, publicClient, evmAdapter);
      params.onDerivedAddress?.(prepared.from);

      // 2) Request signature from MPC
      phaseToast('Sending request to NEAR…');
      const { nearTxId, rsv } = await requestMpcSignature(passkeyManager, { ...params, hash: prepared.signingHash });
      if (nearTxId) announceNearTx(nearTxId, params.toastExplorerLink);

      // 3) Finalize + broadcast using ordered strategies
      const strategies = buildFinalizeOrder(params.order, publicClient, evmAdapter, params.toastExplorerLink, params.chainId);
      const result = await runFinalizeFallback(strategies, prepared, rsv);
      params.onTxHash?.(result.txHash);
    } catch (e) {
      errorToast(e);
      throw e;
    } finally {
      setIsWorking(false);
    }
  }, [loginState.isLoggedIn, passkeyManager]);

  return { isWorking, signAndSendEvmTransfer } as const;
}
```

Where:
- `makeClients` builds `publicClient` (viem) and the chainsig EVM adapter.
- `buildFinalizeOrder` instantiates `Finalizer[]` matching user preference, defaulting to viem→adapter.
- `runFinalizeFallback` tries each finalizer in order until one succeeds; throws combined context on failure.

## Error Handling

- Use exceptions for control flow; no sentinel booleans.
- Centralized `errorToast` with classification (e.g., insufficient funds).
- Logs include the strategy name and recovery id (v) for quick diagnosis.

## Testing Strategy

- Unit tests (pure helpers):
  - Address validation, number/bigint coercers, `coerceTxHash`, explorer link builder.
- Unit tests (finalizers):
  - Adapter finalize: normalizes tx + RSV; calls `finalizeTransactionSigning` and `broadcastTx`.
  - Viem finalize: serializes provided unsigned and broadcasts.
  - Failure cases: all RSV candidates fail; insufficient funds classification.
- Integration tests (hook):
  - Successful flows for adapter and viem paths (mock clients + passkeyManager).
  - Explorer link shows only when a hash exists and caller opts in.

## Incremental Execution Plan

1. Extract helpers (`toasts`, hex coercers) to new files; replace inline code.
2. Add `evmIntent.ts` (`prepareEvmTransfer`) returning `PreparedEvm`.
3. Add `mpcSignature.ts` (`requestMpcSignature`) returning RSV and optional NEAR txId.
4. Add `finalizers.ts` with `Finalizer` interface and two strategies.
5. Update `useMpcEvmFlow.ts` to orchestrate via the new modules; keep current UX.
6. Add targeted unit tests for helpers and strategies; optional integration test for the hook.

## Acceptance Criteria

- The demo runs as before with cleaner code and strong typing.
- Both finalize strategies work; default path uses viem and falls back to adapter.
- Toasts show distinct NEAR and EVM successes with proper explorer links.
- Tests cover core helpers and finalize strategies.

