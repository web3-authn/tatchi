# TooltipTxTree Styling API Analysis & Recommendations

## Architecture Overview

**Security Boundary Strategy**:
- `TooltipTxTree` component: Fully flexible, accepts any CSS styles (internal component)
- `IframeButtonHost` component: Enforces security via preset themes only (external-facing API)

## Current Implementation Analysis

### Problems with Current Approach

The current `TooltipTxTree` component has several limitations:

### 1. Limited Customization
- Only 4 color properties are customizable
- No control over spacing, typography, or layout
- `.tree-root` and children styling is mostly hardcoded

### 2. Inconsistent API
- Mix of CSS variables and component properties
- No clear pattern for extending styles
- Difficult to theme comprehensively

### 3. Security Vulnerabilities
- No validation of CSS property values
- Potential for malicious CSS injection
- Critical properties like `opacity`, `display`, `visibility` could be manipulated

## Recommended Architecture

### 1. TooltipTxTree: Full CSS Flexibility

Allow complete styling freedom in the internal component:

```typescript
interface TooltipTreeStyles {
  // Allow any CSS properties for maximum flexibility
  root?: Record<string, string>;
  treeChildren?: Record<string, string>;
  details?: Record<string, string>;
  summary?: Record<string, string>;
  row?: Record<string, string>;
  label?: Record<string, string>;
  chevron?: Record<string, string>;
  fileContent?: Record<string, string>;
  folderChildren?: Record<string, string>;
  // Highlighting styles for transaction details
  highlightReceiverId?: Record<string, string>;
  highlightMethodName?: Record<string, string>;
}
```

### 2. IframeButtonHost: Preset Theme Security

Restrict external API to safe, predefined themes:

```typescript
type TooltipTheme = 'dark' | 'light';

const TOOLTIP_THEMES: Record<TooltipTheme, TooltipTreeStyles> = {
  dark: {
    root: {
      background: '#151833',
      maxWidth: '600px',
      borderRadius: '12px',
      color: '#e6e9f5'
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
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
    },
    highlightReceiverId: {
      color: '#ff6b6b',
      fontWeight: '600'
    },
    highlightMethodName: {
      color: '#4ecdc4',
      fontWeight: '600'
    }
  },
  light: {
    root: {
      background: '#ffffff',
      maxWidth: '600px',
      borderRadius: '12px',
      color: '#2d3748',
      border: '1px solid #e2e8f0'
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
      background: '#f8fafc',
      borderRadius: '6px',
      color: '#1f2937',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
    },
    highlightReceiverId: {
      color: '#dc2626',
      fontWeight: '600'
    },
    highlightMethodName: {
      color: '#059669',
      fontWeight: '600'
    }
  }
};
```

### 3. Implementation Strategy

#### A. TooltipTxTree Component (Internal - Full Flexibility)

```typescript
export class TooltipTxTree extends LitElement {
  static properties = {
    // Data properties
    node: { attribute: false },
    depth: { type: Number, attribute: false },

    // Full styling flexibility - accept any CSS styles
    styles: { attribute: false }, // TooltipTreeStyles object
  } as const;

  private applyStyles(styles: TooltipTreeStyles): void {
    if (!styles) return;

    // Apply styles to host element via CSS custom properties
    Object.entries(styles).forEach(([section, sectionStyles]) => {
      if (sectionStyles && typeof sectionStyles === 'object') {
        Object.entries(sectionStyles).forEach(([prop, value]) => {
          const cssVar = `--w3a-tree-${section}-${this.camelToKebab(prop)}`;
          this.style.setProperty(cssVar, String(value));
        });
      }
    });
  }

  private camelToKebab(str: string): string {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase();
  }
}
```

#### B. IframeButtonHost Component (External - Theme Restricted)

```typescript
// In IframeButtonHost.ts
type TooltipTheme = 'dark' | 'light';

interface IframeButtonProps {
  // ... existing props
  tooltipTheme?: TooltipTheme; // Only allow preset themes
  // No arbitrary CSS allowed - only preset themes
}

private getThemeStyles(theme: TooltipTheme): TooltipTreeStyles {
  return TOOLTIP_THEMES[theme] || TOOLTIP_THEMES.dark;
}

private postStyleUpdateToIframe() {
  // Convert theme to full style object
  const themeStyles = this.getThemeStyles(this.tooltipTheme || 'dark');

  this.postToIframe('SET_STYLE', {
    buttonStyle: this.buttonStyle,
    buttonHoverStyle: this.buttonHoverStyle,
    tooltipStyle: this.tooltipStyle,
    tooltipTreeStyles: themeStyles, // Pass complete theme styles
  });
}
```

