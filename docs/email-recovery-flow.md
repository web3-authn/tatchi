# Email Recovery Flow (Passkey + ZK Email)

This document describes a full implementation plan for an **email‑based account recovery flow** that:

- Starts from a logged‑out state where the user only knows their `accountId` and a recovery email.
- Uses a TouchID/FaceID WebAuthn prompt to derive a new deterministic NEAR key (`new_public_key`) for that account.
- Asks the user to send an email with subject `recover <accountId> ed25519:<new_public_key>`.
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
    - `Subject: recover <accountId> ed25519:<new_public_key>`
    causes the zk‑email pipeline to:
      - verify DKIM + zk proof,
      - and call the recovery contract to **add `new_public_key` as an access key** on `accountId`.
  - The subject format is constructed in `sdk/src/core/TatchiPasskey/emailRecovery.ts:214` and parsed on the relayer in `examples/relay-cloudflare-worker/src/worker-helpers.ts`.
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
   - `subject`: `recover <accountId> ed25519:<new_public_key>`.
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
It must also support **resuming after reload** (user closes the tab, refreshes, or goes to top up funds and comes back later).

Add an IndexedDB record (either in `IndexedDBManager` or a small dedicated helper) keyed by `(accountId, nearPublicKey)`:

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

- `getPendingEmailRecovery(accountId, nearPublicKey): Promise<PendingEmailRecovery | null>`
- `savePendingEmailRecovery(record: PendingEmailRecovery): Promise<void>`
- `clearPendingEmailRecovery(accountId, nearPublicKey): Promise<void>`

This:
- enables **resume after reload**, and
- keeps the email‑based flow clearly separated from the rest of IndexedDB state.
- removes the risk of accidentally overwriting a pending record when switching accounts or restarting a flow, since entries are unique per `(accountId, nearPublicKey)` and can be TTL‑cleaned after ~30 minutes.

### 3.1 Resume behavior on reload

On app startup (or when opening the recovery screen), the UI should:

- Load `PendingEmailRecovery` by `accountId` (and optionally `nearPublicKey`, if known from on-chain state) or via a “last pending record” hint (see 10.2 for TTL and indexing).
- Branch based on `status`:
  - `'awaiting-email'`: re-show the TouchID‑complete state with a “Send recovery email” CTA (allow regenerating the same mailto link).
  - `'awaiting-add-key'`: show the “waiting for your recovery email to be processed…” state and allow restarting polling.
  - `'finalizing'`: attempt `finalize()` again; if it previously failed due to low balance, surface that error and let the user retry after funding.
  - `'error'`: show a concise error and offer a “Start over” button that clears the record.
  - `'complete'`: clear the record and treat the flow as done (user should be able to log in normally).

This ensures that if the user closes the tab while:
- sending the email, or
- topping up the account for Phase D,

they can return later, re-enter `accountId`, and resume from the correct step using the same `new_public_key` and credential that were already created.

## 4. Phase A — Inputs + TouchID: Derive `new_public_key`

Triggered when the user submits the “Recover account with email” form.

### 4.1 Validate inputs

- Validate `accountId`:
  - use `validateNearAccountId(accountId)`; surface any error inline.
- Check account balance:
  - call `nearClient.viewAccount(accountId)` and ensure available balance is above a **configurable minimum** (e.g. enough to cover `verify_and_register_user_for_account`, ≈ `0.01` NEAR).
  - if insufficient, fail early with a clear error (“This account doesn’t have enough NEAR to finalize recovery; please top up and try again.”) and do **not** proceed to TouchID.
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
   - `subject`: `recover ${accountId} ed25519:${nearPublicKey}`.
   - `body`:
     - optional explanation on subsequent lines, e.g. “I am requesting to recover my Web3Authn account <accountId> with a new passkey.”

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
- Parse `accountId` and `new_public_key` from the subject (`Subject: recover <accountId> ed25519:<new_public_key>`).
- Call the recovery contract which, in turn, **adds `new_public_key` as an access key** to `accountId`.

