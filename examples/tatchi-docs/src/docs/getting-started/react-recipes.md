---
title: React Recipes
---

# React Recipes

These examples assume you’ve already wrapped your app in `TatchiPasskeyProvider` as shown in the [installation](../getting-started/installation.md) guide.

The SDK provides pre-built React components which hooks up a lot of the functionality
exposed by the `TatchiPasskeyManager`.

```tsx
import { TatchiPasskeyProvider } from '@tatchi-xyz/sdk/react/provider'

const config = {
  iframeWallet: { walletOrigin: 'https://wallet.web3authn.org' },
  relayer: {
    url: 'https://relay.tatchi.xyz',
  },
}

function Root() {
  return (
    <TatchiPasskeyProvider config={config}>
      <App />
    </TatchiPasskeyProvider>
  )
}
```

## PasskeyAuthMenu – register / login / sync

`PasskeyAuthMenu` is a ready‑made registration/login/account-sync menu that wires into the passkey flows exposed by `useTatchi`.

```tsx
import {
  useTatchi,
  AuthMenuMode,
  type RegistrationSSEEvent,
  type DeviceLinkingSSEEvent,
} from '@tatchi-xyz/sdk/react'
import { PasskeyAuthMenu } from '@tatchi-xyz/sdk/react/passkey-auth-menu'

export function PasskeySection() {
  const {
    accountInputState,
    registerPasskey,
    loginAndCreateSession,
    syncAccount,
  } = useTatchi()

  const targetAccountId = accountInputState.targetAccountId
  const accountExists = accountInputState.accountExists

  const onRegister = () =>
    registerPasskey(targetAccountId, {
      onEvent: (event: RegistrationSSEEvent) => {
        console.log('registration event', event)
      },
    })

  const onLogin = () =>
    loginAndCreateSession(targetAccountId, {
      onEvent: (event) => {
        console.log('login event', event)
      },
    })

  const onSyncAccount = () =>
    syncAccount({
      accountId: targetAccountId,
      options: {
        onEvent: (event) => console.log('sync event', event),
        onError: (error) => console.error('sync error', error),
      },
    })

  const onLinkDeviceEvent = (event: DeviceLinkingSSEEvent) => {
    console.log('link-device event', event)
  }

  return (
    <PasskeyAuthMenu
      defaultMode={accountExists ? AuthMenuMode.Login : AuthMenuMode.Register}
      onLogin={onLogin}
      onRegister={onRegister}
      onSyncAccount={onSyncAccount}
      emailRecoveryOptions={{
        onEvent: (event) => console.log('email-recovery event', event),
        onError: (error) => console.error('email-recovery error', error),
      }}
      linkDeviceOptions={{
        onEvent: onLinkDeviceEvent,
        onError: (error) => console.error('link-device error', error),
      }}
    />
  )
}
```

`onSyncAccount` covers passkey-based account sync (e.g. iCloud/Google Password Manager passkey sync). Email-based recovery is built in to the menu via “Recover Account with Email” and emits events through `emailRecoveryOptions`.

## AccountMenuButton – account menu + device linking

`AccountMenuButton` shows the current account, lets users export keys, link devices, toggle theme, and adjust confirmation settings.

```tsx
import {
  useTatchi,
  DeviceLinkingPhase,
  DeviceLinkingStatus,
} from '@tatchi-xyz/sdk/react'
import { AccountMenuButton } from '@tatchi-xyz/sdk/react/profile'

export function HeaderProfile() {
  const { loginState } = useTatchi()

  if (!loginState.isLoggedIn || !loginState.nearAccountId) {
    return null
  }

  return (
    <header className="app-header">
      <AccountMenuButton
        nearAccountId={loginState.nearAccountId}
        hideUsername={false}
        onLogout={() => {
          console.log('User logged out')
        }}
        deviceLinkingScannerParams={{
          fundingAmount: '0.05',
          onDeviceLinked: (result) => {
            console.log('Device linked:', result)
          },
          onEvent: (event) => {
            if (event.phase === DeviceLinkingPhase.STEP_7_LINKING_COMPLETE &&
                event.status === DeviceLinkingStatus.SUCCESS) {
              console.log('Device linking complete')
            }
          },
          onError: (error) => {
            console.error('Device linking error:', error)
          },
        }}
      />
    </header>
  )
}
```

## Transactions – custom button

```tsx
import {
  useTatchi,
  ActionType,
  TxExecutionStatus,
} from '@tatchi-xyz/sdk/react'

export function SendGreetingButton() {
  const { tatchi, loginState } = useTatchi()

  if (!loginState.isLoggedIn || !loginState.nearAccountId) {
    return null
  }

  const nearAccountId = loginState.nearAccountId
  const contractId = tatchi.configs.contractId

  return (
    <button
      onClick={async () => {
        await tatchi.executeAction({
          nearAccountId,
          receiverId: contractId,
          actionArgs: {
            type: ActionType.FunctionCall,
            methodName: 'set_greeting',
            args: { greeting: 'Hello from Tatchi!' },
            gas: '30000000000000',
            deposit: '0',
          },
          options: {
            confirmationConfig: { uiMode: 'drawer' },
            waitUntil: TxExecutionStatus.EXECUTED_OPTIMISTIC,
            afterCall: (success, result) => {
              if (success) console.log('Tx result', result)
              else console.warn('Tx failed', result)
            },
            onError: (error) => console.error('Tx error', error),
          },
        })
      }}
      style={{
        color: 'white',
        background: 'var(--w3a-colors-primary)',
        borderRadius: '2rem',
        border: 'none',
        height: 44,
        paddingInline: 24,
      }}
    >
      Send Greeting
    </button>
  )
}
```

From here you can refine styling and hook `onEvent` into your own toast/notification system; for a full list of events see [progress events](../guides/progress-events.md).
The setup above is enough to get end‑to‑end passkey registration, login, and transaction signing with React components.
