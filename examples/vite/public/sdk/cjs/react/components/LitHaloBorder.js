const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_index = require('../packages/passkey/src/core/WebAuthnManager/LitComponents/HaloBorder/index.js');
const require_create_component = require('../node_modules/.pnpm/@lit_react@1.0.8_@types_react@19.1.12/node_modules/@lit/react/node/create-component.js');
let react = require("react");
react = require_rolldown_runtime.__toESM(react);

//#region src/react/components/LitHaloBorder.tsx
const LitHaloBorder = require_create_component.t({
	react: react.default,
	tagName: "w3a-halo-border",
	elementClass: require_index.default,
	displayName: "LitHaloBorder"
});

//#endregion
exports.LitHaloBorder = LitHaloBorder;
//# sourceMappingURL=LitHaloBorder.js.map