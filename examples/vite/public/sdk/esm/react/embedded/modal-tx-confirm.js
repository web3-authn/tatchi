//#region src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/tags.ts
const IFRAME_MODAL_ID = "iframe-modal";

//#endregion
//#region ../../node_modules/.pnpm/@lit+reactive-element@2.1.1/node_modules/@lit/reactive-element/css-tag.js
/**
* @license
* Copyright 2019 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
const t$3 = globalThis, e$4 = t$3.ShadowRoot && (void 0 === t$3.ShadyCSS || t$3.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, s$4 = Symbol(), o$6 = /* @__PURE__ */ new WeakMap();
var n$6 = class {
	constructor(t$4, e$6, o$7) {
		if (this._$cssResult$ = !0, o$7 !== s$4) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
		this.cssText = t$4, this.t = e$6;
	}
	get styleSheet() {
		let t$4 = this.o;
		const s$5 = this.t;
		if (e$4 && void 0 === t$4) {
			const e$6 = void 0 !== s$5 && 1 === s$5.length;
			e$6 && (t$4 = o$6.get(s$5)), void 0 === t$4 && ((this.o = t$4 = new CSSStyleSheet()).replaceSync(this.cssText), e$6 && o$6.set(s$5, t$4));
		}
		return t$4;
	}
	toString() {
		return this.cssText;
	}
};
const r$3 = (t$4) => new n$6("string" == typeof t$4 ? t$4 : t$4 + "", void 0, s$4), i = (t$4, ...e$6) => {
	const o$7 = 1 === t$4.length ? t$4[0] : e$6.reduce(((e$7, s$5, o$8) => e$7 + ((t$5) => {
		if (!0 === t$5._$cssResult$) return t$5.cssText;
		if ("number" == typeof t$5) return t$5;
		throw Error("Value passed to 'css' function must be a 'css' function result: " + t$5 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
	})(s$5) + t$4[o$8 + 1]), t$4[0]);
	return new n$6(o$7, t$4, s$4);
}, S$1 = (s$5, o$7) => {
	if (e$4) s$5.adoptedStyleSheets = o$7.map(((t$4) => t$4 instanceof CSSStyleSheet ? t$4 : t$4.styleSheet));
	else for (const e$6 of o$7) {
		const o$8 = document.createElement("style"), n$8 = t$3.litNonce;
		void 0 !== n$8 && o$8.setAttribute("nonce", n$8), o$8.textContent = e$6.cssText, s$5.appendChild(o$8);
	}
}, c$4 = e$4 ? (t$4) => t$4 : (t$4) => t$4 instanceof CSSStyleSheet ? ((t$5) => {
	let e$6 = "";
	for (const s$5 of t$5.cssRules) e$6 += s$5.cssText;
	return r$3(e$6);
})(t$4) : t$4;

//#endregion
//#region ../../node_modules/.pnpm/@lit+reactive-element@2.1.1/node_modules/@lit/reactive-element/reactive-element.js
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/ const { is: i$6, defineProperty: e$5, getOwnPropertyDescriptor: h$4, getOwnPropertyNames: r$4, getOwnPropertySymbols: o$5, getPrototypeOf: n$7 } = Object, a$1 = globalThis, c$5 = a$1.trustedTypes, l$2 = c$5 ? c$5.emptyScript : "", p$2 = a$1.reactiveElementPolyfillSupport, d$2 = (t$4, s$5) => t$4, u$3 = {
	toAttribute(t$4, s$5) {
		switch (s$5) {
			case Boolean:
				t$4 = t$4 ? l$2 : null;
				break;
			case Object:
			case Array: t$4 = null == t$4 ? t$4 : JSON.stringify(t$4);
		}
		return t$4;
	},
	fromAttribute(t$4, s$5) {
		let i$7 = t$4;
		switch (s$5) {
			case Boolean:
				i$7 = null !== t$4;
				break;
			case Number:
				i$7 = null === t$4 ? null : Number(t$4);
				break;
			case Object:
			case Array: try {
				i$7 = JSON.parse(t$4);
			} catch (t$5) {
				i$7 = null;
			}
		}
		return i$7;
	}
}, f$3 = (t$4, s$5) => !i$6(t$4, s$5), b$1 = {
	attribute: !0,
	type: String,
	converter: u$3,
	reflect: !1,
	useDefault: !1,
	hasChanged: f$3
};
Symbol.metadata ??= Symbol("metadata"), a$1.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
var y = class extends HTMLElement {
	static addInitializer(t$4) {
		this._$Ei(), (this.l ??= []).push(t$4);
	}
	static get observedAttributes() {
		return this.finalize(), this._$Eh && [...this._$Eh.keys()];
	}
	static createProperty(t$4, s$5 = b$1) {
		if (s$5.state && (s$5.attribute = !1), this._$Ei(), this.prototype.hasOwnProperty(t$4) && ((s$5 = Object.create(s$5)).wrapped = !0), this.elementProperties.set(t$4, s$5), !s$5.noAccessor) {
			const i$7 = Symbol(), h$5 = this.getPropertyDescriptor(t$4, i$7, s$5);
			void 0 !== h$5 && e$5(this.prototype, t$4, h$5);
		}
	}
	static getPropertyDescriptor(t$4, s$5, i$7) {
		const { get: e$6, set: r$5 } = h$4(this.prototype, t$4) ?? {
			get() {
				return this[s$5];
			},
			set(t$5) {
				this[s$5] = t$5;
			}
		};
		return {
			get: e$6,
			set(s$6) {
				const h$5 = e$6?.call(this);
				r$5?.call(this, s$6), this.requestUpdate(t$4, h$5, i$7);
			},
			configurable: !0,
			enumerable: !0
		};
	}
	static getPropertyOptions(t$4) {
		return this.elementProperties.get(t$4) ?? b$1;
	}
	static _$Ei() {
		if (this.hasOwnProperty(d$2("elementProperties"))) return;
		const t$4 = n$7(this);
		t$4.finalize(), void 0 !== t$4.l && (this.l = [...t$4.l]), this.elementProperties = new Map(t$4.elementProperties);
	}
	static finalize() {
		if (this.hasOwnProperty(d$2("finalized"))) return;
		if (this.finalized = !0, this._$Ei(), this.hasOwnProperty(d$2("properties"))) {
			const t$5 = this.properties, s$5 = [...r$4(t$5), ...o$5(t$5)];
			for (const i$7 of s$5) this.createProperty(i$7, t$5[i$7]);
		}
		const t$4 = this[Symbol.metadata];
		if (null !== t$4) {
			const s$5 = litPropertyMetadata.get(t$4);
			if (void 0 !== s$5) for (const [t$5, i$7] of s$5) this.elementProperties.set(t$5, i$7);
		}
		this._$Eh = /* @__PURE__ */ new Map();
		for (const [t$5, s$5] of this.elementProperties) {
			const i$7 = this._$Eu(t$5, s$5);
			void 0 !== i$7 && this._$Eh.set(i$7, t$5);
		}
		this.elementStyles = this.finalizeStyles(this.styles);
	}
	static finalizeStyles(s$5) {
		const i$7 = [];
		if (Array.isArray(s$5)) {
			const e$6 = new Set(s$5.flat(Infinity).reverse());
			for (const s$6 of e$6) i$7.unshift(c$4(s$6));
		} else void 0 !== s$5 && i$7.push(c$4(s$5));
		return i$7;
	}
	static _$Eu(t$4, s$5) {
		const i$7 = s$5.attribute;
		return !1 === i$7 ? void 0 : "string" == typeof i$7 ? i$7 : "string" == typeof t$4 ? t$4.toLowerCase() : void 0;
	}
	constructor() {
		super(), this._$Ep = void 0, this.isUpdatePending = !1, this.hasUpdated = !1, this._$Em = null, this._$Ev();
	}
	_$Ev() {
		this._$ES = new Promise(((t$4) => this.enableUpdating = t$4)), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach(((t$4) => t$4(this)));
	}
	addController(t$4) {
		(this._$EO ??= /* @__PURE__ */ new Set()).add(t$4), void 0 !== this.renderRoot && this.isConnected && t$4.hostConnected?.();
	}
	removeController(t$4) {
		this._$EO?.delete(t$4);
	}
	_$E_() {
		const t$4 = /* @__PURE__ */ new Map(), s$5 = this.constructor.elementProperties;
		for (const i$7 of s$5.keys()) this.hasOwnProperty(i$7) && (t$4.set(i$7, this[i$7]), delete this[i$7]);
		t$4.size > 0 && (this._$Ep = t$4);
	}
	createRenderRoot() {
		const t$4 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
		return S$1(t$4, this.constructor.elementStyles), t$4;
	}
	connectedCallback() {
		this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(!0), this._$EO?.forEach(((t$4) => t$4.hostConnected?.()));
	}
	enableUpdating(t$4) {}
	disconnectedCallback() {
		this._$EO?.forEach(((t$4) => t$4.hostDisconnected?.()));
	}
	attributeChangedCallback(t$4, s$5, i$7) {
		this._$AK(t$4, i$7);
	}
	_$ET(t$4, s$5) {
		const i$7 = this.constructor.elementProperties.get(t$4), e$6 = this.constructor._$Eu(t$4, i$7);
		if (void 0 !== e$6 && !0 === i$7.reflect) {
			const h$5 = (void 0 !== i$7.converter?.toAttribute ? i$7.converter : u$3).toAttribute(s$5, i$7.type);
			this._$Em = t$4, null == h$5 ? this.removeAttribute(e$6) : this.setAttribute(e$6, h$5), this._$Em = null;
		}
	}
	_$AK(t$4, s$5) {
		const i$7 = this.constructor, e$6 = i$7._$Eh.get(t$4);
		if (void 0 !== e$6 && this._$Em !== e$6) {
			const t$5 = i$7.getPropertyOptions(e$6), h$5 = "function" == typeof t$5.converter ? { fromAttribute: t$5.converter } : void 0 !== t$5.converter?.fromAttribute ? t$5.converter : u$3;
			this._$Em = e$6;
			const r$5 = h$5.fromAttribute(s$5, t$5.type);
			this[e$6] = r$5 ?? this._$Ej?.get(e$6) ?? r$5, this._$Em = null;
		}
	}
	requestUpdate(t$4, s$5, i$7) {
		if (void 0 !== t$4) {
			const e$6 = this.constructor, h$5 = this[t$4];
			if (i$7 ??= e$6.getPropertyOptions(t$4), !((i$7.hasChanged ?? f$3)(h$5, s$5) || i$7.useDefault && i$7.reflect && h$5 === this._$Ej?.get(t$4) && !this.hasAttribute(e$6._$Eu(t$4, i$7)))) return;
			this.C(t$4, s$5, i$7);
		}
		!1 === this.isUpdatePending && (this._$ES = this._$EP());
	}
	C(t$4, s$5, { useDefault: i$7, reflect: e$6, wrapped: h$5 }, r$5) {
		i$7 && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t$4) && (this._$Ej.set(t$4, r$5 ?? s$5 ?? this[t$4]), !0 !== h$5 || void 0 !== r$5) || (this._$AL.has(t$4) || (this.hasUpdated || i$7 || (s$5 = void 0), this._$AL.set(t$4, s$5)), !0 === e$6 && this._$Em !== t$4 && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t$4));
	}
	async _$EP() {
		this.isUpdatePending = !0;
		try {
			await this._$ES;
		} catch (t$5) {
			Promise.reject(t$5);
		}
		const t$4 = this.scheduleUpdate();
		return null != t$4 && await t$4, !this.isUpdatePending;
	}
	scheduleUpdate() {
		return this.performUpdate();
	}
	performUpdate() {
		if (!this.isUpdatePending) return;
		if (!this.hasUpdated) {
			if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
				for (const [t$6, s$6] of this._$Ep) this[t$6] = s$6;
				this._$Ep = void 0;
			}
			const t$5 = this.constructor.elementProperties;
			if (t$5.size > 0) for (const [s$6, i$7] of t$5) {
				const { wrapped: t$6 } = i$7, e$6 = this[s$6];
				!0 !== t$6 || this._$AL.has(s$6) || void 0 === e$6 || this.C(s$6, void 0, i$7, e$6);
			}
		}
		let t$4 = !1;
		const s$5 = this._$AL;
		try {
			t$4 = this.shouldUpdate(s$5), t$4 ? (this.willUpdate(s$5), this._$EO?.forEach(((t$5) => t$5.hostUpdate?.())), this.update(s$5)) : this._$EM();
		} catch (s$6) {
			throw t$4 = !1, this._$EM(), s$6;
		}
		t$4 && this._$AE(s$5);
	}
	willUpdate(t$4) {}
	_$AE(t$4) {
		this._$EO?.forEach(((t$5) => t$5.hostUpdated?.())), this.hasUpdated || (this.hasUpdated = !0, this.firstUpdated(t$4)), this.updated(t$4);
	}
	_$EM() {
		this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = !1;
	}
	get updateComplete() {
		return this.getUpdateComplete();
	}
	getUpdateComplete() {
		return this._$ES;
	}
	shouldUpdate(t$4) {
		return !0;
	}
	update(t$4) {
		this._$Eq &&= this._$Eq.forEach(((t$5) => this._$ET(t$5, this[t$5]))), this._$EM();
	}
	updated(t$4) {}
	firstUpdated(t$4) {}
};
y.elementStyles = [], y.shadowRootOptions = { mode: "open" }, y[d$2("elementProperties")] = /* @__PURE__ */ new Map(), y[d$2("finalized")] = /* @__PURE__ */ new Map(), p$2?.({ ReactiveElement: y }), (a$1.reactiveElementVersions ??= []).push("2.1.1");

