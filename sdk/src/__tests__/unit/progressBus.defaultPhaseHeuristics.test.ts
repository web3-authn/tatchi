import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  progressBus: '/sdk/esm/core/WalletIframe/client/on-events-progress-bus.js',
  tatchiTypes: '/sdk/esm/core/types/sdkSentEvents.js',
} as const;

test.describe('defaultPhaseHeuristics', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('returns show/hide/none for representative phases', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const progress = await import(paths.progressBus);
      const phases = await import(paths.tatchiTypes);
      const heuristic = progress.defaultPhaseHeuristics as (p: any) => 'show' | 'hide' | 'none';

      const show1 = heuristic({ phase: phases.ActionPhase.STEP_2_USER_CONFIRMATION });
      const show2 = heuristic({ phase: phases.ActionPhase.STEP_3_WEBAUTHN_AUTHENTICATION });
      const hide1 = heuristic({ phase: phases.ActionPhase.STEP_8_ACTION_COMPLETE });
      const hide2 = heuristic({ phase: phases.LoginPhase.STEP_4_LOGIN_COMPLETE });
      const hide3 = heuristic({ phase: 'cancelled' });
      const none1 = heuristic({ phase: 'some-unknown-phase' });
      const none2 = heuristic({});

      return { show1, show2, hide1, hide2, hide3, none1, none2 };
    }, { paths: IMPORT_PATHS });

    expect(result.show1).toBe('show');
    expect(result.show2).toBe('show');
    expect(result.hide1).toBe('hide');
    expect(result.hide2).toBe('hide');
    expect(result.hide3).toBe('hide');
    expect(result.none1).toBe('none');
    expect(result.none2).toBe('none');
  });
});
