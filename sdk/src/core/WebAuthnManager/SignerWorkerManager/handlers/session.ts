
export function withSessionId<T extends object>(
  sessionId: string,
  payload: T,
): T & { sessionId: string } {

  if (!sessionId) {
    throw new Error('withSessionId: sessionId is required');
  }

  const existing = (payload as { sessionId?: unknown })?.sessionId;
  if (existing != null && typeof existing !== 'string') {
    throw new Error('withSessionId: payload.sessionId must be a string when provided');
  }
  if (existing && existing !== sessionId) {
    throw new Error(
      `withSessionId: payload.sessionId (${existing}) does not match provided sessionId (${sessionId})`,
    );
  }

  return { ...payload, sessionId };
}
