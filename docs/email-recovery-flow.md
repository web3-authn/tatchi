# Email Recovery Flow (Passkey + ZK Email)

This document describes a full implementation plan for an **email‑based account recovery flow** that:

- Starts from a logged‑out state where the user only knows their `accountId` and a recovery email.
- Uses a TouchID/FaceID WebAuthn prompt to derive a new deterministic NEAR key (`new_public_key`) for that account.
- Asks the user to send an email with subject `recover <accountId>` and body `ed25519:<new_public_key>`.
- Relies on the existing zk‑email + recovery contract pipeline to add `new_public_key` as an access key on‑chain.
- Reuses the **LinkDevice** flow primitives to:
  - finalize registration with the WebAuthn contract,
  - store authenticator + encrypted keys locally (IndexedDB),
  - and auto‑login on the recovered device.

## 1. Goals & Preconditions

- **User starting point**
  - User is **logged out** on the current device.
  - They remember:
    - their NEAR `accountId` (e.g. `alice.testnet`), and
    - a recovery email address previously registered for zk‑email recovery.
- **Contract + relayer setup**
  - Sending an email to the configured recovery address (e.g. `recover@web3authn.org`) with:
    - `Subject: recover <accountId>`
    - `Body: ed25519:<new_public_key>`
    causes the zk‑email pipeline to:
    - verify DKIM + zk proof,
    - and call the recovery contract to **add `new_public_key` as an access key** on `accountId`.
  - This part is already wired in the relayer + contract (see `docs/zk-email-recovery.md` and the Cloudflare worker).
- **SDK primitives to reuse**
  - WebAuthn secure confirm: `webAuthnManager.requestRegistrationCredentialConfirmation`.
  - Deterministic key derivation: `deriveVrfKeypairFromRawPrf`, `deriveNearKeypairAndEncryptFromSerialized`.
  - Nonce / tx handling: `NonceManager`.
  - Local storage: `IndexedDBManager`, `webAuthnManager.storeUserData`.
  - Auto‑login: logic from `LinkDeviceFlow.attemptAutoLogin`.

## 2. High‑Level UX (User Perspective)

From the user’s point of view, the flow is:

1. They open the wallet/app and choose **“Recover account with email”**.
2. They see a simple form:
   - input: `accountId`
   - input: `recovery email`
   - button: **Recover account with email**
3. After clicking the button:
   - A TouchID/FaceID prompt appears (same look/feel as the LinkDevice flow).
   - On success, the app computes a new NEAR public key for that account.
4. The app shows a **mailto** prompt:
   - `to`: the recovery email,
   - `subject`: `recover <accountId>`,
   - `body`: `ed25519:<new_public_key>`.
5. The user hits **Send** in their email client.
6. After a short delay (email is processed by the relayer), the app:
   - detects that `new_public_key` has been added on‑chain,
   - finishes registering the new authenticator (LinkDevice‑style),
   - stores encrypted keys + authenticator locally,
   - and logs the user in.

## 3. State & Data Model

We need a small persisted state to bridge the gap between:
- **Phase A** (derive `new_public_key` and show email UI) and
- **Phase D** (finalize registration after `add_key` happens on‑chain).

Add an IndexedDB record (either in `IndexedDBManager` or a small dedicated helper) keyed by `accountId`:

```ts
type PendingEmailRecovery = {
  accountId: string;
  recoveryEmail: string;          // canonicalized (lowercase, trimmed)
  deviceNumber: number;           // new device index for this account
  nearPublicKey: string;          // new_public_key (deterministic NEAR key)
  encryptedVrfKeypair: EncryptedVRFKeypair;
  serverEncryptedVrfKeypair: ServerEncryptedVrfKeypair | null;
  vrfPublicKey: string;
  credential: WebAuthnRegistrationCredential;
  vrfChallenge?: VRFChallenge;
  createdAt: number;
  status: 'awaiting-email' | 'awaiting-add-key' | 'finalizing' | 'complete' | 'error';
};
```

Helper API:

- `getPendingEmailRecovery(accountId): Promise<PendingEmailRecovery | null>`
- `savePendingEmailRecovery(record: PendingEmailRecovery): Promise<void>`
- `clearPendingEmailRecovery(accountId): Promise<void>`

