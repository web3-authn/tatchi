import type { Request, Response, Router as ExpressRouter } from 'express';
import type { ExpressRelayContext } from '../createRelayRouter';

export function registerWellKnownRoutes(router: ExpressRouter, ctx: ExpressRelayContext): void {
  // ROR manifest for Related Origin Requests (wallet-scoped credentials)
  const wellKnownPaths = ['/.well-known/webauthn', '/.well-known/webauthn/'];
  for (const p of wellKnownPaths) {
    router.get(p, async (_req: Request, res: Response) => {
      try {
        const origins = await ctx.service.getRorOrigins();
        res.set('Content-Type', 'application/json; charset=utf-8');
        // Short TTL + SWR so updates propagate while staying cache-friendly
        res.set('Cache-Control', 'max-age=60, stale-while-revalidate=600');
        res.status(200).send(JSON.stringify({ origins }));
      } catch (e: any) {
        res.status(200).json({ origins: [] });
      }
    });
  }
}
