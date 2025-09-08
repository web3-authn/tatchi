import { toAccountId } from "./core/types/accountIds.js";
import { base64UrlDecode, base64UrlEncode } from "./utils/base64.js";
import { DEVICE_LINKING_CONFIG, SIGNER_WORKER_MANAGER_CONFIG } from "./config.js";
import { DEFAULT_WAIT_STATUS } from "./core/types/rpc.js";
import { MinimalNearClient } from "./core/NearClient.js";
import { ActionType } from "./core/types/actions.js";
import { WebAuthnManager } from "./core/WebAuthnManager/index.js";
import { DeviceLinkingPhase, DeviceLinkingStatus } from "./core/types/passkeyManager.js";
import { verifyAuthenticationResponse } from "./core/PasskeyManager/login.js";
import { AccountRecoveryFlow } from "./core/PasskeyManager/recoverAccount.js";
import { LinkDeviceFlow } from "./core/PasskeyManager/linkDevice.js";
import { PasskeyManager } from "./core/PasskeyManager/index.js";
import { validateConfigs } from "./server/core/config.js";
import { AuthService } from "./server/core/AuthService.js";

export { AccountRecoveryFlow, ActionType, AuthService, DEFAULT_WAIT_STATUS, DEVICE_LINKING_CONFIG, DeviceLinkingPhase, DeviceLinkingStatus, LinkDeviceFlow, MinimalNearClient, PasskeyManager, SIGNER_WORKER_MANAGER_CONFIG, WebAuthnManager, base64UrlDecode, base64UrlEncode, toAccountId, validateConfigs, verifyAuthenticationResponse };