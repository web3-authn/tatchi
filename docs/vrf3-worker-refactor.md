# VRF3 Worker Refactor — Handler-Based `VrfWorkerManager`

This document outlines a concrete plan to refactor
`sdk/src/core/WebAuthnManager/VrfWorkerManager/index.ts`
so that its business logic lives in standalone handler functions under
`sdk/src/core/WebAuthnManager/VrfWorkerManager/handlers`.

The target shape mirrors the existing
`SignerWorkerManager` + `SignerWorkerManager/handlers` pattern:

- The class in `index.ts` owns worker lifecycle, wiring, and context.
- Stateless handler functions in `handlers/*` implement flows and call back
  into the worker via a small context surface.

The refactor should be behavior‑preserving and test‑driven.

---

## 1. Goals and Non‑Goals

**Goals**
- Shrink `VrfWorkerManager/index.ts` into a thin orchestrator with:
  - Worker lifecycle + error handling.
  - Context creation (`VrfWorkerManagerContext`).
  - Public methods that delegate to handlers.
- Move flow logic and worker RPC wiring into standalone handler modules under
  `VrfWorkerManager/handlers`.
- Reuse the same handler style as `SignerWorkerManager/handlers`:
  - `export async function foo({ ctx, ...args }) { … }`
  - `ctx` is a typed manager context with `sendMessage`, `ensureWorkerReady`, etc.
- Keep the **public TypeScript API** of `VrfWorkerManager` stable
  (method names, arguments, and return types remain unchanged).

**Non‑Goals**
- No Rust / WASM protocol changes in this refactor.
  - Message types and payloads for the VRF worker stay the same.
- No behavioral changes to confirmation flows (`confirmTxFlow`).
- No changes to how `WebAuthnManager` constructs or uses `VrfWorkerManager`,
  beyond wiring any new context fields.

---

## 2. Current `VrfWorkerManager` Responsibilities (TS)

`sdk/src/core/WebAuthnManager/VrfWorkerManager/index.ts` currently mixes:

- **Context / wiring**
  - `VrfWorkerManagerContext` (for `confirmTxFlow` and VRF‑owned flows).
  - `getContext()`.
  - `setWorkerBaseOrigin(origin)`.

- **Worker lifecycle & low‑level plumbing**
  - Private worker instance and lifecycle state:
    - `private vrfWorker: Worker | null`
    - `private initializationPromise: Promise<void> | null`
    - `private messageId: number`
    - `private config: VrfWorkerManagerConfig`
    - `private currentVrfAccountId: string | null`
    - `private workerBaseOrigin: string | undefined`
  - Methods:
    - `initialize()`
    - `private ensureWorkerReady(requireHealthCheck?: boolean)`
    - `private createVrfWorker()`
    - `private sendMessage<T extends WasmVrfWorkerRequestType>(…)`
    - `private testWebWorkerCommunication()`
    - `private generateMessageId()`

- **Public API / flow methods that should become handlers**
  - Session / channel:
    - `createSigningSessionChannel(sessionId)`
  - VRF‑driven signing & registration flows:
    - `deriveWrapKeySeedAndSendToSigner({ … })`
    - `prepareDecryptSession({ … })`
    - `confirmAndPrepareSigningSession(…)`
    - `requestRegistrationCredentialConfirmation(…)`
    - `confirmAndDeriveDevice2RegistrationSession(…)`
  - VRF keypair unlock / challenge / session:
    - `unlockVrfKeypair({ … })`
    - `generateVrfChallenge(inputData)`
    - `checkVrfStatus()`
    - `clearVrfSession()`
    - `setCurrentVrfAccountId(nearAccountId)`
  - VRF keypair bootstrap / deterministic derivation:
    - `generateVrfKeypairBootstrap({ vrfInputData, saveInMemory })`
    - `deriveVrfKeypairFromPrf({ credential, nearAccountId, … })`
    - `deriveVrfKeypairFromRawPrf({ prfOutput, nearAccountId, … })`
  - Shamir 3‑pass wrapper helpers:
    - `shamir3PassDecryptVrfKeypair({ … })`
    - `shamir3PassEncryptCurrentVrfKeypair()`

