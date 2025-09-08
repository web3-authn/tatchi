
//#region src/server/core/config.ts
function validateConfigs(config) {
	const requiredConfigVars = [
		"relayerAccountId",
		"relayerPrivateKey",
		"webAuthnContractId",
		"shamir_p_b64u",
		"shamir_e_s_b64u",
		"shamir_d_s_b64u"
	];
	for (const key of requiredConfigVars) if (!config[key]) throw new Error(`Missing required config variable: ${key}`);
	if (!config.relayerPrivateKey?.startsWith("ed25519:")) throw new Error("Relayer private key must be in format \"ed25519:base58privatekey\"");
}

//#endregion
exports.validateConfigs = validateConfigs;
//# sourceMappingURL=config.js.map