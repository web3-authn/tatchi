//#region src/core/types/actions.ts
/**
* Enum for all supported NEAR action types
* Provides type safety and better developer experience
*/
let ActionType = /* @__PURE__ */ function(ActionType$1) {
	ActionType$1["CreateAccount"] = "CreateAccount";
	ActionType$1["DeployContract"] = "DeployContract";
	ActionType$1["FunctionCall"] = "FunctionCall";
	ActionType$1["Transfer"] = "Transfer";
	ActionType$1["Stake"] = "Stake";
	ActionType$1["AddKey"] = "AddKey";
	ActionType$1["DeleteKey"] = "DeleteKey";
	ActionType$1["DeleteAccount"] = "DeleteAccount";
	return ActionType$1;
}({});
function toActionArgsWasm(action) {
	switch (action.type) {
		case ActionType.Transfer: return {
			action_type: ActionType.Transfer,
			deposit: action.amount
		};
		case ActionType.FunctionCall: return {
			action_type: ActionType.FunctionCall,
			method_name: action.methodName,
			args: JSON.stringify(action.args),
			gas: action.gas || "30000000000000",
			deposit: action.deposit || "0"
		};
		case ActionType.AddKey:
			const accessKey = {
				nonce: action.accessKey.nonce || 0,
				permission: action.accessKey.permission === "FullAccess" ? { FullAccess: {} } : action.accessKey.permission
			};
			return {
				action_type: ActionType.AddKey,
				public_key: action.publicKey,
				access_key: JSON.stringify(accessKey)
			};
		case ActionType.DeleteKey: return {
			action_type: ActionType.DeleteKey,
			public_key: action.publicKey
		};
		case ActionType.CreateAccount: return { action_type: ActionType.CreateAccount };
		case ActionType.DeleteAccount: return {
			action_type: ActionType.DeleteAccount,
			beneficiary_id: action.beneficiaryId
		};
		case ActionType.DeployContract: return {
			action_type: ActionType.DeployContract,
			code: typeof action.code === "string" ? Array.from(new TextEncoder().encode(action.code)) : Array.from(action.code)
		};
		case ActionType.Stake: return {
			action_type: ActionType.Stake,
			stake: action.stake,
			public_key: action.publicKey
		};
		default: throw new Error(`Action type ${action.type} is not supported`);
	}
}
/**
* Validate action parameters before sending to worker
*/
function validateActionArgsWasm(actionArgsWasm) {
	switch (actionArgsWasm.action_type) {
		case ActionType.FunctionCall:
			if (!actionArgsWasm.method_name) throw new Error("method_name required for FunctionCall");
			if (!actionArgsWasm.args) throw new Error("args required for FunctionCall");
			if (!actionArgsWasm.gas) throw new Error("gas required for FunctionCall");
			if (!actionArgsWasm.deposit) throw new Error("deposit required for FunctionCall");
			try {
				JSON.parse(actionArgsWasm.args);
			} catch {
				throw new Error("FunctionCall action args must be valid JSON string");
			}
			break;
		case ActionType.Transfer:
			if (!actionArgsWasm.deposit) throw new Error("deposit required for Transfer");
			break;
		case ActionType.CreateAccount: break;
		case ActionType.DeployContract:
			if (!actionArgsWasm.code || actionArgsWasm.code.length === 0) throw new Error("code required for DeployContract");
			break;
		case ActionType.Stake:
			if (!actionArgsWasm.stake) throw new Error("stake amount required for Stake");
			if (!actionArgsWasm.public_key) throw new Error("public_key required for Stake");
			break;
		case ActionType.AddKey:
			if (!actionArgsWasm.public_key) throw new Error("public_key required for AddKey");
			if (!actionArgsWasm.access_key) throw new Error("access_key required for AddKey");
			break;
		case ActionType.DeleteKey:
			if (!actionArgsWasm.public_key) throw new Error("public_key required for DeleteKey");
			break;
		case ActionType.DeleteAccount:
			if (!actionArgsWasm.beneficiary_id) throw new Error("beneficiary_id required for DeleteAccount");
			break;
		default: throw new Error(`Unsupported action type: ${actionArgsWasm.action_type}`);
	}
}

//#endregion
export { ActionType, toActionArgsWasm, validateActionArgsWasm };
//# sourceMappingURL=actions.js.map