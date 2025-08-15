import { SecureTxConfirmElement, activeResolvers, type ConfirmRenderMode, type ConfirmVariant, type SecureTxSummary, type TxAction } from './SecureTxConfirmElement';

/**
 * Mounts a secure transaction confirmation dialog using Lit and closed Shadow DOM.
 * Returns a promise that resolves to true if confirmed, false if cancelled.
 */
export function mountSecureTxConfirm(opts: {
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
    const existing = attachRoot.querySelector('passkey-confirm');
    if (existing) {
      existing.remove();
    }

    // Create new Lit element
    const element = new SecureTxConfirmElement();

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
 * Mounts a secure confirmation UI and returns a handle to programmatically close it.
 * Does not return a Promise; caller is responsible for calling close(confirmed) when appropriate.
 *
 * Used in signerWorkerManager.ts to programmatically close the confirmation dialog
 * after TouchID prompt succeeds.
 */
export function mountSecureTxConfirmWithHandle(opts: {
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
}): { element: SecureTxConfirmElement; close: (confirmed: boolean) => void } {
  const attachRoot = opts.container ?? document.body;

  const existing = attachRoot.querySelector('passkey-confirm');
  if (existing) {
    existing.remove();
  }

  const element = new SecureTxConfirmElement();
  // Store a no-op resolver by default; will be replaced if consumer also calls mountSecureTxConfirm
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

/**
 * Helper functions for creating different UI variants
 */
export const SecureTxConfirm = {
  /**
   * Show as inline component (embedded in page)
   */
  inline(opts: Omit<Parameters<typeof mountSecureTxConfirm>[0], 'mode'>) {
    return mountSecureTxConfirm({ ...opts, mode: 'inline' });
  },

  /**
   * Show as modal dialog (overlay with backdrop)
   */
  modal(opts: Omit<Parameters<typeof mountSecureTxConfirm>[0], 'mode'>) {
    return mountSecureTxConfirm({ ...opts, mode: 'modal' });
  },

  /**
   * Show as fullscreen dialog
   */
  fullscreen(opts: Omit<Parameters<typeof mountSecureTxConfirm>[0], 'mode'>) {
    return mountSecureTxConfirm({ ...opts, mode: 'fullscreen' });
  },

  /**
   * Show as toast notification (top-right corner)
   */
  toast(opts: Omit<Parameters<typeof mountSecureTxConfirm>[0], 'mode'>) {
    return mountSecureTxConfirm({ ...opts, mode: 'toast' });
  },

  /**
   * Show with warning variant (yellow/amber styling)
   */
  warning(opts: Omit<Parameters<typeof mountSecureTxConfirm>[0], 'variant'>) {
    return mountSecureTxConfirm({ ...opts, variant: 'warning' });
  },

  /**
   * Show with danger variant (red styling for high-risk transactions)
   */
  danger(opts: Omit<Parameters<typeof mountSecureTxConfirm>[0], 'variant'>) {
    return mountSecureTxConfirm({ ...opts, variant: 'danger' });
  }
};

// Re-export the component and types for convenience
export {
  SecureTxConfirmElement,
  type ConfirmRenderMode,
  type ConfirmVariant,
  type SecureTxSummary,
  type TxAction
};