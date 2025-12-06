# VRF2 Refactor – Device2 Registration Flow (Link Device 2/Companion Device)

This document narrows the `LinkDeviceFlow` refactor to a single concern:

- Move **Device2 registration** fully onto the VRF‑driven signing stack (VRF worker + confirmTxFlow),
- Stop using the deprecated `registration_transaction` path inside the signer worker,
- Keep the existing UX and on‑chain semantics (QR → AddKey + mapping on Device1 → key swap + registration on Device2).

It is intended to complement:
- `docs/vrf2-link-device-flow.md` (overall link‑device plan),
- `docs/vrf-refactor-implementation-plan.md` (global VRF/signing architecture).

---

## 1. Current State (after Option‑F‑only refactor)

**Device1 (origin device)**
- Uses `linkDeviceWithScannedQRData` (`sdk/src/core/TatchiPasskey/scanDevice.ts`) +
  `executeDeviceLinkingContractCalls` (`sdk/src/core/rpcCalls.ts`) to:
  - Sign and send:
    1. `AddKey(device2TempPublicKey)` to `device1AccountId`.
    2. `store_device_linking_mapping(device_public_key, target_account_id)` to the contract.
  - Signing goes through:
    - `WebAuthnManager.signTransactionsWithActions`
    - `SignerWorkerManager.signTransactionsWithActions`
    - `VrfWorkerManager.confirmAndPrepareSigningSession(kind: 'transaction', ...)`
    - `confirmTxFlow` → `handleTransactionSigningFlow` (VRF worker + confirm UI).
- Intent digest now uses the **canonical format**:
  - `{ receiverId, actions: ActionArgsWasm[] }`, actions normalized via `orderActionForDigest`,
  - No nonce or extra metadata in the digest input.

**Device2 (companion device)**
- Only **Option F** exists now (account discovery via temp key):
  - `generateQR()`:
    - Generates a **temporary** NEAR Ed25519 keypair (no VRF, no signer session).
    - Stores `session` with:
      - `accountId: null`, `deviceNumber: undefined`,
      - `nearPublicKey = tempPublicKey`, `tempPrivateKey`,
      - `credential: null`, `vrfChallenge: null`.
    - Encodes only the temp `device2PublicKey` in the QR.
  - `startPolling()` + `checkForDeviceKeyAdded()`:
    - Polls the contract for `get_device_linking_account(device2PublicKey)` to discover:
      - `linkedAccountId`, `deviceNumber` (current last device).
    - Sets `session.accountId = linkedAccountId`, `session.deviceNumber = deviceNumber + 1`.
  - `swapKeysAndRegisterAccount()`:
    - Calls `deriveDeterministicKeysAndRegisterAccount()` to:
      1. Collect a **link‑device registration credential** via
         `webAuthnManager.requestRegistrationCredentialConfirmation({ nearAccountId: accountId, deviceNumber })`.
      2. Derive deterministic VRF keypair from PRF via `deriveVrfKeypairFromRawPrf`.
      3. Derive deterministic NEAR keypair via `deriveNearKeypairAndEncryptFromSerialized` (pure derive + encrypt).
      4. Use `signTransactionWithKeyPair` and the **temporary** key to:
         - Add deterministic key,
         - Delete temp key (swap).
      5. Store authenticator/VRF data locally and perform auto‑login.
    - Calls a new helper `registerDeviceOnChain` to:
      1. Build a `link_device_register_user` FunctionCall transaction using:
         - `vrf_data` derived from the stored `vrfChallenge`,
         - the serialized registration credential (PRF stripped),
         - the deterministic VRF public key.
      2. Sign that transaction via `webAuthnManager.signTransactionsWithActions` (VRF‑driven confirmTxFlow).
      3. Broadcast the signed transaction via `nearClient.sendTransaction` and wait for finality.

**Current shape**

- Device2 no longer uses the deprecated `registration_transaction` path in the signer worker:
  - `deriveNearKeypairAndEncryptFromSerialized` is derive/encrypt only (no tx signing).
  - The Rust request no longer exposes `registration_transaction`.
