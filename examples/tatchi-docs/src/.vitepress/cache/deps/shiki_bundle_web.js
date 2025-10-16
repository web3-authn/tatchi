import {
  EncodedTokenMetadata,
  FontStyle,
  ShikiError,
  addClassToHast,
  applyColorReplacements,
  createCssVariablesTheme,
  createHighlighterCore,
  createHighlighterCoreSync,
  createJavaScriptRegexEngine,
  createOnigurumaEngine,
  createOnigurumaEngine2,
  createPositionConverter,
  createShikiInternal,
  createShikiInternalSync,
  createSingletonShorthands,
  createWasmOnigEngine,
  createdBundledHighlighter,
  defaultJavaScriptRegexConstructor,
  enableDeprecationWarnings,
  flatTokenVariants,
  getHighlighterCore,
  getShikiInternal,
  getSingletonHighlighterCore,
  getTokenStyleObject,
  guessEmbeddedLanguages,
  isNoneTheme,
  isPlainLang,
  isSpecialLang,
  isSpecialTheme,
  loadWasm,
  makeSingletonHighlighter,
  makeSingletonHighlighterCore,
  normalizeGetter,
  normalizeTheme,
  resolveColorReplacements,
  splitLines,
  splitToken,
  splitTokens,
  stringifyTokenStyle,
  toArray,
  toHtml,
  tokenizeAnsiWithTheme,
  tokenizeWithTheme,
  tokensToHast,
  transformerDecorations,
  warnDeprecated
} from "./chunk-5Y2WVNAC.js";
import "./chunk-B4Q33VKO.js";

