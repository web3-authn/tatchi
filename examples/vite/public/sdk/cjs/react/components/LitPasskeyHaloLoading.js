const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_index = require('../packages/passkey/src/core/WebAuthnManager/LitComponents/PasskeyHaloLoading/index.js');
const require_create_component = require('../node_modules/.pnpm/@lit_react@1.0.8_@types_react@19.1.12/node_modules/@lit/react/node/create-component.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);

//#region src/react/components/LitPasskeyHaloLoading.tsx
const LitPasskeyHaloLoading = require_create_component.t({
	react: react.default,
	tagName: "w3a-passkey-halo-loading",
	elementClass: require_index.default,
	displayName: "LitPasskeyHaloLoading"
});

//#endregion
exports.LitPasskeyHaloLoading = LitPasskeyHaloLoading;
//# sourceMappingURL=LitPasskeyHaloLoading.js.map