//#endregion
//#region ../../node_modules/.pnpm/lit-html@3.3.1/node_modules/lit-html/lit-html.js
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
const t$2 = globalThis, i$5 = t$2.trustedTypes, s$3 = i$5 ? i$5.createPolicy("lit-html", { createHTML: (t$4) => t$4 }) : void 0, e$3 = "$lit$", h$3 = `lit$${Math.random().toFixed(9).slice(2)}$`, o$4 = "?" + h$3, n$5 = `<${o$4}>`, r$2 = document, l$1 = () => r$2.createComment(""), c$3 = (t$4) => null === t$4 || "object" != typeof t$4 && "function" != typeof t$4, a = Array.isArray, u$2 = (t$4) => a(t$4) || "function" == typeof t$4?.[Symbol.iterator], d$1 = "[ 	\n\f\r]", f$2 = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, v$1 = /-->/g, _ = />/g, m$1 = RegExp(`>|${d$1}(?:([^\\s"'>=/]+)(${d$1}*=${d$1}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`, "g"), p$1 = /'/g, g = /"/g, $ = /^(?:script|style|textarea|title)$/i, y$1 = (t$4) => (i$7, ...s$5) => ({
	_$litType$: t$4,
	strings: i$7,
	values: s$5
}), x = y$1(1), b = y$1(2), w = y$1(3), T = Symbol.for("lit-noChange"), E = Symbol.for("lit-nothing"), A = /* @__PURE__ */ new WeakMap(), C = r$2.createTreeWalker(r$2, 129);
function P(t$4, i$7) {
	if (!a(t$4) || !t$4.hasOwnProperty("raw")) throw Error("invalid template strings array");
	return void 0 !== s$3 ? s$3.createHTML(i$7) : i$7;
}
const V = (t$4, i$7) => {
	const s$5 = t$4.length - 1, o$7 = [];
	let r$5, l$3 = 2 === i$7 ? "<svg>" : 3 === i$7 ? "<math>" : "", c$6 = f$2;
	for (let i$8 = 0; i$8 < s$5; i$8++) {
		const s$6 = t$4[i$8];
		let a$2, u$4, d$3 = -1, y$2 = 0;
		for (; y$2 < s$6.length && (c$6.lastIndex = y$2, u$4 = c$6.exec(s$6), null !== u$4);) y$2 = c$6.lastIndex, c$6 === f$2 ? "!--" === u$4[1] ? c$6 = v$1 : void 0 !== u$4[1] ? c$6 = _ : void 0 !== u$4[2] ? ($.test(u$4[2]) && (r$5 = RegExp("</" + u$4[2], "g")), c$6 = m$1) : void 0 !== u$4[3] && (c$6 = m$1) : c$6 === m$1 ? ">" === u$4[0] ? (c$6 = r$5 ?? f$2, d$3 = -1) : void 0 === u$4[1] ? d$3 = -2 : (d$3 = c$6.lastIndex - u$4[2].length, a$2 = u$4[1], c$6 = void 0 === u$4[3] ? m$1 : "\"" === u$4[3] ? g : p$1) : c$6 === g || c$6 === p$1 ? c$6 = m$1 : c$6 === v$1 || c$6 === _ ? c$6 = f$2 : (c$6 = m$1, r$5 = void 0);
		const x$1 = c$6 === m$1 && t$4[i$8 + 1].startsWith("/>") ? " " : "";
		l$3 += c$6 === f$2 ? s$6 + n$5 : d$3 >= 0 ? (o$7.push(a$2), s$6.slice(0, d$3) + e$3 + s$6.slice(d$3) + h$3 + x$1) : s$6 + h$3 + (-2 === d$3 ? i$8 : x$1);
	}
	return [P(t$4, l$3 + (t$4[s$5] || "<?>") + (2 === i$7 ? "</svg>" : 3 === i$7 ? "</math>" : "")), o$7];
};
var N = class N {
	constructor({ strings: t$4, _$litType$: s$5 }, n$8) {
		let r$5;
		this.parts = [];
		let c$6 = 0, a$2 = 0;
		const u$4 = t$4.length - 1, d$3 = this.parts, [f$4, v$2] = V(t$4, s$5);
		if (this.el = N.createElement(f$4, n$8), C.currentNode = this.el.content, 2 === s$5 || 3 === s$5) {
			const t$5 = this.el.content.firstChild;
			t$5.replaceWith(...t$5.childNodes);
		}
		for (; null !== (r$5 = C.nextNode()) && d$3.length < u$4;) {
			if (1 === r$5.nodeType) {
				if (r$5.hasAttributes()) for (const t$5 of r$5.getAttributeNames()) if (t$5.endsWith(e$3)) {
					const i$7 = v$2[a$2++], s$6 = r$5.getAttribute(t$5).split(h$3), e$6 = /([.?@])?(.*)/.exec(i$7);
					d$3.push({
						type: 1,
						index: c$6,
						name: e$6[2],
						strings: s$6,
						ctor: "." === e$6[1] ? H : "?" === e$6[1] ? I : "@" === e$6[1] ? L : k
					}), r$5.removeAttribute(t$5);
				} else t$5.startsWith(h$3) && (d$3.push({
					type: 6,
					index: c$6
				}), r$5.removeAttribute(t$5));
				if ($.test(r$5.tagName)) {
					const t$5 = r$5.textContent.split(h$3), s$6 = t$5.length - 1;
					if (s$6 > 0) {
						r$5.textContent = i$5 ? i$5.emptyScript : "";
						for (let i$7 = 0; i$7 < s$6; i$7++) r$5.append(t$5[i$7], l$1()), C.nextNode(), d$3.push({
							type: 2,
							index: ++c$6
						});
						r$5.append(t$5[s$6], l$1());
					}
				}
			} else if (8 === r$5.nodeType) if (r$5.data === o$4) d$3.push({
				type: 2,
				index: c$6
			});
			else {
				let t$5 = -1;
				for (; -1 !== (t$5 = r$5.data.indexOf(h$3, t$5 + 1));) d$3.push({
					type: 7,
					index: c$6
				}), t$5 += h$3.length - 1;
			}
			c$6++;
		}
	}
	static createElement(t$4, i$7) {
		const s$5 = r$2.createElement("template");
		return s$5.innerHTML = t$4, s$5;
	}
};
function S(t$4, i$7, s$5 = t$4, e$6) {
	if (i$7 === T) return i$7;
	let h$5 = void 0 !== e$6 ? s$5._$Co?.[e$6] : s$5._$Cl;
	const o$7 = c$3(i$7) ? void 0 : i$7._$litDirective$;
	return h$5?.constructor !== o$7 && (h$5?._$AO?.(!1), void 0 === o$7 ? h$5 = void 0 : (h$5 = new o$7(t$4), h$5._$AT(t$4, s$5, e$6)), void 0 !== e$6 ? (s$5._$Co ??= [])[e$6] = h$5 : s$5._$Cl = h$5), void 0 !== h$5 && (i$7 = S(t$4, h$5._$AS(t$4, i$7.values), h$5, e$6)), i$7;
}
var M$1 = class {
	constructor(t$4, i$7) {
		this._$AV = [], this._$AN = void 0, this._$AD = t$4, this._$AM = i$7;
	}
	get parentNode() {
		return this._$AM.parentNode;
	}
	get _$AU() {
		return this._$AM._$AU;
	}
	u(t$4) {
		const { el: { content: i$7 }, parts: s$5 } = this._$AD, e$6 = (t$4?.creationScope ?? r$2).importNode(i$7, !0);
		C.currentNode = e$6;
		let h$5 = C.nextNode(), o$7 = 0, n$8 = 0, l$3 = s$5[0];
		for (; void 0 !== l$3;) {
			if (o$7 === l$3.index) {
				let i$8;
				2 === l$3.type ? i$8 = new R(h$5, h$5.nextSibling, this, t$4) : 1 === l$3.type ? i$8 = new l$3.ctor(h$5, l$3.name, l$3.strings, this, t$4) : 6 === l$3.type && (i$8 = new z(h$5, this, t$4)), this._$AV.push(i$8), l$3 = s$5[++n$8];
			}
			o$7 !== l$3?.index && (h$5 = C.nextNode(), o$7++);
		}
		return C.currentNode = r$2, e$6;
	}
	p(t$4) {
		let i$7 = 0;
		for (const s$5 of this._$AV) void 0 !== s$5 && (void 0 !== s$5.strings ? (s$5._$AI(t$4, s$5, i$7), i$7 += s$5.strings.length - 2) : s$5._$AI(t$4[i$7])), i$7++;
	}
};
var R = class R {
	get _$AU() {
		return this._$AM?._$AU ?? this._$Cv;
	}
	constructor(t$4, i$7, s$5, e$6) {
		this.type = 2, this._$AH = E, this._$AN = void 0, this._$AA = t$4, this._$AB = i$7, this._$AM = s$5, this.options = e$6, this._$Cv = e$6?.isConnected ?? !0;
	}
	get parentNode() {
		let t$4 = this._$AA.parentNode;
		const i$7 = this._$AM;
		return void 0 !== i$7 && 11 === t$4?.nodeType && (t$4 = i$7.parentNode), t$4;
	}
	get startNode() {
		return this._$AA;
	}
	get endNode() {
		return this._$AB;
	}
	_$AI(t$4, i$7 = this) {
		t$4 = S(this, t$4, i$7), c$3(t$4) ? t$4 === E || null == t$4 || "" === t$4 ? (this._$AH !== E && this._$AR(), this._$AH = E) : t$4 !== this._$AH && t$4 !== T && this._(t$4) : void 0 !== t$4._$litType$ ? this.$(t$4) : void 0 !== t$4.nodeType ? this.T(t$4) : u$2(t$4) ? this.k(t$4) : this._(t$4);
	}
	O(t$4) {
		return this._$AA.parentNode.insertBefore(t$4, this._$AB);
	}
	T(t$4) {
		this._$AH !== t$4 && (this._$AR(), this._$AH = this.O(t$4));
	}
	_(t$4) {
		this._$AH !== E && c$3(this._$AH) ? this._$AA.nextSibling.data = t$4 : this.T(r$2.createTextNode(t$4)), this._$AH = t$4;
	}
	$(t$4) {
		const { values: i$7, _$litType$: s$5 } = t$4, e$6 = "number" == typeof s$5 ? this._$AC(t$4) : (void 0 === s$5.el && (s$5.el = N.createElement(P(s$5.h, s$5.h[0]), this.options)), s$5);
		if (this._$AH?._$AD === e$6) this._$AH.p(i$7);
		else {
			const t$5 = new M$1(e$6, this), s$6 = t$5.u(this.options);
			t$5.p(i$7), this.T(s$6), this._$AH = t$5;
		}
	}
	_$AC(t$4) {
		let i$7 = A.get(t$4.strings);
		return void 0 === i$7 && A.set(t$4.strings, i$7 = new N(t$4)), i$7;
	}
	k(t$4) {
		a(this._$AH) || (this._$AH = [], this._$AR());
		const i$7 = this._$AH;
		let s$5, e$6 = 0;
		for (const h$5 of t$4) e$6 === i$7.length ? i$7.push(s$5 = new R(this.O(l$1()), this.O(l$1()), this, this.options)) : s$5 = i$7[e$6], s$5._$AI(h$5), e$6++;
		e$6 < i$7.length && (this._$AR(s$5 && s$5._$AB.nextSibling, e$6), i$7.length = e$6);
	}
	_$AR(t$4 = this._$AA.nextSibling, i$7) {
		for (this._$AP?.(!1, !0, i$7); t$4 !== this._$AB;) {
			const i$8 = t$4.nextSibling;
			t$4.remove(), t$4 = i$8;
		}
	}
	setConnected(t$4) {
		void 0 === this._$AM && (this._$Cv = t$4, this._$AP?.(t$4));
	}
};
var k = class {
	get tagName() {
		return this.element.tagName;
	}
	get _$AU() {
		return this._$AM._$AU;
	}
	constructor(t$4, i$7, s$5, e$6, h$5) {
		this.type = 1, this._$AH = E, this._$AN = void 0, this.element = t$4, this.name = i$7, this._$AM = e$6, this.options = h$5, s$5.length > 2 || "" !== s$5[0] || "" !== s$5[1] ? (this._$AH = Array(s$5.length - 1).fill(/* @__PURE__ */ new String()), this.strings = s$5) : this._$AH = E;
	}
	_$AI(t$4, i$7 = this, s$5, e$6) {
		const h$5 = this.strings;
		let o$7 = !1;
		if (void 0 === h$5) t$4 = S(this, t$4, i$7, 0), o$7 = !c$3(t$4) || t$4 !== this._$AH && t$4 !== T, o$7 && (this._$AH = t$4);
		else {
			const e$7 = t$4;
			let n$8, r$5;
			for (t$4 = h$5[0], n$8 = 0; n$8 < h$5.length - 1; n$8++) r$5 = S(this, e$7[s$5 + n$8], i$7, n$8), r$5 === T && (r$5 = this._$AH[n$8]), o$7 ||= !c$3(r$5) || r$5 !== this._$AH[n$8], r$5 === E ? t$4 = E : t$4 !== E && (t$4 += (r$5 ?? "") + h$5[n$8 + 1]), this._$AH[n$8] = r$5;
		}
		o$7 && !e$6 && this.j(t$4);
	}
	j(t$4) {
		t$4 === E ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t$4 ?? "");
	}
};
var H = class extends k {
	constructor() {
		super(...arguments), this.type = 3;
	}
	j(t$4) {
		this.element[this.name] = t$4 === E ? void 0 : t$4;
	}
};
var I = class extends k {
	constructor() {
		super(...arguments), this.type = 4;
	}
	j(t$4) {
		this.element.toggleAttribute(this.name, !!t$4 && t$4 !== E);
	}
};
var L = class extends k {
	constructor(t$4, i$7, s$5, e$6, h$5) {
		super(t$4, i$7, s$5, e$6, h$5), this.type = 5;
	}
	_$AI(t$4, i$7 = this) {
		if ((t$4 = S(this, t$4, i$7, 0) ?? E) === T) return;
		const s$5 = this._$AH, e$6 = t$4 === E && s$5 !== E || t$4.capture !== s$5.capture || t$4.once !== s$5.once || t$4.passive !== s$5.passive, h$5 = t$4 !== E && (s$5 === E || e$6);
		e$6 && this.element.removeEventListener(this.name, this, s$5), h$5 && this.element.addEventListener(this.name, this, t$4), this._$AH = t$4;
	}
	handleEvent(t$4) {
		"function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t$4) : this._$AH.handleEvent(t$4);
	}
};
var z = class {
	constructor(t$4, i$7, s$5) {
		this.element = t$4, this.type = 6, this._$AN = void 0, this._$AM = i$7, this.options = s$5;
	}
	get _$AU() {
		return this._$AM._$AU;
	}
	_$AI(t$4) {
		S(this, t$4);
	}
};
const Z = {
	M: e$3,
	P: h$3,
	A: o$4,
	C: 1,
	L: V,
	R: M$1,
	D: u$2,
	V: S,
	I: R,
	H: k,
	N: I,
	U: L,
	B: H,
	F: z
}, j = t$2.litHtmlPolyfillSupport;
j?.(N, R), (t$2.litHtmlVersions ??= []).push("3.3.1");
const B = (t$4, i$7, s$5) => {
	const e$6 = s$5?.renderBefore ?? i$7;
	let h$5 = e$6._$litPart$;
	if (void 0 === h$5) {
		const t$5 = s$5?.renderBefore ?? null;
		e$6._$litPart$ = h$5 = new R(i$7.insertBefore(l$1(), t$5), t$5, void 0, s$5 ?? {});
	}
	return h$5._$AI(t$4), h$5;
};

//#endregion
//#region ../../node_modules/.pnpm/lit-element@4.2.1/node_modules/lit-element/lit-element.js
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/ const s$2 = globalThis;
var i$4 = class extends y {
	constructor() {
		super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
	}
	createRenderRoot() {
		const t$4 = super.createRenderRoot();
		return this.renderOptions.renderBefore ??= t$4.firstChild, t$4;
	}
	update(t$4) {
		const r$5 = this.render();
		this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t$4), this._$Do = B(r$5, this.renderRoot, this.renderOptions);
	}
	connectedCallback() {
		super.connectedCallback(), this._$Do?.setConnected(!0);
	}
	disconnectedCallback() {
		super.disconnectedCallback(), this._$Do?.setConnected(!1);
	}
	render() {
		return T;
	}
};
i$4._$litElement$ = !0, i$4["finalized"] = !0, s$2.litElementHydrateSupport?.({ LitElement: i$4 });
const o$3 = s$2.litElementPolyfillSupport;
o$3?.({ LitElement: i$4 });
(s$2.litElementVersions ??= []).push("4.2.1");

//#endregion
//#region src/core/WebAuthnManager/LitComponents/LitElementWithProps.ts
/**
* Drop-in replacement for LitElement that automatically handles the custom element upgrade race.
* See lit-element-with-props.md for more details.
* All properties defined in static properties will be automatically upgraded on mount.
*/
var LitElementWithProps = class extends i$4 {
	/**
	* Handles the custom element upgrade race for a specific property.
	* This method ensures that any property values set before the custom element
	* fully upgrades are correctly re-applied through Lit's property system.
	* @param prop - The property name to upgrade
	*/
	upgradeProperty(prop) {
		if (Object.prototype.hasOwnProperty.call(this, prop)) {
			const selfRead = this;
			const value = selfRead[prop];
			delete selfRead[prop];
			this[prop] = value;
		}
	}
	/**
	* Automatically upgrades all properties defined in static properties.
	* Called automatically in connectedCallback - no manual intervention needed.
	*/
	upgradeAllProperties() {
		const constructor = this.constructor;
		const properties = constructor.properties;
		if (properties) {
			const propertyNames = properties instanceof Map ? Array.from(properties.keys()) : Object.keys(properties);
			propertyNames.forEach((prop) => this.upgradeProperty(prop));
		}
	}
	/**
	* Generic styles property for component customization.
	* Subclasses can override this with their specific style types.
	*/
	styles;
	/**
	* Lit lifecycle: Called when element is added to DOM.
	* Automatically upgrades all defined properties to handle the upgrade race.
	*/
	connectedCallback() {
		super.connectedCallback();
		this.upgradeAllProperties();
		if (this.styles) this.applyStyles(this.styles, this.getComponentPrefix());
	}
	/**
	* Override this method in subclasses to return the appropriate component prefix
	* for CSS variable naming (e.g., 'tree', 'modal', 'button').
	*/
	getComponentPrefix() {
		return "component";
	}
	/**
	* Applies CSS variables for styling. Can be overridden by subclasses for component-specific behavior.
	* @param styles - The styles object to apply
	* @param componentPrefix - Optional component prefix override, defaults to getComponentPrefix()
	*/
	applyStyles(styles, componentPrefix) {
		if (!styles) return;
		const prefix = componentPrefix || this.getComponentPrefix();
		const baseVars = [
			"fontFamily",
			"fontSize",
			"color",
			"backgroundColor",
			"colorPrimary",
			"colorSecondary",
			"colorSuccess",
			"colorWarning",
			"colorError",
			"colorBackground",
			"colorSurface",
			"colorBorder",
			"textPrimary",
			"textSecondary",
			"fontSizeSm",
			"fontSizeBase",
			"fontSizeLg",
			"fontSizeXl",
			"radiusSm",
			"radiusMd",
			"radiusLg",
			"radiusXl",
			"gap2",
			"gap3",
			"gap4",
			"gap6",
			"shadowSm",
			"shadowMd"
		];
		baseVars.forEach((varName) => {
			const v$2 = styles[varName];
			if (typeof v$2 === "string") this.style.setProperty(`--w3a-${this.camelToKebab(varName)}`, v$2);
		});
		Object.entries(styles).forEach(([key, value]) => {
			if (typeof value === "string") this.style.setProperty(`--w3a-${this.camelToKebab(key)}`, value);
		});
		Object.entries(styles).forEach(([section, sectionStyles]) => {
			if (sectionStyles && typeof sectionStyles === "object" && !baseVars.includes(section)) Object.entries(sectionStyles).forEach(([prop, value]) => {
				const kebabSection = this.camelToKebab(section);
				const kebabProp = this.camelToKebab(prop);
				const cssVarNew = `--w3a-${prefix}__${kebabSection}__${kebabProp}`;
				this.style.setProperty(cssVarNew, String(value));
			});
		});
	}
	/**
	* Converts camelCase strings to kebab-case for CSS variables
	*/
	camelToKebab(str) {
		return str.replace(/([A-Z])/g, "-$1").toLowerCase();
	}
};

//#endregion
//#region ../../node_modules/.pnpm/lit-html@3.3.1/node_modules/lit-html/directives/when.js
/**
* @license
* Copyright 2021 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
function n(n$8, r$5, t$4) {
	return n$8 ? r$5(n$8) : t$4?.(n$8);
}

//#endregion
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
/**
* Convert a single ActionArgsWasm (snake_case, stringified fields) to ActionArgs (camelCase, typed fields)
*/
function fromActionArgsWasm(a$2) {
	switch (a$2.action_type) {
		case ActionType.FunctionCall: {
			let parsedArgs = {};
			try {
				parsedArgs = a$2.args ? JSON.parse(a$2.args) : {};
			} catch {
				parsedArgs = {};
			}
			return {
				type: ActionType.FunctionCall,
				methodName: a$2.method_name,
				args: parsedArgs,
				gas: a$2.gas,
				deposit: a$2.deposit
			};
		}
		case ActionType.Transfer: return {
			type: ActionType.Transfer,
			amount: a$2.deposit
		};
		case ActionType.CreateAccount: return { type: ActionType.CreateAccount };
		case ActionType.DeployContract: {
			const codeBytes = Array.isArray(a$2.code) ? new Uint8Array(a$2.code) : new Uint8Array();
			return {
				type: ActionType.DeployContract,
				code: codeBytes
			};
		}
		case ActionType.Stake: return {
			type: ActionType.Stake,
			stake: a$2.stake,
			publicKey: a$2.public_key
		};
		case ActionType.AddKey: {
			let accessKey;
			try {
				accessKey = JSON.parse(a$2.access_key);
			} catch {
				accessKey = {
					nonce: 0,
					permission: { FullAccess: {} }
				};
			}
			const permission = accessKey?.permission;
			let normalizedPermission = "FullAccess";
			if (permission && typeof permission === "object") {
				if ("FullAccess" in permission) normalizedPermission = "FullAccess";
				else if ("FunctionCall" in permission) {
					const fc = permission.FunctionCall || {};
					normalizedPermission = { FunctionCall: {
						allowance: fc.allowance,
						receiverId: fc.receiver_id ?? fc.receiverId,
						methodNames: fc.method_names ?? fc.methodNames
					} };
				}
			}
			return {
				type: ActionType.AddKey,
				publicKey: a$2.public_key,
				accessKey: {
					nonce: typeof accessKey?.nonce === "number" ? accessKey.nonce : 0,
					permission: normalizedPermission
				}
			};
		}
		case ActionType.DeleteKey: return {
			type: ActionType.DeleteKey,
			publicKey: a$2.public_key
		};
		case ActionType.DeleteAccount: return {
			type: ActionType.DeleteAccount,
			beneficiaryId: a$2.beneficiary_id
		};
		default: throw new Error(`Unsupported wasm action_type: ${a$2?.action_type}`);
	}
}
/** Convert a TransactionInputWasm structure to TransactionInput */
function fromTransactionInputWasm(tx) {
	return {
		receiverId: tx.receiverId,
		actions: tx.actions.map(fromActionArgsWasm)
	};
}
/** Convert an array of TransactionInputWasm to TransactionInput[] */
function fromTransactionInputsWasm(txs) {
	return (txs || []).map(fromTransactionInputWasm);
}

//#endregion
//#region ../../node_modules/.pnpm/lit-html@3.3.1/node_modules/lit-html/directive.js
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
const t = {
	ATTRIBUTE: 1,
	CHILD: 2,
	PROPERTY: 3,
	BOOLEAN_ATTRIBUTE: 4,
	EVENT: 5,
	ELEMENT: 6
}, e$1 = (t$4) => (...e$6) => ({
	_$litDirective$: t$4,
	values: e$6
});
var i$1 = class {
	constructor(t$4) {}
	get _$AU() {
		return this._$AM._$AU;
	}
	_$AT(t$4, e$6, i$7) {
		this._$Ct = t$4, this._$AM = e$6, this._$Ci = i$7;
	}
	_$AS(t$4, e$6) {
		return this.update(t$4, e$6);
	}
	update(t$4, e$6) {
		return this.render(...e$6);
	}
};

