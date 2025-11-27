import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';
import { ensureComponentModule, mountComponent } from './harness';

const COMPONENT_MODULE = '/sdk/w3a-button-with-tooltip.js';
const COMPONENT_TAG = 'w3a-button-with-tooltip';

test.describe('Lit component – button-with-tooltip', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
    await ensureComponentModule(page, {
      modulePath: COMPONENT_MODULE,
      tagName: COMPONENT_TAG
    });

    await mountComponent(page, {
      tagName: COMPONENT_TAG,
      props: {
        nearAccountId: 'demo.testnet',
        txSigningRequests: [],
        tooltip: {
          width: '360px',
          height: 'auto',
          position: 'top-center',
          offset: '8px',
        },
      },
    });
  });

  // ensures the custom element upgrades and renders the embedded lit component shell
  test('upgrades custom element and renders interactive shim', async ({ page }) => {
    // Wait until the embedded button is rendered (CSS-gated first paint)
    await page.waitForFunction(() => {
      const host = document.querySelector('w3a-button-with-tooltip');
      const btn = host?.shadowRoot?.querySelector('[data-embedded-btn]') as HTMLElement | null;
      return !!btn && ((btn.getAttribute('role') || btn.tagName)?.toLowerCase() === 'button');
    });
    const upgradeState = await page.evaluate(() => {
      const host = document.querySelector('w3a-button-with-tooltip');
      if (!host) {
        return { exists: false };
      }

      const button = host.shadowRoot?.querySelector('[data-embedded-btn]') as HTMLElement | null;
      const tooltip = host.shadowRoot?.querySelector('[data-tooltip-content]') as HTMLElement | null;

      return {
        exists: true,
        hasShadow: !!host.shadowRoot,
        buttonRole: button?.getAttribute('role'),
        buttonTag: button?.tagName,
        buttonAriaExpanded: button?.getAttribute('aria-expanded'),
        tooltipVisible: tooltip?.getAttribute('data-visible'),
      };
    });

    expect(upgradeState.exists).toBe(true);
    expect(upgradeState.hasShadow).toBe(true);
    expect(upgradeState.buttonRole ?? upgradeState.buttonTag?.toLowerCase()).toBe('button');
    expect(upgradeState.buttonAriaExpanded).toBe('false');
    expect(upgradeState.tooltipVisible).toBe('false');
  });

  // checks tooltip hover interactions wire through the shim and toggle visibility cues
  test('shows and hides tooltip on hover transitions', async ({ page }) => {
    // Ensure shadow content is present before querying handles
    await page.waitForFunction(() => {
      const host = document.querySelector('w3a-button-with-tooltip');
      const sr = host?.shadowRoot;
      const btn = sr?.querySelector('[data-embedded-btn]');
      const tip = sr?.querySelector('[data-tooltip-content]');
      return !!btn && !!tip;
    });
    const hostHandle = await page.evaluateHandle(() =>
      document.querySelector('w3a-button-with-tooltip')
    );
    if (!hostHandle) {
      throw new Error('w3a-button-with-tooltip host not found');
    }

    const buttonHandle = await hostHandle.evaluateHandle((element: Element | null) =>
      element?.shadowRoot?.querySelector('[data-embedded-btn]')
    );
    const tooltipHandle = await hostHandle.evaluateHandle((element: Element | null) =>
      element?.shadowRoot?.querySelector('[data-tooltip-content]')
    );

    const buttonEl = buttonHandle.asElement();
    const tooltipEl = tooltipHandle.asElement();
    if (!buttonEl || !tooltipEl) {
      throw new Error('Shadow DOM button/tooltip not found');
    }

    await buttonEl.hover();

    await expect.poll(async () => buttonEl.getAttribute('aria-expanded')).toBe('true');
    await expect.poll(async () => tooltipEl.getAttribute('data-visible')).toBe('true');

    await page.mouse.move(0, 0); // leave component area to trigger hide

    await expect.poll(async () => buttonEl.getAttribute('aria-expanded')).toBe('false');
    await expect.poll(async () => tooltipEl.getAttribute('data-visible')).toBe('false');

    await buttonHandle.dispose();
    await tooltipHandle.dispose();
    await hostHandle.dispose();
  });
});
