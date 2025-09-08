import { validateNearAccountId } from "../../utils/validation.js";

//#region src/core/types/accountIds.ts
/**
* Convert and validate string to AccountId
* Validates proper NEAR account format (must contain at least one dot)
*/
function toAccountId(accountId) {
	const validation = validateNearAccountId(accountId);
	if (!validation.valid) throw new Error(`Invalid NEAR account ID: ${accountId}`);
	return accountId;
}

//#endregion
export { toAccountId };
//# sourceMappingURL=accountIds.js.map