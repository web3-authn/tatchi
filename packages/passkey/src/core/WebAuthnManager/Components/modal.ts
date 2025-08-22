// Import types and components needed for mount functions
import {
  ModalTxConfirmElement,
  activeResolvers,
  type ConfirmRenderMode,
  type ConfirmVariant,
  type SecureTxSummary,
  type TxAction
} from './ModalTxConfirmElement';

// Granular exports for ModalTxConfirmElement
export {
  ModalTxConfirmElement,
  activeResolvers
} from './ModalTxConfirmElement';

export type {
  ConfirmRenderMode,
  ConfirmVariant,
  SecureTxSummary,
  TxAction
} from './ModalTxConfirmElement';

/**
 * Mounts a modal transaction confirmation dialog using Lit and closed Shadow DOM.
 * Returns a promise that resolves to true if confirmed, false if cancelled.
 */
export function mountModalTxConfirm(opts: {
  container?: HTMLElement | null;
  summary: SecureTxSummary;
  actions?: TxAction[];
  actionsJson?: string;
  mode?: ConfirmRenderMode;
  variant?: ConfirmVariant;
  title?: string;
  cancelText?: string;
  confirmText?: string;
  theme?: Record<string, string>;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const attachRoot = opts.container ?? document.body;

    // Remove any existing instance
    const existing = attachRoot.querySelector('passkey-modal-confirm');
    if (existing) {
      existing.remove();
    }

    // Create new Lit element
    const element = new ModalTxConfirmElement();

    // Store the resolver in WeakMap
    activeResolvers.set(element, resolve);

    // Set properties (Lit automatically handles reactivity)
    element.mode = opts.mode ?? 'modal';
    element.variant = opts.variant ?? 'default';
    element.to = opts.summary?.to ?? '';
    element.amount = opts.summary?.amount ?? '';
    element.method = opts.summary?.method ?? '';
    element.fingerprint = opts.summary?.fingerprint ?? '';
    element.title = opts.title ?? 'Confirm Transaction';
    element.cancelText = opts.cancelText ?? 'Cancel';
    element.confirmText = opts.confirmText ?? 'Confirm & Sign';

    // Handle actions - prefer structured actions over JSON
    if (opts.actions) {
      element.actions = opts.actions;
    } else if (opts.actionsJson) {
      try {
        const parsed = JSON.parse(opts.actionsJson);
        element.actions = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // Fallback to empty array if JSON parsing fails
        element.actions = [];
      }
    }

    // Apply custom theme if provided
    if (opts.theme) {
      Object.entries(opts.theme).forEach(([k, v]) => {
        element.style.setProperty(k, v);
      });
    }

    // Append to DOM - this triggers Lit's lifecycle
    attachRoot.appendChild(element);
  });
}

/**
 * Mounts a modal confirmation UI and returns a handle to programmatically close it.
 * Does not return a Promise; caller is responsible for calling close(confirmed) when appropriate.
 *
 * Used in signerWorkerManager.ts to programmatically close the confirmation dialog
 * after TouchID prompt succeeds.
 */
export function mountModalTxConfirmWithHandle(opts: {
  container?: HTMLElement | null;
  summary: SecureTxSummary;
  actions?: TxAction[];
  actionsJson?: string;
  mode?: ConfirmRenderMode;
  variant?: ConfirmVariant;
  title?: string;
  cancelText?: string;
  confirmText?: string;
  theme?: Record<string, string>;
  loading?: boolean;
}): { element: ModalTxConfirmElement; close: (confirmed: boolean) => void } {
  const attachRoot = opts.container ?? document.body;

  const existing = attachRoot.querySelector('passkey-confirm');
  if (existing) {
    existing.remove();
  }

  const element = new ModalTxConfirmElement();
  // Store a no-op resolver by default; will be replaced if consumer also calls mountModalTxConfirm
  activeResolvers.set(element as unknown as HTMLElement, () => {});

  element.mode = opts.mode ?? 'modal';
  element.variant = opts.variant ?? 'default';
  element.to = opts.summary?.to ?? '';
  element.amount = opts.summary?.amount ?? '';
  element.method = opts.summary?.method ?? '';
  element.fingerprint = opts.summary?.fingerprint ?? '';
  element.title = opts.title ?? 'Confirm Transaction';
  element.cancelText = opts.cancelText ?? 'Cancel';
  element.confirmText = opts.confirmText ?? 'Confirm & Sign';
  element.loading = opts.loading ?? false;

  if (opts.actions) {
    element.actions = opts.actions;
  } else if (opts.actionsJson) {
    try {
      const parsed = JSON.parse(opts.actionsJson);
      element.actions = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      element.actions = [];
    }
  }

  if (opts.theme) {
    Object.entries(opts.theme).forEach(([k, v]) => {
      element.style.setProperty(k, v);
    });
  }

  attachRoot.appendChild(element);

  const close = (confirmed: boolean) => {
    const resolve = activeResolvers.get(element as unknown as HTMLElement);
    if (resolve) {
      try { resolve(confirmed); } catch {}
      activeResolvers.delete(element as unknown as HTMLElement);
    }
    element.remove();
  };

  return { element, close };
}
