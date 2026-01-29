import { test, expect } from '@playwright/test';
import { createCspStyleManager } from '../../core/WalletIframe/shared/csp-styles';

type FakeStyleEl = {
  textContent: string;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | undefined;
  tagName?: string;
};

type FakeDocument = {
  head: { appendChild: (el: FakeStyleEl) => FakeStyleEl };
  createElement: (tag: string) => FakeStyleEl;
  adoptedStyleSheets?: unknown[];
};

const createFakeDom = (): { document: FakeDocument; headChildren: FakeStyleEl[] } => {
  const headChildren: FakeStyleEl[] = [];
  const head = {
    appendChild: (el: FakeStyleEl) => {
      headChildren.push(el);
      return el;
    },
  };
  const createElement = (tag: string) => {
    const attrs: Record<string, string> = {};
    return {
      tagName: tag.toUpperCase(),
      textContent: '',
      setAttribute: (name: string, value: string) => {
        attrs[name] = String(value);
      },
      getAttribute: (name: string) => attrs[name],
    };
  };
  return {
    document: { head, createElement, adoptedStyleSheets: [] },
    headChildren,
  };
};

test.describe('CSP style manager', () => {
  test('constructable sheets rebuild base + dynamic css', async () => {
    const globalAny = globalThis as { document?: Document; CSSStyleSheet?: typeof CSSStyleSheet | undefined };
    const prevDocument = globalAny.document;
    const prevSheet = globalAny.CSSStyleSheet;
    const baseCss = '.base{color:red;}';
    const { document } = createFakeDom();

    class FakeSheet {
      cssText = '';
      replaceSync(text: string) {
        this.cssText = text;
      }
    }

    globalAny.document = document as unknown as Document;
    globalAny.CSSStyleSheet = FakeSheet as unknown as typeof CSSStyleSheet;

    try {
      const manager = createCspStyleManager({
        baseCss,
        baseAttr: 'data-base',
        dynamicAttr: 'data-dyn',
        nonceGetter: () => 'nonce',
      });

      manager.ensureBase();
      expect(document.adoptedStyleSheets?.length).toBe(1);
      const sheet = document.adoptedStyleSheets?.[0] as FakeSheet;
      expect(sheet.cssText).toBe(baseCss);

      manager.setRule('a', '#a{width:1px;}');
      expect(sheet.cssText).toBe(`${baseCss}\n#a{width:1px;}`);

      manager.setRule('b', '#b{height:2px;}');
      expect(sheet.cssText).toBe(`${baseCss}\n#a{width:1px;}\n#b{height:2px;}`);

      manager.removeRule('a');
      expect(sheet.cssText).toBe(`${baseCss}\n#b{height:2px;}`);

      manager.removeRule('b');
      expect(sheet.cssText).toBe(baseCss);
    } finally {
      globalAny.document = prevDocument;
      globalAny.CSSStyleSheet = prevSheet;
    }
  });

  test('fallback path uses style elements for base and dynamic rules', async () => {
    const globalAny = globalThis as { document?: Document; CSSStyleSheet?: typeof CSSStyleSheet | undefined };
    const prevDocument = globalAny.document;
    const prevSheet = globalAny.CSSStyleSheet;
    const baseCss = '.base{color:blue;}';
    const { document, headChildren } = createFakeDom();

    globalAny.document = document as unknown as Document;
    globalAny.CSSStyleSheet = undefined;

    try {
      const manager = createCspStyleManager({
        baseCss,
        baseAttr: 'data-base',
        dynamicAttr: 'data-dyn',
        nonceGetter: () => 'nonce',
      });

      manager.ensureBase();
      expect(headChildren.length).toBe(1);
      const baseEl = headChildren[0];
      expect(baseEl.getAttribute('data-base')).toBe('');
      expect(baseEl.getAttribute('nonce')).toBe('nonce');
      expect(baseEl.textContent).toBe(baseCss);

      manager.setRule('a', '#a{color:green;}');
      expect(headChildren.length).toBe(2);
      const dynamicEl = headChildren[1];
      expect(dynamicEl.getAttribute('data-dyn')).toBe('');
      expect(dynamicEl.textContent).toBe('#a{color:green;}');

      manager.setRule('b', '#b{color:orange;}');
      expect(dynamicEl.textContent).toBe('#a{color:green;}\n#b{color:orange;}');

      manager.removeRule('a');
      expect(dynamicEl.textContent).toBe('#b{color:orange;}');

      manager.removeRule('b');
      expect(dynamicEl.textContent).toBe('');
    } finally {
      globalAny.document = prevDocument;
      globalAny.CSSStyleSheet = prevSheet;
    }
  });
});