//#endregion
//#region ../../node_modules/.pnpm/lit-html@3.3.1/node_modules/lit-html/directive-helpers.js
/**
* @license
* Copyright 2020 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/ const { I: t$1 } = Z, i$3 = (o$7) => null === o$7 || "object" != typeof o$7 && "function" != typeof o$7, n$4 = {
	HTML: 1,
	SVG: 2,
	MATHML: 3
}, e$2 = (o$7, t$4) => void 0 === t$4 ? void 0 !== o$7?._$litType$ : o$7?._$litType$ === t$4, l = (o$7) => null != o$7?._$litType$?.h, d = (o$7) => void 0 !== o$7?._$litDirective$, c$2 = (o$7) => o$7?._$litDirective$, f$1 = (o$7) => void 0 === o$7.strings, r$1 = () => document.createComment(""), s$1 = (o$7, i$7, n$8) => {
	const e$6 = o$7._$AA.parentNode, l$3 = void 0 === i$7 ? o$7._$AB : i$7._$AA;
	if (void 0 === n$8) {
		const i$8 = e$6.insertBefore(r$1(), l$3), d$3 = e$6.insertBefore(r$1(), l$3);
		n$8 = new t$1(i$8, d$3, o$7, o$7.options);
	} else {
		const t$4 = n$8._$AB.nextSibling, i$8 = n$8._$AM, d$3 = i$8 !== o$7;
		if (d$3) {
			let t$5;
			n$8._$AQ?.(o$7), n$8._$AM = o$7, void 0 !== n$8._$AP && (t$5 = o$7._$AU) !== i$8._$AU && n$8._$AP(t$5);
		}
		if (t$4 !== l$3 || d$3) {
			let o$8 = n$8._$AA;
			for (; o$8 !== t$4;) {
				const t$5 = o$8.nextSibling;
				e$6.insertBefore(o$8, l$3), o$8 = t$5;
			}
		}
	}
	return n$8;
}, v = (o$7, t$4, i$7 = o$7) => (o$7._$AI(t$4, i$7), o$7), u$1 = {}, m = (o$7, t$4 = u$1) => o$7._$AH = t$4, p = (o$7) => o$7._$AH, M = (o$7) => {
	o$7._$AR(), o$7._$AA.remove();
}, h$2 = (o$7) => {
	o$7._$AR();
};

//#endregion
//#region ../../node_modules/.pnpm/lit-html@3.3.1/node_modules/lit-html/directives/repeat.js
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
const u = (e$6, s$5, t$4) => {
	const r$5 = /* @__PURE__ */ new Map();
	for (let l$3 = s$5; l$3 <= t$4; l$3++) r$5.set(e$6[l$3], l$3);
	return r$5;
}, c$1 = e$1(class extends i$1 {
	constructor(e$6) {
		if (super(e$6), e$6.type !== t.CHILD) throw Error("repeat() can only be used in text expressions");
	}
	dt(e$6, s$5, t$4) {
		let r$5;
		void 0 === t$4 ? t$4 = s$5 : void 0 !== s$5 && (r$5 = s$5);
		const l$3 = [], o$7 = [];
		let i$7 = 0;
		for (const s$6 of e$6) l$3[i$7] = r$5 ? r$5(s$6, i$7) : i$7, o$7[i$7] = t$4(s$6, i$7), i$7++;
		return {
			values: o$7,
			keys: l$3
		};
	}
	render(e$6, s$5, t$4) {
		return this.dt(e$6, s$5, t$4).values;
	}
	update(s$5, [t$4, r$5, c$6]) {
		const d$3 = p(s$5), { values: p$3, keys: a$2 } = this.dt(t$4, r$5, c$6);
		if (!Array.isArray(d$3)) return this.ut = a$2, p$3;
		const h$5 = this.ut ??= [], v$2 = [];
		let m$2, y$2, x$1 = 0, j$1 = d$3.length - 1, k$1 = 0, w$1 = p$3.length - 1;
		for (; x$1 <= j$1 && k$1 <= w$1;) if (null === d$3[x$1]) x$1++;
		else if (null === d$3[j$1]) j$1--;
		else if (h$5[x$1] === a$2[k$1]) v$2[k$1] = v(d$3[x$1], p$3[k$1]), x$1++, k$1++;
		else if (h$5[j$1] === a$2[w$1]) v$2[w$1] = v(d$3[j$1], p$3[w$1]), j$1--, w$1--;
		else if (h$5[x$1] === a$2[w$1]) v$2[w$1] = v(d$3[x$1], p$3[w$1]), s$1(s$5, v$2[w$1 + 1], d$3[x$1]), x$1++, w$1--;
		else if (h$5[j$1] === a$2[k$1]) v$2[k$1] = v(d$3[j$1], p$3[k$1]), s$1(s$5, d$3[x$1], d$3[j$1]), j$1--, k$1++;
		else if (void 0 === m$2 && (m$2 = u(a$2, k$1, w$1), y$2 = u(h$5, x$1, j$1)), m$2.has(h$5[x$1])) if (m$2.has(h$5[j$1])) {
			const e$6 = y$2.get(a$2[k$1]), t$5 = void 0 !== e$6 ? d$3[e$6] : null;
			if (null === t$5) {
				const e$7 = s$1(s$5, d$3[x$1]);
				v(e$7, p$3[k$1]), v$2[k$1] = e$7;
			} else v$2[k$1] = v(t$5, p$3[k$1]), s$1(s$5, d$3[x$1], t$5), d$3[e$6] = null;
			k$1++;
		} else M(d$3[j$1]), j$1--;
		else M(d$3[x$1]), x$1++;
		for (; k$1 <= w$1;) {
			const e$6 = s$1(s$5, v$2[w$1 + 1]);
			v(e$6, p$3[k$1]), v$2[k$1++] = e$6;
		}
		for (; x$1 <= j$1;) {
			const e$6 = d$3[x$1++];
			null !== e$6 && M(e$6);
		}
		return this.ut = a$2, m(s$5, v$2), T;
	}
});

//#endregion
//#region src/core/WebAuthnManager/LitComponents/common/formatters.ts
function formatArgs(args) {
	if (!args) return "";
	if (typeof args === "string") return args;
	try {
		return JSON.stringify(args, (_k, v$2) => typeof v$2 === "bigint" ? v$2.toString() : v$2, 2);
	} catch (e$6) {
		return String(args);
	}
}
function formatDeposit(deposit) {
	if (!deposit || deposit === "0") return "0 NEAR";
	try {
		const yocto = BigInt(deposit);
		const YOCTO_FACTOR = BigInt("1000000000000000000000000");
		const whole = yocto / YOCTO_FACTOR;
		const frac = yocto % YOCTO_FACTOR;
		const maxDecimals = 5;
		if (frac === BigInt(0)) return `${whole.toString()} NEAR`;
		const fracStrFull = frac.toString().padStart(24, "0");
		let fracStr = fracStrFull.slice(0, maxDecimals);
		fracStr = fracStr.replace(/0+$/g, "");
		if (fracStr.length === 0) return `${whole.toString()} NEAR`;
		return `${whole.toString()}.${fracStr} NEAR`;
	} catch (e$6) {
		return deposit;
	}
}
function formatGas(gas) {
	if (!gas) return "";
	try {
		const gasValue = BigInt(gas);
		const tgas = gasValue / BigInt("1000000000000");
		return `${tgas} Tgas`;
	} catch (e$6) {
		return gas;
	}
}
/**
* Shorten a long public key or identifier by keeping a head and tail
* and replacing the middle with an ellipsis.
* Example: ed25519:ABCDEFGH...WXYZ12
*/
function shortenPubkey(pk, opts = {}) {
	if (!pk || typeof pk !== "string") return "";
	const { prefix = 12, suffix = 6 } = opts;
	if (pk.length <= prefix + suffix + 3) return pk;
	const head = pk.slice(0, prefix);
	const tail = pk.slice(-suffix);
	return `${head}...${tail}`;
}
function formatCodeSize(code) {
	if (!code) return "0 bytes";
	if (code instanceof Uint8Array) return `${code.byteLength} bytes`;
	if (Array.isArray(code)) return `${code.length} bytes`;
	if (typeof code === "string") return `${code.length} bytes`;
	return "unknown";
}

