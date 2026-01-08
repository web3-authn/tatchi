import type { Request, Response, Router as ExpressRouter } from 'express';
import type { ExpressRelayContext } from '../createRelayRouter';
import type { CreateAccountAndRegisterRequest, CreateAccountAndRegisterResult } from '../../../core/types';

export function registerCreateAccountAndRegisterUser(router: ExpressRouter, ctx: ExpressRelayContext): void {
  router.post('/create_account_and_register_user', async (req: Request, res: Response) => {
    try {
      const {
        new_account_id,
        new_public_key,
        threshold_ed25519,
        vrf_data,
        webauthn_registration,
        deterministic_vrf_public_key,
        authenticator_options
      } = (req.body || {}) as CreateAccountAndRegisterRequest;

      if (!new_account_id || typeof new_account_id !== 'string') throw new Error('Missing or invalid new_account_id');
      if (!new_public_key || typeof new_public_key !== 'string') throw new Error('Missing or invalid new_public_key');
      if (!vrf_data || typeof vrf_data !== 'object') throw new Error('Missing or invalid vrf_data');
      if (!webauthn_registration || typeof webauthn_registration !== 'object') throw new Error('Missing or invalid webauthn_registration');

      const threshold = ctx.opts.threshold;
      const thresholdClientVerifyingShareB64u = threshold_ed25519?.client_verifying_share_b64u?.trim();
      let thresholdKeygen:
        | (Awaited<ReturnType<NonNullable<typeof threshold>['keygenFromClientVerifyingShareForRegistration']>> & { ok: true })
        | null = null;
      let thresholdWarning: string | null = null;

      if (thresholdClientVerifyingShareB64u) {
        if (!threshold) {
          thresholdWarning = 'threshold signing is not configured on this server';
        } else {
          const rpId = typeof (vrf_data as { rp_id?: unknown; rpId?: unknown }).rp_id === 'string'
            ? String((vrf_data as { rp_id?: unknown }).rp_id || '')
            : (typeof (vrf_data as { rpId?: unknown }).rpId === 'string' ? String((vrf_data as { rpId?: unknown }).rpId || '') : '');
          if (!rpId.trim()) {
            thresholdWarning = 'missing vrf_data.rp_id';
          } else {
            const out = await threshold.keygenFromClientVerifyingShareForRegistration({
              nearAccountId: new_account_id,
              rpId,
              clientVerifyingShareB64u: thresholdClientVerifyingShareB64u,
            });
            if (!out.ok) {
              thresholdWarning = out.message || 'threshold-ed25519 registration keygen failed';
            } else {
              thresholdKeygen = out;
            }
          }
        }
      }

      const result = await ctx.service.createAccountAndRegisterUser({
        new_account_id,
        new_public_key,
        vrf_data,
        webauthn_registration,
        deterministic_vrf_public_key,
        authenticator_options
      });

      let response: CreateAccountAndRegisterResult = result;

      if (result.success && threshold && thresholdKeygen) {
        try {
          await threshold.putRelayerKeyMaterial({
            relayerKeyId: thresholdKeygen.relayerKeyId,
            publicKey: thresholdKeygen.publicKey,
            relayerSigningShareB64u: thresholdKeygen.relayerSigningShareB64u,
            relayerVerifyingShareB64u: thresholdKeygen.relayerVerifyingShareB64u,
          });
          response = {
            ...response,
            thresholdEd25519: {
              relayerKeyId: thresholdKeygen.relayerKeyId,
              publicKey: thresholdKeygen.publicKey,
              relayerVerifyingShareB64u: thresholdKeygen.relayerVerifyingShareB64u,
              clientParticipantId: thresholdKeygen.clientParticipantId,
              relayerParticipantId: thresholdKeygen.relayerParticipantId,
              participantIds: thresholdKeygen.participantIds,
            },
          };
        } catch (e: unknown) {
          thresholdWarning = thresholdWarning || ((e && typeof e === 'object' && 'message' in e)
            ? String((e as { message?: unknown }).message || 'threshold signing persistence failed')
            : String(e || 'threshold signing persistence failed'));
        }
      }

      if (result.success && thresholdWarning) {
        response = {
          ...response,
          message: `${response.message || 'Account created and registered successfully'} (threshold enrollment skipped: ${thresholdWarning})`,
        };
      }

      if (response.success) res.status(200).json(response);
      else res.status(400).json(response);
    } catch (error: unknown) {
      const message = (error && typeof error === 'object' && 'message' in error)
        ? String((error as { message?: unknown }).message || 'internal error')
        : 'internal error';
      res.status(500).json({ success: false, error: message });
    }
  });
}