#### C. CSS Implementation in TooltipTxTree

```css
/* Update existing CSS to use CSS custom properties */
:host {
  color: var(--w3a-tree-root-color, #e6e9f5);
  background: var(--w3a-tree-root-background, transparent);
}

.tree-root {
  background: var(--w3a-tree-root-background, #151833);
  max-width: var(--w3a-tree-root-max-width, 600px);
  border-radius: var(--w3a-tree-root-border-radius, 12px);
  border: var(--w3a-tree-root-border, none);
  /* ... other properties */
}

.tree-children {
  padding: var(--w3a-tree-tree-children-padding, 6px);
}

details {
  border-radius: var(--w3a-tree-details-border-radius, 8px);
  background: var(--w3a-tree-details-background, transparent);
}

.summary-row {
  padding: var(--w3a-tree-summary-padding, 4px 6px);
  border-radius: var(--w3a-tree-summary-border-radius, 6px);
}

.file-content {
  background: var(--w3a-tree-file-content-background, rgba(255, 255, 255, 0.06));
  border-radius: var(--w3a-tree-file-content-border-radius, 6px);
  color: var(--w3a-tree-file-content-color, #e2e8f0);
  font-family: var(--w3a-tree-file-content-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
}

.highlight-receiverId {
  color: var(--w3a-tree-highlight-receiver-id-color, #ff6b6b) !important;
  font-weight: var(--w3a-tree-highlight-receiver-id-font-weight, 600);
}

.highlight-methodName {
  color: var(--w3a-tree-highlight-method-name-color, #4ecdc4) !important;
  font-weight: var(--w3a-tree-highlight-method-name-font-weight, 600);
}
```

## Benefits of This Architecture

### 1. Security Through Separation
- **External API**: Only preset themes exposed to users
- **Internal Flexibility**: Full CSS control for internal development
- **Clear Boundary**: Security enforced at the iframe boundary

### 2. Developer Experience
- **Simple External API**: Just choose 'dark' or 'light' theme
- **Rich Internal API**: Full styling control for component development
- **Type Safety**: TypeScript support for all style properties

### 3. Maintainability
- **Single Source of Truth**: Themes defined once in IframeButtonHost
- **Easy Updates**: Add new themes without changing TooltipTxTree
- **Clean API**: No legacy properties to maintain

## Usage Examples

```typescript
// External usage (IframeButtonHost) - Security enforced
<iframe-button
  tooltip-theme="dark"
  near-account-id="user.testnet"
  // No arbitrary CSS allowed - only preset themes
/>

// Internal usage (TooltipTxTree) - Full flexibility with highlighting
<tooltip-tx-tree
  .node=${treeData}
  .styles=${{
    root: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      borderRadius: '20px',
      padding: '16px'
    },
    fileContent: {
      background: '#f8f9fa',
      fontFamily: 'Monaco, monospace',
      fontSize: '11px'
    },
    // Highlight receiverId (contract address) in bright orange
    highlightReceiverId: {
      color: '#ff8c42',
      fontWeight: '700',
      textDecoration: 'underline'
    },
    // Highlight method names in bright cyan
    highlightMethodName: {
      color: '#42d9ff',
      fontWeight: '600',
      backgroundColor: 'rgba(66, 217, 255, 0.1)',
      padding: '2px 4px',
      borderRadius: '4px'
    }
  }}
/>

// Advanced styling example with custom colors
<tooltip-tx-tree
  .node=${treeData}
  .styles=${{
    root: {
      background: '#1a1a2e',
      border: '2px solid #16213e',
      borderRadius: '16px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
    },
    summary: {
      background: 'rgba(255, 255, 255, 0.05)',
      borderRadius: '8px',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    },
    // Custom receiverId highlighting - red for security awareness
    highlightReceiverId: {
      color: '#ff4757',
      fontWeight: 'bold',
      textShadow: '0 0 4px rgba(255, 71, 87, 0.3)'
    },
    // Custom method name highlighting - green for functions
    highlightMethodName: {
      color: '#2ed573',
      fontWeight: '600',
      backgroundColor: 'rgba(46, 213, 115, 0.15)',
      padding: '1px 6px',
      borderRadius: '12px'
    }
  }}
/>
```

This approach provides maximum security for external users while maintaining full flexibility for internal development.
