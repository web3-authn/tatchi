import { css, html, type PropertyValues } from 'lit';
import { createRef, Ref, ref } from 'lit/directives/ref.js';
import { LitElementWithProps } from '../LitElementWithProps';
import type { ConfirmUIElement } from '../confirm-ui-types';
import { WalletIframeDomEvents } from '../../../WalletIframe/events';
import type { TransactionInputWasm, VRFChallenge } from '../../../types';
import { computeUiIntentDigestFromTxs, orderActionForDigest } from '../common/tx-digest';
import { isActionArgsWasm, toActionArgsWasm, type ActionArgs, type ActionArgsWasm } from '@/core/types/actions';
import { isObject, isString } from '../../../WalletIframe/validation';
import { W3A_DRAWER_TX_CONFIRMER_ID, W3A_MODAL_TX_CONFIRMER_ID, W3A_TX_CONFIRMER_ID } from '../tags';
import { DrawerTxConfirmerElement } from './viewer-drawer';
import { ModalTxConfirmElement } from './viewer-modal';

const DEFAULT_VARIANT: Variant = 'modal';

export type Variant = 'modal' | 'drawer';

export type TxConfirmerVariantElement = (ConfirmUIElement & HTMLElement) & {
  nearAccountId?: string;
  txSigningRequests?: TransactionInputWasm[];
  vrfChallenge?: VRFChallenge;
  theme?: 'dark' | 'light';
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
  } as const;

  static styles = css`
    :host {
      display: contents;
    }
  `;

  static keepDefinitions = [ModalTxConfirmElement, DrawerTxConfirmerElement];

  declare variant: Variant;
  declare nearAccountId: string;
  declare txSigningRequests: TransactionInputWasm[];
  declare vrfChallenge?: VRFChallenge;
  declare theme: 'dark' | 'light';
  declare loading: boolean;
  declare errorMessage?: string;
  declare intentDigest?: string;
  declare title: string;
  declare confirmText: string;
  declare cancelText: string;
  declare deferClose: boolean;

  private readonly childRef: Ref<TxConfirmerVariantElement> = createRef();
  private reEmittingConfirm = false;
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
    this.title = '';
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
          .loading=${this.loading}
          .errorMessage=${this.errorMessage || ''}
          .title=${this.title}
          .confirmText=${this.confirmText}
          .cancelText=${this.cancelText}
          .deferClose=${this.deferClose}
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
      ></w3a-modal-tx-confirmer>
    `;
  }

  private syncChildProps(): void {
    const child = this.childRef.value;
    if (!child) return;
    try { child.nearAccountId = this.nearAccountId; } catch {}
    try { child.txSigningRequests = this.txSigningRequests; } catch {}
    try { child.vrfChallenge = this.vrfChallenge; } catch {}
    try { child.theme = this.theme; } catch {}
    try { child.loading = this.loading; } catch {}
    try { child.errorMessage = this.errorMessage; } catch {}
    try { child.title = this.title; } catch {}
    try { child.confirmText = this.confirmText; } catch {}
    try { child.cancelText = this.cancelText; } catch {}
    try { child.deferClose = this.deferClose; } catch {}
    child.requestUpdate?.();
    this.attachChildListeners();
  }

  private syncErrorAttribute(): void {
    try {
      if (this.errorMessage) {
        this.setAttribute('data-error-message', this.errorMessage);
      } else {
        this.removeAttribute('data-error-message');
      }
    } catch {}
  }

  private attachChildListeners(): void {
    const child = this.childRef.value;
    if (!child || child === this.currentChild) return;
    if (this.currentChild) {
      this.detachChildListeners();
    }
    try { child.addEventListener(WalletIframeDomEvents.TX_CONFIRMER_CONFIRM, this.boundConfirmListener as EventListener); } catch {}
    try { child.addEventListener(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, this.boundCancelListener as EventListener); } catch {}
    this.currentChild = child;
  }

  private detachChildListeners(): void {
    if (!this.currentChild) return;
    try { this.currentChild.removeEventListener(WalletIframeDomEvents.TX_CONFIRMER_CONFIRM, this.boundConfirmListener as EventListener); } catch {}
    try { this.currentChild.removeEventListener(WalletIframeDomEvents.TX_CONFIRMER_CANCEL, this.boundCancelListener as EventListener); } catch {}
    this.currentChild = null;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.detachChildListeners();
  }

  private handleChildCancel(): void {
    if (this.loading) {
      this.loading = false;
      this.syncChildProps();
    }
  }

  private async handleChildConfirm(event: Event): Promise<void> {
    if (this.reEmittingConfirm) return;
    event.stopImmediatePropagation();
    const child = this.childRef.value;
    let confirmed = true;
    let error: string | undefined;

    if (this.intentDigest && (this.txSigningRequests?.length ?? 0) > 0) {
      try {
        const digest = await this.computeIntentDigest();
        if (digest !== this.intentDigest) {
          confirmed = false;
          error = 'INTENT_DIGEST_MISMATCH';
        }
      } catch (err) {
        confirmed = false;
        error = 'UI_DIGEST_VALIDATION_FAILED';
        try { console.warn('[TxConfirmerWrapper] intent digest validation failed', err); } catch {}
      }
    }

    if (confirmed) {
      if (!this.loading) {
        this.loading = true;
        this.syncChildProps();
      }
    } else {
      this.loading = false;
      this.syncChildProps();
      // Close the child element if it exposes a close API; otherwise remove wrapper to avoid stale UI
      try {
        if (child?.close) {
          child.close(false);
        } else {
          this.remove();
        }
      } catch {}
    }

    try {
      this.reEmittingConfirm = true;
      this.dispatchEvent(new CustomEvent(WalletIframeDomEvents.TX_CONFIRMER_CONFIRM, {
        detail: { confirmed, error },
        bubbles: true,
        composed: true,
      }));
    } finally {
      this.reEmittingConfirm = false;
    }
  }

  private async computeIntentDigest(): Promise<string> {
    const raw = Array.isArray(this.txSigningRequests) ? this.txSigningRequests : [];
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
