# NEP-413 Message Signing Usage Examples

This document demonstrates how to use the NEP-413 message signing functionality in the PasskeyManager.

## Basic Usage

### Simple Message Signing

```typescript
import { PasskeyManager } from '@web3authn/passkey';

const passkeyManager = new PasskeyManager({
  nearRpcUrl: 'https://rpc.testnet.near.org',
  nearNetwork: 'testnet',
  contractId: 'web3-authn-v4.testnet',
  relayerAccount: 'relayer.testnet'
});

// Sign a message (requires user to be authenticated via VRF)
const result = await passkeyManager.signNEP413Message('alice.near', {
  message: 'Hello World',
  recipient: 'app.example.com',
  state: 'optional-state'
});

if (result.success) {
  console.log('Signature:', result.signature);
  console.log('Public key:', result.publicKey);
  console.log('Account ID:', result.accountId);
  console.log('State:', result.state);
} else {
  console.error('Signing failed:', result.error);
}
```

## Authentication Requirements

The NEP-413 signing function requires the user to be authenticated via Web3Authn (Webauthn + VRF challenges). This means:
1. **User must be logged in**: The user must have completed a VRF authentication session
2. **VRF session must be active**: The VRF session must not have expired
3. **Account must match**: The VRF session must be for the same account being used for signing

If these conditions are not met, the function will throw an error with a descriptive message.

## Advanced Usage with Event Handling

```typescript
const result = await passkeyManager.signNEP413Message('alice.near', {
  message: 'Hello World',
  recipient: 'app.example.com',
  state: 'session-123'
}, {
  onEvent: (event) => {
    console.log(`Step ${event.step}: ${event.message}`);
    // Update UI progress
  },
  onError: (error) => {
    console.error('Signing error:', error);
    // Handle error in UI
  }
});
```

## NEP-413 Specification Compliance

The implementation follows the NEP-413 standard:

1. **Message Structure**: Creates a payload with message, recipient, nonce, and optional state
2. **Nonce Generation**: Automatically generates a cryptographically secure 32-byte random nonce
3. **Serialization**: Uses Borsh encoding for the payload
4. **Prefix**: Adds the NEP-413 prefix (2^31 + 413 = 2147484061)
5. **Hashing**: Computes SHA-256 hash of the prefixed data
6. **Signing**: Signs the hash using Ed25519 with the user's passkey-derived private key
7. **Output**: Returns base64-encoded signature with account ID and public key

