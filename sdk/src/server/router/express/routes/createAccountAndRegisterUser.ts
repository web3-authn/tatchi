import type { Router as ExpressRouter } from 'express';
import type { ExpressRelayContext } from '../createRelayRouter';

export function registerCreateAccountAndRegisterUser(router: ExpressRouter, ctx: ExpressRelayContext): void {
  router.post('/create_account_and_register_user', async (req: any, res: any) => {
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

      const result = await ctx.service.createAccountAndRegisterUser({
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
  });
}
