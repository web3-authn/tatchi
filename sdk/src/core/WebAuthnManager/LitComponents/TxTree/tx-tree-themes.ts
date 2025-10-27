import type { ComponentStyles } from '../LitElementWithProps';
import { DARK_THEME, LIGHT_THEME } from '@/base-styles';

export type TxTreeTheme = 'dark' | 'light';

export interface TxTreeStyles extends ComponentStyles {

  // Component-specific tree variables
  host?: Record<string, string>;

  // Component-specific tooltip container variables
  dataTooltipContentRoot?: Record<string, string>;
  tooltipContainer?: Record<string, string>;
  gradientBorder?: Record<string, string>;

  tooltipTreeRoot?: Record<string, string>;
  tooltipTreeChildren?: Record<string, string>;
  details?: Record<string, string>;
  summary?: Record<string, string>;
  summaryRow?: Record<string, string>;
  summaryRowHover?: Record<string, string>;
  row?: Record<string, string>;
  indent?: Record<string, string>;
  label?: Record<string, string>;
  chevron?: Record<string, string>;
  fileRow?: Record<string, string>;
  fileContent?: Record<string, string>;
  folderChildren?: Record<string, string>;
  connector?: Record<string, string>;

  // Highlighting styles for transaction details
  highlightReceiverId?: Record<string, string>;
  highlightMethodName?: Record<string, string>;

  // Mobile responsive
  rootMobile?: Record<string, string>;
  treeChildrenMobile?: Record<string, string>;
  folderChildrenMobile?: Record<string, string>;
  rowMobile?: Record<string, string>;
  fileContentMobile?: Record<string, string>;
}