Additionally, there is a local utility:

- `computeTotalAmountYocto(txSigningRequests)` — already a pure helper and can
  be reused by handlers as is.

---

## 3. Target Structure

### 3.1 Files and Folders

Create a handler tree that mirrors how `SignerWorkerManager/handlers` is organized:

- `sdk/src/core/WebAuthnManager/VrfWorkerManager/handlers/`
  - `index.ts` (barrel re‑exports)
  - `createSigningSessionChannel.ts`
  - `deriveWrapKeySeedAndSendToSigner.ts`
  - `prepareDecryptSession.ts`
  - `confirmAndPrepareSigningSession.ts`
  - `requestRegistrationCredentialConfirmation.ts`
  - `confirmAndDeriveDevice2RegistrationSession.ts`
  - `unlockVrfKeypair.ts`
  - `generateVrfChallenge.ts`
  - `session.ts` (for `checkVrfStatus`, `clearVrfSession`, `setCurrentVrfAccountId`)
  - `generateVrfKeypairBootstrap.ts`
  - `deriveVrfKeypairFromPrf.ts`
  - `deriveVrfKeypairFromRawPrf.ts`
  - `shamir3Pass.ts` (for `shamir3PassDecryptVrfKeypair`, `shamir3PassEncryptCurrentVrfKeypair`)

Names can be adjusted during implementation, but the intent is:

- One handler file per high‑level VRF flow or cohesive group of flows.
- A barrel `handlers/index.ts` that re‑exports all handler functions for
  ergonomic imports from `VrfWorkerManager/index.ts`.

### 3.2 Handler Context Type

Introduce a handler context that extends the existing VRF context with the
worker plumbing needed by handlers:

- Add a new interface in `VrfWorkerManager/index.ts` (or a small sibling file):

```ts
export interface VrfWorkerHandlerContext extends VrfWorkerManagerContext {
  sendMessage: <T extends WasmVrfWorkerRequestType>(args: {
    message: VRFWorkerMessage<T>;
    timeoutMs?: number;
  }) => Promise<VRFWorkerResponse>;
  ensureWorkerReady: (requireHealthCheck?: boolean) => Promise<void>;
  setCurrentVrfAccountId: (nearAccountId: AccountId | null) => void;
}
```

Notes:
- `VrfWorkerHandlerContext` structurally **extends** `VrfWorkerManagerContext`,
  so existing `confirmTxFlow` code that only depends on the smaller context
  remains valid.
- `VrfWorkerManager` will construct a single `VrfWorkerHandlerContext` instance
  and use it for both `confirmTxFlow` and handlers.

### 3.3 `VrfWorkerManager` → handler delegation pattern

Each public flow method becomes a thin wrapper that calls the matching handler:

```ts
import {
  deriveWrapKeySeedAndSendToSigner as deriveWrapKeySeedAndSendToSignerHandler,
  // …other handlers
} from './handlers';

export class VrfWorkerManager {
  // …
  private context: VrfWorkerHandlerContext;

  constructor(config: VrfWorkerManagerConfig, context: VrfWorkerManagerContext) {
    // existing config merge logic…
    this.context = {
      ...context,
      vrfWorkerManager: this,
      sendMessage: <T extends WasmVrfWorkerRequestType>({ message, timeoutMs }: {
        message: VRFWorkerMessage<T>;
        timeoutMs?: number;
      }) => this.sendMessage(message, timeoutMs),
      ensureWorkerReady: (requireHealthCheck?: boolean) =>
        this.ensureWorkerReady(requireHealthCheck),
      setCurrentVrfAccountId: (nearAccountId: AccountId | null) => {
        this.currentVrfAccountId = nearAccountId ?? null;
      },
    };
  }

  getContext(): VrfWorkerHandlerContext {
    return this.context;
  }

  async deriveWrapKeySeedAndSendToSigner(args: {
    // existing params
  }): Promise<{ sessionId: string; wrapKeySalt: string }> {
    return deriveWrapKeySeedAndSendToSignerHandler({ ctx: this.getContext(), ...args });
  }

  // …same pattern for all other flow methods
}
```

