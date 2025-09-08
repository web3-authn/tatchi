
//#region src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/iframe-geometry.ts
/**
* Rounding & pixel-snapping strategy
*
* DOM measurements from getBoundingClientRect() often contain fractional values
* (e.g., width: 200.4px). If these are rounded the wrong way, the iframe that
* hosts the embedded UI can end up undersized by up to 1px, which manifests as
* a faint scrollbar or a clipped tooltip.
*
* To avoid this, we follow these rules across the embedded tooltip flow:
* - Positions (x, y): Math.floor — never extend negative space; align to pixels.
* - Sizes (width, height): Math.ceil — never shrink rectangles; ensure fit.
*
* The embedded element applies this when constructing TooltipGeometry from
* DOMRects. See EmbeddedTxButton.ts (buildGeometry).
* On the host side, computeExpandedIframeSizeFromGeometryPure()
* already uses Math.ceil on the right/bottom edges as a second line of defense.
*/
/**
* IframeClipPathGenerator creates precise clip-path polygons for button + tooltip unions.
* Supports all 8 tooltip positions with optimized shape algorithms.
*/
var IframeClipPathGenerator = class {
	static generateUnion(geometry, paddingPx = 0) {
		const pad = (r) => ({
			x: r.x - paddingPx,
			y: r.y - paddingPx,
			width: r.width + 2 * paddingPx,
			height: r.height + 2 * paddingPx,
			borderRadius: r.borderRadius
		});
		const button = paddingPx ? pad(geometry.button) : geometry.button;
		const tooltip = paddingPx ? pad(geometry.tooltip) : geometry.tooltip;
		const { position, gap } = geometry;
		if (!CSS.supports("clip-path: polygon(0 0)")) {
			console.warn("clip-path not supported, skipping shape generation");
			return "";
		}
		switch (position) {
			case "top-left": {
				const upper = button.y <= tooltip.y ? button : tooltip;
				const lower = upper === button ? tooltip : button;
				return this.generateVerticalLUnion(upper, lower, "left");
			}
			case "top-center": return this.generateTopCenterUnion(button, tooltip, gap);
			case "top-right": {
				const upper = button.y <= tooltip.y ? button : tooltip;
				const lower = upper === button ? tooltip : button;
				return this.generateVerticalLUnion(upper, lower, "right");
			}
			case "left": return this.generateLeftUnion(button, tooltip, gap);
			case "right": return this.generateRightUnion(button, tooltip, gap);
			case "bottom-left": {
				const upper = button.y <= tooltip.y ? button : tooltip;
				const lower = upper === button ? tooltip : button;
				return this.generateVerticalLUnion(upper, lower, "left");
			}
			case "bottom-center": return this.generateBottomCenterUnion(button, tooltip, gap);
			case "bottom-right": {
				const upper = button.y <= tooltip.y ? button : tooltip;
				const lower = upper === button ? tooltip : button;
				return this.generateVerticalLUnion(upper, lower, "right");
			}
			default:
				console.warn(`Unknown tooltip position: ${position}`);
				return this.generateTopCenterUnion(button, tooltip, gap);
		}
	}
	/**
	* Build an L-shaped rectilinear polygon for two vertically stacked rectangles (upper over lower).
	* The hingeSide selects which side (left|right) the connecting corridor should hug to avoid
	* capturing the opposite empty corner.
	*/
	static generateVerticalLUnion(upper, lower, hingeSide) {
		if (upper.y > lower.y) {
			const tmp = upper;
			upper = lower;
			lower = tmp;
		}
		const uL = upper.x;
		const uR = upper.x + upper.width;
		const uT = upper.y;
		const uB = upper.y + upper.height;
		const lL = lower.x;
		const lR = lower.x + lower.width;
		const lT = lower.y;
		const lB = lower.y + lower.height;
		const overlapY = Math.max(0, Math.min(uB, lB) - Math.max(uT, lT));
		if (overlapY > 0) {
			const minX = Math.min(uL, lL);
			const maxX = Math.max(uR, lR);
			const minY = Math.min(uT, lT);
			const maxY = Math.max(uB, lB);
			return `polygon(${minX}px ${minY}px, ${maxX}px ${minY}px, ${maxX}px ${maxY}px, ${minX}px ${maxY}px)`;
		}
		let points = [];
		if (hingeSide === "left") points = [
			{
				x: uL,
				y: uT
			},
			{
				x: uR,
				y: uT
			},
			{
				x: uR,
				y: uB
			},
			{
				x: uL,
				y: uB
			},
			{
				x: lL,
				y: uB
			},
			{
				x: lL,
				y: lB
			},
			{
				x: lR,
				y: lB
			},
			{
				x: lR,
				y: lT
			},
			{
				x: uL,
				y: lT
			},
			{
				x: uL,
				y: uT
			}
		];
		else points = [
			{
				x: uL,
				y: uT
			},
			{
				x: uR,
				y: uT
			},
			{
				x: uR,
				y: uB
			},
			{
				x: lR,
				y: uB
			},
			{
				x: lR,
				y: lB
			},
			{
				x: lL,
				y: lB
			},
			{
				x: lL,
				y: lT
			},
			{
				x: uR,
				y: lT
			},
			{
				x: uR,
				y: uT
			},
			{
				x: uL,
				y: uT
			}
		];
		const deduped = points.filter((p, i, arr) => i === 0 || !(p.x === arr[i - 1].x && p.y === arr[i - 1].y));
		const coords = deduped.map((p) => `${p.x}px ${p.y}px`).join(", ");
		return `polygon(${coords})`;
	}
	static generateTopCenterUnion(button, tooltip, gap) {
		const minX = Math.min(button.x, tooltip.x);
		const maxX = Math.max(button.x + button.width, tooltip.x + tooltip.width);
		const minY = tooltip.y;
		const maxY = button.y + button.height;
		const borderRadius = 2;
		const width = maxX - minX;
		const height = maxY - minY;
		return `polygon(${this.createRoundedRect(minX, minY, width, height, borderRadius)})`;
	}
	static generateBottomCenterUnion(button, tooltip, gap) {
		const minX = Math.min(button.x, tooltip.x);
		const maxX = Math.max(button.x + button.width, tooltip.x + tooltip.width);
		const minY = button.y;
		const maxY = tooltip.y + tooltip.height;
		const borderRadius = 2;
		const width = maxX - minX;
		const height = maxY - minY;
		return `polygon(${this.createRoundedRect(minX, minY, width, height, borderRadius)})`;
	}
	static generateLeftUnion(button, tooltip, gap) {
		const minX = tooltip.x;
		const maxX = button.x + button.width;
		const minY = Math.min(button.y, tooltip.y);
		const maxY = Math.max(button.y + button.height, tooltip.y + tooltip.height);
		const borderRadius = 2;
		const width = maxX - minX;
		const height = maxY - minY;
		return `polygon(${this.createRoundedRect(minX, minY, width, height, borderRadius)})`;
	}
	static generateRightUnion(button, tooltip, gap) {
		const minX = button.x;
		const maxX = tooltip.x + tooltip.width;
		const minY = Math.min(button.y, tooltip.y);
		const maxY = Math.max(button.y + button.height, tooltip.y + tooltip.height);
		const borderRadius = 2;
		const width = maxX - minX;
		const height = maxY - minY;
		return `polygon(${this.createRoundedRect(minX, minY, width, height, borderRadius)})`;
	}
	static createRoundedRect(x, y, width, height, radius) {
		const r = Math.min(radius, width / 2, height / 2);
		return [
			`${x + r}px ${y}px`,
			`${x + width - r}px ${y}px`,
			`${x + width}px ${y + r}px`,
			`${x + width}px ${y + height - r}px`,
			`${x + width - r}px ${y + height}px`,
			`${x + r}px ${y + height}px`,
			`${x}px ${y + height - r}px`,
			`${x}px ${y + r}px`
		].join(", ");
	}
	static buildButtonClipPathPure(rect, paddingPx = 0) {
		const x = rect.x - paddingPx;
		const y = rect.y - paddingPx;
		const width = rect.width + 2 * paddingPx;
		const height = rect.height + 2 * paddingPx;
		const clipPath = `polygon(${x}px ${y}px, ${x + width}px ${y}px, ${x + width}px ${y + height}px, ${x}px ${y + height}px)`;
		return clipPath;
	}
};
function toPx(v) {
	return typeof v === "number" ? `${v}px` : v;
}
function utilParsePx(value) {
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		if (value === "auto") throw new Error("Cannot parse \"auto\" value for pixel calculations. Please provide a specific pixel value.");
		const match = value.match(/^(\d+(?:\.\d+)?)px$/);
		if (match) return parseFloat(match[1]);
		throw new Error(`Invalid pixel value: "${value}". Expected format: "123px" or numeric value.`);
	}
	return 0;
}
function computeIframeSizePure(input) {
	const p = input.paddingPx ?? 8;
	const { buttonWidthPx: bw, buttonHeightPx: bh, tooltipWidthPx: tw, tooltipHeightPx: th, offsetPx: o, position } = input;
	let width = 0, height = 0, buttonPositionX = 0, buttonPositionY = 0;
	let flushClass = "flush-top-center";
	switch (position) {
		case "top-left":
			flushClass = "flush-bottom-left";
			width = Math.max(bw, tw) + p;
			height = bh + o + th + p;
			buttonPositionX = 0;
			buttonPositionY = th + o;
			break;
		case "top-center":
			flushClass = "flush-bottom-center";
			width = Math.max(bw, tw) + p;
			height = bh + o + th + p;
			buttonPositionX = (width - bw) / 2;
			buttonPositionY = th + o;
			break;
		case "top-right":
			flushClass = "flush-bottom-right";
			width = Math.max(bw, tw) + p;
			height = bh + o + th + p;
			buttonPositionX = width - bw;
			buttonPositionY = th + o;
			break;
		case "left":
			flushClass = "flush-right";
			width = tw + o + bw + p;
			height = Math.max(bh, th) + p;
			buttonPositionX = tw + o;
			buttonPositionY = (height - bh) / 2;
			break;
		case "right":
			flushClass = "flush-left";
			width = bw + o + tw + p;
			height = Math.max(bh, th) + p;
			buttonPositionX = 0;
			buttonPositionY = (height - bh) / 2;
			break;
		case "bottom-left":
			flushClass = "flush-top-left";
			width = Math.max(bw, tw) + p;
			height = bh + o + th + p;
			buttonPositionX = 0;
			buttonPositionY = 0;
			break;
		case "bottom-center":
			flushClass = "flush-top-center";
			width = Math.max(bw, tw) + p;
			height = bh + o + th + p;
			buttonPositionX = (width - bw) / 2;
			buttonPositionY = 0;
			break;
		case "bottom-right":
			flushClass = "flush-top-right";
			width = Math.max(bw, tw) + p;
			height = bh + o + th + p;
			buttonPositionX = width - bw;
			buttonPositionY = 0;
			break;
	}
	return {
		width,
		height,
		flushClass,
		buttonPositionX,
		buttonPositionY
	};
}
function computeExpandedIframeSizeFromGeometryPure(input) {
	const p = input.paddingPx ?? 8;
	const g = input.geometry;
	const right = Math.max(g.button.x + g.button.width, g.tooltip.x + g.tooltip.width);
	const bottom = Math.max(g.button.y + g.button.height, g.tooltip.y + g.tooltip.height);
	return {
		width: Math.max(input.fallback.width, Math.ceil(right) + p),
		height: Math.max(input.fallback.height, Math.ceil(bottom) + p)
	};
}

//#endregion
exports.IframeClipPathGenerator = IframeClipPathGenerator;
exports.computeExpandedIframeSizeFromGeometryPure = computeExpandedIframeSizeFromGeometryPure;
exports.computeIframeSizePure = computeIframeSizePure;
exports.toPx = toPx;
exports.utilParsePx = utilParsePx;
//# sourceMappingURL=iframe-geometry.js.map