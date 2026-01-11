import type { Router as ExpressRouter } from 'express';
import type { ExpressRelayContext } from '../createRelayRouter';

export function registerSignedDelegateRoutes(router: ExpressRouter, ctx: ExpressRelayContext): void {
  if (!ctx.signedDelegatePath) return;

  router.options(ctx.signedDelegatePath, (_req: any, res: any) => {
    res.sendStatus(204);
  });

  router.post(ctx.signedDelegatePath, async (req: any, res: any) => {
    try {
      const { hash, signedDelegate } = req.body || {};
      if (typeof hash !== 'string' || !hash || !signedDelegate) {
        res.status(400).json({ ok: false, code: 'invalid_body', message: 'Expected { hash, signedDelegate }' });
        return;
      }

      const result = await ctx.service.executeSignedDelegate({
        hash,
        signedDelegate,
        policy: ctx.signedDelegatePolicy,
      });

      if (!result || !result.ok) {
        res.status(400).json({
          ok: false,
          code: result?.code || 'delegate_execution_failed',
          message: result?.error || 'Failed to execute delegate action',
        });
        return;
      }

      res.status(200).json({
        ok: true,
        relayerTxHash: result.transactionHash || null,
        status: 'submitted',
        outcome: result.outcome ?? null,
      });
    } catch (e: any) {
      res.status(500).json({
        ok: false,
        code: 'internal',
        message: e?.message || 'Internal error while executing delegate action',
      });
    }
  });
}
