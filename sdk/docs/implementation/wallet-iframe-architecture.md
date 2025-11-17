# Wallet Iframe Architecture

This document explains how Web3Authn isolates sensitive cryptographic operations in a secure, cross-origin iframe while maintaining a simple developer experience. The architecture ensures that private keys and credentials never leave the wallet's origin, even when embedded in third-party applications.

## Overview

Web3Authn uses a hidden "wallet service" iframe to handle all security-critical operations. When you integrate the SDK into your application, it communicates with this iframe using a secure message-passing protocol. User-visible elements (like confirmation modals) appear when needed but remain hosted on the wallet's origin to satisfy browser security requirements.

## Design Goals

**Security First**: All sensitive components run exclusively in the wallet iframe:
- WebAuthn credential management
- Cryptographic signing operations (via Web Workers)
- Encrypted key storage in IndexedDB
- PRF (Pseudo-Random Function) operations

**Developer-Friendly API**: The `TatchiPasskey` SDK provides a clean interface that abstracts away the underlying iframe communication. You call methods like `register()` and `signTransactions()` just like any other JavaScript library.

**No Browser Popups**: User interactions happen through inline UI elements (modals or embedded buttons) hosted on the wallet origin, eliminating popup blockers and improving UX.

## Architecture Components

### Your Application (Parent Window)

The SDK you integrate into your app provides a straightforward API surface:

```javascript
const client = createWeb3AuthnClient({ walletOrigin: 'https://wallet.example.com' });
await client.init();
const result = await client.signTransactions({ nearAccountId, transactions });
```

Behind the scenes, the SDK:
1. Mounts an invisible iframe pointing to the wallet service
2. Establishes a secure `MessageChannel` connection
3. Translates your API calls into typed RPC messages
4. Handles request correlation, timeouts, and cancellation
5. Returns only the final results (signed transactions, credentials, etc.)

### Wallet Service Iframe (Wallet Origin)

The hidden iframe hosts the security-critical infrastructure:

**Initialization**: The iframe loads from the wallet's domain with strict security headers (COOP/COEP + Permissions-Policy). In development, it can be served locally via the Vite plugin.

**Worker Management**: It spawns dedicated Web Workers for:
- **Signer Worker**: Handles PRF-based key derivation, decryption, and transaction signing
- **VRF Worker**: Manages challenge generation and verification

**Storage Layer**: All persistent data lives in IndexedDB on the wallet origin:
- Encrypted key material
- User preferences and metadata
- Authenticator records
- VRF state

**RPC Handlers**: The iframe implements message handlers that:
- Perform WebAuthn operations (`navigator.credentials.create/get`)
- Coordinate with Web Workers for cryptographic operations
- Return only non-sensitive results (signed transactions, public keys, status codes)

**User Interface**: When user interaction is needed, the iframe shows a confirmation modal or embedded button—all within the wallet's origin to satisfy browser security requirements. No popups are ever opened.

## Security Boundaries

### What Lives Where

**Parent Application (Your Domain)**:
- The `TatchiPasskey` SDK facade
- Non-sensitive utility functions (like digest formatting)
- UI state and application logic
- **Never handles**: PRF outputs, decrypted keys, or raw credentials

**Wallet Iframe (Wallet Domain)**:
- `WebAuthnManager` - Calls `navigator.credentials.*` with PRF extensions
- `SignerWorkerManager` + Worker - Performs PRF-based decryption, key derivation, and signing
- `VrfWorkerManager` + Worker - Generates and verifies cryptographic challenges
- `IndexedDBManager` - Manages both databases:
  - `passkeyClientDB`: User metadata, preferences, authenticator cache
  - `passkeyNearKeysDB`: Encrypted key material
