# Transaction Confirmation Guide

This guide covers the Web3Authn Passkey SDK's transaction confirmation system API and usage examples.

## User Settings

### Configuration

```typescript
import { PasskeyManager } from '@web3authn/passkey';

const passkeyManager = new PasskeyManager(config);

// Set user preferences (automatically saved to IndexedDB)
passkeyManager.setPreConfirmFlow(true); // Enable confirmation before contract verification
passkeyManager.setConfirmBehavior('autoProceed'); // or 'requireClick'
```

### Available Settings

- `usePreConfirmFlow` (boolean, default: true): Enable/disable confirmation flow
- `confirmBehavior` ('requireClick' | 'autoProceed', default: 'requireClick'): UI behavior

## Optional Transaction Confirmation

### Basic Usage

```typescript
// Enable confirmation flow
signerWorkerManager.setPreConfirmFlow(true);
signerWorkerManager.setConfirmBehavior('requireClick');

// Sign transactions (confirmation will be requested automatically)
const result = await passkeyManager.executeAction('alice.testnet', {
  type: ActionType.Transfer,
  receiverId: 'bob.testnet',
  amount: '1000000000000000000000000'
});
```

### Custom Confirmation Handler

```typescript
// Handle confirmation requests
signerWorkerManager.onSecureConfirmRequest = async (message) => {
  const confirmed = await showCustomConfirmationDialog(message.data);
  return confirmed;
};
```

## Embedded Transaction Confirmation

### React Component

```tsx
import { SecureTxConfirmButton } from '@web3authn/passkey/react';

<SecureTxConfirmButton
  nearAccountId="user.near"
  actionArgs={actions}
  color="#667eea"
  buttonStyle={{ width: '200px', height: '44px' }}
  tooltipStyle={{
    width: '280px',
    height: 'auto',
    position: 'top-center',
    offset: '8px'
  }}
  onSuccess={handleSuccess}
  onError={handleError}
  onCancel={handleCancel}
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `nearAccountId` | `string` | - | NEAR account ID (required) |
| `actionArgs` | `ActionArgs \| ActionArgs[]` | - | Transaction actions (required) |
| `color` | `string` | `'#667eea'` | Button color |
| `buttonStyle` | `React.CSSProperties` | `{}` | Custom button styles |
| `buttonHoverStyle` | `React.CSSProperties` | `{}` | Custom hover styles |
| `tooltipStyle` | `TooltipStyle` | - | Tooltip configuration |
| `onSuccess` | `(result: any) => void` | - | Success callback |
| `onError` | `(error: Error) => void` | - | Error callback |
| `onCancel` | `() => void` | - | Cancel callback |

### TooltipStyle Interface

```typescript
interface TooltipStyle {
  width: string;
  height: string;
  position: 'top-left' | 'top-center' | 'top-right' | 'left' | 'right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  offset: string;
}
```

## API Reference

### PasskeyManager Methods

```typescript
// User settings
passkeyManager.setPreConfirmFlow(enabled: boolean): void
passkeyManager.setConfirmBehavior(behavior: 'requireClick' | 'autoProceed'): void

// Transaction execution
passkeyManager.executeAction(accountId: string, action: ActionArgs): Promise<any>
passkeyManager.signTransactionsWithActions(options: SignOptions): Promise<any>
```

### SignerWorkerManager Methods

```typescript
// Configuration
signerWorkerManager.setPreConfirmFlow(enabled: boolean): void
signerWorkerManager.setConfirmBehavior(behavior: 'autoProceed' | 'requireClick'): void

// Custom handlers
signerWorkerManager.onSecureConfirmRequest: (message: SecureConfirmMessage) => Promise<boolean>
```

### React Hooks

```typescript
// Context hook
const { passkeyManager, loginPasskey } = usePasskeyContext();
```

## Examples

### Basic Transfer

```tsx
<SecureTxConfirmButton
  nearAccountId="alice.testnet"
  actionArgs={[{
    type: 'Transfer',
    receiverId: 'bob.testnet',
    amount: '1000000000000000000000000'
  }]}
  onSuccess={(result) => console.log('Transfer successful:', result)}
  onError={(error) => console.error('Transfer failed:', error)}
/>
```

### Smart Contract Call

```tsx
<SecureTxConfirmButton
  nearAccountId="alice.testnet"
  actionArgs={[{
    type: 'FunctionCall',
    receiverId: 'contract.testnet',
    methodName: 'mint_nft',
    args: { token_id: '123', metadata: '...' },
    gas: '50000000000000',
    deposit: '1000000000000000000000000'
  }]}
  buttonStyle={{ backgroundColor: '#ff6b6b' }}
  onSuccess={handleSuccess}
/>
```

### High-Value Transaction

```tsx
<SecureTxConfirmButton
  nearAccountId="alice.testnet"
  actionArgs={[{
    type: 'FunctionCall',
    receiverId: 'exchange.testnet',
    methodName: 'stake',
    args: { amount: '100000000000000000000000000' },
    gas: '100000000000000',
    deposit: '100000000000000000000000000'
  }]}
  buttonStyle={{
    backgroundColor: '#e53e3e',
    color: 'white',
    fontWeight: 'bold'
  }}
  tooltipStyle={{
    width: '320px',
    height: 'auto',
    position: 'top-center',
    offset: '12px'
  }}
  onSuccess={handleSuccess}
  onError={handleError}
/>
```

### Complete Workflow

```typescript
// 1. Initialize and login
const passkeyManager = new PasskeyManager(config);
await passkeyManager.loginPasskey('alice.testnet');

// 2. Configure user preferences
passkeyManager.setPreConfirmFlow(true);
passkeyManager.setConfirmBehavior('autoProceed');

// 3. Execute transactions (will use saved preferences)
const result = await passkeyManager.executeAction('alice.testnet', {
  type: ActionType.Transfer,
  receiverId: 'bob.testnet',
  amount: '1000000000000000000000000'
});
```
