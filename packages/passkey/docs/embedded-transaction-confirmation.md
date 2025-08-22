# Embedded Transaction Confirmation

The Web3Authn Passkey SDK provides an embedded transaction confirmation component that can be used in iframes and React applications. This component displays transaction details and provides a "Send Transaction" button that automatically dispatches to the WASM worker for validation and signing.

## Overview

The embedded transaction confirmation flow works as follows:

1. **Embedded Component**: Displays transaction details in a secure, styled component
2. **User Interaction**: User clicks "Send Transaction" button
3. **WASM Worker Dispatch**: Component dispatches transaction data to WASM worker
4. **Automatic Validation**: WASM worker validates and signs the transaction without additional UI confirmation
5. **Result Return**: Transaction result is returned to the main thread

## React Components

### EmbeddedTxConfirm

The main React component for embedded transaction confirmation.

```tsx
import { EmbeddedTxConfirm, useEmbeddedTxConfirm } from '@web3authn/passkey/react';

function TransactionPage() {
  const { handleTxConfirm } = useEmbeddedTxConfirm({
    nearAccountId: 'alice.testnet',
    onSuccess: (result) => console.log('Transaction successful:', result),
    onError: (error) => console.error('Transaction failed:', error)
  });

  return (
    <EmbeddedTxConfirm
      summary={{
        to: 'bob.testnet',
        amount: '1 NEAR',
        method: 'transfer',
        fingerprint: '0x1234567890abcdef...'
      }}
      actions={[{
        actionType: 'Transfer',
        deposit: '1000000000000000000000000' // 1 NEAR in yoctoNEAR
      }]}
      title="Confirm NEAR Transfer"
      confirmText="Send Transaction"
      onConfirm={handleTxConfirm}
      onCancel={() => console.log('Transaction cancelled')}
    />
  );
}
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `summary` | `EmbeddedTxSummary` | - | Transaction summary data (required) |
| `actions` | `EmbeddedTxAction[]` | `[]` | Transaction actions |
| `title` | `string` | `'Confirm Transaction'` | Component title |
| `cancelText` | `string` | `'Cancel'` | Cancel button text |
| `confirmText` | `string` | `'Send Transaction'` | Confirm button text |
| `variant` | `'default' \| 'warning' \| 'danger'` | `'default'` | Visual variant |
| `onConfirm` | `(txData) => void` | - | Callback when user confirms |
| `onCancel` | `() => void` | - | Callback when user cancels |
| `loading` | `boolean` | `false` | Loading state |

### Types

```typescript
interface EmbeddedTxSummary {
  to?: string;
  amount?: string;
  method?: string;
  fingerprint?: string;
}

interface EmbeddedTxAction {
  actionType: string;
  method_name?: string;
  args?: string;
  gas?: string;
  deposit?: string;
  [key: string]: any;
}
```

## React Hook

### useEmbeddedTxConfirm

A React hook that provides transaction confirmation handling with automatic WASM worker integration.

```tsx
import { useEmbeddedTxConfirm } from '@web3authn/passkey/react';

function MyComponent() {
  const { handleTxConfirm, loading, error } = useEmbeddedTxConfirm({
    nearAccountId: 'alice.testnet',
    showLoading: true,
    onSuccess: (result) => {
      console.log('Transaction signed:', result);
    },
    onError: (error) => {
      console.error('Transaction failed:', error);
    }
  });

  return (
    <div>
      <EmbeddedTxConfirm
        summary={{ to: 'bob.testnet', amount: '1 NEAR' }}
        onConfirm={handleTxConfirm}
      />
      {loading && <div>Processing transaction...</div>}
      {error && <div>Error: {error.message}</div>}
    </div>
  );
}
```

### Hook Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `nearAccountId` | `string` | - | NEAR account ID for the transaction (required) |
| `showLoading` | `boolean` | `false` | Whether to show loading state during processing |
| `onSuccess` | `(result: any) => void` | - | Callback when transaction is successfully signed |
| `onError` | `(error: Error) => void` | - | Callback when transaction fails |

### Hook Return

| Property | Type | Description |
|----------|------|-------------|
| `handleTxConfirm` | `(txData) => Promise<void>` | Function to handle transaction confirmation |
| `loading` | `boolean` | Loading state |
| `error` | `Error \| null` | Error state |

## Iframe Usage

The embedded component can be used in iframes for secure transaction confirmation:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Transaction Confirmation</title>
</head>
<body>
    <div id="transaction-confirm"></div>

    <script type="module">
        import { EmbeddedTxConfirm } from '@web3authn/passkey/react';

        // Render the component in the iframe
        const root = ReactDOM.createRoot(document.getElementById('transaction-confirm'));
        root.render(
            <EmbeddedTxConfirm
                summary={{
                    to: 'bob.testnet',
                    amount: '1 NEAR',
                    method: 'transfer'
                }}
                actions={[{
                    actionType: 'Transfer',
                    deposit: '1000000000000000000000000'
                }]}
                onConfirm={(txData) => {
                    // Send message to parent window
                    window.parent.postMessage({
                        type: 'TRANSACTION_CONFIRMED',
                        data: txData
                    }, '*');
                }}
                onCancel={() => {
                    window.parent.postMessage({
                        type: 'TRANSACTION_CANCELLED'
                    }, '*');
                }}
            />
        );
    </script>
</body>
</html>
```

