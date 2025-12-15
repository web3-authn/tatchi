import { html, type PropertyValues } from 'lit';
import { createRef, Ref, ref } from 'lit/directives/ref.js';
import { LitElementWithProps } from '../LitElementWithProps';
import type { ConfirmUIElement, ThemeName } from '../confirm-ui-types';
import { WalletIframeDomEvents } from '../../../WalletIframe/events';
import type { TransactionInputWasm, VRFChallenge } from '../../../types';
import { computeUiIntentDigestFromTxs, orderActionForDigest } from '../../txDigest';
import { isActionArgsWasm, toActionArgsWasm, type ActionArgs, type ActionArgsWasm } from '@/core/types/actions';
import { isObject, isString } from '../../../WalletIframe/validation';
import { W3A_TX_CONFIRMER_ID } from '../tags';
import { DrawerTxConfirmerElement } from './viewer-drawer';
import { ModalTxConfirmElement } from './viewer-modal';

const DEFAULT_VARIANT: Variant = 'modal';

export type Variant = 'modal' | 'drawer';

export type TxConfirmerVariantElement = (ConfirmUIElement & HTMLElement) & {
  nearAccountId?: string;
  txSigningRequests?: TransactionInputWasm[];
  vrfChallenge?: VRFChallenge;
  theme?: ThemeName;
  loading?: boolean;
  errorMessage?: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  deferClose?: boolean;
  requestUpdate?: () => void;
  close?: (confirmed: boolean) => void;
};

function isTransactionInput(candidate: unknown): candidate is TransactionInputWasm {
  if (!isObject(candidate)) return false;
  const record = candidate as Record<string, unknown>;
  const receiver = record.receiverId;
  const actions = record.actions;
  return isString(receiver) && Array.isArray(actions);
}

/**
 * Thin wrapper that renders the modal or drawer confirmer inline instead of
 * inside a nested iframe. It forwards props to the active variant element,
 * performs intent digest validation, and re-emits canonical events.
 */
export class TxConfirmerWrapperElement extends LitElementWithProps {
  static properties = {
    variant: { type: String, reflect: true },
    nearAccountId: { type: String, attribute: 'near-account-id' },
    txSigningRequests: { type: Array },
    vrfChallenge: { type: Object },
    theme: { type: String },
    loading: { type: Boolean },
    errorMessage: { type: String, attribute: 'error-message' },
    intentDigest: { type: String, attribute: 'intent-digest' },
    title: { type: String },
    confirmText: { type: String, attribute: 'confirm-text' },
    cancelText: { type: String, attribute: 'cancel-text' },
    deferClose: { type: Boolean, attribute: 'defer-close' },
    nearExplorerUrl: { type: String, attribute: 'near-explorer-url' },
    delegateMeta: { type: Object },
  } as const;

  static keepDefinitions = [ModalTxConfirmElement, DrawerTxConfirmerElement];

  declare variant: Variant;
  declare nearAccountId: string;
  declare txSigningRequests: TransactionInputWasm[];
  declare vrfChallenge?: VRFChallenge;
  declare theme: ThemeName;
  declare loading: boolean;
  declare errorMessage?: string;
  declare intentDigest?: string;
  declare title: string;
  declare confirmText: string;
  declare cancelText: string;
  declare deferClose: boolean;
  declare nearExplorerUrl?: string;
  declare delegateMeta?: Record<string, unknown>;

  private readonly childRef: Ref<TxConfirmerVariantElement> = createRef();
  private redispatchingEvent = false;
  private currentChild: TxConfirmerVariantElement | null = null;
  private boundConfirmListener = (event: Event) => { void this.handleChildConfirm(event); };
  private boundCancelListener = (_event: Event) => { this.handleChildCancel(); };

