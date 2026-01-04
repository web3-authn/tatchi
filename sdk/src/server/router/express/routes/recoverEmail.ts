import type { Router as ExpressRouter } from 'express';
import { parseRecoverEmailRequest } from '../../../email-recovery/emailParsers';
import type { ExpressRelayContext } from '../createRelayRouter';

export function registerRecoverEmailRoute(router: ExpressRouter, ctx: ExpressRelayContext): void {
  // Email recovery hook (DKIM/TEE flow):
  // Accept a ForwardableEmailPayload from the email worker and call the
  // per-user email-recoverer contract deployed on `accountId`.
  router.post('/recover-email', async (req: any, res: any) => {
    try {
      const prefer = String(req?.headers?.prefer || '').toLowerCase();
      const respondAsync =
        prefer.includes('respond-async') ||
        String((req?.query as any)?.async || '').trim() === '1' ||
        String((req?.query as any)?.respond_async || '').trim() === '1';

      const parsed = parseRecoverEmailRequest(req.body as unknown, { headers: req.headers as any });
      if (!parsed.ok) {
        res.status(parsed.status).json({ code: parsed.code, message: parsed.message });
        return;
      }
      const { accountId, emailBlob, explicitMode } = parsed;

      if (!ctx.service.emailRecovery) {
        res.status(503).json({ code: 'email_recovery_unavailable', message: 'EmailRecoveryService is not configured on this server' });
        return;
      }

      if (respondAsync) {
        void ctx.service.emailRecovery
          .requestEmailRecovery({ accountId, emailBlob, explicitMode })
          .then((result) => {
            ctx.logger.info('[recover-email] async complete', {
              success: result?.success === true,
              accountId,
              error: result?.success ? undefined : result?.error,
            });
          })
          .catch((err: any) => {
            ctx.logger.error('[recover-email] async error', {
              accountId,
              error: err?.message || String(err),
            });
          });

        res.status(202).json({ success: true, queued: true, accountId });
        return;
      }

      const result = await ctx.service.emailRecovery.requestEmailRecovery({ accountId, emailBlob, explicitMode });
      res.status(result.success ? 202 : 400).json(result);
    } catch (e: any) {
      res.status(500).json({ code: 'internal', message: e?.message || 'Internal error' });
    }
  });
}
