export enum EmailRecoveryErrorCode {
  REGISTRATION_NOT_VERIFIED = 'EMAIL_RECOVERY_REGISTRATION_NOT_VERIFIED',
  VRF_CHALLENGE_EXPIRED = 'EMAIL_RECOVERY_VRF_CHALLENGE_EXPIRED',
}

export class EmailRecoveryError extends Error {
  public readonly code: EmailRecoveryErrorCode;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, code: EmailRecoveryErrorCode, context?: Record<string, unknown>) {
    super(message);
    this.name = 'EmailRecoveryError';
    this.code = code;
    this.context = context;
  }
}