On the frontend, we need a polling loop similar to `LinkDeviceFlow.startPolling` / `checkForDeviceKeyAdded`, but keyed by `(accountId, nearPublicKey)` instead of a temp mapping.

### 6.1 Start polling

- When we detect `PendingEmailRecovery.status === 'awaiting-add-key'`:
  - start `startPollingEmailRecovery(accountId, nearPublicKey)`.
  - poll interval: create a new `EMAIL_RECOVERY_CONFIG.TIMEOUTS.POLLING_INTERVAL_MS` similar to  `DEVICE_LINKING_CONFIG.TIMEOUTS.POLLING_INTERVAL_MS`.

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
- the contract function to call is:
```
    pub fn verify_and_register_user_for_account(
        &mut self,
        account_id: AccountId,
        vrf_data: VRFVerificationData,
        webauthn_registration: WebAuthnRegistrationCredential,
        deterministic_vrf_public_key: Vec<u8>,
        authenticator_options: AuthenticatorOptions,
        device_number: Option<u8>,
    ) -> VerifyRegistrationResponse
```
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

## 10. Implementation TODO (step‑by‑step)

All new core logic should live in `sdk/src/core/TatchiPasskey/emailRecovery.ts`, reusing existing primitives from `linkDevice.ts`, `recoverAccount.ts`, and `NearClient.ts`.

### 10.1 Design `EmailRecoveryFlow` API

- [ ] Read:
  - `sdk/src/core/TatchiPasskey/linkDevice.ts` (flow structure, events, retry/polling patterns).
  - `sdk/src/core/TatchiPasskey/recoverAccount.ts` (recovery flow + VRF derivation).
  - `sdk/src/core/types/passkeyManager.ts` (event types, phases, status enums).
  - `sdk/src/core/WebAuthnManager/index.ts` (registration + VRF helpers).
  - `sdk/src/core/IndexedDBManager/index.ts` and `sdk/src/core/IndexedDBManager/passkeyClientDB.ts` (appState + recovery email storage).
  - `sdk/src/core/NearClient.ts` (viewAccessKey, sendTransaction, viewBlock helpers).
- [x] In `sdk/src/core/TatchiPasskey/emailRecovery.ts`:
  - Define `PendingEmailRecovery` (copy the shape from section 3 of this doc).
  - Define `EmailRecoveryFlowOptions` (callbacks: `onEvent`, `onError`, `afterCall` similar to `AccountRecoveryHooksOptions`).
  - In `sdk/src/core/types/passkeyManager.ts`, define:
    - `EmailRecoveryPhase` enum with phases matching this doc (e.g. PREPARE → TOUCH_ID → AWAIT_EMAIL → POLLING → FINALIZING → COMPLETE/ERROR).
    - `EmailRecoveryStatus` enum (`PROGRESS`/`SUCCESS`/`ERROR`).
    - `EmailRecoverySSEEvent` type (mirroring `DeviceLinkingSSEEvent` / `AccountRecoverySSEEvent`).
    - Extend any relevant hook options (`SignNEP413HooksOptions` etc.) so `onEvent` can accept `EmailRecoverySSEEvent`.
  - Define public methods:
    - `start(input: { accountId: string; recoveryEmail: string }): Promise<void>` – kicks off Phase A.
    - `buildMailtoUrl(accountId: string): Promise<string>` – returns `mailto:` URL for Phase B.
    - `startPolling(): void` / `stopPolling(): void` – manage Phase C timers.
    - `finalize(): Promise<void>` – runs Phase D (registration + local storage + auto‑login).
    - `getState()` – returns current phase, pending record (without sensitive fields if needed), and last error.

### 10.2 Implement IndexedDB helpers for `PendingEmailRecovery`

