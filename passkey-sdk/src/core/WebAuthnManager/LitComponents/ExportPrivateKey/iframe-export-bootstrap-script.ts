import { isObject, isString, isBoolean } from '../../../WalletIframe/validation';

type MessageType =
  | 'READY'
  | 'ETX_DEFINED'
  | 'SET_INIT'
  | 'SET_EXPORT_DATA'
  | 'SET_LOADING'
  | 'SET_ERROR'
  | 'SET_PRIVATE_KEY'
  | 'CONFIRM'
  | 'CANCEL'
  | 'COPY';

type MessagePayloads = {
  READY: undefined;
  ETX_DEFINED: undefined;
  SET_INIT: { targetOrigin: string };
  SET_EXPORT_DATA: {
    theme?: 'dark' | 'light';
    variant?: 'drawer' | 'modal';
    accountId: string;
    publicKey: string;
  };
  SET_LOADING: boolean;
  SET_ERROR: string;
  SET_PRIVATE_KEY: { privateKey: string };
  CONFIRM: undefined;
  CANCEL: undefined;
  COPY: { type: 'publicKey' | 'privateKey'; value: string };
};

let PARENT_ORIGIN: string | undefined;

function whenDefined(tag: string): Promise<void> {
  if (window.customElements?.whenDefined) {
    return window.customElements.whenDefined(tag).then(() => void 0);
  }
  return Promise.resolve();
}

function postToParent<T extends MessageType>(type: T, payload?: MessagePayloads[T]) {
  try { window.parent.postMessage({ type, payload }, PARENT_ORIGIN || '*'); } catch {}
}

function isSetExportDataPayload(payload: unknown): payload is MessagePayloads['SET_EXPORT_DATA'] {
  if (!isObject(payload)) return false;
  const p = payload as any;
  return isString(p.accountId) && isString(p.publicKey);
}

// Ensure a drawer element exists in body; use id 'exp'
function getDrawer(): HTMLElement & { theme?: string; open?: boolean; height?: string; showCloseButton?: boolean; overpullPx?: number; dragToClose?: boolean } {
  let el = document.getElementById('exp') as any;
  if (!el) {
    el = document.createElement('w3a-drawer');
    el.id = 'exp';
    document.body.appendChild(el);
  }
  return el;
}

// Ensure viewer element is a child of drawer
function getViewer(): HTMLElement & { theme?: string; variant?: string; accountId?: string; publicKey?: string; privateKey?: string; loading?: boolean; errorMessage?: string } {
  const drawer = getDrawer();
  let viewer = drawer.querySelector('w3a-export-key-viewer') as any;
  if (!viewer) {
    viewer = document.createElement('w3a-export-key-viewer');
    drawer.appendChild(viewer);
  }
  return viewer;
}

function onMessage(e: MessageEvent<{ type: MessageType; payload?: any }>) {
  const data = e?.data;
  if (!data || !isObject(data) || !('type' in data)) return;
  const type = (data as any).type as MessageType;
  const payload = (data as any).payload;

  switch (type) {
    case 'SET_INIT': {
      if (isObject(payload)) {
        const p = payload as { targetOrigin?: string };
        if (p.targetOrigin && isString(p.targetOrigin)) {
          PARENT_ORIGIN = p.targetOrigin;
        }
      }
      whenDefined('w3a-export-key-viewer').then(() => postToParent('ETX_DEFINED'));
      break;
    }
    case 'SET_EXPORT_DATA': {
      if (!isSetExportDataPayload(payload)) break;
      const viewer = getViewer();
      if (payload.theme && isString(payload.theme)) viewer.theme = payload.theme;
      if (payload.variant && isString(payload.variant)) viewer.variant = payload.variant;
      viewer.accountId = payload.accountId;
      viewer.publicKey = payload.publicKey;

      const drawer = getDrawer();
      if (payload.theme && isString(payload.theme)) drawer.theme = payload.theme;
      // Show just the top portion above the fold; allow closing via overlay/×
      drawer.height = '50vh';
      drawer.showCloseButton = true;
      drawer.dragToClose = true;
      drawer.overpullPx = 160;
      drawer.open = true;
      break;
    }
    case 'SET_LOADING': {
      if (!isBoolean(payload)) break;
      const viewer = getViewer();
      viewer.loading = !!payload;
      break;
    }
    case 'SET_ERROR': {
      const viewer = getViewer();
      if (isString(payload)) viewer.errorMessage = payload;
      break;
    }
    case 'SET_PRIVATE_KEY': {
      if (!isObject(payload)) break;
      const p = payload as { privateKey?: string };
      const viewer = getViewer();
      if (p.privateKey && isString(p.privateKey)) viewer.privateKey = p.privateKey;
      viewer.loading = false;
      break;
    }
  }
}

// Forward decision/copy events to parent
document.addEventListener('confirm', () => postToParent('CONFIRM'));
// On cancel, wait for the drawer's transform transition to finish, then notify parent.
document.addEventListener('cancel', () => {
  try {
    const drawer = getDrawer() as any;
    const el = drawer?.shadowRoot?.querySelector?.('.drawer') as HTMLElement | null;
    if (el) {
      const onEnd = (ev: TransitionEvent) => {
        if (ev?.propertyName !== 'transform') return;
        try { el.removeEventListener('transitionend', onEnd); } catch {}
        postToParent('CANCEL');
      };
      // Fallback in case transitionend doesn't fire
      setTimeout(() => {
        try { el.removeEventListener('transitionend', onEnd); } catch {}
        postToParent('CANCEL');
      }, 750);
      el.addEventListener('transitionend', onEnd);
      return;
    }
  } catch {}
  postToParent('CANCEL');
});
document.addEventListener('copy', (e: Event) => {
  const detail = (e as CustomEvent).detail;
  if (isObject(detail)) postToParent('COPY', detail as any);
});

window.addEventListener('message', onMessage);
// signal ready to parent immediately
try { postToParent('READY'); } catch {}
