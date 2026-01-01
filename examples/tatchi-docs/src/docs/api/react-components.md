---
title: React Components
---

# React Components

UI components and wrappers for embedding the Wallet Iframe UX.

## Provider + hook

```tsx
import '@tatchi-xyz/sdk/react/styles'
import { TatchiPasskeyProvider } from '@tatchi-xyz/sdk/react/provider'
import { useTatchi } from '@tatchi-xyz/sdk/react'
```

## Common components

- `PasskeyAuthMenu` (`@tatchi-xyz/sdk/react/passkey-auth-menu`) – register/login/recover UI (includes “Recover Account with Email” and “Scan and Link Device”)
- `AccountMenuButton` (`@tatchi-xyz/sdk/react/profile`) – account/profile + settings + device linking
- `SendTxButtonWithTooltip` (`@tatchi-xyz/sdk/react/embedded`) – embedded tx button with a rich confirmation tooltip
- `WalletIframeTxButtonHost` (from `@tatchi-xyz/sdk/react`) – lower-level iframe host wrapper

All React exports must be used under `TatchiPasskeyProvider`.
