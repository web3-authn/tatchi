import {
  SecureConfirmRequest,
  SecureConfirmationType,
  SignTransactionPayload,
  RegisterAccountPayload,
  SignNep413Payload,
} from '../types';

export function getNearAccountId(request: SecureConfirmRequest): string {
  switch (request.type) {
    case SecureConfirmationType.SIGN_TRANSACTION:
      return getSignTransactionPayload(request).rpcCall.nearAccountId;
    case SecureConfirmationType.SIGN_NEP413_MESSAGE:
      return (request.payload as SignNep413Payload).nearAccountId;
    case SecureConfirmationType.REGISTER_ACCOUNT:
    case SecureConfirmationType.LINK_DEVICE:
      return getRegisterAccountPayload(request).nearAccountId;
    case SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF: {
      const p = request.payload as { nearAccountId?: string };
      return p?.nearAccountId || '';
    }
    case SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI: {
      const p = request.payload as { nearAccountId?: string };
      return p?.nearAccountId || '';
    }
    default:
      return '';
  }
}

export function getTxCount(request: SecureConfirmRequest): number {
  return request.type === SecureConfirmationType.SIGN_TRANSACTION
    ? (getSignTransactionPayload(request).txSigningRequests?.length || 1)
    : 1;
}

export function getIntentDigest(request: SecureConfirmRequest): string | undefined {
  if (request.type === SecureConfirmationType.SIGN_TRANSACTION) {
    const p = request?.payload as Partial<SignTransactionPayload> | undefined;
    return p?.intentDigest;
  }
  return request?.intentDigest;
}

export function getSignTransactionPayload(request: SecureConfirmRequest): SignTransactionPayload {
  if (request.type !== SecureConfirmationType.SIGN_TRANSACTION) {
    throw new Error(`Expected SIGN_TRANSACTION request, got ${request.type}`);
  }
  return request.payload as SignTransactionPayload;
}

export function getRegisterAccountPayload(request: SecureConfirmRequest): RegisterAccountPayload {
  if (request.type !== SecureConfirmationType.REGISTER_ACCOUNT && request.type !== SecureConfirmationType.LINK_DEVICE) {
    throw new Error(`Expected REGISTER_ACCOUNT or LINK_DEVICE request, got ${request.type}`);
  }
  return request.payload as RegisterAccountPayload;
}

