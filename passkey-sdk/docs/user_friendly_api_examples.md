# Passkey SDK - Actions API

This document demonstrates the user-friendly API for creating NEAR actions, which follows near-js patterns and provides better TypeScript support.

### API

```typescript
import { ActionType, type FunctionCallAction } from '@web3authn/passkey';

// Clear, type-safe interface with only relevant fields
const newAction: FunctionCallAction = {
  type: ActionType.FunctionCall,
  receiverId: 'contract.near',
  methodName: 'set_greeting',
  args: { message: 'Hello' }, // Automatic JSON conversion
  gas: '30000000000000',
  deposit: '0'
  // Only FunctionCall-specific fields available
};

await passkeyManager.executeAction('alice.near', newAction);
```

## Action Types & Examples

### 1. Function Call Action

Call smart contract methods with automatic JSON serialization:

```typescript
import { functionCall, ActionType, type FunctionCallAction } from '@web3authn/passkey';

// Using helper function (recommended)
const action = functionCall({
  receiverId: 'contract.near',
  methodName: 'set_greeting',
  args: { message: 'Hello World!' },
  gas: '30000000000000', // optional, has default
  deposit: '0' // optional, defaults to '0'
});

// Or create directly
const action: FunctionCallAction = {
  type: ActionType.FunctionCall,
  receiverId: 'contract.near',
  methodName: 'transfer',
  args: {
    receiver_id: 'bob.near',
    amount: '1000000000000000000000000'
  },
  gas: '50000000000000',
  deposit: '1' // 1 yoctoNEAR attachment
};

await passkeyManager.executeAction('alice.near', action);
```

### 2. Transfer Action

Send NEAR tokens directly:

```typescript
import { transfer, ActionType, type TransferAction } from '@web3authn/passkey';

// Using helper function
const action = transfer({
  receiverId: 'bob.near',
  amount: '1000000000000000000000000' // 1 NEAR in yoctoNEAR
});

// Or create directly
const action: TransferAction = {
  type: ActionType.Transfer,
  receiverId: 'bob.near',
  amount: '5000000000000000000000000' // 5 NEAR
};

await passkeyManager.executeAction('alice.near', action);
```

### 3. Create Account Action

Create a new NEAR account:

```typescript
import { createAccount } from '@web3authn/passkey';

const action = createAccount({
  receiverId: 'newuser.alice.near'
});

await passkeyManager.executeAction('alice.near', action);
```

### 4. Add Key Actions

Add access keys with proper type safety:

```typescript
import { addFullAccessKey, addFunctionCallKey } from '@web3authn/passkey';

// Full access key
const fullAccessAction = addFullAccessKey({
  receiverId: 'alice.near',
  publicKey: 'ed25519:...'
});

// Function call key with restrictions
const functionCallAction = addFunctionCallKey({
  receiverId: 'alice.near',
  publicKey: 'ed25519:...',
  contractId: 'contract.near', // optional, defaults to receiverId
  allowance: '1000000000000000000000000', // 1 NEAR allowance
  methodNames: ['view_method', 'change_method'] // empty = all methods
});

await passkeyManager.executeAction('alice.near', fullAccessAction);
```

### 5. Multi-Action Transactions

Execute multiple actions in a single transaction:

```typescript
import { functionCall, transfer } from '@web3authn/passkey';

// Create multiple actions
const actions: ActionArgs[] = [
  transfer({
    receiverId: 'bob.near',
    amount: '1000000000000000000000000'
  }),
  functionCall({
    receiverId: 'contract.near',
    methodName: 'log_transfer',
    args: { from: 'alice.near', to: 'bob.near', amount: '1' }
  })
];

// Execute each action (batch transactions require custom implementation)
for (const action of actions) {
  await passkeyManager.executeAction('alice.near', action);
}
```

## Advanced Examples

### Contract Interaction with Error Handling

```typescript
import { functionCall, type ActionResult } from '@web3authn/passkey';

try {
  const action = functionCall({
    receiverId: 'defi-contract.near',
    methodName: 'swap',
    args: {
      token_in: 'usdt.near',
      token_out: 'usdc.near',
      amount_in: '1000000', // 1 USDT
      min_amount_out: '990000' // 0.99 USDC minimum
    },
    gas: '100000000000000', // Higher gas for complex operations
    deposit: '1' // 1 yoctoNEAR for storage
  });

  const result: ActionResult = await passkeyManager.executeAction(
    'trader.near',
    action,
    {
      onEvent: (event) => {
        console.log('Transaction progress:', event);
      },
      onError: (error) => {
        console.error('Transaction failed:', error);
      }
    }
  );

  if (result.success) {
    console.log('Swap successful! Transaction ID:', result.transactionId);
  }
} catch (error) {
  console.error('Failed to execute swap:', error);
}
```

### Account Management

```typescript
import { addFunctionCallKey, deleteKey, deleteAccount } from '@web3authn/passkey';

// Add a restricted key for a dApp
const addKeyAction = addFunctionCallKey({
  receiverId: 'user.near',
  publicKey: await dappPublicKey,
  contractId: 'game.near',
  allowance: '100000000000000000000000', // 0.1 NEAR
  methodNames: ['play_game', 'claim_reward']
});

// Remove an old key
const removeKeyAction = deleteKey({
  receiverId: 'user.near',
  publicKey: 'ed25519:...'
});

// Close account and send funds to main account
const closeAction = deleteAccount({
  receiverId: 'temp-account.user.near',
  beneficiaryId: 'user.near'
});
```

## Type Safety Benefits

### Compile-Time Validation

```typescript
// ✅ This compiles - all required fields present
const validAction: FunctionCallAction = {
  type: 'FunctionCall',
  receiverId: 'contract.near',
  methodName: 'method',
  args: {}
};

// ❌ This won't compile - missing required fields
const invalidAction: FunctionCallAction = {
  type: 'FunctionCall',
  receiverId: 'contract.near'
  // Error: Property 'methodName' is missing
};

// ❌ This won't compile - wrong field for action type
const wrongFieldAction: TransferAction = {
  type: 'Transfer',
  receiverId: 'bob.near',
  methodName: 'transfer' // Error: Property 'methodName' does not exist on type 'TransferAction'
};
```


