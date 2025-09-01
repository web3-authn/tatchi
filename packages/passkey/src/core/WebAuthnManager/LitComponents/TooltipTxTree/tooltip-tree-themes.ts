import type { ComponentStyles } from '../LitElementWithProps';
import { DARK_THEME_COLORS, LIGHT_THEME_COLORS } from '../base-styles';

export type TooltipTheme = 'dark' | 'light';

export interface TooltipTreeStyles extends ComponentStyles {

  // Component-specific tree variables
  host?: Record<string, string>;
  root?: Record<string, string>;
  treeChildren?: Record<string, string>;
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

    // Component-specific tree variables
    root: {
      background: DARK_THEME_COLORS.colorSurface,
      color: DARK_THEME_COLORS.colorText,
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.3)'
    },
    treeChildren: {
      padding: '1rem'
    },
    details: {
      borderRadius: '0.5rem',
      background: 'transparent'
    },
    summary: {
      padding: '0.5rem 0.75rem',
      borderRadius: '0.375rem'
    },
    summaryRow: {
      background: 'transparent',
      border: '1px solid transparent',
      borderRadius: '0.75rem',
      padding: '',
    },
    summaryRowHover: {
      background: DARK_THEME_COLORS.colorBorder,
      borderColor: DARK_THEME_COLORS.colorTextSecondary
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
      padding: '2px 4px',
      gap: '4px',
      lineHeight: '1.5',
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
      background: DARK_THEME_COLORS.colorBackground,
      border: `1px solid ${DARK_THEME_COLORS.colorBorder}`,
      borderRadius: '0.5rem',
      color: DARK_THEME_COLORS.colorTextSecondary,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      padding: '0.75rem',
      boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.25)',
      scrollbarTrackBackground: DARK_THEME_COLORS.colorSurface,
      scrollbarThumbBackground: DARK_THEME_COLORS.colorTextSecondary
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

    // Component-specific tree variables
    root: {
      background: LIGHT_THEME_COLORS.colorBackground,
      color: LIGHT_THEME_COLORS.colorText,
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
    },
    treeChildren: {
      padding: '1rem'
    },
    details: {
      borderRadius: '0.5rem',
      background: 'transparent'
    },
    summary: {
      padding: '0.5rem 0.75rem',
      borderRadius: '0.375rem'
    },
    summaryRow: {
      background: 'transparent',
      border: '1px solid transparent',
      borderRadius: '0.75rem',
      padding: '0px',
    },
    summaryRowHover: {
      background: LIGHT_THEME_COLORS.colorSurface,
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
      padding: '2px 4px',
      gap: '4px',
      lineHeight: '1.5',
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
      background: LIGHT_THEME_COLORS.colorSurface,
      border: `1px solid ${LIGHT_THEME_COLORS.colorBorder}`,
      borderRadius: '0.5rem',
      color: LIGHT_THEME_COLORS.colorText,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      padding: '0.75rem',
      boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      scrollbarTrackBackground: LIGHT_THEME_COLORS.colorSurface,
      scrollbarThumbBackground: LIGHT_THEME_COLORS.colorBorder
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
