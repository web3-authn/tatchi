---
title: Wallet Iframe Integration
---

# Wallet Iframe Integration

The wallet iframe architecture isolates all sensitive cryptographic operations in a separate security origin, protecting your users' keys even if your application is compromised. This guide shows you how to integrate and configure it.

## Why Use Iframe Isolation?

### The Security Problem

Traditional web wallets store keys in the same JavaScript context as your application. This means:

- **XSS vulnerabilities** in your app can steal keys
- **Malicious dependencies** in `node_modules` can exfiltrate secrets
- **Supply chain attacks** compromise your entire stack
- **One bug** can leak private keys permanently

### The Solution

The SDK runs all security-critical operations in a cross-origin iframe:

```
Your App (app.example.com)
  └── Wallet Iframe (wallet.example.com)
        ├── WebAuthn operations
        ├── Key management (Web Workers)
        ├── Encrypted storage (IndexedDB)
        └── Transaction signing
```

**What this means for you:**
- Keys never touch your application code
- Compromised apps can only request operations, not steal keys
- Browser's same-origin policy enforces the security boundary
- Users' assets stay safe even if your site is hacked

For a deep dive into the architecture, see [Wallet Iframe Architecture](/docs/concepts/wallet-iframe-architecture).

---

## Configuration

### Basic Setup

Configure the SDK to use the wallet iframe:

```tsx
import { PasskeyProvider, PASSKEY_MANAGER_DEFAULT_CONFIGS } from '@tatchi-xyz/sdk/react'

<PasskeyProvider
  config={{
    ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
    iframeWallet: {
      // Where the wallet iframe is hosted
      walletOrigin: import.meta.env.VITE_WALLET_ORIGIN,

      // Path to the wallet service page (default: '/wallet-service')
      walletServicePath: import.meta.env.VITE_WALLET_SERVICE_PATH || '/wallet-service',

      // Optional: Credential scope strategy
      // Leave undefined for wallet-scoped, or set to your app's base domain
      // rpIdOverride: 'example.com',
    },
  }}
>
  <App />
</PasskeyProvider>
```

### Environment Variables

Create `.env` files for different environments:

**.env.development**:
```bash
VITE_WALLET_ORIGIN=https://wallet.example.localhost:5174
VITE_WALLET_SERVICE_PATH=/wallet-service
# Optional: VITE_RP_ID_BASE=example.localhost
```

**.env.production**:
```bash
VITE_WALLET_ORIGIN=https://wallet.example.com
VITE_WALLET_SERVICE_PATH=/wallet-service
# Optional: VITE_RP_ID_BASE=example.com
```

### Build Configuration

The SDK's Vite plugin handles wallet asset serving and security headers:

```typescript
import { tatchiDev, tatchiBuildHeaders } from '@tatchi-xyz/sdk/plugins/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    // Development: Serves wallet assets locally
    tatchiDev({
      sdkBasePath: '/sdk',
      walletServicePath: '/wallet-service',
      walletOrigin: process.env.VITE_WALLET_ORIGIN
    }),

    // Production: Sets Permissions-Policy headers
    tatchiBuildHeaders({
      walletOrigin: process.env.VITE_WALLET_ORIGIN
    }),
  ]
})
```

**What these plugins do:**

**`tatchiDev`**:
- Serves `/sdk/*` assets (JS, CSS, WASM) during development
- Mounts `/wallet-service` endpoint
- Handles hot module replacement for wallet code

**`tatchiBuildHeaders`**:
- Injects `Permissions-Policy` header to delegate WebAuthn to wallet origin
- Ensures iframe can call `navigator.credentials.*` APIs
- Required for production deployments

---

## Usage Examples

### Sign Transactions

All operations route through the wallet origin when configured:

```typescript
import { usePasskeyManager } from '@tatchi-xyz/sdk/react'

function TransferButton() {
  const passkeyManager = usePasskeyManager()

  const handleTransfer = async () => {
    try {
      const result = await passkeyManager.signTransactionsWithActions({
        transactions: [{
          nearAccountId: 'alice.testnet',
          receiverId: 'usdc.testnet',
          actions: [{
            type: 'FunctionCall',
            method_name: 'ft_transfer',
            args: JSON.stringify({
              receiver_id: 'bob.testnet',
              amount: '1000000'
            }),
            gas: '50000000000000',
            deposit: '1'
          }]
        }]
      })

      console.log('Transaction hash:', result.transactionHash)
    } catch (error) {
      console.error('Transaction failed:', error)
    }
  }

  return <button onClick={handleTransfer}>Transfer USDC</button>
}
```

**What happens behind the scenes:**