Handlers remain completely stateless and do not touch `this`; they operate
entirely through the `ctx` argument.

---

## 4. Method → Handler Mapping

This section lists each flow‑level method in `VrfWorkerManager` and its
corresponding handler function and file.

### 4.1 Session / Channel

- `createSigningSessionChannel(sessionId: string): Promise<MessagePort>`
  - New handler: `createSigningSessionChannel({ ctx, sessionId })`
  - File: `handlers/createSigningSessionChannel.ts`
  - Notes:
    - Handler calls `ctx.ensureWorkerReady(true)` and uses a small helper
      exposed on `ctx` to send the `'ATTACH_WRAP_KEY_SEED_PORT'` message.
    - We can either:
      - Add `postMessage` / `attachWrapKeySeedPort` to `VrfWorkerHandlerContext`, or
      - Keep the `postMessage` part as a tiny private helper in `VrfWorkerManager`
        and let the handler focus on input validation and error formatting.
    - First pass: keep `createSigningSessionChannel` mostly as is, but wrap its
      body in the handler and call it from the method to keep logic centralized.

### 4.2 VRF‑driven signing & registration flows

- `deriveWrapKeySeedAndSendToSigner(args)`
  - New handler: `deriveWrapKeySeedAndSendToSigner({ ctx, ...args })`
  - File: `handlers/deriveWrapKeySeedAndSendToSigner.ts`
  - Uses: `ctx.ensureWorkerReady(true)`, `ctx.sendMessage`, validates
    `wrapKeySalt` in the response.

- `prepareDecryptSession(args)`
  - New handler: `prepareDecryptSession({ ctx, ...args })`
  - File: `handlers/prepareDecryptSession.ts`
  - Uses: `ctx.ensureWorkerReady(true)`, `ctx.sendMessage`, logs debug info,
    throws on worker failure.

- `confirmAndPrepareSigningSession(params)`
  - New handler: `confirmAndPrepareSigningSession({ ctx, ...params })`
  - File: `handlers/confirmAndPrepareSigningSession.ts`
  - Notes:
    - Pure main‑thread flow (no direct worker messaging).
    - Builds canonical intent digest, `TransactionSummary`, and invokes
      `runSecureConfirm(ctx, request)`.
    - Returns `{ sessionId, wrapKeySalt, vrfChallenge, transactionContext, intentDigest, credential }`.

- `requestRegistrationCredentialConfirmation(params)`
  - New handler: `requestRegistrationCredentialConfirmation({ ctx, ...params })`
  - File: `handlers/requestRegistrationCredentialConfirmation.ts`
  - Notes:
    - Thin wrapper calling `confirmTxFlow/flows/requestRegistrationCredentialConfirmation`.
    - Applies standard confirmation invariants (credential, vrfChallenge, transactionContext).

- `confirmAndDeriveDevice2RegistrationSession(params)`
  - New handler: `confirmAndDeriveDevice2RegistrationSession({ ctx, ...params })`
  - File: `handlers/confirmAndDeriveDevice2RegistrationSession.ts`
  - Uses: `ctx.ensureWorkerReady(true)`, `ctx.sendMessage`.
  - Validates:
    - `confirmed`
    - `credential`
    - `vrfChallenge`
    - `transactionContext`
    - `wrapKeySalt`
  - Returns the full registration bundle as today.

### 4.3 VRF keypair unlock / challenge / session

- `unlockVrfKeypair({ credential, nearAccountId, encryptedVrfKeypair, onEvent })`
  - New handler: `unlockVrfKeypair({ ctx, ...args })`
  - File: `handlers/unlockVrfKeypair.ts`
  - Responsibilities:
    - Extract PRF from credential via `extractPrfFromCredential`.
    - Emit progress via `onEvent`.
    - Call `ctx.ensureWorkerReady(true)` and `ctx.sendMessage` with
      `UNLOCK_VRF_KEYPAIR`.
    - On success, call `ctx.setCurrentVrfAccountId(nearAccountId)`.