//#endregion
//#region src/core/WebAuthnManager/LitComponents/TxTree/index.ts
/**
* TxTree
* A small, dependency-free Lit component that renders a tree-like UI suitable for tooltips.
*
* Usage:
*   <tx-tree .node=${node} depth="0"></tx-tree>
*
* Mapping note: txSigningRequests (TransactionInput[]) → TreeNode structure
* Example (single FunctionCall):
* {
*   id: 'txs-root', label: 'Transaction', type: 'folder', open: true,
*   children: [
*     {
*       id: 'tx-0',
*       label: 'Transaction 1 to web3-authn-v5.testnet',
*       type: 'folder',
*       open: true,
*       children: [
*         {
*           id: 'action-0',
*           label: 'Action 1: FunctionCall',
*           type: 'folder',
*           open: false,
*           children: [
*             { id: 'a0-method', label: 'method: set_greeting', type: 'file' },
*             { id: 'a0-gas', label: 'gas: 30000000000000', type: 'file' },
*             { id: 'a0-deposit', label: 'deposit: 0', type: 'file' },
*             { id: 'a0-args', label: 'args', type: 'file', content: '{\n  "greeting": "Hello from Embedded Component! [...]"\n}' }
*           ]
*         }
*       ]
*     }
*   ]
* }
*/
var TxTree = class extends LitElementWithProps {
	static properties = {
		node: { attribute: false },
		depth: {
			type: Number,
			attribute: false
		},
		styles: {
			attribute: false,
			state: true
		},
		theme: {
			type: String,
			attribute: false
		}
	};
	node;
	depth;
	styles;
	theme;
	class;
	static styles = i`
    :host {
      display: block;
      box-sizing: border-box;
      font-family: var(--w3a-tree__host__font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--w3a-tree__host__font-size, 1rem);
      color: var(--w3a-tree__host__color, #1e293b);
      /* Directional inner padding for shadow room without moving container */
      padding-top: var(--w3a-tree__host__padding-top, 0px);
      padding-bottom: var(--w3a-tree__host__padding-bottom, 0px);
      padding-left: var(--w3a-tree__host__padding-left, 0px);
      padding-right: var(--w3a-tree__host__padding-right, 0px);
    }

    .tooltip-border-outer {
      position: relative;
      background: var(--w3a-tree__tooltip-border-outer__background, rgba(255, 255, 255, 0.95));
      border: var(--w3a-tree__tooltip-border-outer__border, 1px solid var(--w3a-tree__tooltip-border-outer__border-color, oklch(0.8 0 0)));
      border-radius: var(--w3a-tree__tooltip-border-outer__border-radius, 24px);
    }

    .tooltip-border-inner {
      position: var(--w3a-tree__tooltip-border-inner__position, relative);
      border: var(--w3a-tree__tooltip-border-inner__border, 1px solid transparent);
      border-radius: var(--w3a-tree__tooltip-border-inner__border-radius, 24px);
      margin: var(--w3a-tree__tooltip-border-inner__margin, 0px);
      padding: var(--w3a-tree__tooltip-border-inner__padding, 0px);
      height: var(--w3a-tree__tooltip-border-inner__height, auto);
      overflow: var(--w3a-tree__tooltip-border-inner__overflow, hidden);
      box-shadow: var(--w3a-tree__tooltip-border-inner__box-shadow, 0 2px 4px rgba(0, 0, 0, 0.05));
      background: var(--w3a-tree__tooltip-border-inner__background, var(--w3a-color-surface));
      backdrop-filter: var(--w3a-tree__tooltip-border-inner__backdrop-filter, blur(12px));
      WebkitBackdropFilter: var(--w3a-tree__tooltip-border-inner__backdrop-filter, blur(12px));
    }

    .tooltip-tree-root {
      background: var(--w3a-tree__tooltip-tree-root__background, #151833);
      max-width: var(--w3a-tree__tooltip-tree-root__max-width, 600px);
      margin: var(--w3a-tree__tooltip-tree-root__margin, 0 auto);
      border-radius: var(--w3a-tree__tooltip-tree-root__border-radius, 12px);
      border: var(--w3a-tree__tooltip-tree-root__border, none);
      overflow: var(--w3a-tree__tooltip-tree-root__overflow, hidden);
      width: var(--w3a-tree__tooltip-tree-root__width, auto);
      height: var(--w3a-tree__tooltip-tree-root__height, auto);
      padding: var(--w3a-tree__tooltip-tree-root__padding, 0);
    }
    @media (prefers-reduced-motion: reduce) {
      .tooltip-tree-root { transition: none; }
    }

    .tooltip-tree-children {
      display: var(--w3a-tree__tooltip-tree-children__display, block);
      padding: var(--w3a-tree__tooltip-tree-children__padding, 0px);
    }

    details {
      margin: var(--w3a-tree__details__margin, 0);
      padding: var(--w3a-tree__details__padding, 0);
      border-radius: var(--w3a-tree__details__border-radius, 8px);
      overflow: var(--w3a-tree__details__overflow, hidden);
      background: var(--w3a-tree__details__background, transparent);
    }

    /* Remove the default marker */
    summary::-webkit-details-marker { display: none; }
    summary { list-style: none; }

    .row {
      display: var(--w3a-tree__row__display, grid);
      grid-template-columns: var(--w3a-tree__row__grid-template-columns, var(--indent, 0) 1fr 0px);
      align-items: var(--w3a-tree__row__align-items, center);
      box-sizing: var(--w3a-tree__row__box-sizing, border-box);
      width: var(--w3a-tree__row__width, 100%);
      color: var(--w3a-tree__row__color, #e6e9f5);
      background: var(--w3a-tree__row__background, transparent);
      /* Provide explicit vertical spacing so connector lines can extend into it */
      margin-bottom: var(--w3a-tree__row__gap, 0px);
    }

    .summary-row {
      cursor: var(--w3a-tree__summary-row__cursor, pointer);
      padding: var(--w3a-tree__summary-row__padding, 0px 0px);
      margin-bottom: var(--w3a-tree__summary-row__margin-bottom, 0px);
      border-radius: var(--w3a-tree__summary-row__border-radius, 0px);
      transition: var(--w3a-tree__summary-row__transition, background 0.15s ease);
      background: var(--w3a-tree__summary-row__background, transparent);
    }

    .indent {
      width: var(--w3a-tree__indent__width, var(--indent, 0));
      height: var(--w3a-tree__indent__height, 100%);
      position: var(--w3a-tree__indent__position, relative);
    }

    .label {
      display: var(--w3a-tree__label__display, inline-flex);
      align-items: var(--w3a-tree__label__align-items, center);
      gap: var(--w3a-tree__label__gap, 0px);
      padding: var(--w3a-tree__label__padding, 0px);
      min-width: var(--w3a-tree__label__min-width, 0);
      max-width: var(--w3a-tree__label__max-width, 100%);
      flex: var(--w3a-tree__label__flex, 1 1 auto);
      white-space: var(--w3a-tree__label__white-space, nowrap);
      overflow: var(--w3a-tree__label__overflow, hidden);
      text-overflow: var(--w3a-tree__label__text-overflow, ellipsis);
      font-size: var(--w3a-tree__label__font-size, 9px);
      color: var(--w3a-tree__label__color, inherit);
      font-weight: var(--w3a-tree__label__font-weight, inherit);
      line-height: var(--w3a-tree__label__line-height, 1.2);
      border: var(--w3a-tree__label__border, none);
      border-radius: var(--w3a-tree__label__border-radius, 0);
      /* Optional WebKit gradient text support (controlled via CSS vars) */
      -webkit-background-clip: var(--w3a-tree__label__webkit-background-clip, initial);
      -webkit-text-fill-color: var(--w3a-tree__label__webkit-text-fill-color, currentColor);
    }

    /* Inner wrapper to guarantee ellipsis when label contains text + spans */
    .label-text {
      display: inline-flex;
      flex: 1 1 auto;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    /* Smaller, secondary-colored font for action-node labels (leaf rows) */
    .label.label-action-node {
      font-size: var(--w3a-tree__label-action-node__font-size, 0.8rem);
      color: var(--w3a-color-text-secondary, #94a3b8);
    }

    /* Force gradient text when explicitly requested */
    .label.gradient-text {
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .label:hover {
      background: var(--w3a-tree__summary-row-hover__background, rgba(255, 255, 255, 0.06));
    }

    /* Ensure nested spans (e.g., highlights) inside label-text can shrink */
    .label-text > * {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Copy badge */
    .copy-badge {
      margin-left: auto;
      font-size: 0.7em;
      color: var(--w3a-tree__copy-badge__color, var(--w3a-color-text-secondary));
      background: var(--w3a-tree__copy-badge__background, transparent);
      border: var(--w3a-tree__copy-badge__border, 1px solid transparent);
      border-radius: var(--w3a-tree__copy-badge__border-radius, 8px);
      padding: var(--w3a-tree__copy-badge__padding, 2px 6px);
      cursor: pointer;
      user-select: none;
      transition: color 100ms ease, background 100ms ease;
    }
    .copy-badge:hover {
      background: var(--w3a-tree__copy-badge-hover__background, rgba(255,255,255,0.06));
      color: var(--w3a-tree__copy-badge-hover__color, var(--w3a-color-primary));
    }
    .copy-badge[data-copied="true"] {
      color: var(--w3a-tree__copy-badge-copied__color, var(--w3a-color-text));
      background: var(--w3a-tree__copy-badge-copied__background, rgba(255,255,255,0.06));
    }

    .chevron {
      display: var(--w3a-tree__chevron__display, inline-block);
      width: var(--w3a-tree__chevron__width, 8px);
      height: var(--w3a-tree__chevron__height, 8px);
      transform: var(--w3a-tree__chevron__transform, rotate(0deg));
      transition: var(--w3a-tree__chevron__transition, transform 0.12s ease);
      opacity: var(--w3a-tree__chevron__opacity, 0.85);
      color: var(--w3a-tree__chevron__color, currentColor);
      overflow: var(--w3a-tree__chevron__overflow, visible);
    }

    details[open] > summary .chevron {
      transform: var(--w3a-tree__chevron-open__transform, rotate(90deg));
    }

    .file-row {
      font-size: var(--w3a-tree__file-row__font-size, 9px);
      background: var(--w3a-tree__file-row__background, transparent);
    }

    /*
     * Tree connector lines (├ and └) drawn using the indent column.
     * These render a vertical line along the right edge of the indent area,
     * plus a horizontal elbow into the label area. Works generically for
     * both folder (Transaction/Action) and file rows.
     */
    :host {
      --w3a-tree__connector__color: rgba(230, 233, 245, 0.25);
      --w3a-tree__connector__thickness: 1px;
      --w3a-tree__connector__elbow-length: 10px;
    }

    /* Vertical line for each row at the connector anchor inside the indent column */
    .folder-children .row .indent::before {
      content: '';
      position: absolute;
      top: 0;
      /* Anchor can be overridden per row via --connector-indent; defaults to --indent */
      left: var(--connector-indent, var(--indent, 0));
      right: auto;
      width: var(--w3a-tree__connector__thickness);
      /* Extend the vertical connector into the next row's gap so lines appear continuous */
      height: calc(100% + var(--w3a-tree__row__gap, 0px));
      background: var(--w3a-tree__connector__color);
    }

    /* Horizontal elbow from the vertical line into the label */
    .folder-children .row .indent::after {
      content: '';
      position: absolute;
      top: 50%;
      height: var(--w3a-tree__connector__thickness);
      /* Span from the vertical anchor across remaining indent and into the label */
      width: calc((var(--indent, 0) - var(--connector-indent, var(--indent, 0))) + var(--w3a-tree__connector__elbow-length));
      left: var(--connector-indent, var(--indent, 0));
      background: var(--w3a-tree__connector__color);
    }


    /*
     * For nested children (e.g., action args), clamp the connector anchor
     * to the first-level indent so indent=2 rows draw at indent=1.
     */
    .folder-children .folder-children .row {
      --connector-indent: 1rem;
    }

    /* Do not draw horizontal elbows for file content rows */
    .folder-children .row.file-row .indent::after {
      content: none;
    }

    /* If a row explicitly requests no elbow (e.g., hideLabel=true), hide it */
    .folder-children .row[data-no-elbow="true"] .indent::after {
      content: none;
    }

    /*
     * For the last child in a folder, shorten the vertical segment so it
     * stops at the elbow (renders └ instead of ├).
     */
    .folder-children > details:last-child > summary .indent::before {
      /* For the last child, stop at the elbow (midline),
         but still bridge any row gap below to avoid visual truncation */
      height: calc(50% + var(--w3a-tree__row__gap, 0px));
    }

    /* Top-level Transactions have no connector lines */

    /*
     * Do not draw connector lines for nodes under the last Action of each Transaction
     * (i.e., the actionNodes under that last Action folder)
     */
    .tooltip-tree-children > details > .folder-children > details:last-child .folder-children .row .indent::before,
    .tooltip-tree-children > details > .folder-children > details:last-child .folder-children .row .indent::after {
      content: none;
    }

    .file-content {
      box-sizing: var(--w3a-tree__file-content__box-sizing, border-box);
      margin: var(--w3a-tree__file-content__margin, 2px);
      padding: var(--w3a-tree__file-content__padding, 2px);
      border-radius: var(--w3a-tree__file-content__border-radius, 0.5rem);
      background: var(--w3a-tree__file-content__background, rgba(255, 255, 255, 0.06));
      max-height: var(--w3a-tree__file-content__max-height, 120px);
      /* Allow vertical resizing by user drag */
      resize: var(--w3a-tree__file-content__resize, vertical);
      min-height: var(--w3a-tree__file-content__min-height, 60px);
      /* Ensure file content obeys the provided TxTree width */
      width: var(--w3a-tree__file-content__width, auto);
      max-width: var(--w3a-tree__tooltip-tree-root__width, 345px);
      overflow: var(--w3a-tree__file-content__overflow, auto);
      color: var(--w3a-tree__file-content__color, #e2e8f0);
      font-family: var(--w3a-tree__file-content__font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);
      white-space: var(--w3a-tree__file-content__white-space, pre-wrap);
      word-break: var(--w3a-tree__file-content__word-break, break-word);
      line-height: var(--w3a-tree__file-content__line-height, 1.3);
      font-size: var(--w3a-tree__file-content__font-size, 0.7rem);
      box-shadow: var(--w3a-tree__file-content__box-shadow, none);
      /* pretty print JSON and text wrap */
      white-space: pre;
      text-wrap: auto;
      word-break: var(--w3a-tree__file-content__word-break, break-word);
    }

    .file-content::-webkit-scrollbar {
      width: var(--w3a-tree__file-content__scrollbar-width, 4px);
    }

    .file-content::-webkit-scrollbar-track {
      background: var(--w3a-tree__file-content__scrollbar-track__background, var(--w3a-color-surface, #f8fafc));
      border-radius: var(--w3a-tree__file-content__scrollbar-track__border-radius, 2px);
    }

    .file-content::-webkit-scrollbar-thumb {
      background: var(--w3a-tree__file-content__scrollbar-thumb__background, var(--w3a-color-border, #e2e8f0));
      border-radius: var(--w3a-tree__file-content__scrollbar-thumb__border-radius, 2px);
    }

    .folder-children {
      display: var(--w3a-tree__folder-children__display, block);
    }

    /* Highlighting styles for transaction details */
    .highlight-receiver-id {
      color: var(--w3a-tree__highlight-receiver-id__color, #ff6b6b);
      background: var(--w3a-tree__highlight-receiver-id__background, transparent);
      -webkit-background-clip: var(--w3a-tree__highlight-receiver-id__background-clip, none);
      -webkit-text-fill-color: var(--w3a-tree__highlight-receiver-id__text-fill-color, none);
      margin: 0px 4px;

      font-weight: var(--w3a-tree__highlight-receiver-id__font-weight, 600);
      text-decoration: var(--w3a-tree__highlight-receiver-id__text-decoration, none);
      padding: var(--w3a-tree__highlight-receiver-id__padding, 0);
      border-radius: var(--w3a-tree__highlight-receiver-id__border-radius, 0);
      box-shadow: var(--w3a-tree__highlight-receiver-id__box-shadow, none);
    }

    .highlight-method-name {
      color: var(--w3a-tree__highlight-method-name__color, #4ecdc4);
      background: var(--w3a-tree__highlight-method-name__background, transparent);
      -webkit-background-clip: var(--w3a-tree__highlight-method-name__background-clip, none);
      -webkit-text-fill-color: var(--w3a-tree__highlight-method-name__text-fill-color, none);
      margin: 0px 4px;

      font-weight: var(--w3a-tree__highlight-method-name__font-weight, 600);
      text-decoration: var(--w3a-tree__highlight-method-name__text-decoration, none);
      padding: var(--w3a-tree__highlight-method-name__padding, 0);
      border-radius: var(--w3a-tree__highlight-method-name__border-radius, 0);
      box-shadow: var(--w3a-tree__highlight-method-name__box-shadow, none);
    }

    .highlight-amount {
      color: var(--w3a-tree__highlight-amount__color, #4ecdc4);
      background: var(--w3a-tree__highlight-amount__background, transparent);
      -webkit-background-clip: var(--w3a-tree__highlight-amount__background-clip, none);
      -webkit-text-fill-color: var(--w3a-tree__highlight-amount__text-fill-color, none);
      margin: 0px 4px;

      font-weight: var(--w3a-tree__highlight-amount__font-weight, 600);
      text-decoration: var(--w3a-tree__highlight-amount__text-decoration, none);
      padding: var(--w3a-tree__highlight-amount__padding, 0);
      border-radius: var(--w3a-tree__highlight-amount__border-radius, 0);
      box-shadow: var(--w3a-tree__highlight-amount__box-shadow, none);
    }
  `;
	_copied = /* @__PURE__ */ new Set();
	_copyTimers = /* @__PURE__ */ new Map();
	_animating = /* @__PURE__ */ new WeakSet();
	isCopied(id) {
		return this._copied.has(id);
	}
	async handleCopyClick(e$6, node) {
		e$6.stopPropagation();
		const value = node?.copyValue;
		if (!value) return;
		try {
			if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(value);
			else {
				const ta = document.createElement("textarea");
				ta.value = value;
				ta.style.position = "fixed";
				ta.style.opacity = "0";
				document.body.appendChild(ta);
				ta.select();
				try {
					document.execCommand("copy");
				} catch {}
				try {
					document.body.removeChild(ta);
				} catch {}
			}
			this._copied.add(node.id);
			this.requestUpdate();
			const existing = this._copyTimers.get(node.id);
			if (existing) window.clearTimeout(existing);
			const timer = window.setTimeout(() => {
				this._copied.delete(node.id);
				this._copyTimers.delete(node.id);
				this.requestUpdate();
			}, 2e3);
			this._copyTimers.set(node.id, timer);
		} catch {}
	}
	handleToggle() {
		this.dispatchEvent(new CustomEvent("tree-toggled", {
			bubbles: true,
			composed: true
		}));
	}
	/**
	* Intercept summary clicks to run height animations for open/close.
	* Keeps native semantics by toggling details.open at the appropriate time.
	*/
	onSummaryClick = (e$6) => {
		e$6.preventDefault();
		e$6.stopPropagation();
		const summary = e$6.currentTarget;
		if (!summary) return;
		const details = summary.closest("details");
		if (!details || this._animating.has(details)) return;
		const body = details.querySelector(":scope > .folder-children, :scope > .row.file-row");
		if (!body) {
			details.open = !details.open;
			this.handleToggle();
			return;
		}
		const reduceMotion = (() => {
			try {
				return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			} catch {
				return false;
			}
		})();
		if (reduceMotion) {
			details.open = !details.open;
			this.handleToggle();
			return;
		}
		if (!details.open) this.animateOpen(details, body);
		else this.animateClose(details, body);
	};
	animateOpen(details, body) {
		this._animating.add(details);
		body.style.overflow = "hidden";
		body.style.height = "0px";
		details.open = true;
		requestAnimationFrame(() => {
			const target = `${body.scrollHeight}px`;
			body.style.transition = "height 100ms cubic-bezier(0.2, 0.6, 0.2, 1)";
			body.style.height = target;
			const onEnd = (ev) => {
				if (ev.propertyName != "height") return;
				body.removeEventListener("transitionend", onEnd);
				body.style.transition = "";
				body.style.height = "auto";
				body.style.overflow = "";
				this._animating.delete(details);
				this.handleToggle();
			};
			body.addEventListener("transitionend", onEnd);
		});
	}
	animateClose(details, body) {
		this._animating.add(details);
		const start = `${body.scrollHeight}px`;
		body.style.overflow = "hidden";
		body.style.height = start;
		body.offsetHeight;
		requestAnimationFrame(() => {
			body.style.transition = "height 100ms cubic-bezier(0.2, 0.6, 0.2, 1)";
			body.style.height = "0px";
			const onEnd = (ev) => {
				if (ev.propertyName != "height") return;
				body.removeEventListener("transitionend", onEnd);
				details.open = false;
				body.style.transition = "";
				body.style.height = "";
				body.style.overflow = "";
				this._animating.delete(details);
				this.handleToggle();
			};
			body.addEventListener("transitionend", onEnd);
		});
	}
	getComponentPrefix() {
		return "tree";
	}
	applyStyles(styles) {
		super.applyStyles(styles, "tree");
	}
	/**
	* Lifecycle method to apply styles when they change
	*/
	updated(changedProperties) {
		super.updated(changedProperties);
		if (changedProperties.has("styles") && this.styles) this.applyStyles(this.styles);
	}
	connectedCallback() {
		super.connectedCallback();
		const w$1 = window;
		if (!w$1.borderAngleRegistered && CSS.registerProperty) try {
			CSS.registerProperty({
				name: "--border-angle",
				syntax: "<angle>",
				initialValue: "0deg",
				inherits: false
			});
			w$1.borderAngleRegistered = true;
		} catch (e$6) {
			console.warn("[TxTree] Failed to register --border-angle:", e$6);
		}
	}
	renderLabelWithSelectiveHighlight(treeNode) {
		if (treeNode.action) {
			const a$2 = treeNode.action;
			switch (a$2.type) {
				case "FunctionCall": {
					let method = a$2.methodName;
					let gasStr = formatGas(a$2.gas);
					let depositStr = formatDeposit(a$2.deposit);
					return x`Calling <span class="highlight-method-name">${method}</span>
              ${depositStr !== "0 NEAR" ? x` with <span class="highlight-method-name">${depositStr}</span>` : ""}
              ${gasStr ? x` using <span class="highlight-method-name">${gasStr}</span>` : ""}`;
				}
				case "Transfer": {
					let amount = formatDeposit(a$2.amount);
					return x`Transfer <span class="highlight-amount">${amount}</span>`;
				}
				case "CreateAccount": return "Creating Account";
				case "DeleteAccount": return "Deleting Account";
				case "Stake": return `Staking ${formatDeposit(a$2.stake)}`;
				case "AddKey":
					a$2.accessKey;
					return `Adding Key`;
				case "DeleteKey": return `Deleting Key`;
				case "DeployContract":
					const codeSize = formatCodeSize(a$2.code);
					return `Deploying Contract of size ${codeSize}`;
				default: {
					const idxText = typeof treeNode.actionIndex === "number" ? ` ${treeNode.actionIndex + 1}` : "";
					const typeText = a$2.type || "Unknown";
					return `Action ${idxText}: ${typeText}`;
				}
			}
		}
		if (treeNode.transaction) {
			const total = treeNode.totalTransactions ?? 1;
			const idx = treeNode.transactionIndex ?? 0;
			const prefix = total > 1 ? `Transaction ${idx + 1}: to ` : "Transaction to ";
			const receiverId = treeNode.transaction.receiverId;
			return x`${prefix}<span class="highlight-receiver-id">${receiverId}</span>`;
		}
		return treeNode.label || "";
	}
	/**
	* Compute a plain-text version of the label for use in the title tooltip.
	* Mirrors renderLabelWithSelectiveHighlight but without inline HTML/spans.
	*/
	computePlainLabel(treeNode) {
		if (treeNode.action) {
			const a$2 = treeNode.action;
			switch (a$2.type) {
				case "FunctionCall": {
					const method = a$2.methodName;
					const gasStr = formatGas(a$2.gas);
					const depositStr = formatDeposit(a$2.deposit);
					return `Calling ${method} with ${depositStr} using ${gasStr}`;
				}
				case "Transfer": return `Transfer ${formatDeposit(a$2.amount)}`;
				case "CreateAccount": return "Creating Account";
				case "DeleteAccount": return "Deleting Account";
				case "Stake": return `Staking ${formatDeposit(a$2.stake)}`;
				case "AddKey": return "Adding Key";
				case "DeleteKey": return "Deleting Key";
				case "DeployContract": return "Deploying Contract";
				default: {
					const idxText = typeof treeNode.actionIndex === "number" ? ` ${treeNode.actionIndex + 1}` : "";
					const typeText = a$2.type || "Unknown";
					return `Action${idxText}: ${typeText}`;
				}
			}
		}
		if (treeNode.transaction) {
			const total = treeNode.totalTransactions ?? 1;
			const idx = treeNode.transactionIndex ?? 0;
			const prefix = total > 1 ? `Transaction ${idx + 1}: to ` : "Transaction to ";
			const receiverId = treeNode.transaction.receiverId;
			return `${prefix}${receiverId}`;
		}
		return treeNode.label || "";
	}
	renderLeaf(depth, node) {
		const indent = `${Math.max(0, depth - 1)}rem`;
		if (typeof node.content === "string" && node.content.length > 0) return x`
        <details class="tree-node file" ?open=${!!node.open}>
          <summary class="row summary-row"
            style="--indent: ${indent}"
            data-no-elbow="${!!node.hideLabel}"
            @click=${this.onSummaryClick}
          >
            <span class="indent"></span>
          <span class="label label-action-node" style="${node.hideLabel ? "display: none;" : ""}">
            ${!node.hideChevron ? x`
              <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true">
                <path fill="currentColor" d="M6 3l5 5-5 5z" />
              </svg>
            ` : ""}
            <span class="label-text" title=${this.computePlainLabel(node)}>
              ${this.renderLabelWithSelectiveHighlight(node)}
            </span>
            ${node.copyValue ? x`
              <span class="copy-badge"
                data-copied=${this.isCopied(node.id)}
                @click=${(e$6) => this.handleCopyClick(e$6, node)}
                title=${this.isCopied(node.id) ? "Copied" : "Copy"}
              >${this.isCopied(node.id) ? "copied" : "copy"}</span>
            ` : ""}
          </span>
          </summary>
          <div class="row file-row"
            style="--indent: ${indent}"
            data-no-elbow="${!!node.hideLabel}"
          >
            <span class="indent"></span>
            <div class="file-content">${node.content}</div>
          </div>
        </details>
      `;
		return x`
      <div class="row file-row"
        style="--indent: ${indent}"
        data-no-elbow="${!!node.hideLabel}"
      >
        <span class="indent"></span>
        <span class="label label-action-node"
          style="${node.hideLabel ? "display: none;" : ""}"
        >
          <span class="label-text" title=${this.computePlainLabel(node)}>
            ${this.renderLabelWithSelectiveHighlight(node)}
          </span>
          ${node.copyValue ? x`
            <span class="copy-badge"
              data-copied=${this.isCopied(node.id)}
              @click=${(e$6) => this.handleCopyClick(e$6, node)}
              title=${this.isCopied(node.id) ? "Copied" : "Copy"}
            >${this.isCopied(node.id) ? "copied" : "copy"}</span>
          ` : ""}
        </span>
      </div>
    `;
	}
	renderFolder(depth, node) {
		const { children: nodeChildren } = node;
		const indent = `${Math.max(0, depth - 1)}rem`;
		return x`
      <details class="tree-node folder" ?open=${!!node.open}>
        <summary class="row summary-row"
          style="--indent: ${indent}"
          data-no-elbow="${!!node.hideLabel}"
          @click=${this.onSummaryClick}
        >
          <span class="indent"></span>
          <span class="label" style="${node.hideLabel ? "display: none;" : ""}">
            ${!node.hideChevron ? x`
              <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true">
                <path fill="currentColor" d="M6 3l5 5-5 5z" />
              </svg>
            ` : ""}
            <span class="label-text" title=${this.computePlainLabel(node)}>
              ${this.renderLabelWithSelectiveHighlight(node)}
            </span>
          </span>
        </summary>
        ${nodeChildren && nodeChildren.length > 0 ? x`
          <div class="folder-children">
            ${c$1(nodeChildren, (c$6) => c$6.id, (c$6) => this.renderAnyNode(c$6, depth + 1))}
          </div>
        ` : x``}
      </details>
    `;
	}
	renderAnyNode(node, depth) {
		return node.type === "file" ? this.renderLeaf(depth, node) : this.renderFolder(depth, node);
	}
	render() {
		if (!this.node || this.node.type === "folder" && !this.node.children?.length) return x``;
		let depth = this.depth ?? 0;
		let content;
		if (depth === 0) {
			const extraClass = this.class ? ` ${this.class}` : "";
			const rootStyle = this.class ? "overflow:auto;max-height:40vh;" : "";
			content = x`
        <div class="tooltip-border-outer">
          <div class="tooltip-border-inner">
            <div class="tooltip-tree-root${extraClass}" style="${rootStyle}">
              <div class="tooltip-tree-children">
                ${c$1(Array.isArray(this.node.children) ? this.node.children : [], (child) => child.id, (child) => this.renderAnyNode(child, depth + 1))}
              </div>
            </div>
          </div>
        </div>
      `;
		} else if (this.node.type === "folder") content = this.renderFolder(depth, this.node);
		else if (this.node.type === "file") content = this.renderLeaf(depth, this.node);
		return content;
	}
};
customElements.define("tx-tree", TxTree);
var TxTree_default = TxTree;

