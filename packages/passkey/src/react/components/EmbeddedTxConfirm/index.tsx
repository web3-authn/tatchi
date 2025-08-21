import React from 'react';
import type { EmbeddedTxConfirmProps } from '../../types';
import { usePasskeyContext } from '../../context';

/**
 * Global state to track if the embedded component is loaded
 */
let isEmbeddedComponentLoaded = false;
let loadPromise: Promise<void> | null = null;

/**
 * Dynamically load the embedded component host from the SDK bundle
 */
const loadEmbeddedComponent = () => {
  if (isEmbeddedComponentLoaded) {
    return Promise.resolve();
  }

  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    // Check if the custom element is already defined
    if (customElements.get('embedded-tx-confirm-host')) {
      isEmbeddedComponentLoaded = true;
      resolve();
      return;
    }

    // Dynamically load the host component bundle
    const script = document.createElement('script');
    script.type = 'module';
    script.src = '/sdk/embedded/embedded-tx-confirm-host.js';
    script.onload = () => {
      isEmbeddedComponentLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load embedded component bundle'));
    document.head.appendChild(script);
  });

  return loadPromise;
};

/**
 * React wrapper around the Lit `embedded-tx-confirm-host` component.
 * Much cleaner implementation that delegates iframe management to Lit.
 */
export const EmbeddedTxConfirm: React.FC<EmbeddedTxConfirmProps & {
  color?: string;
  buttonStyle?: React.CSSProperties;
  buttonHoverStyle?: React.CSSProperties;
  tooltipStyle?: {
    width: string;
    height: string;
    position: 'top' | 'bottom' | 'left' | 'right';
    offset: string
  };
}> = ({
  nearAccountId,
  actionArgs,
  actionOptions,
  // Optional customizations
  color = '#667eea',
  buttonStyle,
  buttonHoverStyle,
  tooltipStyle = {
    width: '280px',
    height: '300px',
    position: 'top',
    offset: '8px'
  },
  // Behavioral props
  onCancel,
  onSuccess,
  onError,
  showLoading,
}) => {

  const hostRef = React.useRef<any>(null);
  const { passkeyManager } = usePasskeyContext();

  // Load the component bundle on mount
  React.useEffect(() => {
    loadEmbeddedComponent()
      .catch((err) => console.error('Failed to load embedded component:', err));
  }, []);

  // Update the host component when props change
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Set properties on the Lit component
    host.nearAccountId = nearAccountId;
    host.actionArgs = actionArgs;
    host.color = color;
    host.buttonStyle = buttonStyle;
    host.buttonHoverStyle = buttonHoverStyle;
    host.tooltipStyle = tooltipStyle;
    host.showLoading = showLoading;
    host.actionOptions = actionOptions;
    host.passkeyManagerContext = passkeyManager.getContext();

    // Set event handlers
    host.onSuccess = onSuccess;
    host.onError = onError;
    host.onCancel = onCancel;
  }, [
    nearAccountId,
    actionArgs,
    color,
    buttonStyle,
    buttonHoverStyle,
    tooltipStyle,
    showLoading,
    actionOptions,
    passkeyManager,
    onSuccess,
    onError,
    onCancel
  ]);

  return React.createElement('embedded-tx-confirm-host', {
    ref: hostRef,
    key: 'embedded-tx-confirm-host' // Stable key to prevent re-creation
  });
};

export default EmbeddedTxConfirm;


