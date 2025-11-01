# Chain Intents & Chain Signatures — Integration Plan (Revised)

This document defines a client-first plan for “Chain Intents / Chain Signatures” with an EVM example. It aligns with NEAR Chain Signatures docs and the chainsig.js approach rather than `omni-transaction-rs`.

Why: `omni-transaction-rs` is aimed at building transactions inside NEAR smart contracts. Our SDK runs in clients and needs to prepare chain-specific payloads (e.g., EVM), request an MPC signature from the NEAR Chain Signatures contract, then finalize and broadcast. That maps closely to chainsig.js and viem.


## Objectives

- Provide a minimal, end-to-end EVM intent (native transfer first) that uses our existing confirmation UX and passkey-backed NEAR signing to obtain a Chain Signature.
- Keep the client small: prepare unsigned EVM tx + signing hash with viem (or chainsig.js), then have NEAR “sign” via MPC contract, then finalize and broadcast.
- Reuse our current SignerWorker, iframe confirmer, and relay Cloudflare worker for orchestration, observability, and CORS.


## What We Will Not Do

- Do not embed `omni-transaction-rs` into our signer worker for client payload prep.
- Do not attempt to produce EVM secp256k1 signatures directly from WebAuthn passkeys (mismatched algorithms). Instead, use NEAR MPC contract to sign the EVM hash.


## High-Level Flow (EVM example)

1. App creates an intent (chainId, to, value, fee policy).
2. SDK prepares an unsigned EVM tx and computes the signing hash (RLP-serialized, keccak256), mirroring chainsig.js behavior.
3. Show confirmation in our Iframe Tx Confirmer (chain, to, amount, fees).
4. Request Chain Signature by calling the NEAR MPC contract’s `sign` method with the EVM hash. This NEAR transaction is signed via our existing passkey flow (SignerWorkerManager).
5. Receive MPC signature (convert to RSV), finalize the EVM transaction, and serialize.
6. Broadcast the signed EVM tx (ideally via our relay for CORS/metrics) and return the receipt.


## Dependency Choice

- Option A: Use `chainsig.js` directly for EVM tx prep, hashing, and finalization.
  - Pros: exact compatibility with the MPC contract expectations; fastest path.
  - Cons: additional dependency surface.
- Option B: Reimplement the minimal flows with `viem` (preferred for tight control):
  - `prepareUnsignedTx(params)` → gas, nonce, fee caps
  - `hashUnsignedTx(unsigned)` → `serialize → keccak256`
  - `finalizeSignedTx(unsigned, rsv)` → attach signature + serialize

We can start with the viem-based implementation and validate compatibility against chainsig.js examples.


## Where wasm-signer-worker Fits

- We will not change `wasm_signer_worker` for EVM prep.
- We will reuse our existing NEAR signing via passkeys to authorize the MPC contract call. The signer worker remains responsible only for NEAR signatures and confirmation UI.


## Proposed TypeScript Surface

```ts
// sdk/src/core/chain-intents/types.ts
export type ChainId = number | string; // hex or decimal

export interface EvmTransferIntent {
  kind: 'evm.transferNative';
  chainId: ChainId;
  from?: string; // optional; might derive via mapping
  to: string;
  amountWei: string; // decimal string
  maxFeePerGasWei?: string;
  maxPriorityFeePerGasWei?: string;
  gasLimit?: string;
  nonce?: number;
}

export type ChainIntent = EvmTransferIntent; // future: erc20 transfer, contract calls, etc.

export interface CanonicalizedIntent {
  chainId: ChainId;
  unsignedTx: unknown;    // viem-compatible unsigned EVM tx object
  signingHash: Uint8Array; // keccak256 hash to be Chain-Signed (RSV)
  preview: {
    summary: string;
    details: Record<string, string | number>;
  };
}
```

Helper entry points:

```ts
// sdk/src/core/chain-intents/build.ts
export async function buildCanonicalIntent(intent: ChainIntent): Promise<CanonicalizedIntent>;

// sdk/src/core/chain-intents/sign.ts
export interface ChainSignatureResult {
  txHash?: string;   // EVM tx hash after broadcast
  rawTx?: string;    // signed RLP
  receipts?: unknown;
}
export async function signAndSubmitCanonicalIntent(
  canonical: CanonicalizedIntent,
  options?: { relayUrl?: string }
): Promise<ChainSignatureResult>;
```

Lower-level helpers:

