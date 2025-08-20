import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { usePasskeyContext } from '../context';
import type { ActionArgs } from '../../core/types/actions';
import type { ActionHooksOptions, ActionResult } from '../../core/types/passkeyManager';
import type { AccountId } from '../../core/types/accountIds';
import { executeActionInternal } from '../../core/PasskeyManager/actions';
import { toAccountId } from '../../core/types/accountIds';

export interface EmbeddedTxConfirmProps {
  /** NEAR account ID */
  nearAccountId: string;
  /** Action arguments (single action or array of actions) */
  actionArgs: ActionArgs | ActionArgs[];
  /** Iframe source URL */
  iframeSrc?: string;
  /** Component size configuration */
  size?: {
    /** Width of the button placeholder (default: '180px') */
    width?: string | number;
    /** Height of the button placeholder (default: '40px') */
    height?: string | number;
  };
  /** Button color theme (default: '#667eea') */
  color?: string;
  /** Arbitrary CSS styles for the button (overrides default styles) */
  buttonStyle?: React.CSSProperties;
  /** Arbitrary CSS styles for the button hover state */
  buttonHoverStyle?: React.CSSProperties;
  /** Callback when user confirms - same signature as executeAction */
  onConfirm?: (nearAccountId: AccountId, actionArgs: ActionArgs | ActionArgs[], options?: ActionHooksOptions) => Promise<ActionResult>;
  /** Callback when user cancels */
  onCancel?: () => void;
  /** Loading state */
  loading?: boolean;
  /** Sandbox attributes for the iframe */
  sandbox?: string;
  /** Whether to show loading state during processing */
  showLoading?: boolean;
  /** Callback when transaction is successfully signed */
  onSuccess?: (result: any) => void;
  /** Callback when transaction fails */
  onError?: (error: Error) => void;
  /** Whether to auto-execute the transaction (default: true) */
  autoExecute?: boolean;
  /** Tooltip configuration */
  tooltip?: {
    /** Tooltip width (default: '280px') */
    width?: string;
    /** Tooltip height (default: 'auto') */
    height?: string;
    /** Tooltip max width (default: 'none') */
    maxWidth?: string;
    /** Tooltip max height (default: 'none') */
    maxHeight?: string;
    /** Tooltip min width (default: 'none') */
    minWidth?: string;
    /** Tooltip min height (default: 'none') */
    minHeight?: string;
    /** Tooltip positioning (default: 'top') */
    position?: 'top' | 'bottom' | 'left' | 'right';
    /** Tooltip offset from trigger element (default: '8px') */
    offset?: string;
  };
}

