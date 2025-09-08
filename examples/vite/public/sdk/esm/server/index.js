import { validateConfigs } from "./core/config.js";
import { SHAMIR_P_B64U } from "./wasm_vrf_worker/wasm_vrf_worker.js";
import { Shamir3PassUtils, getShamirPB64uFromWasm } from "./core/shamirWorker.js";
import { AuthService } from "./core/AuthService.js";
import { handleVerifyAuthenticationResponse, verifyAuthenticationMiddleware } from "./core/verifyAuthenticationHandler.js";

export { AuthService, SHAMIR_P_B64U, Shamir3PassUtils, getShamirPB64uFromWasm, handleVerifyAuthenticationResponse, validateConfigs, verifyAuthenticationMiddleware };