import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  overlay: '/sdk/esm/core/WalletIframe/client/overlay-controller.js',
} as const;

test.describe('OverlayController', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('showFullscreen → visible + interactive, hide → invisible + inert', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.overlay);
      const OverlayController = (mod as any).OverlayController || (mod as any).default;
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);
      const overlay = new OverlayController({ ensureIframe: () => iframe });

      overlay.showFullscreen();
      const afterShow = {
        pointerEvents: getComputedStyle(iframe).pointerEvents,
        ariaHidden: iframe.getAttribute('aria-hidden'),
        opacity: getComputedStyle(iframe).opacity,
      };

      overlay.hide();
      const afterHide = {
        pointerEvents: getComputedStyle(iframe).pointerEvents,
        ariaHidden: iframe.getAttribute('aria-hidden'),
        width: getComputedStyle(iframe).width,
        height: getComputedStyle(iframe).height,
        opacity: getComputedStyle(iframe).opacity,
      };

      return { afterShow, afterHide };
    }, { paths: IMPORT_PATHS });

    expect(res.afterShow.pointerEvents).toBe('auto');
    expect(res.afterShow.ariaHidden).toBe('false');
    expect(res.afterShow.opacity).toBe('1');

    expect(res.afterHide.pointerEvents).toBe('none');
    expect(res.afterHide.ariaHidden).toBe('true');
    expect(res.afterHide.width).toBe('0px');
    expect(res.afterHide.height).toBe('0px');
    expect(res.afterHide.opacity).toBe('0');
  });

  test('anchored positioning and sticky prevents hide', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.overlay);
      const OverlayController = (mod as any).OverlayController || (mod as any).default;
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);
      const overlay = new OverlayController({ ensureIframe: () => iframe });

      overlay.showAnchored({ top: 10, left: 12, width: 123, height: 45 });
      const anchored = {
        top: getComputedStyle(iframe).top,
        left: getComputedStyle(iframe).left,
        width: getComputedStyle(iframe).width,
        height: getComputedStyle(iframe).height,
        ariaHidden: iframe.getAttribute('aria-hidden'),
        pointerEvents: getComputedStyle(iframe).pointerEvents,
      };

      overlay.setSticky(true);
      overlay.hide(); // should be ignored due to sticky
      const stateAfterHideAttempt = overlay.getState();

      overlay.setAnchoredRect({ top: 20, left: 22, width: 150, height: 60 });
      const afterUpdate = {
        top: getComputedStyle(iframe).top,
        left: getComputedStyle(iframe).left,
        width: getComputedStyle(iframe).width,
        height: getComputedStyle(iframe).height,
      };

      return { anchored, stateAfterHideAttempt, afterUpdate };
    }, { paths: IMPORT_PATHS });

    expect(res.anchored.top).toBe('10px');
    expect(res.anchored.left).toBe('12px');
    expect(res.anchored.width).toBe('123px');
    expect(res.anchored.height).toBe('45px');
    expect(res.anchored.ariaHidden).toBe('false');
    expect(res.anchored.pointerEvents).toBe('auto');

    expect(res.stateAfterHideAttempt.visible).toBe(true); // sticky prevented hide

    expect(res.afterUpdate.top).toBe('20px');
    expect(res.afterUpdate.left).toBe('22px');
    expect(res.afterUpdate.width).toBe('150px');
    expect(res.afterUpdate.height).toBe('60px');
  });
});
