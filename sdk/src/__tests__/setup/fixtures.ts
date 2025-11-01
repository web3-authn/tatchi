import { test as base, expect, Page } from '@playwright/test';
import { setupBasicPasskeyTest } from './index';
import type { PasskeyTestConfigOverrides } from './types';
import { createConsoleCapture, printLog } from './logging';

export interface PasskeyFixture {
  setup: (overrides?: PasskeyTestConfigOverrides) => Promise<void>;
  withTestUtils: <T, A = undefined>(callback: (arg: A) => Promise<T> | T, arg?: A) => Promise<T>;
  page: Page;
}

export interface ConsoleCaptureFixture {
  messages: () => string[];
  clear: () => void;
}

type Fixtures = {
  passkey: PasskeyFixture;
  consoleCapture: ConsoleCaptureFixture;
};

const test = base.extend<Fixtures>({
  passkey: async ({ page }, use) => {
    let hasSetupRun = false;

    const ensureSetup = async (overrides?: PasskeyTestConfigOverrides) => {
      if (!hasSetupRun || (overrides && Object.keys(overrides).length)) {
        const stepLabel = hasSetupRun ? 'rerun' : 1;
        await setupBasicPasskeyTest(page, overrides);
        hasSetupRun = true;
      }
    };

    const withTestUtils = async <T, A = undefined>(
      callback: (arg: A) => Promise<T> | T,
      arg?: A
    ): Promise<T> => {
      if (!hasSetupRun) {
        await ensureSetup();
      }
      return page.evaluate(callback as any, arg as any);
    };

    await use({
      setup: ensureSetup,
      withTestUtils,
      page,
    });
  },
  consoleCapture: async ({ page }, use, testInfo) => {
    const capture = createConsoleCapture(page, testInfo);
    capture.start();

    await use({
      messages: () => [...capture.messages],
      clear: () => {
        capture.messages.length = 0;
      }
    });

    capture.stop();

    const verbose = process.env.VERBOSE_TEST_LOGS === '1' || process.env.VERBOSE_TEST_LOGS === 'true';
    if (testInfo.status !== 'passed' || verbose) {
      capture.flush();
    }
  }
});

export { test, expect };
