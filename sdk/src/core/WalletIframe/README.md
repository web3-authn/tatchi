# WalletIframe

## Overview

The WalletIframe isolates sensitive wallet operations (passkey authentication and transaction signing) in a separate iframe window. Key benefits:

- **Security**: Private keys and sensitive operations are isolated from the main application
- **WebAuthn Compatibility**: TouchID/FaceID authentication works properly in the iframe context
- **No Popups**: All operations happen within the same window using an invisible overlay
- **Isolation**: Even if the main app is compromised, the wallet remains secure

## How It Works

The system consists of three layers:

1. **TatchiPasskeyIframe** - A proxy that provides the same API as the regular TatchiPasskey but routes calls to the iframe
2. **WalletIframeRouter** - Handles communication between the main app and the iframe using MessagePort
3. **Wallet Host** - The actual TatchiPasskey running inside the iframe, executing the real operations

When you call methods like `registerPasskey()` or `signTransaction()`, the request flows through these layers. The iframe temporarily expands to capture user activation (TouchID) when needed, then shrinks back to invisible once authentication is complete: it is triggered by progress events emitted from TatchiPasskey calls.

## Architecture Overview

### Core Components

#### 1. **Entry Point Layer**
- **`TatchiPasskeyIframe.ts`** - The main API that developers interact with. It provides the same interface as the regular TatchiPasskey but routes all calls to the iframe.
- **`index.ts`** - Exports all public APIs and types for the WalletIframe system.

#### 2. **Client-Side Communication Layer** (Runs in Parent App)
- **`client/router.ts`** - The `WalletIframeRouter` class that manages all communication with the iframe. It handles:
  - Request/response correlation using unique request IDs
  - Progress event bridging from iframe back to parent callbacks
  - Overlay show/hide logic for user activation
  - Timeout and error handling
- **`client/IframeTransport.ts`** - Low-level iframe management:
  - Creates and mounts the iframe element
  - Handles the CONNECT → READY handshake using MessageChannel
  - Manages iframe permissions and security attributes
  - Waits for iframe load events to avoid race conditions
- **`client/on-events-progress-bus.ts`** - Manages the overlay visibility based on operation phases:
  - Shows overlay during WebAuthn authentication phases
  - Hides overlay during non-interactive phases (signing, broadcasting)
  - Uses heuristics to minimize blocking time

#### 3. **Host-Side Execution Layer** (Runs in Iframe)
- **`host/wallet-iframe-host.ts`** - The main service host that:
  - Receives messages from the parent via MessagePort
  - Creates and manages the actual TatchiPasskey instance
  - Executes wallet operations (register, login, sign, etc.)
  - Sends progress events back to the parent
  - Handles UI component mounting requests
- **`host/iframe-lit-elem-mounter.ts`** - Manages Lit-based UI components inside the iframe:
  - Mounts transaction buttons and other UI elements
  - Wires UI interactions to TatchiPasskey methods
  - Handles component lifecycle (mount/unmount/update)
- **`host/iframe-lit-element-registry.ts`** - Declarative registry of available UI components:
  - Defines which Lit components can be mounted
  - Maps UI events to TatchiPasskey actions
  - Provides type-safe component definitions

#### 4. **Shared Communication Protocol**
- **`shared/messages.ts`** - Defines the typed message protocol:
  - Parent-to-child message types (PM_REGISTER, PM_LOGIN, etc.)
  - Child-to-parent response types (PROGRESS, PM_RESULT, ERROR)
  - Payload interfaces for all message types
  - Progress event structure for real-time updates

#### 5. **Supporting Infrastructure**
- **`validation.ts`** - Type guards and validation utilities for message payloads
- **`sanitization.ts`** - Security utilities for HTML and URL sanitization
- **`env.ts`** - Environment variable reading for wallet configuration
- **`html.ts`** - Generates minimal HTML for the wallet service page

### Data Flow Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Your App      │    │  WalletIframe    │    │  Wallet Host    │
│                 │    │                  │    │                 │
│ TatchiPasskey   │───▶│ TatchiPasskey    │───▶│ TatchiPasskey   │
│ Iframe          │    │ Router           │    │ (real instance) │
│                 │    │                  │    │                 │
│                 │    │ IframeTransport  │    │                 │
│                 │    │ ProgressBus      │    │ LitElemMounter  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Hook Calls    │    │  MessagePort     │    │  WebAuthn UI    │
│ (onEvent, etc.) │    │  Communication   │    │  Components     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Key Design Patterns