- `generateVrfChallenge(inputData)`
  - New handler: `generateVrfChallenge({ ctx, inputData })`
  - File: `handlers/generateVrfChallenge.ts`
  - Uses: `ctx.ensureWorkerReady(true)`, `ctx.sendMessage` with
    `GENERATE_VRF_CHALLENGE`, returns validated `VRFChallenge`.

- `checkVrfStatus()`
  - New handler: `checkVrfStatus({ ctx })`
  - File: `handlers/session.ts`
  - Behavior:
    - Uses `ctx.ensureWorkerReady()` with error guard.
    - Calls `ctx.sendMessage` with `CHECK_VRF_STATUS`.
    - Returns `{ active, nearAccountId, sessionDuration }` as today, using
      `ctx.setCurrentVrfAccountId` only where needed.

- `clearVrfSession()`
  - New handler: `clearVrfSession({ ctx })`
  - File: `handlers/session.ts`
  - Behavior:
    - Calls `ctx.ensureWorkerReady()`.
    - Sends `LOGOUT` message.
    - On success, calls `ctx.setCurrentVrfAccountId(null)`.

- `setCurrentVrfAccountId(nearAccountId)`
  - Move implementation into the `VrfWorkerManager`‑internal setter used by
    `VrfWorkerHandlerContext.setCurrentVrfAccountId`.
  - The public `setCurrentVrfAccountId` method can remain as a thin wrapper
    around that setter to avoid API breakage.

### 4.4 VRF keypair bootstrap / deterministic derivation

- `generateVrfKeypairBootstrap({ vrfInputData, saveInMemory })`
  - New handler: `generateVrfKeypairBootstrap({ ctx, vrfInputData, saveInMemory })`
  - File: `handlers/generateVrfKeypairBootstrap.ts`
  - Responsibilities:
    - `ctx.ensureWorkerReady()`.
    - Send `GENERATE_VRF_KEYPAIR_BOOTSTRAP`.
    - Validate VRF challenge data, derive `vrfPublicKey`, and optionally call
      `ctx.setCurrentVrfAccountId` when `saveInMemory` is true.

- `deriveVrfKeypairFromPrf({ credential, nearAccountId, vrfInputData, saveInMemory })`
  - New handler: `deriveVrfKeypairFromPrf({ ctx, ...args })`
  - File: `handlers/deriveVrfKeypairFromPrf.ts`
  - Responsibilities:
    - Extract `chacha20PrfOutput` from credential.
    - `ctx.ensureWorkerReady()`.
    - Send `DERIVE_VRF_KEYPAIR_FROM_PRF`.
    - Validate VRF public key, encrypted keypair, optional VRF challenge.
    - Call `ctx.setCurrentVrfAccountId(nearAccountId)` when `saveInMemory`.

- `deriveVrfKeypairFromRawPrf({ prfOutput, nearAccountId, vrfInputData, saveInMemory })`
  - New handler: `deriveVrfKeypairFromRawPrf({ ctx, ...args })`
  - File: `handlers/deriveVrfKeypairFromRawPrf.ts`
  - Responsibilities:
    - `ctx.ensureWorkerReady()`.
    - Send `DERIVE_VRF_KEYPAIR_FROM_PRF` with raw `prfOutput`.
    - Validate and return `vrfPublicKey`, optional `vrfChallenge`,
      `encryptedVrfKeypair`, `serverEncryptedVrfKeypair`.
    - Call `ctx.setCurrentVrfAccountId(nearAccountId)` when `saveInMemory`.

### 4.5 Shamir 3‑pass helpers

- `shamir3PassDecryptVrfKeypair({ nearAccountId, kek_s_b64u, ciphertextVrfB64u, serverKeyId })`
  - New handler: `shamir3PassDecryptVrfKeypair({ ctx, ...args })`
  - File: `handlers/shamir3Pass.ts`
  - Responsibilities:
    - `ctx.ensureWorkerReady(true)`.
    - Send `SHAMIR3PASS_CLIENT_DECRYPT_VRF_KEYPAIR`.
    - On success, call `ctx.setCurrentVrfAccountId(nearAccountId)`.