//#endregion
//#region src/core/WebAuthnManager/LitComponents/TxTree/tx-tree-utils.ts
function buildActionNode(action, idx) {
	let actionNodes;
	switch (action.type) {
		case "FunctionCall":
			actionNodes = [{
				id: `a${idx}-args`,
				label: "using args:",
				type: "file",
				open: true,
				hideChevron: true,
				hideLabel: true,
				content: formatArgs(action.args)
			}];
			break;
		case "Transfer":
			actionNodes = [];
			break;
		case "CreateAccount":
			actionNodes = [];
			break;
		case "DeployContract":
			const code = action.code;
			actionNodes = [{
				id: `a${idx}-code-size`,
				label: "contract code:",
				type: "file",
				open: false,
				hideChevron: true,
				hideLabel: true,
				content: formatArgs(code.toString())
			}];
			break;
		case "Stake":
			actionNodes = [{
				id: `a${idx}-publicKey`,
				label: `validator: ${shortenPubkey(action.publicKey)}`,
				type: "file",
				open: true,
				copyValue: action.publicKey
			}];
			break;
		case "AddKey":
			const ak = action.accessKey;
			let permissions = "";
			try {
				const accessKeyObj = typeof ak === "string" ? JSON.parse(ak) : ak;
				permissions = accessKeyObj.permission === "FullAccess" ? "Full Access" : "Function Call";
			} catch {
				permissions = "Unknown";
			}
			actionNodes = [{
				id: `a${idx}-publicKey`,
				label: `key: ${shortenPubkey(action.publicKey)}`,
				open: false,
				type: "file",
				copyValue: action.publicKey
			}, {
				id: `a${idx}-permissions`,
				label: `permissions: ${permissions}`,
				open: false,
				type: "file"
			}];
			break;
		case "DeleteKey":
			actionNodes = [{
				id: `a${idx}-publicKey`,
				label: `key: ${shortenPubkey(action.publicKey)}`,
				open: false,
				type: "file",
				copyValue: action.publicKey
			}];
			break;
		case "DeleteAccount":
			actionNodes = [{
				id: `a${idx}-beneficiaryId`,
				label: `sending balance to: ${action.beneficiaryId}`,
				open: false,
				type: "file"
			}];
			break;
		default:
			let raw = "";
			try {
				raw = JSON.stringify(action, null, 2);
			} catch {
				raw = String(action);
			}
			actionNodes = [{
				id: `a${idx}-action`,
				label: `Action: ${action.type || "Unknown"}`,
				open: false,
				type: "file"
			}, {
				id: `a${idx}-raw`,
				label: "Raw Data",
				type: "file",
				open: false,
				content: raw
			}];
			break;
	}
	return {
		id: `action-${idx}`,
		label: "",
		type: "folder",
		open: true,
		hideChevron: true,
		action,
		actionIndex: idx,
		children: actionNodes
	};
}
function buildTransactionNode(tx, tIdx, totalTransactions, styles) {
	const actionFolders = tx.actions.map((action, idx) => buildActionNode(action, idx));
	return {
		id: `tx-${tIdx}`,
		label: "",
		type: "folder",
		open: true,
		hideChevron: true,
		transaction: tx,
		transactionIndex: tIdx,
		totalTransactions,
		children: [...actionFolders]
	};
}
function buildDisplayTreeFromTxPayloads(txSigningRequests, styles) {
	const totalTransactions = txSigningRequests.length;
	const txFolders = txSigningRequests.map((tx, tIdx) => buildTransactionNode(tx, tIdx, totalTransactions, styles));
	return {
		id: "txs-root",
		label: totalTransactions > 1 ? "Transactions" : "Transaction",
		type: "folder",
		open: true,
		children: txFolders
	};
}

//#endregion
//#region src/core/WebAuthnManager/LitComponents/base-styles.ts
/**
* Base color palette for Web3Auth Lit components
*/
const CHROMA_COLORS = {
	yellow50: "oklch(0.97 0.050 95)",
	yellow100: "oklch(0.95 0.070 95)",
	yellow150: "oklch(0.93 0.082 95)",
	yellow200: "oklch(0.90 0.094 95)",
	yellow250: "oklch(0.87 0.108 95)",
	yellow300: "oklch(0.82 0.140 95)",
	yellow350: "oklch(0.78 0.160 95)",
	yellow400: "oklch(0.74 0.176 95)",
	yellow450: "oklch(0.70 0.184 95)",
	yellow500: "oklch(0.66 0.188 95)",
	yellow550: "oklch(0.62 0.182 95)",
	yellow600: "oklch(0.56 0.160 95)",
	yellow650: "oklch(0.52 0.138 95)",
	yellow700: "oklch(0.46 0.106 95)",
	yellow750: "oklch(0.42 0.086 95)",
	yellow800: "oklch(0.36 0.062 95)",
	yellow850: "oklch(0.32 0.052 95)",
	yellow900: "oklch(0.26 0.044 95)",
	yellow950: "oklch(0.22 0.036 95)",
	blue50: "oklch(0.97 0.040 255)",
	blue100: "oklch(0.95 0.062 255)",
	blue150: "oklch(0.93 0.074 255)",
	blue200: "oklch(0.90 0.086 255)",
	blue250: "oklch(0.87 0.100 255)",
	blue300: "oklch(0.82 0.130 255)",
	blue350: "oklch(0.78 0.150 255)",
	blue400: "oklch(0.74 0.166 255)",
	blue450: "oklch(0.70 0.174 255)",
	blue500: "oklch(0.66 0.180 255)",
	blue550: "oklch(0.62 0.176 255)",
	blue600: "oklch(0.56 0.158 255)",
	blue650: "oklch(0.52 0.138 255)",
	blue700: "oklch(0.46 0.108 255)",
	blue750: "oklch(0.42 0.088 255)",
	blue800: "oklch(0.36 0.065 255)",
	blue850: "oklch(0.32 0.056 255)",
	blue900: "oklch(0.26 0.050 255)",
	blue950: "oklch(0.22 0.040 255)",
	red50: "oklch(0.97 0.040 19)",
	red100: "oklch(0.95 0.060 19)",
	red150: "oklch(0.93 0.072 19)",
	red200: "oklch(0.90 0.086 19)",
	red250: "oklch(0.87 0.100 19)",
	red300: "oklch(0.82 0.130 19)",
	red350: "oklch(0.78 0.150 19)",
	red400: "oklch(0.74 0.166 19)",
	red450: "oklch(0.70 0.174 19)",
	red500: "oklch(0.66 0.180 19)",
	red550: "oklch(0.62 0.176 19)",
	red600: "oklch(0.56 0.158 19)",
	red650: "oklch(0.52 0.138 19)",
	red700: "oklch(0.46 0.108 19)",
	red750: "oklch(0.42 0.088 19)",
	red800: "oklch(0.36 0.065 19)",
	red850: "oklch(0.32 0.056 19)",
	red900: "oklch(0.26 0.050 19)",
	red950: "oklch(0.22 0.040 19)",
	violet50: "oklch(0.97 0.042 305)",
	violet100: "oklch(0.95 0.060 305)",
	violet150: "oklch(0.93 0.072 305)",
	violet200: "oklch(0.90 0.086 305)",
	violet250: "oklch(0.87 0.102 305)",
	violet300: "oklch(0.82 0.136 305)",
	violet350: "oklch(0.78 0.156 305)",
	violet400: "oklch(0.74 0.170 305)",
	violet450: "oklch(0.70 0.178 305)",
	violet500: "oklch(0.66 0.184 305)",
	violet550: "oklch(0.62 0.178 305)",
	violet600: "oklch(0.56 0.156 305)",
	violet650: "oklch(0.52 0.132 305)",
	violet700: "oklch(0.46 0.104 305)",
	violet750: "oklch(0.42 0.084 305)",
	violet800: "oklch(0.36 0.062 305)",
	violet850: "oklch(0.32 0.054 305)",
	violet900: "oklch(0.26 0.046 305)",
	violet950: "oklch(0.22 0.038 305)",
	green50: "oklch(0.97 0.040 170)",
	green100: "oklch(0.95 0.062 170)",
	green150: "oklch(0.93 0.074 170)",
	green200: "oklch(0.90 0.086 170)",
	green250: "oklch(0.87 0.100 170)",
	green300: "oklch(0.82 0.130 170)",
	green350: "oklch(0.78 0.150 170)",
	green400: "oklch(0.74 0.166 170)",
	green450: "oklch(0.70 0.174 170)",
	green500: "oklch(0.66 0.180 170)",
	green550: "oklch(0.62 0.176 170)",
	green600: "oklch(0.56 0.158 170)",
	green650: "oklch(0.52 0.138 170)",
	green700: "oklch(0.46 0.108 170)",
	green750: "oklch(0.42 0.088 170)",
	green800: "oklch(0.36 0.065 170)",
	green850: "oklch(0.32 0.056 170)",
	green900: "oklch(0.26 0.050 170)",
	green950: "oklch(0.22 0.040 170)"
};
const GREY_COLORS = {
	grey25: "oklch(0.99 0.001 240)",
	grey50: "oklch(0.98 0 0)",
	grey75: "oklch(0.97 0.002 240)",
	grey100: "oklch(0.95 0.005 240)",
	grey150: "oklch(0.92 0.007 240)",
	grey200: "oklch(0.88 0.01 240)",
	grey250: "oklch(0.85 0.012 240)",
	grey300: "oklch(0.8 0.015 240)",
	grey350: "oklch(0.75 0.017 240)",
	grey400: "oklch(0.65 0.02 240)",
	grey450: "oklch(0.6 0.021 240)",
	grey500: "oklch(0.53 0.02 240)",
	grey550: "oklch(0.48 0.02 240)",
	grey600: "oklch(0.4 0.02 240)",
	grey650: "oklch(0.35 0.018 240)",
	grey700: "oklch(0.3 0.015 240)",
	grey750: "oklch(0.25 0.012 240)",
	grey800: "oklch(0.2 0.01 240)",
	grey850: "oklch(0.15 0.008 240)",
	grey900: "oklch(0.1 0.005 240)",
	grey950: "oklch(0.05 0.002 240)",
	grey975: "oklch(0.025 0.001 240)",
	slate25: "oklch(0.99 0.003 240)",
	slate50: "oklch(0.98 0.005 240)",
	slate100: "oklch(0.95 0.01 240)",
	slate150: "oklch(0.915 0.0125 240)",
	slate200: "oklch(0.88 0.015 240)",
	slate250: "oklch(0.84 0.0175 240)",
	slate300: "oklch(0.8 0.02 240)",
	slate350: "oklch(0.725 0.0225 240)",
	slate400: "oklch(0.65 0.025 240)",
	slate450: "oklch(0.59 0.0275 240)",
	slate500: "oklch(0.53 0.03 240)",
	slate550: "oklch(0.465 0.0275 240)",
	slate600: "oklch(0.4 0.025 240)",
	slate650: "oklch(0.35 0.0225 240)",
	slate700: "oklch(0.3 0.02 240)",
	slate750: "oklch(0.25 0.0175 240)",
	slate800: "oklch(0.2 0.015 240)",
	slate850: "oklch(0.15 0.0125 240)",
	slate900: "oklch(0.1 0.01 240)"
};
const GRADIENTS = {
	blue: `linear-gradient(45deg, ${CHROMA_COLORS.blue300} 0%, ${CHROMA_COLORS.blue500} 50%)`,
	red: `linear-gradient(45deg, ${CHROMA_COLORS.red300} 0%, ${CHROMA_COLORS.red500} 50%)`,
	green: `linear-gradient(45deg, ${CHROMA_COLORS.green300} 0%, ${CHROMA_COLORS.green500} 50%)`,
	yellow: `linear-gradient(45deg, ${CHROMA_COLORS.yellow300} 0%, ${CHROMA_COLORS.yellow500} 50%)`,
	peach: "linear-gradient(90deg, hsla(24, 100%, 83%, 1) 0%, hsla(341, 91%, 68%, 1) 100%)",
	aqua: "linear-gradient(90deg, hsla(145, 83%, 74%, 1) 0%, hsla(204, 77%, 76%, 1) 100%)",
	blueWhite: "linear-gradient(90deg, hsla(213, 62%, 45%, 1) 0%, hsla(203, 89%, 71%, 1) 50%, hsla(0, 0%, 96%, 1) 100%)"
};
const DARK_THEME = {
	...GREY_COLORS,
	textPrimary: GREY_COLORS.grey75,
	textSecondary: GREY_COLORS.grey500,
	textMuted: GREY_COLORS.grey650,
	colorBackground: GREY_COLORS.grey800,
	colorSurface: GREY_COLORS.grey750,
	colorSurface2: GREY_COLORS.slate700,
	colorBorder: GREY_COLORS.grey700,
	grey25: GREY_COLORS.grey25,
	grey50: GREY_COLORS.grey50,
	grey75: GREY_COLORS.grey75,
	grey100: GREY_COLORS.grey100,
	grey200: GREY_COLORS.grey200,
	grey300: GREY_COLORS.grey300,
	grey400: GREY_COLORS.grey400,
	grey500: GREY_COLORS.grey500,
	grey600: GREY_COLORS.grey600,
	grey650: GREY_COLORS.grey650,
	grey700: GREY_COLORS.grey700,
	grey750: GREY_COLORS.grey750,
	red200: CHROMA_COLORS.red200,
	red300: CHROMA_COLORS.red300,
	red400: CHROMA_COLORS.red400,
	red500: CHROMA_COLORS.red500,
	red600: CHROMA_COLORS.red600,
	yellow200: CHROMA_COLORS.yellow200,
	yellow300: CHROMA_COLORS.yellow300,
	yellow400: CHROMA_COLORS.yellow400,
	yellow500: CHROMA_COLORS.yellow500,
	yellow600: CHROMA_COLORS.yellow600,
	blue200: CHROMA_COLORS.blue200,
	blue300: CHROMA_COLORS.blue300,
	blue400: CHROMA_COLORS.blue400,
	blue500: CHROMA_COLORS.blue500,
	blue600: CHROMA_COLORS.blue600,
	green200: CHROMA_COLORS.green200,
	green300: CHROMA_COLORS.green300,
	green400: CHROMA_COLORS.green400,
	green500: CHROMA_COLORS.green500,
	green600: CHROMA_COLORS.green600,
	highlightReceiverId: CHROMA_COLORS.blue400,
	highlightMethodName: CHROMA_COLORS.blue400,
	highlightAmount: CHROMA_COLORS.blue400,
	highlightReceiverIdBackground: GRADIENTS.aqua,
	highlightMethodNameBackground: GRADIENTS.aqua,
	highlightAmountBackground: GRADIENTS.peach,
	colorPrimary: CHROMA_COLORS.blue500,
	gradientPeach: GRADIENTS.peach,
	gradientAqua: GRADIENTS.aqua
};
const LIGHT_THEME = {
	...GREY_COLORS,
	textPrimary: GREY_COLORS.grey975,
	textSecondary: GREY_COLORS.grey500,
	textMuted: GREY_COLORS.grey350,
	colorBackground: GREY_COLORS.grey50,
	colorSurface: GREY_COLORS.grey150,
	colorSurface2: GREY_COLORS.slate150,
	colorBorder: GREY_COLORS.grey200,
	grey25: GREY_COLORS.grey25,
	grey50: GREY_COLORS.grey50,
	grey75: GREY_COLORS.grey75,
	grey100: GREY_COLORS.grey100,
	grey200: GREY_COLORS.grey200,
	grey300: GREY_COLORS.grey300,
	grey400: GREY_COLORS.grey400,
	grey500: GREY_COLORS.grey500,
	grey600: GREY_COLORS.grey600,
	grey650: GREY_COLORS.grey650,
	grey700: GREY_COLORS.grey700,
	grey750: GREY_COLORS.grey750,
	slate25: GREY_COLORS.slate25,
	slate100: GREY_COLORS.slate100,
	slate150: GREY_COLORS.slate150,
	slate200: GREY_COLORS.slate200,
	slate300: GREY_COLORS.slate300,
	red200: CHROMA_COLORS.red200,
	red300: CHROMA_COLORS.red300,
	red400: CHROMA_COLORS.red400,
	red500: CHROMA_COLORS.red500,
	red600: CHROMA_COLORS.red600,
	yellow200: CHROMA_COLORS.yellow200,
	yellow300: CHROMA_COLORS.yellow300,
	yellow400: CHROMA_COLORS.yellow400,
	yellow500: CHROMA_COLORS.yellow500,
	yellow600: CHROMA_COLORS.yellow600,
	blue200: CHROMA_COLORS.blue200,
	blue300: CHROMA_COLORS.blue300,
	blue400: CHROMA_COLORS.blue400,
	blue500: CHROMA_COLORS.blue500,
	blue600: CHROMA_COLORS.blue600,
	green200: CHROMA_COLORS.green200,
	green300: CHROMA_COLORS.green300,
	green400: CHROMA_COLORS.green400,
	green500: CHROMA_COLORS.green500,
	green600: CHROMA_COLORS.green600,
	highlightReceiverId: CHROMA_COLORS.blue500,
	highlightMethodName: CHROMA_COLORS.blue500,
	highlightAmount: CHROMA_COLORS.blue500,
	highlightReceiverIdBackground: GRADIENTS.aqua,
	highlightMethodNameBackground: GRADIENTS.aqua,
	highlightAmountBackground: GRADIENTS.peach,
	colorPrimary: CHROMA_COLORS.blue500,
	gradientPeach: GRADIENTS.peach,
	gradientAqua: GRADIENTS.aqua
};

