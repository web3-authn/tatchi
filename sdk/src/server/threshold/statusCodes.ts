export type ThresholdEd25519RouteResult = { ok: boolean; code?: string };

export function thresholdEd25519StatusCode(result: ThresholdEd25519RouteResult): number {
  if (result.ok) return 200;
  switch (result.code) {
    case 'not_found':
      return 404;
    case 'not_implemented':
      return 501;
    case 'threshold_disabled':
      return 503;
    case 'internal':
      return 500;
    case 'unauthorized':
      return 401;
    default:
      return 400;
  }
}