// Preset theme definitions for tooltip tree styling - comprehensive design system
export const TX_TREE_THEMES: Record<TxTreeTheme, TxTreeStyles> = {
  dark: {
    // Spread base colors from shared palette
    ...DARK_THEME,

    // Base design system variables
    host: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '1rem',
      color: DARK_THEME.textPrimary,
      backgroundColor: DARK_THEME.colorBackground
    },

    // Main tooltip container
    tooltipBorderOuter: {
      borderRadius: '24px',
      border: `1px solid transparent`,
      boxShadow: '0 1px 3px 0px rgba(5, 5, 5, 0.4)'
    },

    // Component-specific tree variables
    tooltipTreeRoot: {
      padding: '0rem',
      background: DARK_THEME.surface2,
      border: 'none',
      color: DARK_THEME.textPrimary,
    },
    tooltipTreeChildren: {
    },
    details: {
      borderRadius: '0.5rem',
      background: 'transparent'
    },
    summary: {
      padding: '0.5rem 0.75rem',
    },
    summaryRow: {
      background: 'transparent',
    },
    summaryRowHover: {
      background: DARK_THEME.surface,
      borderColor: DARK_THEME.textSecondary,
    },
    row: {
      color: DARK_THEME.textPrimary,
      borderRadius: '0.375rem',
      transition: 'all 160ms cubic-bezier(0.2, 0.6, 0.2, 1)'
    },
    indent: {},
    label: {
      color: DARK_THEME.textPrimary,
      fontSize: '0.875rem',
      gap: '4px',
      lineHeight: '1.5',
      border: '1px solid transparent',
      padding: '4px 16px',
      borderRadius: '1rem',
    },
    labelHover: {
      background: DARK_THEME.borderPrimary,
      borderColor: DARK_THEME.textSecondary,
    },
    chevron: {
      color: DARK_THEME.textSecondary,
      width: '14px',
      height: '14px'
    },
    fileRow: {
      padding: '0.5rem 0.75rem',
      fontSize: '0.875rem'
    },
    fileContent: {
      background: DARK_THEME.surface2,
      border: `1px solid none`,
      color: DARK_THEME.textSecondary,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      borderRadius: '0.5rem',
      padding: '0.25rem',
      scrollbarTrackBackground: DARK_THEME.surface,
      scrollbarThumbBackground: DARK_THEME.textSecondary
    },
    connector: {
      color: DARK_THEME.grey600,
      thickness: '2px',
      elbowLength: '10px'
    },
    folderChildren: {
      padding: '0.5rem 0',
      marginLeft: '1rem'
    },

    // Highlighting - using unified color scheme from base colors
    highlightReceiverId: {
      color: DARK_THEME.highlightReceiverId,
      fontWeight: '600',
    },
    highlightMethodName: {
      color: DARK_THEME.highlightMethodName,
      fontWeight: '600',
    },
    highlightAmount: {
      color: DARK_THEME.highlightAmount,
      fontWeight: '600',
    },

    // Mobile responsive
    rootMobile: {
      borderRadius: '0.5rem',
      margin: '0'
    },
    treeChildrenMobile: {
      padding: '0.75rem'
    },
    folderChildrenMobile: {
      marginLeft: '0.75rem'
    },
    rowMobile: {
      padding: '0.5rem'
    },
    fileContentMobile: {
      fontSize: '0.7rem',
      maxHeight: '150px'
    }
  },
  light: {
    // Spread base colors from shared palette
    ...LIGHT_THEME,

    // Base design system variables
    host: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '1rem',
      color: LIGHT_THEME.textPrimary,
      backgroundColor: LIGHT_THEME.colorBackground
    },

    // Main tooltip container
    tooltipBorderOuter: {
      borderRadius: '24px',
      border: `1px solid ${LIGHT_THEME.slate300}`,
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
    },

    // Component-specific tree variables
    tooltipTreeRoot: {
      padding: '0rem',
      background: LIGHT_THEME.surface,
      border: 'none',
      color: LIGHT_THEME.textPrimary,
    },
    tooltipTreeChildren: {

    },
    details: {
      borderRadius: '0.5rem',
      background: 'transparent'
    },
    summary: {
      padding: '0.5rem 0.75rem',
    },
    summaryRow: {
      background: 'transparent',
    },
    summaryRowHover: {
      background: LIGHT_THEME.surface2,
      borderColor: LIGHT_THEME.borderPrimary
    },
    row: {
      color: LIGHT_THEME.textPrimary,
      borderRadius: '0.375rem',
      transition: 'all 160ms cubic-bezier(0.2, 0.6, 0.2, 1)'
    },
    indent: {},
    label: {
      color: LIGHT_THEME.textPrimary,
      fontSize: '0.875rem',
      gap: '4px',
      lineHeight: '1.5',
      border: '1px solid transparent',
      padding: '4px 16px',
      borderRadius: '1rem',
    },
    labelHover: {
      background: LIGHT_THEME.grey75,
      borderColor: LIGHT_THEME.borderPrimary
    },
    chevron: {
      color: LIGHT_THEME.textSecondary,
      width: '14px',
      height: '14px'
    },
    fileRow: {
      padding: '0.5rem 0.75rem',
      fontSize: '0.875rem'
    },
    fileContent: {
      background: LIGHT_THEME.surface,
      border: `1px solid ${LIGHT_THEME.borderPrimary}`,
      color: LIGHT_THEME.textPrimary,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      borderRadius: '0.5rem',
      padding: '0.25rem',
      scrollbarTrackBackground: LIGHT_THEME.surface,
      scrollbarThumbBackground: LIGHT_THEME.borderPrimary
    },
    // Slightly darker connector lines for light mode for better contrast
    connector: {
      color: LIGHT_THEME.slate200,
      thickness: '2px',
      elbowLength: '10px'
    },
    folderChildren: {
      padding: '0.5rem 0',
      marginLeft: '1rem'
    },

    // Highlighting - using unified color scheme from base colors
    highlightReceiverId: {
      color: LIGHT_THEME.highlightReceiverId,
      fontWeight: '600',
    },
    highlightMethodName: {
      color: LIGHT_THEME.highlightMethodName,
      fontWeight: '600',
    },
    highlightAmount: {
      color: LIGHT_THEME.highlightAmount,
      fontWeight: '600',
    },

    // Mobile responsive
    rootMobile: {
      borderRadius: '0.5rem',
      margin: '0'
    },
    treeChildrenMobile: {
      padding: '0.75rem'
    },
    folderChildrenMobile: {
      marginLeft: '0.75rem'
    },
    rowMobile: {
      padding: '0.5rem'
    },
    fileContentMobile: {
      fontSize: '0.7rem',
      maxHeight: '150px'
    }
  }
};
