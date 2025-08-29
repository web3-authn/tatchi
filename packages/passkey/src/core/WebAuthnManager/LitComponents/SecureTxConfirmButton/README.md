# SecureTxConfirmButton Components Summary

The SecureTxConfirmButton is a Lit-based web component for secure transaction confirmation. It uses shadow DOM to encapsulate sub-components, ensuring isolation and security.

## Components Overview

- **EmbeddedTxButton.ts**: Handles direct DOM-embedded confirmations.
- **IframeButtonHost.ts**: Manages iframe-based confirmations with styling via IframeClipPathGenerator.
- **IframeClipPathGenerator.ts**: Generates CSS clip-paths for iframe visual integration.
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
| IframeButton.ts             |
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
1. IframeButtonHost → iframeBootstrap: SET_INIT
   ├── Contains buttonPosition, tooltip config, and styling data
   └── Triggers button container positioning

2. iframeBootstrap → IframeButtonHost: POSITIONING_APPLIED
   ├── Confirms button positioning is complete
   └── Includes final button position coordinates

3. IframeButtonHost → iframeBootstrap: REQUEST_GEOMETRY
   ├── Requests geometry measurement now that positioning is applied
   └── Ensures measurements use final positioned coordinates

4. iframeBootstrap → EmbeddedTxButton: REQUEST_GEOMETRY
   ├── Forwards request to embedded button component
   └── Triggers sendInitialGeometry() method

5. EmbeddedTxButton → IframeButtonHost: INIT_GEOMETRY
   ├── Measures button and tooltip element positions
   ├── Sends geometry data for clip-path calculations
   └── Includes coordinates relative to iframe viewport
```

### Key Components

#### IframeButtonHost (`IframeButtonHost.ts`)
- **Initiates**: Sends `SET_INIT` with positioning data
- **Coordinates**: Handles `POSITIONING_APPLIED` and sends `REQUEST_GEOMETRY`
- **Receives**: `INIT_GEOMETRY` for clip-path setup
- **Applies**: Button-only clip-path initially, expands on hover

#### Iframe Bootstrap (`iframeBootstrap.ts`)
- **Receives**: `SET_INIT` and applies button positioning
- **Confirms**: Sends `POSITIONING_APPLIED` after positioning
- **Forwards**: `REQUEST_GEOMETRY` to embedded button
- **Ensures**: DOM is fully updated before measurements

#### EmbeddedTxButton (`EmbeddedTxButton.ts`)
- **Receives**: `REQUEST_GEOMETRY` trigger
- **Measures**: Button and tooltip positions using `getBoundingClientRect()`
- **Sends**: `INIT_GEOMETRY` with precise coordinates
- **Handles**: Subsequent tooltip state changes and measurements

### Critical Timing Aspects

1. **Positioning First**: Button must be positioned before measuring geometry
2. **DOM Updates**: `offsetHeight` forces reflow to ensure positioning is applied
3. **Coordinate System**: Measurements use iframe-relative coordinates (0,0 = iframe top-left)
4. **Precision**: Coordinates are rounded to prevent sub-pixel rendering issues

### Error Prevention

- **Retry Logic**: Handles cases where elements aren't ready initially
- **Validation**: Checks for element existence before measurements
- **Fallbacks**: Graceful degradation if positioning fails
- **Logging**: Comprehensive logging for debugging geometry issues

This handshake ensures the clip-path accurately restricts interaction to the button area initially, then expands to include the tooltip area during hover, providing seamless user interaction within the iframe context.

## txSigningRequests → TreeNode mapping (TooltipTxTree)

TooltipTxTree renders a light-weight tree UI from a normalized data shape (`TreeNode`). The data is produced from `txSigningRequests` (TransactionInput[]) by `EmbeddedTxButton`.

- Root folder: wraps all transactions
  - `id: 'txs-root'`
  - `label: 'Transaction' | 'Transactions'`
  - `type: 'folder'`
  - `open: true`
  - `children: [tx-0, tx-1, ...]`

- Transaction folder (per TransactionInput)
  - `id: 'tx-${index}'`
  - `label: 'Transaction ${index+1} to ${receiverId}'`
  - `type: 'folder'`
  - `open: index === 0`
  - `children: [action-0, action-1, ...]`

- Action folder (per action)
  - `id: 'action-${actionIndex}'`
  - `label: 'Action ${actionIndex+1}: ${type}'`
  - `type: 'folder'`
  - `open: false`
  - `children: [field file nodes]`

- Field file nodes
  - One file per relevant field; e.g., for FunctionCall: `method`, `gas`, `deposit`, `args`
  - `args` file may include `content` with pretty JSON

Example (single FunctionCall):

```
{
  id: 'txs-root', label: 'Transaction', type: 'folder', open: true,
  children: [
    {
      id: 'tx-0', label: 'Transaction 1 to web3-authn-v5.testnet', type: 'folder', open: true,
      children: [
        {
          id: 'action-0', label: 'Action 1: FunctionCall', type: 'folder', open: false,
          children: [
            { id: 'a0-method',  label: 'method: set_greeting',        type: 'file' },
            { id: 'a0-gas',     label: 'gas: 30000000000000',         type: 'file' },
            { id: 'a0-deposit', label: 'deposit: 0',                  type: 'file' },
            { id: 'a0-args',    label: 'args', type: 'file', content: '{\n  "greeting": "Hello from Embedded Component! [...]"\n}' }
          ]
        }
      ]
    }
  ]
}
```