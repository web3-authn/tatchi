---
title: Delegate Actions (NEP‑461)
---

# Delegate Actions (NEP‑461)

Delegate actions let users sign a `DelegateAction` off-chain, then have a relayer pay gas and submit the on-chain transaction. This enables meta‑transactions and sponsored actions while keeping the user’s key on their device.


## When to Use Delegate Actions

Use delegate actions when:

- You want a relayer account to pay gas on behalf of the user.
- You need to pre‑sign intent (e.g. “call this contract method with these args”) and submit later.
- You want to keep the same Tx Confirmer UX as normal transactions, but change who pays fees.

Under the hood this uses NEP‑461 `SignedDelegate` objects:

- `DelegateAction`: describes the sender, receiver, actions, nonce, max block height and the user’s public key.
- `SignedDelegate`: wraps the `DelegateAction` plus the user’s signature.


## Client Flow: signDelegateAction → relayer

From the TatchiPasskey client you:

1. Build a `DelegateActionInput` describing what you want the user to sign.
2. Call `signDelegateAction` to produce `{ hash, signedDelegate }`.
3. POST `{ hash, signedDelegate }` to your relayer’s `/signed-delegate` endpoint.

Example (simplified):

```ts
import { TatchiPasskey } from '@tatchi-xyz/sdk';
import { ActionType } from '@tatchi-xyz/sdk/core';

const passkey = new TatchiPasskey(configs);

const { hash, signedDelegate } = await passkey.signDelegateAction({
  nearAccountId: 'alice.testnet',
  delegate: {
    senderId: 'alice.testnet',               // user paying in logical terms
    receiverId: 'w3a-v1.testnet',            // contract to call
    actions: [
      {
        action_type: ActionType.FunctionCall,
        method_name: 'do_something',
        args: JSON.stringify({ foo: 'bar' }),
        gas: '150000000000000',
        deposit: '0',
      },
    ],
    nonce: 0,                                // 0 = let SDK fetch latest user nonce
    maxBlockHeight: 0,                       // 0 = let SDK derive safe expiry
    publicKey: 'ed25519:...',                // user access-key public key
  },
  options: {
    onEvent: console.log,                    // optional: progress events
  },
});

// Send to relayer
const relayerUrl = `${configs.relayer.url}${configs.relayer.delegateActionRoute ?? '/signed-delegate'}`;
const response = await fetch(relayerUrl, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ hash, signedDelegate }),
});
```

The wallet iframe opens a Tx Confirmer modal for the delegate action, just like a normal transaction, and returns the signed payload only after the user approves.


## Relayer Flow: /signed-delegate → NEAR Transaction

On the relayer side you expose a small endpoint which forwards the signed delegate to `AuthService.executeSignedDelegate`.

Node/Express example (see `examples/relay-server/src/index.ts`):

```ts
app.post('/signed-delegate', async (req, res) => {
  const { hash, signedDelegate } = req.body || {};
  if (typeof hash !== 'string' || !hash || !signedDelegate) {
    res.status(400).json({ ok: false, code: 'invalid_body', message: 'Expected { hash, signedDelegate }' });
    return;
  }

  const result = await authService.executeSignedDelegate({ hash, signedDelegate });

  if (!result || !result.ok) {
    res.status(400).json({
      ok: false,
      code: result?.code || 'delegate_execution_failed',
      message: result?.error || 'Failed to execute delegate action',
    });
    return;
  }

  res.status(200).json({
    ok: true,
    relayerTxHash: result.transactionHash || null,
    status: 'submitted',
    outcome: result.outcome ?? null,
  });
});
```

Cloudflare Workers follow the same pattern (see `examples/relay-cloudflare-worker/src/delegate-route.ts`), using `AuthService` from `@tatchi-xyz/sdk/server`.


## Configuration Notes

- Client:
  - `TatchiPasskeyConfigs.relayer.url` – base URL of your relay server.
  - `TatchiPasskeyConfigs.relayer.delegateActionRoute` – path for the delegate endpoint (defaults to `/signed-delegate`).
- Relayer:
  - Uses the same `AuthService` instance as account creation and email recovery.
  - Serializes outgoing transactions via its internal queue to avoid nonce conflicts.

With this wiring in place you get end‑to‑end NEP‑461 support: the browser signs delegate actions, the relayer pays gas, and the on-chain transaction is indistinguishable from a direct user action. 
