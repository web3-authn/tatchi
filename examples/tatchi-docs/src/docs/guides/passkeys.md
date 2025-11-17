---
title: Passkeys (WebAuthn)
---

# Passkeys (WebAuthn)

Register and authenticate users with platform passkeys (TouchID, FaceID, Windows Hello). The SDK handles the complete flow from WebAuthn credential creation to NEAR account setup, with all cryptographic operations isolated in Web Workers for security.

## What Are Passkeys?

Passkeys are the industry-standard replacement for passwords, built on the WebAuthn specification. Instead of typing a password, users authenticate with biometrics or device PINs. Passkeys sync across devices through iCloud Keychain (Safari) and Google Password Manager (Chrome), providing automatic backup and recovery.

## Register

```tsx
import { useTatchi } from '@tatchi-xyz/sdk/react'

export function Register({ accountId }: { accountId: string }) {
  const { registerPasskey } = useTatchi()
  return (
    <button
      onClick={() =>
        registerPasskey(accountId, {
          onEvent: (e) => {
            // After step 2, keys are generated and user can login immediately
            // (remaining steps complete in the background)
            if (e.step === 2 && e.status === 'success') {
              console.info('Login is now enabled - user can sign in')
            }
          },
        })
      }
    >
      Register Passkey
    </button>
  )
}
```

Key steps emitted by the SDK (abridged):

- 1 `webauthn-verification`: Verify WebAuthn attestation/PRF
- 2 `key-generation`: Keys derived; login can be enabled
- 3 `contract-pre-check`: Lightweight contract/account checks
- 4 `access-key-addition`: Create NEAR account / add key (relay)
- 5 `contract-registration`: Register on contract (relay)
- 6 `account-verification`: Post-commit on-chain key check
- 7 `database-storage`: Store authenticator metadata
- 8 `registration-complete`: Done

### Handling Registration Events

The SDK emits events for each step, allowing you to provide real-time progress feedback to users. Importantly, **users can log in after step 2 completes**, even while remaining steps (account creation, contract registration) finish in the background.

```ts
type RegistrationStatus = 'progress' | 'success' | 'error'

function onRegistrationEvent(e: { step: number; status: RegistrationStatus; message: string }) {
  switch (e.step) {
    case 1: ui.progress('Verifying passkey…'); break;
    case 2: ui.enableLogin(); ui.progress('Keys generated — creating account…'); break;
    case 3: ui.progress('Pre‑checking contract and account…'); break;
    case 4: e.status === 'error' ? ui.fatal('Account creation failed') : ui.progress('Adding access key…'); break;
    case 5: e.status === 'error' ? ui.warn('Contract registration failed') : ui.progress('Registering…'); break;
    case 6: e.status === 'error' && ui.warn('On‑chain key verification failed'); break;
    case 7: e.status === 'error' && ui.warn('Local storage failed'); break;
    case 8: ui.success('Registration complete!'); break;
    case 0: ui.fatal('Registration failed'); break;
  }
}
```

**Important considerations**:
- **Steps 4-5 are critical**: If account creation or contract registration fails, abort the entire registration flow
- **Wait for step 6 before persisting**: Only save registration data after on-chain verification confirms the access key is active
- **Keep UI responsive**: Enable the login button after step 2, but show background progress for remaining steps

## Login

```tsx
import { useTatchi } from '@tatchi-xyz/sdk/react'

export function Login({ accountId }: { accountId: string }) {
  const { loginPasskey } = useTatchi()
  return <button onClick={() => loginPasskey(accountId)}>Login</button>
}
```

### Smooth Login With Shamir 3-Pass

If you've configured a relay server, the SDK can unlock the VRF keypair without prompting for TouchID/FaceID on repeat logins. This uses the Shamir 3-pass protocol, where the client and relay server cooperate to decrypt keys without either party seeing the plaintext.

**What happens during login**:
1. SDK attempts to unlock using cached Shamir-encrypted data
2. If successful, user logs in without biometric prompt
3. If Shamir unlock fails (expired session, rotated keys), SDK falls back to TouchID/FaceID
4. Background key rotation happens automatically if the server has rotated its Shamir keypair

This provides a session-like experience while maintaining security—the relay server never has access to your private keys or key-encryption keys.

## Use the Credential (transactions)

```ts
const result = await passkeyManager.executeAction('alice.testnet', {
  type: 'FunctionCall',
  receiverId: 'contract.testnet',
  methodName: 'set_greeting',
  args: { message: 'hello' },
  gas: '50000000000000',
  deposit: '0',
})
```

## How It Works Under The Hood

**PRF Extension**: The SDK uses WebAuthn's PRF (Pseudorandom Function) extension to deterministically derive NEAR keys from your passkey. The same passkey always produces the same blockchain keys, enabling key recovery when you sign in on a new device.

**Worker-Based Signing**: All cryptographic operations happen in isolated Web Workers. Private keys are decrypted, used to sign transactions, and immediately cleared from memory—all without ever entering the main JavaScript thread where your application code and third-party libraries run.

**IndexedDB Storage**: Encrypted private keys are stored locally in IndexedDB. The encryption key is derived from PRF outputs, so only someone with access to your passkey can decrypt the keys.

## Additional Resources

For more details on passkey behavior and credential scoping:
- [Wallet-Scoped vs App-Scoped Credentials](../concepts/wallet-scoped-credentials.md) - Choose the right rpId strategy
- [Transaction Confirmation](./tx-confirmation.md) - Secure transaction signing flows
- [Wallet Iframe Architecture](./wallet-iframe.md) - How origin isolation protects keys
- [Device Linking](./device-linking.md) - Cross-device passkey sync and recovery
