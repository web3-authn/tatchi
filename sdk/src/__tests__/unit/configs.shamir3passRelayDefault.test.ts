import { test, expect } from '@playwright/test';
import { buildConfigsFromEnv } from '../../core/defaultConfigs';

test.describe('buildConfigsFromEnv shamir3pass relayServerUrl defaulting', () => {
  test('defaults shamir3pass.relayServerUrl to relayer.url when unset', async () => {
    const cfg = buildConfigsFromEnv({
      relayer: { url: 'https://relay.example' },
      vrfWorkerConfigs: { shamir3pass: {} },
    });
    expect(cfg.vrfWorkerConfigs.shamir3pass.relayServerUrl).toBe('https://relay.example');
  });

  test('preserves explicit shamir3pass.relayServerUrl override', async () => {
    const cfg = buildConfigsFromEnv({
      relayer: { url: 'https://relay.example' },
      vrfWorkerConfigs: { shamir3pass: { relayServerUrl: 'https://shamir.example' } },
    });
    expect(cfg.vrfWorkerConfigs.shamir3pass.relayServerUrl).toBe('https://shamir.example');
  });

  test('allows disabling shamir3pass by setting relayServerUrl to empty string', async () => {
    const cfg = buildConfigsFromEnv({
      relayer: { url: 'https://relay.example' },
      vrfWorkerConfigs: { shamir3pass: { relayServerUrl: '' } },
    });
    expect(cfg.vrfWorkerConfigs.shamir3pass.relayServerUrl).toBe('');
  });
});

