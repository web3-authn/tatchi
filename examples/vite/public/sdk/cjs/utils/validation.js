
//#region src/utils/validation.ts
/**
* Validate NEAR account ID format with optional suffix restrictions
* @param nearAccountId - The account ID to validate
* @param options - Optional validation constraints
*/
function validateNearAccountId(nearAccountId, options = {
	allowedSuffixes: ["testnet", "near"],
	requireTopLevelDomain: false
}) {
	if (!nearAccountId || typeof nearAccountId !== "string") return {
		valid: false,
		error: "Account ID must be a non-empty string"
	};
	const parts = nearAccountId.split(".");
	if (parts.length < 2) return {
		valid: false,
		error: "Account ID must contain at least one dot (e.g., username.testnet)"
	};
	if (options.requireTopLevelDomain && parts.length !== 2) {
		const suffixList = options.allowedSuffixes?.join(", ") || "valid suffixes";
		return {
			valid: false,
			error: `Invalid NEAR account ID format. Expected format: <username>.<suffix> where suffix is one of: ${suffixList}`
		};
	}
	const username = parts[0];
	const suffix = parts[parts.length - 1];
	const domain = parts.slice(1).join(".");
	if (!username || username.length === 0) return {
		valid: false,
		error: "Username part cannot be empty"
	};
	if (!/^[a-z0-9_\-]+$/.test(username)) return {
		valid: false,
		error: "Username can only contain lowercase letters, numbers, underscores, and hyphens"
	};
	if (!domain || domain.length === 0) return {
		valid: false,
		error: "Domain part cannot be empty"
	};
	if (options.allowedSuffixes && options.allowedSuffixes.length > 0) {
		const matchesAnySuffix = options.allowedSuffixes.some((allowedSuffix) => {
			if (!allowedSuffix.includes(".")) return suffix === allowedSuffix;
			return nearAccountId.endsWith(`.${allowedSuffix}`);
		});
		if (!matchesAnySuffix) return {
			valid: false,
			error: `Invalid NEAR account ID suffix. Expected account to end with one of: ${options.allowedSuffixes.join(", ")}`
		};
	}
	return { valid: true };
}

//#endregion
exports.validateNearAccountId = validateNearAccountId;
//# sourceMappingURL=validation.js.map