/**
 * Secure embedded transaction confirmation component using a self-contained sandboxed iframe.
 *
 * This component provides maximum security isolation by running the transaction
 * confirmation UI in a separate iframe context with inline HTML content.
 * It communicates with the parent window using postMessage API and doesn't
 * require any external HTML files.
 *
 * The component can be used in two modes:
 * 1. **Auto-execute mode** (default): Automatically executes the transaction when confirmed
 * 2. **Manual mode**: Calls the provided onConfirm callback for custom handling
 *
 * Features:
 * - Self-contained: No external HTML files required
 * - Secure: Sandboxed iframe with restricted permissions
 * - Beautiful UI: Modern, responsive design with loading states
 * - Type-safe: Full TypeScript support
 * - Configurable size: Fixed dimensions with tooltip overflow
 * - Themable: Customizable button color and arbitrary CSS styles
 *
 * ## Size Configuration
 *
 * The component uses a compact button placeholder (specified via the `size` prop) that
 * doesn't interfere with page layout. The iframe is positioned absolutely with a larger
 * size (600x600px) to accommodate the full tooltip while maintaining security by keeping
 * all transaction details within the sandboxed iframe context.
 *
 * ### Message Flow:
 * ```
 * Parent Component → Iframe (postMessage)
 * - SET_TX_DATA: Sends transaction details
 * - SET_LOADING: Updates loading state
 *
 * Iframe → Parent Component (postMessage)
 * - READY: Iframe is loaded and ready
 * - CONFIRM: User clicked confirm button
 * - CANCEL: User clicked cancel button
 * ```
 *
 * ### Security Benefits:
 * - Iframe content is completely isolated from parent page
 * - No direct DOM access between parent and iframe
 * - All communication via postMessage API
 * - Sandboxed with restricted permissions
 * - Prevents XSS attacks and malicious code injection
 *
 * @example
 * ```tsx
 * // Auto-execute mode (recommended)
 * <EmbeddedTxConfirm
 *   nearAccountId="alice.testnet"
 *   actionArgs={{
 *     type: ActionType.FunctionCall,
 *     receiverId: "greeting.testnet",
 *     methodName: "setGreeting",
 *     args: { message: "Hello World" }
 *   }}
 *   color="#2A52BE"
 *   onSuccess={(result) => console.log('Transaction signed:', result)}
 *   onError={(error) => console.error('Transaction failed:', error)}
 *   onCancel={() => console.log('Transaction cancelled')}
 * />
 *
 * // With custom color theme
 * <EmbeddedTxConfirm
 *   nearAccountId="alice.testnet"
 *   actionArgs={{
 *     type: ActionType.FunctionCall,
 *     receiverId: "greeting.testnet",
 *     methodName: "setGreeting",
 *     args: { message: "Hello World" }
 *   }}
 *   color="#10B981"
 *   onSuccess={(result) => console.log('Transaction signed:', result)}
 *   onError={(error) => console.error('Transaction failed:', error)}
 *   onCancel={() => console.log('Transaction cancelled')}
 * />
 *
 * // With custom button styles
 * <EmbeddedTxConfirm
 *   nearAccountId="alice.testnet"
 *   actionArgs={{
 *     type: ActionType.FunctionCall,
 *     receiverId: "greeting.testnet",
 *     methodName: "setGreeting",
 *     args: { message: "Hello World" }
 *   }}
 *   buttonStyle={{
 *     background: 'linear-gradient(45deg, #667eea, #764ba2)',
 *     borderRadius: '25px',
 *     fontSize: '16px',
 *     fontWeight: 'bold',
 *     textTransform: 'uppercase',
 *     letterSpacing: '1px',
 *     boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)'
 *   }}
 *   onSuccess={(result) => console.log('Transaction signed:', result)}
 *   onError={(error) => console.error('Transaction failed:', error)}
 *   onCancel={() => console.log('Transaction cancelled')}
 * />
 *
 * // Manual mode
 * <EmbeddedTxConfirm
 *   nearAccountId="alice.testnet"
 *   actionArgs={{
 *     type: ActionType.FunctionCall,
 *     receiverId: "greeting.testnet",
 *     methodName: "setGreeting",
 *     args: { message: "Hello World" }
 *   }}
 *   autoExecute={false}
 *   onConfirm={(nearAccountId, actionArgs) => {
 *     return executeAction(nearAccountId, actionArgs);
 *   }}
 *   onCancel={() => console.log('Transaction cancelled')}
 * />
 * ```
 */