- Optional NEAR RPC client (blockchain metadata like nonces and block hashes can also come from the parent since they're not secrets)

### User Interaction Surfaces

All UI elements that capture user gestures for WebAuthn operations must be on the wallet's origin:

**Modal Flow**: The `<w3a-tx-confirmer>` component appears inline within the wallet iframe to capture the user's click, then disappears after confirmation.

**Embedded Flow**: The `IframeButtonWithTooltipConfirmer` runs in its own visible iframe (also on the wallet origin) and handles both the click capture and WebAuthn operation.

## Initialization Flow

When your application starts up, here's what happens:

1. **SDK Construction**: You create a `TatchiPasskey` instance with configuration:
   ```javascript
   {
     walletOrigin: 'https://wallet.example.com',
     walletServicePath: '/wallet-service' // optional, defaults to /wallet-service
   }
   ```

2. **Iframe Mount**: The SDK creates a hidden iframe pointing to `${walletOrigin}${walletServicePath}` and creates a `MessageChannel` for secure communication.

3. **Handshake**:
   - Parent sends a `CONNECT` message via `window.postMessage`, transferring one port of the MessageChannel
   - Wallet iframe receives the port and responds with `READY { protocolVersion }`
   - Connection is now established on the secure channel

4. **Configuration**: The parent sends setup messages:
   - `PING` to verify liveness (wallet responds with `PONG`)
   - `PM_SET_CONFIG` to provide RPC URLs, contract IDs, theme preferences, and asset base paths

5. **Prewarming**: The wallet iframe initializes its workers, opens IndexedDB connections, and applies theme settings to its DOM.

The SDK is now ready to handle your API calls.

## Communication Protocol

### Bootstrap Phase

The initial handshake uses `window.postMessage` to establish the secure channel:
- Parent sends `CONNECT` with a `MessagePort` transfer
- Wallet responds with `READY` on the MessagePort
- All subsequent messages use the MessagePort exclusively

### Message Format

All messages follow a typed envelope structure:
```typescript
{
  type: 'PING' | 'PM_REGISTER' | 'PM_RESULT' | ...,
  requestId?: string,  // for request/response correlation
  payload?: any
}
```

### Message Types

**Parent → Wallet**:
- `PING` - Health check
- `PM_SET_CONFIG` - Configure RPC endpoints, contract IDs, theme
- `PM_REGISTER` - Register a new passkey
- `PM_LOGIN` - Authenticate with existing passkey
- `PM_SIGN_TXS_WITH_ACTIONS` - Sign transactions with user confirmation
- `PM_SIGN_AND_SEND_TXS` - Sign and broadcast transactions
- `PM_SEND_TRANSACTION` - Send a pre-signed transaction
- `PM_SET_CONFIRMATION_CONFIG` - Update transaction confirmation settings
- `PM_SET_THEME` - Change theme preferences
- `PM_CANCEL` - Cancel an in-progress operation

**Wallet → Parent**:
- `READY` - Initialization complete, includes protocol version
- `PONG` - Health check response
- `PROGRESS` - Status updates during long operations
- `PM_RESULT { ok, result }` - Successful operation result
- `ERROR { code, message }` - Operation failed

### Request Lifecycle

1. Parent sends a request with a unique `requestId`
2. Wallet may send multiple `PROGRESS` events to update status
3. Wallet sends final `PM_RESULT` or `ERROR` with the same `requestId`
4. Parent can send `PM_CANCEL` at any time to abort the operation

## WebAuthn and User Activation

### Browser Requirements

WebAuthn operations require user gestures and proper permission delegation:

**Iframe Permissions**: The wallet iframe includes these `allow` attributes:
```html
<iframe allow="publickey-credentials-get; publickey-credentials-create; clipboard-write">
```

**HTTP Headers**: The wallet origin sets `Permissions-Policy` headers to delegate these capabilities. Development helpers (`tatchiHeaders`, `tatchiBuildHeaders`) are provided to simplify setup.

### Safari Cross-Origin Bridge

Safari sometimes blocks WebAuthn in cross-origin iframes. When this happens:

1. Wallet iframe detects the block and sends a bridge request to the parent
2. Parent verifies the request comes from the trusted wallet origin
3. Parent runs WebAuthn at the top level (where it's allowed)
4. Parent serializes the credential and PRF outputs and sends them back to the wallet
5. Wallet continues with signing operations

This fallback ensures compatibility across all browsers while maintaining security—credentials are still returned to the wallet origin for processing.

## Complete Transaction Signing Flow

Here's what happens when a user signs a transaction—no popups involved:

1. **User Action**: Your application calls `signTransactions()` within a click handler or other user gesture.

2. **Request Forwarding**: The SDK sends a `PM_SIGN_TXS_WITH_ACTIONS` message to the wallet iframe with transaction details.

3. **UI Presentation**: The wallet iframe displays the `<w3a-tx-confirmer>` modal (on the wallet origin) showing transaction details and a confirmation button.

4. **User Confirmation**: User clicks "Confirm" in the modal, which counts as a user gesture within the wallet origin.

5. **WebAuthn Operation**: The wallet iframe calls `navigator.credentials.get()` with PRF extension enabled. The credential and PRF output stay within the wallet iframe—they never cross origins.

6. **Signing**: The wallet iframe sends the PRF output to its signer worker, which:
   - Derives the signing key
   - Signs each transaction
   - Returns signed transactions

7. **Response**: The wallet iframe sends only the signed transactions back to your application. The modal closes, and the hidden service iframe remains mounted for future operations.

### Embedded Button Variant

When using the embedded button flow, WebAuthn runs directly in the visible embedded iframe (which is also on the wallet origin). Since it shares the origin with the service iframe, it can forward results to the signer worker directly.

## Web Workers and WebAssembly

The wallet iframe creates dedicated Web Workers for compute-intensive cryptographic operations:

```javascript
// Signer worker for transaction signing
new Worker(
  new URL('web3authn-signer.worker.js', import.meta.url),
  { type: 'module' }
);

// VRF worker for challenge generation
new Worker(
  new URL('web3authn-vrf.worker.js', import.meta.url),
  { type: 'module' }
);
```

**WASM Module Loading**: Ensure WebAssembly files are bundled with the wallet and resolve relative paths correctly using `resolveWasmUrl` helpers.

**Optional Security**: You can fetch WASM bytes and verify their SHA-256 hash before initialization to ensure integrity.

## Data Storage Strategy

### IndexedDB Databases

All persistent storage lives on the wallet origin in two IndexedDB databases:

**`passkeyNearKeysDB`**: Stores encrypted key material
- Private key blobs (encrypted with PRF-derived keys)
- Key metadata and derivation parameters

**`passkeyClientDB`**: Stores user data and preferences
- User account records
- Authenticator information and capabilities
- UI preferences (theme, confirmation settings)
- VRF metadata and challenge history

### Data Access Pattern

The wallet iframe is the single source of truth for all data. Your application never reads or writes to these databases directly—all access goes through the RPC protocol.

For improved responsiveness, the SDK may cache non-sensitive UI state (like theme preferences) in memory, but always treats the wallet iframe as authoritative.

### Migration from Legacy Implementations

If you have an existing implementation that stored data on the parent origin, you can migrate:

1. Parent reads encrypted key blobs from its local storage
2. Parent sends `PM_IMPORT_KEYS` message with the encrypted data
3. Wallet iframe validates and stores the keys in its IndexedDB
4. Parent can safely delete its local copy

This is a one-time migration—subsequent operations use the wallet origin exclusively.

## SDK API Surface

### Developer Experience

The `TatchiPasskey` SDK maintains a consistent API that feels local to your application. Methods like `storeAuthenticator()`, `getConfirmationConfig()`, and `getTheme()` work synchronously from your perspective, even though they're forwarded to the wallet iframe under the hood.

### Available RPC Methods

**User and Account Management**:
```typescript
getUser(accountId: string)
getLastUser()
setLastUser(accountId: string, deviceNumber: number)
hasPasskeyCredential(accountId: string)
```

**Preferences**:
```typescript
getPreferences(accountId: string)
updatePreferences(accountId: string, partial: Partial<Preferences>)
getConfirmationConfig(accountId: string)
getTheme(accountId: string)
setTheme(accountId: string, theme: Theme)
toggleTheme(accountId: string)
```

**Authenticator Management**:
```typescript
getAuthenticatorsByUser(accountId: string)
storeAuthenticator(record: AuthenticatorRecord)
```

The wallet iframe validates all inputs, updates its IndexedDB, and returns typed results. Your application may cache non-sensitive data briefly for UI responsiveness, but always treats the wallet as the source of truth.

## Error Handling and Progress Tracking

### Standardized Error Format

All errors follow a consistent structure across the RPC boundary and SDK APIs:

```typescript
{
  code: string,        // Machine-readable error code
  message: string,     // Human-readable description
  details?: any        // Optional additional context
}
```

Common error codes include authentication failures, timeout errors, user cancellations, and WebAuthn-specific errors.

### Timeouts and Cancellation

Every RPC request has a timeout to prevent indefinite waiting. If an operation takes too long or the user navigates away, the SDK automatically cancels the request.

You can also manually cancel operations by sending a `PM_CANCEL` message with the request ID.

### Progress Events

Long-running operations (like transaction signing or WebAuthn credential creation) emit `PROGRESS` events to keep your UI responsive:

```typescript
{
  type: 'PROGRESS',
  requestId: 'req-123',
  payload: {
    status: 'awaiting_confirmation',
    message: 'Waiting for user to confirm transaction'
  }
}
```

This lets you show loading states, progress bars, or status messages to users.

## Security Best Practices

### Asset Hosting

**Self-host everything**: The wallet origin should serve all JavaScript, CSS, and WASM files from its own domain. Never load wallet code from third-party CDNs at runtime.

**Integrity verification**: Fingerprint your bundles and use Subresource Integrity (SRI) hashes on script tags where possible. For WASM modules, verify SHA-256 checksums before initialization.

### Content Security Policy

Deploy a strict CSP on the wallet origin:

```
Content-Security-Policy:
  default-src 'none';
  script-src 'self' 'strict-dynamic';
  connect-src 'self' https://rpc.trusted-domain.com;
  img-src 'self';
  style-src 'self';
  worker-src 'self' blob:;
  object-src 'none';
  base-uri 'none';
  require-trusted-types-for 'script'
```

The `require-trusted-types-for 'script'` directive enables Trusted Types, which helps prevent DOM XSS attacks.

### Permissions Policy

Set appropriate iframe permissions:

```html
<iframe allow="publickey-credentials-get; publickey-credentials-create">
```

### Data Isolation

**Critical rule**: PRF outputs and WebAuthn credentials must never leave the wallet origin. Only return derived results (signed transactions, public keys, status codes) to the parent application.

### HTTPS Only

Both the wallet origin and parent application must use HTTPS in production. WebAuthn won't work over insecure connections.

## WebAuthn Origin and Relying Party Configuration

### Wallet-Scoped Credentials (Recommended)

The wallet origin should act as the WebAuthn Relying Party (RP):

**RP ID**: Set to the wallet's domain or its registrable suffix (e.g., `wallet.example.com` or `example.com`).

**Related Origin Requests (ROR)**: When the wallet is embedded in third-party sites, you need to allow those origins via the `/.well-known/webauthn` file:

```json
{
  "origins": [
    "https://app1.example.com",
    "https://app2.example.com"
  ]
}
```

This tells browsers that credentials created on `wallet.example.com` can be used when the wallet iframe is embedded in these approved origins.

### Smart Contract Verification

Your blockchain smart contract should validate credentials using the wallet's RP ID. Ensure on-chain checks accept:
- The correct RP ID (wallet domain)
- Allowed parent origins (if using ROR)
- Expected credential public keys

This creates an end-to-end security model where credentials are scoped to the wallet infrastructure, not individual integrator sites.

## Implementation Roadmap

### Phase 1: Core Infrastructure (MVP)

**Objective**: Establish the secure iframe architecture with minimal disruption to existing flows.

**Tasks**:
1. Create the hidden wallet service iframe with secure initialization
2. Implement MessageChannel-based RPC protocol
3. Move sensitive components to wallet origin:
   - `WebAuthnManager`
   - Signer and VRF workers
   - IndexedDB managers
4. Keep existing Modal and Embedded Button flows for user activation
5. Update parent SDK to forward requests and handle responses

**Result**: All cryptographic operations isolated to wallet origin; parent only receives signed results.

### Phase 2: Optimization and Enhancements (Optional)

**Objective**: Streamline performance and add advanced features.

**Possible improvements**:
- **Pre-auth flow**: Allow the wallet iframe to collect credentials before the internal confirmation handshake, reducing latency
- **Enhanced migration tools**: Build helpers for importing keys from legacy implementations
- **Advanced telemetry**: Add detailed performance monitoring and error tracking
- **Batch operations**: Support signing multiple transaction sets in a single session

This phased approach lets you deploy the security-critical changes first while leaving room for UX refinements later.

## Implementation Checklist

### Parent SDK Components

- [ ] **WalletIframeRouter**
  - Mount hidden iframe to wallet origin
  - Establish MessageChannel connection
  - Implement request/response correlation with `requestId`
  - Handle timeout and cancellation logic

- [ ] **TatchiPasskey Integration**
  - Forward all API calls to wallet iframe
  - Handle progress events and update UI state
  - Implement error handling and retry logic

- [ ] **Configuration**
  - Add `walletOrigin` configuration option
  - Support custom `walletServicePath`
  - Pass theme and RPC settings to iframe

### Wallet Iframe Components

- [ ] **Service Entry Point**
  - Create wallet service HTML page
  - Configure strict CSP headers
  - Set up Permissions-Policy

- [ ] **RPC Server**
  - Implement message handlers for all operations:
    - `PM_REGISTER` - Passkey registration
    - `PM_LOGIN` - Authentication
    - `PM_SIGN_TXS_WITH_ACTIONS` - Transaction signing
    - `PM_SET_CONFIG` - Configuration updates
  - Validate all incoming requests
  - Send progress updates for long operations

- [ ] **Worker Management**
  - Spawn signer and VRF workers
  - Connect workers to `WebAuthnManager`
  - Handle worker errors and restarts

- [ ] **UI Integration**
  - Integrate `<w3a-tx-confirmer>` component
  - Show/hide modal based on operation state
  - Handle user confirmation and cancellation

- [ ] **Storage Layer**
  - Initialize IndexedDB connections
  - Implement data access methods
  - Add key migration support

### Shared Infrastructure

- [ ] **Type Definitions**
  - Define TypeScript interfaces for all RPC messages
  - Create enums for message types and error codes
  - Document payload structures

- [ ] **Testing**
  - Origin validation tests
  - Timeout and cancellation tests
  - WebAuthn error handling (NotAllowedError, etc.)
  - Digest verification parity tests
  - End-to-end integration tests

## Quick Start for Developers

The wallet iframe architecture is completely transparent from your perspective as an integrator. Here's what you need to know:

### Setup

```javascript
import { createWeb3AuthnClient } from '@tatchi/web3authn-sdk';

const client = createWeb3AuthnClient({
  walletOrigin: 'https://wallet.example.com'
});

await client.init();
```

### Usage

All methods work exactly as you'd expect, with no popups:

```javascript
// Register a new passkey
const credential = await client.registerPasskey({
  nearAccountId: 'user.near'
});

// Sign transactions
const result = await client.signTransactions({
  nearAccountId: 'user.near',
  transactions: [tx1, tx2]
});

// The SDK handles:
// - Mounting the confirmation modal (when needed)
// - Capturing user gestures
// - Communicating with the wallet iframe
// - Returning only the signed results
```

### What You Don't See

Behind the scenes, the SDK:
- Mounts a hidden wallet service iframe on your page
- Shows a confirmation modal (on the wallet origin) only when user action is needed
- Keeps all cryptographic operations isolated in the wallet iframe
- Returns clean, typed results to your application

Your users get a seamless experience with bank-level security.
