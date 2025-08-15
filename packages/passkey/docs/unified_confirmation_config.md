# Unified Confirmation Configuration

## Overview

The confirmation system has been refactored to use a unified `ConfirmationConfig` object that combines all confirmation-related settings into a single, well-organized structure. This provides better type safety, easier configuration management, and more flexible confirmation flows.

## Configuration Structure

```typescript
interface ConfirmationConfig {
  /** Whether to show confirmation UI before TouchID prompt (true) or go straight to TouchID (false) */
  showPreConfirm: boolean;

  /** Type of UI to display for confirmation */
  uiMode: 'native' | 'shadow' | 'embedded' | 'popup';

  /** How the confirmation UI behaves */
  behavior: 'requireClick' | 'autoProceed' | 'autoProceedWithDelay';

  /** Delay in milliseconds before auto-proceeding (only used with autoProceedWithDelay) */
  autoProceedDelay?: number;
}
```

## Configuration Options

### `showPreConfirm`
- **`true`**: Show transaction confirmation UI before TouchID prompt
- **`false`**: Skip confirmation UI and go directly to TouchID prompt

### `uiMode`
- **`native`**: Use browser's native `window.confirm()` dialog
- **`shadow`**: Use custom shadow DOM modal (default)
- **`embedded`**: Embed confirmation UI inline in the page
- **`popup`**: Open confirmation in a sandboxed iframe/popup

### `behavior`
- **`requireClick`**: User must click "Confirm" button to proceed
- **`autoProceed`**: Show UI for context, then automatically proceed with TouchID
- **`autoProceedWithDelay`**: Show UI for context, wait for specified delay, then proceed

### `autoProceedDelay`
- **Default**: 2000ms (2 seconds)
- **Usage**: Only used when `behavior` is `autoProceedWithDelay`
- **Purpose**: Gives users time to read transaction details before automatic TouchID prompt

## Default Configuration

```typescript
const defaultConfig: ConfirmationConfig = {
  showPreConfirm: true,
  uiMode: 'shadow',
  behavior: 'requireClick',
  autoProceedDelay: 2000,
};
```

## API Usage

### Setting Configuration

```typescript
// Set individual settings
passkeyManager.setShowPreConfirm(true);
passkeyManager.setConfirmationUIMode('shadow');
passkeyManager.setConfirmBehavior('autoProceedWithDelay');
passkeyManager.setAutoProceedDelay(3000);

// Set unified configuration
passkeyManager.setConfirmationConfig({
  showPreConfirm: true,
  uiMode: 'shadow',
  behavior: 'autoProceedWithDelay',
  autoProceedDelay: 3000,
});
```

### Getting Configuration

```typescript
const config = passkeyManager.getConfirmationConfig();
console.log(config);
// {
//   showPreConfirm: true,
//   uiMode: 'shadow',
//   behavior: 'autoProceedWithDelay',
//   autoProceedDelay: 3000
// }
```

## Common Use Cases

### 1. Traditional Confirmation Flow
```typescript
passkeyManager.setConfirmationConfig({
  showPreConfirm: true,
  uiMode: 'shadow',
  behavior: 'requireClick',
});
```

### 2. Quick Auto-Proceed Flow
```typescript
passkeyManager.setConfirmationConfig({
  showPreConfirm: true,
  uiMode: 'shadow',
  behavior: 'autoProceedWithDelay',
  autoProceedDelay: 1500, // 1.5 seconds
});
```

### 3. Skip Confirmation (Direct TouchID)
```typescript
passkeyManager.setConfirmationConfig({
  showPreConfirm: false,
  uiMode: 'shadow', // Not used when showPreConfirm is false
  behavior: 'requireClick', // Not used when showPreConfirm is false
});
```

### 4. Native Browser Confirmation
```typescript
passkeyManager.setConfirmationConfig({
  showPreConfirm: true,
  uiMode: 'native',
  behavior: 'requireClick',
});
```

## Persistence

The confirmation configuration is automatically persisted to IndexedDB and loaded when the user logs in. The system maintains backward compatibility by:

1. **Loading legacy settings**: Converts old `usePreConfirmFlow` and `confirmBehavior` to new format
2. **Saving both formats**: Saves both legacy and new unified configuration for compatibility
3. **Graceful migration**: Automatically migrates existing user preferences

## Migration from Legacy Settings

| Legacy Setting | New Setting |
|----------------|-------------|
| `usePreConfirmFlow: true` | `showPreConfirm: true` |
| `usePreConfirmFlow: false` | `showPreConfirm: false` |
| `confirmBehavior: 'requireClick'` | `behavior: 'requireClick'` |
| `confirmBehavior: 'autoProceed'` | `behavior: 'autoProceedWithDelay'` |

## Benefits

1. **Type Safety**: All configuration options are properly typed
2. **Unified Interface**: Single method to configure all confirmation settings
3. **Extensibility**: Easy to add new UI modes and behaviors
4. **Backward Compatibility**: Existing code continues to work
5. **Better Organization**: Related settings grouped together
6. **Flexible Timing**: Configurable delays for auto-proceed flows

## Implementation Details

### Database Schema
The `UserPreferences` interface has been extended to support both legacy and new formats:

```typescript
export interface UserPreferences {
  useRelayer: boolean;
  useNetwork: 'testnet' | 'mainnet';
  // Legacy confirmation settings (for backward compatibility)
  usePreConfirmFlow?: boolean;
  confirmBehavior?: 'requireClick' | 'autoProceed';
  // Unified confirmation configuration
  confirmationConfig?: {
    showPreConfirm: boolean;
    uiMode: 'native' | 'shadow' | 'embedded' | 'popup';
    behavior: 'requireClick' | 'autoProceed' | 'autoProceedWithDelay';
    autoProceedDelay?: number;
  };
}
```

### Worker Integration
The WASM worker receives the `preConfirm` flag based on the `showPreConfirm` setting:

```typescript
// In signerWorkerManager.ts
preConfirm: this.confirmationConfig.showPreConfirm
```

### UI Mode Handling
The `renderConfirmUI` method handles different UI modes:

```typescript
switch (this.confirmationConfig.uiMode) {
  case 'native':
    return window.confirm(message);
  case 'shadow':
    return mountSecureTxConfirm({...});
  case 'embedded':
    // TODO: Implement embedded UI
  case 'popup':
    // TODO: Implement popup UI
}
```

## Future Enhancements

1. **Embedded UI Mode**: Inline confirmation component
2. **Popup UI Mode**: Sandboxed iframe confirmation
3. **Custom Themes**: Themeable confirmation components
4. **Accessibility**: Enhanced accessibility features
5. **Analytics**: Confirmation flow analytics
6. **A/B Testing**: Easy configuration for testing different flows