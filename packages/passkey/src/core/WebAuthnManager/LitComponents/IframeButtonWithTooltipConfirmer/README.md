# SecureTxConfirmButton Components Summary

The SecureTxConfirmButton is a Lit-based web component for secure transaction confirmation. It uses shadow DOM to encapsulate sub-components, ensuring isolation and security.

## Components Overview

- **EmbeddedTxButton.ts**: Handles direct DOM-embedded confirmations.
- **IframeButtonHost.ts**: Manages iframe-based confirmations with styling via IframeClipPathGenerator.
- **Iframe clip-path (in `iframe-geometry.ts`)**: `IframeClipPathGenerator` generates CSS clip-paths for iframe visual integration.
- **TooltipTxTree.ts**: Displays transaction tree tooltips on interaction.

## DOM Structure Visualization

Below is an ASCII art depiction of how the components are layered within the SecureTxConfirmButton's shadow DOM. Components are shown stacked hierarchically, with overlays for tooltips.

```
+-----------------------------+
| SecureTxConfirmButton       |
| (React Wrapper)             |
| (Shadow DOM Host)           |
+-----------------------------+
          |
          |
+-----------------------------+
| IframeButtonHost.ts         |
| (Direct DOM Element)        |
+-----------------------------+
          |
          |
+-----------------------------+
| <div class="iframe-button"> |
|   <iframe>                  |
|   +-----------------------+ |
|   | EmbeddedTxButton.ts   | |
|   +-----------------------+ |
|   +-----------------------+ |
|   | TooltipTxTree.ts      | |
|   | (tx tree data)        | |
|   +-----------------------+ |
|   </iframe>                 |
| </div>                      |
+-----------------------------+

```

### Key Notes:
- **Layering**: IframeButtonHost renders as a direct DOM element under the root. Inside its div, an iframe contains EmbeddedTxButton for confirmations and TooltipTxTree for transaction details.
- **Clipping**: IframeClipPathGenerator clips a path in the iframe for handling pointer events for showing the tooltip
- **Interactions**: The iframe isolates content; tooltips and buttons interact within this secure container, with clip-paths applied for styling via IframeClipPathGenerator.

## Initial Geometry Handshake Process

The Initial Geometry Handshake ensures accurate clip-path calculations for iframe-based transaction confirmations. This process coordinates timing between the iframe host and embedded button to prevent measurement of unpositioned elements.

### Process Flow

```
1. IframeButtonHost → iframe bootstrap script: HS1_INIT
   ├── Contains buttonPosition, tooltip config, and styling data
   └── Triggers button container positioning

2. iframe bootstrap script → IframeButtonHost: HS2_POSITIONED
   ├── Confirms button positioning is complete
   └── Includes final button position coordinates

3. IframeButtonHost → iframe bootstrap script: HS3_GEOMETRY_REQUEST
   ├── Requests geometry measurement now that positioning is applied
   └── Ensures measurements use final positioned coordinates

4. iframe bootstrap script → EmbeddedTxButton: HS3_GEOMETRY_REQUEST
   ├── Forwards request to embedded button component
   └── Triggers sendInitialGeometry() method

5. EmbeddedTxButton → IframeButtonHost: HS5_GEOMETRY_RESULT
   ├── Measures button and tooltip element positions
   ├── Sends geometry data for clip-path calculations
   └── Includes coordinates relative to iframe viewport
```

### Handshake Notes

- ETX_DEFINED: The iframe posts this once the embedded custom element is fully upgraded (customElements.whenDefined has resolved). The host waits for ETX_DEFINED before pushing state like SET_TX_DATA/SET_STYLE/SET_LOADING to avoid upgrade races after HS1_INIT.
- Skipping HS4: Step 4 is an internal call (bootstrap invokes `sendInitialGeometry()` on the embedded element). Since it doesn’t cross the window boundary via postMessage, it isn’t labeled as a handshake message. Only cross-window messages are numbered HSx.

### Key Components

#### IframeButtonHost (`IframeButtonHost.ts`)
- **Initiates**: Sends `HS1_INIT` with positioning data
- **Coordinates**: Handles `HS2_POSITIONED` and sends `HS3_GEOMETRY_REQUEST`
- **Receives**: `HS5_GEOMETRY_RESULT` for clip-path setup
- **Applies**: Button-only clip-path initially, expands on hover

#### Iframe Bootstrap (`iframe-bootstrap-script.ts`)
- **Receives**: `HS1_INIT` and applies button positioning
- **Confirms**: Sends `HS2_POSITIONED` after positioning
- **Forwards**: `HS3_GEOMETRY_REQUEST` to embedded button
- **Ensures**: DOM is fully updated before measurements

#### EmbeddedTxButton (`EmbeddedTxButton.ts`)
- **Receives**: `HS3_GEOMETRY_REQUEST` trigger
- **Measures**: Button and tooltip positions using `getBoundingClientRect()`
- **Sends**: `HS5_GEOMETRY_RESULT` with precise coordinates
- **Handles**: Subsequent tooltip state changes and measurements

### Critical Timing Aspects

1. **Positioning First**: Button must be positioned before measuring geometry
2. **DOM Updates**: `offsetHeight` forces reflow to ensure positioning is applied
3. **Coordinate System**: Measurements use iframe-relative coordinates (0,0 = iframe top-left)


## UI Digest Integrity Checks

To ensure “what the user sees is what gets signed”, the embedded flow performs digest checks over the transaction set at confirm time. All digests use the same procedure:

- Serialize the same payload shape via `JSON.stringify` (preserving array order and property insertion order)
- Compute SHA‑256 over the UTF‑8 bytes
- Encode the digest as base64url

### Payload Shape Used For Digests

An array of objects with the following shape, matching the worker’s `tx_signing_requests` and what the UI renders after mapping:

```
[
  {
    receiverId: string,
    actions: ActionArgsWasm[] // snake_case fields (e.g., method_name, deposit, gas, args as JSON string), same order
  },
  ...
]
```

The UI maps its `TransactionInput[]` (camelCase actions) to `ActionArgsWasm[]` (snake_case) using the same conversion the worker uses. FunctionCall.args are stringified JSON.

### Where Each Digest Is Calculated

- UI Digest (`uiDigest`):
  - Where: Inside the iframe, from `EmbeddedTxButton.txSigningRequests`
  - When: Just‑in‑time on confirm, requested by host via `REQUEST_UI_DIGEST`
  - How: UI maps `TransactionInput[]` → `ActionArgsWasm[]` and hashes via SHA‑256 → base64url

- Worker Intent Digest (`intentDigest`):
  - Where: Rust wasm worker (confirm_tx_details.rs)
  - From: The same logical transaction set (receiver + parsed actions) that is passed to the main thread
  - How: serde_json::to_string → SHA‑256 → base64url

### Matching Rules And Integrity

At confirm time, the main thread compares `uiDigest` with wasm-worker's `intentDigest`. When all match, the user has viewed exactly the actions that the worker signs. If they differ, confirmation is aborted with a `ui_digest_mismatch` error.
