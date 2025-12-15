import { test, expect } from '@playwright/test';
import { buildConfigsFromEnv } from '../../core/defaultConfigs';

test.describe('buildConfigsFromEnv iframeWallet override semantics', () => {
  test('preserves explicit walletOrigin "" (does not fall back to defaults)', async () => {
    const cfg = buildConfigsFromEnv({
      relayer: { url: 'https://relay.example' },
      iframeWallet: { walletOrigin: '' },
    });
    expect(cfg.iframeWallet).toBeDefined();
    expect(cfg.iframeWallet?.walletOrigin).toBe('');
  });

  test('treats walletOrigin undefined as absent (falls back to defaults)', async () => {
    const cfg = buildConfigsFromEnv({
      relayer: { url: 'https://relay.example' },
      iframeWallet: { walletOrigin: undefined },
    });
    expect(cfg.iframeWallet).toBeDefined();
    expect(cfg.iframeWallet?.walletOrigin).toBeTruthy();
  });

  test('keeps iframeWallet default-enabled when not overridden', async () => {
    const cfg = buildConfigsFromEnv({
      relayer: { url: 'https://relay.example' },
    });
    expect(cfg.iframeWallet?.walletOrigin).toBeTruthy();
  });
});
