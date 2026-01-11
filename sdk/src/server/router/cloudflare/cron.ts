import type { AuthService } from '../../core/AuthService';
import type { RouterLogger } from '../logger';
import { coerceRouterLogger } from '../logger';
import type { CfScheduledEvent, ScheduledHandler } from './types';

/**
 * Optional cron hook factory for Cloudflare Workers.
 * Default is inactive (no-op). Enable explicitly in your Worker entry.
 *
 * Example:
 *   const cron = createCloudflareCron(service, { enabled: env.ENABLE_ROTATION === '1', rotate: false });
 *   export default { fetch: router, scheduled: cron };
 */
export interface CloudflareCronOptions {
  enabled?: boolean;     // default false
  rotate?: boolean;      // if true, will attempt to rotate Shamir keypair (not persisted in Workers)
  // Optional logger; defaults to silent.
  logger?: RouterLogger | null;
}

export function createCloudflareCron(service: AuthService, opts: CloudflareCronOptions = {}): ScheduledHandler {
  const logger = coerceRouterLogger(opts.logger);
  const enabled = Boolean(opts.enabled);
  const doRotate = Boolean(opts.rotate);
  if (!enabled) {
    return async () => { /* no-op by default */ };
  }
  return async (_event: CfScheduledEvent) => {
    try {
      if (doRotate) {
        // Rotation in Workers is ephemeral unless you persist keys externally.
        // This call rotates in-memory only and logs the result.
        const shamir = service.shamirService;
        if (!shamir) {
          logger.warn('[cloudflare-cron] Shamir not configured; skipping rotation');
        } else {
          const rotation = await shamir.rotateShamirServerKeypair();
          logger.info('[cloudflare-cron] rotated key', rotation.newKeyId, 'graceIds:', rotation.graceKeyIds);
        }
      } else {
        logger.info('[cloudflare-cron] enabled but rotate=false (no action)');
      }
    } catch (e: unknown) {
      logger.error('[cloudflare-cron] failed', e instanceof Error ? e.message : String(e));
    }
  };
}