// ../../../node_modules/.pnpm/shiki@2.5.0/node_modules/shiki/dist/themes.mjs
var bundledThemesInfo = [
  {
    "id": "andromeeda",
    "displayName": "Andromeeda",
    "type": "dark",
    "import": () => import("./andromeeda-CYI4P2OX.js")
  },
  {
    "id": "aurora-x",
    "displayName": "Aurora X",
    "type": "dark",
    "import": () => import("./aurora-x-SLFJBP7X.js")
  },
  {
    "id": "ayu-dark",
    "displayName": "Ayu Dark",
    "type": "dark",
    "import": () => import("./ayu-dark-XODFAHIN.js")
  },
  {
    "id": "catppuccin-frappe",
    "displayName": "Catppuccin Frappé",
    "type": "dark",
    "import": () => import("./catppuccin-frappe-5P6AYX7O.js")
  },
  {
    "id": "catppuccin-latte",
    "displayName": "Catppuccin Latte",
    "type": "light",
    "import": () => import("./catppuccin-latte-H3BKLCGK.js")
  },
  {
    "id": "catppuccin-macchiato",
    "displayName": "Catppuccin Macchiato",
    "type": "dark",
    "import": () => import("./catppuccin-macchiato-AQEJQYXQ.js")
  },
  {
    "id": "catppuccin-mocha",
    "displayName": "Catppuccin Mocha",
    "type": "dark",
    "import": () => import("./catppuccin-mocha-3I4REZEU.js")
  },
  {
    "id": "dark-plus",
    "displayName": "Dark Plus",
    "type": "dark",
    "import": () => import("./dark-plus-UGLB4Y5F.js")
  },
  {
    "id": "dracula",
    "displayName": "Dracula Theme",
    "type": "dark",
    "import": () => import("./dracula-5VI46GSW.js")
  },
  {
    "id": "dracula-soft",
    "displayName": "Dracula Theme Soft",
    "type": "dark",
    "import": () => import("./dracula-soft-BEFGQ7GI.js")
  },
  {
    "id": "everforest-dark",
    "displayName": "Everforest Dark",
    "type": "dark",
    "import": () => import("./everforest-dark-DMHLKJJ6.js")
  },
  {
    "id": "everforest-light",
    "displayName": "Everforest Light",
    "type": "light",
    "import": () => import("./everforest-light-OOY5K5DF.js")
  },
  {
    "id": "github-dark",
    "displayName": "GitHub Dark",
    "type": "dark",
    "import": () => import("./github-dark-UE44UBNV.js")
  },
  {
    "id": "github-dark-default",
    "displayName": "GitHub Dark Default",
    "type": "dark",
    "import": () => import("./github-dark-default-BSKYSKDH.js")
  },
  {
    "id": "github-dark-dimmed",
    "displayName": "GitHub Dark Dimmed",
    "type": "dark",
    "import": () => import("./github-dark-dimmed-M5IYSKYQ.js")
  },
  {
    "id": "github-dark-high-contrast",
    "displayName": "GitHub Dark High Contrast",
    "type": "dark",
    "import": () => import("./github-dark-high-contrast-XESZQWDV.js")
  },
  {
    "id": "github-light",
    "displayName": "GitHub Light",
    "type": "light",
    "import": () => import("./github-light-SGIFPYAT.js")
  },
  {
    "id": "github-light-default",
    "displayName": "GitHub Light Default",
    "type": "light",
    "import": () => import("./github-light-default-NCS7CS5S.js")
  },
  {
    "id": "github-light-high-contrast",
    "displayName": "GitHub Light High Contrast",
    "type": "light",
    "import": () => import("./github-light-high-contrast-YYUJSF2H.js")
  },
  {
    "id": "houston",
    "displayName": "Houston",
    "type": "dark",
    "import": () => import("./houston-GAJ36273.js")
  },
  {
    "id": "kanagawa-dragon",
    "displayName": "Kanagawa Dragon",
    "type": "dark",
    "import": () => import("./kanagawa-dragon-45EGOYLT.js")
  },
  {
    "id": "kanagawa-lotus",
    "displayName": "Kanagawa Lotus",
    "type": "light",
    "import": () => import("./kanagawa-lotus-O42XW3KJ.js")
  },
  {
    "id": "kanagawa-wave",
    "displayName": "Kanagawa Wave",
    "type": "dark",
    "import": () => import("./kanagawa-wave-63VAQSXS.js")
  },
  {
    "id": "laserwave",
    "displayName": "LaserWave",
    "type": "dark",
    "import": () => import("./laserwave-NHYMF4JH.js")
  },
  {
    "id": "light-plus",
    "displayName": "Light Plus",
    "type": "light",
    "import": () => import("./light-plus-2LO5MTCY.js")
  },
  {
    "id": "material-theme",
    "displayName": "Material Theme",
    "type": "dark",
    "import": () => import("./material-theme-FSHRR6HD.js")
  },
  {
    "id": "material-theme-darker",
    "displayName": "Material Theme Darker",
    "type": "dark",
    "import": () => import("./material-theme-darker-FCXMFOEW.js")
  },
  {
    "id": "material-theme-lighter",
    "displayName": "Material Theme Lighter",
    "type": "light",
    "import": () => import("./material-theme-lighter-EOZRFLF2.js")
  },
  {
    "id": "material-theme-ocean",
    "displayName": "Material Theme Ocean",
    "type": "dark",
    "import": () => import("./material-theme-ocean-7YXW4APU.js")
  },
  {
    "id": "material-theme-palenight",
    "displayName": "Material Theme Palenight",
    "type": "dark",
    "import": () => import("./material-theme-palenight-VQWYP2YN.js")
  },
  {
    "id": "min-dark",
    "displayName": "Min Dark",
    "type": "dark",
    "import": () => import("./min-dark-EBU73OTJ.js")
  },
  {
    "id": "min-light",
    "displayName": "Min Light",
    "type": "light",
    "import": () => import("./min-light-ULKP3SAA.js")
  },
  {
    "id": "monokai",
    "displayName": "Monokai",
    "type": "dark",
    "import": () => import("./monokai-D47P27TZ.js")
  },
  {
    "id": "night-owl",
    "displayName": "Night Owl",
    "type": "dark",
    "import": () => import("./night-owl-KFVT6CK3.js")
  },
  {
    "id": "nord",
    "displayName": "Nord",
    "type": "dark",
    "import": () => import("./nord-JWLWG6JN.js")
  },
  {
    "id": "one-dark-pro",
    "displayName": "One Dark Pro",
    "type": "dark",
    "import": () => import("./one-dark-pro-WKFUBFAU.js")
  },
  {
    "id": "one-light",
    "displayName": "One Light",
    "type": "light",
    "import": () => import("./one-light-UPCCRBXE.js")
  },
  {
    "id": "plastic",
    "displayName": "Plastic",
    "type": "dark",
    "import": () => import("./plastic-WLAH56WC.js")
  },
  {
    "id": "poimandres",
    "displayName": "Poimandres",
    "type": "dark",
    "import": () => import("./poimandres-4ECQBG6O.js")
  },
  {
    "id": "red",
    "displayName": "Red",
    "type": "dark",
    "import": () => import("./red-XLN6FUEX.js")
  },
  {
    "id": "rose-pine",
    "displayName": "Rosé Pine",
    "type": "dark",
    "import": () => import("./rose-pine-FBTPDC27.js")
  },
  {
    "id": "rose-pine-dawn",
    "displayName": "Rosé Pine Dawn",
    "type": "light",
    "import": () => import("./rose-pine-dawn-ETEY6JTA.js")
  },
  {
    "id": "rose-pine-moon",
    "displayName": "Rosé Pine Moon",
    "type": "dark",
    "import": () => import("./rose-pine-moon-6GDKZ35M.js")
  },
  {
    "id": "slack-dark",
    "displayName": "Slack Dark",
    "type": "dark",
    "import": () => import("./slack-dark-ZR7GLTVI.js")
  },
  {
    "id": "slack-ochin",
    "displayName": "Slack Ochin",
    "type": "light",
    "import": () => import("./slack-ochin-27AZQEOO.js")
  },
  {
    "id": "snazzy-light",
    "displayName": "Snazzy Light",
    "type": "light",
    "import": () => import("./snazzy-light-GLHCWEZS.js")
  },
  {
    "id": "solarized-dark",
    "displayName": "Solarized Dark",
    "type": "dark",
    "import": () => import("./solarized-dark-PE3SJF4N.js")
  },
  {
    "id": "solarized-light",
    "displayName": "Solarized Light",
    "type": "light",
    "import": () => import("./solarized-light-N263ZRFM.js")
  },
  {
    "id": "synthwave-84",
    "displayName": "Synthwave '84",
    "type": "dark",
    "import": () => import("./synthwave-84-RDTR43XU.js")
  },
  {
    "id": "tokyo-night",
    "displayName": "Tokyo Night",
    "type": "dark",
    "import": () => import("./tokyo-night-FTQ4RAQG.js")
  },
  {
    "id": "vesper",
    "displayName": "Vesper",
    "type": "dark",
    "import": () => import("./vesper-4TN4AOG2.js")
  },
  {
    "id": "vitesse-black",
    "displayName": "Vitesse Black",
    "type": "dark",
    "import": () => import("./vitesse-black-5QHBUCSS.js")
  },
  {
    "id": "vitesse-dark",
    "displayName": "Vitesse Dark",
    "type": "dark",
    "import": () => import("./vitesse-dark-WLQ4VYQU.js")
  },
  {
    "id": "vitesse-light",
    "displayName": "Vitesse Light",
    "type": "light",
    "import": () => import("./vitesse-light-EQRQOZS5.js")
  }
];
var bundledThemes = Object.fromEntries(bundledThemesInfo.map((i) => [i.id, i.import]));

