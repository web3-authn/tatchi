import {
  Directive,
  PartType,
  directive
} from "./chunk-M4WVYKHF.js";
import {
  noChange
} from "./chunk-NIF6JLPD.js";
import "./chunk-DC5AMYBS.js";

// ../../../node_modules/.pnpm/lit-html@3.3.1/node_modules/lit-html/development/directives/style-map.js
var important = "important";
var importantFlag = " !" + important;
var flagTrim = 0 - importantFlag.length;
var StyleMapDirective = class extends Directive {
  constructor(partInfo) {
    var _a;
    super(partInfo);
    if (partInfo.type !== PartType.ATTRIBUTE || partInfo.name !== "style" || ((_a = partInfo.strings) == null ? void 0 : _a.length) > 2) {
      throw new Error("The `styleMap` directive must be used in the `style` attribute and must be the only part in the attribute.");
    }
  }
  render(styleInfo) {
    return Object.keys(styleInfo).reduce((style, prop) => {
      const value = styleInfo[prop];
      if (value == null) {
        return style;
      }
      prop = prop.includes("-") ? prop : prop.replace(/(?:^(webkit|moz|ms|o)|)(?=[A-Z])/g, "-$&").toLowerCase();
      return style + `${prop}:${value};`;
    }, "");
  }
  update(part, [styleInfo]) {
    const { style } = part.element;
    if (this._previousStyleProperties === void 0) {
      this._previousStyleProperties = new Set(Object.keys(styleInfo));
      return this.render(styleInfo);
    }
    for (const name of this._previousStyleProperties) {
      if (styleInfo[name] == null) {
        this._previousStyleProperties.delete(name);
        if (name.includes("-")) {
          style.removeProperty(name);
        } else {
          style[name] = null;
        }
      }
    }
    for (const name in styleInfo) {
      const value = styleInfo[name];
      if (value != null) {
        this._previousStyleProperties.add(name);
        const isImportant = typeof value === "string" && value.endsWith(importantFlag);
        if (name.includes("-") || isImportant) {
          style.setProperty(name, isImportant ? value.slice(0, flagTrim) : value, isImportant ? important : "");
        } else {
          style[name] = value;
        }
      }
    }
    return noChange;
  }
};
var styleMap = directive(StyleMapDirective);
export {
  styleMap
};
/*! Bundled license information:

lit-html/development/directives/style-map.js:
  (**
   * @license
   * Copyright 2018 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)
*/
//# sourceMappingURL=lit_directives_style-map__js.js.map
