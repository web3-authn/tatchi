import type { Request, Response, Router as ExpressRouter } from 'express';
import { handleGetShamirKeyInfo } from '../../../core/shamirHandlers';
import type { ExpressRelayContext } from '../createRelayRouter';

export function registerHealthRoutes(router: ExpressRouter, ctx: ExpressRelayContext): void {
  if (ctx.opts.healthz) {
    router.get('/healthz', async (_req: Request, res: Response) => {
      const shamir = ctx.service.shamirService;
      const shamirConfigured = Boolean(shamir && shamir.hasShamir());
      let currentKeyId: string | null = null;
      if (shamirConfigured && shamir) {
        try {
          const payload = JSON.parse((await handleGetShamirKeyInfo(shamir)).body) as { currentKeyId?: string };
          currentKeyId = payload.currentKeyId || null;
        } catch { }
      }

      const proverBaseUrl = ctx.service.emailRecovery?.getZkEmailProverBaseUrl?.() ?? null;
      const zkEmailConfigured = Boolean(proverBaseUrl);

      res.status(200).json({
        ok: true,
        // Backwards-compatible field (was previously top-level).
        currentKeyId,
        shamir: { configured: shamirConfigured, currentKeyId },
        zkEmail: { configured: zkEmailConfigured, proverBaseUrl },
      });
    });
  }

  if (ctx.opts.readyz) {
    router.get('/readyz', async (_req: Request, res: Response) => {
      const shamir = ctx.service.shamirService;
      const shamirConfigured = Boolean(shamir && shamir.hasShamir());

      let shamirReady: boolean | null = null;
      let shamirCurrentKeyId: string | null = null;
      let shamirError: string | undefined;
      if (shamirConfigured && shamir) {
        try {
          await shamir.ensureReady();
          shamirReady = true;
          const payload = JSON.parse((await handleGetShamirKeyInfo(shamir)).body) as { currentKeyId?: string };
          shamirCurrentKeyId = payload.currentKeyId || null;
        } catch (e: any) {
          shamirReady = false;
          shamirError = e?.message || String(e);
        }
      }

      const zk = ctx.service.emailRecovery
        ? await ctx.service.emailRecovery.checkZkEmailProverHealth()
        : { configured: false, baseUrl: null, healthy: null as boolean | null };

      const ok =
        (shamirConfigured ? shamirReady === true : true) &&
        (zk.configured ? zk.healthy === true : true);

      res.status(ok ? 200 : 503).json({
        ok,
        shamir: {
          configured: shamirConfigured,
          ready: shamirConfigured ? shamirReady : null,
          currentKeyId: shamirCurrentKeyId,
          error: shamirError,
        },
        zkEmail: zk,
      });
    });
  }
}
