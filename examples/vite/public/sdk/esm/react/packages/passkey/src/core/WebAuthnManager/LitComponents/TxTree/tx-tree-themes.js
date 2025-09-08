import { DARK_THEME, LIGHT_THEME } from "../base-styles.js";

//#region src/core/WebAuthnManager/LitComponents/TxTree/tx-tree-themes.ts
const TX_TREE_THEMES = {
	dark: {
		...DARK_THEME,
		host: {
			fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif",
			fontSize: "1rem",
			color: DARK_THEME.textPrimary,
			backgroundColor: DARK_THEME.colorBackground
		},
		tooltipBorderOuter: {
			background: "transparent",
			border: `1px solid transparent`,
			borderRadius: "28px",
			padding: "0.5rem"
		},
		tooltipBorderInner: {
			borderRadius: "24px",
			border: `1px solid transparent`,
			boxShadow: "0 1px 3px 0px rgba(5, 5, 5, 0.4)"
		},
		tooltipTreeRoot: {
			padding: "0.5rem",
			background: DARK_THEME.colorBackground,
			border: "none",
			color: DARK_THEME.textPrimary
		},
		tooltipTreeChildren: {},
		details: {
			borderRadius: "0.5rem",
			background: "transparent"
		},
		summary: { padding: "0.5rem 0.75rem" },
		summaryRow: { background: "transparent" },
		summaryRowHover: {
			background: DARK_THEME.colorSurface,
			borderColor: DARK_THEME.textSecondary
		},
		row: {
			color: DARK_THEME.textPrimary,
			borderRadius: "0.375rem",
			transition: "all 160ms cubic-bezier(0.2, 0.6, 0.2, 1)"
		},
		indent: {},
		label: {
			color: DARK_THEME.textPrimary,
			fontSize: "0.875rem",
			gap: "4px",
			lineHeight: "1.5",
			border: "1px solid transparent",
			padding: "4px 16px",
			borderRadius: "1rem"
		},
		labelHover: {
			background: DARK_THEME.colorBorder,
			borderColor: DARK_THEME.textSecondary
		},
		chevron: {
			color: DARK_THEME.textSecondary,
			width: "14px",
			height: "14px"
		},
		fileRow: {
			padding: "0.5rem 0.75rem",
			fontSize: "0.875rem"
		},
		fileContent: {
			background: DARK_THEME.colorSurface,
			border: `1px solid none`,
			color: DARK_THEME.textSecondary,
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
			borderRadius: "0.5rem 1rem 1rem 0.5rem",
			padding: "0.5rem",
			scrollbarTrackBackground: DARK_THEME.colorSurface,
			scrollbarThumbBackground: DARK_THEME.textSecondary
		},
		connector: {
			color: DARK_THEME.grey600,
			thickness: "2px",
			elbowLength: "10px"
		},
		folderChildren: {
			padding: "0.5rem 0",
			marginLeft: "1rem"
		},
		highlightReceiverId: {
			color: DARK_THEME.highlightReceiverId,
			fontWeight: "600"
		},
		highlightMethodName: {
			color: DARK_THEME.highlightMethodName,
			fontWeight: "600"
		},
		highlightAmount: {
			color: DARK_THEME.highlightAmount,
			fontWeight: "600"
		},
		rootMobile: {
			borderRadius: "0.5rem",
			margin: "0"
		},
		treeChildrenMobile: { padding: "0.75rem" },
		folderChildrenMobile: { marginLeft: "0.75rem" },
		rowMobile: { padding: "0.5rem" },
		fileContentMobile: {
			fontSize: "0.7rem",
			maxHeight: "150px"
		}
	},
	light: {
		...LIGHT_THEME,
		host: {
			fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif",
			fontSize: "1rem",
			color: LIGHT_THEME.textPrimary,
			backgroundColor: LIGHT_THEME.colorBackground
		},
		tooltipBorderOuter: {
			background: "transparent",
			border: `1px solid transparent`,
			borderRadius: "28px",
			padding: "0.5rem"
		},
		tooltipBorderInner: {
			borderRadius: "24px",
			border: `1px solid ${LIGHT_THEME.slate300}`,
			boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)"
		},
		tooltipTreeRoot: {
			padding: "0.5rem",
			background: LIGHT_THEME.colorBackground,
			border: "none",
			color: LIGHT_THEME.textPrimary
		},
		tooltipTreeChildren: {},
		details: {
			borderRadius: "0.5rem",
			background: "transparent"
		},
		summary: { padding: "0.5rem 0.75rem" },
		summaryRow: { background: "transparent" },
		summaryRowHover: {
			background: LIGHT_THEME.slate100,
			borderColor: LIGHT_THEME.colorBorder
		},
		row: {
			color: LIGHT_THEME.textPrimary,
			borderRadius: "0.375rem",
			transition: "all 160ms cubic-bezier(0.2, 0.6, 0.2, 1)"
		},
		indent: {},
		label: {
			color: LIGHT_THEME.textPrimary,
			fontSize: "0.875rem",
			gap: "4px",
			lineHeight: "1.5",
			border: "1px solid transparent",
			padding: "4px 16px",
			borderRadius: "1rem"
		},
		labelHover: {
			background: LIGHT_THEME.grey75,
			borderColor: LIGHT_THEME.colorBorder
		},
		chevron: {
			color: LIGHT_THEME.textSecondary,
			width: "14px",
			height: "14px"
		},
		fileRow: {
			padding: "0.5rem 0.75rem",
			fontSize: "0.875rem"
		},
		fileContent: {
			background: LIGHT_THEME.slate100,
			border: `1px solid ${LIGHT_THEME.colorBorder}`,
			color: LIGHT_THEME.textPrimary,
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
			borderRadius: "0.5rem 1rem 1rem 0.5rem",
			padding: "0.5rem",
			scrollbarTrackBackground: LIGHT_THEME.colorSurface,
			scrollbarThumbBackground: LIGHT_THEME.colorBorder
		},
		connector: {
			color: LIGHT_THEME.slate200,
			thickness: "2px",
			elbowLength: "10px"
		},
		folderChildren: {
			padding: "0.5rem 0",
			marginLeft: "1rem"
		},
		highlightReceiverId: {
			color: LIGHT_THEME.highlightReceiverId,
			fontWeight: "600"
		},
		highlightMethodName: {
			color: LIGHT_THEME.highlightMethodName,
			fontWeight: "600"
		},
		highlightAmount: {
			color: LIGHT_THEME.highlightAmount,
			fontWeight: "600"
		},
		rootMobile: {
			borderRadius: "0.5rem",
			margin: "0"
		},
		treeChildrenMobile: { padding: "0.75rem" },
		folderChildrenMobile: { marginLeft: "0.75rem" },
		rowMobile: { padding: "0.5rem" },
		fileContentMobile: {
			fontSize: "0.7rem",
			maxHeight: "150px"
		}
	}
};

//#endregion
export { TX_TREE_THEMES };
//# sourceMappingURL=tx-tree-themes.js.map