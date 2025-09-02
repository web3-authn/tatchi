import type { ComponentStyles } from '../LitElementWithProps';
import { DARK_THEME_COLORS, LIGHT_THEME_COLORS } from '@/base-styles';

export type TooltipTheme = 'dark' | 'light';

export interface TooltipTreeStyles extends ComponentStyles {

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
export const TOOLTIP_THEMES: Record<TooltipTheme, TooltipTreeStyles> = {
  dark: {
    // Spread base colors from shared palette
    ...DARK_THEME_COLORS,

    // Base design system variables
    host: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '1rem',
      color: DARK_THEME_COLORS.colorText,
      backgroundColor: DARK_THEME_COLORS.colorBackground
    },

    tooltipBorderOuter: {
      background: 'transparent',
      border: `1px solid transparent`,
      borderRadius: '28px',
      padding: '0.5rem',
    },

    // Main tooltip container - the glass-like container around the content
    tooltipBorderInner: {
      background: DARK_THEME_COLORS.grey600,
      borderRadius: '24px',
      border: `1px solid transparent`,
      boxShadow: '0 4px 4px 0px rgba(2, 2, 2, 0.4)'
    },

    // Component-specific tree variables
    tooltipTreeRoot: {
      padding: '0.5rem',
      background: DARK_THEME_COLORS.grey750,
      border: 'none',
      color: DARK_THEME_COLORS.colorText,
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
      background: DARK_THEME_COLORS.colorBorder,
      borderColor: DARK_THEME_COLORS.colorTextSecondary,
    },
    row: {
      color: DARK_THEME_COLORS.colorText,
      borderRadius: '0.375rem',
      transition: 'all 160ms cubic-bezier(0.2, 0.6, 0.2, 1)'
    },
    indent: {},
    label: {
      color: DARK_THEME_COLORS.colorText,
      fontSize: '0.875rem',
      gap: '4px',
      lineHeight: '1.5',
      border: '1px solid transparent',
      padding: '4px 16px',
      borderRadius: '1rem',
    },
    labelHover: {
      background: DARK_THEME_COLORS.colorBorder,
      borderColor: DARK_THEME_COLORS.colorTextSecondary,
    },
    chevron: {
      color: DARK_THEME_COLORS.colorTextSecondary,
      width: '14px',
      height: '14px'
    },
    fileRow: {
      padding: '0.5rem 0.75rem',
      fontSize: '0.875rem'
    },
    fileContent: {
      background: DARK_THEME_COLORS.grey600,
      border: `1px solid none`,
      color: DARK_THEME_COLORS.colorText,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      borderRadius: '0.5rem 1rem 1rem 0.5rem',
      padding: '0.5rem',
      scrollbarTrackBackground: DARK_THEME_COLORS.colorSurface,
      scrollbarThumbBackground: DARK_THEME_COLORS.colorTextSecondary
    },
    connector: {
      color: DARK_THEME_COLORS.grey600,
      thickness: '2px',
      elbowLength: '10px'
    },
    folderChildren: {
      padding: '0.5rem 0',
      marginLeft: '1rem'
    },

    // Highlighting - using unified color scheme from base colors
    highlightReceiverId: {
      color: DARK_THEME_COLORS.highlightReceiverId,
      fontWeight: '600'
    },
    highlightMethodName: {
      color: DARK_THEME_COLORS.highlightMethodName,
      fontWeight: '600'
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
    ...LIGHT_THEME_COLORS,

    // Base design system variables
    host: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '1rem',
      color: LIGHT_THEME_COLORS.colorText,
      backgroundColor: LIGHT_THEME_COLORS.colorBackground
    },

    tooltipBorderOuter: {
      background: 'transparent',
      border: `1px solid transparent`,
      borderRadius: '28px',
      padding: '0.5rem',
    },

    // Main tooltip container - the glass-like container around the content
    tooltipBorderInner: {
      background: LIGHT_THEME_COLORS.slate150,
      borderRadius: '24px',
      border: `1px solid ${LIGHT_THEME_COLORS.slate300}`,
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
    },

    // Component-specific tree variables
    tooltipTreeRoot: {
      padding: '0.5rem',
      background: LIGHT_THEME_COLORS.slate25,
      border: 'none',
      color: LIGHT_THEME_COLORS.colorText,
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
      background: LIGHT_THEME_COLORS.slate100,
      borderColor: LIGHT_THEME_COLORS.colorBorder
    },
    row: {
      color: LIGHT_THEME_COLORS.colorText,
      borderRadius: '0.375rem',
      transition: 'all 160ms cubic-bezier(0.2, 0.6, 0.2, 1)'
    },
    indent: {},
    label: {
      color: LIGHT_THEME_COLORS.colorText,
      fontSize: '0.875rem',
      gap: '4px',
      lineHeight: '1.5',
      border: '1px solid transparent',
      padding: '4px 16px',
      borderRadius: '1rem',
    },
    labelHover: {
      background: LIGHT_THEME_COLORS.grey75,
      borderColor: LIGHT_THEME_COLORS.colorBorder
    },
    chevron: {
      color: LIGHT_THEME_COLORS.colorTextSecondary,
      width: '14px',
      height: '14px'
    },
    fileRow: {
      padding: '0.5rem 0.75rem',
      fontSize: '0.875rem'
    },
    fileContent: {
      background: LIGHT_THEME_COLORS.grey75,
      border: `1px solid ${LIGHT_THEME_COLORS.colorBorder}`,
      color: LIGHT_THEME_COLORS.colorText,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      borderRadius: '0.5rem 1rem 1rem 0.5rem',
      padding: '0.5rem',
      scrollbarTrackBackground: LIGHT_THEME_COLORS.colorSurface,
      scrollbarThumbBackground: LIGHT_THEME_COLORS.colorBorder
    },
    // Slightly darker connector lines for light mode for better contrast
    connector: {
      color: LIGHT_THEME_COLORS.slate200,
      thickness: '2px',
      elbowLength: '10px'
    },
    folderChildren: {
      padding: '0.5rem 0',
      marginLeft: '1rem'
    },

    // Highlighting - using unified color scheme from base colors
    highlightReceiverId: {
      color: LIGHT_THEME_COLORS.highlightReceiverId,
      fontWeight: '600'
    },
    highlightMethodName: {
      color: LIGHT_THEME_COLORS.highlightMethodName,
      fontWeight: '600'
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
