// Shared helpers for Lit component custom events (local to WebAuthn components)

export const LitComponentEvents = {
  CONFIRM: 'lit-confirm',
  CANCEL: 'lit-cancel',
  COPY: 'lit-copy',
  TREE_TOGGLED: 'lit-tree-toggled',
} as const;

export type LitComponentEvent = (typeof LitComponentEvents)[keyof typeof LitComponentEvents];

export interface LitComponentEventDetailMap {
  [LitComponentEvents.CONFIRM]: void;
  [LitComponentEvents.CANCEL]: { reason?: string } | undefined;
  [LitComponentEvents.COPY]: { type: string; value: string };
  [LitComponentEvents.TREE_TOGGLED]: void;
}

export type LitConfirmDetail = LitComponentEventDetailMap[(typeof LitComponentEvents)['CONFIRM']];
export type LitCancelDetail = LitComponentEventDetailMap[(typeof LitComponentEvents)['CANCEL']];
export type LitCopyDetail = LitComponentEventDetailMap[(typeof LitComponentEvents)['COPY']];
export type LitTreeToggledDetail = LitComponentEventDetailMap[(typeof LitComponentEvents)['TREE_TOGGLED']];

export type LitComponentEventDetail<T extends LitComponentEvent> = LitComponentEventDetailMap[T];

export type LitComponentEventListener<T extends LitComponentEvent> = (event: CustomEvent<LitComponentEventDetail<T>>) => void;

export function dispatchLitEvent<T extends LitComponentEvent>(
  target: EventTarget,
  type: T,
  detail?: LitComponentEventDetail<T>
): boolean {
  const event = new CustomEvent(type, {
    bubbles: true,
    composed: true,
    detail: detail as LitComponentEventDetail<T>,
  });
  return target.dispatchEvent(event);
}

export function addLitEventListener<T extends LitComponentEvent>(
  target: EventTarget,
  type: T,
  listener: LitComponentEventListener<T>,
  options?: boolean | AddEventListenerOptions
): () => void {
  const handler = listener as EventListener;
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

export const dispatchLitConfirm = (target: EventTarget) =>
  dispatchLitEvent(target, LitComponentEvents.CONFIRM);

export const dispatchLitCancel = (target: EventTarget, detail?: LitCancelDetail) =>
  dispatchLitEvent(target, LitComponentEvents.CANCEL, detail);

export const dispatchLitCopy = (target: EventTarget, detail: LitCopyDetail) =>
  dispatchLitEvent(target, LitComponentEvents.COPY, detail);

export const dispatchLitTreeToggled = (target: EventTarget) =>
  dispatchLitEvent(target, LitComponentEvents.TREE_TOGGLED);

export const addLitCancelListener = (
  target: EventTarget,
  listener: LitComponentEventListener<(typeof LitComponentEvents)['CANCEL']>,
  options?: boolean | AddEventListenerOptions
) => addLitEventListener(target, LitComponentEvents.CANCEL, listener, options);
