import type { AuthService } from '../../core/AuthService';
import type { RouterLogger } from '../logger';
import { normalizeRouterLogger } from '../logger';

export interface KeyRotationCronOptions {
  enabled?: boolean;
  intervalMinutes?: number;
  maxGraceKeys?: number;
  logger?: RouterLogger | null;
}

export function startKeyRotationCronjob(
  service: AuthService,
  opts: KeyRotationCronOptions = {},
): { stop(): void } {
  const logger = normalizeRouterLogger(opts.logger);
  const enabled = Boolean(opts.enabled);
  const intervalMinutes = Math.max(1, Number(opts.intervalMinutes || 0) || 60);
  const maxGraceKeys = Math.max(0, Number(opts.maxGraceKeys ?? 0) || 0);

  let timer: any = null;
  let inFlight = false;

  const run = async () => {
    if (!enabled) return;
    if (inFlight) {
      logger.warn('[key-rotation-cron] previous rotation still running; skipping');
      return;
    }
    inFlight = true;
    try {
      const shamir = service.shamirService;
      if (!shamir || !shamir.hasShamir()) {
        logger.warn('[key-rotation-cron] Shamir not configured; skipping rotation');
        return;
      }

      const rotation = await shamir.rotateShamirServerKeypair();
      logger.info('[key-rotation-cron] rotated key', {
        newKeyId: rotation.newKeyId,
        previousKeyId: rotation.previousKeyId,
        graceKeyIds: rotation.graceKeyIds,
      });

      if (maxGraceKeys > 0) {
        const graceKeyIds = shamir.getGraceKeyIds();
        if (graceKeyIds.length > maxGraceKeys) {
          const toRemove = graceKeyIds.slice(0, graceKeyIds.length - maxGraceKeys);
          for (const keyId of toRemove) {
            try {
              const removed = await shamir.removeGraceKeyInternal(keyId, { persist: true });
              logger.info('[key-rotation-cron] pruned grace key', { keyId, removed });
            } catch (e: any) {
              logger.warn('[key-rotation-cron] failed to prune grace key', { keyId, error: e?.message || String(e) });
            }
          }
        }
      }
    } catch (e: any) {
      logger.error('[key-rotation-cron] rotation failed', { error: e?.message || String(e) });
    } finally {
      inFlight = false;
    }
  };

  if (enabled) {
    timer = setInterval(() => { void run(); }, intervalMinutes * 60_000);
  }

  return {
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

