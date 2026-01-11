import type { AuthService } from '../../core/AuthService';
import { parseRecoverEmailRequest } from '../../email-recovery/emailParsers';
import type { RouterLogger } from '../logger';
import { coerceRouterLogger } from '../logger';
import type { EmailHandler, CfEmailMessage } from './types';
import { toSingleLine } from '../../../utils/validation';

function toEmailAddress(input: string): string {
  const trimmed = String(input || '').trim();
  const angleStart = trimmed.indexOf('<');
  const angleEnd = trimmed.indexOf('>');
  if (angleStart !== -1 && angleEnd > angleStart) {
    return trimmed.slice(angleStart + 1, angleEnd).trim().toLowerCase();
  }
  return trimmed.toLowerCase();
}

function toLowercaseHeaderRecord(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;

  const maybeHeaders = input as any;
  if (typeof maybeHeaders.forEach === 'function') {
    try {
      maybeHeaders.forEach((v: unknown, k: unknown) => {
        out[String(k).toLowerCase()] = String(v);
      });
      return out;
    } catch { }
  }

  if (typeof maybeHeaders[Symbol.iterator] === 'function') {
    try {
      for (const entry of maybeHeaders as Iterable<unknown>) {
        if (!Array.isArray(entry)) continue;
        const [k, v] = entry as any[];
        out[String(k).toLowerCase()] = String(v);
      }
      return out;
    } catch { }
  }

  if (typeof input === 'object') {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[String(k).toLowerCase()] = String(v);
    }
  }

  return out;
}

async function buildForwardableEmailPayloadFromCloudflareMessage(message: CfEmailMessage): Promise<{
  from: string;
  to: string;
  headers: Record<string, string>;
  raw: string;
  rawSize?: number;
}> {
  const from = String(message?.from || '');
  const to = String(message?.to || '');
  const headers = toLowercaseHeaderRecord((message as any)?.headers);

  let raw = '';
  try {
    raw = await new Response((message as any)?.raw).text();
  } catch { }

  const rawSize = typeof (message as any)?.rawSize === 'number' ? (message as any).rawSize : undefined;

  return { from, to, headers, raw, rawSize };
}

export interface CloudflareEmailHandlerOptions {
  /**
   * Optional recipient allowlist for emails processed by this handler (case-insensitive).
   * If unset, any `to` is accepted.
   */
  expectedRecipient?: string;
  /**
   * If true (default), unexpected recipients only log a warning (Cloudflare routing
   * is usually already scoped). If false, the handler rejects the email.
   */
  allowUnexpectedRecipient?: boolean;
  /**
   * When true, logs email metadata (from/to/subject). Defaults to false.
   */
  verbose?: boolean;
  // Optional logger; defaults to silent.
  logger?: RouterLogger | null;
}

export function createCloudflareEmailHandler(service: AuthService, opts: CloudflareEmailHandlerOptions = {}): EmailHandler {
  const logger = coerceRouterLogger(opts.logger);
  const expectedRecipient = toEmailAddress(opts.expectedRecipient || '');
  const allowUnexpectedRecipient = opts.allowUnexpectedRecipient !== false;
  const verbose = Boolean(opts.verbose);

  return async (message: CfEmailMessage): Promise<void> => {
    try {
      const payload = await buildForwardableEmailPayloadFromCloudflareMessage(message);

      const to = toEmailAddress(payload.to);
      if (expectedRecipient) {
        if (to !== expectedRecipient) {
          logger.warn('[email] unexpected recipient', { to, expectedRecipient });
          if (!allowUnexpectedRecipient) {
            message.setReject('Email recovery relayer rejected email: unexpected recipient');
            return;
          }
        }
      }

      if (verbose) {
        logger.info('[email] from/to', { from: payload.from, to: payload.to, subject: payload.headers['subject'] });
      }

      const parsed = parseRecoverEmailRequest(payload as any, { headers: payload.headers });
      if (!parsed.ok) {
        logger.warn('[email] rejecting', { code: parsed.code, message: parsed.message });
        message.setReject(`Email recovery relayer rejected email: ${parsed.message}`);
        return;
      }

      if (!service.emailRecovery) {
        logger.warn('[email] rejecting: EmailRecoveryService not configured');
        message.setReject('Email recovery relayer rejected email: email recovery service unavailable');
        return;
      }

      const result = await service.emailRecovery.requestEmailRecovery({
        accountId: parsed.accountId,
        emailBlob: parsed.emailBlob,
        explicitMode: parsed.explicitMode,
      });

      if (!result?.success) {
        logger.warn('[email] recovery failed', {
          accountId: parsed.accountId,
          error: result?.error || 'unknown',
          message: result?.message,
        });
        const reason = toSingleLine(result?.message || result?.error || 'recovery failed');
        message.setReject(`Email recovery relayer rejected email: ${reason}`);
        return;
      }

      logger.info('[email] recovery submitted', { accountId: parsed.accountId });
    } catch (e: any) {
      logger.error('[email] internal error', { message: e?.message || String(e) });
      message.setReject('Email recovery relayer rejected email: internal error');
    }
  };
}