This:
- enables **resume after reload**, and
- keeps the email‑based flow clearly separated from the rest of IndexedDB state.

## 4. Phase A — Inputs + TouchID: Derive `new_public_key`

Triggered when the user submits the “Recover account with email” form.

### 4.1 Validate inputs

- Validate `accountId`:
  - use `validateNearAccountId(accountId)`; surface any error inline.
- Canonicalize email:
  - lowercase, trim whitespace.
- Optional (if supported by the recovery contract):
  - call a view method such as `get_recovery_email_hashes(accountId)` and verify that the hash of the canonical email matches;
  - if it doesn’t, fail early with a clear error (`"This email is not registered for recovery on <accountId>"`).

### 4.2 Determine `deviceNumber`

We want email recovery to produce a **new device entry** consistent with the LinkDevice numbering.

- Call `syncAuthenticatorsContractCall(nearClient, contractId, accountId)`:
  - same RPC used by recovery + device linking.
- Compute:
  - `existingDeviceNumbers = all contractAuthenticators.deviceNumber`
  - `nextDeviceNumber = (max(existingDeviceNumbers) ?? 0) + 1`

### 4.3 WebAuthn registration (TouchID prompt)

Show a LinkDevice‑style confirmation modal in the wallet iframe:

- Call `webAuthnManager.requestRegistrationCredentialConfirmation` with:
  - `nearAccountId: toAccountId(accountId)`
  - `deviceNumber: nextDeviceNumber`
  - `contractId: configs.contractId`
  - `nearRpcUrl: configs.nearRpcUrl`
- Behavior:
  - Browser shows a TouchID/FaceID registration prompt.
  - On success, we get `{ confirmed, credential, prfOutput, vrfChallenge }`.
  - On cancel, abort the flow with a UI error (“Recovery cancelled”).

This is identical to the **Option F** branch in `LinkDeviceFlow.deriveDeterministicKeysAndRegisterAccount`, except we don’t perform key swap or registration yet.

### 4.4 Derive VRF + NEAR keys (offline)

Reuse the same deterministic derivation as LinkDevice:

1. VRF keypair from PRF:
   - `deriveVrfKeypairFromRawPrf({ prfOutput, nearAccountId: accountId })`
   - returns `{ encryptedVrfKeypair, serverEncryptedVrfKeypair, vrfPublicKey }`.

2. NEAR keypair (deterministic `new_public_key`, no transaction signing yet):
   - `deriveNearKeypairAndEncryptFromSerialized({
        nearAccountId: accountId,
        credential,
        options: { deviceNumber: nextDeviceNumber }
     })`
   - use only `publicKey` and encrypted private key; do **not** pass nonce/blockHash/contractId yet.

3. Save `PendingEmailRecovery`:

```ts
await savePendingEmailRecovery({
  accountId,
  recoveryEmail: canonicalEmail,
  deviceNumber: nextDeviceNumber,
  nearPublicKey: publicKey, // new_public_key
  encryptedVrfKeypair,
  serverEncryptedVrfKeypair,
  vrfPublicKey,
  credential,
  vrfChallenge,
  createdAt: Date.now(),
  status: 'awaiting-email',
});
```

### 4.5 UX state

- After Phase A:
  - Show a step indicator: “Step 1/3: New device key created”.
  - Enable a **“Send recovery email”** button that triggers Phase B (mailto).

## 5. Phase B — Mailto Prompt & Sending the Recovery Email

From `PendingEmailRecovery`:

1. Build the `mailto:` URL:
   - `to`: `recoveryEmail` stored in the record.
   - `subject`: `recover ${accountId}`.
   - `body`:
     - first line: `ed25519:${nearPublicKey}`
     - optional explanation on subsequent lines, e.g. “I am requesting to recover my Web3Authn account <accountId> on a new device.”

2. Trigger the email client:
   - use `<a href={mailtoUrl}>Send email</a>` or `window.location.href = mailtoUrl`.
   - update status: `status = 'awaiting-add-key'` in IndexedDB.