- [x] In `sdk/src/core/TatchiPasskey/emailRecovery.ts` implement private helpers using the existing appState store:
  - `loadPending(accountId: AccountId, nearPublicKey?: string): Promise<PendingEmailRecovery | null>` → either:
    - read a single record keyed by `'pendingEmailRecovery:' + accountId + ':' + nearPublicKey`, or
    - read a small index (e.g. array of pending records for `accountId`) and filter in memory.
  - `savePending(record: PendingEmailRecovery): Promise<void>` → write under a composite key including both `accountId` and `nearPublicKey` so concurrent recoveries for different keys don’t stomp each other.
  - `clearPending(accountId: AccountId, nearPublicKey?: string): Promise<void>` → delete that specific record; optionally expose a helper to clear all stale records for an account.
- [x] Ensure serialization/deserialization works across reloads (plain JSON, no class instances).
- [x] Enforce a TTL of ~30 minutes when loading (e.g. if `Date.now() - createdAt > 30 * 60 * 1000`, treat the record as expired and clear it).

### 10.3 Implement Phase A in `EmailRecoveryFlow.start`

- [x] Validate inputs:
  - Use `validateNearAccountId(accountId)` to reject invalid IDs early.
  - Call `nearClient.viewAccount(accountId)` and enforce a configurable minimum balance (e.g. enough to cover `verify_and_register_user_for_account`); fail fast with a UX‑friendly error if there isn’t enough NEAR.
  - Canonicalize email (lowercase, trimmed).
  - Optionally verify that the email hash matches on‑chain recovery hashes (if the contract exposes them).
- [x] Determine `deviceNumber`:
  - Call `syncAuthenticatorsContractCall(nearClient, configs.contractId, accountId)` to fetch existing authenticators.
  - Compute `nextDeviceNumber = (max(deviceNumber) ?? 0) + 1`.
- [x] Trigger TouchID/FaceID registration:
  - Call `webAuthnManager.requestRegistrationCredentialConfirmation` with:
    - `nearAccountId: toAccountId(accountId)`,
    - `deviceNumber: nextDeviceNumber`,
    - `contractId: configs.contractId`,
    - `nearRpcUrl: configs.nearRpcUrl`.
  - Handle user cancel by emitting an error event and aborting without writing `PendingEmailRecovery`.
- [x] Derive VRF + NEAR keys (offline):
  - Call `deriveVrfKeypairFromRawPrf({ prfOutput, nearAccountId: accountId })`.
  - Call `deriveNearKeypairAndEncryptFromSerialized({ nearAccountId: accountId, credential, options: { deviceNumber: nextDeviceNumber } })`.
- [x] Persist `PendingEmailRecovery` via the helpers from 10.2 with `status: 'awaiting-email'`.
- [x] Emit appropriate PREPARE / TOUCH_ID / AWAIT_EMAIL events via `onEvent`.

### 10.4 Implement Phase B helpers (`buildMailtoUrl`)

- [x] In `sdk/src/core/TatchiPasskey/emailRecovery.ts`:
  - Implement `buildMailtoUrl(accountId)` that:
    - Loads `PendingEmailRecovery` by accountId.
    - Assembles `mailto:${recoveryEmail}?subject=${encodeURIComponent('recover ' + accountId + ' ed25519:' + nearPublicKey)}` (body optional).
  - Update `PendingEmailRecovery.status` to `'awaiting-add-key'` when this is called.
- [ ] The React/UI layer (e.g. a “Recover account with email” page/component) will:
  - Call `buildMailtoUrl` and then set `window.location.href = url` or use a link.
  - Show the “Waiting for your recovery email to be processed…” state while polling is running.
  - Surface progress and errors (polling elapsed time, timeout messaging) and provide a “start over”/resume button that reuses `tatchi.finalizeEmailRecovery` on reload.

### 10.5 Implement Phase C polling (`startPolling` / `stopPolling`)