//#endregion
//#region src/core/WebAuthnManager/LitComponents/TxTree/tx-tree-themes.ts
const TX_TREE_THEMES = {
	dark: {
		...DARK_THEME,
		host: {
			fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif",
			fontSize: "1rem",
			color: DARK_THEME.textPrimary,
			backgroundColor: DARK_THEME.colorBackground
		},
		tooltipBorderOuter: {
			background: "transparent",
			border: `1px solid transparent`,
			borderRadius: "28px",
			padding: "0.5rem"
		},
		tooltipBorderInner: {
			borderRadius: "24px",
			border: `1px solid transparent`,
			boxShadow: "0 1px 3px 0px rgba(5, 5, 5, 0.4)"
		},
		tooltipTreeRoot: {
			padding: "0.5rem",
			background: DARK_THEME.colorBackground,
			border: "none",
			color: DARK_THEME.textPrimary
		},
		tooltipTreeChildren: {},
		details: {
			borderRadius: "0.5rem",
			background: "transparent"
		},
		summary: { padding: "0.5rem 0.75rem" },
		summaryRow: { background: "transparent" },
		summaryRowHover: {
			background: DARK_THEME.colorSurface,
			borderColor: DARK_THEME.textSecondary
		},
		row: {
			color: DARK_THEME.textPrimary,
			borderRadius: "0.375rem",
			transition: "all 160ms cubic-bezier(0.2, 0.6, 0.2, 1)"
		},
		indent: {},
		label: {
			color: DARK_THEME.textPrimary,
			fontSize: "0.875rem",
			gap: "4px",
			lineHeight: "1.5",
			border: "1px solid transparent",
			padding: "4px 16px",
			borderRadius: "1rem"
		},
		labelHover: {
			background: DARK_THEME.colorBorder,
			borderColor: DARK_THEME.textSecondary
		},
		chevron: {
			color: DARK_THEME.textSecondary,
			width: "14px",
			height: "14px"
		},
		fileRow: {
			padding: "0.5rem 0.75rem",
			fontSize: "0.875rem"
		},
		fileContent: {
			background: DARK_THEME.colorSurface,
			border: `1px solid none`,
			color: DARK_THEME.textSecondary,
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
			borderRadius: "0.5rem 1rem 1rem 0.5rem",
			padding: "0.5rem",
			scrollbarTrackBackground: DARK_THEME.colorSurface,
			scrollbarThumbBackground: DARK_THEME.textSecondary
		},
		connector: {
			color: DARK_THEME.grey600,
			thickness: "2px",
			elbowLength: "10px"
		},
		folderChildren: {
			padding: "0.5rem 0",
			marginLeft: "1rem"
		},
		highlightReceiverId: {
			color: DARK_THEME.highlightReceiverId,
			fontWeight: "600"
		},
		highlightMethodName: {
			color: DARK_THEME.highlightMethodName,
			fontWeight: "600"
		},
		highlightAmount: {
			color: DARK_THEME.highlightAmount,
			fontWeight: "600"
		},
		rootMobile: {
			borderRadius: "0.5rem",
			margin: "0"
		},
		treeChildrenMobile: { padding: "0.75rem" },
		folderChildrenMobile: { marginLeft: "0.75rem" },
		rowMobile: { padding: "0.5rem" },
		fileContentMobile: {
			fontSize: "0.7rem",
			maxHeight: "150px"
		}
	},
	light: {
		...LIGHT_THEME,
		host: {
			fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif",
			fontSize: "1rem",
			color: LIGHT_THEME.textPrimary,
			backgroundColor: LIGHT_THEME.colorBackground
		},
		tooltipBorderOuter: {
			background: "transparent",
			border: `1px solid transparent`,
			borderRadius: "28px",
			padding: "0.5rem"
		},
		tooltipBorderInner: {
			borderRadius: "24px",
			border: `1px solid ${LIGHT_THEME.slate300}`,
			boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)"
		},
		tooltipTreeRoot: {
			padding: "0.5rem",
			background: LIGHT_THEME.colorBackground,
			border: "none",
			color: LIGHT_THEME.textPrimary
		},
		tooltipTreeChildren: {},
		details: {
			borderRadius: "0.5rem",
			background: "transparent"
		},
		summary: { padding: "0.5rem 0.75rem" },
		summaryRow: { background: "transparent" },
		summaryRowHover: {
			background: LIGHT_THEME.slate100,
			borderColor: LIGHT_THEME.colorBorder
		},
		row: {
			color: LIGHT_THEME.textPrimary,
			borderRadius: "0.375rem",
			transition: "all 160ms cubic-bezier(0.2, 0.6, 0.2, 1)"
		},
		indent: {},
		label: {
			color: LIGHT_THEME.textPrimary,
			fontSize: "0.875rem",
			gap: "4px",
			lineHeight: "1.5",
			border: "1px solid transparent",
			padding: "4px 16px",
			borderRadius: "1rem"
		},
		labelHover: {
			background: LIGHT_THEME.grey75,
			borderColor: LIGHT_THEME.colorBorder
		},
		chevron: {
			color: LIGHT_THEME.textSecondary,
			width: "14px",
			height: "14px"
		},
		fileRow: {
			padding: "0.5rem 0.75rem",
			fontSize: "0.875rem"
		},
		fileContent: {
			background: LIGHT_THEME.slate100,
			border: `1px solid ${LIGHT_THEME.colorBorder}`,
			color: LIGHT_THEME.textPrimary,
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
			borderRadius: "0.5rem 1rem 1rem 0.5rem",
			padding: "0.5rem",
			scrollbarTrackBackground: LIGHT_THEME.colorSurface,
			scrollbarThumbBackground: LIGHT_THEME.colorBorder
		},
		connector: {
			color: LIGHT_THEME.slate200,
			thickness: "2px",
			elbowLength: "10px"
		},
		folderChildren: {
			padding: "0.5rem 0",
			marginLeft: "1rem"
		},
		highlightReceiverId: {
			color: LIGHT_THEME.highlightReceiverId,
			fontWeight: "600"
		},
		highlightMethodName: {
			color: LIGHT_THEME.highlightMethodName,
			fontWeight: "600"
		},
		highlightAmount: {
			color: LIGHT_THEME.highlightAmount,
			fontWeight: "600"
		},
		rootMobile: {
			borderRadius: "0.5rem",
			margin: "0"
		},
		treeChildrenMobile: { padding: "0.75rem" },
		folderChildrenMobile: { marginLeft: "0.75rem" },
		rowMobile: { padding: "0.5rem" },
		fileContentMobile: {
			fontSize: "0.7rem",
			maxHeight: "150px"
		}
	}
};

//#endregion
//#region src/core/WebAuthnManager/LitComponents/IframeModalConfirmer/modal-confirmer-themes.ts
const MODAL_CONFIRMER_THEMES = {
	dark: {
		...DARK_THEME,
		host: {
			fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif",
			fontSize: "1rem",
			color: DARK_THEME.textPrimary,
			backgroundColor: DARK_THEME.colorBackground
		},
		modalBackdropBlur: {
			background: "oklch(0.2 0.01 240 / 0.8)",
			animation: "backdrop-opacity 32ms ease-in",
			willChange: "opacity"
		},
		modalBackdrop: {
			padding: "0.5rem",
			border: "none",
			color: DARK_THEME.textPrimary
		},
		modalContainerRoot: {
			background: "none",
			border: "none",
			boxShadow: "none",
			margin: "1rem 0 0 0"
		},
		responsiveCard: {
			padding: "0rem",
			margin: "0px"
		},
		cardBackgroundBorder: {
			borderRadius: "2rem",
			background: DARK_THEME.colorBackground,
			border: `1px solid ${DARK_THEME.colorBorder}`
		},
		rpidWrapper: {},
		padlockIcon: { color: DARK_THEME.blue500 },
		blockHeightIcon: { color: DARK_THEME.blue500 },
		domainText: { color: DARK_THEME.textSecondary },
		securityDetails: { color: DARK_THEME.textSecondary },
		header: { color: DARK_THEME.textPrimary },
		grid: { color: DARK_THEME.textPrimary },
		row: { color: DARK_THEME.textPrimary },
		label: { color: DARK_THEME.textSecondary },
		value: { color: DARK_THEME.textPrimary },
		summarySection: { color: DARK_THEME.textPrimary },
		actionsTitle: { color: DARK_THEME.textSecondary },
		actionItem: { background: DARK_THEME.colorSurface },
		actionRow: { color: DARK_THEME.textPrimary },
		actionLabel: {
			padding: "2px 0px",
			color: DARK_THEME.textSecondary
		},
		actionContent: {
			padding: "0.5rem",
			color: DARK_THEME.textPrimary,
			background: DARK_THEME.grey700,
			maxHeight: "50vh"
		},
		actionValue: { color: DARK_THEME.textPrimary },
		actionSubitem: {},
		actionSubheader: { color: DARK_THEME.highlightReceiverId },
		codeBlock: {
			fontSize: "0.75rem",
			margin: "4px 0px 0px 0px",
			background: DARK_THEME.grey650,
			color: DARK_THEME.grey350
		},
		methodName: { color: DARK_THEME.highlightMethodName },
		buttons: { background: "transparent" },
		btn: {
			backgroundColor: DARK_THEME.colorSurface,
			color: DARK_THEME.textPrimary,
			focusOutlineColor: DARK_THEME.colorPrimary
		},
		btnConfirm: {
			padding: "0.5rem",
			backgroundColor: DARK_THEME.blue600,
			color: DARK_THEME.textPrimary,
			border: `1px solid ${DARK_THEME.blue400}`
		},
		btnConfirmHover: { backgroundColor: DARK_THEME.blue500 },
		btnCancel: {
			color: DARK_THEME.textPrimary,
			backgroundColor: DARK_THEME.colorBackground,
			border: `1px solid ${DARK_THEME.colorBorder}`
		},
		btnCancelHover: { backgroundColor: DARK_THEME.grey700 },
		btnDanger: {
			backgroundColor: DARK_THEME.red600,
			border: `1px solid ${DARK_THEME.red500}`
		},
		btnDangerHover: { backgroundColor: DARK_THEME.red500 },
		loadingIndicator: {
			borderColor: DARK_THEME.colorBorder,
			borderTopColor: DARK_THEME.colorPrimary
		},
		passkeyHaloLoading: {
			innerBackground: DARK_THEME.grey650,
			innerPadding: "6px",
			ringBackground: `transparent 0%, ${LIGHT_THEME.green400} 10%, ${LIGHT_THEME.green500} 25%, transparent 35%`
		},
		passkeyHaloLoadingIconContainer: { backgroundColor: DARK_THEME.grey750 },
		passkeyHaloLoadingTouchIcon: {
			color: DARK_THEME.textSecondary,
			margin: "0.75rem",
			strokeWidth: "4"
		},
		hero: {},
		heroHeading: { color: LIGHT_THEME.grey100 },
		heroSubheading: { color: LIGHT_THEME.grey400 },
		heroContainer: { minHeight: "48px" },
		errorBanner: {
			color: DARK_THEME.red600,
			fontSize: "0.9rem"
		},
		containerMobile: { background: "rgba(0, 0, 0, 0.5)" },
		headerMobile: { color: DARK_THEME.textPrimary },
		rowMobile: { color: DARK_THEME.textPrimary },
		actionRowMobile: { color: DARK_THEME.textPrimary },
		actionContentMobile: { color: DARK_THEME.textPrimary },
		buttonsMobile: { background: "transparent" },
		btnMobile: {
			backgroundColor: DARK_THEME.colorSurface,
			color: DARK_THEME.textPrimary
		},
		actionContentScrollbarTrack: { background: DARK_THEME.colorSurface },
		actionContentScrollbarThumb: { background: DARK_THEME.textSecondary }
	},
	light: {
		...LIGHT_THEME,
		host: {
			fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif",
			fontSize: "1rem",
			color: LIGHT_THEME.textPrimary,
			backgroundColor: LIGHT_THEME.colorBackground
		},
		modalBackdropBlur: {
			background: "oklch(0.2 0.01 240 / 0.8)",
			animation: "backdrop-opacity 32ms ease-in",
			willChange: "opacity"
		},
		modalBackdrop: {
			padding: "0.5rem",
			background: LIGHT_THEME.grey25,
			border: "none",
			color: LIGHT_THEME.textPrimary
		},
		modalContainerRoot: {
			background: "none",
			border: "none",
			boxShadow: "none",
			margin: "1rem 0 0 0"
		},
		responsiveCard: {
			padding: "0rem",
			margin: "0px",
			borderRadius: "2rem"
		},
		cardBackgroundBorder: {
			background: LIGHT_THEME.colorBackground,
			border: `1px solid ${LIGHT_THEME.colorBorder}`
		},
		rpidWrapper: {},
		padlockIcon: { color: DARK_THEME.blue500 },
		blockHeightIcon: { color: DARK_THEME.blue500 },
		domainText: { color: LIGHT_THEME.textSecondary },
		securityDetails: { color: LIGHT_THEME.textSecondary },
		header: { color: LIGHT_THEME.textPrimary },
		grid: { color: LIGHT_THEME.textPrimary },
		row: { color: LIGHT_THEME.textPrimary },
		label: { color: LIGHT_THEME.textSecondary },
		value: { color: LIGHT_THEME.textPrimary },
		summarySection: { color: LIGHT_THEME.textPrimary },
		actionsTitle: { color: LIGHT_THEME.textSecondary },
		actionItem: { background: LIGHT_THEME.colorBackground },
		actionRow: { color: LIGHT_THEME.textPrimary },
		actionLabel: {
			padding: "2px 0px",
			color: LIGHT_THEME.textSecondary
		},
		actionContent: {
			padding: "0.5rem",
			color: LIGHT_THEME.textPrimary,
			background: LIGHT_THEME.grey100,
			maxHeight: "50vh"
		},
		actionValue: { color: LIGHT_THEME.textPrimary },
		actionSubitem: {},
		actionSubheader: { color: LIGHT_THEME.highlightReceiverId },
		codeBlock: {
			fontSize: "0.75rem",
			margin: "4px 0px 0px 0px",
			background: LIGHT_THEME.slate150,
			color: LIGHT_THEME.textSecondary
		},
		methodName: { color: LIGHT_THEME.highlightMethodName },
		buttons: { background: "transparent" },
		btn: {
			backgroundColor: LIGHT_THEME.colorBackground,
			color: LIGHT_THEME.textPrimary,
			focusOutlineColor: LIGHT_THEME.colorPrimary
		},
		btnHover: { boxShadow: "none" },
		btnConfirm: {
			padding: "0.5rem",
			bakgroundColor: LIGHT_THEME.blue600,
			color: LIGHT_THEME.colorBackground,
			border: `1px solid ${LIGHT_THEME.blue400}`
		},
		btnConfirmHover: { backgroundColor: DARK_THEME.blue500 },
		btnCancel: {
			color: LIGHT_THEME.textPrimary,
			backgroundColor: LIGHT_THEME.colorBackground,
			borderColor: LIGHT_THEME.colorBorder,
			border: `1px solid ${LIGHT_THEME.colorBorder}`
		},
		btnCancelHover: { backgroundColor: LIGHT_THEME.grey100 },
		btnDanger: {
			backgroundColor: LIGHT_THEME.red600,
			border: `1px solid ${LIGHT_THEME.red500}`
		},
		btnDangerHover: { backgroundColor: LIGHT_THEME.red500 },
		loadingIndicator: {
			borderColor: LIGHT_THEME.colorBorder,
			borderTopColor: LIGHT_THEME.colorPrimary
		},
		passkeyHaloLoading: {
			innerBackground: LIGHT_THEME.grey150,
			innerPadding: "6px",
			ringBackground: `transparent 0%, ${LIGHT_THEME.blue300} 10%, ${LIGHT_THEME.blue400} 25%, transparent 35%`
		},
		passkeyHaloLoadingIconContainer: { backgroundColor: LIGHT_THEME.colorBackground },
		passkeyHaloLoadingTouchIcon: {
			color: LIGHT_THEME.textMuted,
			margin: "0.75rem",
			strokeWidth: "4"
		},
		hero: {},
		heroHeading: { color: LIGHT_THEME.grey100 },
		heroSubheading: { color: LIGHT_THEME.grey400 },
		heroContainer: { minHeight: "48px" },
		errorBanner: {
			color: LIGHT_THEME.red500,
			fontSize: "0.9rem"
		},
		containerMobile: { background: "rgba(0, 0, 0, 0.5)" },
		headerMobile: { color: LIGHT_THEME.textPrimary },
		rowMobile: { color: LIGHT_THEME.textPrimary },
		actionRowMobile: { color: LIGHT_THEME.textPrimary },
		actionContentMobile: { color: LIGHT_THEME.textPrimary },
		buttonsMobile: { background: "transparent" },
		btnMobile: {
			backgroundColor: LIGHT_THEME.colorBackground,
			color: LIGHT_THEME.textPrimary
		},
		actionContentScrollbarTrack: { background: LIGHT_THEME.colorSurface },
		actionContentScrollbarThumb: { background: LIGHT_THEME.colorBorder }
	}
};

//#endregion
//#region ../../node_modules/.pnpm/lit-html@3.3.1/node_modules/lit-html/directives/style-map.js
/**
* @license
* Copyright 2018 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/ const n$3 = "important", i$2 = " !" + n$3, o = e$1(class extends i$1 {
	constructor(t$4) {
		if (super(t$4), t$4.type !== t.ATTRIBUTE || "style" !== t$4.name || t$4.strings?.length > 2) throw Error("The `styleMap` directive must be used in the `style` attribute and must be the only part in the attribute.");
	}
	render(t$4) {
		return Object.keys(t$4).reduce(((e$6, r$5) => {
			const s$5 = t$4[r$5];
			return null == s$5 ? e$6 : e$6 + `${r$5 = r$5.includes("-") ? r$5 : r$5.replace(/(?:^(webkit|moz|ms|o)|)(?=[A-Z])/g, "-$&").toLowerCase()}:${s$5};`;
		}), "");
	}
	update(e$6, [r$5]) {
		const { style: s$5 } = e$6.element;
		if (void 0 === this.ft) return this.ft = new Set(Object.keys(r$5)), this.render(r$5);
		for (const t$4 of this.ft) r$5[t$4] ?? (this.ft.delete(t$4), t$4.includes("-") ? s$5.removeProperty(t$4) : s$5[t$4] = null);
		for (const t$4 in r$5) {
			const e$7 = r$5[t$4];
			if (null != e$7) {
				this.ft.add(t$4);
				const r$6 = "string" == typeof e$7 && e$7.endsWith(i$2);
				t$4.includes("-") || r$6 ? s$5.setProperty(t$4, r$6 ? e$7.slice(0, -11) : e$7, r$6 ? n$3 : "") : s$5[t$4] = e$7;
			}
		}
		return T;
	}
});

//#endregion
//#region ../../node_modules/.pnpm/lit-html@3.3.1/node_modules/lit-html/async-directive.js
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/ const s = (i$7, t$4) => {
	const e$6 = i$7._$AN;
	if (void 0 === e$6) return !1;
	for (const i$8 of e$6) i$8._$AO?.(t$4, !1), s(i$8, t$4);
	return !0;
}, o$2 = (i$7) => {
	let t$4, e$6;
	do {
		if (void 0 === (t$4 = i$7._$AM)) break;
		e$6 = t$4._$AN, e$6.delete(i$7), i$7 = t$4;
	} while (0 === e$6?.size);
}, r = (i$7) => {
	for (let t$4; t$4 = i$7._$AM; i$7 = t$4) {
		let e$6 = t$4._$AN;
		if (void 0 === e$6) t$4._$AN = e$6 = /* @__PURE__ */ new Set();
		else if (e$6.has(i$7)) break;
		e$6.add(i$7), c(t$4);
	}
};
function h$1(i$7) {
	void 0 !== this._$AN ? (o$2(this), this._$AM = i$7, r(this)) : this._$AM = i$7;
}
function n$2(i$7, t$4 = !1, e$6 = 0) {
	const r$5 = this._$AH, h$5 = this._$AN;
	if (void 0 !== h$5 && 0 !== h$5.size) if (t$4) if (Array.isArray(r$5)) for (let i$8 = e$6; i$8 < r$5.length; i$8++) s(r$5[i$8], !1), o$2(r$5[i$8]);
	else null != r$5 && (s(r$5, !1), o$2(r$5));
	else s(this, i$7);
}
const c = (i$7) => {
	i$7.type == t.CHILD && (i$7._$AP ??= n$2, i$7._$AQ ??= h$1);
};
var f = class extends i$1 {
	constructor() {
		super(...arguments), this._$AN = void 0;
	}
	_$AT(i$7, t$4, e$6) {
		super._$AT(i$7, t$4, e$6), r(this), this.isConnected = i$7._$AU;
	}
	_$AO(i$7, t$4 = !0) {
		i$7 !== this.isConnected && (this.isConnected = i$7, i$7 ? this.reconnected?.() : this.disconnected?.()), t$4 && (s(this, i$7), o$2(this));
	}
	setValue(t$4) {
		if (f$1(this._$Ct)) this._$Ct._$AI(t$4, this);
		else {
			const i$7 = [...this._$Ct._$AH];
			i$7[this._$Ci] = t$4, this._$Ct._$AI(i$7, this, 0);
		}
	}
	disconnected() {}
	reconnected() {}
};