1. SDK sends transaction data to wallet iframe via MessageChannel
2. Wallet iframe shows confirmation modal (on wallet origin)
3. User clicks "Confirm" - gesture captured in wallet context
4. WebAuthn ceremony runs inside wallet iframe
5. Signer worker signs transactions
6. Wallet returns signed transactions to your app
7. Your app receives only the result - never sees keys

### Register a New Passkey

```typescript
async function registerPasskey(username: string) {
  const result = await passkeyManager.registerPasskey({
    username,
    nearAccountId: `${username}.testnet`,
    // Optional: Relay server for atomic account creation
    relayUrl: 'https://relay.example.com'
  })

  if (result.success) {
    console.log('Passkey registered:', result.credentialId)
  }
}
```

### Check Auth Status

```typescript
function useAuth() {
  const passkeyManager = usePasskeyManager()
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      const user = await passkeyManager.getLastUser()
      setIsAuthenticated(!!user)
    }
    checkAuth()
  }, [passkeyManager])

  return { isAuthenticated }
}
```

---

## Configuration Options

### walletOrigin

**Type**: `string` (URL)
**Required**: Yes
**Example**: `'https://wallet.example.com'`

The origin where the wallet iframe is hosted. Must be HTTPS in production.

**Local development**:
- Use a different port: `https://wallet.example.localhost:5174`
- Or a different subdomain: `https://wallet-dev.example.localhost`

**Production**:
- Use a dedicated subdomain: `https://wallet.example.com`
- Or shared infrastructure: `https://web3authn.org`

### walletServicePath

**Type**: `string`
**Default**: `'/wallet-service'`
**Example**: `'/wallet'`, `'/w3a-service'`

The path where the wallet service page is mounted. The SDK loads:
```
${walletOrigin}${walletServicePath}
```

Most deployments use the default.

### rpIdOverride

**Type**: `string | undefined`
**Default**: `undefined` (wallet-scoped)

Controls which domain WebAuthn credentials are bound to:

**`undefined` (wallet-scoped)**:
```tsx
iframeWallet: {
  walletOrigin: 'https://wallet.example.com',
  // rpIdOverride not set - uses wallet domain as rpId
}
```
- One passkey works across all apps using this wallet
- Good for multi-tenant wallet services
- Requires ROR configuration for Safari

**App domain (app-scoped)**:
```tsx
iframeWallet: {
  walletOrigin: 'https://wallet.example.com',
  rpIdOverride: 'example.com', // ← Credentials bound to app domain
}
```
- Credentials tied to your product's domain
- Works across `*.example.com` subdomains
- Simpler Safari integration (usually no ROR needed)

For detailed guidance, see [Credential Scope Strategy](/docs/concepts/wallet-scoped-credentials).

---

## Troubleshooting

### "WebAuthn not available" Error

**Symptoms**: Operations fail with "WebAuthn is not available in this context"

**Causes**:
1. Permissions-Policy header not set
2. Iframe `allow` attribute missing
3. Not using HTTPS (required for WebAuthn)

**Fixes**:

**Check headers** (DevTools → Network → Your page → Response Headers):
```
Permissions-Policy: publickey-credentials-get=(self "https://wallet.example.com"),
                     publickey-credentials-create=(self "https://wallet.example.com")
```

If missing, ensure `tatchiBuildHeaders` plugin is configured:
```typescript
import { tatchiBuildHeaders } from '@tatchi-xyz/sdk/plugins/vite'

plugins: [
  tatchiBuildHeaders({ walletOrigin: process.env.VITE_WALLET_ORIGIN })
]
```

**Check iframe attributes**:
```html
<!-- Should include these permissions -->
<iframe allow="publickey-credentials-get; publickey-credentials-create">
```

The SDK sets this automatically, but verify in DevTools → Elements → `<iframe>`.

**Use HTTPS everywhere**: WebAuthn requires secure contexts. Even in development:
```bash
# Development
https://app.example.localhost:5173     ← HTTPS
https://wallet.example.localhost:5174  ← HTTPS
```

### Iframe Not Loading

**Symptoms**: Blank page, console errors about loading resources

**Check CORS**: The wallet origin must allow being embedded:
```typescript
// Wallet server
app.use(cors({
  origin: [
    'https://app.example.com',
    'http://localhost:5173'
  ],
  credentials: true
}))
```

**Check Content-Security-Policy**: Ensure your app allows iframe embedding:
```
Content-Security-Policy: frame-src 'self' https://wallet.example.com
```

**Verify paths**: Check that `/sdk/*` assets are accessible:
```bash
curl https://wallet.example.com/sdk/tx-confirmer.css
curl https://wallet.example.com/wallet-service
```

### Safari: Passkey Not Appearing

