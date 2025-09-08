//#region ../../node_modules/.pnpm/@lit+reactive-element@2.1.1/node_modules/@lit/reactive-element/css-tag.js
/**
* @license
* Copyright 2019 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
const t$3 = globalThis, e$3 = t$3.ShadowRoot && (void 0 === t$3.ShadyCSS || t$3.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, s$3 = Symbol(), o$3 = /* @__PURE__ */ new WeakMap();
var n$2 = class {
	constructor(t$4, e$5, o$4) {
		if (this._$cssResult$ = !0, o$4 !== s$3) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
		this.cssText = t$4, this.t = e$5;
	}
	get styleSheet() {
		let t$4 = this.o;
		const s$4 = this.t;
		if (e$3 && void 0 === t$4) {
			const e$5 = void 0 !== s$4 && 1 === s$4.length;
			e$5 && (t$4 = o$3.get(s$4)), void 0 === t$4 && ((this.o = t$4 = new CSSStyleSheet()).replaceSync(this.cssText), e$5 && o$3.set(s$4, t$4));
		}
		return t$4;
	}
	toString() {
		return this.cssText;
	}
};
const r$2 = (t$4) => new n$2("string" == typeof t$4 ? t$4 : t$4 + "", void 0, s$3), i = (t$4, ...e$5) => {
	const o$4 = 1 === t$4.length ? t$4[0] : e$5.reduce(((e$6, s$4, o$5) => e$6 + ((t$5) => {
		if (!0 === t$5._$cssResult$) return t$5.cssText;
		if ("number" == typeof t$5) return t$5;
		throw Error("Value passed to 'css' function must be a 'css' function result: " + t$5 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
	})(s$4) + t$4[o$5 + 1]), t$4[0]);
	return new n$2(o$4, t$4, s$3);
}, S$1 = (s$4, o$4) => {
	if (e$3) s$4.adoptedStyleSheets = o$4.map(((t$4) => t$4 instanceof CSSStyleSheet ? t$4 : t$4.styleSheet));
	else for (const e$5 of o$4) {
		const o$5 = document.createElement("style"), n$4 = t$3.litNonce;
		void 0 !== n$4 && o$5.setAttribute("nonce", n$4), o$5.textContent = e$5.cssText, s$4.appendChild(o$5);
	}
}, c$3 = e$3 ? (t$4) => t$4 : (t$4) => t$4 instanceof CSSStyleSheet ? ((t$5) => {
	let e$5 = "";
	for (const s$4 of t$5.cssRules) e$5 += s$4.cssText;
	return r$2(e$5);
})(t$4) : t$4;

//#endregion
//#region ../../node_modules/.pnpm/@lit+reactive-element@2.1.1/node_modules/@lit/reactive-element/reactive-element.js
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/ const { is: i$5, defineProperty: e$4, getOwnPropertyDescriptor: h$2, getOwnPropertyNames: r$3, getOwnPropertySymbols: o$2, getPrototypeOf: n$3 } = Object, a$1 = globalThis, c$4 = a$1.trustedTypes, l$2 = c$4 ? c$4.emptyScript : "", p$2 = a$1.reactiveElementPolyfillSupport, d$2 = (t$4, s$4) => t$4, u$3 = {
	toAttribute(t$4, s$4) {
		switch (s$4) {
			case Boolean:
				t$4 = t$4 ? l$2 : null;
				break;
			case Object:
			case Array: t$4 = null == t$4 ? t$4 : JSON.stringify(t$4);
		}
		return t$4;
	},
	fromAttribute(t$4, s$4) {
		let i$6 = t$4;
		switch (s$4) {
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
}, f$2 = (t$4, s$4) => !i$5(t$4, s$4), b$1 = {
	attribute: !0,
	type: String,
	converter: u$3,
	reflect: !1,
	useDefault: !1,
	hasChanged: f$2
};
Symbol.metadata ??= Symbol("metadata"), a$1.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
var y = class extends HTMLElement {
	static addInitializer(t$4) {
		this._$Ei(), (this.l ??= []).push(t$4);
	}
	static get observedAttributes() {
		return this.finalize(), this._$Eh && [...this._$Eh.keys()];
	}
	static createProperty(t$4, s$4 = b$1) {
		if (s$4.state && (s$4.attribute = !1), this._$Ei(), this.prototype.hasOwnProperty(t$4) && ((s$4 = Object.create(s$4)).wrapped = !0), this.elementProperties.set(t$4, s$4), !s$4.noAccessor) {
			const i$6 = Symbol(), h$3 = this.getPropertyDescriptor(t$4, i$6, s$4);
			void 0 !== h$3 && e$4(this.prototype, t$4, h$3);
		}
	}
	static getPropertyDescriptor(t$4, s$4, i$6) {
		const { get: e$5, set: r$4 } = h$2(this.prototype, t$4) ?? {
			get() {
				return this[s$4];
			},
			set(t$5) {
				this[s$4] = t$5;
			}
		};
		return {
			get: e$5,
			set(s$5) {
				const h$3 = e$5?.call(this);
				r$4?.call(this, s$5), this.requestUpdate(t$4, h$3, i$6);
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
		const t$4 = n$3(this);
		t$4.finalize(), void 0 !== t$4.l && (this.l = [...t$4.l]), this.elementProperties = new Map(t$4.elementProperties);
	}
	static finalize() {
		if (this.hasOwnProperty(d$2("finalized"))) return;
		if (this.finalized = !0, this._$Ei(), this.hasOwnProperty(d$2("properties"))) {
			const t$5 = this.properties, s$4 = [...r$3(t$5), ...o$2(t$5)];
			for (const i$6 of s$4) this.createProperty(i$6, t$5[i$6]);
		}
		const t$4 = this[Symbol.metadata];
		if (null !== t$4) {
			const s$4 = litPropertyMetadata.get(t$4);
			if (void 0 !== s$4) for (const [t$5, i$6] of s$4) this.elementProperties.set(t$5, i$6);
		}
		this._$Eh = /* @__PURE__ */ new Map();
		for (const [t$5, s$4] of this.elementProperties) {
			const i$6 = this._$Eu(t$5, s$4);
			void 0 !== i$6 && this._$Eh.set(i$6, t$5);
		}
		this.elementStyles = this.finalizeStyles(this.styles);
	}
	static finalizeStyles(s$4) {
		const i$6 = [];
		if (Array.isArray(s$4)) {
			const e$5 = new Set(s$4.flat(Infinity).reverse());
			for (const s$5 of e$5) i$6.unshift(c$3(s$5));
		} else void 0 !== s$4 && i$6.push(c$3(s$4));
		return i$6;
	}
	static _$Eu(t$4, s$4) {
		const i$6 = s$4.attribute;
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
		const t$4 = /* @__PURE__ */ new Map(), s$4 = this.constructor.elementProperties;
		for (const i$6 of s$4.keys()) this.hasOwnProperty(i$6) && (t$4.set(i$6, this[i$6]), delete this[i$6]);
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
	attributeChangedCallback(t$4, s$4, i$6) {
		this._$AK(t$4, i$6);
	}
	_$ET(t$4, s$4) {
		const i$6 = this.constructor.elementProperties.get(t$4), e$5 = this.constructor._$Eu(t$4, i$6);
		if (void 0 !== e$5 && !0 === i$6.reflect) {
			const h$3 = (void 0 !== i$6.converter?.toAttribute ? i$6.converter : u$3).toAttribute(s$4, i$6.type);
			this._$Em = t$4, null == h$3 ? this.removeAttribute(e$5) : this.setAttribute(e$5, h$3), this._$Em = null;
		}
	}
	_$AK(t$4, s$4) {
		const i$6 = this.constructor, e$5 = i$6._$Eh.get(t$4);
		if (void 0 !== e$5 && this._$Em !== e$5) {
			const t$5 = i$6.getPropertyOptions(e$5), h$3 = "function" == typeof t$5.converter ? { fromAttribute: t$5.converter } : void 0 !== t$5.converter?.fromAttribute ? t$5.converter : u$3;
			this._$Em = e$5;
			const r$4 = h$3.fromAttribute(s$4, t$5.type);
			this[e$5] = r$4 ?? this._$Ej?.get(e$5) ?? r$4, this._$Em = null;
		}
	}
	requestUpdate(t$4, s$4, i$6) {
		if (void 0 !== t$4) {
			const e$5 = this.constructor, h$3 = this[t$4];
			if (i$6 ??= e$5.getPropertyOptions(t$4), !((i$6.hasChanged ?? f$2)(h$3, s$4) || i$6.useDefault && i$6.reflect && h$3 === this._$Ej?.get(t$4) && !this.hasAttribute(e$5._$Eu(t$4, i$6)))) return;
			this.C(t$4, s$4, i$6);
		}
		!1 === this.isUpdatePending && (this._$ES = this._$EP());
	}
	C(t$4, s$4, { useDefault: i$6, reflect: e$5, wrapped: h$3 }, r$4) {
		i$6 && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t$4) && (this._$Ej.set(t$4, r$4 ?? s$4 ?? this[t$4]), !0 !== h$3 || void 0 !== r$4) || (this._$AL.has(t$4) || (this.hasUpdated || i$6 || (s$4 = void 0), this._$AL.set(t$4, s$4)), !0 === e$5 && this._$Em !== t$4 && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t$4));
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
				for (const [t$6, s$5] of this._$Ep) this[t$6] = s$5;
				this._$Ep = void 0;
			}
			const t$5 = this.constructor.elementProperties;
			if (t$5.size > 0) for (const [s$5, i$6] of t$5) {
				const { wrapped: t$6 } = i$6, e$5 = this[s$5];
				!0 !== t$6 || this._$AL.has(s$5) || void 0 === e$5 || this.C(s$5, void 0, i$6, e$5);
			}
		}
		let t$4 = !1;
		const s$4 = this._$AL;
		try {
			t$4 = this.shouldUpdate(s$4), t$4 ? (this.willUpdate(s$4), this._$EO?.forEach(((t$5) => t$5.hostUpdate?.())), this.update(s$4)) : this._$EM();
		} catch (s$5) {
			throw t$4 = !1, this._$EM(), s$5;
		}
		t$4 && this._$AE(s$4);
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
const t$2 = globalThis, i$4 = t$2.trustedTypes, s$2 = i$4 ? i$4.createPolicy("lit-html", { createHTML: (t$4) => t$4 }) : void 0, e$2 = "$lit$", h$1 = `lit$${Math.random().toFixed(9).slice(2)}$`, o$1 = "?" + h$1, n$1 = `<${o$1}>`, r$1 = document, l$1 = () => r$1.createComment(""), c$2 = (t$4) => null === t$4 || "object" != typeof t$4 && "function" != typeof t$4, a = Array.isArray, u$2 = (t$4) => a(t$4) || "function" == typeof t$4?.[Symbol.iterator], d$1 = "[ 	\n\f\r]", f$1 = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, v$1 = /-->/g, _ = />/g, m$1 = RegExp(`>|${d$1}(?:([^\\s"'>=/]+)(${d$1}*=${d$1}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`, "g"), p$1 = /'/g, g = /"/g, $ = /^(?:script|style|textarea|title)$/i, y$1 = (t$4) => (i$6, ...s$4) => ({
	_$litType$: t$4,
	strings: i$6,
	values: s$4
}), x = y$1(1), b = y$1(2), w = y$1(3), T = Symbol.for("lit-noChange"), E = Symbol.for("lit-nothing"), A = /* @__PURE__ */ new WeakMap(), C = r$1.createTreeWalker(r$1, 129);
function P(t$4, i$6) {
	if (!a(t$4) || !t$4.hasOwnProperty("raw")) throw Error("invalid template strings array");
	return void 0 !== s$2 ? s$2.createHTML(i$6) : i$6;
}
const V = (t$4, i$6) => {
	const s$4 = t$4.length - 1, o$4 = [];
	let r$4, l$3 = 2 === i$6 ? "<svg>" : 3 === i$6 ? "<math>" : "", c$5 = f$1;
	for (let i$7 = 0; i$7 < s$4; i$7++) {
		const s$5 = t$4[i$7];
		let a$2, u$4, d$3 = -1, y$2 = 0;
		for (; y$2 < s$5.length && (c$5.lastIndex = y$2, u$4 = c$5.exec(s$5), null !== u$4);) y$2 = c$5.lastIndex, c$5 === f$1 ? "!--" === u$4[1] ? c$5 = v$1 : void 0 !== u$4[1] ? c$5 = _ : void 0 !== u$4[2] ? ($.test(u$4[2]) && (r$4 = RegExp("</" + u$4[2], "g")), c$5 = m$1) : void 0 !== u$4[3] && (c$5 = m$1) : c$5 === m$1 ? ">" === u$4[0] ? (c$5 = r$4 ?? f$1, d$3 = -1) : void 0 === u$4[1] ? d$3 = -2 : (d$3 = c$5.lastIndex - u$4[2].length, a$2 = u$4[1], c$5 = void 0 === u$4[3] ? m$1 : "\"" === u$4[3] ? g : p$1) : c$5 === g || c$5 === p$1 ? c$5 = m$1 : c$5 === v$1 || c$5 === _ ? c$5 = f$1 : (c$5 = m$1, r$4 = void 0);
		const x$1 = c$5 === m$1 && t$4[i$7 + 1].startsWith("/>") ? " " : "";
		l$3 += c$5 === f$1 ? s$5 + n$1 : d$3 >= 0 ? (o$4.push(a$2), s$5.slice(0, d$3) + e$2 + s$5.slice(d$3) + h$1 + x$1) : s$5 + h$1 + (-2 === d$3 ? i$7 : x$1);
	}
	return [P(t$4, l$3 + (t$4[s$4] || "<?>") + (2 === i$6 ? "</svg>" : 3 === i$6 ? "</math>" : "")), o$4];
};
var N = class N {
	constructor({ strings: t$4, _$litType$: s$4 }, n$4) {
		let r$4;
		this.parts = [];
		let c$5 = 0, a$2 = 0;
		const u$4 = t$4.length - 1, d$3 = this.parts, [f$3, v$2] = V(t$4, s$4);
		if (this.el = N.createElement(f$3, n$4), C.currentNode = this.el.content, 2 === s$4 || 3 === s$4) {
			const t$5 = this.el.content.firstChild;
			t$5.replaceWith(...t$5.childNodes);
		}
		for (; null !== (r$4 = C.nextNode()) && d$3.length < u$4;) {
			if (1 === r$4.nodeType) {
				if (r$4.hasAttributes()) for (const t$5 of r$4.getAttributeNames()) if (t$5.endsWith(e$2)) {
					const i$6 = v$2[a$2++], s$5 = r$4.getAttribute(t$5).split(h$1), e$5 = /([.?@])?(.*)/.exec(i$6);
					d$3.push({
						type: 1,
						index: c$5,
						name: e$5[2],
						strings: s$5,
						ctor: "." === e$5[1] ? H : "?" === e$5[1] ? I : "@" === e$5[1] ? L : k
					}), r$4.removeAttribute(t$5);
				} else t$5.startsWith(h$1) && (d$3.push({
					type: 6,
					index: c$5
				}), r$4.removeAttribute(t$5));
				if ($.test(r$4.tagName)) {
					const t$5 = r$4.textContent.split(h$1), s$5 = t$5.length - 1;
					if (s$5 > 0) {
						r$4.textContent = i$4 ? i$4.emptyScript : "";
						for (let i$6 = 0; i$6 < s$5; i$6++) r$4.append(t$5[i$6], l$1()), C.nextNode(), d$3.push({
							type: 2,
							index: ++c$5
						});
						r$4.append(t$5[s$5], l$1());
					}
				}
			} else if (8 === r$4.nodeType) if (r$4.data === o$1) d$3.push({
				type: 2,
				index: c$5
			});
			else {
				let t$5 = -1;
				for (; -1 !== (t$5 = r$4.data.indexOf(h$1, t$5 + 1));) d$3.push({
					type: 7,
					index: c$5
				}), t$5 += h$1.length - 1;
			}
			c$5++;
		}
	}
	static createElement(t$4, i$6) {
		const s$4 = r$1.createElement("template");
		return s$4.innerHTML = t$4, s$4;
	}
};
function S(t$4, i$6, s$4 = t$4, e$5) {
	if (i$6 === T) return i$6;
	let h$3 = void 0 !== e$5 ? s$4._$Co?.[e$5] : s$4._$Cl;
	const o$4 = c$2(i$6) ? void 0 : i$6._$litDirective$;
	return h$3?.constructor !== o$4 && (h$3?._$AO?.(!1), void 0 === o$4 ? h$3 = void 0 : (h$3 = new o$4(t$4), h$3._$AT(t$4, s$4, e$5)), void 0 !== e$5 ? (s$4._$Co ??= [])[e$5] = h$3 : s$4._$Cl = h$3), void 0 !== h$3 && (i$6 = S(t$4, h$3._$AS(t$4, i$6.values), h$3, e$5)), i$6;
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
		const { el: { content: i$6 }, parts: s$4 } = this._$AD, e$5 = (t$4?.creationScope ?? r$1).importNode(i$6, !0);
		C.currentNode = e$5;
		let h$3 = C.nextNode(), o$4 = 0, n$4 = 0, l$3 = s$4[0];
		for (; void 0 !== l$3;) {
			if (o$4 === l$3.index) {
				let i$7;
				2 === l$3.type ? i$7 = new R(h$3, h$3.nextSibling, this, t$4) : 1 === l$3.type ? i$7 = new l$3.ctor(h$3, l$3.name, l$3.strings, this, t$4) : 6 === l$3.type && (i$7 = new z(h$3, this, t$4)), this._$AV.push(i$7), l$3 = s$4[++n$4];
			}
			o$4 !== l$3?.index && (h$3 = C.nextNode(), o$4++);
		}
		return C.currentNode = r$1, e$5;
	}
	p(t$4) {
		let i$6 = 0;
		for (const s$4 of this._$AV) void 0 !== s$4 && (void 0 !== s$4.strings ? (s$4._$AI(t$4, s$4, i$6), i$6 += s$4.strings.length - 2) : s$4._$AI(t$4[i$6])), i$6++;
	}
};
var R = class R {
	get _$AU() {
		return this._$AM?._$AU ?? this._$Cv;
	}
	constructor(t$4, i$6, s$4, e$5) {
		this.type = 2, this._$AH = E, this._$AN = void 0, this._$AA = t$4, this._$AB = i$6, this._$AM = s$4, this.options = e$5, this._$Cv = e$5?.isConnected ?? !0;
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
		t$4 = S(this, t$4, i$6), c$2(t$4) ? t$4 === E || null == t$4 || "" === t$4 ? (this._$AH !== E && this._$AR(), this._$AH = E) : t$4 !== this._$AH && t$4 !== T && this._(t$4) : void 0 !== t$4._$litType$ ? this.$(t$4) : void 0 !== t$4.nodeType ? this.T(t$4) : u$2(t$4) ? this.k(t$4) : this._(t$4);
	}
	O(t$4) {
		return this._$AA.parentNode.insertBefore(t$4, this._$AB);
	}
	T(t$4) {
		this._$AH !== t$4 && (this._$AR(), this._$AH = this.O(t$4));
	}
	_(t$4) {
		this._$AH !== E && c$2(this._$AH) ? this._$AA.nextSibling.data = t$4 : this.T(r$1.createTextNode(t$4)), this._$AH = t$4;
	}
	$(t$4) {
		const { values: i$6, _$litType$: s$4 } = t$4, e$5 = "number" == typeof s$4 ? this._$AC(t$4) : (void 0 === s$4.el && (s$4.el = N.createElement(P(s$4.h, s$4.h[0]), this.options)), s$4);
		if (this._$AH?._$AD === e$5) this._$AH.p(i$6);
		else {
			const t$5 = new M$1(e$5, this), s$5 = t$5.u(this.options);
			t$5.p(i$6), this.T(s$5), this._$AH = t$5;
		}
	}
	_$AC(t$4) {
		let i$6 = A.get(t$4.strings);
		return void 0 === i$6 && A.set(t$4.strings, i$6 = new N(t$4)), i$6;
	}
	k(t$4) {
		a(this._$AH) || (this._$AH = [], this._$AR());
		const i$6 = this._$AH;
		let s$4, e$5 = 0;
		for (const h$3 of t$4) e$5 === i$6.length ? i$6.push(s$4 = new R(this.O(l$1()), this.O(l$1()), this, this.options)) : s$4 = i$6[e$5], s$4._$AI(h$3), e$5++;
		e$5 < i$6.length && (this._$AR(s$4 && s$4._$AB.nextSibling, e$5), i$6.length = e$5);
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
	constructor(t$4, i$6, s$4, e$5, h$3) {
		this.type = 1, this._$AH = E, this._$AN = void 0, this.element = t$4, this.name = i$6, this._$AM = e$5, this.options = h$3, s$4.length > 2 || "" !== s$4[0] || "" !== s$4[1] ? (this._$AH = Array(s$4.length - 1).fill(/* @__PURE__ */ new String()), this.strings = s$4) : this._$AH = E;
	}
	_$AI(t$4, i$6 = this, s$4, e$5) {
		const h$3 = this.strings;
		let o$4 = !1;
		if (void 0 === h$3) t$4 = S(this, t$4, i$6, 0), o$4 = !c$2(t$4) || t$4 !== this._$AH && t$4 !== T, o$4 && (this._$AH = t$4);
		else {
			const e$6 = t$4;
			let n$4, r$4;
			for (t$4 = h$3[0], n$4 = 0; n$4 < h$3.length - 1; n$4++) r$4 = S(this, e$6[s$4 + n$4], i$6, n$4), r$4 === T && (r$4 = this._$AH[n$4]), o$4 ||= !c$2(r$4) || r$4 !== this._$AH[n$4], r$4 === E ? t$4 = E : t$4 !== E && (t$4 += (r$4 ?? "") + h$3[n$4 + 1]), this._$AH[n$4] = r$4;
		}
		o$4 && !e$5 && this.j(t$4);
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
	constructor(t$4, i$6, s$4, e$5, h$3) {
		super(t$4, i$6, s$4, e$5, h$3), this.type = 5;
	}
	_$AI(t$4, i$6 = this) {
		if ((t$4 = S(this, t$4, i$6, 0) ?? E) === T) return;
		const s$4 = this._$AH, e$5 = t$4 === E && s$4 !== E || t$4.capture !== s$4.capture || t$4.once !== s$4.once || t$4.passive !== s$4.passive, h$3 = t$4 !== E && (s$4 === E || e$5);
		e$5 && this.element.removeEventListener(this.name, this, s$4), h$3 && this.element.addEventListener(this.name, this, t$4), this._$AH = t$4;
	}
	handleEvent(t$4) {
		"function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t$4) : this._$AH.handleEvent(t$4);
	}
};
var z = class {
	constructor(t$4, i$6, s$4) {
		this.element = t$4, this.type = 6, this._$AN = void 0, this._$AM = i$6, this.options = s$4;
	}
	get _$AU() {
		return this._$AM._$AU;
	}
	_$AI(t$4) {
		S(this, t$4);
	}
};
const Z = {
	M: e$2,
	P: h$1,
	A: o$1,
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
const B = (t$4, i$6, s$4) => {
	const e$5 = s$4?.renderBefore ?? i$6;
	let h$3 = e$5._$litPart$;
	if (void 0 === h$3) {
		const t$5 = s$4?.renderBefore ?? null;
		e$5._$litPart$ = h$3 = new R(i$6.insertBefore(l$1(), t$5), t$5, void 0, s$4 ?? {});
	}
	return h$3._$AI(t$4), h$3;
};

//#endregion
//#region ../../node_modules/.pnpm/lit-element@4.2.1/node_modules/lit-element/lit-element.js
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/ const s$1 = globalThis;
var i$3 = class extends y {
	constructor() {
		super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
	}
	createRenderRoot() {
		const t$4 = super.createRenderRoot();
		return this.renderOptions.renderBefore ??= t$4.firstChild, t$4;
	}
	update(t$4) {
		const r$4 = this.render();
		this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t$4), this._$Do = B(r$4, this.renderRoot, this.renderOptions);
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
i$3._$litElement$ = !0, i$3["finalized"] = !0, s$1.litElementHydrateSupport?.({ LitElement: i$3 });
const o = s$1.litElementPolyfillSupport;
o?.({ LitElement: i$3 });
(s$1.litElementVersions ??= []).push("4.2.1");

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
function isActionArgsWasm(a$2) {
	return a$2 && typeof a$2 === "object" && "action_type" in a$2;
}
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

//#endregion
//#region src/core/WebAuthnManager/LitComponents/LitElementWithProps.ts
/**
* Drop-in replacement for LitElement that automatically handles the custom element upgrade race.
* See lit-element-with-props.md for more details.
* All properties defined in static properties will be automatically upgraded on mount.
*/
var LitElementWithProps = class extends i$3 {
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
}, e = (t$4) => (...e$5) => ({
	_$litDirective$: t$4,
	values: e$5
});
var i$1 = class {
	constructor(t$4) {}
	get _$AU() {
		return this._$AM._$AU;
	}
	_$AT(t$4, e$5, i$6) {
		this._$Ct = t$4, this._$AM = e$5, this._$Ci = i$6;
	}
	_$AS(t$4, e$5) {
		return this.update(t$4, e$5);
	}
	update(t$4, e$5) {
		return this.render(...e$5);
	}
};

//#endregion
//#region ../../node_modules/.pnpm/lit-html@3.3.1/node_modules/lit-html/directive-helpers.js
/**
* @license
* Copyright 2020 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/ const { I: t$1 } = Z, i$2 = (o$4) => null === o$4 || "object" != typeof o$4 && "function" != typeof o$4, n = {
	HTML: 1,
	SVG: 2,
	MATHML: 3
}, e$1 = (o$4, t$4) => void 0 === t$4 ? void 0 !== o$4?._$litType$ : o$4?._$litType$ === t$4, l = (o$4) => null != o$4?._$litType$?.h, d = (o$4) => void 0 !== o$4?._$litDirective$, c$1 = (o$4) => o$4?._$litDirective$, f = (o$4) => void 0 === o$4.strings, r = () => document.createComment(""), s = (o$4, i$6, n$4) => {
	const e$5 = o$4._$AA.parentNode, l$3 = void 0 === i$6 ? o$4._$AB : i$6._$AA;
	if (void 0 === n$4) {
		const i$7 = e$5.insertBefore(r(), l$3), d$3 = e$5.insertBefore(r(), l$3);
		n$4 = new t$1(i$7, d$3, o$4, o$4.options);
	} else {
		const t$4 = n$4._$AB.nextSibling, i$7 = n$4._$AM, d$3 = i$7 !== o$4;
		if (d$3) {
			let t$5;
			n$4._$AQ?.(o$4), n$4._$AM = o$4, void 0 !== n$4._$AP && (t$5 = o$4._$AU) !== i$7._$AU && n$4._$AP(t$5);
		}
		if (t$4 !== l$3 || d$3) {
			let o$5 = n$4._$AA;
			for (; o$5 !== t$4;) {
				const t$5 = o$5.nextSibling;
				e$5.insertBefore(o$5, l$3), o$5 = t$5;
			}
		}
	}
	return n$4;
}, v = (o$4, t$4, i$6 = o$4) => (o$4._$AI(t$4, i$6), o$4), u$1 = {}, m = (o$4, t$4 = u$1) => o$4._$AH = t$4, p = (o$4) => o$4._$AH, M = (o$4) => {
	o$4._$AR(), o$4._$AA.remove();
}, h = (o$4) => {
	o$4._$AR();
};

//#endregion
//#region ../../node_modules/.pnpm/lit-html@3.3.1/node_modules/lit-html/directives/repeat.js
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
const u = (e$5, s$4, t$4) => {
	const r$4 = /* @__PURE__ */ new Map();
	for (let l$3 = s$4; l$3 <= t$4; l$3++) r$4.set(e$5[l$3], l$3);
	return r$4;
}, c = e(class extends i$1 {
	constructor(e$5) {
		if (super(e$5), e$5.type !== t.CHILD) throw Error("repeat() can only be used in text expressions");
	}
	dt(e$5, s$4, t$4) {
		let r$4;
		void 0 === t$4 ? t$4 = s$4 : void 0 !== s$4 && (r$4 = s$4);
		const l$3 = [], o$4 = [];
		let i$6 = 0;
		for (const s$5 of e$5) l$3[i$6] = r$4 ? r$4(s$5, i$6) : i$6, o$4[i$6] = t$4(s$5, i$6), i$6++;
		return {
			values: o$4,
			keys: l$3
		};
	}
	render(e$5, s$4, t$4) {
		return this.dt(e$5, s$4, t$4).values;
	}
	update(s$4, [t$4, r$4, c$5]) {
		const d$3 = p(s$4), { values: p$3, keys: a$2 } = this.dt(t$4, r$4, c$5);
		if (!Array.isArray(d$3)) return this.ut = a$2, p$3;
		const h$3 = this.ut ??= [], v$2 = [];
		let m$2, y$2, x$1 = 0, j$1 = d$3.length - 1, k$1 = 0, w$1 = p$3.length - 1;
		for (; x$1 <= j$1 && k$1 <= w$1;) if (null === d$3[x$1]) x$1++;
		else if (null === d$3[j$1]) j$1--;
		else if (h$3[x$1] === a$2[k$1]) v$2[k$1] = v(d$3[x$1], p$3[k$1]), x$1++, k$1++;
		else if (h$3[j$1] === a$2[w$1]) v$2[w$1] = v(d$3[j$1], p$3[w$1]), j$1--, w$1--;
		else if (h$3[x$1] === a$2[w$1]) v$2[w$1] = v(d$3[x$1], p$3[w$1]), s(s$4, v$2[w$1 + 1], d$3[x$1]), x$1++, w$1--;
		else if (h$3[j$1] === a$2[k$1]) v$2[k$1] = v(d$3[j$1], p$3[k$1]), s(s$4, d$3[x$1], d$3[j$1]), j$1--, k$1++;
		else if (void 0 === m$2 && (m$2 = u(a$2, k$1, w$1), y$2 = u(h$3, x$1, j$1)), m$2.has(h$3[x$1])) if (m$2.has(h$3[j$1])) {
			const e$5 = y$2.get(a$2[k$1]), t$5 = void 0 !== e$5 ? d$3[e$5] : null;
			if (null === t$5) {
				const e$6 = s(s$4, d$3[x$1]);
				v(e$6, p$3[k$1]), v$2[k$1] = e$6;
			} else v$2[k$1] = v(t$5, p$3[k$1]), s(s$4, d$3[x$1], t$5), d$3[e$5] = null;
			k$1++;
		} else M(d$3[j$1]), j$1--;
		else M(d$3[x$1]), x$1++;
		for (; k$1 <= w$1;) {
			const e$5 = s(s$4, v$2[w$1 + 1]);
			v(e$5, p$3[k$1]), v$2[k$1++] = e$5;
		}
		for (; x$1 <= j$1;) {
			const e$5 = d$3[x$1++];
			null !== e$5 && M(e$5);
		}
		return this.ut = a$2, m(s$4, v$2), T;
	}
});

//#endregion
//#region src/core/WebAuthnManager/LitComponents/common/formatters.ts
function formatArgs(args) {
	if (!args) return "";
	if (typeof args === "string") return args;
	try {
		return JSON.stringify(args, (_k, v$2) => typeof v$2 === "bigint" ? v$2.toString() : v$2, 2);
	} catch (e$5) {
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
	} catch (e$5) {
		return deposit;
	}
}
function formatGas(gas) {
	if (!gas) return "";
	try {
		const gasValue = BigInt(gas);
		const tgas = gasValue / BigInt("1000000000000");
		return `${tgas} Tgas`;
	} catch (e$5) {
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
	async handleCopyClick(e$5, node) {
		e$5.stopPropagation();
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
	onSummaryClick = (e$5) => {
		e$5.preventDefault();
		e$5.stopPropagation();
		const summary = e$5.currentTarget;
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
		} catch (e$5) {
			console.warn("[TxTree] Failed to register --border-angle:", e$5);
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
                @click=${(e$5) => this.handleCopyClick(e$5, node)}
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
              @click=${(e$5) => this.handleCopyClick(e$5, node)}
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
            ${c(nodeChildren, (c$5) => c$5.id, (c$5) => this.renderAnyNode(c$5, depth + 1))}
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
                ${c(Array.isArray(this.node.children) ? this.node.children : [], (child) => child.id, (child) => this.renderAnyNode(child, depth + 1))}
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
//#region src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/button-with-tooltip-themes.ts
const EMBEDDED_TX_BUTTON_THEMES = {
	dark: {},
	light: {}
};

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
//#region src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/tags.ts
const BUTTON_WITH_TOOLTIP_ID = "button-with-tooltip";
const SELECTORS = {
	EMBEDDED_CONFIRM_CONTAINER: `[data-embedded-tx-button-root]`,
	EMBEDDED_BTN: `[data-embedded-btn]`,
	TOOLTIP_CONTENT: `[data-tooltip-content]`,
	LOADING: `[data-loading]`,
	SPINNER: `[data-spinner]`
};
var ElementSelectors = class {
	root;
	constructor(root) {
		this.root = root;
	}
	getEmbeddedConfirmContainer() {
		return this.root?.querySelector(SELECTORS.EMBEDDED_CONFIRM_CONTAINER) || null;
	}
	getEmbeddedBtn() {
		return this.root?.querySelector(SELECTORS.EMBEDDED_BTN) || null;
	}
	getTooltipContent() {
		return this.root?.querySelector(SELECTORS.TOOLTIP_CONTENT) || null;
	}
	getLoading() {
		return this.root?.querySelector(SELECTORS.LOADING) || null;
	}
	getSpinner() {
		return this.root?.querySelector(SELECTORS.SPINNER) || null;
	}
	static getEmbeddedConfirmContainer(root) {
		return root?.querySelector(SELECTORS.EMBEDDED_CONFIRM_CONTAINER) || null;
	}
	static getEmbeddedBtn(root) {
		return root?.querySelector(SELECTORS.EMBEDDED_BTN) || null;
	}
	static getTooltipContent(root) {
		return root?.querySelector(SELECTORS.TOOLTIP_CONTENT) || null;
	}
	static getLoading(root) {
		return root?.querySelector(SELECTORS.LOADING) || null;
	}
	static getSpinner(root) {
		return root?.querySelector(SELECTORS.SPINNER) || null;
	}
};

//#endregion
//#region src/utils/base64.ts
/**
* Encodes an ArrayBuffer to standard base64 format for NEAR RPC compatibility.
* Uses standard base64 characters (+, /, =) rather than base64url encoding.
* Converts binary data to base64 string using browser's btoa() function.
*
* @param value - ArrayBuffer containing the binary data to encode
* @returns Standard base64-encoded string with padding
*/
const base64Encode = (value) => {
	return btoa(String.fromCharCode(...Array.from(new Uint8Array(value))));
};
/**
* Encodes an ArrayBuffer into a base64url string.
* Converts binary data to base64 then replaces standard base64 characters with URL-safe ones:
* + -> -
* / -> _
* Removes padding = characters
*
* Used for WebAuthn API compatibility in browser environments.
* Equivalent to Buffer.from(value).toString('base64url') in Node.js.
*
* @param value - The ArrayBuffer to encode
* @returns A base64url-encoded string without padding
*/
const base64UrlEncode = (value) => {
	return base64Encode(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
};

//#endregion
//#region src/core/WebAuthnManager/LitComponents/common/tx-digest.ts
function alphabetizeStringify(input) {
	const normalizeValue = (value) => {
		if (Array.isArray(value)) return value.map(normalizeValue);
		if (value !== null && typeof value === "object") {
			const obj = value;
			const sortedKeys = Object.keys(obj).sort();
			const result = {};
			for (const key of sortedKeys) result[key] = normalizeValue(obj[key]);
			return result;
		}
		return value;
	};
	return JSON.stringify(normalizeValue(input));
}
async function sha256Base64UrlUtf8(input) {
	const enc = new TextEncoder();
	const data = enc.encode(input);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return base64UrlEncode(digest);
}
async function computeUiIntentDigestFromTxs(txInputs) {
	const json = alphabetizeStringify(txInputs);
	return sha256Base64UrlUtf8(json);
}
function orderActionForDigest(a$2) {
	switch (a$2.action_type) {
		case "FunctionCall": return {
			action_type: a$2.action_type,
			args: a$2.args,
			deposit: a$2.deposit,
			gas: a$2.gas,
			method_name: a$2.method_name
		};
		case "Transfer": return {
			action_type: a$2.action_type,
			deposit: a$2.deposit
		};
		case "Stake": return {
			action_type: a$2.action_type,
			stake: a$2.stake,
			public_key: a$2.public_key
		};
		case "AddKey": return {
			action_type: a$2.action_type,
			public_key: a$2.public_key,
			access_key: a$2.access_key
		};
		case "DeleteKey": return {
			action_type: a$2.action_type,
			public_key: a$2.public_key
		};
		case "DeleteAccount": return {
			action_type: a$2.action_type,
			beneficiary_id: a$2.beneficiary_id
		};
		case "DeployContract": return {
			action_type: a$2.action_type,
			code: a$2.code
		};
		case "CreateAccount":
		default: return { action_type: a$2.action_type };
	}
}

//#endregion
//#region src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/ButtonWithTooltip.ts
/**
* Lit-based embedded transaction confirmation element for iframe usage.
* Implements the clip-path approach with tooltip measurement and postMessage communication.
*/
var EmbeddedTxButton = class extends LitElementWithProps {
	static properties = {
		nearAccountId: { type: String },
		txSigningRequests: { type: Array },
		color: { type: String },
		loadingTouchIdPrompt: { type: Boolean },
		tooltip: { type: Object },
		size: { type: Object },
		buttonSizing: { type: Object },
		styles: {
			type: Object,
			attribute: false
		},
		embeddedButtonStyles: {
			type: Object,
			attribute: false
		},
		TxTreeTheme: { type: String },
		tooltipVisible: { state: true },
		hideTimeout: { state: true },
		activationMode: { type: String }
	};
	nearAccountId = "";
	txSigningRequests = [];
	color = "#667eea";
	loadingTouchIdPrompt = false;
	tooltip = {
		width: "360px",
		height: "auto",
		position: "top-center",
		offset: "4px"
	};
	buttonSizing = {};
	TxTreeTheme = "dark";
	styles;
	embeddedButtonStyles;
	activationMode = "tap";
	tooltipVisible = false;
	hideTimeout = null;
	initialGeometrySent = false;
	initialGeometryRetryCount = 0;
	isHiding = false;
	measureTimeout = null;
	treeRaf1 = null;
	treeRaf2 = null;
	_ensureTreeDefinition = TxTree_default;
	tooltipResizeObserver;
	buttonResizeObserver;
	lastSentGeometryKey = null;
	buttonHovering = false;
	tooltipHovering = false;
	pressTimer = null;
	pressFired = false;
	pressStartX = 0;
	pressStartY = 0;
	suppressClickUntil = 0;
	isCoarsePointer = false;
	mqlCoarse;
	selectors;
	constructor() {
		super();
		this.selectors = new ElementSelectors();
	}
	static styles = i`
    /* Data attribute selectors correspond to HTML data attributes for type-safe element selection */

    :host {
      display: var(--w3a-embedded__host__display, block);
      font-family: var(--w3a-embedded__host__font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      background: var(--w3a-embedded__host__background, transparent);
      color: var(--w3a-embedded__host__color, #333);
      line-height: var(--w3a-embedded__host__line-height, 1.6);
      margin: var(--w3a-embedded__host__margin, 0);
      padding: var(--w3a-embedded__host__padding, 0);
      position: var(--w3a-embedded__host__position, relative);
      width: var(--w3a-embedded__host__width, 100%);
      height: var(--w3a-embedded__host__height, 100%);
    }

    [data-embedded-tx-button-root] {
      position: var(--w3a-embedded__confirm-container__position, relative);
      display: var(--w3a-embedded__confirm-container__display, inline-block);
      z-index: var(--w3a-embedded__confirm-container__z-index, 1001);
      box-sizing: var(--w3a-embedded__confirm-container__box-sizing, border-box);
      overflow: var(--w3a-embedded__confirm-container__overflow, visible);
      pointer-events: var(--w3a-embedded__confirm-container__pointer-events, auto);
      position: var(--w3a-embedded__confirm-container__position-absolute, absolute);
      top: var(--w3a-embedded__confirm-container__top, 50%);
      left: var(--w3a-embedded__confirm-container__left, 50%);
      transform: var(--w3a-embedded__confirm-container__transform, translate(-50%, -50%));
    }

    [data-embedded-btn] {
      /* Transparent interactive shim; visuals are rendered by the host */
      background: transparent !important;
      color: transparent !important;
      border: none !important;
      border-radius: 0;
      padding: 0;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      width: var(--w3a-embedded__btn__width, var(--btn-width, 200px));
      height: var(--w3a-embedded__btn__height, var(--btn-height, 48px));
      box-sizing: border-box;
      margin: 0;
      outline: none;
      text-decoration: none;
      font-family: inherit;
      opacity: 1;
      will-change: auto;
      animation: none;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
      touch-action: manipulation;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    [data-embedded-btn]:hover { background: transparent !important; color: transparent !important; }

    [data-embedded-btn]:active { background: transparent !important; color: transparent !important; }

    [data-embedded-btn]:disabled {
      opacity: var(--w3a-embedded__btn-disabled__opacity, 0.6);
      cursor: var(--w3a-embedded__btn-disabled__cursor, not-allowed);
    }

    [data-loading] { display: none !important; }

    [data-loading][data-visible="true"] { display: none !important; }

    [data-spinner] {
      width: var(--w3a-embedded__spinner__width, 16px);
      height: var(--w3a-embedded__spinner__height, 16px);
      border: var(--w3a-embedded__spinner__border, 2px solid rgba(255, 255, 255, 0.3));
      border-top: var(--w3a-embedded__spinner__border-top, 2px solid white);
      border-radius: var(--w3a-embedded__spinner__border-radius, 50%);
      animation: var(--w3a-embedded__spinner__animation, spin 1s linear infinite);
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    /* Use data attributes instead of classes for guaranteed sync */
    [data-tooltip-content] {
      position: var(--w3a-embedded__tooltip-content__position, absolute);
      box-sizing: var(--w3a-embedded__tooltip-content__box-sizing, border-box);
      z-index: var(--w3a-embedded__tooltip-content__z-index, 1000);
      opacity: var(--w3a-embedded__tooltip-content__opacity, 0);
      visibility: var(--w3a-embedded__tooltip-content__visibility, hidden);
      pointer-events: none; /* prevent overlay from stealing hover before interactive */
      height: var(--tooltip-height, auto);
      max-height: var(--tooltip-max-height, none);
      overflow-y: var(--w3a-embedded__tooltip-content__overflow-y, auto);
      transition: var(--w3a-embedded__tooltip-content__transition, all 0.0s ease);
      /* Allow external control via CSS vars; default to no cap so tooltipPosition.width fully applies */
      min-width: var(--w3a-embedded__tooltip-content__min-width, 0px);
      max-width: var(--w3a-embedded__tooltip-content__max-width, none);
      width: var(--w3a-embedded__tooltip-content__width, var(--tooltip-width, 280px));
      /* Directional padding vars forwarded to tree host */
      --w3a-tree__host__padding-top: var(--tooltip-box-padding, 0px);
      --w3a-tree__host__padding-bottom: var(--tooltip-box-padding, 0px);
      --w3a-tree__host__padding-left: 0px;
      --w3a-tree__host__padding-right: 0px;
    }

    /* Optional mobile header within tooltip for coarse pointers */
    [data-tooltip-header] {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 12px;
      position: sticky;
      top: 0;
      background: inherit;
      z-index: 1;
      border-bottom: 1px solid transparent;
    }
    [data-tooltip-title] {
      font-size: 0.9rem;
      font-weight: 600;
      color: inherit;
    }
    [data-close-btn] {
      appearance: none;
      border: 1px solid transparent;
      background: transparent;
      color: inherit;
      font: inherit;
      line-height: 1;
      padding: 6px 8px;
      border-radius: 8px;
      cursor: pointer;
    }
    [data-close-btn]:hover { background: rgba(255,255,255,0.08); }

    /* Top positions: aligned with button corners */
    [data-tooltip-content][data-position="top-left"] {
      bottom: 100%;
      left: 0; /* Aligns tooltip's left edge with button's left edge */
      margin-bottom: calc(var(--tooltip-offset, 4px) - var(--tooltip-box-padding, 0px));
      /* Add shadow room on the outer side only */
      --w3a-tree__host__padding-right: var(--tooltip-box-padding, 0px);
      --w3a-tree__host__padding-left: 0px;
    }

    [data-tooltip-content][data-position="top-center"] {
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-bottom: calc(var(--tooltip-offset, 4px) - var(--tooltip-box-padding, 0px));
      --w3a-tree__host__padding-left: var(--tooltip-box-padding, 0px);
      --w3a-tree__host__padding-right: var(--tooltip-box-padding, 0px);
    }

    [data-tooltip-content][data-position="top-right"] {
      bottom: 100%;
      right: 0; /* Aligns tooltip's right edge with button's right edge */
      margin-bottom: calc(var(--tooltip-offset, 4px) - var(--tooltip-box-padding, 0px));
      --w3a-tree__host__padding-left: var(--tooltip-box-padding, 0px);
      --w3a-tree__host__padding-right: 0px;
    }

    /* Side positions */
    [data-tooltip-content][data-position="left"] {
      right: 100%;
      top: 50%;
      transform: translateY(-50%);
      margin-right: calc(var(--tooltip-offset, 4px) - var(--tooltip-box-padding, 0px));
      --w3a-tree__host__padding-left: var(--tooltip-box-padding, 0px);
      --w3a-tree__host__padding-right: 0px;
    }

    [data-tooltip-content][data-position="right"] {
      left: 100%;
      top: 50%;
      transform: translateY(-50%);
      margin-left: calc(var(--tooltip-offset, 4px) - var(--tooltip-box-padding, 0px));
      --w3a-tree__host__padding-right: var(--tooltip-box-padding, 0px);
      --w3a-tree__host__padding-left: 0px;
    }

    /* Bottom positions: aligned with button corners */
    [data-tooltip-content][data-position="bottom-left"] {
      top: 100%;
      left: 0; /* Aligns tooltip's left edge with button's left edge */
      margin-top: calc(var(--tooltip-offset, 4px) - var(--tooltip-box-padding, 0px));
      --w3a-tree__host__padding-right: var(--tooltip-box-padding, 0px);
      --w3a-tree__host__padding-left: 0px;
    }

    [data-tooltip-content][data-position="bottom-center"] {
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-top: calc(var(--tooltip-offset, 4px) - var(--tooltip-box-padding, 0px));
      --w3a-tree__host__padding-left: var(--tooltip-box-padding, 0px);
      --w3a-tree__host__padding-right: var(--tooltip-box-padding, 0px);
    }

    [data-tooltip-content][data-position="bottom-right"] {
      top: 100%;
      right: 0; /* Aligns tooltip's right edge with button's right edge */
      margin-top: calc(var(--tooltip-offset, 4px) - var(--tooltip-box-padding, 0px));
      --w3a-tree__host__padding-left: var(--tooltip-box-padding, 0px);
      --w3a-tree__host__padding-right: 0px;
    }

    [data-tooltip-content][data-visible="true"] {
      opacity: var(--w3a-embedded__tooltip-content-visible__opacity, 1);
      visibility: var(--w3a-embedded__tooltip-content-visible__visibility, visible);
      pointer-events: auto; /* interactive only when visible */
    }

    [data-tooltip-content][data-hiding="true"] {
      transition-delay: var(--w3a-embedded__tooltip-content-hiding__transition-delay, 150ms);
    }

    /* Mobile bottom-sheet layout when coarse pointer detected */
    [data-tooltip-content][data-mobile-sheet="true"] {
      position: fixed;
      left: 50%;
      transform: translateX(-50%);
      right: auto;
      top: auto;
      bottom: max(8px, env(safe-area-inset-bottom));
      margin: 0;
      width: min(640px, calc(100vw - 16px));
      max-height: min(70vh, 560px);
      height: auto;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.35);
      /* Increase tap targets */
      --w3a-tree__label__font-size: 0.95rem;
      --w3a-tree__chevron__width: 14px;
      --w3a-tree__chevron__height: 14px;
      --w3a-tree__summary-row__padding: 6px 8px;
      --w3a-tree__file-content__font-size: 0.85rem;
      --w3a-tree__file-content__max-height: 40vh;
    }
  `;
	connectedCallback() {
		super.connectedCallback();
		this.selectors = new ElementSelectors(this.shadowRoot);
		this.updateTxTreeTheme();
		this.setupCSSVariables();
		this.applyEmbeddedButtonStyles();
		try {
			this.isCoarsePointer = window.matchMedia("(pointer: coarse), (hover: none)").matches;
			this.mqlCoarse = window.matchMedia("(pointer: coarse), (hover: none)");
			this.mqlCoarse.addEventListener?.("change", (e$5) => {
				this.isCoarsePointer = e$5.matches;
				this.requestUpdate();
			});
			if (this.isCoarsePointer) this.activationMode = "press";
		} catch {}
		window.addEventListener("keydown", this.handleKeyDown, { passive: true });
	}
	firstUpdated() {
		const tooltip = this.selectors.getTooltipContent();
		if (tooltip && "ResizeObserver" in window) {
			this.tooltipResizeObserver = new ResizeObserver(() => {
				if (this.tooltipVisible && !this.isHiding) this.measureTooltip();
			});
			this.tooltipResizeObserver.observe(tooltip);
		}
		const button = this.selectors.getEmbeddedBtn();
		if (button && "ResizeObserver" in window) {
			this.buttonResizeObserver = new ResizeObserver(() => {
				if (!this.isHiding) this.measureTooltip();
			});
			this.buttonResizeObserver.observe(button);
		}
	}
	updated(changedProperties) {
		super.updated(changedProperties);
		if (changedProperties.has("buttonSizing") || changedProperties.has("color")) this.setupCSSVariables();
		if (changedProperties.has("TxTreeTheme")) {
			this.updateTxTreeTheme();
			this.applyEmbeddedButtonStyles();
		}
		if (changedProperties.has("nearAccountId") || changedProperties.has("txSigningRequests")) {
			if (this.tooltipVisible) requestAnimationFrame(() => {
				this.measureTooltip();
			});
		}
	}
	disconnectedCallback() {
		super.disconnectedCallback();
		try {
			this.tooltipResizeObserver?.disconnect();
		} catch {}
		try {
			this.buttonResizeObserver?.disconnect();
		} catch {}
		try {
			window.removeEventListener("keydown", this.handleKeyDown);
		} catch {}
		if (this.pressTimer) {
			try {
				clearTimeout(this.pressTimer);
			} catch {}
			this.pressTimer = null;
		}
	}
	setupCSSVariables() {
		const buttonWidth = this.buttonSizing?.width || "200px";
		const buttonHeight = this.buttonSizing?.height || "48px";
		this.style.setProperty("--btn-width", typeof buttonWidth === "number" ? `${buttonWidth}px` : String(buttonWidth));
		this.style.setProperty("--btn-height", typeof buttonHeight === "number" ? `${buttonHeight}px` : String(buttonHeight));
		this.style.setProperty("--tooltip-width", this.tooltip.width);
		this.style.setProperty("--tooltip-height", this.tooltip.height);
		this.style.setProperty("--tooltip-offset", this.tooltip.offset);
		const boxPadding = this.tooltip.boxPadding || "0px";
		this.style.setProperty("--tooltip-box-padding", String(boxPadding));
	}
	updateTxTreeTheme() {
		const selectedTheme = TX_TREE_THEMES[this.TxTreeTheme] || TX_TREE_THEMES.dark;
		this.styles = { ...selectedTheme };
		const selectedButtonTheme = EMBEDDED_TX_BUTTON_THEMES[this.TxTreeTheme] || EMBEDDED_TX_BUTTON_THEMES.dark;
		this.embeddedButtonStyles = { ...selectedButtonTheme };
	}
	applyEmbeddedButtonStyles() {
		if (!this.embeddedButtonStyles) return;
		this.applyStyles(this.embeddedButtonStyles);
	}
	measureTooltip() {
		if (this.isHiding) return;
		const tooltipElement = this.selectors.getTooltipContent();
		const buttonElement = this.selectors.getEmbeddedBtn();
		if (!tooltipElement || !buttonElement) return;
		const tooltipRect = tooltipElement.getBoundingClientRect();
		const buttonRect = buttonElement.getBoundingClientRect();
		const gap = this.parsePixelValue(this.tooltip.offset);
		const geometry = this.buildGeometry(buttonRect, tooltipRect, gap, this.tooltipVisible);
		requestAnimationFrame(() => {
			this.postTooltipStateIfChanged(geometry);
		});
	}
	measureTooltipAndUpdateParentSync() {
		if (this.isHiding) return;
		const tooltipElement = this.selectors.getTooltipContent();
		const buttonElement = this.selectors.getEmbeddedBtn();
		if (!tooltipElement || !buttonElement) return;
		const tooltipRect = tooltipElement.getBoundingClientRect();
		const buttonRect = buttonElement.getBoundingClientRect();
		const gap = this.parsePixelValue(this.tooltip.offset);
		const geometry = this.buildGeometry(buttonRect, tooltipRect, gap, this.tooltipVisible);
		this.postTooltipStateIfChanged(geometry, true);
	}
	sendTooltipState(visible) {
		const tooltipElement = this.selectors.getTooltipContent();
		const buttonElement = this.selectors.getEmbeddedBtn();
		if (!tooltipElement || !buttonElement) return;
		const tooltipRect = tooltipElement.getBoundingClientRect();
		const buttonRect = buttonElement.getBoundingClientRect();
		const gap = this.parsePixelValue(this.tooltip.offset);
		const geometry = this.buildGeometry(buttonRect, tooltipRect, gap, visible);
		this.postTooltipStateIfChanged(geometry, true);
	}
	buildGeometry(buttonRect, tooltipRect, gap, visible) {
		const floor = (n$4) => Math.floor(n$4);
		const ceil = (n$4) => Math.ceil(n$4);
		return {
			button: {
				x: floor(buttonRect.left),
				y: floor(buttonRect.top),
				width: ceil(buttonRect.width),
				height: ceil(buttonRect.height),
				borderRadius: 8
			},
			tooltip: {
				x: floor(tooltipRect.left),
				y: floor(tooltipRect.top),
				width: ceil(tooltipRect.width),
				height: ceil(tooltipRect.height),
				borderRadius: 24
			},
			position: this.tooltip.position,
			gap,
			visible
		};
	}
	geometryKey(g$1) {
		return [
			g$1.button.x,
			g$1.button.y,
			g$1.button.width,
			g$1.button.height,
			g$1.tooltip.x,
			g$1.tooltip.y,
			g$1.tooltip.width,
			g$1.tooltip.height,
			g$1.position,
			g$1.gap,
			g$1.visible
		].join("|");
	}
	postTooltipStateIfChanged(geometry, sync = false) {
		const key = this.geometryKey(geometry);
		if (key === this.lastSentGeometryKey) return;
		this.lastSentGeometryKey = key;
		const target = this.getTargetOrigin();
		if (window.parent) window.parent.postMessage({
			type: "TOOLTIP_STATE",
			payload: geometry
		}, target);
	}
	getTargetOrigin() {
		const w$1 = window;
		return w$1.__ETX_PARENT_ORIGIN || "*";
	}
	/**
	* Send initial geometry data to parent for clip-path setup
	*/
	sendInitialGeometry() {
		const tooltipElement = this.selectors.getTooltipContent();
		const buttonElement = this.selectors.getEmbeddedBtn();
		if (!tooltipElement || !buttonElement) {
			this.initialGeometryRetryCount++;
			if (this.initialGeometryRetryCount > 10) {
				console.error("[EmbeddedTxButton] Failed to find elements after 10 retries, giving up");
				return;
			}
			console.error(`[EmbeddedTxButton] Missing elements for initial geometry, retry ${this.initialGeometryRetryCount}/10 in 100ms`);
			setTimeout(() => {
				if (!this.initialGeometrySent) this.sendInitialGeometry();
			}, 100);
			return;
		}
		const expectedHeight = this.parsePixelValue(this.buttonSizing?.height || "48px");
		const expectedWidth = this.parsePixelValue(this.buttonSizing?.width || "200px");
		buttonElement.offsetHeight;
		const tooltipRect = tooltipElement.getBoundingClientRect();
		const buttonRect = buttonElement.getBoundingClientRect();
		const gap = this.parsePixelValue(this.tooltip.offset);
		const buttonHeight = Math.abs(buttonRect.height - expectedHeight) < 5 ? buttonRect.height : expectedHeight;
		const buttonWidth = Math.abs(buttonRect.width - expectedWidth) < 5 ? buttonRect.width : expectedWidth;
		const buttonX = buttonRect.left;
		const buttonY = buttonRect.top;
		const tooltipX = tooltipRect.left;
		const tooltipY = tooltipRect.top;
		const geometry = {
			button: {
				x: buttonX,
				y: buttonY,
				width: buttonWidth,
				height: buttonHeight,
				borderRadius: 8
			},
			tooltip: {
				x: tooltipX,
				y: tooltipY,
				width: tooltipRect.width,
				height: tooltipRect.height,
				borderRadius: 24
			},
			position: this.tooltip.position,
			gap,
			visible: false
		};
		requestAnimationFrame(() => {
			if (window.parent) {
				window.parent.postMessage({
					type: "HS5_GEOMETRY_RESULT",
					payload: geometry
				}, this.getTargetOrigin());
				this.initialGeometrySent = true;
			}
		});
	}
	parsePixelValue(value) {
		if (typeof value === "number") return value;
		if (typeof value === "string") {
			if (value === "auto") throw new Error("Cannot parse \"auto\" value for pixel calculations. Please provide a specific pixel value.");
			const match = value.match(/^(\d+(?:\.\d+)?)px$/);
			if (match) return parseFloat(match[1]);
			throw new Error(`Invalid pixel value: "${value}". Expected format: "123px" or numeric value.`);
		}
		return 0;
	}
	async showTooltip() {
		const tooltipElement = ElementSelectors.getTooltipContent(this.shadowRoot);
		if (!tooltipElement || this.tooltipVisible) return;
		this.cancelHide();
		this.isHiding = false;
		this.tooltipVisible = true;
		try {
			tooltipElement.style.setProperty("--tooltip-height", "auto");
		} catch {}
		tooltipElement.style.height = "auto";
		tooltipElement.classList.add("show");
		tooltipElement.classList.remove("hiding");
		tooltipElement.setAttribute("aria-hidden", "false");
		if (this.hideTimeout) {
			clearTimeout(this.hideTimeout);
			this.hideTimeout = null;
		}
		try {
			if (this.isCoarsePointer) {
				const closeBtn = tooltipElement.querySelector("[data-close-btn]");
				closeBtn?.focus?.();
			}
		} catch {}
		await this.updateComplete;
		await new Promise(requestAnimationFrame);
		if (!this.tooltipVisible || this.isHiding) return;
		this.measureTooltip();
	}
	hideTooltip() {
		if (!this.tooltipVisible) return;
		const tooltipElement = this.selectors.getTooltipContent();
		if (!tooltipElement) return;
		if (this.buttonHovering || this.tooltipHovering) return;
		this.isHiding = true;
		if (this.measureTimeout) {
			clearTimeout(this.measureTimeout);
			this.measureTimeout = null;
		}
		if (this.treeRaf1) {
			cancelAnimationFrame(this.treeRaf1);
			this.treeRaf1 = null;
		}
		if (this.treeRaf2) {
			cancelAnimationFrame(this.treeRaf2);
			this.treeRaf2 = null;
		}
		tooltipElement.classList.add("hiding");
		this.hideTimeout = window.setTimeout(() => {
			if (this.buttonHovering || this.tooltipHovering) {
				this.isHiding = false;
				this.hideTimeout = null;
				return;
			}
			this.tooltipVisible = false;
			tooltipElement.classList.remove("show", "hiding");
			tooltipElement.setAttribute("aria-hidden", "true");
			try {
				tooltipElement.style.setProperty("--tooltip-height", this.tooltip.height);
			} catch {}
			tooltipElement.style.height = typeof this.tooltip.height === "string" ? this.tooltip.height : `${this.tooltip.height}`;
			this.hideTimeout = null;
			this.sendTooltipState(false);
			this.isHiding = false;
		}, 100);
	}
	async handleTreeToggled() {
		if (this.isHiding) return;
		this.requestUpdate();
		await this.updateComplete;
		await new Promise(requestAnimationFrame);
		this.measureTooltipAndUpdateParentSync();
	}
	cancelHide() {
		if (this.hideTimeout) {
			clearTimeout(this.hideTimeout);
			this.hideTimeout = null;
			const tooltipElement = this.selectors.getTooltipContent();
			if (tooltipElement) tooltipElement.classList.remove("hiding");
		}
		this.isHiding = false;
	}
	updateProperties(props) {
		Object.assign(this, props);
		if (props.buttonSizing) this.setupCSSVariables();
		if (props.theme) this.updateTxTreeTheme();
		this.requestUpdate();
		if (props.txSigningRequests && this.tooltipVisible) requestAnimationFrame(() => {
			this.measureTooltip();
		});
	}
	updateButtonStyles(buttonSizing, tooltipPosition, embeddedButtonTheme, theme, activationMode) {
		this.buttonSizing = buttonSizing || {};
		if (tooltipPosition) this.tooltip = tooltipPosition;
		if (theme && theme !== this.TxTreeTheme) {
			this.TxTreeTheme = theme;
			this.updateTxTreeTheme();
		}
		if (activationMode) this.activationMode = activationMode;
		this.setupCSSVariables();
		this.requestUpdate();
	}
	handleConfirm() {
		if (window.parent) window.parent.postMessage({ type: "CONFIRM" }, this.getTargetOrigin());
	}
	handleClick(ev) {
		if (this.isCoarsePointer) if (this.activationMode === "press") {
			if (Date.now() < this.suppressClickUntil) {
				ev.preventDefault();
				ev.stopPropagation();
				return;
			}
			this.handleConfirm();
			return;
		} else {
			if (!this.tooltipVisible) {
				ev.preventDefault();
				ev.stopPropagation();
				this.showTooltip();
				return;
			}
			this.handleConfirm();
			return;
		}
		this.handleConfirm();
	}
	handlePointerDown = (ev) => {
		if (!this.isCoarsePointer || this.activationMode !== "press") return;
		if (ev.pointerType !== "touch") return;
		try {
			ev.target?.setPointerCapture?.(ev.pointerId);
		} catch {}
		this.pressFired = false;
		this.pressStartX = ev.clientX;
		this.pressStartY = ev.clientY;
		if (this.pressTimer) window.clearTimeout(this.pressTimer);
		this.pressTimer = window.setTimeout(() => {
			this.pressFired = true;
			this.suppressClickUntil = Date.now() + 600;
			this.showTooltip();
		}, 350);
	};
	handlePointerMove = (ev) => {
		if (!this.isCoarsePointer || this.activationMode !== "press") return;
		if (this.pressTimer == null) return;
		const dx = Math.abs(ev.clientX - this.pressStartX);
		const dy = Math.abs(ev.clientY - this.pressStartY);
		if (dx > 10 || dy > 10) {
			window.clearTimeout(this.pressTimer);
			this.pressTimer = null;
		}
	};
	handlePointerUp = (_ev) => {
		if (!this.isCoarsePointer || this.activationMode !== "press") return;
		if (this.pressTimer) {
			window.clearTimeout(this.pressTimer);
			this.pressTimer = null;
		}
	};
	handlePointerCancel = (_ev) => {
		if (this.pressTimer) {
			window.clearTimeout(this.pressTimer);
			this.pressTimer = null;
		}
	};
	handlePointerEnter() {
		this.buttonHovering = true;
		if (window.parent) window.parent.postMessage({
			type: "BUTTON_HOVER",
			payload: { hovering: true }
		}, this.getTargetOrigin());
		this.showTooltip();
	}
	handlePointerLeave() {
		this.buttonHovering = false;
		if (window.parent) window.parent.postMessage({
			type: "BUTTON_HOVER",
			payload: { hovering: false }
		}, this.getTargetOrigin());
		if (!this.tooltipHovering) this.hideTooltip();
	}
	handleFocus() {
		if (window.parent) window.parent.postMessage({
			type: "BUTTON_FOCUS",
			payload: { focused: true }
		}, this.getTargetOrigin());
		this.handlePointerEnter();
	}
	handleBlur() {
		if (window.parent) window.parent.postMessage({
			type: "BUTTON_FOCUS",
			payload: { focused: false }
		}, this.getTargetOrigin());
		this.handlePointerLeave();
	}
	handleTooltipEnter() {
		this.tooltipHovering = true;
		this.cancelHide();
	}
	handleTooltipLeave() {
		this.tooltipHovering = false;
		if (!this.buttonHovering) this.hideTooltip();
	}
	handleKeyDown = (ev) => {
		if (ev.key === "Escape" && this.tooltipVisible) this.hideTooltip();
	};
	async computeUiIntentDigest() {
		const uiTxs = this.txSigningRequests || [];
		const txs = uiTxs.map((tx) => {
			const rawActions = tx?.actions || [];
			const wasmActions = rawActions.map(((a$2) => isActionArgsWasm(a$2) ? a$2 : toActionArgsWasm(a$2)));
			const orderedActions = wasmActions.map(orderActionForDigest);
			return {
				receiverId: tx?.receiverId,
				actions: orderedActions
			};
		});
		return computeUiIntentDigestFromTxs(txs);
	}
	render() {
		const tree = buildDisplayTreeFromTxPayloads(this.txSigningRequests, this.styles);
		return x`
      <!--
        Data attributes correspond to CSS selectors for type-safe element selection.
        Each data attribute maps to a CSS selector in the static styles property.
        This ensures perfect synchronization between CSS and JavaScript selectors.
      -->
      <!-- Container element - corresponds to [data-embedded-tx-button-root] CSS selector -->
      <div data-embedded-tx-button-root>
        <!-- Button element - corresponds to [data-embedded-btn] CSS selector -->
        <button
          data-embedded-btn
          ?disabled=${this.loadingTouchIdPrompt}
          @click=${this.handleClick}
          @pointerdown=${this.handlePointerDown}
          @pointermove=${this.handlePointerMove}
          @pointerup=${this.handlePointerUp}
          @pointercancel=${this.handlePointerCancel}
          @pointerenter=${this.handlePointerEnter}
          @pointerleave=${this.handlePointerLeave}
          @focus=${this.handleFocus}
          @blur=${this.handleBlur}
          aria-describedby="tooltipContent"
          aria-haspopup=${this.isCoarsePointer ? "dialog" : "true"}
          aria-expanded=${this.tooltipVisible}
          tabindex="0"
        >
          <!-- Invisible shim: visuals are rendered by host; no inner content needed -->
        </button>

        <!-- Tooltip content element - corresponds to [data-tooltip-content] CSS selector -->
        <div
          data-tooltip-content
          data-position=${this.tooltip.position}
          data-visible=${this.tooltipVisible}
          data-hiding=${this.isHiding}
          data-mobile-sheet=${this.isCoarsePointer}
          id="tooltipContent"
          role=${this.isCoarsePointer ? "dialog" : "tooltip"}
          aria-modal=${this.isCoarsePointer ? "true" : "false"}
          aria-hidden="true"
          @pointerenter=${this.handleTooltipEnter}
          @pointerleave=${this.handleTooltipLeave}
        >
          ${this.isCoarsePointer ? x`
            <div data-tooltip-header>
              <span data-tooltip-title>Transaction Details</span>
              <button data-close-btn @click=${() => this.hideTooltip()} aria-label="Close details">✕</button>
            </div>
          ` : ""}
          <tx-tree
            .node=${tree}
            .depth=${0}
            .styles=${this.styles}
            .theme=${this.TxTreeTheme}
            @tree-toggled=${this.handleTreeToggled}
          ></tx-tree>
        </div>
      </div>
    `;
	}
	getComponentPrefix() {
		return "embedded";
	}
	applyStyles(styles) {
		super.applyStyles(styles, this.getComponentPrefix());
	}
};
customElements.define(BUTTON_WITH_TOOLTIP_ID, EmbeddedTxButton);
var ButtonWithTooltip_default = EmbeddedTxButton;

//#endregion
export { EmbeddedTxButton, ButtonWithTooltip_default as default };