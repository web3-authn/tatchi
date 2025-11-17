---
title: Device Linking
---

# Device Linking

Link a new device to an existing NEAR account without manually sharing secrets or seed phrases. The SDK uses QR codes and on-chain transactions to securely authorize the new device.

## How It Works

The device linking flow involves three steps:

1. **Device 2 (new device)**: Generates a QR code containing a public key and metadata
2. **Device 1 (existing device)**: Scans the QR code, authenticates with WebAuthn (TouchID/FaceID), and submits AddKey + metadata transactions to the blockchain
3. **Device 2**: Detects the AddKey transaction on-chain and completes local setup automatically

No private keys or secrets are ever transmitted between devices. Device 2 generates its own keypair, and Device 1 only authorizes adding that public key to the account.

The SDK provides both a React component and a framework-agnostic API.

## Linking Strategies

The SDK supports two approaches depending on whether the user knows their account ID:

### With Account ID (Faster)

If Device 2 knows the account ID upfront:
1. Device 2 generates the final keypair immediately
2. Device 1 scans and adds it directly
3. Device 2 is ready to use immediately after AddKey completes

**Use this when**: You have a UI where users can type or paste their account ID.

### Without Account ID (Seamless)

If Device 2 doesn't know the account ID:
1. Device 2 generates a temporary keypair
2. Device 1 links the temporary key to the account
3. Device 2 discovers the account ID from the blockchain
4. Device 2 generates the proper account-salted keypair and submits AddKey + DeleteKey transactions to replace the temporary key

**Use this when**: You want a completely scan-only flow with no manual input.

## React: QR scanner

```tsx
import { QRCodeScanner } from '@tatchi-xyz/sdk/react'

<QRCodeScanner
  onDeviceLinked={(result) => console.log('Linked', result)}
  onError={(err) => console.error(err)}
  onEvent={(e) => console.log(e)}
/>
```

- Place the scanner UI on Device 1
- The scanner parses the QR data and executes the linking flow

## Programmatic API

Device 2 — generate QR:

```ts
import { TatchiPasskey } from '@tatchi-xyz/sdk'

const manager = new TatchiPasskey({ /* … your config … */ })
const flow = new manager.LinkDeviceFlow(manager.getContext(), {
  onEvent: (e) => console.log(e),
})

// If you know the account id, pass it to generate a proper key immediately; otherwise a temp key is used.
const { qrData, qrCodeDataURL } = await flow.generateQR('alice.testnet')

// Render <img src={qrCodeDataURL} /> on Device 2
```

Device 1 — scan and authorize:

```ts
import { linkDeviceWithScannedQRData } from '@tatchi-xyz/sdk'

// qrData is the parsed JSON from the QR code
const result = await linkDeviceWithScannedQRData(manager.getContext(), {
  qrData,
  onEvent: (e) => console.log(e),
  onError: (err) => console.error(err),
})

console.log('Linked', result.linkedToAccount, 'tx', result.transactionId)
```

Events (`onEvent`) indicate phases: QR generation, WebAuthn authorization, AddKey submitted, metadata stored, and completion.

## Funding and fees

The flow can optionally fund the Device 2 temporary account to cover on‑chain calls; pass `fundingAmount` to the React component or programmatic options if needed.

## Errors and recovery

- QR expired: regenerate on Device 2
- Authorization timeout: retry WebAuthn on Device 1
- AddKey conflict: the flow retries and re‑computes nonces; ensure the app doesn’t submit concurrent txs for the same account

## Security Notes

**No Secrets Transmitted**: Device 2 only needs the QR code—no private keys or seed phrases are ever shared between devices. Each device generates its own keypair independently.

**Isolated WebAuthn**: All sensitive operations (WebAuthn credential access, transaction signing) happen in the wallet iframe, isolated from your application code.

**Key Replacement Flow**: When using the "Without Account ID" strategy, the SDK automatically performs a key replacement (AddKey for the permanent key + DeleteKey for the temporary key) once Device 2 discovers the account ID.