//#endregion
//#region ../../node_modules/.pnpm/lit-html@3.3.1/node_modules/lit-html/directives/ref.js
/**
* @license
* Copyright 2020 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/ const e = () => new h();
var h = class {};
const o$1 = /* @__PURE__ */ new WeakMap(), n$1 = e$1(class extends f {
	render(i$7) {
		return E;
	}
	update(i$7, [s$5]) {
		const e$6 = s$5 !== this.G;
		return e$6 && void 0 !== this.G && this.rt(void 0), (e$6 || this.lt !== this.ct) && (this.G = s$5, this.ht = i$7.options?.host, this.rt(this.ct = i$7.element)), E;
	}
	rt(t$4) {
		if (this.isConnected || (t$4 = void 0), "function" == typeof this.G) {
			const i$7 = this.ht ?? globalThis;
			let s$5 = o$1.get(i$7);
			void 0 === s$5 && (s$5 = /* @__PURE__ */ new WeakMap(), o$1.set(i$7, s$5)), void 0 !== s$5.get(this.G) && this.G.call(this.ht, void 0), s$5.set(this.G, t$4), void 0 !== t$4 && this.G.call(this.ht, t$4);
		} else this.G.value = t$4;
	}
	get lt() {
		return "function" == typeof this.G ? o$1.get(this.ht ?? globalThis)?.get(this.G) : this.G?.value;
	}
	disconnected() {
		this.lt === this.ct && this.rt(void 0);
	}
	reconnected() {
		this.rt(this.ct);
	}
});

//#endregion
//#region src/core/WebAuthnManager/LitComponents/HaloBorder/index.ts
var HaloBorderElement = class extends LitElementWithProps {
	static properties = {
		animated: { type: Boolean },
		theme: { type: String },
		durationMs: {
			type: Number,
			attribute: "duration-ms"
		},
		ringGap: {
			type: Number,
			attribute: "ring-gap"
		},
		ringWidth: {
			type: Number,
			attribute: "ring-width"
		},
		ringBorderRadius: {
			type: String,
			attribute: "ring-border-radius"
		},
		ringBorderShadow: {
			type: String,
			attribute: "ring-border-shadow"
		},
		ringBackground: {
			type: String,
			attribute: "ring-background"
		},
		padding: { type: String },
		innerPadding: {
			type: String,
			attribute: "inner-padding"
		},
		innerBackground: {
			type: String,
			attribute: "inner-background"
		}
	};
	ringRef = e();
	rafId = null;
	startTs = 0;
	static styles = i`
    :host {
      display: inline-block;
      background: transparent;
      border-radius: 2rem;
      padding: 0;
      max-width: 860px;
      box-sizing: border-box;
      width: fit-content;
      height: fit-content;
    }
  `;
	disconnectedCallback() {
		super.disconnectedCallback();
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}
	startAnimationIfNeeded() {
		if (!this.animated || !this.ringRef.value) return;
		if (this.rafId !== null) return;
		const durationMs = this.durationMs ?? 1150;
		const step = (now) => {
			if (this.startTs === 0) this.startTs = now;
			const elapsed = now - this.startTs;
			const progress = elapsed % durationMs / durationMs;
			const angle = progress * 360;
			const ring = this.ringRef.value;
			const stops = this.ringBackground ?? "transparent 0%, #4DAFFE 10%, #4DAFFE 25%, transparent 35%";
			ring.style.background = `conic-gradient(from ${angle}deg, ${stops})`;
			this.rafId = requestAnimationFrame(step);
		};
		this.rafId = requestAnimationFrame(step);
	}
	updated() {
		if (this.ringBorderShadow) this.style.boxShadow = this.ringBorderShadow;
		else this.style.removeProperty("box-shadow");
		if (this.animated) this.startAnimationIfNeeded();
		else if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}
	render() {
		const ringGap = this.ringGap ?? 4;
		const ringWidth = this.ringWidth ?? 2;
		const ringBorderRadius = this.ringBorderRadius ?? "2rem";
		const innerPadding = this.innerPadding ?? "2rem";
		const innerBackground = this.innerBackground ?? "var(--w3a-grey650)";
		const theme = this.theme ?? "light";
		const paddingOverride = this.padding ?? `${ringGap + ringWidth}px`;
		const ringInsetPx = `-${ringGap + ringWidth}px`;
		const haloInnerStyle = {
			background: "transparent",
			border: "1px solid transparent",
			borderRadius: "2rem",
			padding: paddingOverride,
			position: "relative"
		};
		const contentStyle = {
			background: innerBackground,
			borderRadius: ringBorderRadius,
			padding: innerPadding,
			position: "relative",
			zIndex: "2"
		};
		const ringStops = this.ringBackground ?? "transparent 0%, #4DAFFE 10%, #4DAFFE 25%, transparent 35%";
		const ringStyle = {
			position: "absolute",
			top: ringInsetPx,
			right: ringInsetPx,
			bottom: ringInsetPx,
			left: ringInsetPx,
			borderRadius: `calc(${ringBorderRadius} + ${ringGap}px + ${ringWidth}px)`,
			pointerEvents: "none",
			zIndex: "3",
			background: `conic-gradient(from 0deg, ${ringStops})`,
			padding: `${ringWidth}px`,
			WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
			WebkitMaskComposite: "xor",
			maskComposite: "exclude"
		};
		return x`
      <div class="w3a-halo-border-root ${theme}">
        <div class="w3a-halo-border-inner" style=${o(haloInnerStyle)}>
          ${this.animated ? x`
                <div style=${o({
			position: "relative",
			borderRadius: "2rem",
			overflow: "visible"
		})}>
                  <div ${n$1(this.ringRef)} style=${o(ringStyle)}></div>
                  <div class="w3a-halo-border-content" style=${o(contentStyle)}>
                    <slot></slot>
                  </div>
                </div>
              ` : x`
                <div class="w3a-halo-border-content" style=${o(contentStyle)}>
                  <slot></slot>
                </div>
              `}
        </div>
      </div>
    `;
	}
};
customElements.define("w3a-halo-border", HaloBorderElement);
var HaloBorder_default = HaloBorderElement;

//#endregion
//#region src/core/WebAuthnManager/LitComponents/PasskeyHaloLoading/index.ts
var PasskeyHaloLoadingElement = class extends LitElementWithProps {
	static properties = {
		animated: { type: Boolean },
		theme: { type: String },
		ringGap: {
			type: Number,
			attribute: "ring-gap"
		},
		ringWidth: {
			type: Number,
			attribute: "ring-width"
		},
		ringBorderRadius: {
			type: String,
			attribute: "ring-border-radius"
		},
		ringBorderShadow: {
			type: String,
			attribute: "ring-border-shadow"
		},
		ringBackground: {
			type: String,
			attribute: "ring-background"
		},
		padding: { type: String },
		innerPadding: {
			type: String,
			attribute: "inner-padding"
		},
		innerBackground: {
			type: String,
			attribute: "inner-background"
		},
		height: { type: Number },
		width: { type: Number }
	};
	static styles = i`
    :host {
      display: inline-block;
    }
  `;
	render() {
		const theme = this.theme ?? "light";
		const height = this.height ?? 24;
		const width = this.width ?? 24;
		const animated = this.animated ?? true;
		const ringGap = this.ringGap ?? 4;
		const ringWidth = this.ringWidth ?? 4;
		const ringBorderRadius = this.ringBorderRadius ?? "1.5rem";
		const ringBorderShadow = this.ringBorderShadow;
		const ringBackground = this.ringBackground;
		const padding = this.padding;
		const innerPadding = this.innerPadding ?? "5px";
		const innerBackground = this.innerBackground;
		const iconContainerStyle = {
			display: "grid",
			placeItems: "center",
			backgroundColor: "var(--w3a-modal__passkey-halo-loading-icon-container__background-color)",
			borderRadius: "1.25rem",
			width: "fit-content",
			height: "fit-content"
		};
		return x`
      <div class="w3a-passkey-loading-root ${theme}">
        <w3a-halo-border
          .theme=${theme}
          .animated=${animated}
          .ringGap=${ringGap}
          .ringWidth=${ringWidth}
          .ringBorderRadius=${ringBorderRadius}
          .ringBorderShadow=${ringBorderShadow}
          .ringBackground=${ringBackground}
          .padding=${padding}
          .innerPadding=${innerPadding}
          .innerBackground=${innerBackground}
        >
          <div class="w3a-passkey-loading-touch-icon-container" style=${o(iconContainerStyle)}>
            ${this.renderTouchIcon({
			height,
			width
		})}
          </div>
        </w3a-halo-border>
      </div>
    `;
	}
	renderTouchIcon({ height, width }) {
		const iconStyle = {
			color: "var(--w3a-modal__passkey-halo-loading-touch-icon__color)",
			margin: "var(--w3a-modal__passkey-halo-loading-touch-icon__margin, 0.75rem)"
		};
		const strokeWidth = "var(--w3a-modal__passkey-halo-loading-touch-icon__stroke-width, 4)";
		return x`
      <svg
        style=${o(iconStyle)}
        width=${width}
        height=${height}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M6.40519 19.0481C6.58912 18.6051 6.75832 18.1545 6.91219 17.6969M14.3433 20.6926C14.6095 19.9418 14.8456 19.1768 15.0502 18.399C15.2359 17.6934 15.3956 16.9772 15.5283 16.2516M19.4477 17.0583C19.8121 15.0944 20.0026 13.0694 20.0026 11C20.0026 6.58172 16.4209 3 12.0026 3C10.7472 3 9.55932 3.28918 8.50195 3.80456M3.52344 15.0245C3.83663 13.7343 4.00262 12.3865 4.00262 11C4.00262 9.25969 4.55832 7.64917 5.50195 6.33621M12.003 11C12.003 13.7604 11.5557 16.4163 10.7295 18.8992C10.5169 19.5381 10.2792 20.1655 10.0176 20.7803M7.71227 14.5C7.90323 13.3618 8.00262 12.1925 8.00262 11C8.00262 8.79086 9.79348 7 12.0026 7C14.2118 7 16.0026 8.79086 16.0026 11C16.0026 11.6166 15.9834 12.2287 15.9455 12.8357"
          stroke="currentColor"
          stroke-width=${strokeWidth}
          stroke-linecap="round"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
          pathLength="1"
        />
      </svg>
    `;
	}
};
customElements.define("w3a-passkey-halo-loading", PasskeyHaloLoadingElement);
var PasskeyHaloLoading_default = PasskeyHaloLoadingElement;

