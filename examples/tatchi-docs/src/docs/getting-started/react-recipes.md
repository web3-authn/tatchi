---
title: React Recipes
---

# React Recipes

These examples assume you’ve already wrapped your app in `TatchiPasskeyProvider` as shown in the [installation](../getting-started/installation.md) guide.

The SDK provides pre-built React components which hooks up a lot of the functionality
exposed by the `TatchiPasskeyManager`.

```tsx
import { TatchiPasskeyProvider } from '@tatchi-xyz/sdk/react'

const config = {
  iframeWallet: { walletOrigin: 'https://wallet.tatchi.xyz' },
  relayer: {
    url: 'https://relay.tatchi.xyz',
    accountId: 'w3a-relayer.testnet',
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

## PasskeyAuthMenu – register / login / recover

`PasskeyAuthMenu` is a ready‑made registration/login/recovery menu that wires into the passkey flows exposed by `useTatchi`.

```tsx
import {
  useTatchi,
  PasskeyAuthMenu,
  AuthMenuMode,
  type RegistrationSSEEvent,
  type DeviceLinkingSSEEvent,
} from '@tatchi-xyz/sdk/react'

export function PasskeySection() {
  const {
    accountInputState,
    registerPasskey,
    loginPasskey,
    tatchi,
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
    loginPasskey(targetAccountId, {
      onEvent: (event) => {
        console.log('login event', event)
      },
    })

  const onRecoverAccount = () =>
    tatchi.recoverAccountFlow({
      accountId: targetAccountId,
      options: {
        onEvent: (event) => console.log('recovery event', event),
        onError: (error) => console.error('recovery error', error),
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
      onRecoverAccount={onRecoverAccount}
      linkDeviceOptions={{
        onEvent: onLinkDeviceEvent,
        onError: (error) => console.error('link-device error', error),
      }}
    />
  )
}
```

## ProfileSettingsButton – account menu + device linking

`ProfileSettingsButton` shows the current account, lets users export keys, link devices, toggle theme, and adjust confirmation settings.

```tsx
import {
  useTatchi,
  ProfileSettingsButton,
  DeviceLinkingPhase,
  DeviceLinkingStatus,
} from '@tatchi-xyz/sdk/react'

export function HeaderProfile() {
  const { loginState } = useTatchi()

  if (!loginState.isLoggedIn || !loginState.nearAccountId) {
    return null
  }

  return (
    <header className="app-header">
      <ProfileSettingsButton
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

## SendTxButtonWithTooltip – embedded transaction button

`SendTxButtonWithTooltip` embeds the wallet iframe in a button with a rich tooltip that explains what’s being signed.

```tsx
import {
  useTatchi,
  SendTxButtonWithTooltip,
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
    <SendTxButtonWithTooltip
      nearAccountId={nearAccountId}
      txSigningRequests={[
        {
          receiverId: contractId,
          actions: [
            {
              type: ActionType.FunctionCall,
              methodName: 'set_greeting',
              args: { greeting: 'Hello from Tatchi!' },
              gas: '30000000000000',
              deposit: '0',
            },
          ],
        },
      ]}
      options={{
        waitUntil: TxExecutionStatus.EXECUTED_OPTIMISTIC,
        afterCall: (success, result) => {
          if (success) {
            console.log('Tx result', result)
          } else {
            console.warn('Tx failed', result)
          }
        },
        onError: (error) => {
          console.error('Tx error', error)
        },
      }}
      buttonStyle={{
        color: 'white',
        background: 'var(--w3a-colors-primary)',
        borderRadius: '2rem',
        border: 'none',
        height: 44,
        paddingInline: 24,
      }}
      buttonHoverStyle={{
        background: 'var(--w3a-colors-primaryHover)',
      }}
    />
  )
}
```

From here you can refine styling and hook `onEvent` into your own toast/notification system, ful a full list of events see [progress events](../guides/progress-events.md).
The setup above is enough to get end‑to‑end passkey registration, login, and transaction signing with React components.

