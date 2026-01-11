import type { Router as ExpressRouter } from 'express';
import { parseSessionKind } from '../../relay';
import type { ExpressRelayContext } from '../createRelayRouter';

export function registerVerifyAuthenticationResponse(router: ExpressRouter, ctx: ExpressRelayContext): void {
  // VRF + WebAuthn session verification (VIEW call) + optional session issuance
  router.post('/verify-authentication-response', async (req: any, res: any) => {
    try {
      if (!req?.body) {
        res.status(400).json({ code: 'invalid_body', message: 'Request body is required' });
        return;
      }
      const body = req.body;
      const valid = body && body.vrf_data && body.webauthn_authentication;
      if (!valid) {
        res.status(400).json({ code: 'invalid_body', message: 'vrf_data and webauthn_authentication are required' });
        return;
      }
      const result = await ctx.service.verifyAuthenticationResponse(body);
      const status = result.success ? 200 : 400;
      if (status !== 200) {
        res.status(status).json({ code: 'not_verified', message: result.message || 'Authentication verification failed' });
        return;
      }
      const sessionKind = parseSessionKind(body);
      const session = ctx.opts.session;
      if (session && result.verified) {
        try {
          const sub = String(body.vrf_data.user_id || '');
          const token = await session.signJwt(sub, { rpId: body.vrf_data.rp_id, blockHeight: body.vrf_data.block_height });
          // Best-effort server log without sensitive data
          ctx.logger.info(`[relay] creating ${sessionKind === 'cookie' ? 'HttpOnly session' : 'JWT'} for`, sub);
          if (sessionKind === 'cookie') {
            res.set('Set-Cookie', session.buildSetCookie(token));
            const { jwt: _omit, ...rest } = result as any;
            res.status(200).json(rest);
            return;
          }
          res.status(200).json({ ...result, jwt: token });
          return;
        } catch (e: any) {
          // If session issuance fails, still return verification result
        }
      }
      res.status(200).json(result);
    } catch (e: any) {
      res.status(500).json({ code: 'internal', message: e?.message || 'Internal error' });
    }
  });
}
