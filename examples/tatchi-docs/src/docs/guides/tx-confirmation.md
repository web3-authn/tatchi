---
title: Transaction Confirmation
---

# Transaction Confirmation

Present transaction details to users for approval before signing. The SDK renders confirmation UI in the isolated wallet iframe, preventing your application code from manipulating what users see.

## Approaches

### 1. Programmatic (Headless)

```typescript
const result = await passkeyManager.executeAction('alice.testnet', {
  type: 'FunctionCall',
  receiverId: 'token.testnet',
  methodName: 'ft_transfer',
  args: { receiver_id: 'bob.testnet', amount: '1000000000000000000' },
  gas: '50000000000000',
  deposit: '1'
})
```

Full UI control. SDK shows modal (if enabled), signs in WASM worker, broadcasts, returns result.

### 2. SDK Button (React)

```tsx
<SendTxButtonWithTooltip
  nearAccountId="alice.testnet"
  txSigningRequests={[{
    receiverId: 'token.testnet',
    actions: [{
      type: ActionType.FunctionCall,
      methodName: 'ft_transfer',
      args: { receiver_id: 'bob.testnet', amount: '1000000000000000000' },
      gas: '50000000000000',
      deposit: '1'
    }]
  }]}
  options={{
    afterCall: (success, result) => {},
    onError: (error) => {},
    onCancel: () => {}
  }}
>
  Send Token
</SendTxButtonWithTooltip>
```

SDK manages button and confirmation. Less control, faster implementation.

## Configuration

```typescript
// Enable/disable confirmation modal
await passkeyManager.setPreConfirmFlow(true)  // Recommended for production

// Confirmation behavior
await passkeyManager.setConfirmBehavior('requireClick')  // Explicit approval (recommended)
await passkeyManager.setConfirmBehavior('autoProceed')   // Auto-confirm after brief display
```

Settings persist in IndexedDB per account.

## Batching

```tsx
txSigningRequests={[
  { receiverId: 'contract.testnet', actions: [stakingAction] },
  { receiverId: 'recipient.testnet', actions: [transferAction] },
  { receiverId: 'contract.testnet', actions: [claimAction, transferAction] }
]}
```

Transactions execute sequentially. If one fails, subsequent transactions don't execute.

## Step Management

```typescript
enum TxStep {
  STEP_1_PREPARING = 1,
  STEP_2_USER_CONFIRMATION = 2,  // iframe overlay expands, always keep visible
  STEP_3_SIGNING = 3,
  STEP_4_BROADCASTING = 4,
  STEP_5_COMPLETE = 5
}
```

During `STEP_2_USER_CONFIRMATION`, the wallet iframe overlay expands to ensure modal visibility. Don't hide this step in custom progress indicators.

## Troubleshooting

**Modal not appearing**: Check `preConfirmFlow` enabled, iframe initialized (`waitForWalletReady()`), z-index conflicts.

**Modal visible but can't click**: Check `pointer-events: auto` on `#wallet-iframe-overlay`, z-index > app elements, CSP allows iframe interaction.

**Signs but broadcast fails**: Network/RPC issues, nonce collision (SDK retries automatically), insufficient gas.

**Button doesn't trigger**: Verify `nearAccountId` valid, `PasskeyProvider` wraps component, passkey registered for account.

## Security

**Isolation**: Confirmation UI runs in wallet iframe, isolated from app code. Never bypass this.

**Contract validation**: Client-side confirmation is UX, not security. Always validate in smart contracts:

```rust
require!(amount > 0, "Amount must be positive");
require!(amount <= self.balance, "Insufficient balance");
```

## See Also

- [Nonce Manager](./nonce-manager.md) - Concurrent transaction handling
- [Security Model](../concepts/security-model.md) - Defense-in-depth architecture
- [Wallet Iframe](./wallet-iframe.md) - Origin isolation
