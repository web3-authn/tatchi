import type { TooltipTreeStyles } from '.';

export type TooltipTheme = 'dark' | 'light';

// Preset theme definitions for tooltip tree styling
export const TOOLTIP_THEMES: Record<TooltipTheme, TooltipTreeStyles> = {
  dark: {
    root: {
      background: '#151833',
      borderRadius: '12px',
      color: '#e6e9f5',
      border: 'none'
    },
    details: {
      borderRadius: '8px',
      background: 'transparent'
    },
    summary: {
      padding: '4px 6px',
      borderRadius: '6px'
    },
    fileContent: {
      background: 'rgba(255, 255, 255, 0.06)',
      borderRadius: '6px',
      color: '#e2e8f0',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
    },
    highlightReceiverId: {
      color: '#ff6b6b',
      fontWeight: '600'
    },
    highlightMethodName: {
      color: '#4ecdc4',
      fontWeight: '600'
    },
    row: {
      color: '#e6e9f5',
    },
    summaryRow: {},
    indent: {},
    label: {},
    chevron: {}
  },
  light: {
    root: {
      background: '#ffffff',
      borderRadius: '12px',
      color: '#222222',
      border: 'none'
    },
    details: {
      borderRadius: '8px',
      background: 'transparent'
    },
    summary: {
      padding: '4px 6px',
      borderRadius: '6px'
    },
    fileContent: {
      background: '#f1f5f9', // slate grey-100
      borderRadius: '6px',
      color: '#2d3748',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
    },
    highlightReceiverId: {
      color: '#dc2626',
      fontWeight: '600'
    },
    highlightMethodName: {
      color: '#059669',
      fontWeight: '600'
    },
    row: {
      color: '#2d3748',
    },
    summaryRow: {},
    indent: {},
    label: {},
    chevron: {}
  }
};