1. **Proxy Pattern**: `TatchiPasskeyIframe` acts as a transparent proxy to the real TatchiPasskey
2. **Message Passing**: All communication uses typed messages over MessagePort
3. **Event Bridging**: Progress events flow from iframe back to parent callbacks
4. **Overlay Management**: Smart show/hide logic based on operation phases
5. **Component Registry**: Declarative UI component definitions with automatic wiring

### Security Model

- **Origin Isolation**: Wallet operations run in a separate origin/domain
- **Permission Delegation**: WebAuthn permissions are delegated to the iframe
- **Message Validation**: All messages are validated using type guards
- **Capability Delegation**: The iframe grants WebAuthn and clipboard access via explicit `allow` attributes. Sandboxing is intentionally omitted for cross-origin deployments because Chromium drops transferred `MessagePort`s from sandboxed iframes, which would break the CONNECT → READY handshake.
- **No Function Transfer**: Functions never cross the iframe boundary

## Callback Chain for TatchiPasskeyIframe Calls

The callback chain follows this flow:

### 1. **TatchiPasskeyIframe** (Entry Point)
- Acts as a proxy/wrapper around the WalletIframeRouter
- Handles hook callbacks (`afterCall`, `onError`, `onEvent`)
- For example, in `registerPasskey()`:
  ```typescript
  const res = await this.client.registerPasskey({
    nearAccountId,
    options: { onEvent: options?.onEvent }
  });
  ```

### 2. **WalletIframeRouter** (Communication Layer)
- Manages the iframe and MessagePort communication
- Posts messages to the iframe host via `this.post()` method
- Handles progress events by bridging them back to the caller's `onEvent` callback
- For example, in `registerPasskey()`:
  ```typescript
  const res = await this.post<any>(
    { type: 'PM_REGISTER', payload: { nearAccountId: payload.nearAccountId, options: safeOptions } },
    { onProgress: payload.options?.onEvent }
  );
  ```

### 3. **wallet-iframe-host.ts** (Service Host)
- Receives messages via MessagePort in `onPortMessage()`
- Creates and manages the actual TatchiPasskey instance
- Executes the requested operations (like `tatchi!.registerPasskey()`)
- Sends progress events back via `post({ type: 'PROGRESS', requestId, payload: ev })`
- Returns results via `post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } })`

## Key Communication Flow:

1. **TatchiPasskeyIframe** → calls **WalletIframeRouter** method
2. **WalletIframeRouter** → posts message to iframe via MessagePort
3. **wallet-iframe-host.ts** → receives message, executes TatchiPasskey operation
4. **wallet-iframe-host.ts** → sends PROGRESS events during operation
5. **WalletIframeRouter** → bridges PROGRESS events to caller's `onEvent` callback
6. **wallet-iframe-host.ts** → sends final result
7. **WalletIframeRouter** → resolves promise with result
8. **TatchiPasskeyIframe** → calls `afterCall` hook and returns result

## Progress Event Bridging:

The key insight is that progress events are bridged through the MessagePort:
- Host sends: `{ type: 'PROGRESS', requestId, payload: ev }`
- Client receives and calls: `pend?.onProgress?.(msg.payload)`
- This allows the original `onEvent` callback to receive real-time progress updates

So yes, your understanding is correct: **TatchiPasskeyIframe → WalletIframeRouter → posts to wallet-iframe-host.ts**, with the additional detail that progress events flow back through the same channel to provide real-time updates to the caller.

## Activation Overlay (iframe sizing behavior)

The wallet iframe mounts as an invisible 0×0 element and temporarily expands to a full‑screen overlay when user activation (e.g., TouchID/WebAuthn) is needed. This lets the wallet host collect credentials in the same browsing context while satisfying WebAuthn requirements.

### OverlayController (state owner)

The OverlayController is the single owner of wallet iframe overlay state. It manages
visibility, positioning, and sticky behavior without scattering style writes across
router code. Styling is CSP-safe and applied via CSS classes and a shared stylesheet.

#### Modes

- `hidden`: no footprint, pointer-events disabled
- `fullscreen`: fixed inset, fills viewport for WebAuthn activation
- `anchored`: fixed rect at specific viewport coordinates

#### API (current)

```ts
type DOMRectLike = { top: number; left: number; width: number; height: number };

class OverlayController {
  constructor(opts: { ensureIframe: () => HTMLIFrameElement });
  showFullscreen(): void;
  showAnchored(rect: DOMRectLike): void;
  showPreferAnchored(): void;     // anchored if rect set, else fullscreen
  setAnchoredRect(rect: DOMRectLike): void;
  clearAnchoredRect(): void;
  setSticky(v: boolean): void;    // hide() is ignored when sticky
  hide(): void;
  getState(): { visible: boolean; mode: 'hidden' | 'fullscreen' | 'anchored'; sticky: boolean; rect?: DOMRectLike };
}
```

