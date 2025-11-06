# Chainsigs Example 2: Base Sepolia ↔ NEAR Testnet Swap (via NEAR Intents 1‑Click)

This plan outlines a demo that swaps assets between Base Sepolia (EVM) and NEAR testnet using the NEAR Intents 1‑Click API. It reuses the existing MPC/ChainSignatures and passkey flows already present in the repo.

## Goals
- Provide a simple “request quote → send deposit → (optional) submit tx hash → poll status” UI.
- Support both directions: Base→NEAR and NEAR→Base.
- Reuse chainsigs helpers and hooks for EVM signing/broadcast and passkey executeAction for NEAR transfers.

## References
- near-intents 1click-example (flow and API calls):
  - Get Tokens → Get Quote → Send Deposit → Submit Tx Hash (optional) → Check Status
- Existing repo helpers we reuse:
  - EVM: `examples/tatchi-docs/src/components/DemoChainsigs/hooks/useMpcEvmFlow.ts`, `useEvmRpc.ts`, `useDerivedEvmAddress.ts`
  - NEAR: `passkeyManager.executeAction` with `ActionType.Transfer` (yoctoNEAR)
  - Adapters/utilities in `examples/tatchi-docs/src/components/DemoChainsigs/helpers/*`

## High-Level Architecture
- New demo component: `examples/tatchi-docs/src/components/DemoChainsigs2` (self-contained UI)
- New hook: `useOneClickSwap` under `examples/tatchi-docs/src/components/DemoChainsigs/hooks/` encapsulating One‑Click API calls and orchestration.
  - Methods: `getTokens`, `getQuote`, `submitTxHash`, `getStatus`, plus helpers to execute Base or NEAR deposits.
  - Minimal internal state; UI manages presentation.

## UX Flow
1) Direction toggle: Base→NEAR or NEAR→Base
2) Amount input + asset pair (auto-selected from token list, but configurable)
3) Get Quote
   - Show quote summary and `depositAddress`
   - Show indicative cost breakdown (amountIn/out USD where present)
4) Send Deposit
   - Base→NEAR: EVM transfer via `useMpcEvmFlow` using derived EVM address, to `depositAddress`
   - NEAR→Base: NEAR `Transfer` action to `depositAddress` using `passkeyManager.executeAction`
5) (Optional) Submit Tx Hash (early notification)
6) Poll Status until `SUCCESS` or `REFUNDED`
7) Display explorer links (BaseScan Sepolia, NEAR Testnet Blocks, Intents Explorer)

## One‑Click API Integration
- Library: `@defuse-protocol/one-click-sdk-typescript`
- Base URL: `https://1click.chaindefuser.com`
- Token: `ONE_CLICK_JWT` (optional; without it, fees apply). We’ll read from `import.meta.env` in the demo.
- Endpoints used:
  - `OneClickService.getTokens()`
  - `OneClickService.getQuote({ ... })`
  - `OneClickService.submitDepositTx({ txHash, depositAddress })`
  - `OneClickService.getExecutionStatus(depositAddress)`

## Asset Resolution
- Use `getTokens()` to find supported `assetId` for each side.
- Defaults (subject to availability on testnets):
  - Base Sepolia native ETH
  - NEAR testnet NEP‑141 (e.g., `wrap.testnet`)

## Deposits
- Base→NEAR (EVM origin)
  - Reuse `useMpcEvmFlow.signAndSendEvmTransfer` with:
    - `chainId = 84532` (Base Sepolia)
    - `to = quote.depositAddress`
    - `amountEth = input amount (ETH)`
    - `contractId = 'v1.signer-prod.testnet'` (default, overridable)
    - `path = 'ethereum-1'`
  - On success, capture tx hash, optionally `submitTxHash`, then poll status.

- NEAR→Base (NEAR origin)
  - Use `passkeyManager.executeAction` with a single `Transfer` action:
    - `receiverId = quote.depositAddress`
    - `amount = yoctoNEAR(input)`
    - `waitUntil = EXECUTED_OPTIMISTIC`
  - On success, capture tx hash, optionally `submitTxHash`, then poll status.

## Error Handling
- Quote expiry (deadline passed) → re‑quote.
- Insufficient funds → show actionable toast (fund derived EVM address or NEAR account).
- RPC connectivity → leverage `chooseRpc` fallback for EVM; set NEAR RPC via defaults.
- Validate inputs (NEAR accountId, 0x EVM address, decimal amounts, yocto conversion).

## Files to Add
- `examples/tatchi-docs/src/components/DemoChainsigs2/index.tsx` — UI for the swap demo.
- `examples/tatchi-docs/src/components/DemoChainsigs/hooks/useOneClickSwap.ts` — hook for One‑Click operations + orchestration.

## Incremental Milestones
1) Hook: token fetch + quoting + status poll
2) UI: direction + amount + quote render
3) Deposit actions (Base→NEAR using MPC; NEAR→Base using passkey)
4) Optional submit tx hash
5) Polished UX: explorer links, cost breakdown, toasts

## Testing
- Dry quote mode: verify UI handles quotes without `depositAddress`.
- Base→NEAR: end‑to‑end with small amount on Base Sepolia faucet funds.
- NEAR→Base: end‑to‑end with testnet funds.
- Verify status transitions and explorer links.

