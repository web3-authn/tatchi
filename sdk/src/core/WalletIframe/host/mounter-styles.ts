/**
 * mounter-styles - CSP-safe stylesheet manager for wallet iframe host UI containers.
 * Replaces inline style attributes with classes + dynamic CSS rules.
 */

export type DOMRectLike = { top: number; left: number; width: number; height: number };

const CLASS_CONTAINER = 'w3a-host-container';
const CLASS_ANCHORED = 'is-anchored';
const CLASS_ELEMENT = 'w3a-host-element';
const BASE_CSS = `
  html, body { background: transparent; margin: 0; padding: 0; }
  .${CLASS_CONTAINER} { position: fixed; pointer-events: auto; background: transparent; border: 0; margin: 0; padding: 0; z-index: 2147483647; }
  .${CLASS_ELEMENT} { display: inline-block; }
`;

import { createCspStyleManager } from '../shared/csp-styles';

const styleManager = createCspStyleManager({
  baseCss: BASE_CSS,
  baseAttr: 'data-w3a-host-base',
  dynamicAttr: 'data-w3a-host-dyn',
});

export function ensureHostBaseStyles(): void {
  styleManager.ensureBase();
}

export function markContainer(el: HTMLElement): string {
  ensureHostBaseStyles();
  el.classList.add(CLASS_CONTAINER);
  el.dataset.w3aContainer = '1';
  if (el.id && el.id.startsWith('w3a-host-')) {
    return el.id;
  }
  const id = `w3a-host-${Math.random().toString(36).slice(2, 9)}`;
  el.id = id;
  return id;
}

export function markElement(el: HTMLElement): void {
  ensureHostBaseStyles();
  el.classList.add(CLASS_ELEMENT);
}

export function setContainerAnchored(el: HTMLElement, rect: DOMRectLike, anchorMode: 'iframe' | 'viewport'): string {
  const id = markContainer(el);
  const top = anchorMode === 'iframe' ? 0 : Math.max(0, Math.round(rect.top));
  const left = anchorMode === 'iframe' ? 0 : Math.max(0, Math.round(rect.left));
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const rule = `#${id}.${CLASS_ANCHORED}{ top:${top}px; left:${left}px; width:${width}px; height:${height}px; }`;

  styleManager.setRule(id, rule);

  el.classList.add(CLASS_ANCHORED);
  return id;
}

export function clearContainerAnchored(id: string): void {
  styleManager.removeRule(id);
}

export const HostMounterClasses = {
  CONTAINER: CLASS_CONTAINER,
  ANCHORED: CLASS_ANCHORED,
  ELEMENT: CLASS_ELEMENT,
};
