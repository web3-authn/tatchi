# Registration Flow

The passkey registration process runs in clear, incremental steps with SDK‑sent events (SSE) so you can show precise progress in your UI. Users can usually proceed to login after keys are generated while remaining steps finish in the background.

## Overview

- 8 sequential steps with status updates and human‑readable messages
- Login can be enabled immediately after step 2 (key generation)
- Critical on‑chain work happens via the relay and is verified before persisting

## Steps at a Glance

1. WebAuthn verification (TouchID/biometric)
2. Key generation (NEAR and VRF)
3. Contract pre‑check (sanity checks; may run concurrently)
4. Access key addition (relay; critical)
5. Contract registration (relay)
6. Account verification (post‑commit check of access keys)
7. Database storage (persist authenticator data locally)
8. Registration complete
0. Error (fatal)

## Handling Events

```ts
type RegistrationStatus = 'progress' | 'success' | 'error'

function onRegistrationEvent(e: { step: number; status: RegistrationStatus; message: string }) {
  switch (e.step) {
    case 1: ui.progress('Verifying passkey…'); break;
    case 2: ui.enableLogin(); ui.progress('Keys generated — creating account…'); break;
    case 3: ui.progress('Pre‑checking contract and account…'); break;
    case 4: e.status === 'error' ? ui.fatal('Account creation failed') : ui.progress('Adding access key…'); break;
    case 5: e.status === 'error' ? ui.warn('Contract registration failed') : ui.progress('Registering…'); break;
    case 6: e.status === 'error' && ui.warn('On‑chain key verification failed'); break;
    case 7: e.status === 'error' && ui.warn('Local storage failed'); break;
    case 8: ui.success('Registration complete!'); break;
    case 0: ui.fatal('Registration failed'); break;
  }
}
```

## Implementation Notes

- Treat steps 4–5 as critical: abort remaining work on failure.
- Only persist anything after step 6 confirms the expected access key is live.
- Keep the UI responsive: enable login after step 2; continue progress in the background.

## See Also

- Guides: Passkeys
- Concepts: Security Model, VRF & PRF