#### Router integration

- Router owns the controller instance and is the only caller.
- `computeOverlayIntent()` decides whether to show fullscreen before posting a request.
- `OnEventsProgressBus` decides when to hide after completion; the controller just executes.
- `setOverlayBounds()` anchors the iframe for inline UI overlays.

#### Styling notes

- Uses class-based styling from `passkey-sdk/src/core/WalletIframe/client/overlay-styles.ts` (no inline styles).
- Anchored rects are clamped to non-negative coordinates with minimum size.
- Default z-index is `2147483646` via `--w3a-wallet-overlay-z`.

### Overlay lifecycle

- Initial mount (hidden):
  - `passkey-sdk/src/core/WalletIframe/client/IframeTransport.ts` mounts the iframe with `w3a-wallet-overlay is-hidden`, `width/height: 0`, `aria-hidden`, and `tabindex=-1` so it is invisible yet present in the DOM. Base styles come from `passkey-sdk/src/core/WalletIframe/client/overlay-styles.ts`.

- Expand to full‑screen during activation:
  - `showFrameForActivation()` in `passkey-sdk/src/core/WalletIframe/client/router.ts` ensures the iframe exists and delegates to `OverlayController.showFullscreen()`, which applies the fullscreen class (fixed inset, pointer-events enabled, z-index 2147483646).
  - This is invoked explicitly for sensitive flows (e.g., `registerPasskey()`, `loginAndCreateSession()`, device linking) and implicitly by the progress-heuristic layer described below.

- Collapse back to 0×0:
  - `hideFrameForActivation()` in the same router delegates to `OverlayController.hide()` to restore the hidden state and make it non-interactive.
  - The router calls `hideFrameForActivation()` when a request finishes (success or error) unless the flow is marked sticky (UI-managed lifecycle).

- Anchored overlays for inline UI:
  - `setOverlayBounds()` anchors the iframe to a DOMRect via `OverlayController.showAnchored()` for UI components that must appear at a specific viewport location.

- When the overlay shows/hides automatically (heuristics):
  - `passkey-sdk/src/core/WalletIframe/client/on-events-progress-bus.ts` implements `defaultPhaseHeuristics`, which inspects `payload.phase` values emitted by the host.
  - Behavior (tuned to minimize blocking time):
    - Show for phases that require immediate user activation: `user-confirmation`, `webauthn-authentication`, registration `webauthn-verification`, device-linking `authorization`, device-linking `registration`, account sync `webauthn-authentication`, and login `webauthn-assertion`.
      - Important: `user-confirmation` must remain in the show list so the modal rendered inside the wallet iframe is visible and can capture a click when `behavior: 'requireClick'`.
    - Hide for post-activation phases such as `authentication-complete`, `transaction-signing-progress`, `transaction-signing-complete`, `broadcasting`, `action-complete`, plus the completion/error phases for registration, login, device linking, and account sync.

### Why the overlay may block clicks after sending

With the tuned heuristics, the overlay contracts immediately after TouchID completes (`authentication-complete`), even if subsequent phases (signing, broadcasting, waiting) continue. This minimizes the time the overlay blocks clicks.

### Options to adjust behavior

- Tweak heuristics to hide sooner:
- The repo now hides on phases that indicate TouchID is done (e.g., `authentication-complete`) and when moving to non-interactive phases. Adjust further in `passkey-sdk/src/core/WalletIframe/on-events-progress-bus.ts:101` if needed.

- Emit a “completion” phase from the host:
  - Update host flows to post a PROGRESS with `phase: 'user-confirmation-complete'` as soon as WebAuthn finishes. The existing heuristic will then hide without further code changes.

- Last‑resort local control:
  - If needed for a specific integration, you can wrap calls with your own timing to ensure the overlay hides immediately after activation by invoking flows that don’t rely on the heuristic (e.g., those already calling `showFrameForActivation()` explicitly) and ensuring the host emits the completion phase promptly.

### Notes

- Layering: the iframe overlay uses `z-index: 2147483646`, kept one below the inner modal card (2147483647) to ensure the UI remains clickable when visible.
- Debugging: set `window.__W3A_DEBUG__ = true` (or pass `debug: true` to the client) to log overlay/phase routing decisions from the progress bus.
