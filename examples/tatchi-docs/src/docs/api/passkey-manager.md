---
title: Passkey Manager
---

# Passkey Manager (`TatchiPasskey`)

The SDK’s high-level client surface is the `TatchiPasskey` class (exported from `@tatchi-xyz/sdk`).

## Common methods

- **Wallet iframe lifecycle**: `initWalletIframe()`
- **Registration**: `registerPasskey(accountId, options?)`
- **Login**: `loginAndCreateSession(accountId, options?)`, `logoutAndClearSession()`
- **Transactions**: `executeAction(...)`, `signAndSendTransactions(...)`, `signTransactionsWithActions(...)`
- **Device linking**: `startDeviceLinkingSession(...)`, `linkDeviceWithScannedQRData(...)`
- **Account sync**: `syncAccount({ accountId?, options? })`
- **Email recovery**: `setRecoveryEmails(...)`, `getRecoveryEmails(...)`, `startEmailRecovery(...)`, `finalizeEmailRecovery(...)`, `cancelEmailRecovery(...)`

Most flows accept `onEvent` progress events; see [Progress Events (onEvent)](/docs/guides/progress-events).
