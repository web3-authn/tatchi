---
title: Client
---

# Client

Client-level helpers and utilities for interacting with the SDK.

## Main entrypoint: `TatchiPasskey`

The core (non-React) SDK entrypoint is `TatchiPasskey`:

```ts
import { TatchiPasskey, PASSKEY_MANAGER_DEFAULT_CONFIGS } from '@tatchi-xyz/sdk'

const tatchi = new TatchiPasskey({
  ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
  iframeWallet: {
    walletOrigin: 'https://wallet.web3authn.org',
  },
  relayer: {
    url: 'https://relay.example.com',
  },
})

await tatchi.initWalletIframe()
```

From there you can use high-level flows like:

- `registerPasskey(accountId, options?)`
- `loginAndCreateSession(accountId, options?)`
- `executeAction({ nearAccountId, receiverId, actionArgs, options? })`
- `syncAccount({ accountId?, options? })`
- Email recovery: `setRecoveryEmails`, `getRecoveryEmails`, `startEmailRecovery`, `finalizeEmailRecovery`

For the full set of methods and common call patterns, see [Passkey Manager](./passkey-manager.md).
