---
title: Device Linking
---

# Device Linking

Link a second device (Device 2) to an existing account (Device 1) without sharing secrets. The flow uses a QR code, WebAuthn on Device 1 for authorization, and a pair of on‑chain transactions to add the new key.

## Overview

- Device 2: generates a QR that encodes a public key for Device 2 and metadata
- Device 1: scans the QR, authenticates via WebAuthn, and signs AddKey + store metadata transactions
- Device 2: observes AddKey and completes the local setup automatically

The SDK provides both a React component and a framework‑agnostic API.

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

## Notes

- Device 2 requires only the QR; no secrets are shared between devices
- All sensitive steps happen in the wallet origin; WebAuthn never runs in the app frame when the wallet is configured