// ../../../node_modules/.pnpm/shiki@2.5.0/node_modules/shiki/dist/wasm-dynamic-K7LwWlz7.js
var getWasmInlined = async (info) => {
  warnDeprecated('`getWasmInlined` is deprecated. Use `import("shiki/wasm")` instead.');
  return import("./shiki_wasm.js").then((wasm) => wasm.default(info));
};

// ../../../node_modules/.pnpm/shiki@2.5.0/node_modules/shiki/dist/bundle-web.mjs
var bundledLanguagesInfo = [
  {
    "id": "angular-html",
    "name": "Angular HTML",
    "import": () => import("./angular-html-JZV5Q3O4.js")
  },
  {
    "id": "angular-ts",
    "name": "Angular TypeScript",
    "import": () => import("./angular-ts-3275M22X.js")
  },
  {
    "id": "astro",
    "name": "Astro",
    "import": () => import("./astro-VKHC6RXG.js")
  },
  {
    "id": "blade",
    "name": "Blade",
    "import": () => import("./blade-DNX7B3ST.js")
  },
  {
    "id": "c",
    "name": "C",
    "import": () => import("./c-DNVIPXCB.js")
  },
  {
    "id": "coffee",
    "name": "CoffeeScript",
    "aliases": [
      "coffeescript"
    ],
    "import": () => import("./coffee-XVH7FXQ2.js")
  },
  {
    "id": "cpp",
    "name": "C++",
    "aliases": [
      "c++"
    ],
    "import": () => import("./cpp-5D2WZ2HY.js")
  },
  {
    "id": "css",
    "name": "CSS",
    "import": () => import("./css-7KZFLRNS.js")
  },
  {
    "id": "glsl",
    "name": "GLSL",
    "import": () => import("./glsl-PLBTJQTZ.js")
  },
  {
    "id": "graphql",
    "name": "GraphQL",
    "aliases": [
      "gql"
    ],
    "import": () => import("./graphql-GEHD36CR.js")
  },
  {
    "id": "haml",
    "name": "Ruby Haml",
    "import": () => import("./haml-5NW4QOUQ.js")
  },
  {
    "id": "handlebars",
    "name": "Handlebars",
    "aliases": [
      "hbs"
    ],
    "import": () => import("./handlebars-RZYR735W.js")
  },
  {
    "id": "html",
    "name": "HTML",
    "import": () => import("./html-NJXXGDOA.js")
  },
  {
    "id": "html-derivative",
    "name": "HTML (Derivative)",
    "import": () => import("./html-derivative-2UQFA4RM.js")
  },
  {
    "id": "http",
    "name": "HTTP",
    "import": () => import("./http-NGXSHQ3P.js")
  },
  {
    "id": "imba",
    "name": "Imba",
    "import": () => import("./imba-TBH7BGG2.js")
  },
  {
    "id": "java",
    "name": "Java",
    "import": () => import("./java-XIBTAJ6G.js")
  },
  {
    "id": "javascript",
    "name": "JavaScript",
    "aliases": [
      "js"
    ],
    "import": () => import("./javascript-CIL6U7ZK.js")
  },
  {
    "id": "jinja",
    "name": "Jinja",
    "import": () => import("./jinja-DXQ5OC3F.js")
  },
  {
    "id": "jison",
    "name": "Jison",
    "import": () => import("./jison-PLHJCY7U.js")
  },
  {
    "id": "json",
    "name": "JSON",
    "import": () => import("./json-HL3EBPIO.js")
  },
  {
    "id": "json5",
    "name": "JSON5",
    "import": () => import("./json5-7ZCHJTXE.js")
  },
  {
    "id": "jsonc",
    "name": "JSON with Comments",
    "import": () => import("./jsonc-53JP24BO.js")
  },
  {
    "id": "jsonl",
    "name": "JSON Lines",
    "import": () => import("./jsonl-JBISFNC5.js")
  },
  {
    "id": "jsx",
    "name": "JSX",
    "import": () => import("./jsx-IYO5MOTY.js")
  },
  {
    "id": "julia",
    "name": "Julia",
    "aliases": [
      "jl"
    ],
    "import": () => import("./julia-TUPWVFOT.js")
  },
  {
    "id": "less",
    "name": "Less",
    "import": () => import("./less-UWIQBF6E.js")
  },
  {
    "id": "markdown",
    "name": "Markdown",
    "aliases": [
      "md"
    ],
    "import": () => import("./markdown-PIBZBKBI.js")
  },
  {
    "id": "marko",
    "name": "Marko",
    "import": () => import("./marko-PHDGTKKU.js")
  },
  {
    "id": "mdc",
    "name": "MDC",
    "import": () => import("./mdc-HTGGS37V.js")
  },
  {
    "id": "mdx",
    "name": "MDX",
    "import": () => import("./mdx-FLO3MNZ4.js")
  },
  {
    "id": "php",
    "name": "PHP",
    "import": () => import("./php-54UTWELD.js")
  },
  {
    "id": "postcss",
    "name": "PostCSS",
    "import": () => import("./postcss-2YJJJXFH.js")
  },
  {
    "id": "pug",
    "name": "Pug",
    "aliases": [
      "jade"
    ],
    "import": () => import("./pug-QSM2YJPT.js")
  },
  {
    "id": "python",
    "name": "Python",
    "aliases": [
      "py"
    ],
    "import": () => import("./python-63UXMOAF.js")
  },
  {
    "id": "r",
    "name": "R",
    "import": () => import("./r-66PYQ5WB.js")
  },
  {
    "id": "regexp",
    "name": "RegExp",
    "aliases": [
      "regex"
    ],
    "import": () => import("./regexp-NBWKI33Q.js")
  },
  {
    "id": "sass",
    "name": "Sass",
    "import": () => import("./sass-NNIOP3LB.js")
  },
  {
    "id": "scss",
    "name": "SCSS",
    "import": () => import("./scss-RAGTHQEA.js")
  },
  {
    "id": "shellscript",
    "name": "Shell",
    "aliases": [
      "bash",
      "sh",
      "shell",
      "zsh"
    ],
    "import": () => import("./shellscript-NA5IRDDF.js")
  },
  {
    "id": "sql",
    "name": "SQL",
    "import": () => import("./sql-VDK23SVF.js")
  },
  {
    "id": "stylus",
    "name": "Stylus",
    "aliases": [
      "styl"
    ],
    "import": () => import("./stylus-W6KLB6R6.js")
  },
  {
    "id": "svelte",
    "name": "Svelte",
    "import": () => import("./svelte-BZGGCINJ.js")
  },
  {
    "id": "ts-tags",
    "name": "TypeScript with Tags",
    "aliases": [
      "lit"
    ],
    "import": () => import("./ts-tags-PFGF3FZK.js")
  },
  {
    "id": "tsx",
    "name": "TSX",
    "import": () => import("./tsx-TIE5HK6O.js")
  },
  {
    "id": "typescript",
    "name": "TypeScript",
    "aliases": [
      "ts"
    ],
    "import": () => import("./typescript-6XERZANK.js")
  },
  {
    "id": "vue",
    "name": "Vue",
    "import": () => import("./vue-CH3AP4K4.js")
  },
  {
    "id": "vue-html",
    "name": "Vue HTML",
    "import": () => import("./vue-html-GCU7JR3O.js")
  },
  {
    "id": "wasm",
    "name": "WebAssembly",
    "import": () => import("./wasm-Q7GFIIAF.js")
  },
  {
    "id": "wgsl",
    "name": "WGSL",
    "import": () => import("./wgsl-RZ45YF5H.js")
  },
  {
    "id": "xml",
    "name": "XML",
    "import": () => import("./xml-3PX6HHMF.js")
  },
  {
    "id": "yaml",
    "name": "YAML",
    "aliases": [
      "yml"
    ],
    "import": () => import("./yaml-5PYYRIU7.js")
  }
];
var bundledLanguagesBase = Object.fromEntries(bundledLanguagesInfo.map((i) => [i.id, i.import]));
var bundledLanguagesAlias = Object.fromEntries(bundledLanguagesInfo.flatMap((i) => {
  var _a;
  return ((_a = i.aliases) == null ? void 0 : _a.map((a) => [a, i.import])) || [];
}));
var bundledLanguages = {
  ...bundledLanguagesBase,
  ...bundledLanguagesAlias
};
var createHighlighter = createdBundledHighlighter({
  langs: bundledLanguages,
  themes: bundledThemes,
  engine: () => createOnigurumaEngine(import("./shiki_wasm.js"))
});
var {
  codeToHtml,
  codeToHast,
  codeToTokensBase,
  codeToTokens,
  codeToTokensWithThemes,
  getSingletonHighlighter,
  getLastGrammarState
} = createSingletonShorthands(
  createHighlighter,
  { guessEmbeddedLanguages }
);
var getHighlighter = (options) => {
  warnDeprecated("`getHighlighter` is deprecated. Use `createHighlighter` or `getSingletonHighlighter` instead.");
  return createHighlighter(options);
};
export {
  FontStyle,
  ShikiError,
  EncodedTokenMetadata as StackElementMetadata,
  addClassToHast,
  applyColorReplacements,
  bundledLanguages,
  bundledLanguagesAlias,
  bundledLanguagesBase,
  bundledLanguagesInfo,
  bundledThemes,
  bundledThemesInfo,
  codeToHast,
  codeToHtml,
  codeToTokens,
  codeToTokensBase,
  codeToTokensWithThemes,
  createCssVariablesTheme,
  createHighlighter,
  createHighlighterCore,
  createHighlighterCoreSync,
  createJavaScriptRegexEngine,
  createOnigurumaEngine2 as createOnigurumaEngine,
  createPositionConverter,
  createShikiInternal,
  createShikiInternalSync,
  createSingletonShorthands,
  createWasmOnigEngine,
  createdBundledHighlighter,
  defaultJavaScriptRegexConstructor,
  enableDeprecationWarnings,
  flatTokenVariants,
  getHighlighter,
  getHighlighterCore,
  getLastGrammarState,
  getShikiInternal,
  getSingletonHighlighter,
  getSingletonHighlighterCore,
  getTokenStyleObject,
  getWasmInlined,
  guessEmbeddedLanguages,
  toHtml as hastToHtml,
  isNoneTheme,
  isPlainLang,
  isSpecialLang,
  isSpecialTheme,
  loadWasm,
  makeSingletonHighlighter,
  makeSingletonHighlighterCore,
  normalizeGetter,
  normalizeTheme,
  resolveColorReplacements,
  splitLines,
  splitToken,
  splitTokens,
  stringifyTokenStyle,
  toArray,
  tokenizeAnsiWithTheme,
  tokenizeWithTheme,
  tokensToHast,
  transformerDecorations,
  warnDeprecated
};
//# sourceMappingURL=shiki_bundle_web.js.map
