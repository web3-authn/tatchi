import type { Request, Response, Router as ExpressRouter } from 'express';
import express from 'express';
import type { AuthService } from '../core/AuthService';
import type {
  CreateAccountAndRegisterRequest,
  CreateAccountAndRegisterResult,
  ShamirApplyServerLockResponse,
  ShamirRemoveServerLockResponse,
} from '../core/types';

export interface RelayRouterOptions {
  healthz?: boolean;
}

export function createRelayRouter(service: AuthService, opts: RelayRouterOptions = {}): ExpressRouter {
  const router = express.Router();

  router.post(
    '/create_account_and_register_user',
    async (req: any, res: any) => {
      try {
        const {
          new_account_id,
          new_public_key,
          vrf_data,
          webauthn_registration,
          deterministic_vrf_public_key,
          authenticator_options
        } = req.body || ({} as any);

        if (!new_account_id || typeof new_account_id !== 'string') throw new Error('Missing or invalid new_account_id');
        if (!new_public_key || typeof new_public_key !== 'string') throw new Error('Missing or invalid new_public_key');
        if (!vrf_data || typeof vrf_data !== 'object') throw new Error('Missing or invalid vrf_data');
        if (!webauthn_registration || typeof webauthn_registration !== 'object') throw new Error('Missing or invalid webauthn_registration');

        const result = await service.createAccountAndRegisterUser({
          new_account_id,
          new_public_key,
          vrf_data,
          webauthn_registration,
          deterministic_vrf_public_key,
          authenticator_options
        });

        if (result.success) res.status(200).json(result);
        else res.status(400).json(result);
      } catch (error: any) {
        res.status(500).json({ success: false, error: error?.message || 'internal error' });
      }
    }
  );

  router.post('/vrf/apply-server-lock', async (req: any, res: any) => {
    if (typeof (service as any).hasShamir === 'function' && !service.hasShamir()) {
      return res.status(503).json({ error: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' });
    }
    try {
      const serverResponse = await service.handleApplyServerLock({ body: req.body });
      Object.entries(serverResponse.headers).forEach(([k, v]) => res.set(k, v as any));
      res.status(serverResponse.status);
      res.send(JSON.parse(serverResponse.body));
    } catch (e: any) {
      res.status(500).json({ error: 'internal', details: e?.message });
    }
  });

  router.post('/vrf/remove-server-lock', async (req: any, res: any) => {
    if (typeof (service as any).hasShamir === 'function' && !service.hasShamir()) {
      return res.status(503).json({ error: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' });
    }
    try {
      const serverResponse = await service.handleRemoveServerLock({ body: req.body });
      Object.entries(serverResponse.headers).forEach(([k, v]) => res.set(k, v as any));
      res.status(serverResponse.status);
      res.send(JSON.parse(serverResponse.body));
    } catch (e: any) {
      res.status(500).json({ error: 'internal', details: e?.message });
    }
  });

  router.get('/shamir/key-info', async (_req: any, res: any) => {
    if (typeof (service as any).hasShamir === 'function' && !service.hasShamir()) {
      return res.status(503).json({ error: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' });
    }
    try {
      const serverResponse = await service.handleGetShamirKeyInfo();
      Object.entries(serverResponse.headers).forEach(([k, v]) => res.set(k, v as any));
      res.status(serverResponse.status);
      res.send(JSON.parse(serverResponse.body));
    } catch (e: any) {
      res.status(500).json({ error: 'internal', details: e?.message });
    }
  });

  if (opts.healthz) {
    router.get('/healthz', async (_req: Request, res: Response) => {
      try {
        const { currentKeyId } = JSON.parse((await service.handleGetShamirKeyInfo()).body) as { currentKeyId?: string };
        res.status(200).json({ ok: true, currentKeyId: currentKeyId || null });
      } catch {
        res.status(200).json({ ok: true });
      }
    });
  }

  return router;
}
