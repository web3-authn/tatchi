import type { Router as ExpressRouter } from 'express';
import {
  handleApplyServerLock,
  handleRemoveServerLock,
  handleGetShamirKeyInfo,
} from '../../../core/shamirHandlers';
import type { ExpressRelayContext } from '../createRelayRouter';

export function registerShamirRoutes(router: ExpressRouter, ctx: ExpressRelayContext): void {
  router.post('/vrf/apply-server-lock', async (req: any, res: any) => {
    const shamir = ctx.service.shamirService;
    if (!shamir || !shamir.hasShamir()) {
      return res.status(503).json({ error: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' });
    }
    try {
      const serverResponse = await handleApplyServerLock(shamir, { body: req.body });
      Object.entries(serverResponse.headers).forEach(([k, v]) => res.set(k, v as any));
      res.status(serverResponse.status);
      res.send(JSON.parse(serverResponse.body));
    } catch (e: any) {
      res.status(500).json({ error: 'internal', details: e?.message });
    }
  });

  router.post('/vrf/remove-server-lock', async (req: any, res: any) => {
    const shamir = ctx.service.shamirService;
    if (!shamir || !shamir.hasShamir()) {
      return res.status(503).json({ error: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' });
    }
    try {
      const serverResponse = await handleRemoveServerLock(shamir, { body: req.body });
      Object.entries(serverResponse.headers).forEach(([k, v]) => res.set(k, v as any));
      res.status(serverResponse.status);
      res.send(JSON.parse(serverResponse.body));
    } catch (e: any) {
      res.status(500).json({ error: 'internal', details: e?.message });
    }
  });

  router.get('/shamir/key-info', async (_req: any, res: any) => {
    const shamir = ctx.service.shamirService;
    if (!shamir || !shamir.hasShamir()) {
      return res.status(503).json({ error: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' });
    }
    try {
      const serverResponse = await handleGetShamirKeyInfo(shamir);
      Object.entries(serverResponse.headers).forEach(([k, v]) => res.set(k, v as any));
      res.status(serverResponse.status);
      res.send(JSON.parse(serverResponse.body));
    } catch (e: any) {
      res.status(500).json({ error: 'internal', details: e?.message });
    }
  });
}