export const EmbeddedTxConfirm: React.FC<EmbeddedTxConfirmProps> = ({
  nearAccountId,
  actionArgs,
  size = { width: '180px', height: '40px' },
  color = '#667eea',
  buttonStyle,
  buttonHoverStyle,
  onConfirm,
  onCancel,
  loading = false,
  sandbox = 'allow-scripts allow-same-origin allow-forms allow-presentation',
  showLoading = true,
  onSuccess,
  onError,
  autoExecute = true,
  tooltip = {}
}) => {
  const { passkeyManager } = usePasskeyContext();

  // Convert React CSSProperties to CSS string
  const convertStylesToCSS = (styles: React.CSSProperties): string => {
    return Object.entries(styles)
      .map(([key, value]) => {
        // Convert camelCase to kebab-case
        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        return `${cssKey}: ${value};`;
      })
      .join(' ');
  };

  // Generate custom button styles CSS
  const customButtonStyles = buttonStyle ? convertStylesToCSS(buttonStyle) : '';
  const customButtonHoverStyles = buttonHoverStyle ? convertStylesToCSS(buttonHoverStyle) : '';

  // Extract tooltip configuration with defaults
  const tooltipConfig = {
    width: tooltip.width || '280px',
    height: tooltip.height || 'auto',
    maxWidth: tooltip.maxWidth || 'none',
    maxHeight: tooltip.maxHeight || 'none',
    minWidth: tooltip.minWidth || 'none',
    minHeight: tooltip.minHeight || 'none',
    position: tooltip.position || 'top',
    offset: tooltip.offset || '8px'
  };

  // Extract size configuration with defaults
  const sizeConfig = {
    width: typeof size.width === 'number' ? `${size.width}px` : (size.width || '180px'),
    height: typeof size.height === 'number' ? `${size.height}px` : (size.height || '40px')
  };

  // Calculate iframe size based on tooltip dimensions and position
  const calculateIframeSize = () => {
    const buttonWidth = parseInt(sizeConfig.width);
    const buttonHeight = parseInt(sizeConfig.height);
    const tooltipWidth = parseInt(tooltipConfig.width);
    const tooltipHeight = tooltipConfig.height === 'auto' ? 200 : parseInt(tooltipConfig.height);
    const offset = parseInt(tooltipConfig.offset);

    let iframeWidth = buttonWidth;
    let iframeHeight = buttonHeight;

    // Add space for tooltip based on position
    // Iframe is centered on button, so width/height additions extend equally in both directions
    let iframePadding = 16;
    switch (tooltipConfig.position) {
      case 'top':
        // Need double the tooltip height since iframe extends equally top and bottom
        iframeHeight += (tooltipHeight + offset) * 2 + iframePadding;
        iframeWidth = Math.max(iframeWidth, tooltipWidth) + iframePadding;
        break;
      case 'bottom':
        // Need double the tooltip height since iframe extends equally top and bottom
        iframeHeight += (tooltipHeight + offset) * 2 + iframePadding;
        iframeWidth = Math.max(iframeWidth, tooltipWidth) + iframePadding;
        break;
      case 'left':
        // Need double the tooltip width since iframe extends equally left and right
        iframeWidth += (tooltipWidth + offset) * 2 + iframePadding;
        iframeHeight = Math.max(iframeHeight, tooltipHeight) + iframePadding;
        break;
      case 'right':
        // Need double the tooltip width since iframe extends equally left and right
        iframeWidth += (tooltipWidth + offset) * 2 + iframePadding;
        iframeHeight = Math.max(iframeHeight, tooltipHeight) + iframePadding;
        break;
    }

    return {
      width: iframeWidth,
      height: iframeHeight
    };
  };

  const iframeSize = calculateIframeSize();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [isIframeReady, setIsIframeReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);


  // Create inline HTML content for the iframe - memoized to prevent re-renders
  const iframeContent = useMemo(() => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Transaction Confirmation</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: transparent;
          color: #333;
          line-height: 1.6;
          margin: 0;
          padding: 0;
          position: relative;
          width: ${iframeSize.width}px;
          height: ${iframeSize.height}px;
        }

        :root {
          --btn-width: ${sizeConfig.width};
          --btn-height: ${sizeConfig.height};
          --btn-color: ${color};
          --btn-color-hover: ${color}dd;
          --btn-color-shadow: ${color}33;
        }

        .action-list {
          /* Thicker, subtle monochrome animated border */
          --border-angle: 0deg;
          background: linear-gradient(#ffffff, #ffffff) padding-box,
            conic-gradient(
              from var(--border-angle),
              rgba(0, 0, 0, 0.1) 0%,
              rgba(0, 0, 0, 0.5) 25%,
              rgba(0, 0, 0, 0.1) 50%,
              rgba(0, 0, 0, 0.5) 75%,
              rgba(0, 0, 0, 0.1) 100%
            ) border-box;
          border: 1px solid transparent;
          border-radius: 16px;
          height: 100%;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
          position: relative;
          animation: border-angle-rotate 4s infinite linear;
        }

        @property --border-angle {
          syntax: "<angle>";
          initial-value: 0deg;
          inherits: false;
        }

        @keyframes border-angle-rotate {
          from { --border-angle: 0deg; }
          to { --border-angle: 360deg; }
        }

        .action-item {
          padding: 0;
          border-bottom: 1px solid #e2e8f0;
        }

        .action-item:last-child {
          border-bottom: none;
        }

        .action-type {
          font-weight: 600;
          color: #2d3748;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 8px 4px 8px;
        }

        .action-details {
          font-size: 0.8rem;
          color: #4a5568;
          width: 100%;
          overflow: hidden;
        }

        .action-type-badge {
          background: var(--btn-color);
          color: white;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .action-detail {
          padding: 0 0 0 8px;
          margin: 0;
          border-bottom: 1px solid #f1f1f1;
        }

        .action-detail:last-child,
        .action-detail.no-border {
          border-bottom: none;
        }

        .action-detail strong {
          color: #2d3748;
          padding: 0 0 0 8px;
          font-weight: 600;
          white-space: nowrap;
          vertical-align: top;
          width: 1%;
          font-size: 0.75rem;
        }

        .action-detail span {
          padding: 0 0 0 8px;
          vertical-align: top;
          word-break: break-word;
        }

        .action-detail:not(:has(strong)) {
          display: none;
        }

        .code-block {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          background: #f8fafc;
          border-radius: 8px;
          padding: 6px;
          margin-top: 2px;
          white-space: pre-wrap; /* allow wrapping */
          word-break: break-word;
          overflow-wrap: anywhere;
          overflow: auto;
          line-height: 1.35;
          font-size: 0.78rem;
          color: #1f2937;
          max-height: calc(1.35em * 8);
          margin-left: -8px;
          width: calc(100% + 8px);
          box-sizing: content-box;
        }

        .tooltip-container {
          position: relative;
          display: inline-block;
          --tooltip-width: ${tooltipConfig.width};
          --tooltip-height: ${tooltipConfig.height};
          --tooltip-max-width: ${tooltipConfig.maxWidth};
          --tooltip-max-height: ${tooltipConfig.maxHeight};
          --tooltip-min-width: ${tooltipConfig.minWidth};
          --tooltip-offset: ${tooltipConfig.offset};
          z-index: 1001;
          box-sizing: border-box;
          overflow: visible;
          pointer-events: auto;
        }

        .tooltip-content {
          position: absolute;
          background: transparent;
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          border: 1px solid #e2e8f0;
          border-radius: 24px;
          padding: 8px;
          z-index: 1000;
          opacity: 0;
          visibility: hidden;
          height: var(--tooltip-height, auto);
          max-height: var(--tooltip-max-height, none);
          overflow-y: auto;
          transition: all 0.2s ease;
        }

        .tooltip-content.top {
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          margin-bottom: var(--tooltip-offset, 8px);
          min-width: var(--tooltip-min-width, 280px);
          max-width: var(--tooltip-max-width, 320px);
          width: var(--tooltip-width, 280px);
        }

        .tooltip-content.bottom {
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          margin-top: var(--tooltip-offset, 8px);
          min-width: var(--tooltip-min-width, 280px);
          max-width: var(--tooltip-max-width, 320px);
          width: var(--tooltip-width, 280px);
        }

        .tooltip-content.left {
          right: 100%;
          top: 50%;
          transform: translateY(-50%);
          margin-right: var(--tooltip-offset, 8px);
          min-width: var(--tooltip-min-width, 280px);
          max-width: var(--tooltip-max-width, 320px);
          width: var(--tooltip-width, 280px);
        }

        .tooltip-content.right {
          left: 100%;
          top: 50%;
          transform: translateY(-50%);
          margin-left: var(--tooltip-offset, 8px);
          min-width: var(--tooltip-min-width, 280px);
          max-width: var(--tooltip-max-width, 320px);
          width: var(--tooltip-width, 280px);
        }

        .tooltip-container:hover .tooltip-content,
        .tooltip-content.show {
          opacity: 1;
          visibility: visible;
        }

        .buttons {
          display: flex;
          gap: 12px;
          margin-top: 20px;
          justify-content: flex-end;
        }

        .btn {
          flex: 1;
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: none;
        }

        .btn-primary {
          background: var(--btn-color);
          color: white;
          width: 100%;
          height: 100%;
          box-sizing: border-box;
        }

        .btn-primary:hover {
          background: var(--btn-color);
        }

        .btn-secondary {
          background: #e2e8f0;
          color: #4a5568;
        }

        .btn-secondary:hover {
          background: #e2e8f0;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .loading {
          display: none;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: var(--btn-color);
          font-weight: 500;
        }

        .loading.show {
          display: flex;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid #e2e8f0;
          border-top: 2px solid var(--btn-color);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .error {
          background: #fed7d7;
          border: 1px solid #feb2b2;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 16px;
          color: #c53030;
          font-size: 0.9rem;
        }

        .btn-custom {
          ${customButtonStyles}
        }

        .btn-custom:hover {
          ${customButtonHoverStyles}
        }

      </style>
    </head>
    <body>
      <div class="tooltip-container" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: var(--btn-width); height: var(--btn-height);">

        <button class="btn btn-primary${(buttonStyle || buttonHoverStyle) ? ' btn-custom' : ''}"
          id="confirmBtn"
        >
          <span class="loading" id="loading">
            <div class="spinner"></div>
            Processing...
          </span>
          <span id="confirmText">Confirm Transaction</span>
        </button>
        <div class="tooltip-content ${tooltipConfig.position}" id="tooltipContent">
          <div class="action-list" id="actionList">
            <!-- Actions will be populated here -->
          </div>
        </div>
      </div>

      <script>
        let txData = null;

        function escapeHtml(str) {
          return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        }

        // Listen for messages from parent
        window.addEventListener('message', function(event) {
          const { type, payload } = event.data;

          switch (type) {
            case 'SET_TX_DATA':
              txData = payload;
              renderTransactionDetails();
              break;
            case 'SET_LOADING':
              setLoading(payload);
              break;
            case 'SET_ERROR':
              showError(payload);
              break;
          }
        });

        // Send ready message to parent
        window.parent.postMessage({ type: 'READY' }, '*');

        function renderTransactionDetails() {
          if (!txData) return;

          // Render actions in tooltip
          const actionList = document.getElementById('actionList');
          if (!actionList) {
            console.error('Action list element not found');
            return;
          }
          actionList.innerHTML = '';

          const actions = Array.isArray(txData.actionArgs) ? txData.actionArgs : [txData.actionArgs];

          actions.forEach((action, index) => {
            const actionItem = document.createElement('div');
            actionItem.className = 'action-item';

            let actionHtml = \`
              <div class="action-type">
                <span class="action-type-badge">\${action.type}</span>
                Action \${index + 1}
              </div>
              <div class="action-details">
            \`;

            if (action.type === 'FunctionCall') {
              actionHtml += \`
                <div class="action-detail"><strong>Receiver</strong><span>\${action.receiverId}</span></div>
                <div class="action-detail"><strong>Method</strong><span>\${action.methodName}</span></div>
                <div class="action-detail"><strong>Gas</strong><span>\${action.gas || 'Not specified'}</span></div>
                <div class="action-detail"><strong>Deposit</strong><span>\${action.deposit || '0'}</span></div>
                <div class="action-detail no-border"><strong>Arguments</strong><span><pre class="code-block"><code>\${escapeHtml(JSON.stringify(action.args, null, 2))}</code></pre></span></div>
              \`;
            } else if (action.type === 'Transfer') {
              actionHtml += \`
                <div class="action-detail"><strong>Receiver</strong><span>\${action.receiverId}</span></div>
                <div class="action-detail"><strong>Amount</strong><span>\${action.amount}</span></div>
              \`;
            } else if (action.type === 'Stake') {
              actionHtml += \`
                <div class="action-detail"><strong>Public Key</strong><span>\${action.publicKey}</span></div>
                <div class="action-detail"><strong>Amount</strong><span>\${action.amount}</span></div>
              \`;
            } else if (action.type === 'AddKey') {
              actionHtml += \`
                <div class="action-detail"><strong>Public Key</strong><span>\${action.publicKey}</span></div>
                <div class="action-detail"><strong>Access Key</strong><span>\${JSON.stringify(action.accessKey, null, 2)}</span></div>
              \`;
            } else if (action.type === 'DeleteKey') {
              actionHtml += \`
                <div class="action-detail"><strong>Public Key</strong><span>\${action.publicKey}</span></div>
              \`;
            } else if (action.type === 'DeleteAccount') {
              actionHtml += \`
                <div class="action-detail"><strong>Beneficiary</strong><span>\${action.beneficiaryId}</span></div>
              \`;
            }

            actionHtml += '</div>';
            actionItem.innerHTML = actionHtml;
            actionList.appendChild(actionItem);
          });


        }

        function setLoading(loading) {
          const confirmBtn = document.getElementById('confirmBtn');
          const loadingEl = document.getElementById('loading');
          const confirmText = document.getElementById('confirmText');

          if (confirmBtn) {
            confirmBtn.disabled = loading;
          }

          if (loadingEl) {
            if (loading) {
              loadingEl.classList.add('show');
            } else {
              loadingEl.classList.remove('show');
            }
          }

          if (confirmText) {
            confirmText.style.display = loading ? 'none' : 'inline';
          }
        }

        function showError(message) {
          const errorEl = document.getElementById('error');
          if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
          }
        }

        // Button event listeners
        const confirmBtn = document.getElementById('confirmBtn');

        if (confirmBtn) {
          confirmBtn.addEventListener('click', function() {
            window.parent.postMessage({ type: 'CONFIRM' }, '*');
          });

          confirmBtn.addEventListener('mouseleave', function() {
            window.parent.postMessage({ type: 'MOUSE_LEAVE' }, '*');
          });
        }
      </script>
    </body>
    </html>
  `, [
    color,
    customButtonStyles,
    customButtonHoverStyles,
    iframeSize.width,
    iframeSize.height,
    sizeConfig.width,
    sizeConfig.height,
    tooltipConfig.width,
    tooltipConfig.height,
    tooltipConfig.maxWidth,
    tooltipConfig.maxHeight,
    tooltipConfig.minWidth,
    tooltipConfig.minHeight,
    tooltipConfig.position,
    tooltipConfig.offset
  ]);

  // Create data URL for iframe - memoized to prevent re-renders
  const iframeSrc = useMemo(() => `data:text/html;charset=utf-8,${encodeURIComponent(iframeContent)}`, [iframeContent]);

  // Set current request ID (called by SignerWorkerManager)
  const setRequestId = useCallback((requestId: string) => {
    console.log('[EmbeddedTxConfirm]: Setting request ID:', requestId);
    setCurrentRequestId(requestId);
  }, []);



  // Expose setRequestId method to window for SignerWorkerManager to call
  useEffect(() => {
    (window as any).setEmbeddedTxConfirmRequestId = setRequestId;
    return () => {
      delete (window as any).setEmbeddedTxConfirmRequestId;
    };
  }, [setRequestId]);

  // Auto-execute transaction handler (only used when autoExecute is true and not in embedded mode)
  const handleAutoExecute = useCallback(async () => {
    if (!autoExecute || !passkeyManager) return;

    try {
      setIsExecuting(true);
      setError(null);

      console.log('[EmbeddedTxConfirm]: Auto-executing transaction:', { nearAccountId, actionArgs });

      // Execute the action using internal API with embedded override
      const result = await executeActionInternal(
        passkeyManager.getContext(),
        toAccountId(nearAccountId),
        actionArgs,
        {
          onError,
          hooks: {
            beforeCall: () => setIsExecuting(true),
            afterCall: (success) => {
              setIsExecuting(false);
              if (success && onSuccess) {
                onSuccess(result);
              }
            }
          }
        },
        {
          uiMode: 'embedded',
          behavior: 'autoProceed',
          autoProceedDelay: 0
        }
      );

      console.log('[EmbeddedTxConfirm]: Transaction executed successfully:', result);

      if (onSuccess) {
        onSuccess(result);
      }
    } catch (error) {
      console.error('[EmbeddedTxConfirm]: Transaction failed:', error);
      setError(error instanceof Error ? error.message : 'Transaction failed');

      if (onError) {
        onError(error as Error);
      }
    } finally {
      setIsExecuting(false);
    }
  }, [autoExecute, passkeyManager, nearAccountId, actionArgs, onSuccess, onError]);

  // Embedded transaction execution handler (always executes when user confirms in iframe)
  const handleEmbeddedExecute = useCallback(async () => {
    if (!passkeyManager) return;

    try {
      setIsExecuting(true);
      setError(null);

      console.log('[EmbeddedTxConfirm]: Executing embedded transaction:', { nearAccountId, actionArgs });

      // Execute the action using internal API with embedded override
      const result = await executeActionInternal(
        passkeyManager.getContext(),
        toAccountId(nearAccountId),
        actionArgs,
        {
          onError,
          hooks: {
            beforeCall: () => setIsExecuting(true),
            afterCall: (success) => {
              setIsExecuting(false);
              if (success && onSuccess) {
                onSuccess(result);
              }
            }
          }
        },
        {
          uiMode: 'embedded',
          behavior: 'autoProceed',
          autoProceedDelay: 0
        }
      );

      console.log('[EmbeddedTxConfirm]: Embedded transaction executed successfully:', result);

      if (onSuccess) {
        onSuccess(result);
      }
    } catch (error) {
      console.error('[EmbeddedTxConfirm]: Embedded transaction failed:', error);
      setError(error instanceof Error ? error.message : 'Transaction failed');

      if (onError) {
        onError(error as Error);
      }
    } finally {
      setIsExecuting(false);
    }
  }, [passkeyManager, nearAccountId, actionArgs, onSuccess, onError]);

  // Handle messages from iframe
  const handleIframeMessage = useCallback((event: MessageEvent) => {
    // Verify the message is from our iframe
    if (event.source !== iframeRef.current?.contentWindow) {
      return;
    }

    const { type, payload } = event.data;

    switch (type) {
      case 'CONFIRM':
        console.log('[EmbeddedTxConfirm]: User confirmed transaction in iframe - executing transaction');

        // Execute the transaction using the passkeyManager
        // The embedded mode will auto-confirm and proceed directly to TouchID
        handleEmbeddedExecute();
        break;
      case 'CANCEL':
        if (onCancel) {
          onCancel();
        }
        break;
      case 'MOUSE_LEAVE':
        console.log('[EmbeddedTxConfirm]: Mouse left confirm button');
        if (iframeRef.current) {
          iframeRef.current.style.pointerEvents = 'none';
        }
        break;
      case 'ERROR':
        setError(payload?.message || 'Unknown error occurred');
        break;
      case 'READY':
        setIsIframeReady(true);
        break;

      default:
        console.warn('Unknown message type from iframe:', type);
    }
  }, [autoExecute, onConfirm, onCancel, nearAccountId, actionArgs, handleAutoExecute, handleEmbeddedExecute, currentRequestId]);

  // Set up message listener
  useEffect(() => {
    window.addEventListener('message', handleIframeMessage);
    return () => {
      window.removeEventListener('message', handleIframeMessage);
    };
  }, [handleIframeMessage]);

  // Do NOT mutate global confirmation config; we override per call
  // by passing a confirmationConfigOverride to executeAction
  useEffect(() => {
    console.log('[EmbeddedTxConfirm]: Embedded mode will override confirmation config per call');
  }, [passkeyManager]);

  // Listen for embedded transaction success events
  useEffect(() => {
    const handleEmbeddedSuccess = (event: CustomEvent) => {
      const { requestId } = event.detail;
      if (requestId === currentRequestId) {
        console.log('[EmbeddedTxConfirm]: Transaction confirmed by WASM worker');
        // The transaction is now being processed by the WASM worker
        // Show loading state
        setIsExecuting(true);
      }
    };

    window.addEventListener('embedded-tx-success', handleEmbeddedSuccess as any);
    return () => {
      window.removeEventListener('embedded-tx-success', handleEmbeddedSuccess as any);
    };
  }, [currentRequestId]);

        // Send transaction data to iframe when ready
      useEffect(() => {
        if (isIframeReady && iframeRef.current) {
          const transactionData = { nearAccountId, actionArgs };
          console.log('[EmbeddedTxConfirm]: Sending transaction data to iframe:', transactionData);

          iframeRef.current.contentWindow?.postMessage({
            type: 'SET_TX_DATA',
            payload: transactionData
          }, '*');
        }
      }, [isIframeReady, nearAccountId, actionArgs]);

  // Send loading state to iframe
  useEffect(() => {
    if (isIframeReady && iframeRef.current) {
      const isLoading = loading || (showLoading && isExecuting);
      iframeRef.current.contentWindow?.postMessage({
        type: 'SET_LOADING',
        payload: isLoading
      }, '*');
    }
  }, [isIframeReady, loading, showLoading, isExecuting]);

  // Handle iframe load
  const handleIframeLoad = useCallback(() => {
    // Send ready message to iframe
    if (iframeRef.current) {
      iframeRef.current.contentWindow?.postMessage({
        type: 'PARENT_READY'
      }, '*');
    }
  }, []);

  // Handle iframe error
  const handleIframeError = useCallback(() => {
    setError('Failed to load transaction confirmation interface');
  }, []);

  return (
    <>
      {error && (
        <div style={{
          background: '#fed7d7',
          color: '#c53030',
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '12px',
          border: '1px solid #feb2b2'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="button-placeholder"
        style={{
          width: sizeConfig.width,
          height: sizeConfig.height,
          position: 'relative',
          display: 'inline-block',
          cursor: 'pointer',
          zIndex: 1001, // above iframe
        }}
        onMouseEnter={() => {
          console.log("onMouseEnter");
          if (iframeRef.current) {
            iframeRef.current.style.pointerEvents = 'auto';
          }
        }}
        // onMouseLeave={}
        // We put the onMouseLeave function on the button in the iframe, because
        // onMouseEnter sets pointerEvents=auto on the iframe, so the iframe will block
        // onMouseLeave on the button-placeholder, it must be places on the button in the iframe.
        // so it's on a higher layer than the iframe.
      >
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          width={iframeSize.width}
          height={iframeSize.height}
          sandbox={sandbox}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            border: 'none',
            borderRadius: '0',
            backgroundColor: 'transparent',
            zIndex: 1000,
          }}
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          title="Transaction Confirmation"
          loading="lazy"
        />
      </div>

      {!isIframeReady && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '8px',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#4a5568',
            fontSize: '14px'
          }}>
            <div style={{
              width: '16px',
              height: '16px',
              border: '2px solid #4a5568',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            Loading transaction confirmation...
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};

export default EmbeddedTxConfirm;
