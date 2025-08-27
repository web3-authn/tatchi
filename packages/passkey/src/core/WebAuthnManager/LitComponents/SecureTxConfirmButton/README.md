# SecureTxConfirmButton Components Summary

The SecureTxConfirmButton is a Lit-based web component for secure transaction confirmation. It uses shadow DOM to encapsulate sub-components, ensuring isolation and security.

## Components Overview

- **EmbeddedTxButton.ts**: Handles direct DOM-embedded confirmations.
- **IframeButton.ts**: Manages iframe-based confirmations with styling via IframeClipPathGenerator.
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
- **Layering**: IframeButton renders as a direct DOM element under the root. Inside its div, an iframe contains EmbeddedTxButton for confirmations and TooltipTxTree for transaction details.
- **Clipping**: IframeClipPathGenerator clips a path in the iframe for handling pointer events for showing the tooltip
- **Interactions**: The iframe isolates content; tooltips and buttons interact within this secure container, with clip-paths applied for styling via IframeClipPathGenerator.