```ts
// sdk/src/core/ChainSignatures/evm.ts
export async function prepareUnsignedTx(params: EvmTransferIntent): Promise<unknown>; // viem shape
export function hashUnsignedTx(unsigned: unknown): Uint8Array;
export function finalizeSignedTx(unsigned: unknown, rsv: { r: string; s: string; v: number }): string; // rawTx

// sdk/src/core/ChainSignatures/nearMpc.ts
export interface MpcSignParams { mpcContract: string; keyId: string; network?: 'testnet' | 'mainnet'; }
export async function requestChainSignature(hash: Uint8Array, p: MpcSignParams): Promise<{ r: string; s: string; v: number }>;
```


## SDK Integration Points

- Types and builders
  - Add: `sdk/src/core/chain-intents/types.ts`
  - Add: `sdk/src/core/chain-intents/build.ts` (uses `ChainSignatures/evm.ts`)
  - Add: `sdk/src/core/chain-intents/sign.ts` (coordinates confirm → NEAR MPC → finalize → broadcast)
- Chain Signatures helpers
  - Add: `sdk/src/core/ChainSignatures/evm.ts`
  - Add: `sdk/src/core/ChainSignatures/nearMpc.ts`
- Signer worker
  - Add handler: `sdk/src/core/WebAuthnManager/SignerWorkerManager/handlers/signChainIntent.ts`
  - Wire up in: `sdk/src/core/WebAuthnManager/SignerWorkerManager/handlers/index.ts`
  - Update: `sdk/src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/determineConfirmationConfig.ts` to support chain intents
- Iframe + messages
  - Update: `sdk/src/core/WalletIframe/shared/messages.ts` add `StartChainIntent` and progress messages
  - Host/client: route chain-intent requests and progress events
- UI components
  - TxTree: add `ChainIntentNode` renderer
  - Ensure modal shows chainId, to, amount, fees
- Relay adapter (optional but recommended)
  - Add: `sdk/src/core/chain-intents/providers/relay.ts` to estimate gas/nonce and broadcast rawTx via our worker


## Relay Worker (Cloudflare) additions

- New routes:
  - `POST /chain-intents/quote` — given an EVM intent, return estimated gas/nonce/fees and the unsigned tx + preview
  - `POST /chain-intents/submit` — accept signed rawTx and broadcast; return tx hash/receipt
- Provide mock mode for local testing (`CHAIN_INTENTS_MOCK=1`).
- The MPC signing remains an on-chain NEAR call from the client; relay does not sign, it can just assist with estimation and broadcasting.


## Security & Validation

- Validate intent schema: chain allowlist, address shape, amount bounds.
- Clear confirmation: show chainId, to, value, gas caps/limits, and fee policy before signing.
- Reuse wallet-iframe origin checks and CSP. Avoid logging raw payloads; use trace IDs for relay calls.
- Keys: WebAuthn passkeys remain for NEAR signing; EVM signatures come from the MPC result (RSV).


## Testing Strategy

- Unit tests
  - `hashUnsignedTx` determinism for a given unsigned tx
  - RSV → finalizeSignedTx → rawTx correctness against chainsig.js fixtures
- Iframe wiring
  - Message round-trip and progress events for chain-intent flow
- E2E (Playwright)
  - Start example app, build an EVM transfer intent, confirm, mock MPC signature, finalize and broadcast (mock)


## Example App Changes

- Add a minimal demo page to collect `chainId`, `to`, and `amount`.
- Use `buildCanonicalIntent` → display preview → open confirmation modal.
- On confirm, call `signAndSubmitCanonicalIntent` to trigger NEAR MPC sign and show final EVM tx hash.


## Milestones

1. Decide dependency path: chainsig.js vs. viem-only.
2. Implement `ChainSignatures/evm.ts` helpers and TS intent types.
3. Add `nearMpc.ts` adapter that builds NEAR actions to call the MPC `sign` method and routes via SignerWorker.
4. Extend iframe messages + handler and TxTree node.
5. Add relay endpoints (quote/submit) with mocks.
6. Example UI + tests (unit + e2e).


## Acceptance Criteria

- Dev can run locally, create an EVM transfer intent, see confirmation, and obtain a mocked or testnet tx receipt via Chain Signatures.
- Types and helpers are documented and discoverable from SDK entry points.
- CI runs unit tests for hashing/finalization; e2e runs with mocks headlessly.


## Next Steps

- Pick chainsig.js vs. viem-only and scaffold TS modules.
- Wire NEAR MPC call using existing passkey signing flow.
- Add the confirmation node and relay adapter; then iterate with real RPC once mocks pass.
