
export interface SessionConfig {
  jwt?: {
    /** Required: JWT signing hook; return a complete token */
    signToken?: (input: { header: Record<string, unknown>; payload: Record<string, unknown> }) => Promise<string> | string;
    /** Required: JWT verification hook */
    verifyToken?: (token: string) => Promise<{ valid: boolean; payload?: any }> | { valid: boolean; payload?: any };
    /** Optional: sliding refresh window (seconds) to allow /session/refresh before exp, default 900 (15 min) */
    refreshWindowSec?: number;
    /** Optional: build additional claims to include in the payload */
    buildClaims?: (input: { sub: string; context?: Record<string, unknown> }) => Promise<Record<string, unknown> | void> | Record<string, unknown> | void;
  };
  cookie?: {
    /** Cookie name. Default: 'w3a_session' */
    name?: string;
    /** Optional override: build Set-Cookie header for a new token */
    buildSetHeader?: (token: string) => string;
    /** Optional override: build Set-Cookie header that clears the cookie */
    buildClearHeader?: () => string;
    /** Optional override: extract token from headers (Authorization/Cookie) */
    extractToken?: (headers: Record<string, string | string[] | undefined>, cookieName: string) => string | null;
  };
}

export class SessionService<TClaims extends Record<string, unknown> = Record<string, unknown>> {
  private cfg: NonNullable<SessionConfig>;

  constructor(cfg: NonNullable<SessionConfig>) {
    this.cfg = cfg || ({} as any);
  }

  getCookieName(): string {
    return this.cfg?.cookie?.name || 'w3a_session';
  }

  buildSetCookie(token: string): string {
    if (this.cfg?.cookie?.buildSetHeader) return this.cfg.cookie.buildSetHeader(token);
    const name = this.getCookieName();
    const cookieParts = [`${name}=${token}`];
    const path = '/';
    const httpOnly = true;
    const secure = true; // default secure
    const sameSite = 'Lax';
    const maxAge = 24 * 3600; // 1 day default
    cookieParts.push(`Path=${path}`);
    if (httpOnly) cookieParts.push('HttpOnly');
    if (secure) cookieParts.push('Secure');
    if (sameSite) cookieParts.push(`SameSite=${sameSite}`);
    if (maxAge) {
      cookieParts.push(`Max-Age=${maxAge}`);
      const expires = new Date(Date.now() + (maxAge * 1000)).toUTCString();
      cookieParts.push(`Expires=${expires}`);
    }
    return cookieParts.join('; ');
  }

  buildClearCookie(): string {
    if (this.cfg?.cookie?.buildClearHeader) return this.cfg.cookie.buildClearHeader();
    const name = this.getCookieName();
    const path = '/';
    const secure = true;
    const httpOnly = true;
    const parts = [
      `${name}=`,
      `Path=${path}`,
      'Max-Age=0',
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    ];
    if (httpOnly) parts.push('HttpOnly');
    if (secure) parts.push('Secure');
    const sameSite = 'Lax';
    if (sameSite) parts.push(`SameSite=${sameSite}`);
    return parts.join('; ');
  }

  /** Sign a JWT with configured algorithm. Adds iat/exp and copies iss/aud. */
  async signJwt(sub: string, extraClaims?: Record<string, unknown>): Promise<string> {
    const jwt = this.cfg?.jwt || {};
    const built = await Promise.resolve(jwt.buildClaims?.({ sub, context: extraClaims })) || {};
    const payload = { sub, ...(extraClaims || {}), ...(built || {}) } as Record<string, unknown>;
    if (typeof jwt.signToken === 'function') {
      // Full override of signing: user supplies the complete token
      const token = await Promise.resolve(jwt.signToken({ header: { typ: 'JWT' }, payload } as any));
      return token;
    }
    throw new Error('SessionService: No JWT signing hook or provider configured');
  }

  /** Verify signature and expiration. Returns payload on success. */
  async verifyJwt(token: string): Promise<{ valid: boolean; payload?: any }> {
    const verify = this.cfg?.jwt?.verifyToken;
    if (typeof verify !== 'function') return { valid: false };
    return await Promise.resolve(verify(token));
  }