- Device2 submits the `link_device_register_user` registration transaction via a **no‑extra‑prompt** path:
  - One WebAuthn prompt collects the credential and VRF challenge.
  - Temp→deterministic key swap happens with the temp key.
  - Registration tx is signed after the swap via `signDevice2RegistrationWithStoredKey`, reusing the stored credential/PRF through VRF/signer workers.
- UX is now single‑prompt (credential), with post‑swap signing driven by workers; no second TouchID.

---

## 2. Current Architecture – Device2 Registration Under VRF2

- **One prompt**: Device2 collects the registration credential once (confirmTxFlow UI).
- **Temp key swap**: Still performed with the temp key (AddKey deterministic, DeleteKey temp).
- **Post‑swap signing (no extra prompt)**:
  - Re‑init NonceManager for the deterministic key.
  - VRF worker re-derives WrapKeySeed from the stored credential (PRF.first) and sends it + PRF.second to signer over MessageChannel.
  - Signer worker derives/uses deterministic NEAR key and signs `link_device_register_user`.
- **Signer worker** is registration‑agnostic outside the dedicated `RegisterDevice2WithDerivedKey` handler; `registration_transaction` is removed from derive‑near requests.
- **deriveNearKeypairAndEncryptFromSerialized** is derive/encrypt only; no registration signing.

---

## 3. Proposed Flow – Device2 (Companion) End‑to‑End

This is the intended final shape of the Device2 flow.

1. **QR + temp key (unchanged)**
   - Device2:
     - Generates temp NEAR keypair.
     - Encodes temp public key into QR.
     - Starts polling the contract for `get_device_linking_account(tempPublicKey)`.

2. **Device1 AddKey + mapping (unchanged)**
   - Device1:
     - Uses VRF signing flow to send:
       - `AddKey(tempPublicKey)` to `device1AccountId`,
       - `store_device_linking_mapping(tempPublicKey, device1AccountId)` to the contract.

3. **Device2 discovers account + deviceNumber (unchanged)**
   - Device2:
     - Polls until mapping appears.
     - Sets `session.accountId = linkedAccountId`, `session.deviceNumber = deviceNumber + 1`.

4. **Device2: link‑device registration credential + key derivation (unchanged conceptually)**
   - Device2:
     - Calls `requestRegistrationCredentialConfirmation({ nearAccountId: accountId, deviceNumber })` inside the wallet iframe.
     - Extracts PRF from the credential.
     - Derives:
       - deterministic VRF keypair via `deriveVrfKeypairFromRawPrf` (saved for storage + registration),
       - deterministic NEAR keypair via `deriveNearKeypairAndEncryptFromSerialized` (first call, **no tx signing**).

5. **Device2: key swap (unchanged)**
   - Device2:
     - Uses NonceManager to fetch nonce + block hash for the **temp** key.
     - Calls `signTransactionWithKeyPair` with `tempPrivateKey` to produce an AddKey+DeleteKey swap tx.
     - Broadcasts swap tx and updates NonceManager accordingly.
     - Cleans up `tempPrivateKey` and any temp vault entry.

6. **Device2: registration transaction (post‑swap, no extra prompt)**
   - Device2:
     - Re‑initializes NonceManager for the **deterministic** key (clientNearPublicKey from the earlier derive).
     - Uses `webAuthnManager.signDevice2RegistrationWithStoredKey` to:
       - Have VRF worker re-derive WrapKeySeed from the stored credential (PRF.first) and send WrapKeySeed + PRF.second to signer.
       - Signer worker derives/uses the deterministic NEAR key and signs a `link_device_register_user` FunctionCall.
     - Broadcasts the signed registration transaction via `nearClient.sendTransaction` and waits for finality.

7. **Device2: local storage + auto‑login (mostly unchanged)**
   - After the registration transaction confirms:
     - Device2 stores:
       - `clientNearPublicKey` (deterministic),
       - `encryptedVrfKeypair`, `serverEncryptedVrfKeypair`,
       - authenticator record (COSE public key, transports, deviceNumber, VRF pubkey).
     - Attempts Shamir 3‑pass auto‑login first; falls back to TouchID VRF unlock.