  constructor() {
    super();
    this.variant = DEFAULT_VARIANT;
    this.nearAccountId = '';
    this.txSigningRequests = [];
    this.theme = 'dark';
    this.loading = false;
    this.deferClose = true;
    this.title = 'Confirm with Passkey';
    this.confirmText = 'Confirm';
    this.cancelText = 'Cancel';
  }

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    // Render into light DOM so the variant element controls stacking/context.
    return this;
  }

  protected updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    this.syncChildProps();
    if (changed.has('errorMessage')) {
      this.syncErrorAttribute();
    }
  }

  render() {
    const variant = this.variant === 'drawer' ? 'drawer' : 'modal';

    if (variant === 'drawer') {
      return html`
        <w3a-drawer-tx-confirmer
          ${ref(this.childRef)}
          .nearAccountId=${this.nearAccountId}
          .txSigningRequests=${this.txSigningRequests}
          .vrfChallenge=${this.vrfChallenge}
          .theme=${this.theme}
          .nearExplorerUrl=${this.nearExplorerUrl}
          .loading=${this.loading}
          .errorMessage=${this.errorMessage || ''}
          .title=${this.title}
          .confirmText=${this.confirmText}
          .cancelText=${this.cancelText}
          .deferClose=${this.deferClose}
          .delegateMeta=${this.delegateMeta}
        ></w3a-drawer-tx-confirmer>
      `;
    }

    return html`
      <w3a-modal-tx-confirmer
        ${ref(this.childRef)}
        .nearAccountId=${this.nearAccountId}
        .txSigningRequests=${this.txSigningRequests}
        .vrfChallenge=${this.vrfChallenge}
        .theme=${this.theme}
        .loading=${this.loading}
        .errorMessage=${this.errorMessage || ''}
        .title=${this.title}
        .confirmText=${this.confirmText}
        .cancelText=${this.cancelText}
        .deferClose=${this.deferClose}
        .delegateMeta=${this.delegateMeta}
      ></w3a-modal-tx-confirmer>
    `;
  }

  private syncChildProps(): void {
    const child = this.childRef.value;
    if (!child) return;
    child.nearAccountId = this.nearAccountId;
    child.txSigningRequests = this.txSigningRequests;
    child.vrfChallenge = this.vrfChallenge;
    child.theme = this.theme;
    child.loading = this.loading;
    child.errorMessage = this.errorMessage;
    child.title = this.title;
    child.confirmText = this.confirmText;
    child.cancelText = this.cancelText;
    child.deferClose = this.deferClose;
    (child as any).nearExplorerUrl = this.nearExplorerUrl;
    (child as any).delegateMeta = this.delegateMeta;
    child.requestUpdate?.();
    this.attachChildListeners();
  }

  private syncErrorAttribute(): void {
    if (this.errorMessage) {
      this.setAttribute('data-error-message', this.errorMessage);
    } else {
      this.removeAttribute('data-error-message');
    }
  }

  private attachChildListeners(): void {
    const child = this.childRef.value;
    if (!child || child === this.currentChild) return;
    if (this.currentChild) {
      this.detachChildListeners();
    }
    child.addEventListener(WalletIframeDomEvents.TX_CONFIRMER_CONFIRM, this.boundConfirmListener as EventListener);
    child.addEventListener(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, this.boundCancelListener as EventListener);
    this.currentChild = child;
  }

  private detachChildListeners(): void {
    if (!this.currentChild) return;
    this.currentChild.removeEventListener(WalletIframeDomEvents.TX_CONFIRMER_CONFIRM, this.boundConfirmListener as EventListener);
    this.currentChild.removeEventListener(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, this.boundCancelListener as EventListener);
    this.currentChild = null;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.detachChildListeners();
    // Remove capture-phase fallback listener
    this.removeEventListener(WalletIframeDomEvents.TX_CONFIRMER_CONFIRM, this.boundConfirmListener as EventListener, { capture: true } as any);
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Capture-phase fallback: ensure we catch early CONFIRM events even if child listeners
    // are not yet attached due to rendering/refs timing.
    this.addEventListener(
      WalletIframeDomEvents.TX_CONFIRMER_CONFIRM,
      this.boundConfirmListener as EventListener,
      { capture: true } as any
    );
  }

  private handleChildCancel(): void {
    if (this.loading) {
      this.loading = false;
      this.syncChildProps();
    }
  }

  private async handleChildConfirm(event: Event): Promise<void> {
    if (this.redispatchingEvent) return;
    const child = this.childRef.value;
    let confirmed = true;
    let error: string | undefined;

    this.redispatchingEvent = true;
    try {
      event.stopImmediatePropagation();
      console.debug('[TxConfirmerWrapper] CONFIRM received', { hasIntent: !!this.intentDigest, txCount: (this.txSigningRequests?.length ?? 0) });

      if (this.intentDigest && (this.txSigningRequests?.length ?? 0) > 0) {
        try {
          const digest = await this.computeIntentDigest();
          console.debug('[TxConfirmerWrapper] computed digest', { digest, expected: this.intentDigest });
          if (digest !== this.intentDigest) {
            confirmed = false;
            error = 'INTENT_DIGEST_MISMATCH';
          }
        } catch (err) {
          confirmed = false;
          error = 'UI_DIGEST_VALIDATION_FAILED';
          if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn('[TxConfirmerWrapper] intent digest validation failed', err);
          }
        }
      }

      if (confirmed) {
        if (!this.loading) {
          this.loading = true;
          this.syncChildProps();
        }
        this.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CONFIRM, {
          detail: { confirmed: true },
          bubbles: true,
          composed: true,
        }));
        return;
      }

      this.loading = false;
      this.syncChildProps();
      // Close the child element if it exposes a close API; otherwise remove wrapper to avoid stale UI
      if (child?.close) {
        child.close(false);
      } else {
        this.remove();
      }

      const detail: { confirmed: false; error?: string } = { confirmed: false };
      if (typeof error === 'string') detail.error = error;

      this.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, {
        detail,
        bubbles: true,
        composed: true,
      }));
    } finally {
      this.redispatchingEvent = false;
    }
  }

  private async computeIntentDigest(): Promise<string> {
    const raw = Array.isArray(this.txSigningRequests) ? this.txSigningRequests : [];
    // Use the same canonical digest shape as confirmAndPrepareSigningSession:
    // { receiverId, actions: ActionArgsWasm[] } with actions normalized via orderActionForDigest.
    const txs: TransactionInputWasm[] = raw
      .filter(isTransactionInput)
      .map((tx) => ({
        receiverId: tx.receiverId,
        actions: tx.actions
          .map((action) => (isActionArgsWasm(action) ? action : toActionArgsWasm(action as ActionArgs)))
          .map((action) => orderActionForDigest(action) as ActionArgsWasm),
      }));

    return computeUiIntentDigestFromTxs(txs);
  }
}

if (!customElements.get(W3A_TX_CONFIRMER_ID)) {
  customElements.define(W3A_TX_CONFIRMER_ID, TxConfirmerWrapperElement);
}