3. UI while waiting:
   - Show a “Waiting for your recovery email to be processed…” view.
   - Offer two options:
     - “I sent the email” → starts / resumes polling (Phase C).
     - “Change email / start over” → clears `PendingEmailRecovery` and returns to form.

## 6. Phase C — Poll for `add_key` (Email Recovery Contract)

Once the user sends the email, the relayer and zk‑email recovery contract will:

- Verify DKIM + zk proof.
- Parse `accountId` and `new_public_key` from the subject/body (`Subject: recover <accountId>`, `Body: ed25519:<new_public_key>`).
- Call the recovery contract which, in turn, **adds `new_public_key` as an access key** to `accountId`.

On the frontend, we need a polling loop similar to `LinkDeviceFlow.startPolling` / `checkForDeviceKeyAdded`, but keyed by `(accountId, nearPublicKey)` instead of a temp mapping.

### 6.1 Start polling

- When we detect `PendingEmailRecovery.status === 'awaiting-add-key'`:
  - start `startPollingEmailRecovery(accountId, nearPublicKey)`.
  - poll interval: reuse `DEVICE_LINKING_CONFIG.TIMEOUTS.POLLING_INTERVAL_MS`.

### 6.2 Poll implementation

Each tick:

1. If the flow has been cancelled or expired, stop polling.
2. Check if `new_public_key` has been added:
   - call `nearClient.viewAccessKey(accountId, nearPublicKey)`.
   - if it returns truthy (has access key), we consider AddKey detected.
   - Optional: if the recovery contract exposes a `view_recovery_status` view, you can call that instead or in addition.
3. Emit events similar to `DeviceLinkingPhase.STEP_4_POLLING` so React hooks can update UI.

On success:

- transition `PendingEmailRecovery.status = 'finalizing'`.
- stop polling and move to Phase D.

On timeout (e.g. 15–30 minutes since `createdAt`):

- mark `status = 'error'`.
- show “We couldn’t see your recovery email on‑chain. Check that you used the right subject or try again.”

## 7. Phase D — Finalize Registration & Local Storage (LinkDevice‑style)

Once `viewAccessKey` confirms the presence of `nearPublicKey`, we reuse LinkDevice’s **deterministic registration** flow to:
- sign a registration tx with the new key,
- store authenticator + encrypted keys locally,
- and auto‑login.

This largely mirrors:
- `LinkDeviceFlow.deriveDeterministicKeysAndRegisterAccount` (Step 3)
- `LinkDeviceFlow.storeDeviceAuthenticator`
- `LinkDeviceFlow.attemptAutoLogin`

### 7.1 Initialize NonceManager for the new key

```ts
nonceManager.initializeUser(accountId, nearPublicKey);
const { nextNonce, txBlockHash } =
  await nonceManager.getNonceBlockHashAndHeight(nearClient);
```

### 7.2 Re‑derive deterministic keypair with correct nonce

Using the cached `PendingEmailRecovery` fields:

- call `deriveNearKeypairAndEncryptFromSerialized` again:

```ts
const result = await webAuthnManager.deriveNearKeypairAndEncryptFromSerialized({
  nearAccountId: accountId,
  credential,
  options: {
    vrfChallenge,
    contractId: configs.contractId,
    nonce: nextNonce,
    blockHash: txBlockHash,
    deterministicVrfPublicKey: vrfPublicKey,
    deviceNumber,
  },
});
```

- Expect:
  - `result.signedTransaction` (registration tx),
  - `result.encryptedVrfKeypair` (may match stored one),
  - `result.serverEncryptedVrfKeypair` (for Shamir 3‑pass),
  - `result.publicKey` (should equal `nearPublicKey`).

### 7.3 Broadcast registration transaction

- Call: `nearClient.sendTransaction(result.signedTransaction)`.
- After broadcast, update NonceManager:

```ts
await nonceManager.updateNonceFromBlockchain(nearClient, nextNonce);
```

If tx fails:
- surface an explicit error and allow retry of **just Phase D** (no new email needed since `new_public_key` is already on‑chain).

### 7.4 Store authenticator + encrypted keys locally