  parse(
    headers: Record<string, string | string[] | undefined>
  ): Promise<{ ok: true; claims: TClaims } | { ok: false }> {
    const authHeader = (headers['authorization'] || headers['Authorization']) as string | undefined;
    let token: string | null = null;
    if (authHeader && /^Bearer\s+/.test(authHeader)) token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const cookieHeader = (headers['cookie'] || headers['Cookie']) as string | undefined;
    if (!token && cookieHeader) {
      const name = this.getCookieName();
      for (const part of cookieHeader.split(';')) {
        const [k, v] = part.split('=');
        if (k && k.trim() === name) { token = (v || '').trim(); break; }
      }
    }
    if (!token) return Promise.resolve({ ok: false });
    return this.verifyJwt(token).then(v =>
      v.valid
        ? { ok: true, claims: v.payload as TClaims }
        : { ok: false }
    );
  }

  // === token helpers ===
  extractTokenFromHeaders(headers: Record<string, string | string[] | undefined>): string | null {
    if (this.cfg?.cookie?.extractToken) return this.cfg.cookie.extractToken(headers, this.getCookieName());
    const authHeader = (headers['authorization'] || headers['Authorization']) as string | undefined;
    if (authHeader && /^Bearer\s+/.test(authHeader)) return authHeader.replace(/^Bearer\s+/i, '').trim();
    const cookieHeader = (headers['cookie'] || headers['Cookie']) as string | undefined;
    if (cookieHeader) {
      const name = this.getCookieName();
      for (const part of cookieHeader.split(';')) {
        const [k, v] = part.split('=');
        if (k && k.trim() === name) return (v || '').trim();
      }
    }
    return null;
  }

  async refresh(headers: Record<string, string | string[] | undefined>): Promise<{ ok: boolean; jwt?: string; code?: string; message?: string }>{
    try {
      const token = this.extractTokenFromHeaders(headers);
      if (!token) return { ok: false, code: 'unauthorized', message: 'No session token' };
      const v = await this.verifyJwt(token);
      if (!v.valid) return { ok: false, code: 'unauthorized', message: 'Invalid token' };
      const payload: any = v.payload || {};
      if (!this.isWithinRefreshWindow(payload)) return { ok: false, code: 'not_eligible', message: 'Not within refresh window' };
      const sub = String(payload.sub || '');
      if (!sub) return { ok: false, code: 'invalid_claims', message: 'Missing sub claim' };
      const next = await this.signJwt(sub);
      return { ok: true, jwt: next };
    } catch (e: any) {
      return { ok: false, code: 'internal', message: e?.message || 'Refresh failed' };
    }
  }

  nowSeconds(): number { return Math.floor(Date.now() / 1000); }

  private isWithinRefreshWindow(payload: any): boolean {
    try {
      const now = this.nowSeconds();
      const exp = Number(payload?.exp || 0);
      if (!exp || now >= exp) return false; // no refresh if already expired
      const windowSec = Number(this.cfg?.jwt?.refreshWindowSec || 15 * 60);
      return (exp - now) <= windowSec;
    } catch { return false; }
  }
}

/*
 * Utility: parse comma-separated list of origins into a normalized unique list
 * - canonicalizes to protocol + host + optional port
 * - lowercases host, strips path/query/hash, trims spaces/trailing slashes
 */
export function parseCsvList(input?: string): string[] {
  const out = new Set<string>();
  for (const raw of String(input || '').split(',')) {
    const s = raw.trim();
    if (!s) continue;
    try {
      const u = new URL(s);
      const host = u.hostname.toLowerCase();
      const port = u.port ? `:${u.port}` : '';
      const proto = u.protocol === 'http:' || u.protocol === 'https:' ? u.protocol : 'https:';
      out.add(`${proto}//${host}${port}`);
    } catch {
      const stripped = s.replace(/\/$/, '');
      if (stripped) out.add(stripped);
    }
  }
  return Array.from(out);
}

/*
 * Utility: merge multiple CSV lists of origins and return normalized list or '*'
 */
export function buildCorsOrigins(...inputs: Array<string | undefined>): string[] | '*' {
  const merged = new Set<string>();
  for (const input of inputs) {
    for (const origin of parseCsvList(input)) merged.add(origin);
  }
  const list = Array.from(merged);
  return list.length > 0 ? list : '*';
}