- [x] In `sdk/src/core/TatchiPasskey/emailRecovery.ts`:
  - Use a pattern similar to `LinkDeviceFlow.startPolling`:
    - Track `pollGeneration`, `pollingInterval` timer, and cancellation flag.
  - Each tick:
    - Load the current `PendingEmailRecovery` (if missing or expired → stop with error).
    - Call `nearClient.viewAccessKey(accountId, nearPublicKey)` to check if `new_public_key` has been added.
    - Emit POLLING events with progress messages.
  - [x] On success (key found):
    - Update `PendingEmailRecovery.status = 'finalizing'`.
    - Stop the polling timer.
    - Optionally auto‑invoke `finalize()` if the caller requested it.
  - [x] On timeout (based on `createdAt` + max duration):
    - Set `status = 'error'`.
    - Emit an ERROR event and stop polling.

### 10.6 Implement Phase D (`finalize`): registration + local storage + auto‑login

- [x] Initialize NonceManager for the new key:
  - `nonceManager.initializeUser(accountId, nearPublicKey)`.
  - `const { nextNonce, txBlockHash } = await nonceManager.getNonceBlockHashAndHeight(nearClient);`
- [x] Re‑derive deterministic NEAR keypair with correct nonce:
  - Call `deriveNearKeypairAndEncryptFromSerialized` with:
    - `vrfChallenge`, `contractId`, `nonce`, `blockHash`, `deterministicVrfPublicKey`, `deviceNumber`.
  - Assert `result.publicKey === nearPublicKey`.
- [x] Broadcast registration transaction:
  - `await nearClient.sendTransaction(result.signedTransaction)`.
    - If this fails with an insufficient funds / gas error, surface a clear message (“Not enough NEAR to finalize recovery; please top up and retry”) but **keep** `PendingEmailRecovery` so the user can retry finalization after funding.
  - `await nonceManager.updateNonceFromBlockchain(nearClient, nextNonce)` (best effort).
- [x] Store authenticator + encrypted keys locally:
  - Use `webAuthnManager.storeUserData` with:
    - `nearAccountId: accountId`,
    - `deviceNumber`,
    - `clientNearPublicKey: nearPublicKey`,
    - `passkeyCredential: { id: credential.id, rawId: credential.rawId }`,
    - `encryptedVrfKeypair` + `serverEncryptedVrfKeypair`.
  - Optionally sync authenticators from contract via `syncAuthenticatorsContractCall` and update the authenticator cache in IndexedDB.
- [x] Auto‑login:
  - Reuse `LinkDeviceFlow.attemptAutoLogin` logic (refactor into a shared helper if needed) to:
    - unlock VRF either via Shamir 3‑pass or TouchID fallback,
    - call `webAuthnManager.initializeCurrentUser(accountId, nearClient)`,
    - call `webAuthnManager.setLastUser(accountId, deviceNumber)`.
- [x] Cleanup:
  - Set `PendingEmailRecovery.status = 'complete'`.
  - Call `clearPending(accountId)` to remove the appState entry.
  - Emit FINALIZING / COMPLETE events.

### 10.7 Wire `EmailRecoveryFlow` into `TatchiPasskey` and React UI

- [x] In `sdk/src/core/TatchiPasskey/index.ts`:
  - Import `EmailRecoveryFlow`.
  - Add helper methods:
    - `startEmailRecovery(accountId: string, recoveryEmail: string, options?: EmailRecoveryFlowOptions): Promise<void>`
    - `finalizeEmailRecovery(accountId: string, nearPublicKey?: string, options?: EmailRecoveryFlowOptions): Promise<void>`
  - These methods should internally create/reuse a single `EmailRecoveryFlow` and are what the iframe RPC layer will call (wallet host and parent app both rely on this surface).
