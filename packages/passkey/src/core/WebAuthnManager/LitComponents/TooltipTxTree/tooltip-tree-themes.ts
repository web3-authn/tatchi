import type { TooltipTreeStyles } from '.';

export type TooltipTheme = 'dark' | 'light';

// Preset theme definitions for tooltip tree styling - comprehensive design system
export const TOOLTIP_THEMES: Record<TooltipTheme, TooltipTreeStyles> = {
  dark: {
    // Base design system variables
    host: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '1rem',
      color: '#f1f5f9',
      backgroundColor: '#0f172a'
    },

    // Core color variables
    colorPrimary: '#3b82f6',
    colorSecondary: '#6366f1',
    colorSuccess: '#10b981',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    colorBackground: '#0f172a',
    colorSurface: '#1e293b',
    colorBorder: '#334155',
    colorText: '#f1f5f9',
    colorTextSecondary: '#94a3b8',

    // Typography
    fontSizeSm: '0.875rem',
    fontSizeBase: '1rem',
    fontSizeLg: '1.125rem',
    fontSizeXl: '1.25rem',

    // Spacing and layout
    radiusSm: '0.375rem',
    radiusMd: '0.5rem',
    radiusLg: '0.75rem',
    radiusXl: '1rem',
    gap2: '0.5rem',
    gap3: '0.75rem',
    gap4: '1rem',
    gap6: '1.5rem',
    shadowSm: '0 1px 2px 0 rgb(0 0 0 / 0.25)',
    shadowMd: '0 4px 6px -1px rgb(0 0 0 / 0.3)',

    // Component-specific tree variables
    root: {
      background: '#1e293b',
      color: '#f1f5f9',
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
      padding: '',
    },
    summaryRowHover: {
      background: '#334155',
      borderColor: '#475569'
    },
    row: {
      color: '#f1f5f9',
      borderRadius: '0.375rem',
      transition: 'all 160ms cubic-bezier(0.2, 0.6, 0.2, 1)'
    },
    indent: {},
    label: {
      color: '#f1f5f9',
      fontSize: '0.875rem',
      padding: '2px 4px',
      gap: '4px',
      lineHeight: '1.5'
    },
    chevron: {
      color: '#94a3b8',
      width: '14px',
      height: '14px'
    },
    fileRow: {
      padding: '0.5rem 0.75rem',
      fontSize: '0.875rem'
    },
    fileContent: {
      background: '#0f172a',
      border: '1px solid #334155',
      borderRadius: '0.5rem',
      color: '#e2e8f0',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      padding: '0.75rem',
      boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.25)',
      scrollbarTrackBackground: '#1e293b',
      scrollbarThumbBackground: '#475569'
    },
    folderChildren: {
      padding: '0.5rem 0',
      marginLeft: '1rem'
    },

    // Highlighting
    highlightReceiverId: {
      color: '#3b82f6',
      fontWeight: '600'
    },
    highlightMethodName: {
      color: '#06b6d4',
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
    // Base design system variables
    host: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '1rem',
      color: '#1e293b',
      backgroundColor: '#ffffff'
    },

    // Core color variables
    colorPrimary: '#2563eb',
    colorSecondary: '#4f46e5',
    colorSuccess: '#059669',
    colorWarning: '#d97706',
    colorError: '#dc2626',
    colorBackground: '#ffffff',
    colorSurface: '#f8fafc',
    colorBorder: '#e2e8f0',
    colorText: '#1e293b',
    colorTextSecondary: '#64748b',

    // Typography
    fontSizeSm: '0.875rem',
    fontSizeBase: '1rem',
    fontSizeLg: '1.125rem',
    fontSizeXl: '1.25rem',

    // Spacing and layout
    radiusSm: '0.375rem',
    radiusMd: '0.5rem',
    radiusLg: '0.75rem',
    radiusXl: '1rem',
    gap2: '0.5rem',
    gap3: '0.75rem',
    gap4: '1rem',
    gap6: '1.5rem',
    shadowSm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    shadowMd: '0 4px 6px -1px rgb(0 0 0 / 0.1)',

    // Component-specific tree variables
    root: {
      background: '#ffffff',
      color: '#1e293b',
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
      padding: '0px',
    },
    summaryRowHover: {
      background: '#f1f5f9',
      borderColor: '#cbd5e1'
    },
    row: {
      color: '#1e293b',
      borderRadius: '0.375rem',
      transition: 'all 160ms cubic-bezier(0.2, 0.6, 0.2, 1)'
    },
    indent: {},
    label: {
      color: '#1e293b',
      fontSize: '0.875rem',
      padding: '2px 4px',
      gap: '4px',
      lineHeight: '1.5'
    },
    chevron: {
      color: '#64748b',
      width: '14px',
      height: '14px'
    },
    fileRow: {
      padding: '0.5rem 0.75rem',
      fontSize: '0.875rem'
    },
    fileContent: {
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '0.5rem',
      color: '#1e293b',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      padding: '0.75rem',
      boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      scrollbarTrackBackground: '#f8fafc',
      scrollbarThumbBackground: '#cbd5e1'
    },
    folderChildren: {
      padding: '0.5rem 0',
      marginLeft: '1rem'
    },

    // Highlighting
    highlightReceiverId: {
      color: '#2563eb',
      fontWeight: '600'
    },
    highlightMethodName: {
      color: '#0891b2',
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