---

## 4. Implementation Plan (Incremental Changes)

This section lists concrete code changes, not necessarily in exact order, but grouped by concern.

### 4.1. Stop using `registrationTransaction` in Device2

- **File:** `sdk/src/core/TatchiPasskey/linkDevice.ts`
  - In `deriveDeterministicKeysAndRegisterAccount`:
    - Treat `deriveNearKeypairAndEncryptFromSerialized` strictly as:
      - A pure “derive NEAR keypair + save encrypted key” helper (no registration tx signing).
    - Keep the existing key swap logic that uses `signTransactionWithKeyPair` and the temp key.
  - In `swapKeysAndRegisterAccount`:
    - Ensure comments describe the current behavior accurately:
      - Derive deterministic VRF/NEAR keys.
      - Execute key swap (temp → deterministic).
      - Store authenticator/VRF data locally.
      - Perform auto‑login.

### 4.2. Device2 registration path (current)

- Keep one WebAuthn prompt to collect credential + PRF.
- Swap temp→deterministic key with the temp key (raw Ed25519).
- Sign registration post‑swap using `signDevice2RegistrationWithStoredKey` (VRF worker re-derives WrapKeySeed; signer signs with deterministic key).

### 4.3. Keep signer worker PRF‑free and registration‑agnostic

- **File:** `sdk/src/wasm_signer_worker/src/handlers/handle_derive_near_keypair_and_encrypt.rs`
  - Leave the warning in place (or eventually remove the `registration_transaction` field entirely) to ensure:
    - All new flows do not try to sign registration transactions inside this handler.
    - Signer worker is a pure WrapKeySeed/KEK/NEAR‑signing enclave.

- **File:** `sdk/src/core/WebAuthnManager/index.ts`
  - Clarify in comments for `deriveNearKeypairAndEncryptFromSerialized` that:
    - It is not responsible for registration RPC/tx.
    - Registration should always be done via VRF‑driven `signTransactionsWithActions`.

### 4.4. Tests & compatibility

- Add/update tests to cover:
  - Successful Device2 linking where:
    - Device1 AddKey + mapping succeed via VRF signing flow.
    - Device2 key swap executes correctly via temp key.
    - Device2 registration transaction is signed & broadcast via VRF signing flow (no use of `registration_transaction`).
  - Regression tests for:
    - Intent digest stability (no `INTENT_DIGEST_MISMATCH` across link‑device flows).
    - Link‑device flow continuing to work if only the registration portion is upgraded.

---

## 5. Summary

After this refactor:

- **Device1**:
  - Already uses the canonical VRF2 signing path for its AddKey + mapping transactions.

- **Device2**:
  - Uses a temp key only for QR + key swap.
  - Uses VRF‑driven signing for the **registration transaction**, just like any other action.
  - No longer relies on signer‑worker‑local registration paths; the VRF worker fully owns WebAuthn/VRF/WrapKeySeed and registration confirmation logic.

This aligns link‑device Device2 registration with the overall VRF2 design and avoids deprecated code paths in the signer worker, while keeping the external UX unchanged.

---

## 6. TODO / Implementation Checklist

This section tracks the concrete implementation tasks required to realize the design above.

**Progress so far**

- Device1:
  - Uses the VRF‑driven `signTransactionsWithActions` + `confirmAndPrepareSigningSession` path for AddKey + mapping.
  - Canonical intent digest has been fixed to ignore nonce and only hash `{ receiverId, actions }` (UI + VRF now agree, no `INTENT_DIGEST_MISMATCH`).