**Cause**: Related Origin Requests (ROR) not configured for wallet-scoped credentials.

**Fix**: Serve `/.well-known/webauthn` on the wallet origin:

```json
{
  "origins": [
    "https://app.example.com",
    "https://localhost:5173"
  ]
}
```

Verify it's accessible:
```bash
curl https://wallet.example.com/.well-known/webauthn
```

See [Credential Scope Strategy](/docs/concepts/wallet-scoped-credentials#option-a-wallet-scoped-credentials) for details.

### Modal Not Showing on Transaction Confirmation

**Symptoms**: Operation hangs at confirmation step, modal never appears

**Causes**:
1. Modal is rendered but hidden behind other elements
2. CSS not loaded properly
3. Progress event handling issue

**Fixes**:

**Check z-index**: The wallet modal should have high z-index. Inspect in DevTools:
```css
.w3a-tx-confirmer {
  z-index: 999999; /* Should be very high */
}
```

**Verify CSS loaded**: Check Network tab for `/sdk/tx-confirmer.css` - should return 200 OK.

**Don't hide STEP_2_USER_CONFIRMATION**: If you're listening to progress events, ensure you don't hide UI during confirmation:
```typescript
// ✗ Bad - hides modal
passkeyManager.signTransactions(tx, {
  onProgress: (step) => {
    if (step === 'STEP_2_USER_CONFIRMATION') {
      hideOverlay() // ← Don't do this!
    }
  }
})

// ✓ Good - keeps modal visible
passkeyManager.signTransactions(tx, {
  onProgress: (step) => {
    console.log('Progress:', step)
    // Let the wallet control modal visibility
  }
})
```

---

## Production Checklist

Before deploying to production, verify:

### Security
- [ ] Wallet runs on separate origin from app
- [ ] HTTPS enabled on both app and wallet origins
- [ ] Permissions-Policy header set correctly
- [ ] CSP allows wallet iframe: `frame-src 'self' https://wallet.example.com`
- [ ] ROR manifest configured (if using wallet-scoped credentials)

### Performance
- [ ] `/sdk/*` assets served with proper MIME types
- [ ] Assets cached appropriately (immutable if versioned)
- [ ] Wallet iframe loads quickly (< 1s)

### Functionality
- [ ] Registration works in all target browsers
- [ ] Login works with existing passkeys
- [ ] Transaction signing shows confirmation modal
- [ ] Safari compatibility verified (especially ROR)
- [ ] Error handling works gracefully

### Monitoring
- [ ] Log wallet iframe connection errors
- [ ] Track WebAuthn operation success rates
- [ ] Monitor RPC failures
- [ ] Alert on configuration mismatches

---

## Common Patterns

### Custom Progress UI

Show your own loading states while wallet operations are in progress:

```typescript
function TransactionButton() {
  const [status, setStatus] = useState('idle')

  const handleSign = async () => {
    setStatus('preparing')

    try {
      await passkeyManager.signTransactions(tx, {
        onProgress: (step) => {
          switch (step) {
            case 'STEP_1_PREPARE':
              setStatus('preparing')
              break
            case 'STEP_2_USER_CONFIRMATION':
              setStatus('awaiting-confirmation')
              break
            case 'STEP_3_SIGN':
              setStatus('signing')
              break
          }
        }
      })
      setStatus('success')
    } catch (error) {
      setStatus('error')
    }
  }

  return (
    <>
      <button onClick={handleSign} disabled={status !== 'idle'}>
        Sign Transaction
      </button>
      {status === 'preparing' && <Spinner />}
      {status === 'awaiting-confirmation' && <Message>Check your authenticator...</Message>}
      {status === 'signing' && <Spinner text="Signing..." />}
    </>
  )
}
```

### Error Handling

Handle different error types appropriately:

```typescript
try {
  await passkeyManager.signTransactions(tx)
} catch (error) {
  if (error.code === 'USER_CANCELLED') {
    // User clicked cancel - expected, don't show error
    console.log('User cancelled')
  } else if (error.code === 'WEBAUTHN_NOT_AVAILABLE') {
    showError('Your browser doesn\'t support passkeys')
  } else if (error.code === 'RPC_ERROR') {
    showError('Network error - please try again')
  } else {
    showError('Transaction failed: ' + error.message)
  }
}
```

---

## Next Steps

- **Understand the architecture**: Read [Wallet Iframe Architecture](/docs/concepts/wallet-iframe-architecture)
- **Choose credential scope**: See [Credential Scope Strategy](/docs/concepts/wallet-scoped-credentials)
- **Deploy a relay**: Follow [Relay Server Deployment](/docs/guides/relay-server-deployment)
- **Review security**: Study the [Security Model](/docs/concepts/security-model)