## WASM Worker Integration

The embedded component automatically integrates with the WASM worker:

1. **Action Conversion**: Converts embedded action format to NEAR ActionArgs format
2. **Confirmation Config**: Sets embedded confirmation mode to bypass additional UI
3. **Worker Dispatch**: Sends transaction to WASM worker for validation and signing
4. **Result Handling**: Returns transaction result to the main thread

### Supported Action Types

- **FunctionCall**: Smart contract function calls
- **Transfer**: NEAR token transfers

### Example Action Conversion

```typescript
// Embedded action format
{
  actionType: 'FunctionCall',
  method_name: 'transfer',
  args: '{"to": "bob.testnet", "amount": "1000000000000000000000000"}',
  gas: '30000000000000',
  deposit: '0'
}

// Converted to NEAR ActionArgs format
{
  type: ActionType.FunctionCall,
  receiverId: 'bob.testnet',
  methodName: 'transfer',
  args: { to: 'bob.testnet', amount: '1000000000000000000000000' },
  gas: '30000000000000',
  deposit: '0'
}
```

## Security Features

- **Closed Shadow DOM**: Component uses closed shadow DOM for security isolation
- **Custom Events**: Uses custom events for communication between React and Lit elements
- **WASM Validation**: All transaction validation happens in secure WASM worker
- **No Additional UI**: Bypasses additional confirmation UI when using embedded mode

## Styling

The component includes built-in responsive styling with CSS custom properties:

```css
:host {
  --pk-color-bg: #f8fafc;
  --pk-color-card: #ffffff;
  --pk-color-fg: #1a202c;
  --pk-color-accent: #3182ce;
  --pk-color-danger: #e53e3e;
  --pk-color-warning: #dd6b20;
  --pk-radius: 12px;
  --pk-spacing: 12px;
}
```

## Error Handling

The component provides comprehensive error handling:

- **Action Type Validation**: Validates supported action types
- **Data Conversion**: Handles conversion errors gracefully
- **WASM Worker Errors**: Propagates worker errors to the main thread
- **User Cancellation**: Handles user cancellation gracefully

## Best Practices

1. **Always provide meaningful transaction summaries** to help users understand what they're signing
2. **Use appropriate visual variants** (warning/danger) for high-value or risky transactions
3. **Handle errors gracefully** and provide user-friendly error messages
4. **Test in iframe environments** to ensure proper isolation
5. **Use the hook for complex state management** rather than managing state manually

## Examples

### Basic Transfer

```tsx
<EmbeddedTxConfirm
  summary={{
    to: 'bob.testnet',
    amount: '1 NEAR',
    method: 'transfer'
  }}
  actions={[{
    actionType: 'Transfer',
    deposit: '1000000000000000000000000'
  }]}
  onConfirm={handleTxConfirm}
/>
```

### Smart Contract Call

```tsx
<EmbeddedTxConfirm
  summary={{
    to: 'contract.testnet',
    method: 'mint_nft',
    fingerprint: '0xabcdef123456...'
  }}
  actions={[{
    actionType: 'FunctionCall',
    method_name: 'mint_nft',
    args: '{"token_id": "123", "metadata": "..."}',
    gas: '50000000000000',
    deposit: '1000000000000000000000000'
  }]}
  variant="warning"
  title="Mint NFT"
  confirmText="Mint NFT"
  onConfirm={handleTxConfirm}
/>
```

### High-Value Transaction

```tsx
<EmbeddedTxConfirm
  summary={{
    to: 'exchange.testnet',
    amount: '100 NEAR',
    method: 'stake',
    fingerprint: '0x1234567890abcdef...'
  }}
  actions={[{
    actionType: 'FunctionCall',
    method_name: 'stake',
    args: '{"amount": "100000000000000000000000000"}',
    gas: '100000000000000',
    deposit: '100000000000000000000000000'
  }]}
  variant="danger"
  title="Stake 100 NEAR"
  confirmText="Confirm Stake"
  onConfirm={handleTxConfirm}
/>
```
