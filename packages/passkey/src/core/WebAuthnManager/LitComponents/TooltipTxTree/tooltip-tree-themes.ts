import type { TooltipTreeStyles } from '.';

export type TooltipTheme = 'dark' | 'light';

// Interface Replica Design System - Glass morphism with metallic accents
// Applied to TooltipTxTree for sophisticated visual hierarchy
export const TOOLTIP_THEMES: Record<TooltipTheme, TooltipTreeStyles> = {
  dark: {
    // Glass morphism root container with backdrop blur
    root: {
      background: 'rgba(255, 255, 255, 0.08)', // Glass primary (8% white opacity)
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderRadius: '24px', // Inner glass layer radius
      color: '#ffffff', // Primary text color
      border: '1px solid rgba(255, 255, 255, 0.1)', // Glass border
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.3)' // Dark mode shadows
    },
    // Folder containers with subtle transparency
    details: {
      borderRadius: '16px', // Medium border radius
      background: 'rgba(255, 255, 255, 0.03)' // Very subtle glass secondary
    },
    // Interactive summary rows with hover states
    summary: {
      padding: '8px 12px', // Increased padding for better touch targets
      borderRadius: '12px', // Rounded for glass aesthetics
      transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)', // Smooth transitions
      background: 'rgba(255, 255, 255, 0.05)' // Subtle glass on hover-ready state
    },
    // Code content with metallic appearance
    fileContent: {
      background: 'linear-gradient(135deg, #3a3a3a 0%, #1a1a1a 50%, #2a2a2a 100%)', // Metallic gradient
      borderRadius: '12px', // Consistent with glass theme
      color: '#e2e8f0', // Monospace text color
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      border: '1px solid rgba(255, 255, 255, 0.08)', // Subtle metallic border
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)' // Depth for metallic appearance
    },
    // Highlight colors with Interface Replica palette
    highlightReceiverId: {
      color: '#ff6b35', // Interface Replica orange accent
      fontWeight: '600',
      background: 'rgba(255, 107, 53, 0.1)', // Subtle background highlight
      padding: '2px 6px',
      borderRadius: '8px'
    },
    highlightMethodName: {
      color: '#00d9ff', // Interface Replica cyan accent
      fontWeight: '600',
      background: 'rgba(0, 217, 255, 0.1)', // Subtle background highlight
      padding: '2px 6px',
      borderRadius: '8px'
    },
    // Text colors for dark theme
    row: {
      color: '#ffffff'
    },
    // Summary row hover state
    summaryRow: {
      background: 'rgba(255, 255, 255, 0.08)' // Glass hover state
    },
    // Indentation and layout
    indent: {},
    label: {},
    // Chevron styling
    chevron: {
      color: 'rgba(255, 255, 255, 0.7)' // Subtle chevron color
    }
  },
  light: {
    // Glass morphism root container with backdrop blur
    root: {
      background: 'rgba(255, 255, 255, 0.6)', // Glass primary (60% white opacity)
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderRadius: '24px', // Inner glass layer radius
      color: '#000000', // Primary text color
      border: '1px solid rgba(255, 255, 255, 0.2)', // Glass border
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.08)' // Light mode shadows
    },
    // Folder containers with subtle transparency
    details: {
      borderRadius: '16px', // Medium border radius
      background: 'rgba(255, 255, 255, 0.15)' // Very subtle glass secondary
    },
    // Interactive summary rows with hover states
    summary: {
      padding: '8px 12px', // Increased padding for better touch targets
      borderRadius: '12px', // Rounded for glass aesthetics
      transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)', // Smooth transitions
      background: 'rgba(255, 255, 255, 0.25)' // Subtle glass on hover-ready state
    },
    // Code content with metallic appearance
    fileContent: {
      background: 'linear-gradient(135deg, #ffffff 0%, #f5f5f5 50%, #ffffff 100%)', // Metallic gradient
      borderRadius: '12px', // Consistent with glass theme
      color: '#2d3748', // Monospace text color
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      border: '1px solid rgba(0, 0, 0, 0.08)', // Subtle metallic border
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.12)' // Depth for metallic appearance
    },
    // Highlight colors with Interface Replica palette
    highlightReceiverId: {
      color: '#ff6b35', // Interface Replica orange accent
      fontWeight: '600',
      background: 'rgba(255, 107, 53, 0.1)', // Subtle background highlight
      padding: '2px 6px',
      borderRadius: '8px'
    },
    highlightMethodName: {
      color: '#00d9ff', // Interface Replica cyan accent
      fontWeight: '600',
      background: 'rgba(0, 217, 255, 0.1)', // Subtle background highlight
      padding: '2px 6px',
      borderRadius: '8px'
    },
    // Text colors for light theme
    row: {
      color: '#000000'
    },
    // Summary row hover state
    summaryRow: {
      background: 'rgba(255, 255, 255, 0.35)' // Glass hover state
    },
    // Indentation and layout
    indent: {},
    label: {},
    // Chevron styling
    chevron: {
      color: 'rgba(0, 0, 0, 0.6)' // Subtle chevron color
    }
  }
};
