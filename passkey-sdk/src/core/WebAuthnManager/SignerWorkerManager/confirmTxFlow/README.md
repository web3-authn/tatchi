# Transaction Confirmation Flow

## Overview

This module handles the secure transaction confirmation flow between WASM workers and the main thread.

## Flow Diagram

```
┌─────────────┐    Request      ┌─────────────┐     Response    ┌─────────────┐
│   WASM      │ ──────────────▶ │   Worker    │ ──────────────▶ │ Main Thread │
│  Worker     │                 │             │                 │             │
└─────────────┘                 └─────────────┘                 └─────────────┘
       │                               │                               │
       │                               │                               │
       ▼                               ▼                               ▼
┌─────────────┐                 ┌─────────────┐                 ┌──────────────┐
│ awaitSecure │                 │ awaitSecure │                 │ handleSecure │
│Confirmation │                 │Confirmation │                 │ConfirmRequest│
│   (Rust)    │                 │  (Worker)   │                 │ (Main Thread)│
└─────────────┘                 └─────────────┘                 └──────────────┘
       │                               │                               │
       │                               │                               │
       ▼                               ▼                               ▼
┌─────────────┐                 ┌─────────────┐                 ┌─────────────┐
│   Promise   │                 │ postMessage │                 │ Show UI &   │
│   Resolves  │                 │   Request   │                 │ Collect     │
│             │                 │             │                 │ Credentials │
└─────────────┘                 └─────────────┘                 └─────────────┘
```

## File Structure

- **`awaitSecureConfirmation.ts`**: Worker-side confirmation request
- **`handleSecureConfirmRequest.ts`**: Main thread confirmation handler
- **`userSettings.ts`**: User preferences management
- **`types.ts`**: Shared confirmation types

## Sequence

1. **WASM** calls `awaitSecureConfirmation()` when user confirmation needed
2. **Worker** sends `PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD` to main thread via `postMessage()`
3. **Main Thread** shows UI (modal/embedded) and collects TouchID credentials
4. **Main Thread** sends `USER_PASSKEY_CONFIRM_RESPONSE` back to worker via `postMessage()`
5. **Worker** resolves promise and returns result to WASM

## Overlay dependency note (wallet iframe)

The visible confirmation modal is rendered inside the wallet iframe (or a nested iframe in that origin). For `behavior: 'requireClick'` to work, the wallet iframe overlay must expand before the modal mounts so the user can see and click it.

Rule of thumb for `ProgressBus` heuristics:

- Show on: `ActionPhase.STEP_2_USER_CONFIRMATION` and `ActionPhase.STEP_4_WEBAUTHN_AUTHENTICATION`.
- Hide after: `ActionPhase.STEP_5_AUTHENTICATION_COMPLETE` and during non‑interactive phases (e.g., `transaction-signing-progress`, `contract-verification`, `broadcasting`, completion/error phases for other flows).

Removing `STEP_2_USER_CONFIRMATION` from the show list will break `requireClick` flows: the modal mounts out of view and cannot receive the click.