//#endregion
//#region src/core/WebAuthnManager/LitComponents/IframeModalConfirmer/ModalTxConfirmer.ts
/**
* Modal transaction confirmation component with multiple display variants.
* Built with Lit for automatic XSS protection and reactive updates.
*/
var ModalTxConfirmElement = class extends LitElementWithProps {
	static properties = {
		mode: { type: String },
		variant: { type: String },
		to: { type: String },
		totalAmount: { type: String },
		method: { type: String },
		fingerprint: { type: String },
		title: { type: String },
		cancelText: { type: String },
		confirmText: { type: String },
		txSigningRequests: { type: Array },
		vrfChallenge: { type: Object },
		loading: { type: Boolean },
		errorMessage: { type: String },
		styles: { type: Object },
		theme: {
			type: String,
			attribute: "theme"
		},
		_isVisible: {
			type: Boolean,
			state: true
		},
		_isAnimating: {
			type: Boolean,
			state: true
		}
	};
	mode = "modal";
	variant = "default";
	totalAmount = "";
	method = "";
	fingerprint = "";
	title = "Sign Transaction";
	cancelText = "Cancel";
	confirmText = "Confirm and Sign";
	txSigningRequests = [];
	vrfChallenge;
	loading = false;
	errorMessage = void 0;
	styles;
	theme = "dark";
	deferClose = false;
	_isVisible = false;
	_isAnimating = false;
	_ensureTreeDefinition = TxTree_default;
	_ensureHaloElements = [HaloBorder_default, PasskeyHaloLoading_default];
	_txTreeWidth;
	_onResize = () => this._updateTxTreeWidth();
	_onKeyDown = (e$6) => {
		if (e$6.key === "Escape" || e$6.key === "Esc") {
			if (this.mode !== "inline") {
				e$6.preventDefault();
				this._handleCancel();
			}
		}
	};
	static shadowRootOptions = { mode: "closed" };
	static styles = i`
    :host {

      /* Default style-guide variables (can be overridden by applyStyles) */
      --w3a-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --w3a-font-size-sm: 0.8rem;
      --w3a-font-size-base: 1rem;
      --w3a-font-size-lg: 1.125rem;
      --w3a-font-size-xl: 1.25rem;

      --w3a-radius-md: 0.5rem;
      --w3a-radius-lg: 0.75rem;
      --w3a-radius-xl: 1rem;

      --w3a-gap-2: 0.5rem;
      --w3a-gap-3: 0.75rem;
      --w3a-gap-4: 1rem;

      /* Component display */
      display: block;

      /* Prefer component-scoped host vars with global fallbacks */
      font-family: var(--w3a-modal__host__font-family, var(--w3a-font-family));
      font-size: var(--w3a-modal__host__font-size, var(--w3a-font-size-base));
      line-height: 1.5;
      color: var(--w3a-modal__host__color, var(--w3a-color-text));
      background-color: var(--w3a-modal__host__background-color, var(--w3a-color-background));

      scrollbar-width: thin;
      scrollbar-color: rgba(25, 25, 25, 0.2);
    }

    /* Reset and base styles */
    *, *::before, *::after {
      box-sizing: border-box;
    }

    .modal-backdrop-blur {
      position: fixed;
      inset: 0;
      display: grid;
      justify-content: center;
      z-index: 2147483647;
      background: var(--w3a-modal__modal-backdrop-blur__background, rgba(0, 0, 0, 0.8));
      backdrop-filter: var(--w3a-modal__modal-backdrop-blur__backdrop-filter, blur(8px));
      animation: var(--w3a-modal__modal-backdrop-blur__animation, backdrop-opacity 60ms ease-in);
      will-change: var(--w3a-modal__modal-backdrop-blur__will-change, opacity, backdrop-filter);
    }

    @keyframes backdrop-opacity {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      z-index: 2147483648; /* Above backdrop */
      pointer-events: none;
    }

    .modal-backdrop > * {
      pointer-events: auto;
    }

    .modal-container-root {
      display: grid;
      gap: 0.5rem;
      position: var(--w3a-modal__modal-container-root__position, relative);
      border: var(--w3a-modal__modal-container-root__border, none);
      border-radius: var(--w3a-modal__modal-container-root__border-radius, 0rem);
      margin: var(--w3a-modal__modal-container-root__margin, 0px);
      padding: var(--w3a-modal__modal-container-root__padding, 0px);
      height: var(--w3a-modal__modal-container-root__height, auto);
      overflow: var(--w3a-modal__modal-container-root__overflow, hidden);
      box-shadow: var(--w3a-modal__modal-container-root__box-shadow, 0 2px 4px rgba(0, 0, 0, 0.05));
      background: var(--w3a-modal__modal-container-root__background);
      animation: fadeIn 32ms ease-in;
      will-change: opacity, transform;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(20px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0px) scale(1);
      }
    }

    .responsive-card {
      position: relative;
      min-width: 420px;
      max-width: 600px;
      overflow: visible;
      border-radius: 2rem;
      z-index: 1;
      padding: var(--w3a-modal__responsive-card__padding, 0rem);
      margin: var(--w3a-modal__responsive-card__margin, 0px);
    }
    .card-background-border {
      border-radius: var(--w3a-modal__card-background-border-radius, 2rem);
      background: var(--w3a-modal__card-background-border__background, oklch(0.25 0.012 240));
      border: var(--w3a-modal__card-background-border__border, 1px solid var(--w3a-slate600));
      margin: var(--w3a-modal__card-background-border__margin, 0px);
    }

    .rpid-wrapper {
      // margin-top: 2px;
      border-bottom: var(--w3a-modal__rpid-wrapper__border-bottom);
    }
    .rpid {
      display: flex;
      align-items: center;
      gap: 6px;
      // padding: 4px 1.25rem;
      margin-top: 2px;
      font-size: 0.7rem;
      color: var(--w3a-modal__label__color);
      font-weight: 400;
    }
    .secure-indicator {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .padlock-icon {
      width: 12px;
      height: 12px;
      margin-right: 4px;
      color: var(--w3a-modal__padlock-icon__color, rgba(255, 255, 255, 0.6));
    }
    .block-height-icon {
      width: 12px;
      height: 12px;
      margin-right: 4px;
      color: var(--w3a-modal__block-height-icon__color, rgba(255, 255, 255, 0.6));
    }
    .domain-text {
      color: var(--w3a-modal__domain-text__color, rgba(255, 255, 255, 0.6));
    }
    .security-details {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--w3a-modal__security-details__color, rgba(255, 255, 255, 0.6));
      margin-left: 8px;
    }

    /* Hero section with halo and headings */
    .hero {
      display: grid;
      justify-items: center;
      align-items: center;
      gap: 1rem;
      padding: var(--w3a-modal__hero__padding, 0rem 0.5rem);
      position: relative;
      display: flex;
    }
    .hero-container {
      min-height: var(--w3a-modal__hero-container__min-height, none);
      display: grid;
      align-items: flex-start;
      margin-right: 1rem;
    }
    .hero-heading {
      margin: 0;
      font-size: var(--w3a-font-size-lg);
      font-weight: 500;
      color: var(--w3a-modal__hero-heading__color);
      text-align: start;
    }
    .hero-subheading {
      margin: 0;
      font-size: 0.9rem;
      color: var(--w3a-modal__hero-subheading__color);
      text-align: start;
    }

    /* Summary section */
    .summary-section {
      position: relative;
      z-index: 1;
    }
    .summary-grid {
      display: grid;
      gap: var(--w3a-gap-2);
      grid-template-columns: 1fr;
      margin-top: var(--w3a-gap-2);
      margin-bottom: var(--w3a-gap-2);
      position: relative;
      z-index: 1;
    }
    .summary-row {
      display: grid;
      grid-template-columns: 115px 1fr;
      align-items: center;
      gap: var(--w3a-gap-2);
      background: transparent;
      border-radius: 0;
      transition: all 100ms cubic-bezier(0.2, 0.6, 0.2, 1);
      position: relative;
      overflow: hidden;
    }
    .summary-label {
      color: var(--w3a-modal__summary-label__color);
      font-size: var(--w3a-font-size-sm);
      font-weight: 500;
    }
    .summary-value {
      color: var(--w3a-modal__value__color);
      font-size: var(--w3a-font-size-sm);
      font-weight: 500;
      word-break: break-word;
    }

    /* Transactions section */

    .action-item {
      margin-bottom: var(--w3a-gap-2);
      overflow: hidden;
      position: relative;
    }

    .action-item:last-child {
      margin-bottom: 0;
    }

    .action-row {
      display: grid;
      grid-template-columns: var(--w3a-modal__action-row__grid-template-columns, 100px 1fr);
      align-items: center;
      gap: var(--w3a-gap-2);
      padding: 0;
      margin-bottom: 0;
      background: transparent;
      border-radius: 0;
    }

    .action-row:last-child {
      margin-bottom: 0;
    }

    .action-label {
      font-family: var(--w3a-font-family);
      color: var(--w3a-modal__action-label__color);
      font-size: var(--w3a-font-size-sm);
      line-height: 1.5;
      font-weight: var(--w3a-modal__action-label__font-weight, 500);
      letter-spacing: 0.02em;
      padding: var(--w3a-modal__action-label__padding, 2px 0px);
      margin: var(--w3a-modal__action-label__margin, 0px);
    }

    .action-content {
      padding: var(--w3a-modal__action-content__padding, 0.5rem);
      font-size: var(--w3a-font-size-sm);
      line-height: 1.4;

      max-height: var(--w3a-modal__action-content__max-height, 50vh);
      overflow: scroll;
      scrollbar-width: thin;
      background: var(--w3a-modal__action-content__background, #242628);
      border-radius: 12px;
    }

    .action-content-min-height {
      min-height: var(--w3a-modal__action-content__min-height, 200px);
    }

    .action-content::-webkit-scrollbar {
      width: var(--w3a-modal__action-content__scrollbar-width, 6px);
    }

    .action-content::-webkit-scrollbar-track {
      background: var(--w3a-modal__action-content-scrollbar-track__background);
      border-radius: var(--w3a-radius-md);
    }

    .action-content::-webkit-scrollbar-thumb {
      background: var(--w3a-modal__action-content-scrollbar-thumb__background);
      border-radius: var(--w3a-radius-md);
    }

    .action-value {
      color: var(--w3a-modal__action-value__color);
      word-break: break-word;
      font-weight: var(--w3a-modal__action-value__font-weight, 500);
      font-size: var(--w3a-font-size-sm);
    }

    .action-subitem {
      margin-bottom: var(--w3a-modal__action-subitem__margin-bottom, var(--w3a-gap-2));
      padding: 0rem 0rem 0rem var(--w3a-modal__action-subitem__padding, var(--w3a-gap-4));
      background: var(--w3a-modal__action-subitem__background, unset);
      position: relative;
    }

    .action-subitem:last-child {
      margin-bottom: 0;
    }

    .action-subheader {
      font-size: var(--w3a-font-size-sm);
      font-weight: 600;
      color: var(--w3a-modal__action-subheader__color);
    }

    .code-block {
      background: var(--w3a-modal__code-block__background);
      border: var(--w3a-modal__code-block__border, 1px solid transparent);
      border-radius: var(--w3a-modal__code-block__border-radius, var(--w3a-radius-md));
      /* dimensions */
      margin: var(--w3a-modal__code-block__margin, 4px 0px 0px 0px);
      padding: var(--w3a-modal__code-block__padding, var(--w3a-gap-2));
      min-height: calc(1.4em * 3);
      max-height: var(--w3a-modal__code-block__max-height, 400px);
      height: auto;
      max-width: var(--w3a-modal__code-block__max-width, 100%);
      overflow: auto;
      /* text styles */
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
      font-size: var(--w3a-modal__code-block__font-size, var(--w3a-font-size-sm));
      color: var(--w3a-modal__code-block__color);
      line-height: 1.4;
      /* pretty print JSON and text wrap */
      white-space: pre;
      text-wrap: auto;
      word-break: var(--w3a-modal__code-block__word-break, break-word);
      /* Ensure resize handle is visible and functional */
      resize: vertical;
      box-sizing: border-box;
    }

    .method-name {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
      font-weight: var(--w3a-modal__method-name__font-weight, 600);
      color: var(--w3a-modal__method-name__color);
    }

    /* Button styles */
    .buttons {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem;
      position: relative;
      z-index: 1;
      align-items: stretch;
    }

    .error-banner {
      color: var(--w3a-modal__error-banner__color, #ef4444);
      font-size: var(--w3a-modal__error-banner__font-size, 0.9rem);
      text-align: var(--w3a-modal__error-banner__text-align, start);
      font-weight: 500;
    }

    .btn {
      background-color: var(--w3a-modal__btn__background-color);
      box-shadow: var(--w3a-modal__btn__box-shadow, none);
      color: var(--w3a-modal__btn__color);
      text-align: center;
      border-radius: 2rem;
      margin-right: 1px;
      justify-content: center;
      align-items: center;
      height: 48px;
      width: 100%;
      padding: var(--w3a-gap-3);
      font-size: var(--w3a-font-size-base);
      display: inline-flex;
      cursor: pointer;
      border: none;
      font-family: var(--w3a-font-family);
      font-weight: var(--w3a-modal__btn__font-weight, 500);
      min-width: 0;
      position: relative;
      overflow: hidden;
      /* Smooth press-down and release animation */
      transition:
        transform var(--w3a-modal__btn__transition-transform, 120ms cubic-bezier(0.2, 0.6, 0.2, 1)),
        background-color 120ms ease-out,
        box-shadow 120ms ease-out;
      transform-origin: center;
      will-change: transform;
      -webkit-tap-highlight-color: transparent;
    }

    .btn:hover {
      background-color: var(--w3a-modal__btn-hover__background-color);
      box-shadow: var(--w3a-modal__btn-hover__box-shadow, none);
    }

    .btn:active {
      background-color: var(--w3a-modal__btn-active__background-color);
      /* Default to a subtle scale-down on press; overridable via CSS var */
      transform: var(--w3a-modal__btn__active-transform, scale(0.98));
    }

    .btn-cancel {
      box-shadow: none;
      color: var(--w3a-modal__btn-cancel__color, var(--w3a-color-text));
      background-color: var(--w3a-modal__btn-cancel__background-color, var(--w3a-color-surface));
      border: var(--w3a-modal__btn-cancel__border, none);
    }

    .btn-cancel:hover {
      color: var(--w3a-modal__btn-cancel-hover__color, var(--w3a-color-text));
      background-color: var(--w3a-modal__btn-cancel-hover__background-color, var(--w3a-color-border));
      border: var(--w3a-modal__btn-cancel-hover__border, none);
    }

    .btn-confirm {
      background-color: var(--w3a-modal__btn-confirm__background-color);
      color: var(--w3a-modal__btn-confirm__color);
      border: var(--w3a-modal__btn-confirm__border, none);
    }

    .btn-confirm:hover {
      background-color: var(--w3a-modal__btn-confirm-hover__background-color);
      border: var(--w3a-modal__btn-confirm-hover__border, none);
    }

    .btn-danger {
      background-color: var(--w3a-modal__btn-danger__background-color, oklch(0.66 0.180 19)); /* red500 */
      color: var(--w3a-modal__btn-danger__color, #ffffff);
      border: var(--w3a-modal__btn-danger__border, none);
    }
    .btn-danger:hover {
      background-color: var(--w3a-modal__btn-danger-hover__background-color, oklch(0.74 0.166 19)); /* red400 */
    }

    .btn:focus-visible {
      outline: 2px solid var(--w3a-modal__btn__focus-outline-color);
      outline-offset: 3px;
      box-shadow: var(--w3a-modal__btn__focus-box-shadow, 0 0 0 3px oklch(0.55 0.18 240 / 0.12));
    }

    /* Single-button alignment (place single button in right column) */
    .buttons.single .btn {
      grid-column: 2 / 3;
      justify-self: end;
    }

    /* Responsive adjustments */
    @media (max-width: 640px) {
      .responsive-card {
        min-width: var(--w3a-modal__mobile__responsive-card__min-width, 320px);
        max-width: var(--w3a-modal__mobile__responsive-card__max-width, 100vw - 1rem);
      }

      .summary-row {
        grid-template-columns: 1fr;
        gap: var(--w3a-modal__responsive-row__gap, 0.25rem);
        padding: var(--w3a-gap-3);
      }

      .summary-label {
        font-size: var(--w3a-font-size-sm);
        margin-bottom: var(--w3a-modal__responsive-label__margin-bottom, 2px);
      }

      .action-row {
        grid-template-columns: var(--w3a-modal__action-row__template-columns, 100px 1fr);
        gap: var(--w3a-modal__responsive-action-row__gap, 0.25rem);
        padding: var(--w3a-gap-2);
      }

      .buttons {
        display: flex;
      }

      .btn {
        width: 100%;
        padding: var(--w3a-gap-4) var(--w3a-gap-5);
      }

      .action-content {
        font-size: var(--w3a-font-size-sm);
        max-height: var(--w3a-modal__responsive-action-content__max-height, 100px);
      }
    }

    /* Tablet adjustments */
    @media (min-width: 641px) and (max-width: 1024px) {
      .responsive-card {
        min-width: var(--w3a-modal__tablet__responsive-card__min-width, 400px);
        max-width: var(--w3a-modal__tablet__responsive-card__max-width, 500px);
      }
    }

    /* Large desktop adjustments */
    @media (min-width: 1025px) {
      .responsive-card {
        min-width: var(--w3a-modal__desktop__responsive-card__min-width, 420px);
        max-width: var(--w3a-modal__desktop__responsive-card__max-width, 600px);
      }
    }

    /* Loading indicator styles */
    .loading-indicator {
      display: inline-block;
      width: var(--w3a-modal__loading-indicator__width, 16px);
      height: var(--w3a-modal__loading-indicator__height, 16px);
      border: 2px solid var(--w3a-modal__loading-indicator__border-color);
      border-radius: 50%;
      border-top-color: var(--w3a-modal__loading-indicator__border-top-color);
      animation: spin 1s ease-in-out infinite;
      margin-right: var(--w3a-gap-2);
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .btn.loading {
      pointer-events: none;
      opacity: 0.8;
    }

    /* Fallback support for browsers without backdrop-filter */
    @supports not (backdrop-filter: blur(8px)) {
      .row { background: var(--w3a-modal__row__background); }
      .action-item { background: var(--w3a-modal__action-item__background); }
      .action-content { background: var(--w3a-modal__action-content__background); }
      .btn { background: var(--w3a-modal__btn__background-color); }
      .btn-confirm { background: var(--w3a-modal__btn-confirm__background-color); }
    }
  `;
	updated(changedProperties) {
		super.updated(changedProperties);
		if (changedProperties.has("theme")) this.updateTheme();
	}
	updateTheme() {
		const selectedTheme = MODAL_CONFIRMER_THEMES[this.theme] || MODAL_CONFIRMER_THEMES.dark;
		const host = selectedTheme?.host || {};
		this.styles = {
			...selectedTheme,
			fontFamily: host.fontFamily,
			fontSizeBase: host.fontSize,
			color: host.color,
			backgroundColor: host.backgroundColor
		};
		this.applyStyles(this.styles);
	}
	getComponentPrefix() {
		return "modal";
	}
	applyStyles(styles) {
		super.applyStyles(styles, "modal");
	}
	disconnectedCallback() {
		try {
			window.removeEventListener("resize", this._onResize);
		} catch {}
		try {
			window.removeEventListener("keydown", this._onKeyDown);
		} catch {}
		super.disconnectedCallback();
	}
	connectedCallback() {
		super.connectedCallback();
		this._isVisible = true;
		this.updateTheme();
		this._updateTxTreeWidth();
		try {
			window.addEventListener("resize", this._onResize, { passive: true });
		} catch {}
		try {
			window.addEventListener("keydown", this._onKeyDown);
		} catch {}
		try {
			this.tabIndex = this.tabIndex ?? -1;
			this.focus({ preventScroll: true });
			if (typeof window.focus === "function") window.focus();
		} catch {}
	}
	_updateTxTreeWidth() {
		try {
			const w$1 = window.innerWidth || 0;
			let next = "min(400px, 100%)";
			if (w$1 <= 640) next = "min(360px, 100%)";
			else if (w$1 <= 1024) next = "min(380px, 100%)";
			else next = "min(400px, 100%)";
			if (this._txTreeWidth !== next) {
				this._txTreeWidth = next;
				this.requestUpdate();
			}
		} catch {}
	}
	render() {
		const displayTotalAmount = this.totalAmount === "0" || this.totalAmount === "";
		return x`
      <!-- Separate backdrop layer for independent animation -->
      <div class="modal-backdrop-blur" @click=${this._handleBackdropClick}></div>
      <!-- Modal content layer -->
      <div class="modal-backdrop" @click=${this._handleContentClick}>
        <div class="modal-container-root">

          <div class="responsive-card">
            <div class="hero">
              <w3a-passkey-halo-loading
                .theme=${this.theme}
                .animated=${!this.errorMessage ? true : false}
                .ringGap=${4}
                .ringWidth=${4}
                .ringBorderRadius=${"1.5rem"}
                .ringBackground=${"var(--w3a-modal__passkey-halo-loading__ring-background)"}
                .innerPadding=${"var(--w3a-modal__passkey-halo-loading__inner-padding, 6px)"}
                .innerBackground=${"var(--w3a-modal__passkey-halo-loading__inner-background)"}
                .height=${40}
                .width=${40}
              ></w3a-passkey-halo-loading>
              <div class="hero-container">
                <!-- Hero heading -->
                <h2 class="hero-heading">Sign transaction with Passkey</h2>
                ${this.errorMessage ? x`<div class="error-banner">${this.errorMessage}</div>` : ""}
                <!-- RpID Section -->
                <div class="rpid-wrapper">
                  <div class="rpid">
                    <div class="secure-indicator">
                      <svg xmlns="http://www.w3.org/2000/svg"
                        class="padlock-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                      ${this.vrfChallenge?.rpId ? x`<span class="domain-text">${this.vrfChallenge.rpId}</span>` : ""}
                    </div>
                    <span class="security-details">
                      <svg xmlns="http://www.w3.org/2000/svg"
                        class="block-height-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
                        <path d="m3.3 7 8.7 5 8.7-5"/>
                        <path d="M12 22V12"/>
                      </svg>
                      ${this.vrfChallenge?.rpId ? x`block ${this.vrfChallenge.blockHeight}` : ""}
                    </span>
                  </div>
                </div>
              </div>
              <!-- Transaction Summary Section -->
              <!-- ${n(displayTotalAmount, () => x`
                <div class="summary-section">
                  <div class="summary-grid">
                    <div class="summary-row">
                      <div class="summary-label">Total Sent</div>
                      <div class="summary-value">${formatDeposit(this.totalAmount)}</div>
                    </div>
                  </div>
                </div>
              `)} -->
            </div>
          </div>

          <div class="responsive-card">
            <!-- Tx Tree Section -->
            ${n(this.txSigningRequests.length > 0, () => {
			const jsTxs = fromTransactionInputsWasm(this.txSigningRequests);
			const tree = buildDisplayTreeFromTxPayloads(jsTxs, TX_TREE_THEMES[this.theme]);
			return x`
                <tx-tree
                  .node=${tree}
                  .depth=${0}
                  .styles=${TX_TREE_THEMES[this.theme]}
                  .theme=${this.theme}
                  .width=${this._txTreeWidth}
                  .class=${"modal-scroll"}
                ></tx-tree>`;
		})}
          </div>

          <div class="responsive-card">
            <div class="buttons ${this.loading || this.errorMessage ? "single" : ""}">
              ${this.loading ? x`
                <!-- Loading mode: show only cancel button with loading indicator -->
                <button
                  class="btn btn-cancel loading"
                  @click=${this._handleCancel}
                >
                  <span class="loading-indicator"></span>
                  Signing
                </button>
              ` : this.errorMessage ? x`
                <!-- Error mode: show only Close button in soft red -->
                <button
                  class="btn btn-danger"
                  @click=${this._handleCancel}
                >
                  Close
                </button>
              ` : x`
                <!-- Normal mode: show both cancel and confirm buttons -->
                <button
                  class="btn btn-cancel"
                  @click=${this._handleCancel}
                >
                  ${this.cancelText}
                </button>
                <button
                  class="btn btn-confirm"
                  @click=${this._handleConfirm}
                >
                  ${this.confirmText}
                </button>
              `}
            </div>

          </div>
        </div>
      </div>
    `;
	}
	_handleCancel() {
		try {
			this.dispatchEvent(new CustomEvent("w3a:cancel", {
				bubbles: true,
				composed: true
			}));
		} catch {}
		if (!this.deferClose) this._resolveAndCleanup(false);
	}
	_handleConfirm() {
		try {
			this.dispatchEvent(new CustomEvent("w3a:confirm", {
				bubbles: true,
				composed: true
			}));
		} catch {}
		if (!this.deferClose) this._resolveAndCleanup(true);
	}
	_handleBackdropClick() {
		this._handleCancel();
	}
	_handleContentClick(e$6) {
		e$6.stopPropagation();
	}
	_resolveAndCleanup(confirmed) {
		this.remove();
	}
	close(confirmed) {
		this._resolveAndCleanup(confirmed);
	}
};
customElements.define("passkey-modal-confirm", ModalTxConfirmElement);

//#endregion
//#region src/core/WebAuthnManager/LitComponents/modal.ts
async function ensureIframeModalDefined() {
	if (customElements.get(IFRAME_MODAL_ID)) return;
	await new Promise((resolve, reject) => {
		const existing = document.querySelector(`script[data-w3a="${IFRAME_MODAL_ID}"]`);
		if (existing) {
			existing.addEventListener("load", () => resolve(), { once: true });
			existing.addEventListener("error", (e$6) => reject(e$6), { once: true });
			return;
		}
		const script = document.createElement("script");
		script.type = "module";
		script.async = true;
		script.dataset.w3a = IFRAME_MODAL_ID;
		script.src = `/sdk/embedded/${IFRAME_MODAL_ID}.js`;
		script.onload = () => resolve();
		script.onerror = (e$6) => {
			console.error("[LitComponents/modal] Failed to load iframe modal host bundle");
			reject(e$6);
		};
		document.head.appendChild(script);
	});
}
async function mountIframeModalHostWithHandle({ ctx, summary, txSigningRequests, vrfChallenge, loading, theme }) {
	await ensureIframeModalDefined();
	const el = document.createElement(IFRAME_MODAL_ID);
	el.nearAccountId = ctx.userPreferencesManager.getCurrentUserAccountId() || "";
	el.txSigningRequests = txSigningRequests || [];
	el.intentDigest = summary?.intentDigest;
	if (vrfChallenge) el.vrfChallenge = vrfChallenge;
	el.showLoading = !!loading;
	if (theme) el.theme = theme;
	document.body.appendChild(el);
	const close = (_confirmed) => {
		try {
			el.remove();
		} catch {}
	};
	return {
		element: el,
		close
	};
}
async function awaitIframeModalDecisionWithHandle({ ctx, summary, txSigningRequests, vrfChallenge, theme }) {
	await ensureIframeModalDefined();
	return new Promise((resolve) => {
		const el = document.createElement(IFRAME_MODAL_ID);
		el.nearAccountId = ctx.userPreferencesManager.getCurrentUserAccountId() || "";
		el.txSigningRequests = txSigningRequests || [];
		el.intentDigest = summary?.intentDigest;
		if (vrfChallenge) el.vrfChallenge = vrfChallenge;
		if (theme) el.theme = theme;
		const onConfirm = (e$6) => {
			const ce = e$6;
			cleanup();
			const ok = !!ce?.detail?.confirmed;
			resolve({
				confirmed: ok,
				handle: {
					element: el,
					close: (_confirmed) => {
						try {
							el.remove();
						} catch {}
					}
				}
			});
		};
		const onCancel = () => {
			cleanup();
			resolve({
				confirmed: false,
				handle: {
					element: el,
					close: (_confirmed) => {
						try {
							el.remove();
						} catch {}
					}
				}
			});
		};
		const cleanup = () => {
			try {
				el.removeEventListener("w3a:modal-confirm", onConfirm);
			} catch {}
			try {
				el.removeEventListener("w3a:modal-cancel", onCancel);
			} catch {}
		};
		el.addEventListener("w3a:modal-confirm", onConfirm);
		el.addEventListener("w3a:modal-cancel", onCancel);
		document.body.appendChild(el);
	});
}

//#endregion
export { ModalTxConfirmElement, awaitIframeModalDecisionWithHandle, ensureIframeModalDefined, mountIframeModalHostWithHandle };