const require_config = require('./core/config.js');
const require_wasm_vrf_worker = require('./wasm_vrf_worker/wasm_vrf_worker.js');
const require_shamirWorker = require('./core/shamirWorker.js');
const require_AuthService = require('./core/AuthService.js');
const require_verifyAuthenticationHandler = require('./core/verifyAuthenticationHandler.js');

exports.AuthService = require_AuthService.AuthService;
exports.SHAMIR_P_B64U = require_wasm_vrf_worker.SHAMIR_P_B64U;
exports.Shamir3PassUtils = require_shamirWorker.Shamir3PassUtils;
exports.getShamirPB64uFromWasm = require_shamirWorker.getShamirPB64uFromWasm;
exports.handleVerifyAuthenticationResponse = require_verifyAuthenticationHandler.handleVerifyAuthenticationResponse;
exports.validateConfigs = require_config.validateConfigs;
exports.verifyAuthenticationMiddleware = require_verifyAuthenticationHandler.verifyAuthenticationMiddleware;