- [x] In the React layer:
  - Read reference patterns in:
    - `sdk/src/react/components/PasskeyAuthMenu/index.tsx` (link device & recovery entrypoints).
    - `sdk/src/react/components/ProfileSettingsButton/LinkedDevicesModal.tsx` (device list + access keys).
  - Implement a simple “Recover account with email” flow component/hook that:
    - Collects `accountId` and `recoveryEmail`.
    - Calls `tatchi.startEmailRecovery`, then uses the returned/derived `mailto:` URL, then starts polling.
    - On reload or account switch, can call `tatchi.finalizeEmailRecovery` directly when on-chain state already contains `nearPublicKey` from a pending record.
  - UX: clearly display **which email must send the message** (e.g. “Send this email from `<recoveryEmail>`”), and consider a short helper text that explains recovery will fail if sent from a different address.
    - Subscribes to `onEvent` to drive UI (steps/progress, error states).
  - Optionally surface recovery status in `LinkedDevicesModal` (e.g. highlight the newly recovered device / key).

### 10.8 Tests, logging, and hardening

- [ ] Add targeted unit/integration tests (where feasible) around:
  - `buildMailtoUrl` format (`recover <accountId> ed25519:<new_public_key>` subject).
  - Polling logic (success, timeout, cancellation).
  - Finalization flow happy path and retry of registration tx.
- [ ] Ensure logs mirror existing patterns from `LinkDeviceFlow` and `AccountRecoveryFlow` (consistent prefixes, levels) and include structured fields for:
  - `accountId`, `nearPublicKey`, email recovery status (phase), AddKey detection, registration tx hash / error type.
- [ ] Double‑check that no sensitive material (PRF output, unencrypted keys) is persisted or logged.

### 10.9 Wire `EmailRecoveryPhase` into wallet iframe plumbing

- [x] In `sdk/src/core/WalletIframe/client/progress-bus.ts`:
  - Import `EmailRecoveryPhase`.
  - Add email‑recovery phases that require user activation (e.g. TOUCH_ID, FINALIZING if it performs WebAuthn) to `SHOW_PHASES`.
  - Add non‑interactive / completion phases (FINALIZING once past WebAuthn, COMPLETE, ERROR) to `HIDE_PHASES`.
- [x] In `sdk/src/core/WalletIframe/client/router.ts`:
  - Import `EmailRecoverySSEEvent` and include it wherever progress events are typed (e.g. in `SignNEP413HooksOptions.onEvent` unions and any generic progress dispatch logic).
  - Ensure the router forwards email‑recovery progress events from the iframe to parent callbacks just like device linking and account recovery.
- [x] In `sdk/src/core/WalletIframe/host/wallet-iframe-handlers.ts`:
  - Add new PM handlers for the email recovery flow (e.g. `PM_EMAIL_RECOVERY_START`, `PM_EMAIL_RECOVERY_FINALIZE`, or a single `PM_EMAIL_RECOVERY_FLOW` depending on API shape).
  - Inside those handlers, call the corresponding `TatchiPasskey` methods on the host (`emailRecoveryFlow.start`, `buildMailtoUrl`, `startPolling`, `finalize`) and wire `onEvent: (ev) => postProgress(req.requestId, ev)` so `EmailRecoveryPhase` events reach the client.

### 10.10 Config knobs (`TatchiPasskeyConfigs.relayer.emailRecovery`)

- [x] Extend `TatchiPasskeyConfigs` in `sdk/src/core/types/passkeyManager.ts`:
  - under `relayer`, add an `emailRecovery` config object, for example:
    - `minBalanceYocto?: string` – minimum available balance required to start Phase A (prevents underfunded accounts from entering the flow).
    - `pollingIntervalMs?: number` – override for email recovery polling interval.
    - `maxPollingDurationMs?: number` – maximum time to keep polling before timing out.
    - `pendingTtlMs?: number` – TTL for `PendingEmailRecovery` records (default ~30 minutes).
- [x] Use these values in `EmailRecoveryFlow` instead of hard‑coding constants, falling back to sensible defaults when not provided.
