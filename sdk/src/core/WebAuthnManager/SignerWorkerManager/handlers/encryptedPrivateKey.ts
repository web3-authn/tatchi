import type { EncryptedKeyData } from '../../../IndexedDBManager/passkeyNearKeysDB';

export type EncryptedPrivateKeyCiphertext = {
  encryptedPrivateKeyData: string;
  encryptedPrivateKeyChacha20NonceB64u: string;
};

export function toEncryptedPrivateKeyCiphertext(
  encryptedKeyData: Pick<EncryptedKeyData, 'encryptedData' | 'chacha20NonceB64u' | 'iv'>,
): EncryptedPrivateKeyCiphertext {
  const nonce = encryptedKeyData.chacha20NonceB64u || encryptedKeyData.iv || '';
  return {
    encryptedPrivateKeyData: encryptedKeyData.encryptedData,
    encryptedPrivateKeyChacha20NonceB64u: nonce,
  };
}
