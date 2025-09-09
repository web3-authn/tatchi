
// import { SIGNER_WORKER_MANAGER_CONFIG } from "../../../../config";
// import { SignedTransaction, type NearClient } from '../../../NearClient';
// import { WorkerRequestType, isSignVerifyAndRegisterUserSuccess } from '../../../types/signer-worker';
// import { toEnumUserVerificationPolicy } from '../../../types/authenticatorOptions';
// import { VRFChallenge } from '../../../types/vrf-worker';
// import { AccountId } from "../../../types/accountIds";

// import type { onProgressEvents } from '../../../types/passkeyManager';
// import type { AuthenticatorOptions } from '../../../types/authenticatorOptions';
// import { SignerWorkerManagerContext } from '..';
// import { RegistrationInfoStruct } from "@/wasm_signer_worker/wasm_signer_worker";

/*
* DEPRECATED: Replaced by relayer to atomically create account and register user in one step
* Retained for historical reference
*/


// export async function signVerifyAndRegisterUser({
//   ctx,
//   vrfChallenge,
//   contractId,
//   deterministicVrfPublicKey,
//   nearAccountId,
//   nearPublicKeyStr,
//   nearClient,
//   nearRpcUrl,
//   deviceNumber = 1, // Default to device number 1 for first device (1-indexed)
//   authenticatorOptions,
//   onEvent,
// }: {
//   ctx: SignerWorkerManagerContext,
//   vrfChallenge: VRFChallenge,
//   contractId: string;
//   deterministicVrfPublicKey: string; // Required deterministic VRF key for dual registration
//   nearAccountId: AccountId;
//   nearPublicKeyStr: string;
//   nearClient: NearClient; // NEAR RPC client for getting transaction metadata
//   nearRpcUrl: string; // NEAR RPC URL for contract verification
//   deviceNumber?: number; // Device number for multi-device support (defaults to 1)
//   authenticatorOptions?: AuthenticatorOptions; // Authenticator options for registration
//   onEvent?: (update: onProgressEvents) => void;
// }): Promise<{
//   verified: boolean;
//   registrationInfo?: RegistrationInfoStruct;
//   logs?: string[];
//   signedTransaction: SignedTransaction;
//   preSignedDeleteTransaction: SignedTransaction | null;
// }> {
//   try {
//     console.info('WebAuthnManager: Starting on-chain user registration with transaction');

//     if (!nearPublicKeyStr) {
//       throw new Error('Client NEAR public key not provided - cannot get access key nonce');
//     }

//     // Retrieve encrypted key data from IndexedDB in main thread
//     console.debug('WebAuthnManager: Retrieving encrypted key from IndexedDB for account:', nearAccountId);
//     const encryptedKeyData = await ctx.indexedDB.nearKeysDB.getEncryptedKey(nearAccountId);
//     if (!encryptedKeyData) {
//       throw new Error(`No encrypted key found for account: ${nearAccountId}`);
//     }

//     let accessKeyInfo: any;
//     let nextNonce: string;
//     let txBlockHash: string;
//     let txBlockHeight: string;
//     try {
//       const ctxData = await ctx.nonceManager.getNonceBlockHashAndHeight(nearClient);
//       accessKeyInfo = ctxData.accessKeyInfo;
//       nextNonce = ctxData.nextNonce;
//       txBlockHash = ctxData.txBlockHash;
//       txBlockHeight = ctxData.txBlockHeight;
//     } catch (e) {
//       // Fallback when NonceManager is not initialized yet (common during registration)
//       const [ak, blockInfo] = await Promise.all([
//         nearClient.viewAccessKey(nearAccountId, nearPublicKeyStr),
//         nearClient.viewBlock({ finality: 'final' })
//       ]);
//       if (!ak || ak.nonce === undefined) {
//         throw new Error(`Access key not found or invalid for account ${nearAccountId}`);
//       }
//       if (!blockInfo?.header?.hash || blockInfo?.header?.height === undefined) {
//         throw new Error('Failed to fetch Block Info');
//       }
//       accessKeyInfo = ak;
//       nextNonce = (BigInt(ak.nonce) + 1n).toString();
//       txBlockHash = blockInfo.header.hash;
//       txBlockHeight = String(blockInfo.header.height);
//     }

//     // Step 2: Execute registration transaction via WASM
//     // Credentials will be collected during the confirmation flow
//     const response = await ctx.sendMessage({
//       message: {
//         type: WorkerRequestType.SignVerifyAndRegisterUser,
//         payload: {
//           verification: {
//             contractId: contractId,
//             nearRpcUrl: nearRpcUrl,
//             vrfChallenge: vrfChallenge,
//           },
//           decryption: {
//             encryptedPrivateKeyData: encryptedKeyData.encryptedData,
//             encryptedPrivateKeyIv: encryptedKeyData.iv
//           },
//           registration: {
//             nearAccountId,
//             nonce: nextNonce,
//             blockHash: txBlockHash,
//             deterministicVrfPublicKey,
//             deviceNumber, // Pass device number for multi-device support
//             authenticatorOptions: authenticatorOptions ? {
//               userVerification: toEnumUserVerificationPolicy(authenticatorOptions.userVerification),
//               originPolicy: authenticatorOptions.originPolicy,
//             } : undefined
//           },
//         }
//       },
//       onEvent,
//       timeoutMs: SIGNER_WORKER_MANAGER_CONFIG.TIMEOUTS.REGISTRATION
//     });

//     if (isSignVerifyAndRegisterUserSuccess(response)) {
//       console.debug('WebAuthnManager: On-chain user registration transaction successful');
//       const wasmResult = response.payload;
//       return {
//         verified: wasmResult.verified,
//         registrationInfo: wasmResult.registrationInfo,
//         logs: wasmResult.logs,
//         signedTransaction: new SignedTransaction({
//           transaction: wasmResult.signedTransaction!.transaction,
//           signature: wasmResult.signedTransaction!.signature,
//           borsh_bytes: Array.from(wasmResult.signedTransaction!.borshBytes || [])
//         }),
//         preSignedDeleteTransaction: wasmResult.preSignedDeleteTransaction
//           ? new SignedTransaction({
//               transaction: wasmResult.preSignedDeleteTransaction.transaction,
//               signature: wasmResult.preSignedDeleteTransaction.signature,
//               borsh_bytes: Array.from(wasmResult.preSignedDeleteTransaction.borshBytes || [])
//             })
//           : null
//       };
//     } else {
//       console.error('WebAuthnManager: On-chain user registration transaction failed:', response);
//       throw new Error('On-chain user registration transaction failed');
//     }
//   } catch (error: any) {
//     console.error('WebAuthnManager: On-chain user registration error:', error);
//     throw error;
//   }
// }
