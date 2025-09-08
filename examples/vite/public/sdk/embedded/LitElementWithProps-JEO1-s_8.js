//#region ../../node_modules/.pnpm/@lit+reactive-element@2.1.1/node_modules/@lit/reactive-element/css-tag.js
/**
* @license
* Copyright 2019 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
const t$3 = globalThis, e$4 = t$3.ShadowRoot && (void 0 === t$3.ShadyCSS || t$3.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, s$4 = Symbol(), o$5 = /* @__PURE__ */ new WeakMap();
var n$4 = class {
	constructor(t$4, e$6, o$6) {
		if (this._$cssResult$ = !0, o$6 !== s$4) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
		this.cssText = t$4, this.t = e$6;
	}
	get styleSheet() {
		let t$4 = this.o;
		const s$5 = this.t;
		if (e$4 && void 0 === t$4) {
			const e$6 = void 0 !== s$5 && 1 === s$5.length;
			e$6 && (t$4 = o$5.get(s$5)), void 0 === t$4 && ((this.o = t$4 = new CSSStyleSheet()).replaceSync(this.cssText), e$6 && o$5.set(s$5, t$4));
		}
		return t$4;
	}
	toString() {
		return this.cssText;
	}
};
const r$3 = (t$4) => new n$4("string" == typeof t$4 ? t$4 : t$4 + "", void 0, s$4), i$4 = (t$4, ...e$6) => {
	const o$6 = 1 === t$4.length ? t$4[0] : e$6.reduce(((e$7, s$5, o$7) => e$7 + ((t$5) => {
		if (!0 === t$5._$cssResult$) return t$5.cssText;
		if ("number" == typeof t$5) return t$5;
		throw Error("Value passed to 'css' function must be a 'css' function result: " + t$5 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
	})(s$5) + t$4[o$7 + 1]), t$4[0]);
	return new n$4(o$6, t$4, s$4);
}, S$1 = (s$5, o$6) => {
	if (e$4) s$5.adoptedStyleSheets = o$6.map(((t$4) => t$4 instanceof CSSStyleSheet ? t$4 : t$4.styleSheet));
	else for (const e$6 of o$6) {
		const o$7 = document.createElement("style"), n$6 = t$3.litNonce;
		void 0 !== n$6 && o$7.setAttribute("nonce", n$6), o$7.textContent = e$6.cssText, s$5.appendChild(o$7);
	}
}, c$3 = e$4 ? (t$4) => t$4 : (t$4) => t$4 instanceof CSSStyleSheet ? ((t$5) => {
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
*/ const { is: i$5, defineProperty: e$5, getOwnPropertyDescriptor: h$4, getOwnPropertyNames: r$4, getOwnPropertySymbols: o$4, getPrototypeOf: n$5 } = Object, a$1 = globalThis, c$4 = a$1.trustedTypes, l$2 = c$4 ? c$4.emptyScript : "", p$2 = a$1.reactiveElementPolyfillSupport, d$2 = (t$4, s$5) => t$4, u$2 = {
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
		let i$6 = t$4;
		switch (s$5) {
			case Boolean:
				i$6 = null !== t$4;
				break;
			case Number:
				i$6 = null === t$4 ? null : Number(t$4);
				break;
			case Object:
			case Array: try {
				i$6 = JSON.parse(t$4);
			} catch (t$5) {
				i$6 = null;
			}
		}
		return i$6;
	}
}, f$3 = (t$4, s$5) => !i$5(t$4, s$5), b$1 = {
	attribute: !0,
	type: String,
	converter: u$2,
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
			const i$6 = Symbol(), h$5 = this.getPropertyDescriptor(t$4, i$6, s$5);
			void 0 !== h$5 && e$5(this.prototype, t$4, h$5);
		}
	}
	static getPropertyDescriptor(t$4, s$5, i$6) {
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
				r$5?.call(this, s$6), this.requestUpdate(t$4, h$5, i$6);
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
		const t$4 = n$5(this);
		t$4.finalize(), void 0 !== t$4.l && (this.l = [...t$4.l]), this.elementProperties = new Map(t$4.elementProperties);
	}
	static finalize() {
		if (this.hasOwnProperty(d$2("finalized"))) return;
		if (this.finalized = !0, this._$Ei(), this.hasOwnProperty(d$2("properties"))) {
			const t$5 = this.properties, s$5 = [...r$4(t$5), ...o$4(t$5)];
			for (const i$6 of s$5) this.createProperty(i$6, t$5[i$6]);
		}
		const t$4 = this[Symbol.metadata];
		if (null !== t$4) {
			const s$5 = litPropertyMetadata.get(t$4);
			if (void 0 !== s$5) for (const [t$5, i$6] of s$5) this.elementProperties.set(t$5, i$6);
		}
		this._$Eh = /* @__PURE__ */ new Map();
		for (const [t$5, s$5] of this.elementProperties) {
			const i$6 = this._$Eu(t$5, s$5);
			void 0 !== i$6 && this._$Eh.set(i$6, t$5);
		}
		this.elementStyles = this.finalizeStyles(this.styles);
	}
	static finalizeStyles(s$5) {
		const i$6 = [];
		if (Array.isArray(s$5)) {
			const e$6 = new Set(s$5.flat(Infinity).reverse());
			for (const s$6 of e$6) i$6.unshift(c$3(s$6));
		} else void 0 !== s$5 && i$6.push(c$3(s$5));
		return i$6;
	}
	static _$Eu(t$4, s$5) {
		const i$6 = s$5.attribute;
		return !1 === i$6 ? void 0 : "string" == typeof i$6 ? i$6 : "string" == typeof t$4 ? t$4.toLowerCase() : void 0;
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
		for (const i$6 of s$5.keys()) this.hasOwnProperty(i$6) && (t$4.set(i$6, this[i$6]), delete this[i$6]);
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
	attributeChangedCallback(t$4, s$5, i$6) {
		this._$AK(t$4, i$6);
	}
	_$ET(t$4, s$5) {
		const i$6 = this.constructor.elementProperties.get(t$4), e$6 = this.constructor._$Eu(t$4, i$6);
		if (void 0 !== e$6 && !0 === i$6.reflect) {
			const h$5 = (void 0 !== i$6.converter?.toAttribute ? i$6.converter : u$2).toAttribute(s$5, i$6.type);
			this._$Em = t$4, null == h$5 ? this.removeAttribute(e$6) : this.setAttribute(e$6, h$5), this._$Em = null;
		}
	}
	_$AK(t$4, s$5) {
		const i$6 = this.constructor, e$6 = i$6._$Eh.get(t$4);
		if (void 0 !== e$6 && this._$Em !== e$6) {
			const t$5 = i$6.getPropertyOptions(e$6), h$5 = "function" == typeof t$5.converter ? { fromAttribute: t$5.converter } : void 0 !== t$5.converter?.fromAttribute ? t$5.converter : u$2;
			this._$Em = e$6;
			const r$5 = h$5.fromAttribute(s$5, t$5.type);
			this[e$6] = r$5 ?? this._$Ej?.get(e$6) ?? r$5, this._$Em = null;
		}
	}
	requestUpdate(t$4, s$5, i$6) {
		if (void 0 !== t$4) {
			const e$6 = this.constructor, h$5 = this[t$4];
			if (i$6 ??= e$6.getPropertyOptions(t$4), !((i$6.hasChanged ?? f$3)(h$5, s$5) || i$6.useDefault && i$6.reflect && h$5 === this._$Ej?.get(t$4) && !this.hasAttribute(e$6._$Eu(t$4, i$6)))) return;
			this.C(t$4, s$5, i$6);
		}
		!1 === this.isUpdatePending && (this._$ES = this._$EP());
	}
	C(t$4, s$5, { useDefault: i$6, reflect: e$6, wrapped: h$5 }, r$5) {
		i$6 && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t$4) && (this._$Ej.set(t$4, r$5 ?? s$5 ?? this[t$4]), !0 !== h$5 || void 0 !== r$5) || (this._$AL.has(t$4) || (this.hasUpdated || i$6 || (s$5 = void 0), this._$AL.set(t$4, s$5)), !0 === e$6 && this._$Em !== t$4 && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t$4));
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
			if (t$5.size > 0) for (const [s$6, i$6] of t$5) {
				const { wrapped: t$6 } = i$6, e$6 = this[s$6];
				!0 !== t$6 || this._$AL.has(s$6) || void 0 === e$6 || this.C(s$6, void 0, i$6, e$6);
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
const t$2 = globalThis, i$3 = t$2.trustedTypes, s$3 = i$3 ? i$3.createPolicy("lit-html", { createHTML: (t$4) => t$4 }) : void 0, e$3 = "$lit$", h$3 = `lit$${Math.random().toFixed(9).slice(2)}$`, o$3 = "?" + h$3, n$3 = `<${o$3}>`, r$2 = document, l$1 = () => r$2.createComment(""), c$2 = (t$4) => null === t$4 || "object" != typeof t$4 && "function" != typeof t$4, a = Array.isArray, u$1 = (t$4) => a(t$4) || "function" == typeof t$4?.[Symbol.iterator], d$1 = "[ 	\n\f\r]", f$2 = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, v$1 = /-->/g, _ = />/g, m$1 = RegExp(`>|${d$1}(?:([^\\s"'>=/]+)(${d$1}*=${d$1}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`, "g"), p$1 = /'/g, g = /"/g, $ = /^(?:script|style|textarea|title)$/i, y$1 = (t$4) => (i$6, ...s$5) => ({
	_$litType$: t$4,
	strings: i$6,
	values: s$5
}), x = y$1(1), b = y$1(2), w = y$1(3), T = Symbol.for("lit-noChange"), E = Symbol.for("lit-nothing"), A = /* @__PURE__ */ new WeakMap(), C = r$2.createTreeWalker(r$2, 129);
function P(t$4, i$6) {
	if (!a(t$4) || !t$4.hasOwnProperty("raw")) throw Error("invalid template strings array");
	return void 0 !== s$3 ? s$3.createHTML(i$6) : i$6;
}
const V = (t$4, i$6) => {
	const s$5 = t$4.length - 1, o$6 = [];
	let r$5, l$3 = 2 === i$6 ? "<svg>" : 3 === i$6 ? "<math>" : "", c$5 = f$2;
	for (let i$7 = 0; i$7 < s$5; i$7++) {
		const s$6 = t$4[i$7];
		let a$2, u$3, d$3 = -1, y$2 = 0;
		for (; y$2 < s$6.length && (c$5.lastIndex = y$2, u$3 = c$5.exec(s$6), null !== u$3);) y$2 = c$5.lastIndex, c$5 === f$2 ? "!--" === u$3[1] ? c$5 = v$1 : void 0 !== u$3[1] ? c$5 = _ : void 0 !== u$3[2] ? ($.test(u$3[2]) && (r$5 = RegExp("</" + u$3[2], "g")), c$5 = m$1) : void 0 !== u$3[3] && (c$5 = m$1) : c$5 === m$1 ? ">" === u$3[0] ? (c$5 = r$5 ?? f$2, d$3 = -1) : void 0 === u$3[1] ? d$3 = -2 : (d$3 = c$5.lastIndex - u$3[2].length, a$2 = u$3[1], c$5 = void 0 === u$3[3] ? m$1 : "\"" === u$3[3] ? g : p$1) : c$5 === g || c$5 === p$1 ? c$5 = m$1 : c$5 === v$1 || c$5 === _ ? c$5 = f$2 : (c$5 = m$1, r$5 = void 0);
		const x$1 = c$5 === m$1 && t$4[i$7 + 1].startsWith("/>") ? " " : "";
		l$3 += c$5 === f$2 ? s$6 + n$3 : d$3 >= 0 ? (o$6.push(a$2), s$6.slice(0, d$3) + e$3 + s$6.slice(d$3) + h$3 + x$1) : s$6 + h$3 + (-2 === d$3 ? i$7 : x$1);
	}
	return [P(t$4, l$3 + (t$4[s$5] || "<?>") + (2 === i$6 ? "</svg>" : 3 === i$6 ? "</math>" : "")), o$6];
};
var N = class N {
	constructor({ strings: t$4, _$litType$: s$5 }, n$6) {
		let r$5;
		this.parts = [];
		let c$5 = 0, a$2 = 0;
		const u$3 = t$4.length - 1, d$3 = this.parts, [f$4, v$2] = V(t$4, s$5);
		if (this.el = N.createElement(f$4, n$6), C.currentNode = this.el.content, 2 === s$5 || 3 === s$5) {
			const t$5 = this.el.content.firstChild;
			t$5.replaceWith(...t$5.childNodes);
		}
		for (; null !== (r$5 = C.nextNode()) && d$3.length < u$3;) {
			if (1 === r$5.nodeType) {
				if (r$5.hasAttributes()) for (const t$5 of r$5.getAttributeNames()) if (t$5.endsWith(e$3)) {
					const i$6 = v$2[a$2++], s$6 = r$5.getAttribute(t$5).split(h$3), e$6 = /([.?@])?(.*)/.exec(i$6);
					d$3.push({
						type: 1,
						index: c$5,
						name: e$6[2],
						strings: s$6,
						ctor: "." === e$6[1] ? H : "?" === e$6[1] ? I : "@" === e$6[1] ? L : k
					}), r$5.removeAttribute(t$5);
				} else t$5.startsWith(h$3) && (d$3.push({
					type: 6,
					index: c$5
				}), r$5.removeAttribute(t$5));
				if ($.test(r$5.tagName)) {
					const t$5 = r$5.textContent.split(h$3), s$6 = t$5.length - 1;
					if (s$6 > 0) {
						r$5.textContent = i$3 ? i$3.emptyScript : "";
						for (let i$6 = 0; i$6 < s$6; i$6++) r$5.append(t$5[i$6], l$1()), C.nextNode(), d$3.push({
							type: 2,
							index: ++c$5
						});
						r$5.append(t$5[s$6], l$1());
					}
				}
			} else if (8 === r$5.nodeType) if (r$5.data === o$3) d$3.push({
				type: 2,
				index: c$5
			});
			else {
				let t$5 = -1;
				for (; -1 !== (t$5 = r$5.data.indexOf(h$3, t$5 + 1));) d$3.push({
					type: 7,
					index: c$5
				}), t$5 += h$3.length - 1;
			}
			c$5++;
		}
	}
	static createElement(t$4, i$6) {
		const s$5 = r$2.createElement("template");
		return s$5.innerHTML = t$4, s$5;
	}
};
function S(t$4, i$6, s$5 = t$4, e$6) {
	if (i$6 === T) return i$6;
	let h$5 = void 0 !== e$6 ? s$5._$Co?.[e$6] : s$5._$Cl;
	const o$6 = c$2(i$6) ? void 0 : i$6._$litDirective$;
	return h$5?.constructor !== o$6 && (h$5?._$AO?.(!1), void 0 === o$6 ? h$5 = void 0 : (h$5 = new o$6(t$4), h$5._$AT(t$4, s$5, e$6)), void 0 !== e$6 ? (s$5._$Co ??= [])[e$6] = h$5 : s$5._$Cl = h$5), void 0 !== h$5 && (i$6 = S(t$4, h$5._$AS(t$4, i$6.values), h$5, e$6)), i$6;
}
var M$1 = class {
	constructor(t$4, i$6) {
		this._$AV = [], this._$AN = void 0, this._$AD = t$4, this._$AM = i$6;
	}
	get parentNode() {
		return this._$AM.parentNode;
	}
	get _$AU() {
		return this._$AM._$AU;
	}
	u(t$4) {
		const { el: { content: i$6 }, parts: s$5 } = this._$AD, e$6 = (t$4?.creationScope ?? r$2).importNode(i$6, !0);
		C.currentNode = e$6;
		let h$5 = C.nextNode(), o$6 = 0, n$6 = 0, l$3 = s$5[0];
		for (; void 0 !== l$3;) {
			if (o$6 === l$3.index) {
				let i$7;
				2 === l$3.type ? i$7 = new R(h$5, h$5.nextSibling, this, t$4) : 1 === l$3.type ? i$7 = new l$3.ctor(h$5, l$3.name, l$3.strings, this, t$4) : 6 === l$3.type && (i$7 = new z(h$5, this, t$4)), this._$AV.push(i$7), l$3 = s$5[++n$6];
			}
			o$6 !== l$3?.index && (h$5 = C.nextNode(), o$6++);
		}
		return C.currentNode = r$2, e$6;
	}
	p(t$4) {
		let i$6 = 0;
		for (const s$5 of this._$AV) void 0 !== s$5 && (void 0 !== s$5.strings ? (s$5._$AI(t$4, s$5, i$6), i$6 += s$5.strings.length - 2) : s$5._$AI(t$4[i$6])), i$6++;
	}
};
var R = class R {
	get _$AU() {
		return this._$AM?._$AU ?? this._$Cv;
	}
	constructor(t$4, i$6, s$5, e$6) {
		this.type = 2, this._$AH = E, this._$AN = void 0, this._$AA = t$4, this._$AB = i$6, this._$AM = s$5, this.options = e$6, this._$Cv = e$6?.isConnected ?? !0;
	}
	get parentNode() {
		let t$4 = this._$AA.parentNode;
		const i$6 = this._$AM;
		return void 0 !== i$6 && 11 === t$4?.nodeType && (t$4 = i$6.parentNode), t$4;
	}
	get startNode() {
		return this._$AA;
	}
	get endNode() {
		return this._$AB;
	}
	_$AI(t$4, i$6 = this) {
		t$4 = S(this, t$4, i$6), c$2(t$4) ? t$4 === E || null == t$4 || "" === t$4 ? (this._$AH !== E && this._$AR(), this._$AH = E) : t$4 !== this._$AH && t$4 !== T && this._(t$4) : void 0 !== t$4._$litType$ ? this.$(t$4) : void 0 !== t$4.nodeType ? this.T(t$4) : u$1(t$4) ? this.k(t$4) : this._(t$4);
	}
	O(t$4) {
		return this._$AA.parentNode.insertBefore(t$4, this._$AB);
	}
	T(t$4) {
		this._$AH !== t$4 && (this._$AR(), this._$AH = this.O(t$4));
	}
	_(t$4) {
		this._$AH !== E && c$2(this._$AH) ? this._$AA.nextSibling.data = t$4 : this.T(r$2.createTextNode(t$4)), this._$AH = t$4;
	}
	$(t$4) {
		const { values: i$6, _$litType$: s$5 } = t$4, e$6 = "number" == typeof s$5 ? this._$AC(t$4) : (void 0 === s$5.el && (s$5.el = N.createElement(P(s$5.h, s$5.h[0]), this.options)), s$5);
		if (this._$AH?._$AD === e$6) this._$AH.p(i$6);
		else {
			const t$5 = new M$1(e$6, this), s$6 = t$5.u(this.options);
			t$5.p(i$6), this.T(s$6), this._$AH = t$5;
		}
	}
	_$AC(t$4) {
		let i$6 = A.get(t$4.strings);
		return void 0 === i$6 && A.set(t$4.strings, i$6 = new N(t$4)), i$6;
	}
	k(t$4) {
		a(this._$AH) || (this._$AH = [], this._$AR());
		const i$6 = this._$AH;
		let s$5, e$6 = 0;
		for (const h$5 of t$4) e$6 === i$6.length ? i$6.push(s$5 = new R(this.O(l$1()), this.O(l$1()), this, this.options)) : s$5 = i$6[e$6], s$5._$AI(h$5), e$6++;
		e$6 < i$6.length && (this._$AR(s$5 && s$5._$AB.nextSibling, e$6), i$6.length = e$6);
	}
	_$AR(t$4 = this._$AA.nextSibling, i$6) {
		for (this._$AP?.(!1, !0, i$6); t$4 !== this._$AB;) {
			const i$7 = t$4.nextSibling;
			t$4.remove(), t$4 = i$7;
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
	constructor(t$4, i$6, s$5, e$6, h$5) {
		this.type = 1, this._$AH = E, this._$AN = void 0, this.element = t$4, this.name = i$6, this._$AM = e$6, this.options = h$5, s$5.length > 2 || "" !== s$5[0] || "" !== s$5[1] ? (this._$AH = Array(s$5.length - 1).fill(/* @__PURE__ */ new String()), this.strings = s$5) : this._$AH = E;
	}
	_$AI(t$4, i$6 = this, s$5, e$6) {
		const h$5 = this.strings;
		let o$6 = !1;
		if (void 0 === h$5) t$4 = S(this, t$4, i$6, 0), o$6 = !c$2(t$4) || t$4 !== this._$AH && t$4 !== T, o$6 && (this._$AH = t$4);
		else {
			const e$7 = t$4;
			let n$6, r$5;
			for (t$4 = h$5[0], n$6 = 0; n$6 < h$5.length - 1; n$6++) r$5 = S(this, e$7[s$5 + n$6], i$6, n$6), r$5 === T && (r$5 = this._$AH[n$6]), o$6 ||= !c$2(r$5) || r$5 !== this._$AH[n$6], r$5 === E ? t$4 = E : t$4 !== E && (t$4 += (r$5 ?? "") + h$5[n$6 + 1]), this._$AH[n$6] = r$5;
		}
		o$6 && !e$6 && this.j(t$4);
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
	constructor(t$4, i$6, s$5, e$6, h$5) {
		super(t$4, i$6, s$5, e$6, h$5), this.type = 5;
	}
	_$AI(t$4, i$6 = this) {
		if ((t$4 = S(this, t$4, i$6, 0) ?? E) === T) return;
		const s$5 = this._$AH, e$6 = t$4 === E && s$5 !== E || t$4.capture !== s$5.capture || t$4.once !== s$5.once || t$4.passive !== s$5.passive, h$5 = t$4 !== E && (s$5 === E || e$6);
		e$6 && this.element.removeEventListener(this.name, this, s$5), h$5 && this.element.addEventListener(this.name, this, t$4), this._$AH = t$4;
	}
	handleEvent(t$4) {
		"function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t$4) : this._$AH.handleEvent(t$4);
	}
};
var z = class {
	constructor(t$4, i$6, s$5) {
		this.element = t$4, this.type = 6, this._$AN = void 0, this._$AM = i$6, this.options = s$5;
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
	A: o$3,
	C: 1,
	L: V,
	R: M$1,
	D: u$1,
	V: S,
	I: R,
	H: k,
	N: I,
	U: L,
	B: H,
	F: z
}, j = t$2.litHtmlPolyfillSupport;
j?.(N, R), (t$2.litHtmlVersions ??= []).push("3.3.1");
const B = (t$4, i$6, s$5) => {
	const e$6 = s$5?.renderBefore ?? i$6;
	let h$5 = e$6._$litPart$;
	if (void 0 === h$5) {
		const t$5 = s$5?.renderBefore ?? null;
		e$6._$litPart$ = h$5 = new R(i$6.insertBefore(l$1(), t$5), t$5, void 0, s$5 ?? {});
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
var i = class extends y {
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
i._$litElement$ = !0, i["finalized"] = !0, s$2.litElementHydrateSupport?.({ LitElement: i });
const o$2 = s$2.litElementPolyfillSupport;
o$2?.({ LitElement: i });
(s$2.litElementVersions ??= []).push("4.2.1");

//#endregion
//#region ../../node_modules/.pnpm/lit-html@3.3.1/node_modules/lit-html/directive-helpers.js
/**
* @license
* Copyright 2020 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/ const { I: t$1 } = Z, i$2 = (o$6) => null === o$6 || "object" != typeof o$6 && "function" != typeof o$6, n$2 = {
	HTML: 1,
	SVG: 2,
	MATHML: 3
}, e$2 = (o$6, t$4) => void 0 === t$4 ? void 0 !== o$6?._$litType$ : o$6?._$litType$ === t$4, l = (o$6) => null != o$6?._$litType$?.h, d = (o$6) => void 0 !== o$6?._$litDirective$, c$1 = (o$6) => o$6?._$litDirective$, f$1 = (o$6) => void 0 === o$6.strings, r$1 = () => document.createComment(""), s$1 = (o$6, i$6, n$6) => {
	const e$6 = o$6._$AA.parentNode, l$3 = void 0 === i$6 ? o$6._$AB : i$6._$AA;
	if (void 0 === n$6) {
		const i$7 = e$6.insertBefore(r$1(), l$3), d$3 = e$6.insertBefore(r$1(), l$3);
		n$6 = new t$1(i$7, d$3, o$6, o$6.options);
	} else {
		const t$4 = n$6._$AB.nextSibling, i$7 = n$6._$AM, d$3 = i$7 !== o$6;
		if (d$3) {
			let t$5;
			n$6._$AQ?.(o$6), n$6._$AM = o$6, void 0 !== n$6._$AP && (t$5 = o$6._$AU) !== i$7._$AU && n$6._$AP(t$5);
		}
		if (t$4 !== l$3 || d$3) {
			let o$7 = n$6._$AA;
			for (; o$7 !== t$4;) {
				const t$5 = o$7.nextSibling;
				e$6.insertBefore(o$7, l$3), o$7 = t$5;
			}
		}
	}
	return n$6;
}, v = (o$6, t$4, i$6 = o$6) => (o$6._$AI(t$4, i$6), o$6), u = {}, m = (o$6, t$4 = u) => o$6._$AH = t$4, p = (o$6) => o$6._$AH, M = (o$6) => {
	o$6._$AR(), o$6._$AA.remove();
}, h$2 = (o$6) => {
	o$6._$AR();
};

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
}, e = (t$4) => (...e$6) => ({
	_$litDirective$: t$4,
	values: e$6
});
var i$1 = class {
	constructor(t$4) {}
	get _$AU() {
		return this._$AM._$AU;
	}
	_$AT(t$4, e$6, i$6) {
		this._$Ct = t$4, this._$AM = e$6, this._$Ci = i$6;
	}
	_$AS(t$4, e$6) {
		return this.update(t$4, e$6);
	}
	update(t$4, e$6) {
		return this.render(...e$6);
	}
};

//#endregion
//#region ../../node_modules/.pnpm/lit-html@3.3.1/node_modules/lit-html/async-directive.js
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/ const s = (i$6, t$4) => {
	const e$6 = i$6._$AN;
	if (void 0 === e$6) return !1;
	for (const i$7 of e$6) i$7._$AO?.(t$4, !1), s(i$7, t$4);
	return !0;
}, o$1 = (i$6) => {
	let t$4, e$6;
	do {
		if (void 0 === (t$4 = i$6._$AM)) break;
		e$6 = t$4._$AN, e$6.delete(i$6), i$6 = t$4;
	} while (0 === e$6?.size);
}, r = (i$6) => {
	for (let t$4; t$4 = i$6._$AM; i$6 = t$4) {
		let e$6 = t$4._$AN;
		if (void 0 === e$6) t$4._$AN = e$6 = /* @__PURE__ */ new Set();
		else if (e$6.has(i$6)) break;
		e$6.add(i$6), c(t$4);
	}
};
function h$1(i$6) {
	void 0 !== this._$AN ? (o$1(this), this._$AM = i$6, r(this)) : this._$AM = i$6;
}
function n$1(i$6, t$4 = !1, e$6 = 0) {
	const r$5 = this._$AH, h$5 = this._$AN;
	if (void 0 !== h$5 && 0 !== h$5.size) if (t$4) if (Array.isArray(r$5)) for (let i$7 = e$6; i$7 < r$5.length; i$7++) s(r$5[i$7], !1), o$1(r$5[i$7]);
	else null != r$5 && (s(r$5, !1), o$1(r$5));
	else s(this, i$6);
}
const c = (i$6) => {
	i$6.type == t.CHILD && (i$6._$AP ??= n$1, i$6._$AQ ??= h$1);
};
var f = class extends i$1 {
	constructor() {
		super(...arguments), this._$AN = void 0;
	}
	_$AT(i$6, t$4, e$6) {
		super._$AT(i$6, t$4, e$6), r(this), this.isConnected = i$6._$AU;
	}
	_$AO(i$6, t$4 = !0) {
		i$6 !== this.isConnected && (this.isConnected = i$6, i$6 ? this.reconnected?.() : this.disconnected?.()), t$4 && (s(this, i$6), o$1(this));
	}
	setValue(t$4) {
		if (f$1(this._$Ct)) this._$Ct._$AI(t$4, this);
		else {
			const i$6 = [...this._$Ct._$AH];
			i$6[this._$Ci] = t$4, this._$Ct._$AI(i$6, this, 0);
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
*/ const e$1 = () => new h();
var h = class {};
const o = /* @__PURE__ */ new WeakMap(), n = e(class extends f {
	render(i$6) {
		return E;
	}
	update(i$6, [s$5]) {
		const e$6 = s$5 !== this.G;
		return e$6 && void 0 !== this.G && this.rt(void 0), (e$6 || this.lt !== this.ct) && (this.G = s$5, this.ht = i$6.options?.host, this.rt(this.ct = i$6.element)), E;
	}
	rt(t$4) {
		if (this.isConnected || (t$4 = void 0), "function" == typeof this.G) {
			const i$6 = this.ht ?? globalThis;
			let s$5 = o.get(i$6);
			void 0 === s$5 && (s$5 = /* @__PURE__ */ new WeakMap(), o.set(i$6, s$5)), void 0 !== s$5.get(this.G) && this.G.call(this.ht, void 0), s$5.set(this.G, t$4), void 0 !== t$4 && this.G.call(this.ht, t$4);
		} else this.G.value = t$4;
	}
	get lt() {
		return "function" == typeof this.G ? o.get(this.ht ?? globalThis)?.get(this.G) : this.G?.value;
	}
	disconnected() {
		this.lt === this.ct && this.rt(void 0);
	}
	reconnected() {
		this.rt(this.ct);
	}
});

//#endregion
//#region src/core/WebAuthnManager/LitComponents/LitElementWithProps.ts
/**
* Drop-in replacement for LitElement that automatically handles the custom element upgrade race.
* See lit-element-with-props.md for more details.
* All properties defined in static properties will be automatically upgraded on mount.
*/
var LitElementWithProps = class extends i {
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
export { LitElementWithProps, e$1 as e, i$4 as i, n, x };