- `shamir3PassEncryptCurrentVrfKeypair()`
  - New handler: `shamir3PassEncryptCurrentVrfKeypair({ ctx })`
  - File: `handlers/shamir3Pass.ts`
  - Responsibilities:
    - `ctx.ensureWorkerReady(true)`.
    - Send `SHAMIR3PASS_CLIENT_ENCRYPT_CURRENT_VRF_KEYPAIR`.
    - Validate ciphertext + salts + `serverKeyId`.

---

## 5. Refactor Phases

### Phase 0 — Scaffolding (no behavior change)

- [ ] Create `VrfWorkerHandlerContext` type.
- [ ] Update `VrfWorkerManager` constructor to build a `VrfWorkerHandlerContext`
      with bound `sendMessage`, `ensureWorkerReady`, and `setCurrentVrfAccountId`.
- [ ] Change `getContext()` to return `VrfWorkerHandlerContext`
      (still assignable to `VrfWorkerManagerContext` usages).
- [ ] Add empty handler files and `handlers/index.ts` that re‑exports them, to
      avoid circular import issues later.

### Phase 1 — Extract pure worker RPC flows

Focus on methods that are mostly `ensureWorkerReady + sendMessage`:

- [ ] Extract:
  - `deriveWrapKeySeedAndSendToSigner`
  - `prepareDecryptSession`
  - `unlockVrfKeypair`
  - `generateVrfChallenge`
  - `checkVrfStatus`
  - `clearVrfSession`
  - `generateVrfKeypairBootstrap`
  - `deriveVrfKeypairFromPrf`
  - `deriveVrfKeypairFromRawPrf`
  - `shamir3PassDecryptVrfKeypair`
  - `shamir3PassEncryptCurrentVrfKeypair`
- [ ] For each method:
  - Move logic into a handler function using `ctx`.
  - Leave a thin wrapper on `VrfWorkerManager` that calls the handler.
  - Keep log messages and error messages identical.

### Phase 2 — Extract confirmTxFlow‑driven flows

- [ ] Extract:
  - `confirmAndPrepareSigningSession`
  - `requestRegistrationCredentialConfirmation`
  - `confirmAndDeriveDevice2RegistrationSession`
  - `createSigningSessionChannel` (if we decide to fully handler‑ize it).
- [ ] Ensure handlers:
  - Take `ctx: VrfWorkerHandlerContext`.
  - Use only `ctx` + `runSecureConfirm` / confirmTxFlow helpers; no `this`.
  - Preserve existing error semantics.

### Phase 3 — Cleanup and validation

- [ ] Remove any now‑unused private helpers in `VrfWorkerManager`.
- [ ] Ensure `VrfWorkerManager` exports remain backward‑compatible.
- [ ] Run and fix tests:
  - `pnpm test -- vrfWorkerManager_dual_prf`
  - `pnpm test -- confirmTxFlow`
  - Any e2e suites that import `VrfWorkerManager` from the ESM bundle.
- [ ] Optionally:
  - Add small unit tests for handlers (pure functions with mocked `ctx`).
  - Document handler contracts in `handlers/index.ts` JSDoc.

---

## 6. Invariants to Preserve

- Public `VrfWorkerManager` API (methods and types) must not change.
- All secrets remain confined as today:
  - PRF outputs never leave workers except where already serialized for
    `secureConfirm` flows.
  - `WrapKeySeed` continues to travel only via the dedicated MessagePort
    between VRF and signer workers.
- `confirmTxFlow` semantics and error messages are unchanged.
- Existing logs (especially in error paths) remain intact to keep tests and
  debugging behavior stable.

Once these phases are complete, VRF3 worker changes on the Rust side can be
accommodated by updating only the handler implementations (and possibly the
handler context), while keeping `VrfWorkerManager`’s surface area stable for
callers.

