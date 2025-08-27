import React, { useState, useEffect } from 'react';
import type { SecureTxConfirmButtonProps } from '../types';
import { usePasskeyContext } from '../context';
import { IFRAME_BUTTON_ID } from '../../core/types/components';

/**
 * React wrapper around the Lit `iframe-button` component.
 * Much cleaner implementation that delegates iframe management to Lit.
 */
export const SecureTxConfirmButton: React.FC<SecureTxConfirmButtonProps & {
  color?: string;
  buttonStyle?: React.CSSProperties;
  buttonHoverStyle?: React.CSSProperties;
  tooltipStyle?: {
    width: string;
    height: string;
    position: 'left' | 'right'
      | 'top-left' | 'top-center' | 'top-right'
      | 'bottom-left' | 'bottom-center' | 'bottom-right';
    offset: string
  };
}> = ({
  nearAccountId,
  txSigningRequests,
  options,
  // Optional customizations
  color = '#667eea',
  buttonStyle,
  buttonHoverStyle,
  tooltipStyle = {
    width: '280px',
    height: '300px',
    position: 'top-center',
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
  const prevTooltipStyleRef = React.useRef(tooltipStyle);
  const [isComponentLoaded, setIsComponentLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load the component bundle on mount
  useEffect(() => {
    let loadPromise: Promise<void> | null = null;

    const loadEmbeddedComponent = () => {
      // Check if the custom element is already defined
      if (customElements.get(IFRAME_BUTTON_ID)) {
        setIsComponentLoaded(true);
        return Promise.resolve();
      }

      if (loadPromise) return loadPromise;

      loadPromise = new Promise((resolve, reject) => {
        // Dynamically load the host component bundle
        const script = document.createElement('script');
        script.type = 'module';
        script.src = `/sdk/embedded/${IFRAME_BUTTON_ID}.js`;
        script.onload = () => {
          setIsComponentLoaded(true);
          resolve();
        };
        script.onerror = () => {
          const error = new Error('Failed to load embedded component bundle');
          setLoadError(error.message);
          reject(error);
        };
        document.head.appendChild(script);
      });

      return loadPromise;
    };

    loadEmbeddedComponent()
      .catch((err: Error) => {
        console.error('Failed to load embedded component:', err);
        setLoadError(err.message);
      });
  }, []);

  // Update the host component when props change
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Check if tooltipStyle changed significantly (requires iframe re-render)
    const tooltipStyleChanged = JSON.stringify(prevTooltipStyleRef.current) !== JSON.stringify(tooltipStyle);
    prevTooltipStyleRef.current = tooltipStyle;

    // Set properties on the Lit component using Lit setters
    host.txSigningRequests = txSigningRequests;
    host.buttonStyle = buttonStyle;
    host.buttonHoverStyle = buttonHoverStyle;
    host.tooltipStyle = tooltipStyle;
    host.options = options;
    host.passkeyManagerContext = passkeyManager.getContext();

    // Set event handlers (these don't trigger updates)
    host.onSuccess = onSuccess;
    host.onError = onError;
    host.onCancel = onCancel;

    // If tooltipStyle changed, force iframe re-initialization for proper sizing/positioning
    if (tooltipStyleChanged && host.forceIframeReinitialize) {
      console.debug('[SecureTxConfirmButton] Tooltip style changed, forcing iframe re-initialization');
      host.forceIframeReinitialize();
    }

  }, [
    txSigningRequests,
    buttonStyle,
    buttonHoverStyle,
    tooltipStyle,
    options,
    passkeyManager,
    onSuccess,
    onError,
    onCancel
  ]);

  return React.createElement(IFRAME_BUTTON_ID, {
    ref: hostRef,
    key: IFRAME_BUTTON_ID, // Stable key to prevent re-creation
    // Pass props as attributes - Lit will automatically handle property conversion
    'near-account-id': nearAccountId,
    'color': color,
    'show-loading': showLoading,
    // Complex objects still need to be set via properties in useEffect
  });
};

export default SecureTxConfirmButton;


