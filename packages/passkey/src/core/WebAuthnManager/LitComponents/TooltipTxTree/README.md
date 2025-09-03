# TooltipTxTree (Lit)

Pure presentational tree used inside the embedded tooltip. No internal state; renders from inputs.

## Inputs
- node: Root `TreeNode` (folder or file) to render. Use `open: true` to expand nodes by default.
- depth: Number (0 for top-level rendering inside tooltip).
- tooltipTreeStyles: `TooltipTreeStyles` object with per-section CSS overrides.

## CSS Variable Mapping
- TooltipTxTree maps `tooltipTreeStyles` onto CSS custom properties on the host.
- Variable naming: `--w3a-tree__<section>__<property>` (both section and property are kebab-cased).

Examples
- `{ fileContent: { background: '#f8fafc' } }` → sets `--w3a-tree__file-content__background`.
- `{ label: { color: 'oklch(0.53 0.02 240)' } }` → sets `--w3a-tree__label__color`.

Notes
- All sections and properties are converted to kebab-case before being applied.
- These CSS variables are consumed inside the component stylesheet to style rows, labels, highlights, etc.

## Styling (CSS variables)
- TooltipTxTree maps `tooltipTreeStyles` onto CSS custom properties on the host.
- Variable naming: `--w3a-tree__<section>__<property>` (both section and property are kebab-cased).
- Example mapping: `{ fileContent: { background: '#f8fafc' } }` → `--w3a-tree__file-content__background`.
- Common sections: `root`, `details`, `summary`, `summaryRow`, `row`, `indent`, `label`, `chevron`, `fileContent`, `folderChildren`, `highlightReceiverId`, `highlightMethodName`.
- Highlight classes applied to labels: `highlight-receiverId`, `highlight-methodName`; controlled by vars like `--w3a-tree__highlight-receiver-id__color`.

## Transaction data → Tree mapping
- TooltipTxTree expects a `TreeNode` model; it doesn’t parse transactions itself.
- Build the model via helper `buildActionTree(tx)` or your own mapping, then assemble a root folder with children.
- Typical shape: Root folder → per-transaction folders → per-action folders → file rows (e.g., `method`, `gas`, `deposit`, `args` with collapsible content).

## Events
- Emits `tree-toggled` on `details` open/close so parents can re-measure and update layout.

## Minimal usage
```html
<tooltip-tx-tree
  .node=${treeRoot}
  .depth=${0}
  .tooltipTreeStyles=${themeStyles}
></tooltip-tx-tree>
```
