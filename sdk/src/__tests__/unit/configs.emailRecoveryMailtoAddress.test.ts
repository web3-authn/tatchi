import { test, expect } from '@playwright/test';
import { buildConfigsFromEnv } from '../../core/defaultConfigs';

test.describe('buildConfigsFromEnv emailRecovery.mailtoAddress normalization', () => {
  test('treats empty mailtoAddress override as unset and falls back to defaults', async () => {
    const cfg = buildConfigsFromEnv({
      relayer: {
        url: 'https://relay.example',
        emailRecovery: {
          mailtoAddress: '',
        },
      },
    });

    expect(cfg.relayer.emailRecovery.mailtoAddress).toBe('recover@tatchi.xyz');
  });

  test('trims mailtoAddress override', async () => {
    const cfg = buildConfigsFromEnv({
      relayer: {
        url: 'https://relay.example',
        emailRecovery: {
          mailtoAddress: '  recover@example.com  ',
        },
      },
    });

    expect(cfg.relayer.emailRecovery.mailtoAddress).toBe('recover@example.com');
  });
});

