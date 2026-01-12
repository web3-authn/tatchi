# MPC Signing Refactor Review

## Overview

I have reviewed the `docs/mpc-signing-refactor.md` architecture plan and the corresponding implementation in `sdk/src/server`.

**Status**: The implementation correctly reflects the "Option B" (Aggregator/Coordinator) architecture described in the specificiation. The codebase has been successfully refactored to support generic N-party signing while maintaining the 2-party external interface.

## Architecture Critique

**Strengths:**
1.  **Clear Separation of Roles**: The split between `ThresholdSigningService` (Controller/Orchestration) and `ThresholdEd25519SigningHandlers` (Protocol Logic) is effective. It keeps the HTTP layer concerns separate from the intricate aggregation logic.
2.  **Stateless Design**: The "stateless relayer" mode using derived shares is well-implemented and integrated deeply into the keygen strategies. This significantly reduces operational complexity for the fleet.
3.  **Forward Compatibility**: The data models (`participants[]`, `commitmentsById`) are correctly designed to support future `t-of-n` scenarios without breaking changes.
4.  **Cosigner Logic**: The dealer-split logic in `cosigners.ts` is mathematically sound and uses appropriate big-integer arithmetic for the Ed25519 scalar field.

**Weaknesses:**
1.  **Complexity in Handlers**: `signingHandlers.ts` carries a heavy load. It manages both local signing and the complex coordinator fanout logic (including retries, timeouts, and state management). This makes the file large and potentially hard to test/maintain as the logic grows.
2.  **Validation Verbosity**: The current validation strategy involves many manual `parse*` functions that manually check fields and types. This adds significant noise to the codebase (~30-40% of lines in some files) and is prone to drift.

## Code Critique

-   **Type Safety**: Excellent. The code uses TypeScript features well to ensure strict typing of participants and cryptographic material.
-   **Security**:
    -   Secrets are handled carefully (e.g., `coordinatorSharedSecretBytes` is parsed once and passed down).
    -   Authorization scopes (`relayerKeyId`, `nearAccountId`) are checked consistently.
    -   The `cosignerGrant` mechanism (HMAC-based) provides a good internal security layer for the fleet.
-   **Performance**:
    -   The fanout logic in `signingHandlers.ts` uses `Promise.all` for parallel requests, which is good.
    -   Scalar math is done in JS (BigInt). While slower than WASM, it should be sufficient for the aggregation layer given the low `N` (e.g. 3-5 relayers).
-   **Maintainability**:
    -   `ThresholdSigningService.ts` and `signingHandlers.ts` are both exceeding 1000 lines. A significant portion of this is boilerplate validation code.

## High Impact Improvements

### 1. Adopt a Schema Validation Library (e.g., Zod)
**Impact**: High (Maintainability & Safety)
**Effort**: Medium

Replace the manual `parse*` functions in `ThresholdSigningService.ts`, `signingHandlers.ts`, and `validation.ts` with a schema validation library like **Zod** or **Valibot**. This will:
-   Reduce code size by ~30%.
-   Provide runtime type safety equivalent to the current manual checks but with less code.
-   Standardize error messages automatically.

**Example Refactor:**
```typescript
import { z } from 'zod';

const KeygenRequestSchema = z.object({
  nearAccountId: z.string().min(1),
  clientVerifyingShareB64u: z.string().min(1),
  // ...
});
// usage: const parsed = KeygenRequestSchema.parse(request);
```

### 2. Refactor `signingHandlers.ts` into Strategies
**Impact**: Medium (Maintainability)
**Effort**: Medium

Split `ThresholdEd25519SigningHandlers` into distinct "Signing Strategies":
-   `LocalSigningStrategy`: For the single-relayer case.
-   `CoordinatorFanoutStrategy`: For the aggregator case.

This would separate the complex fanout/retry logic from the simple local signing logic, making both easier to test and reason about.

### 3. Improve Observability / Tracing
**Impact**: Medium (Operational)
**Effort**: Low

The current logging is decent, but for a distributed system (Coordinator -> Cosigners), simple logs might be insufficient to debug latency or partial failures.
-   Add **OpenTelemetry** traces or correlation IDs that propagate from the Coordinator to the Cosigners.
-   Log the specific cosigners that failed or timed out in a structured array, not just a textual warning.

### 4. Standardize Internal RPC Client
**Impact**: Low (Code Cleanliness)
**Effort**: Low

The fanout logic currently uses `this.postJsonWithTimeout` (assumed helper). Extracting a strongly-typed `CosignerClient` class would encapsulate the HTTP calls, timeouts, and error handling for talking to cosigners, removing that noise from the business logic.
