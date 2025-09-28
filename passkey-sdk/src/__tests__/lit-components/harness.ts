import type { Page } from '@playwright/test';

export interface ComponentImportOptions {
  modulePath: string;
  tagName?: string;
}

export const ensureComponentModule = async (
  page: Page,
  { modulePath, tagName }: ComponentImportOptions
): Promise<void> => {
  await page.evaluate(async ({ path, tag }) => {
    if (!(window as any).__w3aLoadedModules) {
      (window as any).__w3aLoadedModules = new Set<string>();
    }
    const cache: Set<string> = (window as any).__w3aLoadedModules;
    if (!cache.has(path)) {
      await import(path);
      cache.add(path);
    }
    if (tag) {
      await (customElements.whenDefined?.(tag) ?? Promise.resolve());
    }
  }, { path: modulePath, tag: tagName });
};

export interface MountComponentOptions {
  tagName: string;
  attributes?: Record<string, string>;
  props?: Record<string, unknown>;
  containerId?: string;
}

export const mountComponent = async (
  page: Page,
  { tagName, attributes = {}, props = {}, containerId = 'test-root' }: MountComponentOptions
): Promise<void> => {
  await page.evaluate(
    ({ tag, attrs, componentProps, id }) => {
      let container = document.querySelector(`#${id}`) as HTMLElement | null;
      if (!container) {
        container = document.createElement('div');
        container.id = id;
        container.style.display = 'block';
        container.style.padding = '24px';
        container.style.background = '#101826';
        document.body.appendChild(container);
      }

      const existing = container.querySelector(tag);
      if (existing) {
        existing.remove();
      }

      const element = document.createElement(tag) as Record<string, unknown> & HTMLElement;

      Object.entries(attrs || {}).forEach(([name, value]) => {
        element.setAttribute(name, String(value));
      });

      Object.entries(componentProps || {}).forEach(([name, value]) => {
        (element as Record<string, unknown>)[name] = value;
      });

      container.appendChild(element);
    },
    { tag: tagName, attrs: attributes, componentProps: props, id: containerId }
  );
};