- Device2:
  - Option E (pre‑supplied `accountId`) has been removed; only the temp‑key (Option F) flow remains.
  - `LinkDeviceFlow.deriveDeterministicKeysAndRegisterAccount`:
    - Derives deterministic VRF + NEAR keys from the link‑device registration credential.
    - Performs the temp→deterministic key swap via `signTransactionWithKeyPair` + `executeKeySwapTransaction`.
    - No longer calls `deriveNearKeypairAndEncryptFromSerialized` with a `registrationTransaction` payload, and no longer expects a signed registration tx from that path.
    - Re‑initializes `NonceManager` for the deterministic key after the swap.
  - Storage + auto‑login logic remain as‑is and work with the deterministic keypair.
  - The signer worker’s deprecated `registration_transaction` branch is no longer used from JS (only logs a warning if ever hit).

**A. Signer worker / Rust**

- [x] Introduce a dedicated signer worker request/handler for “derive NEAR keypair + sign Device2 registration tx” that:
  - Is invoked only within a VRF‑owned signing session (WrapKeySeed already delivered over MessagePort).
  - Accepts:
    - Registration credential (or a VRF‑sanitized representation),
    - `transactionContext` (block hash, base nonce, etc.),
    - Registration args (contractId, vrf_data, authenticator_options).
  - Returns:
    - `publicKey`,
    - encrypted NEAR key data (`encryptedData`, `iv`, `wrapKeySalt`),
    - `signedTransaction` for the registration call.
- [x] Wire up `RegisterDevice2WithDerivedKey` in `sdk/src/wasm_signer_worker/src/lib.rs` message loop.
- [x] Restrict `handle_derive_near_keypair_and_encrypt` to the new VRF‑managed path:
  - Stop exposing `registrationTransaction` via JS options.
  - Either:
    - Remove `registration_transaction` from `DeriveNearKeypairAndEncryptRequest`, or
    - Keep it internal only for the new combined handler.
- [x] Remove or downgrade the current “registration_transaction path is deprecated” warning once the VRF‑driven path is in place.

**B. VRF worker / confirmTxFlow**

- [x] Add a VRF‑side API (e.g. `confirmAndDeriveDevice2RegistrationSession`) that:
  - Runs a Device2‑specific registration confirm flow (single WebAuthn ceremony).
  - After confirmation:
    - Derives WrapKeySeed from PRF.first and sends it to the signer worker via the reserved MessagePort.
    - Returns to JS:
      - `credential`, `vrfChallenge`,
      - `transactionContext`,
      - `wrapKeySalt` actually used.
- [x] Ensure confirmTxFlow uses the canonical intent digest (receiverId + normalized actions, no nonce) for the registration tx.

**C. WebAuthnManager / JS API**

- [x] Sign Device2 registration post‑swap via `signDevice2RegistrationWithStoredKey` (VRF worker re-derives WrapKeySeed, signer signs).
- [x] `deriveNearKeypairAndEncryptFromSerialized` is “derive & encrypt only”.

**D. LinkDeviceFlow wiring**

- [x] Use the stored‑credential signer path after temp→deterministic swap; no combined helper needed.

**E. Storage & auto‑login**

- [x] Store deterministic NEAR key data in `nearKeysDB` with `wrapKeySalt`/`deviceNumber`.
- [x] Store VRF credentials (`encryptedVrfKeypair`, `serverEncryptedVrfKeypair`) in `passkeyClientDB`.
- [x] Store authenticator record with `credentialId`, `credentialPublicKey`, `transports`, `deviceNumber`, `vrfPublicKey`.
- [x] Re‑use existing auto‑login logic (Shamir 3‑pass first, then TouchID VRF unlock) with no extra prompts.

**F. Tests and regression checks**

- [ ] Add or update tests to cover:
  - Single‑prompt Device2 linking: one credential prompt, post‑swap registration signed via stored credential (no second TouchID).
  - Correct storage of deterministic keys, VRF credentials, and authenticator records for Device2 (wrapKeySalt/deviceNumber preserved).
  - Canonical intent digest on Device2 registration (receiverId + normalized actions only).
  - Nonce reconciliation after temp→deterministic swap and registration broadcast.
- [ ] Verify no unexpected `INTENT_DIGEST_MISMATCH` errors for:
  - Device1 AddKey + mapping,
  - Device2 registration transaction.
