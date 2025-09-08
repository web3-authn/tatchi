
//#region src/react/components/theme/utils.ts
function deepMerge(target, source) {
	const out = Array.isArray(target) ? [...target] : { ...target };
	Object.entries(source).forEach(([key, value]) => {
		if (value && typeof value === "object" && !Array.isArray(value)) out[key] = deepMerge(out[key] || {}, value);
		else if (value !== void 0) out[key] = value;
	});
	return out;
}
function createCSSVariables(tokens, prefix = "--w3a") {
	const vars = {};
	Object.entries(tokens.colors).forEach(([k, v]) => {
		vars[`${prefix}-colors-${k}`] = String(v);
	});
	Object.entries(tokens.spacing).forEach(([k, v]) => {
		vars[`${prefix}-spacing-${k}`] = String(v);
	});
	Object.entries(tokens.borderRadius).forEach(([k, v]) => {
		vars[`${prefix}-border-radius-${k}`] = String(v);
	});
	Object.entries(tokens.shadows).forEach(([k, v]) => {
		vars[`${prefix}-shadows-${k}`] = String(v);
	});
	const style = {};
	Object.entries(vars).forEach(([k, v]) => {
		style[k] = v;
	});
	return style;
}
function mergeTokens(base, override) {
	if (!override) return base;
	return deepMerge(base, override);
}

//#endregion
exports.createCSSVariables = createCSSVariables;
exports.mergeTokens = mergeTokens;
//# sourceMappingURL=utils.js.map