Mirror `LinkDeviceFlow.storeDeviceAuthenticator`:

- Use `webAuthnManager.storeUserData`:
  - `nearAccountId: accountId`
  - `deviceNumber`
  - `clientNearPublicKey: nearPublicKey`
  - `lastUpdated: Date.now()`
  - `passkeyCredential: { id: credential.id, rawId: credential.rawId }`
  - `encryptedVrfKeypair: { encryptedVrfDataB64u, chacha20NonceB64u }`
  - `serverEncryptedVrfKeypair` (if any).
- Store authenticator metadata in the dedicated DB (same as LinkDevice) so:
  - it appears in `getAuthenticatorsByUser(accountId)`,
  - future logins can use the OS’s passkey chooser.

After this step, the device is **fully provisioned** for this account.

### 7.5 Auto‑login

Re‑use `LinkDeviceFlow.attemptAutoLogin` logic:

1. If Shamir 3‑pass is configured and `serverEncryptedVrfKeypair` is present:
   - call `shamir3PassDecryptVrfKeypair`, unlock VRF in memory.
2. Otherwise, fall back to a TouchID unlock:
   - build a VRF challenge via `generateVrfChallenge`.
   - call `getAuthenticationCredentialsSerialized` with allowCredentials set to the newly created authenticator.
   - call `unlockVRFKeypair` with the encrypted VRF keypair.

On success:

- call `webAuthnManager.initializeCurrentUser(accountId, nearClient)`.
- call `webAuthnManager.setLastUser(accountId, deviceNumber)`.
- update UI to logged‑in state (“Welcome <accountId>”).

### 7.6 Cleanup

- Set `PendingEmailRecovery.status = 'complete'`.
- Call `clearPendingEmailRecovery(accountId)` to remove the record.
- Stop any polling / timers associated with the flow.

## 8. Error Handling & Edge Cases

- **Invalid accountId / email not registered**
  - Fail before TouchID prompt; surface “No recovery email configured for this account”.
- **User cancels TouchID**
  - Do not save `PendingEmailRecovery`; show “Recovery cancelled”.
- **Email never processed or wrong subject**
  - Polling times out; keep `PendingEmailRecovery` but mark `status = 'error'`.
  - Provide a “Start over” CTA that clears the record and returns to Phase A.
- **AddKey is present but registration tx fails**
  - Let user retry **only Phase D**:
    - re‑initialize NonceManager,
    - re‑derive signed registration tx,
    - re‑broadcast.
- **Multiple devices / changing deviceNumber**
  - If contract authenticators change between Phase A and D:
    - recompute `nextDeviceNumber` from `syncAuthenticatorsContractCall`,
    - adjust stored `deviceNumber` in `PendingEmailRecovery` before finalization,
    - or enforce that email recovery always provisions the next available device number and fails if a conflict arises.

## 9. Relationship to LinkDevice Flow

Conceptually, email recovery is **“LinkDevice without Device 1”**:

- Phase A uses the same secureConfirm + PRF flow as `LinkDeviceFlow.deriveDeterministicKeysAndRegisterAccount` (Option F) to derive deterministic VRF + NEAR keys.
- Phase C replaces `LinkDeviceFlow.checkForDeviceKeyAdded`’s QR‑based AddKey with an AddKey triggered by the zk‑email recovery contract.
- Phase D reuses:
  - Nonce handling and registration signing from `deriveDeterministicKeysAndRegisterAccount` (step 3),
  - local storage logic from `storeDeviceAuthenticator`,
  - and login logic from `attemptAutoLogin`.

Implementation‑wise, this should be encapsulated as a dedicated `EmailRecoveryFlow` (mirroring `LinkDeviceFlow` and `AccountRecoveryFlow`) that:

- exposes a hook‑friendly API (`discover`/`start`/`getState`/`reset`),
- emits structured events for UI (phases: PREPARE → TOUCH_ID → AWAIT_EMAIL → POLLING → FINALIZING → COMPLETE/ERROR),
- and internally reuses existing `WebAuthnManager`, `NonceManager`, and `IndexedDBManager` helpers to avoid duplicating low‑level logic.
