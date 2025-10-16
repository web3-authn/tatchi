import {
  __export,
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet,
  __publicField,
  __superGet
} from "./chunk-B4Q33VKO.js";

// ../../../node_modules/.pnpm/@shikijs+types@2.5.0/node_modules/@shikijs/types/dist/index.mjs
var ShikiError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ShikiError";
  }
};

// ../../../node_modules/.pnpm/@shikijs+engine-oniguruma@2.5.0/node_modules/@shikijs/engine-oniguruma/dist/index.mjs
var ShikiError2 = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ShikiError";
  }
};
function getHeapMax() {
  return 2147483648;
}
function _emscripten_get_now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
var alignUp = (x, multiple) => x + (multiple - x % multiple) % multiple;
async function main(init) {
  let wasmMemory;
  let buffer;
  const binding = {};
  function updateGlobalBufferAndViews(buf) {
    buffer = buf;
    binding.HEAPU8 = new Uint8Array(buf);
    binding.HEAPU32 = new Uint32Array(buf);
  }
  function _emscripten_memcpy_big(dest, src, num) {
    binding.HEAPU8.copyWithin(dest, src, src + num);
  }
  function emscripten_realloc_buffer(size) {
    try {
      wasmMemory.grow(size - buffer.byteLength + 65535 >>> 16);
      updateGlobalBufferAndViews(wasmMemory.buffer);
      return 1;
    } catch {
    }
  }
  function _emscripten_resize_heap(requestedSize) {
    const oldSize = binding.HEAPU8.length;
    requestedSize = requestedSize >>> 0;
    const maxHeapSize = getHeapMax();
    if (requestedSize > maxHeapSize)
      return false;
    for (let cutDown = 1; cutDown <= 4; cutDown *= 2) {
      let overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
      overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
      const newSize = Math.min(maxHeapSize, alignUp(Math.max(requestedSize, overGrownHeapSize), 65536));
      const replacement = emscripten_realloc_buffer(newSize);
      if (replacement)
        return true;
    }
    return false;
  }
  const UTF8Decoder = typeof TextDecoder != "undefined" ? new TextDecoder("utf8") : void 0;
  function UTF8ArrayToString(heapOrArray, idx, maxBytesToRead = 1024) {
    const endIdx = idx + maxBytesToRead;
    let endPtr = idx;
    while (heapOrArray[endPtr] && !(endPtr >= endIdx))
      ++endPtr;
    if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
      return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
    }
    let str = "";
    while (idx < endPtr) {
      let u0 = heapOrArray[idx++];
      if (!(u0 & 128)) {
        str += String.fromCharCode(u0);
        continue;
      }
      const u1 = heapOrArray[idx++] & 63;
      if ((u0 & 224) === 192) {
        str += String.fromCharCode((u0 & 31) << 6 | u1);
        continue;
      }
      const u2 = heapOrArray[idx++] & 63;
      if ((u0 & 240) === 224) {
        u0 = (u0 & 15) << 12 | u1 << 6 | u2;
      } else {
        u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heapOrArray[idx++] & 63;
      }
      if (u0 < 65536) {
        str += String.fromCharCode(u0);
      } else {
        const ch = u0 - 65536;
        str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
      }
    }
    return str;
  }
  function UTF8ToString(ptr, maxBytesToRead) {
    return ptr ? UTF8ArrayToString(binding.HEAPU8, ptr, maxBytesToRead) : "";
  }
  const asmLibraryArg = {
    emscripten_get_now: _emscripten_get_now,
    emscripten_memcpy_big: _emscripten_memcpy_big,
    emscripten_resize_heap: _emscripten_resize_heap,
    fd_write: () => 0
  };
  async function createWasm() {
    const info = {
      env: asmLibraryArg,
      wasi_snapshot_preview1: asmLibraryArg
    };
    const exports = await init(info);
    wasmMemory = exports.memory;
    updateGlobalBufferAndViews(wasmMemory.buffer);
    Object.assign(binding, exports);
    binding.UTF8ToString = UTF8ToString;
  }
  await createWasm();
  return binding;
}
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key2, value) => key2 in obj ? __defProp(obj, key2, { enumerable: true, configurable: true, writable: true, value }) : obj[key2] = value;
var __publicField2 = (obj, key2, value) => {
  __defNormalProp(obj, typeof key2 !== "symbol" ? key2 + "" : key2, value);
  return value;
};
var onigBinding = null;
function throwLastOnigError(onigBinding2) {
  throw new ShikiError2(onigBinding2.UTF8ToString(onigBinding2.getLastOnigError()));
}
var UtfString = class _UtfString {
  constructor(str) {
    __publicField2(this, "utf16Length");
    __publicField2(this, "utf8Length");
    __publicField2(this, "utf16Value");
    __publicField2(this, "utf8Value");
    __publicField2(this, "utf16OffsetToUtf8");
    __publicField2(this, "utf8OffsetToUtf16");
    const utf16Length = str.length;
    const utf8Length = _UtfString._utf8ByteLength(str);
    const computeIndicesMapping = utf8Length !== utf16Length;
    const utf16OffsetToUtf8 = computeIndicesMapping ? new Uint32Array(utf16Length + 1) : null;
    if (computeIndicesMapping)
      utf16OffsetToUtf8[utf16Length] = utf8Length;
    const utf8OffsetToUtf16 = computeIndicesMapping ? new Uint32Array(utf8Length + 1) : null;
    if (computeIndicesMapping)
      utf8OffsetToUtf16[utf8Length] = utf16Length;
    const utf8Value = new Uint8Array(utf8Length);
    let i8 = 0;
    for (let i16 = 0; i16 < utf16Length; i16++) {
      const charCode = str.charCodeAt(i16);
      let codePoint = charCode;
      let wasSurrogatePair = false;
      if (charCode >= 55296 && charCode <= 56319) {
        if (i16 + 1 < utf16Length) {
          const nextCharCode = str.charCodeAt(i16 + 1);
          if (nextCharCode >= 56320 && nextCharCode <= 57343) {
            codePoint = (charCode - 55296 << 10) + 65536 | nextCharCode - 56320;
            wasSurrogatePair = true;
          }
        }
      }
      if (computeIndicesMapping) {
        utf16OffsetToUtf8[i16] = i8;
        if (wasSurrogatePair)
          utf16OffsetToUtf8[i16 + 1] = i8;
        if (codePoint <= 127) {
          utf8OffsetToUtf16[i8 + 0] = i16;
        } else if (codePoint <= 2047) {
          utf8OffsetToUtf16[i8 + 0] = i16;
          utf8OffsetToUtf16[i8 + 1] = i16;
        } else if (codePoint <= 65535) {
          utf8OffsetToUtf16[i8 + 0] = i16;
          utf8OffsetToUtf16[i8 + 1] = i16;
          utf8OffsetToUtf16[i8 + 2] = i16;
        } else {
          utf8OffsetToUtf16[i8 + 0] = i16;
          utf8OffsetToUtf16[i8 + 1] = i16;
          utf8OffsetToUtf16[i8 + 2] = i16;
          utf8OffsetToUtf16[i8 + 3] = i16;
        }
      }
      if (codePoint <= 127) {
        utf8Value[i8++] = codePoint;
      } else if (codePoint <= 2047) {
        utf8Value[i8++] = 192 | (codePoint & 1984) >>> 6;
        utf8Value[i8++] = 128 | (codePoint & 63) >>> 0;
      } else if (codePoint <= 65535) {
        utf8Value[i8++] = 224 | (codePoint & 61440) >>> 12;
        utf8Value[i8++] = 128 | (codePoint & 4032) >>> 6;
        utf8Value[i8++] = 128 | (codePoint & 63) >>> 0;
      } else {
        utf8Value[i8++] = 240 | (codePoint & 1835008) >>> 18;
        utf8Value[i8++] = 128 | (codePoint & 258048) >>> 12;
        utf8Value[i8++] = 128 | (codePoint & 4032) >>> 6;
        utf8Value[i8++] = 128 | (codePoint & 63) >>> 0;
      }
      if (wasSurrogatePair)
        i16++;
    }
    this.utf16Length = utf16Length;
    this.utf8Length = utf8Length;
    this.utf16Value = str;
    this.utf8Value = utf8Value;
    this.utf16OffsetToUtf8 = utf16OffsetToUtf8;
    this.utf8OffsetToUtf16 = utf8OffsetToUtf16;
  }
  static _utf8ByteLength(str) {
    let result = 0;
    for (let i = 0, len = str.length; i < len; i++) {
      const charCode = str.charCodeAt(i);
      let codepoint = charCode;
      let wasSurrogatePair = false;
      if (charCode >= 55296 && charCode <= 56319) {
        if (i + 1 < len) {
          const nextCharCode = str.charCodeAt(i + 1);
          if (nextCharCode >= 56320 && nextCharCode <= 57343) {
            codepoint = (charCode - 55296 << 10) + 65536 | nextCharCode - 56320;
            wasSurrogatePair = true;
          }
        }
      }
      if (codepoint <= 127)
        result += 1;
      else if (codepoint <= 2047)
        result += 2;
      else if (codepoint <= 65535)
        result += 3;
      else
        result += 4;
      if (wasSurrogatePair)
        i++;
    }
    return result;
  }
  createString(onigBinding2) {
    const result = onigBinding2.omalloc(this.utf8Length);
    onigBinding2.HEAPU8.set(this.utf8Value, result);
    return result;
  }
};
var _OnigString = class {
  constructor(str) {
    __publicField2(this, "id", ++_OnigString.LAST_ID);
    __publicField2(this, "_onigBinding");
    __publicField2(this, "content");
    __publicField2(this, "utf16Length");
    __publicField2(this, "utf8Length");
    __publicField2(this, "utf16OffsetToUtf8");
    __publicField2(this, "utf8OffsetToUtf16");
    __publicField2(this, "ptr");
    if (!onigBinding)
      throw new ShikiError2("Must invoke loadWasm first.");
    this._onigBinding = onigBinding;
    this.content = str;
    const utfString = new UtfString(str);
    this.utf16Length = utfString.utf16Length;
    this.utf8Length = utfString.utf8Length;
    this.utf16OffsetToUtf8 = utfString.utf16OffsetToUtf8;
    this.utf8OffsetToUtf16 = utfString.utf8OffsetToUtf16;
    if (this.utf8Length < 1e4 && !_OnigString._sharedPtrInUse) {
      if (!_OnigString._sharedPtr)
        _OnigString._sharedPtr = onigBinding.omalloc(1e4);
      _OnigString._sharedPtrInUse = true;
      onigBinding.HEAPU8.set(utfString.utf8Value, _OnigString._sharedPtr);
      this.ptr = _OnigString._sharedPtr;
    } else {
      this.ptr = utfString.createString(onigBinding);
    }
  }
  convertUtf8OffsetToUtf16(utf8Offset) {
    if (this.utf8OffsetToUtf16) {
      if (utf8Offset < 0)
        return 0;
      if (utf8Offset > this.utf8Length)
        return this.utf16Length;
      return this.utf8OffsetToUtf16[utf8Offset];
    }
    return utf8Offset;
  }
  convertUtf16OffsetToUtf8(utf16Offset) {
    if (this.utf16OffsetToUtf8) {
      if (utf16Offset < 0)
        return 0;
      if (utf16Offset > this.utf16Length)
        return this.utf8Length;
      return this.utf16OffsetToUtf8[utf16Offset];
    }
    return utf16Offset;
  }
  dispose() {
    if (this.ptr === _OnigString._sharedPtr)
      _OnigString._sharedPtrInUse = false;
    else
      this._onigBinding.ofree(this.ptr);
  }
};
var OnigString = _OnigString;
__publicField2(OnigString, "LAST_ID", 0);
__publicField2(OnigString, "_sharedPtr", 0);
__publicField2(OnigString, "_sharedPtrInUse", false);
var OnigScanner = class {
  constructor(patterns) {
    __publicField2(this, "_onigBinding");
    __publicField2(this, "_ptr");
    if (!onigBinding)
      throw new ShikiError2("Must invoke loadWasm first.");
    const strPtrsArr = [];
    const strLenArr = [];
    for (let i = 0, len = patterns.length; i < len; i++) {
      const utfString = new UtfString(patterns[i]);
      strPtrsArr[i] = utfString.createString(onigBinding);
      strLenArr[i] = utfString.utf8Length;
    }
    const strPtrsPtr = onigBinding.omalloc(4 * patterns.length);
    onigBinding.HEAPU32.set(strPtrsArr, strPtrsPtr / 4);
    const strLenPtr = onigBinding.omalloc(4 * patterns.length);
    onigBinding.HEAPU32.set(strLenArr, strLenPtr / 4);
    const scannerPtr = onigBinding.createOnigScanner(strPtrsPtr, strLenPtr, patterns.length);
    for (let i = 0, len = patterns.length; i < len; i++)
      onigBinding.ofree(strPtrsArr[i]);
    onigBinding.ofree(strLenPtr);
    onigBinding.ofree(strPtrsPtr);
    if (scannerPtr === 0)
      throwLastOnigError(onigBinding);
    this._onigBinding = onigBinding;
    this._ptr = scannerPtr;
  }
  dispose() {
    this._onigBinding.freeOnigScanner(this._ptr);
  }
  findNextMatchSync(string, startPosition, arg) {
    let options = 0;
    if (typeof arg === "number") {
      options = arg;
    }
    if (typeof string === "string") {
      string = new OnigString(string);
      const result = this._findNextMatchSync(string, startPosition, false, options);
      string.dispose();
      return result;
    }
    return this._findNextMatchSync(string, startPosition, false, options);
  }
  _findNextMatchSync(string, startPosition, debugCall, options) {
    const onigBinding2 = this._onigBinding;
    const resultPtr = onigBinding2.findNextOnigScannerMatch(this._ptr, string.id, string.ptr, string.utf8Length, string.convertUtf16OffsetToUtf8(startPosition), options);
    if (resultPtr === 0) {
      return null;
    }
    const HEAPU32 = onigBinding2.HEAPU32;
    let offset = resultPtr / 4;
    const index = HEAPU32[offset++];
    const count = HEAPU32[offset++];
    const captureIndices = [];
    for (let i = 0; i < count; i++) {
      const beg = string.convertUtf8OffsetToUtf16(HEAPU32[offset++]);
      const end = string.convertUtf8OffsetToUtf16(HEAPU32[offset++]);
      captureIndices[i] = {
        start: beg,
        end,
        length: end - beg
      };
    }
    return {
      index,
      captureIndices
    };
  }
};
function isInstantiatorOptionsObject(dataOrOptions) {
  return typeof dataOrOptions.instantiator === "function";
}
function isInstantiatorModule(dataOrOptions) {
  return typeof dataOrOptions.default === "function";
}
function isDataOptionsObject(dataOrOptions) {
  return typeof dataOrOptions.data !== "undefined";
}
function isResponse(dataOrOptions) {
  return typeof Response !== "undefined" && dataOrOptions instanceof Response;
}
function isArrayBuffer(data) {
  var _a4;
  return typeof ArrayBuffer !== "undefined" && (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) || typeof Buffer !== "undefined" && ((_a4 = Buffer.isBuffer) == null ? void 0 : _a4.call(Buffer, data)) || typeof SharedArrayBuffer !== "undefined" && data instanceof SharedArrayBuffer || typeof Uint32Array !== "undefined" && data instanceof Uint32Array;
}
var initPromise;
function loadWasm(options) {
  if (initPromise)
    return initPromise;
  async function _load() {
    onigBinding = await main(async (info) => {
      let instance = options;
      instance = await instance;
      if (typeof instance === "function")
        instance = await instance(info);
      if (typeof instance === "function")
        instance = await instance(info);
      if (isInstantiatorOptionsObject(instance)) {
        instance = await instance.instantiator(info);
      } else if (isInstantiatorModule(instance)) {
        instance = await instance.default(info);
      } else {
        if (isDataOptionsObject(instance))
          instance = instance.data;
        if (isResponse(instance)) {
          if (typeof WebAssembly.instantiateStreaming === "function")
            instance = await _makeResponseStreamingLoader(instance)(info);
          else
            instance = await _makeResponseNonStreamingLoader(instance)(info);
        } else if (isArrayBuffer(instance)) {
          instance = await _makeArrayBufferLoader(instance)(info);
        } else if (instance instanceof WebAssembly.Module) {
          instance = await _makeArrayBufferLoader(instance)(info);
        } else if ("default" in instance && instance.default instanceof WebAssembly.Module) {
          instance = await _makeArrayBufferLoader(instance.default)(info);
        }
      }
      if ("instance" in instance)
        instance = instance.instance;
      if ("exports" in instance)
        instance = instance.exports;
      return instance;
    });
  }
  initPromise = _load();
  return initPromise;
}
function _makeArrayBufferLoader(data) {
  return (importObject) => WebAssembly.instantiate(data, importObject);
}
function _makeResponseStreamingLoader(data) {
  return (importObject) => WebAssembly.instantiateStreaming(data, importObject);
}
function _makeResponseNonStreamingLoader(data) {
  return async (importObject) => {
    const arrayBuffer = await data.arrayBuffer();
    return WebAssembly.instantiate(arrayBuffer, importObject);
  };
}
var _defaultWasmLoader;
function getDefaultWasmLoader() {
  return _defaultWasmLoader;
}
async function createOnigurumaEngine(options) {
  if (options)
    await loadWasm(options);
  return {
    createScanner(patterns) {
      return new OnigScanner(patterns.map((p2) => typeof p2 === "string" ? p2 : p2.source));
    },
    createString(s) {
      return new OnigString(s);
    }
  };
}

// ../../../node_modules/.pnpm/@shikijs+core@2.5.0/node_modules/@shikijs/core/dist/shared/core.5hv0Law9.mjs
var _emitDeprecation = 3;
var _emitError = false;
function enableDeprecationWarnings(emitDeprecation = true, emitError = false) {
  _emitDeprecation = emitDeprecation;
  _emitError = emitError;
}
function warnDeprecated(message, version = 3) {
  if (!_emitDeprecation)
    return;
  if (typeof _emitDeprecation === "number" && version > _emitDeprecation)
    return;
  if (_emitError) {
    throw new Error(`[SHIKI DEPRECATE]: ${message}`);
  } else {
    console.trace(`[SHIKI DEPRECATE]: ${message}`);
  }
}

// ../../../node_modules/.pnpm/@shikijs+vscode-textmate@10.0.2/node_modules/@shikijs/vscode-textmate/dist/index.js
function clone(something) {
  return doClone(something);
}
function doClone(something) {
  if (Array.isArray(something)) {
    return cloneArray(something);
  }
  if (something instanceof RegExp) {
    return something;
  }
  if (typeof something === "object") {
    return cloneObj(something);
  }
  return something;
}
function cloneArray(arr) {
  let r4 = [];
  for (let i = 0, len = arr.length; i < len; i++) {
    r4[i] = doClone(arr[i]);
  }
  return r4;
}
function cloneObj(obj) {
  let r4 = {};
  for (let key2 in obj) {
    r4[key2] = doClone(obj[key2]);
  }
  return r4;
}
function mergeObjects(target, ...sources) {
  sources.forEach((source) => {
    for (let key2 in source) {
      target[key2] = source[key2];
    }
  });
  return target;
}
function basename(path) {
  const idx = ~path.lastIndexOf("/") || ~path.lastIndexOf("\\");
  if (idx === 0) {
    return path;
  } else if (~idx === path.length - 1) {
    return basename(path.substring(0, path.length - 1));
  } else {
    return path.substr(~idx + 1);
  }
}
var CAPTURING_REGEX_SOURCE = /\$(\d+)|\${(\d+):\/(downcase|upcase)}/g;
var RegexSource = class {
  static hasCaptures(regexSource) {
    if (regexSource === null) {
      return false;
    }
    CAPTURING_REGEX_SOURCE.lastIndex = 0;
    return CAPTURING_REGEX_SOURCE.test(regexSource);
  }
  static replaceCaptures(regexSource, captureSource, captureIndices) {
    return regexSource.replace(CAPTURING_REGEX_SOURCE, (match, index, commandIndex, command) => {
      let capture = captureIndices[parseInt(index || commandIndex, 10)];
      if (capture) {
        let result = captureSource.substring(capture.start, capture.end);
        while (result[0] === ".") {
          result = result.substring(1);
        }
        switch (command) {
          case "downcase":
            return result.toLowerCase();
          case "upcase":
            return result.toUpperCase();
          default:
            return result;
        }
      } else {
        return match;
      }
    });
  }
};
function strcmp(a, b) {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}
function strArrCmp(a, b) {
  if (a === null && b === null) {
    return 0;
  }
  if (!a) {
    return -1;
  }
  if (!b) {
    return 1;
  }
  let len1 = a.length;
  let len2 = b.length;
  if (len1 === len2) {
    for (let i = 0; i < len1; i++) {
      let res = strcmp(a[i], b[i]);
      if (res !== 0) {
        return res;
      }
    }
    return 0;
  }
  return len1 - len2;
}
function isValidHexColor(hex) {
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return true;
  }
  if (/^#[0-9a-f]{8}$/i.test(hex)) {
    return true;
  }
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return true;
  }
  if (/^#[0-9a-f]{4}$/i.test(hex)) {
    return true;
  }
  return false;
}
function escapeRegExpCharacters(value) {
  return value.replace(/[\-\\\{\}\*\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, "\\$&");
}
var CachedFn = class {
  constructor(fn) {
    __publicField(this, "cache", /* @__PURE__ */ new Map());
    this.fn = fn;
  }
  get(key2) {
    if (this.cache.has(key2)) {
      return this.cache.get(key2);
    }
    const value = this.fn(key2);
    this.cache.set(key2, value);
    return value;
  }
};
var Theme = class {
  constructor(_colorMap, _defaults, _root) {
    __publicField(this, "_cachedMatchRoot", new CachedFn(
      (scopeName) => this._root.match(scopeName)
    ));
    this._colorMap = _colorMap;
    this._defaults = _defaults;
    this._root = _root;
  }
  static createFromRawTheme(source, colorMap) {
    return this.createFromParsedTheme(parseTheme(source), colorMap);
  }
  static createFromParsedTheme(source, colorMap) {
    return resolveParsedThemeRules(source, colorMap);
  }
  getColorMap() {
    return this._colorMap.getColorMap();
  }
  getDefaults() {
    return this._defaults;
  }
  match(scopePath) {
    if (scopePath === null) {
      return this._defaults;
    }
    const scopeName = scopePath.scopeName;
    const matchingTrieElements = this._cachedMatchRoot.get(scopeName);
    const effectiveRule = matchingTrieElements.find(
      (v) => _scopePathMatchesParentScopes(scopePath.parent, v.parentScopes)
    );
    if (!effectiveRule) {
      return null;
    }
    return new StyleAttributes(
      effectiveRule.fontStyle,
      effectiveRule.foreground,
      effectiveRule.background
    );
  }
};
var ScopeStack = class _ScopeStack {
  constructor(parent, scopeName) {
    this.parent = parent;
    this.scopeName = scopeName;
  }
  static push(path, scopeNames) {
    for (const name of scopeNames) {
      path = new _ScopeStack(path, name);
    }
    return path;
  }
  static from(...segments) {
    let result = null;
    for (let i = 0; i < segments.length; i++) {
      result = new _ScopeStack(result, segments[i]);
    }
    return result;
  }
  push(scopeName) {
    return new _ScopeStack(this, scopeName);
  }
  getSegments() {
    let item = this;
    const result = [];
    while (item) {
      result.push(item.scopeName);
      item = item.parent;
    }
    result.reverse();
    return result;
  }
  toString() {
    return this.getSegments().join(" ");
  }
  extends(other) {
    if (this === other) {
      return true;
    }
    if (this.parent === null) {
      return false;
    }
    return this.parent.extends(other);
  }
  getExtensionIfDefined(base) {
    const result = [];
    let item = this;
    while (item && item !== base) {
      result.push(item.scopeName);
      item = item.parent;
    }
    return item === base ? result.reverse() : void 0;
  }
};
function _scopePathMatchesParentScopes(scopePath, parentScopes) {
  if (parentScopes.length === 0) {
    return true;
  }
  for (let index = 0; index < parentScopes.length; index++) {
    let scopePattern = parentScopes[index];
    let scopeMustMatch = false;
    if (scopePattern === ">") {
      if (index === parentScopes.length - 1) {
        return false;
      }
      scopePattern = parentScopes[++index];
      scopeMustMatch = true;
    }
    while (scopePath) {
      if (_matchesScope(scopePath.scopeName, scopePattern)) {
        break;
      }
      if (scopeMustMatch) {
        return false;
      }
      scopePath = scopePath.parent;
    }
    if (!scopePath) {
      return false;
    }
    scopePath = scopePath.parent;
  }
  return true;
}
function _matchesScope(scopeName, scopePattern) {
  return scopePattern === scopeName || scopeName.startsWith(scopePattern) && scopeName[scopePattern.length] === ".";
}
var StyleAttributes = class {
  constructor(fontStyle, foregroundId, backgroundId) {
    this.fontStyle = fontStyle;
    this.foregroundId = foregroundId;
    this.backgroundId = backgroundId;
  }
};
function parseTheme(source) {
  if (!source) {
    return [];
  }
  if (!source.settings || !Array.isArray(source.settings)) {
    return [];
  }
  let settings = source.settings;
  let result = [], resultLen = 0;
  for (let i = 0, len = settings.length; i < len; i++) {
    let entry = settings[i];
    if (!entry.settings) {
      continue;
    }
    let scopes;
    if (typeof entry.scope === "string") {
      let _scope = entry.scope;
      _scope = _scope.replace(/^[,]+/, "");
      _scope = _scope.replace(/[,]+$/, "");
      scopes = _scope.split(",");
    } else if (Array.isArray(entry.scope)) {
      scopes = entry.scope;
    } else {
      scopes = [""];
    }
    let fontStyle = -1;
    if (typeof entry.settings.fontStyle === "string") {
      fontStyle = 0;
      let segments = entry.settings.fontStyle.split(" ");
      for (let j = 0, lenJ = segments.length; j < lenJ; j++) {
        let segment = segments[j];
        switch (segment) {
          case "italic":
            fontStyle = fontStyle | 1;
            break;
          case "bold":
            fontStyle = fontStyle | 2;
            break;
          case "underline":
            fontStyle = fontStyle | 4;
            break;
          case "strikethrough":
            fontStyle = fontStyle | 8;
            break;
        }
      }
    }
    let foreground = null;
    if (typeof entry.settings.foreground === "string" && isValidHexColor(entry.settings.foreground)) {
      foreground = entry.settings.foreground;
    }
    let background = null;
    if (typeof entry.settings.background === "string" && isValidHexColor(entry.settings.background)) {
      background = entry.settings.background;
    }
    for (let j = 0, lenJ = scopes.length; j < lenJ; j++) {
      let _scope = scopes[j].trim();
      let segments = _scope.split(" ");
      let scope = segments[segments.length - 1];
      let parentScopes = null;
      if (segments.length > 1) {
        parentScopes = segments.slice(0, segments.length - 1);
        parentScopes.reverse();
      }
      result[resultLen++] = new ParsedThemeRule(
        scope,
        parentScopes,
        i,
        fontStyle,
        foreground,
        background
      );
    }
  }
  return result;
}
var ParsedThemeRule = class {
  constructor(scope, parentScopes, index, fontStyle, foreground, background) {
    this.scope = scope;
    this.parentScopes = parentScopes;
    this.index = index;
    this.fontStyle = fontStyle;
    this.foreground = foreground;
    this.background = background;
  }
};
var FontStyle = ((FontStyle2) => {
  FontStyle2[FontStyle2["NotSet"] = -1] = "NotSet";
  FontStyle2[FontStyle2["None"] = 0] = "None";
  FontStyle2[FontStyle2["Italic"] = 1] = "Italic";
  FontStyle2[FontStyle2["Bold"] = 2] = "Bold";
  FontStyle2[FontStyle2["Underline"] = 4] = "Underline";
  FontStyle2[FontStyle2["Strikethrough"] = 8] = "Strikethrough";
  return FontStyle2;
})(FontStyle || {});
function resolveParsedThemeRules(parsedThemeRules, _colorMap) {
  parsedThemeRules.sort((a, b) => {
    let r4 = strcmp(a.scope, b.scope);
    if (r4 !== 0) {
      return r4;
    }
    r4 = strArrCmp(a.parentScopes, b.parentScopes);
    if (r4 !== 0) {
      return r4;
    }
    return a.index - b.index;
  });
  let defaultFontStyle = 0;
  let defaultForeground = "#000000";
  let defaultBackground = "#ffffff";
  while (parsedThemeRules.length >= 1 && parsedThemeRules[0].scope === "") {
    let incomingDefaults = parsedThemeRules.shift();
    if (incomingDefaults.fontStyle !== -1) {
      defaultFontStyle = incomingDefaults.fontStyle;
    }
    if (incomingDefaults.foreground !== null) {
      defaultForeground = incomingDefaults.foreground;
    }
    if (incomingDefaults.background !== null) {
      defaultBackground = incomingDefaults.background;
    }
  }
  let colorMap = new ColorMap(_colorMap);
  let defaults = new StyleAttributes(defaultFontStyle, colorMap.getId(defaultForeground), colorMap.getId(defaultBackground));
  let root2 = new ThemeTrieElement(new ThemeTrieElementRule(0, null, -1, 0, 0), []);
  for (let i = 0, len = parsedThemeRules.length; i < len; i++) {
    let rule = parsedThemeRules[i];
    root2.insert(0, rule.scope, rule.parentScopes, rule.fontStyle, colorMap.getId(rule.foreground), colorMap.getId(rule.background));
  }
  return new Theme(colorMap, defaults, root2);
}
var ColorMap = class {
  constructor(_colorMap) {
    __publicField(this, "_isFrozen");
    __publicField(this, "_lastColorId");
    __publicField(this, "_id2color");
    __publicField(this, "_color2id");
    this._lastColorId = 0;
    this._id2color = [];
    this._color2id = /* @__PURE__ */ Object.create(null);
    if (Array.isArray(_colorMap)) {
      this._isFrozen = true;
      for (let i = 0, len = _colorMap.length; i < len; i++) {
        this._color2id[_colorMap[i]] = i;
        this._id2color[i] = _colorMap[i];
      }
    } else {
      this._isFrozen = false;
    }
  }
  getId(color) {
    if (color === null) {
      return 0;
    }
    color = color.toUpperCase();
    let value = this._color2id[color];
    if (value) {
      return value;
    }
    if (this._isFrozen) {
      throw new Error(`Missing color in color map - ${color}`);
    }
    value = ++this._lastColorId;
    this._color2id[color] = value;
    this._id2color[value] = color;
    return value;
  }
  getColorMap() {
    return this._id2color.slice(0);
  }
};
var emptyParentScopes = Object.freeze([]);
var ThemeTrieElementRule = class _ThemeTrieElementRule {
  constructor(scopeDepth, parentScopes, fontStyle, foreground, background) {
    __publicField(this, "scopeDepth");
    __publicField(this, "parentScopes");
    __publicField(this, "fontStyle");
    __publicField(this, "foreground");
    __publicField(this, "background");
    this.scopeDepth = scopeDepth;
    this.parentScopes = parentScopes || emptyParentScopes;
    this.fontStyle = fontStyle;
    this.foreground = foreground;
    this.background = background;
  }
  clone() {
    return new _ThemeTrieElementRule(this.scopeDepth, this.parentScopes, this.fontStyle, this.foreground, this.background);
  }
  static cloneArr(arr) {
    let r4 = [];
    for (let i = 0, len = arr.length; i < len; i++) {
      r4[i] = arr[i].clone();
    }
    return r4;
  }
  acceptOverwrite(scopeDepth, fontStyle, foreground, background) {
    if (this.scopeDepth > scopeDepth) {
      console.log("how did this happen?");
    } else {
      this.scopeDepth = scopeDepth;
    }
    if (fontStyle !== -1) {
      this.fontStyle = fontStyle;
    }
    if (foreground !== 0) {
      this.foreground = foreground;
    }
    if (background !== 0) {
      this.background = background;
    }
  }
};
var ThemeTrieElement = class _ThemeTrieElement {
  constructor(_mainRule, rulesWithParentScopes = [], _children = {}) {
    __publicField(this, "_rulesWithParentScopes");
    this._mainRule = _mainRule;
    this._children = _children;
    this._rulesWithParentScopes = rulesWithParentScopes;
  }
  static _cmpBySpecificity(a, b) {
    if (a.scopeDepth !== b.scopeDepth) {
      return b.scopeDepth - a.scopeDepth;
    }
    let aParentIndex = 0;
    let bParentIndex = 0;
    while (true) {
      if (a.parentScopes[aParentIndex] === ">") {
        aParentIndex++;
      }
      if (b.parentScopes[bParentIndex] === ">") {
        bParentIndex++;
      }
      if (aParentIndex >= a.parentScopes.length || bParentIndex >= b.parentScopes.length) {
        break;
      }
      const parentScopeLengthDiff = b.parentScopes[bParentIndex].length - a.parentScopes[aParentIndex].length;
      if (parentScopeLengthDiff !== 0) {
        return parentScopeLengthDiff;
      }
      aParentIndex++;
      bParentIndex++;
    }
    return b.parentScopes.length - a.parentScopes.length;
  }
  match(scope) {
    if (scope !== "") {
      let dotIndex = scope.indexOf(".");
      let head2;
      let tail;
      if (dotIndex === -1) {
        head2 = scope;
        tail = "";
      } else {
        head2 = scope.substring(0, dotIndex);
        tail = scope.substring(dotIndex + 1);
      }
      if (this._children.hasOwnProperty(head2)) {
        return this._children[head2].match(tail);
      }
    }
    const rules = this._rulesWithParentScopes.concat(this._mainRule);
    rules.sort(_ThemeTrieElement._cmpBySpecificity);
    return rules;
  }
  insert(scopeDepth, scope, parentScopes, fontStyle, foreground, background) {
    if (scope === "") {
      this._doInsertHere(scopeDepth, parentScopes, fontStyle, foreground, background);
      return;
    }
    let dotIndex = scope.indexOf(".");
    let head2;
    let tail;
    if (dotIndex === -1) {
      head2 = scope;
      tail = "";
    } else {
      head2 = scope.substring(0, dotIndex);
      tail = scope.substring(dotIndex + 1);
    }
    let child;
    if (this._children.hasOwnProperty(head2)) {
      child = this._children[head2];
    } else {
      child = new _ThemeTrieElement(this._mainRule.clone(), ThemeTrieElementRule.cloneArr(this._rulesWithParentScopes));
      this._children[head2] = child;
    }
    child.insert(scopeDepth + 1, tail, parentScopes, fontStyle, foreground, background);
  }
  _doInsertHere(scopeDepth, parentScopes, fontStyle, foreground, background) {
    if (parentScopes === null) {
      this._mainRule.acceptOverwrite(scopeDepth, fontStyle, foreground, background);
      return;
    }
    for (let i = 0, len = this._rulesWithParentScopes.length; i < len; i++) {
      let rule = this._rulesWithParentScopes[i];
      if (strArrCmp(rule.parentScopes, parentScopes) === 0) {
        rule.acceptOverwrite(scopeDepth, fontStyle, foreground, background);
        return;
      }
    }
    if (fontStyle === -1) {
      fontStyle = this._mainRule.fontStyle;
    }
    if (foreground === 0) {
      foreground = this._mainRule.foreground;
    }
    if (background === 0) {
      background = this._mainRule.background;
    }
    this._rulesWithParentScopes.push(new ThemeTrieElementRule(scopeDepth, parentScopes, fontStyle, foreground, background));
  }
};
var EncodedTokenMetadata = class _EncodedTokenMetadata {
  static toBinaryStr(encodedTokenAttributes) {
    return encodedTokenAttributes.toString(2).padStart(32, "0");
  }
  static print(encodedTokenAttributes) {
    const languageId = _EncodedTokenMetadata.getLanguageId(encodedTokenAttributes);
    const tokenType = _EncodedTokenMetadata.getTokenType(encodedTokenAttributes);
    const fontStyle = _EncodedTokenMetadata.getFontStyle(encodedTokenAttributes);
    const foreground = _EncodedTokenMetadata.getForeground(encodedTokenAttributes);
    const background = _EncodedTokenMetadata.getBackground(encodedTokenAttributes);
    console.log({
      languageId,
      tokenType,
      fontStyle,
      foreground,
      background
    });
  }
  static getLanguageId(encodedTokenAttributes) {
    return (encodedTokenAttributes & 255) >>> 0;
  }
  static getTokenType(encodedTokenAttributes) {
    return (encodedTokenAttributes & 768) >>> 8;
  }
  static containsBalancedBrackets(encodedTokenAttributes) {
    return (encodedTokenAttributes & 1024) !== 0;
  }
  static getFontStyle(encodedTokenAttributes) {
    return (encodedTokenAttributes & 30720) >>> 11;
  }
  static getForeground(encodedTokenAttributes) {
    return (encodedTokenAttributes & 16744448) >>> 15;
  }
  static getBackground(encodedTokenAttributes) {
    return (encodedTokenAttributes & 4278190080) >>> 24;
  }
  /**
   * Updates the fields in `metadata`.
   * A value of `0`, `NotSet` or `null` indicates that the corresponding field should be left as is.
   */
  static set(encodedTokenAttributes, languageId, tokenType, containsBalancedBrackets, fontStyle, foreground, background) {
    let _languageId = _EncodedTokenMetadata.getLanguageId(encodedTokenAttributes);
    let _tokenType = _EncodedTokenMetadata.getTokenType(encodedTokenAttributes);
    let _containsBalancedBracketsBit = _EncodedTokenMetadata.containsBalancedBrackets(encodedTokenAttributes) ? 1 : 0;
    let _fontStyle = _EncodedTokenMetadata.getFontStyle(encodedTokenAttributes);
    let _foreground = _EncodedTokenMetadata.getForeground(encodedTokenAttributes);
    let _background = _EncodedTokenMetadata.getBackground(encodedTokenAttributes);
    if (languageId !== 0) {
      _languageId = languageId;
    }
    if (tokenType !== 8) {
      _tokenType = fromOptionalTokenType(tokenType);
    }
    if (containsBalancedBrackets !== null) {
      _containsBalancedBracketsBit = containsBalancedBrackets ? 1 : 0;
    }
    if (fontStyle !== -1) {
      _fontStyle = fontStyle;
    }
    if (foreground !== 0) {
      _foreground = foreground;
    }
    if (background !== 0) {
      _background = background;
    }
    return (_languageId << 0 | _tokenType << 8 | _containsBalancedBracketsBit << 10 | _fontStyle << 11 | _foreground << 15 | _background << 24) >>> 0;
  }
};
function toOptionalTokenType(standardType) {
  return standardType;
}
function fromOptionalTokenType(standardType) {
  return standardType;
}
function createMatchers(selector, matchesName) {
  const results = [];
  const tokenizer = newTokenizer(selector);
  let token2 = tokenizer.next();
  while (token2 !== null) {
    let priority = 0;
    if (token2.length === 2 && token2.charAt(1) === ":") {
      switch (token2.charAt(0)) {
        case "R":
          priority = 1;
          break;
        case "L":
          priority = -1;
          break;
        default:
          console.log(`Unknown priority ${token2} in scope selector`);
      }
      token2 = tokenizer.next();
    }
    let matcher = parseConjunction();
    results.push({ matcher, priority });
    if (token2 !== ",") {
      break;
    }
    token2 = tokenizer.next();
  }
  return results;
  function parseOperand() {
    if (token2 === "-") {
      token2 = tokenizer.next();
      const expressionToNegate = parseOperand();
      return (matcherInput) => !!expressionToNegate && !expressionToNegate(matcherInput);
    }
    if (token2 === "(") {
      token2 = tokenizer.next();
      const expressionInParents = parseInnerExpression();
      if (token2 === ")") {
        token2 = tokenizer.next();
      }
      return expressionInParents;
    }
    if (isIdentifier(token2)) {
      const identifiers = [];
      do {
        identifiers.push(token2);
        token2 = tokenizer.next();
      } while (isIdentifier(token2));
      return (matcherInput) => matchesName(identifiers, matcherInput);
    }
    return null;
  }
  function parseConjunction() {
    const matchers = [];
    let matcher = parseOperand();
    while (matcher) {
      matchers.push(matcher);
      matcher = parseOperand();
    }
    return (matcherInput) => matchers.every((matcher2) => matcher2(matcherInput));
  }
  function parseInnerExpression() {
    const matchers = [];
    let matcher = parseConjunction();
    while (matcher) {
      matchers.push(matcher);
      if (token2 === "|" || token2 === ",") {
        do {
          token2 = tokenizer.next();
        } while (token2 === "|" || token2 === ",");
      } else {
        break;
      }
      matcher = parseConjunction();
    }
    return (matcherInput) => matchers.some((matcher2) => matcher2(matcherInput));
  }
}
function isIdentifier(token2) {
  return !!token2 && !!token2.match(/[\w\.:]+/);
}
function newTokenizer(input) {
  let regex = /([LR]:|[\w\.:][\w\.:\-]*|[\,\|\-\(\)])/g;
  let match = regex.exec(input);
  return {
    next: () => {
      if (!match) {
        return null;
      }
      const res = match[0];
      match = regex.exec(input);
      return res;
    }
  };
}
var FindOption = ((FindOption2) => {
  FindOption2[FindOption2["None"] = 0] = "None";
  FindOption2[FindOption2["NotBeginString"] = 1] = "NotBeginString";
  FindOption2[FindOption2["NotEndString"] = 2] = "NotEndString";
  FindOption2[FindOption2["NotBeginPosition"] = 4] = "NotBeginPosition";
  FindOption2[FindOption2["DebugCall"] = 8] = "DebugCall";
  return FindOption2;
})(FindOption || {});
function disposeOnigString(str) {
  if (typeof str.dispose === "function") {
    str.dispose();
  }
}
var TopLevelRuleReference = class {
  constructor(scopeName) {
    this.scopeName = scopeName;
  }
  toKey() {
    return this.scopeName;
  }
};
var TopLevelRepositoryRuleReference = class {
  constructor(scopeName, ruleName) {
    this.scopeName = scopeName;
    this.ruleName = ruleName;
  }
  toKey() {
    return `${this.scopeName}#${this.ruleName}`;
  }
};
var ExternalReferenceCollector = class {
  constructor() {
    __publicField(this, "_references", []);
    __publicField(this, "_seenReferenceKeys", /* @__PURE__ */ new Set());
    __publicField(this, "visitedRule", /* @__PURE__ */ new Set());
  }
  get references() {
    return this._references;
  }
  add(reference) {
    const key2 = reference.toKey();
    if (this._seenReferenceKeys.has(key2)) {
      return;
    }
    this._seenReferenceKeys.add(key2);
    this._references.push(reference);
  }
};
var ScopeDependencyProcessor = class {
  constructor(repo, initialScopeName) {
    __publicField(this, "seenFullScopeRequests", /* @__PURE__ */ new Set());
    __publicField(this, "seenPartialScopeRequests", /* @__PURE__ */ new Set());
    __publicField(this, "Q");
    this.repo = repo;
    this.initialScopeName = initialScopeName;
    this.seenFullScopeRequests.add(this.initialScopeName);
    this.Q = [new TopLevelRuleReference(this.initialScopeName)];
  }
  processQueue() {
    const q = this.Q;
    this.Q = [];
    const deps = new ExternalReferenceCollector();
    for (const dep of q) {
      collectReferencesOfReference(dep, this.initialScopeName, this.repo, deps);
    }
    for (const dep of deps.references) {
      if (dep instanceof TopLevelRuleReference) {
        if (this.seenFullScopeRequests.has(dep.scopeName)) {
          continue;
        }
        this.seenFullScopeRequests.add(dep.scopeName);
        this.Q.push(dep);
      } else {
        if (this.seenFullScopeRequests.has(dep.scopeName)) {
          continue;
        }
        if (this.seenPartialScopeRequests.has(dep.toKey())) {
          continue;
        }
        this.seenPartialScopeRequests.add(dep.toKey());
        this.Q.push(dep);
      }
    }
  }
};
function collectReferencesOfReference(reference, baseGrammarScopeName, repo, result) {
  const selfGrammar = repo.lookup(reference.scopeName);
  if (!selfGrammar) {
    if (reference.scopeName === baseGrammarScopeName) {
      throw new Error(`No grammar provided for <${baseGrammarScopeName}>`);
    }
    return;
  }
  const baseGrammar = repo.lookup(baseGrammarScopeName);
  if (reference instanceof TopLevelRuleReference) {
    collectExternalReferencesInTopLevelRule({ baseGrammar, selfGrammar }, result);
  } else {
    collectExternalReferencesInTopLevelRepositoryRule(
      reference.ruleName,
      { baseGrammar, selfGrammar, repository: selfGrammar.repository },
      result
    );
  }
  const injections = repo.injections(reference.scopeName);
  if (injections) {
    for (const injection of injections) {
      result.add(new TopLevelRuleReference(injection));
    }
  }
}
function collectExternalReferencesInTopLevelRepositoryRule(ruleName, context, result) {
  if (context.repository && context.repository[ruleName]) {
    const rule = context.repository[ruleName];
    collectExternalReferencesInRules([rule], context, result);
  }
}
function collectExternalReferencesInTopLevelRule(context, result) {
  if (context.selfGrammar.patterns && Array.isArray(context.selfGrammar.patterns)) {
    collectExternalReferencesInRules(
      context.selfGrammar.patterns,
      { ...context, repository: context.selfGrammar.repository },
      result
    );
  }
  if (context.selfGrammar.injections) {
    collectExternalReferencesInRules(
      Object.values(context.selfGrammar.injections),
      { ...context, repository: context.selfGrammar.repository },
      result
    );
  }
}
function collectExternalReferencesInRules(rules, context, result) {
  for (const rule of rules) {
    if (result.visitedRule.has(rule)) {
      continue;
    }
    result.visitedRule.add(rule);
    const patternRepository = rule.repository ? mergeObjects({}, context.repository, rule.repository) : context.repository;
    if (Array.isArray(rule.patterns)) {
      collectExternalReferencesInRules(rule.patterns, { ...context, repository: patternRepository }, result);
    }
    const include = rule.include;
    if (!include) {
      continue;
    }
    const reference = parseInclude(include);
    switch (reference.kind) {
      case 0:
        collectExternalReferencesInTopLevelRule({ ...context, selfGrammar: context.baseGrammar }, result);
        break;
      case 1:
        collectExternalReferencesInTopLevelRule(context, result);
        break;
      case 2:
        collectExternalReferencesInTopLevelRepositoryRule(reference.ruleName, { ...context, repository: patternRepository }, result);
        break;
      case 3:
      case 4:
        const selfGrammar = reference.scopeName === context.selfGrammar.scopeName ? context.selfGrammar : reference.scopeName === context.baseGrammar.scopeName ? context.baseGrammar : void 0;
        if (selfGrammar) {
          const newContext = { baseGrammar: context.baseGrammar, selfGrammar, repository: patternRepository };
          if (reference.kind === 4) {
            collectExternalReferencesInTopLevelRepositoryRule(reference.ruleName, newContext, result);
          } else {
            collectExternalReferencesInTopLevelRule(newContext, result);
          }
        } else {
          if (reference.kind === 4) {
            result.add(new TopLevelRepositoryRuleReference(reference.scopeName, reference.ruleName));
          } else {
            result.add(new TopLevelRuleReference(reference.scopeName));
          }
        }
        break;
    }
  }
}
var BaseReference = class {
  constructor() {
    __publicField(this, "kind", 0);
  }
};
var SelfReference = class {
  constructor() {
    __publicField(this, "kind", 1);
  }
};
var RelativeReference = class {
  constructor(ruleName) {
    __publicField(this, "kind", 2);
    this.ruleName = ruleName;
  }
};
var TopLevelReference = class {
  constructor(scopeName) {
    __publicField(this, "kind", 3);
    this.scopeName = scopeName;
  }
};
var TopLevelRepositoryReference = class {
  constructor(scopeName, ruleName) {
    __publicField(this, "kind", 4);
    this.scopeName = scopeName;
    this.ruleName = ruleName;
  }
};
function parseInclude(include) {
  if (include === "$base") {
    return new BaseReference();
  } else if (include === "$self") {
    return new SelfReference();
  }
  const indexOfSharp = include.indexOf("#");
  if (indexOfSharp === -1) {
    return new TopLevelReference(include);
  } else if (indexOfSharp === 0) {
    return new RelativeReference(include.substring(1));
  } else {
    const scopeName = include.substring(0, indexOfSharp);
    const ruleName = include.substring(indexOfSharp + 1);
    return new TopLevelRepositoryReference(scopeName, ruleName);
  }
}
var HAS_BACK_REFERENCES = /\\(\d+)/;
var BACK_REFERENCING_END = /\\(\d+)/g;
var ruleIdSymbol = Symbol("RuleId");
var endRuleId = -1;
var whileRuleId = -2;
function ruleIdFromNumber(id) {
  return id;
}
function ruleIdToNumber(id) {
  return id;
}
var Rule = class {
  constructor($location, id, name, contentName) {
    __publicField(this, "$location");
    __publicField(this, "id");
    __publicField(this, "_nameIsCapturing");
    __publicField(this, "_name");
    __publicField(this, "_contentNameIsCapturing");
    __publicField(this, "_contentName");
    this.$location = $location;
    this.id = id;
    this._name = name || null;
    this._nameIsCapturing = RegexSource.hasCaptures(this._name);
    this._contentName = contentName || null;
    this._contentNameIsCapturing = RegexSource.hasCaptures(this._contentName);
  }
  get debugName() {
    const location = this.$location ? `${basename(this.$location.filename)}:${this.$location.line}` : "unknown";
    return `${this.constructor.name}#${this.id} @ ${location}`;
  }
  getName(lineText, captureIndices) {
    if (!this._nameIsCapturing || this._name === null || lineText === null || captureIndices === null) {
      return this._name;
    }
    return RegexSource.replaceCaptures(this._name, lineText, captureIndices);
  }
  getContentName(lineText, captureIndices) {
    if (!this._contentNameIsCapturing || this._contentName === null) {
      return this._contentName;
    }
    return RegexSource.replaceCaptures(this._contentName, lineText, captureIndices);
  }
};
var CaptureRule = class extends Rule {
  constructor($location, id, name, contentName, retokenizeCapturedWithRuleId) {
    super($location, id, name, contentName);
    __publicField(this, "retokenizeCapturedWithRuleId");
    this.retokenizeCapturedWithRuleId = retokenizeCapturedWithRuleId;
  }
  dispose() {
  }
  collectPatterns(grammar, out) {
    throw new Error("Not supported!");
  }
  compile(grammar, endRegexSource) {
    throw new Error("Not supported!");
  }
  compileAG(grammar, endRegexSource, allowA, allowG) {
    throw new Error("Not supported!");
  }
};
var MatchRule = class extends Rule {
  constructor($location, id, name, match, captures) {
    super($location, id, name, null);
    __publicField(this, "_match");
    __publicField(this, "captures");
    __publicField(this, "_cachedCompiledPatterns");
    this._match = new RegExpSource(match, this.id);
    this.captures = captures;
    this._cachedCompiledPatterns = null;
  }
  dispose() {
    if (this._cachedCompiledPatterns) {
      this._cachedCompiledPatterns.dispose();
      this._cachedCompiledPatterns = null;
    }
  }
  get debugMatchRegExp() {
    return `${this._match.source}`;
  }
  collectPatterns(grammar, out) {
    out.push(this._match);
  }
  compile(grammar, endRegexSource) {
    return this._getCachedCompiledPatterns(grammar).compile(grammar);
  }
  compileAG(grammar, endRegexSource, allowA, allowG) {
    return this._getCachedCompiledPatterns(grammar).compileAG(grammar, allowA, allowG);
  }
  _getCachedCompiledPatterns(grammar) {
    if (!this._cachedCompiledPatterns) {
      this._cachedCompiledPatterns = new RegExpSourceList();
      this.collectPatterns(grammar, this._cachedCompiledPatterns);
    }
    return this._cachedCompiledPatterns;
  }
};
var IncludeOnlyRule = class extends Rule {
  constructor($location, id, name, contentName, patterns) {
    super($location, id, name, contentName);
    __publicField(this, "hasMissingPatterns");
    __publicField(this, "patterns");
    __publicField(this, "_cachedCompiledPatterns");
    this.patterns = patterns.patterns;
    this.hasMissingPatterns = patterns.hasMissingPatterns;
    this._cachedCompiledPatterns = null;
  }
  dispose() {
    if (this._cachedCompiledPatterns) {
      this._cachedCompiledPatterns.dispose();
      this._cachedCompiledPatterns = null;
    }
  }
  collectPatterns(grammar, out) {
    for (const pattern of this.patterns) {
      const rule = grammar.getRule(pattern);
      rule.collectPatterns(grammar, out);
    }
  }
  compile(grammar, endRegexSource) {
    return this._getCachedCompiledPatterns(grammar).compile(grammar);
  }
  compileAG(grammar, endRegexSource, allowA, allowG) {
    return this._getCachedCompiledPatterns(grammar).compileAG(grammar, allowA, allowG);
  }
  _getCachedCompiledPatterns(grammar) {
    if (!this._cachedCompiledPatterns) {
      this._cachedCompiledPatterns = new RegExpSourceList();
      this.collectPatterns(grammar, this._cachedCompiledPatterns);
    }
    return this._cachedCompiledPatterns;
  }
};
var BeginEndRule = class extends Rule {
  constructor($location, id, name, contentName, begin, beginCaptures, end, endCaptures, applyEndPatternLast, patterns) {
    super($location, id, name, contentName);
    __publicField(this, "_begin");
    __publicField(this, "beginCaptures");
    __publicField(this, "_end");
    __publicField(this, "endHasBackReferences");
    __publicField(this, "endCaptures");
    __publicField(this, "applyEndPatternLast");
    __publicField(this, "hasMissingPatterns");
    __publicField(this, "patterns");
    __publicField(this, "_cachedCompiledPatterns");
    this._begin = new RegExpSource(begin, this.id);
    this.beginCaptures = beginCaptures;
    this._end = new RegExpSource(end ? end : "￿", -1);
    this.endHasBackReferences = this._end.hasBackReferences;
    this.endCaptures = endCaptures;
    this.applyEndPatternLast = applyEndPatternLast || false;
    this.patterns = patterns.patterns;
    this.hasMissingPatterns = patterns.hasMissingPatterns;
    this._cachedCompiledPatterns = null;
  }
  dispose() {
    if (this._cachedCompiledPatterns) {
      this._cachedCompiledPatterns.dispose();
      this._cachedCompiledPatterns = null;
    }
  }
  get debugBeginRegExp() {
    return `${this._begin.source}`;
  }
  get debugEndRegExp() {
    return `${this._end.source}`;
  }
  getEndWithResolvedBackReferences(lineText, captureIndices) {
    return this._end.resolveBackReferences(lineText, captureIndices);
  }
  collectPatterns(grammar, out) {
    out.push(this._begin);
  }
  compile(grammar, endRegexSource) {
    return this._getCachedCompiledPatterns(grammar, endRegexSource).compile(grammar);
  }
  compileAG(grammar, endRegexSource, allowA, allowG) {
    return this._getCachedCompiledPatterns(grammar, endRegexSource).compileAG(grammar, allowA, allowG);
  }
  _getCachedCompiledPatterns(grammar, endRegexSource) {
    if (!this._cachedCompiledPatterns) {
      this._cachedCompiledPatterns = new RegExpSourceList();
      for (const pattern of this.patterns) {
        const rule = grammar.getRule(pattern);
        rule.collectPatterns(grammar, this._cachedCompiledPatterns);
      }
      if (this.applyEndPatternLast) {
        this._cachedCompiledPatterns.push(this._end.hasBackReferences ? this._end.clone() : this._end);
      } else {
        this._cachedCompiledPatterns.unshift(this._end.hasBackReferences ? this._end.clone() : this._end);
      }
    }
    if (this._end.hasBackReferences) {
      if (this.applyEndPatternLast) {
        this._cachedCompiledPatterns.setSource(this._cachedCompiledPatterns.length() - 1, endRegexSource);
      } else {
        this._cachedCompiledPatterns.setSource(0, endRegexSource);
      }
    }
    return this._cachedCompiledPatterns;
  }
};
var BeginWhileRule = class extends Rule {
  constructor($location, id, name, contentName, begin, beginCaptures, _while, whileCaptures, patterns) {
    super($location, id, name, contentName);
    __publicField(this, "_begin");
    __publicField(this, "beginCaptures");
    __publicField(this, "whileCaptures");
    __publicField(this, "_while");
    __publicField(this, "whileHasBackReferences");
    __publicField(this, "hasMissingPatterns");
    __publicField(this, "patterns");
    __publicField(this, "_cachedCompiledPatterns");
    __publicField(this, "_cachedCompiledWhilePatterns");
    this._begin = new RegExpSource(begin, this.id);
    this.beginCaptures = beginCaptures;
    this.whileCaptures = whileCaptures;
    this._while = new RegExpSource(_while, whileRuleId);
    this.whileHasBackReferences = this._while.hasBackReferences;
    this.patterns = patterns.patterns;
    this.hasMissingPatterns = patterns.hasMissingPatterns;
    this._cachedCompiledPatterns = null;
    this._cachedCompiledWhilePatterns = null;
  }
  dispose() {
    if (this._cachedCompiledPatterns) {
      this._cachedCompiledPatterns.dispose();
      this._cachedCompiledPatterns = null;
    }
    if (this._cachedCompiledWhilePatterns) {
      this._cachedCompiledWhilePatterns.dispose();
      this._cachedCompiledWhilePatterns = null;
    }
  }
  get debugBeginRegExp() {
    return `${this._begin.source}`;
  }
  get debugWhileRegExp() {
    return `${this._while.source}`;
  }
  getWhileWithResolvedBackReferences(lineText, captureIndices) {
    return this._while.resolveBackReferences(lineText, captureIndices);
  }
  collectPatterns(grammar, out) {
    out.push(this._begin);
  }
  compile(grammar, endRegexSource) {
    return this._getCachedCompiledPatterns(grammar).compile(grammar);
  }
  compileAG(grammar, endRegexSource, allowA, allowG) {
    return this._getCachedCompiledPatterns(grammar).compileAG(grammar, allowA, allowG);
  }
  _getCachedCompiledPatterns(grammar) {
    if (!this._cachedCompiledPatterns) {
      this._cachedCompiledPatterns = new RegExpSourceList();
      for (const pattern of this.patterns) {
        const rule = grammar.getRule(pattern);
        rule.collectPatterns(grammar, this._cachedCompiledPatterns);
      }
    }
    return this._cachedCompiledPatterns;
  }
  compileWhile(grammar, endRegexSource) {
    return this._getCachedCompiledWhilePatterns(grammar, endRegexSource).compile(grammar);
  }
  compileWhileAG(grammar, endRegexSource, allowA, allowG) {
    return this._getCachedCompiledWhilePatterns(grammar, endRegexSource).compileAG(grammar, allowA, allowG);
  }
  _getCachedCompiledWhilePatterns(grammar, endRegexSource) {
    if (!this._cachedCompiledWhilePatterns) {
      this._cachedCompiledWhilePatterns = new RegExpSourceList();
      this._cachedCompiledWhilePatterns.push(this._while.hasBackReferences ? this._while.clone() : this._while);
    }
    if (this._while.hasBackReferences) {
      this._cachedCompiledWhilePatterns.setSource(0, endRegexSource ? endRegexSource : "￿");
    }
    return this._cachedCompiledWhilePatterns;
  }
};
var RuleFactory = class _RuleFactory {
  static createCaptureRule(helper, $location, name, contentName, retokenizeCapturedWithRuleId) {
    return helper.registerRule((id) => {
      return new CaptureRule($location, id, name, contentName, retokenizeCapturedWithRuleId);
    });
  }
  static getCompiledRuleId(desc, helper, repository) {
    if (!desc.id) {
      helper.registerRule((id) => {
        desc.id = id;
        if (desc.match) {
          return new MatchRule(
            desc.$vscodeTextmateLocation,
            desc.id,
            desc.name,
            desc.match,
            _RuleFactory._compileCaptures(desc.captures, helper, repository)
          );
        }
        if (typeof desc.begin === "undefined") {
          if (desc.repository) {
            repository = mergeObjects({}, repository, desc.repository);
          }
          let patterns = desc.patterns;
          if (typeof patterns === "undefined" && desc.include) {
            patterns = [{ include: desc.include }];
          }
          return new IncludeOnlyRule(
            desc.$vscodeTextmateLocation,
            desc.id,
            desc.name,
            desc.contentName,
            _RuleFactory._compilePatterns(patterns, helper, repository)
          );
        }
        if (desc.while) {
          return new BeginWhileRule(
            desc.$vscodeTextmateLocation,
            desc.id,
            desc.name,
            desc.contentName,
            desc.begin,
            _RuleFactory._compileCaptures(desc.beginCaptures || desc.captures, helper, repository),
            desc.while,
            _RuleFactory._compileCaptures(desc.whileCaptures || desc.captures, helper, repository),
            _RuleFactory._compilePatterns(desc.patterns, helper, repository)
          );
        }
        return new BeginEndRule(
          desc.$vscodeTextmateLocation,
          desc.id,
          desc.name,
          desc.contentName,
          desc.begin,
          _RuleFactory._compileCaptures(desc.beginCaptures || desc.captures, helper, repository),
          desc.end,
          _RuleFactory._compileCaptures(desc.endCaptures || desc.captures, helper, repository),
          desc.applyEndPatternLast,
          _RuleFactory._compilePatterns(desc.patterns, helper, repository)
        );
      });
    }
    return desc.id;
  }
  static _compileCaptures(captures, helper, repository) {
    let r4 = [];
    if (captures) {
      let maximumCaptureId = 0;
      for (const captureId in captures) {
        if (captureId === "$vscodeTextmateLocation") {
          continue;
        }
        const numericCaptureId = parseInt(captureId, 10);
        if (numericCaptureId > maximumCaptureId) {
          maximumCaptureId = numericCaptureId;
        }
      }
      for (let i = 0; i <= maximumCaptureId; i++) {
        r4[i] = null;
      }
      for (const captureId in captures) {
        if (captureId === "$vscodeTextmateLocation") {
          continue;
        }
        const numericCaptureId = parseInt(captureId, 10);
        let retokenizeCapturedWithRuleId = 0;
        if (captures[captureId].patterns) {
          retokenizeCapturedWithRuleId = _RuleFactory.getCompiledRuleId(captures[captureId], helper, repository);
        }
        r4[numericCaptureId] = _RuleFactory.createCaptureRule(helper, captures[captureId].$vscodeTextmateLocation, captures[captureId].name, captures[captureId].contentName, retokenizeCapturedWithRuleId);
      }
    }
    return r4;
  }
  static _compilePatterns(patterns, helper, repository) {
    let r4 = [];
    if (patterns) {
      for (let i = 0, len = patterns.length; i < len; i++) {
        const pattern = patterns[i];
        let ruleId = -1;
        if (pattern.include) {
          const reference = parseInclude(pattern.include);
          switch (reference.kind) {
            case 0:
            case 1:
              ruleId = _RuleFactory.getCompiledRuleId(repository[pattern.include], helper, repository);
              break;
            case 2:
              let localIncludedRule = repository[reference.ruleName];
              if (localIncludedRule) {
                ruleId = _RuleFactory.getCompiledRuleId(localIncludedRule, helper, repository);
              } else {
              }
              break;
            case 3:
            case 4:
              const externalGrammarName = reference.scopeName;
              const externalGrammarInclude = reference.kind === 4 ? reference.ruleName : null;
              const externalGrammar = helper.getExternalGrammar(externalGrammarName, repository);
              if (externalGrammar) {
                if (externalGrammarInclude) {
                  let externalIncludedRule = externalGrammar.repository[externalGrammarInclude];
                  if (externalIncludedRule) {
                    ruleId = _RuleFactory.getCompiledRuleId(externalIncludedRule, helper, externalGrammar.repository);
                  } else {
                  }
                } else {
                  ruleId = _RuleFactory.getCompiledRuleId(externalGrammar.repository.$self, helper, externalGrammar.repository);
                }
              } else {
              }
              break;
          }
        } else {
          ruleId = _RuleFactory.getCompiledRuleId(pattern, helper, repository);
        }
        if (ruleId !== -1) {
          const rule = helper.getRule(ruleId);
          let skipRule = false;
          if (rule instanceof IncludeOnlyRule || rule instanceof BeginEndRule || rule instanceof BeginWhileRule) {
            if (rule.hasMissingPatterns && rule.patterns.length === 0) {
              skipRule = true;
            }
          }
          if (skipRule) {
            continue;
          }
          r4.push(ruleId);
        }
      }
    }
    return {
      patterns: r4,
      hasMissingPatterns: (patterns ? patterns.length : 0) !== r4.length
    };
  }
};
var RegExpSource = class _RegExpSource {
  constructor(regExpSource, ruleId) {
    __publicField(this, "source");
    __publicField(this, "ruleId");
    __publicField(this, "hasAnchor");
    __publicField(this, "hasBackReferences");
    __publicField(this, "_anchorCache");
    if (regExpSource && typeof regExpSource === "string") {
      const len = regExpSource.length;
      let lastPushedPos = 0;
      let output = [];
      let hasAnchor = false;
      for (let pos = 0; pos < len; pos++) {
        const ch = regExpSource.charAt(pos);
        if (ch === "\\") {
          if (pos + 1 < len) {
            const nextCh = regExpSource.charAt(pos + 1);
            if (nextCh === "z") {
              output.push(regExpSource.substring(lastPushedPos, pos));
              output.push("$(?!\\n)(?<!\\n)");
              lastPushedPos = pos + 2;
            } else if (nextCh === "A" || nextCh === "G") {
              hasAnchor = true;
            }
            pos++;
          }
        }
      }
      this.hasAnchor = hasAnchor;
      if (lastPushedPos === 0) {
        this.source = regExpSource;
      } else {
        output.push(regExpSource.substring(lastPushedPos, len));
        this.source = output.join("");
      }
    } else {
      this.hasAnchor = false;
      this.source = regExpSource;
    }
    if (this.hasAnchor) {
      this._anchorCache = this._buildAnchorCache();
    } else {
      this._anchorCache = null;
    }
    this.ruleId = ruleId;
    if (typeof this.source === "string") {
      this.hasBackReferences = HAS_BACK_REFERENCES.test(this.source);
    } else {
      this.hasBackReferences = false;
    }
  }
  clone() {
    return new _RegExpSource(this.source, this.ruleId);
  }
  setSource(newSource) {
    if (this.source === newSource) {
      return;
    }
    this.source = newSource;
    if (this.hasAnchor) {
      this._anchorCache = this._buildAnchorCache();
    }
  }
  resolveBackReferences(lineText, captureIndices) {
    if (typeof this.source !== "string") {
      throw new Error("This method should only be called if the source is a string");
    }
    let capturedValues = captureIndices.map((capture) => {
      return lineText.substring(capture.start, capture.end);
    });
    BACK_REFERENCING_END.lastIndex = 0;
    return this.source.replace(BACK_REFERENCING_END, (match, g1) => {
      return escapeRegExpCharacters(capturedValues[parseInt(g1, 10)] || "");
    });
  }
  _buildAnchorCache() {
    if (typeof this.source !== "string") {
      throw new Error("This method should only be called if the source is a string");
    }
    let A0_G0_result = [];
    let A0_G1_result = [];
    let A1_G0_result = [];
    let A1_G1_result = [];
    let pos, len, ch, nextCh;
    for (pos = 0, len = this.source.length; pos < len; pos++) {
      ch = this.source.charAt(pos);
      A0_G0_result[pos] = ch;
      A0_G1_result[pos] = ch;
      A1_G0_result[pos] = ch;
      A1_G1_result[pos] = ch;
      if (ch === "\\") {
        if (pos + 1 < len) {
          nextCh = this.source.charAt(pos + 1);
          if (nextCh === "A") {
            A0_G0_result[pos + 1] = "￿";
            A0_G1_result[pos + 1] = "￿";
            A1_G0_result[pos + 1] = "A";
            A1_G1_result[pos + 1] = "A";
          } else if (nextCh === "G") {
            A0_G0_result[pos + 1] = "￿";
            A0_G1_result[pos + 1] = "G";
            A1_G0_result[pos + 1] = "￿";
            A1_G1_result[pos + 1] = "G";
          } else {
            A0_G0_result[pos + 1] = nextCh;
            A0_G1_result[pos + 1] = nextCh;
            A1_G0_result[pos + 1] = nextCh;
            A1_G1_result[pos + 1] = nextCh;
          }
          pos++;
        }
      }
    }
    return {
      A0_G0: A0_G0_result.join(""),
      A0_G1: A0_G1_result.join(""),
      A1_G0: A1_G0_result.join(""),
      A1_G1: A1_G1_result.join("")
    };
  }
  resolveAnchors(allowA, allowG) {
    if (!this.hasAnchor || !this._anchorCache || typeof this.source !== "string") {
      return this.source;
    }
    if (allowA) {
      if (allowG) {
        return this._anchorCache.A1_G1;
      } else {
        return this._anchorCache.A1_G0;
      }
    } else {
      if (allowG) {
        return this._anchorCache.A0_G1;
      } else {
        return this._anchorCache.A0_G0;
      }
    }
  }
};
var RegExpSourceList = class {
  constructor() {
    __publicField(this, "_items");
    __publicField(this, "_hasAnchors");
    __publicField(this, "_cached");
    __publicField(this, "_anchorCache");
    this._items = [];
    this._hasAnchors = false;
    this._cached = null;
    this._anchorCache = {
      A0_G0: null,
      A0_G1: null,
      A1_G0: null,
      A1_G1: null
    };
  }
  dispose() {
    this._disposeCaches();
  }
  _disposeCaches() {
    if (this._cached) {
      this._cached.dispose();
      this._cached = null;
    }
    if (this._anchorCache.A0_G0) {
      this._anchorCache.A0_G0.dispose();
      this._anchorCache.A0_G0 = null;
    }
    if (this._anchorCache.A0_G1) {
      this._anchorCache.A0_G1.dispose();
      this._anchorCache.A0_G1 = null;
    }
    if (this._anchorCache.A1_G0) {
      this._anchorCache.A1_G0.dispose();
      this._anchorCache.A1_G0 = null;
    }
    if (this._anchorCache.A1_G1) {
      this._anchorCache.A1_G1.dispose();
      this._anchorCache.A1_G1 = null;
    }
  }
  push(item) {
    this._items.push(item);
    this._hasAnchors = this._hasAnchors || item.hasAnchor;
  }
  unshift(item) {
    this._items.unshift(item);
    this._hasAnchors = this._hasAnchors || item.hasAnchor;
  }
  length() {
    return this._items.length;
  }
  setSource(index, newSource) {
    if (this._items[index].source !== newSource) {
      this._disposeCaches();
      this._items[index].setSource(newSource);
    }
  }
  compile(onigLib) {
    if (!this._cached) {
      let regExps = this._items.map((e) => e.source);
      this._cached = new CompiledRule(onigLib, regExps, this._items.map((e) => e.ruleId));
    }
    return this._cached;
  }
  compileAG(onigLib, allowA, allowG) {
    if (!this._hasAnchors) {
      return this.compile(onigLib);
    } else {
      if (allowA) {
        if (allowG) {
          if (!this._anchorCache.A1_G1) {
            this._anchorCache.A1_G1 = this._resolveAnchors(onigLib, allowA, allowG);
          }
          return this._anchorCache.A1_G1;
        } else {
          if (!this._anchorCache.A1_G0) {
            this._anchorCache.A1_G0 = this._resolveAnchors(onigLib, allowA, allowG);
          }
          return this._anchorCache.A1_G0;
        }
      } else {
        if (allowG) {
          if (!this._anchorCache.A0_G1) {
            this._anchorCache.A0_G1 = this._resolveAnchors(onigLib, allowA, allowG);
          }
          return this._anchorCache.A0_G1;
        } else {
          if (!this._anchorCache.A0_G0) {
            this._anchorCache.A0_G0 = this._resolveAnchors(onigLib, allowA, allowG);
          }
          return this._anchorCache.A0_G0;
        }
      }
    }
  }
  _resolveAnchors(onigLib, allowA, allowG) {
    let regExps = this._items.map((e) => e.resolveAnchors(allowA, allowG));
    return new CompiledRule(onigLib, regExps, this._items.map((e) => e.ruleId));
  }
};
var CompiledRule = class {
  constructor(onigLib, regExps, rules) {
    __publicField(this, "scanner");
    this.regExps = regExps;
    this.rules = rules;
    this.scanner = onigLib.createOnigScanner(regExps);
  }
  dispose() {
    if (typeof this.scanner.dispose === "function") {
      this.scanner.dispose();
    }
  }
  toString() {
    const r4 = [];
    for (let i = 0, len = this.rules.length; i < len; i++) {
      r4.push("   - " + this.rules[i] + ": " + this.regExps[i]);
    }
    return r4.join("\n");
  }
  findNextMatchSync(string, startPosition, options) {
    const result = this.scanner.findNextMatchSync(string, startPosition, options);
    if (!result) {
      return null;
    }
    return {
      ruleId: this.rules[result.index],
      captureIndices: result.captureIndices
    };
  }
};
var BasicScopeAttributes = class {
  constructor(languageId, tokenType) {
    this.languageId = languageId;
    this.tokenType = tokenType;
  }
};
var _a;
var BasicScopeAttributesProvider = (_a = class {
  constructor(initialLanguageId, embeddedLanguages) {
    __publicField(this, "_defaultAttributes");
    __publicField(this, "_embeddedLanguagesMatcher");
    __publicField(this, "_getBasicScopeAttributes", new CachedFn((scopeName) => {
      const languageId = this._scopeToLanguage(scopeName);
      const standardTokenType = this._toStandardTokenType(scopeName);
      return new BasicScopeAttributes(languageId, standardTokenType);
    }));
    this._defaultAttributes = new BasicScopeAttributes(
      initialLanguageId,
      8
      /* NotSet */
    );
    this._embeddedLanguagesMatcher = new ScopeMatcher(Object.entries(embeddedLanguages || {}));
  }
  getDefaultAttributes() {
    return this._defaultAttributes;
  }
  getBasicScopeAttributes(scopeName) {
    if (scopeName === null) {
      return _a._NULL_SCOPE_METADATA;
    }
    return this._getBasicScopeAttributes.get(scopeName);
  }
  /**
   * Given a produced TM scope, return the language that token describes or null if unknown.
   * e.g. source.html => html, source.css.embedded.html => css, punctuation.definition.tag.html => null
   */
  _scopeToLanguage(scope) {
    return this._embeddedLanguagesMatcher.match(scope) || 0;
  }
  _toStandardTokenType(scopeName) {
    const m = scopeName.match(_a.STANDARD_TOKEN_TYPE_REGEXP);
    if (!m) {
      return 8;
    }
    switch (m[1]) {
      case "comment":
        return 1;
      case "string":
        return 2;
      case "regex":
        return 3;
      case "meta.embedded":
        return 0;
    }
    throw new Error("Unexpected match for standard token type!");
  }
}, __publicField(_a, "_NULL_SCOPE_METADATA", new BasicScopeAttributes(0, 0)), __publicField(_a, "STANDARD_TOKEN_TYPE_REGEXP", /\b(comment|string|regex|meta\.embedded)\b/), _a);
var ScopeMatcher = class {
  constructor(values) {
    __publicField(this, "values");
    __publicField(this, "scopesRegExp");
    if (values.length === 0) {
      this.values = null;
      this.scopesRegExp = null;
    } else {
      this.values = new Map(values);
      const escapedScopes = values.map(
        ([scopeName, value]) => escapeRegExpCharacters(scopeName)
      );
      escapedScopes.sort();
      escapedScopes.reverse();
      this.scopesRegExp = new RegExp(
        `^((${escapedScopes.join(")|(")}))($|\\.)`,
        ""
      );
    }
  }
  match(scope) {
    if (!this.scopesRegExp) {
      return void 0;
    }
    const m = scope.match(this.scopesRegExp);
    if (!m) {
      return void 0;
    }
    return this.values.get(m[1]);
  }
};
var DebugFlags = {
  InDebugMode: typeof process !== "undefined" && !!process.env["VSCODE_TEXTMATE_DEBUG"]
};
var UseOnigurumaFindOptions = false;
var TokenizeStringResult = class {
  constructor(stack, stoppedEarly) {
    this.stack = stack;
    this.stoppedEarly = stoppedEarly;
  }
};
function _tokenizeString(grammar, lineText, isFirstLine, linePos, stack, lineTokens, checkWhileConditions, timeLimit) {
  const lineLength = lineText.content.length;
  let STOP = false;
  let anchorPosition = -1;
  if (checkWhileConditions) {
    const whileCheckResult = _checkWhileConditions(
      grammar,
      lineText,
      isFirstLine,
      linePos,
      stack,
      lineTokens
    );
    stack = whileCheckResult.stack;
    linePos = whileCheckResult.linePos;
    isFirstLine = whileCheckResult.isFirstLine;
    anchorPosition = whileCheckResult.anchorPosition;
  }
  const startTime = Date.now();
  while (!STOP) {
    if (timeLimit !== 0) {
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > timeLimit) {
        return new TokenizeStringResult(stack, true);
      }
    }
    scanNext();
  }
  return new TokenizeStringResult(stack, false);
  function scanNext() {
    if (false) {
      console.log("");
      console.log(
        `@@scanNext ${linePos}: |${lineText.content.substr(linePos).replace(/\n$/, "\\n")}|`
      );
    }
    const r4 = matchRuleOrInjections(
      grammar,
      lineText,
      isFirstLine,
      linePos,
      stack,
      anchorPosition
    );
    if (!r4) {
      lineTokens.produce(stack, lineLength);
      STOP = true;
      return;
    }
    const captureIndices = r4.captureIndices;
    const matchedRuleId = r4.matchedRuleId;
    const hasAdvanced = captureIndices && captureIndices.length > 0 ? captureIndices[0].end > linePos : false;
    if (matchedRuleId === endRuleId) {
      const poppedRule = stack.getRule(grammar);
      if (false) {
        console.log(
          "  popping " + poppedRule.debugName + " - " + poppedRule.debugEndRegExp
        );
      }
      lineTokens.produce(stack, captureIndices[0].start);
      stack = stack.withContentNameScopesList(stack.nameScopesList);
      handleCaptures(
        grammar,
        lineText,
        isFirstLine,
        stack,
        lineTokens,
        poppedRule.endCaptures,
        captureIndices
      );
      lineTokens.produce(stack, captureIndices[0].end);
      const popped = stack;
      stack = stack.parent;
      anchorPosition = popped.getAnchorPos();
      if (!hasAdvanced && popped.getEnterPos() === linePos) {
        if (false) {
          console.error(
            "[1] - Grammar is in an endless loop - Grammar pushed & popped a rule without advancing"
          );
        }
        stack = popped;
        lineTokens.produce(stack, lineLength);
        STOP = true;
        return;
      }
    } else {
      const _rule = grammar.getRule(matchedRuleId);
      lineTokens.produce(stack, captureIndices[0].start);
      const beforePush = stack;
      const scopeName = _rule.getName(lineText.content, captureIndices);
      const nameScopesList = stack.contentNameScopesList.pushAttributed(
        scopeName,
        grammar
      );
      stack = stack.push(
        matchedRuleId,
        linePos,
        anchorPosition,
        captureIndices[0].end === lineLength,
        null,
        nameScopesList,
        nameScopesList
      );
      if (_rule instanceof BeginEndRule) {
        const pushedRule = _rule;
        if (false) {
          console.log(
            "  pushing " + pushedRule.debugName + " - " + pushedRule.debugBeginRegExp
          );
        }
        handleCaptures(
          grammar,
          lineText,
          isFirstLine,
          stack,
          lineTokens,
          pushedRule.beginCaptures,
          captureIndices
        );
        lineTokens.produce(stack, captureIndices[0].end);
        anchorPosition = captureIndices[0].end;
        const contentName = pushedRule.getContentName(
          lineText.content,
          captureIndices
        );
        const contentNameScopesList = nameScopesList.pushAttributed(
          contentName,
          grammar
        );
        stack = stack.withContentNameScopesList(contentNameScopesList);
        if (pushedRule.endHasBackReferences) {
          stack = stack.withEndRule(
            pushedRule.getEndWithResolvedBackReferences(
              lineText.content,
              captureIndices
            )
          );
        }
        if (!hasAdvanced && beforePush.hasSameRuleAs(stack)) {
          if (false) {
            console.error(
              "[2] - Grammar is in an endless loop - Grammar pushed the same rule without advancing"
            );
          }
          stack = stack.pop();
          lineTokens.produce(stack, lineLength);
          STOP = true;
          return;
        }
      } else if (_rule instanceof BeginWhileRule) {
        const pushedRule = _rule;
        if (false) {
          console.log("  pushing " + pushedRule.debugName);
        }
        handleCaptures(
          grammar,
          lineText,
          isFirstLine,
          stack,
          lineTokens,
          pushedRule.beginCaptures,
          captureIndices
        );
        lineTokens.produce(stack, captureIndices[0].end);
        anchorPosition = captureIndices[0].end;
        const contentName = pushedRule.getContentName(
          lineText.content,
          captureIndices
        );
        const contentNameScopesList = nameScopesList.pushAttributed(
          contentName,
          grammar
        );
        stack = stack.withContentNameScopesList(contentNameScopesList);
        if (pushedRule.whileHasBackReferences) {
          stack = stack.withEndRule(
            pushedRule.getWhileWithResolvedBackReferences(
              lineText.content,
              captureIndices
            )
          );
        }
        if (!hasAdvanced && beforePush.hasSameRuleAs(stack)) {
          if (false) {
            console.error(
              "[3] - Grammar is in an endless loop - Grammar pushed the same rule without advancing"
            );
          }
          stack = stack.pop();
          lineTokens.produce(stack, lineLength);
          STOP = true;
          return;
        }
      } else {
        const matchingRule = _rule;
        if (false) {
          console.log(
            "  matched " + matchingRule.debugName + " - " + matchingRule.debugMatchRegExp
          );
        }
        handleCaptures(
          grammar,
          lineText,
          isFirstLine,
          stack,
          lineTokens,
          matchingRule.captures,
          captureIndices
        );
        lineTokens.produce(stack, captureIndices[0].end);
        stack = stack.pop();
        if (!hasAdvanced) {
          if (false) {
            console.error(
              "[4] - Grammar is in an endless loop - Grammar is not advancing, nor is it pushing/popping"
            );
          }
          stack = stack.safePop();
          lineTokens.produce(stack, lineLength);
          STOP = true;
          return;
        }
      }
    }
    if (captureIndices[0].end > linePos) {
      linePos = captureIndices[0].end;
      isFirstLine = false;
    }
  }
}
function _checkWhileConditions(grammar, lineText, isFirstLine, linePos, stack, lineTokens) {
  let anchorPosition = stack.beginRuleCapturedEOL ? 0 : -1;
  const whileRules = [];
  for (let node = stack; node; node = node.pop()) {
    const nodeRule = node.getRule(grammar);
    if (nodeRule instanceof BeginWhileRule) {
      whileRules.push({
        rule: nodeRule,
        stack: node
      });
    }
  }
  for (let whileRule = whileRules.pop(); whileRule; whileRule = whileRules.pop()) {
    const { ruleScanner, findOptions } = prepareRuleWhileSearch(whileRule.rule, grammar, whileRule.stack.endRule, isFirstLine, linePos === anchorPosition);
    const r4 = ruleScanner.findNextMatchSync(lineText, linePos, findOptions);
    if (false) {
      console.log("  scanning for while rule");
      console.log(ruleScanner.toString());
    }
    if (r4) {
      const matchedRuleId = r4.ruleId;
      if (matchedRuleId !== whileRuleId) {
        stack = whileRule.stack.pop();
        break;
      }
      if (r4.captureIndices && r4.captureIndices.length) {
        lineTokens.produce(whileRule.stack, r4.captureIndices[0].start);
        handleCaptures(grammar, lineText, isFirstLine, whileRule.stack, lineTokens, whileRule.rule.whileCaptures, r4.captureIndices);
        lineTokens.produce(whileRule.stack, r4.captureIndices[0].end);
        anchorPosition = r4.captureIndices[0].end;
        if (r4.captureIndices[0].end > linePos) {
          linePos = r4.captureIndices[0].end;
          isFirstLine = false;
        }
      }
    } else {
      if (false) {
        console.log("  popping " + whileRule.rule.debugName + " - " + whileRule.rule.debugWhileRegExp);
      }
      stack = whileRule.stack.pop();
      break;
    }
  }
  return { stack, linePos, anchorPosition, isFirstLine };
}
function matchRuleOrInjections(grammar, lineText, isFirstLine, linePos, stack, anchorPosition) {
  const matchResult = matchRule(grammar, lineText, isFirstLine, linePos, stack, anchorPosition);
  const injections = grammar.getInjections();
  if (injections.length === 0) {
    return matchResult;
  }
  const injectionResult = matchInjections(injections, grammar, lineText, isFirstLine, linePos, stack, anchorPosition);
  if (!injectionResult) {
    return matchResult;
  }
  if (!matchResult) {
    return injectionResult;
  }
  const matchResultScore = matchResult.captureIndices[0].start;
  const injectionResultScore = injectionResult.captureIndices[0].start;
  if (injectionResultScore < matchResultScore || injectionResult.priorityMatch && injectionResultScore === matchResultScore) {
    return injectionResult;
  }
  return matchResult;
}
function matchRule(grammar, lineText, isFirstLine, linePos, stack, anchorPosition) {
  const rule = stack.getRule(grammar);
  const { ruleScanner, findOptions } = prepareRuleSearch(rule, grammar, stack.endRule, isFirstLine, linePos === anchorPosition);
  const r4 = ruleScanner.findNextMatchSync(lineText, linePos, findOptions);
  if (r4) {
    return {
      captureIndices: r4.captureIndices,
      matchedRuleId: r4.ruleId
    };
  }
  return null;
}
function matchInjections(injections, grammar, lineText, isFirstLine, linePos, stack, anchorPosition) {
  let bestMatchRating = Number.MAX_VALUE;
  let bestMatchCaptureIndices = null;
  let bestMatchRuleId;
  let bestMatchResultPriority = 0;
  const scopes = stack.contentNameScopesList.getScopeNames();
  for (let i = 0, len = injections.length; i < len; i++) {
    const injection = injections[i];
    if (!injection.matcher(scopes)) {
      continue;
    }
    const rule = grammar.getRule(injection.ruleId);
    const { ruleScanner, findOptions } = prepareRuleSearch(rule, grammar, null, isFirstLine, linePos === anchorPosition);
    const matchResult = ruleScanner.findNextMatchSync(lineText, linePos, findOptions);
    if (!matchResult) {
      continue;
    }
    if (false) {
      console.log(`  matched injection: ${injection.debugSelector}`);
      console.log(ruleScanner.toString());
    }
    const matchRating = matchResult.captureIndices[0].start;
    if (matchRating >= bestMatchRating) {
      continue;
    }
    bestMatchRating = matchRating;
    bestMatchCaptureIndices = matchResult.captureIndices;
    bestMatchRuleId = matchResult.ruleId;
    bestMatchResultPriority = injection.priority;
    if (bestMatchRating === linePos) {
      break;
    }
  }
  if (bestMatchCaptureIndices) {
    return {
      priorityMatch: bestMatchResultPriority === -1,
      captureIndices: bestMatchCaptureIndices,
      matchedRuleId: bestMatchRuleId
    };
  }
  return null;
}
function prepareRuleSearch(rule, grammar, endRegexSource, allowA, allowG) {
  if (UseOnigurumaFindOptions) {
    const ruleScanner2 = rule.compile(grammar, endRegexSource);
    const findOptions = getFindOptions(allowA, allowG);
    return { ruleScanner: ruleScanner2, findOptions };
  }
  const ruleScanner = rule.compileAG(grammar, endRegexSource, allowA, allowG);
  return {
    ruleScanner,
    findOptions: 0
    /* None */
  };
}
function prepareRuleWhileSearch(rule, grammar, endRegexSource, allowA, allowG) {
  if (UseOnigurumaFindOptions) {
    const ruleScanner2 = rule.compileWhile(grammar, endRegexSource);
    const findOptions = getFindOptions(allowA, allowG);
    return { ruleScanner: ruleScanner2, findOptions };
  }
  const ruleScanner = rule.compileWhileAG(grammar, endRegexSource, allowA, allowG);
  return {
    ruleScanner,
    findOptions: 0
    /* None */
  };
}
function getFindOptions(allowA, allowG) {
  let options = 0;
  if (!allowA) {
    options |= 1;
  }
  if (!allowG) {
    options |= 4;
  }
  return options;
}
function handleCaptures(grammar, lineText, isFirstLine, stack, lineTokens, captures, captureIndices) {
  if (captures.length === 0) {
    return;
  }
  const lineTextContent = lineText.content;
  const len = Math.min(captures.length, captureIndices.length);
  const localStack = [];
  const maxEnd = captureIndices[0].end;
  for (let i = 0; i < len; i++) {
    const captureRule = captures[i];
    if (captureRule === null) {
      continue;
    }
    const captureIndex = captureIndices[i];
    if (captureIndex.length === 0) {
      continue;
    }
    if (captureIndex.start > maxEnd) {
      break;
    }
    while (localStack.length > 0 && localStack[localStack.length - 1].endPos <= captureIndex.start) {
      lineTokens.produceFromScopes(localStack[localStack.length - 1].scopes, localStack[localStack.length - 1].endPos);
      localStack.pop();
    }
    if (localStack.length > 0) {
      lineTokens.produceFromScopes(localStack[localStack.length - 1].scopes, captureIndex.start);
    } else {
      lineTokens.produce(stack, captureIndex.start);
    }
    if (captureRule.retokenizeCapturedWithRuleId) {
      const scopeName = captureRule.getName(lineTextContent, captureIndices);
      const nameScopesList = stack.contentNameScopesList.pushAttributed(scopeName, grammar);
      const contentName = captureRule.getContentName(lineTextContent, captureIndices);
      const contentNameScopesList = nameScopesList.pushAttributed(contentName, grammar);
      const stackClone = stack.push(captureRule.retokenizeCapturedWithRuleId, captureIndex.start, -1, false, null, nameScopesList, contentNameScopesList);
      const onigSubStr = grammar.createOnigString(lineTextContent.substring(0, captureIndex.end));
      _tokenizeString(
        grammar,
        onigSubStr,
        isFirstLine && captureIndex.start === 0,
        captureIndex.start,
        stackClone,
        lineTokens,
        false,
        /* no time limit */
        0
      );
      disposeOnigString(onigSubStr);
      continue;
    }
    const captureRuleScopeName = captureRule.getName(lineTextContent, captureIndices);
    if (captureRuleScopeName !== null) {
      const base = localStack.length > 0 ? localStack[localStack.length - 1].scopes : stack.contentNameScopesList;
      const captureRuleScopesList = base.pushAttributed(captureRuleScopeName, grammar);
      localStack.push(new LocalStackElement(captureRuleScopesList, captureIndex.end));
    }
  }
  while (localStack.length > 0) {
    lineTokens.produceFromScopes(localStack[localStack.length - 1].scopes, localStack[localStack.length - 1].endPos);
    localStack.pop();
  }
}
var LocalStackElement = class {
  constructor(scopes, endPos) {
    __publicField(this, "scopes");
    __publicField(this, "endPos");
    this.scopes = scopes;
    this.endPos = endPos;
  }
};
function createGrammar(scopeName, grammar, initialLanguage, embeddedLanguages, tokenTypes, balancedBracketSelectors, grammarRepository, onigLib) {
  return new Grammar(
    scopeName,
    grammar,
    initialLanguage,
    embeddedLanguages,
    tokenTypes,
    balancedBracketSelectors,
    grammarRepository,
    onigLib
  );
}
function collectInjections(result, selector, rule, ruleFactoryHelper, grammar) {
  const matchers = createMatchers(selector, nameMatcher);
  const ruleId = RuleFactory.getCompiledRuleId(rule, ruleFactoryHelper, grammar.repository);
  for (const matcher of matchers) {
    result.push({
      debugSelector: selector,
      matcher: matcher.matcher,
      ruleId,
      grammar,
      priority: matcher.priority
    });
  }
}
function nameMatcher(identifers, scopes) {
  if (scopes.length < identifers.length) {
    return false;
  }
  let lastIndex = 0;
  return identifers.every((identifier) => {
    for (let i = lastIndex; i < scopes.length; i++) {
      if (scopesAreMatching(scopes[i], identifier)) {
        lastIndex = i + 1;
        return true;
      }
    }
    return false;
  });
}
function scopesAreMatching(thisScopeName, scopeName) {
  if (!thisScopeName) {
    return false;
  }
  if (thisScopeName === scopeName) {
    return true;
  }
  const len = scopeName.length;
  return thisScopeName.length > len && thisScopeName.substr(0, len) === scopeName && thisScopeName[len] === ".";
}
var Grammar = class {
  constructor(_rootScopeName, grammar, initialLanguage, embeddedLanguages, tokenTypes, balancedBracketSelectors, grammarRepository, _onigLib) {
    __publicField(this, "_rootId");
    __publicField(this, "_lastRuleId");
    __publicField(this, "_ruleId2desc");
    __publicField(this, "_includedGrammars");
    __publicField(this, "_grammarRepository");
    __publicField(this, "_grammar");
    __publicField(this, "_injections");
    __publicField(this, "_basicScopeAttributesProvider");
    __publicField(this, "_tokenTypeMatchers");
    this._rootScopeName = _rootScopeName;
    this.balancedBracketSelectors = balancedBracketSelectors;
    this._onigLib = _onigLib;
    this._basicScopeAttributesProvider = new BasicScopeAttributesProvider(
      initialLanguage,
      embeddedLanguages
    );
    this._rootId = -1;
    this._lastRuleId = 0;
    this._ruleId2desc = [null];
    this._includedGrammars = {};
    this._grammarRepository = grammarRepository;
    this._grammar = initGrammar(grammar, null);
    this._injections = null;
    this._tokenTypeMatchers = [];
    if (tokenTypes) {
      for (const selector of Object.keys(tokenTypes)) {
        const matchers = createMatchers(selector, nameMatcher);
        for (const matcher of matchers) {
          this._tokenTypeMatchers.push({
            matcher: matcher.matcher,
            type: tokenTypes[selector]
          });
        }
      }
    }
  }
  get themeProvider() {
    return this._grammarRepository;
  }
  dispose() {
    for (const rule of this._ruleId2desc) {
      if (rule) {
        rule.dispose();
      }
    }
  }
  createOnigScanner(sources) {
    return this._onigLib.createOnigScanner(sources);
  }
  createOnigString(sources) {
    return this._onigLib.createOnigString(sources);
  }
  getMetadataForScope(scope) {
    return this._basicScopeAttributesProvider.getBasicScopeAttributes(scope);
  }
  _collectInjections() {
    const grammarRepository = {
      lookup: (scopeName2) => {
        if (scopeName2 === this._rootScopeName) {
          return this._grammar;
        }
        return this.getExternalGrammar(scopeName2);
      },
      injections: (scopeName2) => {
        return this._grammarRepository.injections(scopeName2);
      }
    };
    const result = [];
    const scopeName = this._rootScopeName;
    const grammar = grammarRepository.lookup(scopeName);
    if (grammar) {
      const rawInjections = grammar.injections;
      if (rawInjections) {
        for (let expression in rawInjections) {
          collectInjections(
            result,
            expression,
            rawInjections[expression],
            this,
            grammar
          );
        }
      }
      const injectionScopeNames = this._grammarRepository.injections(scopeName);
      if (injectionScopeNames) {
        injectionScopeNames.forEach((injectionScopeName) => {
          const injectionGrammar = this.getExternalGrammar(injectionScopeName);
          if (injectionGrammar) {
            const selector = injectionGrammar.injectionSelector;
            if (selector) {
              collectInjections(
                result,
                selector,
                injectionGrammar,
                this,
                injectionGrammar
              );
            }
          }
        });
      }
    }
    result.sort((i1, i2) => i1.priority - i2.priority);
    return result;
  }
  getInjections() {
    if (this._injections === null) {
      this._injections = this._collectInjections();
    }
    return this._injections;
  }
  registerRule(factory) {
    const id = ++this._lastRuleId;
    const result = factory(ruleIdFromNumber(id));
    this._ruleId2desc[id] = result;
    return result;
  }
  getRule(ruleId) {
    return this._ruleId2desc[ruleIdToNumber(ruleId)];
  }
  getExternalGrammar(scopeName, repository) {
    if (this._includedGrammars[scopeName]) {
      return this._includedGrammars[scopeName];
    } else if (this._grammarRepository) {
      const rawIncludedGrammar = this._grammarRepository.lookup(scopeName);
      if (rawIncludedGrammar) {
        this._includedGrammars[scopeName] = initGrammar(
          rawIncludedGrammar,
          repository && repository.$base
        );
        return this._includedGrammars[scopeName];
      }
    }
    return void 0;
  }
  tokenizeLine(lineText, prevState, timeLimit = 0) {
    const r4 = this._tokenize(lineText, prevState, false, timeLimit);
    return {
      tokens: r4.lineTokens.getResult(r4.ruleStack, r4.lineLength),
      ruleStack: r4.ruleStack,
      stoppedEarly: r4.stoppedEarly
    };
  }
  tokenizeLine2(lineText, prevState, timeLimit = 0) {
    const r4 = this._tokenize(lineText, prevState, true, timeLimit);
    return {
      tokens: r4.lineTokens.getBinaryResult(r4.ruleStack, r4.lineLength),
      ruleStack: r4.ruleStack,
      stoppedEarly: r4.stoppedEarly
    };
  }
  _tokenize(lineText, prevState, emitBinaryTokens, timeLimit) {
    if (this._rootId === -1) {
      this._rootId = RuleFactory.getCompiledRuleId(
        this._grammar.repository.$self,
        this,
        this._grammar.repository
      );
      this.getInjections();
    }
    let isFirstLine;
    if (!prevState || prevState === StateStackImpl.NULL) {
      isFirstLine = true;
      const rawDefaultMetadata = this._basicScopeAttributesProvider.getDefaultAttributes();
      const defaultStyle = this.themeProvider.getDefaults();
      const defaultMetadata = EncodedTokenMetadata.set(
        0,
        rawDefaultMetadata.languageId,
        rawDefaultMetadata.tokenType,
        null,
        defaultStyle.fontStyle,
        defaultStyle.foregroundId,
        defaultStyle.backgroundId
      );
      const rootScopeName = this.getRule(this._rootId).getName(
        null,
        null
      );
      let scopeList;
      if (rootScopeName) {
        scopeList = AttributedScopeStack.createRootAndLookUpScopeName(
          rootScopeName,
          defaultMetadata,
          this
        );
      } else {
        scopeList = AttributedScopeStack.createRoot(
          "unknown",
          defaultMetadata
        );
      }
      prevState = new StateStackImpl(
        null,
        this._rootId,
        -1,
        -1,
        false,
        null,
        scopeList,
        scopeList
      );
    } else {
      isFirstLine = false;
      prevState.reset();
    }
    lineText = lineText + "\n";
    const onigLineText = this.createOnigString(lineText);
    const lineLength = onigLineText.content.length;
    const lineTokens = new LineTokens(
      emitBinaryTokens,
      lineText,
      this._tokenTypeMatchers,
      this.balancedBracketSelectors
    );
    const r4 = _tokenizeString(
      this,
      onigLineText,
      isFirstLine,
      0,
      prevState,
      lineTokens,
      true,
      timeLimit
    );
    disposeOnigString(onigLineText);
    return {
      lineLength,
      lineTokens,
      ruleStack: r4.stack,
      stoppedEarly: r4.stoppedEarly
    };
  }
};
function initGrammar(grammar, base) {
  grammar = clone(grammar);
  grammar.repository = grammar.repository || {};
  grammar.repository.$self = {
    $vscodeTextmateLocation: grammar.$vscodeTextmateLocation,
    patterns: grammar.patterns,
    name: grammar.scopeName
  };
  grammar.repository.$base = base || grammar.repository.$self;
  return grammar;
}
var AttributedScopeStack = class _AttributedScopeStack {
  /**
   * Invariant:
   * ```
   * if (parent && !scopePath.extends(parent.scopePath)) {
   * 	throw new Error();
   * }
   * ```
   */
  constructor(parent, scopePath, tokenAttributes) {
    this.parent = parent;
    this.scopePath = scopePath;
    this.tokenAttributes = tokenAttributes;
  }
  static fromExtension(namesScopeList, contentNameScopesList) {
    let current = namesScopeList;
    let scopeNames = (namesScopeList == null ? void 0 : namesScopeList.scopePath) ?? null;
    for (const frame of contentNameScopesList) {
      scopeNames = ScopeStack.push(scopeNames, frame.scopeNames);
      current = new _AttributedScopeStack(current, scopeNames, frame.encodedTokenAttributes);
    }
    return current;
  }
  static createRoot(scopeName, tokenAttributes) {
    return new _AttributedScopeStack(null, new ScopeStack(null, scopeName), tokenAttributes);
  }
  static createRootAndLookUpScopeName(scopeName, tokenAttributes, grammar) {
    const rawRootMetadata = grammar.getMetadataForScope(scopeName);
    const scopePath = new ScopeStack(null, scopeName);
    const rootStyle = grammar.themeProvider.themeMatch(scopePath);
    const resolvedTokenAttributes = _AttributedScopeStack.mergeAttributes(
      tokenAttributes,
      rawRootMetadata,
      rootStyle
    );
    return new _AttributedScopeStack(null, scopePath, resolvedTokenAttributes);
  }
  get scopeName() {
    return this.scopePath.scopeName;
  }
  toString() {
    return this.getScopeNames().join(" ");
  }
  equals(other) {
    return _AttributedScopeStack.equals(this, other);
  }
  static equals(a, b) {
    do {
      if (a === b) {
        return true;
      }
      if (!a && !b) {
        return true;
      }
      if (!a || !b) {
        return false;
      }
      if (a.scopeName !== b.scopeName || a.tokenAttributes !== b.tokenAttributes) {
        return false;
      }
      a = a.parent;
      b = b.parent;
    } while (true);
  }
  static mergeAttributes(existingTokenAttributes, basicScopeAttributes, styleAttributes) {
    let fontStyle = -1;
    let foreground = 0;
    let background = 0;
    if (styleAttributes !== null) {
      fontStyle = styleAttributes.fontStyle;
      foreground = styleAttributes.foregroundId;
      background = styleAttributes.backgroundId;
    }
    return EncodedTokenMetadata.set(
      existingTokenAttributes,
      basicScopeAttributes.languageId,
      basicScopeAttributes.tokenType,
      null,
      fontStyle,
      foreground,
      background
    );
  }
  pushAttributed(scopePath, grammar) {
    if (scopePath === null) {
      return this;
    }
    if (scopePath.indexOf(" ") === -1) {
      return _AttributedScopeStack._pushAttributed(this, scopePath, grammar);
    }
    const scopes = scopePath.split(/ /g);
    let result = this;
    for (const scope of scopes) {
      result = _AttributedScopeStack._pushAttributed(result, scope, grammar);
    }
    return result;
  }
  static _pushAttributed(target, scopeName, grammar) {
    const rawMetadata = grammar.getMetadataForScope(scopeName);
    const newPath = target.scopePath.push(scopeName);
    const scopeThemeMatchResult = grammar.themeProvider.themeMatch(newPath);
    const metadata = _AttributedScopeStack.mergeAttributes(
      target.tokenAttributes,
      rawMetadata,
      scopeThemeMatchResult
    );
    return new _AttributedScopeStack(target, newPath, metadata);
  }
  getScopeNames() {
    return this.scopePath.getSegments();
  }
  getExtensionIfDefined(base) {
    var _a4;
    const result = [];
    let self = this;
    while (self && self !== base) {
      result.push({
        encodedTokenAttributes: self.tokenAttributes,
        scopeNames: self.scopePath.getExtensionIfDefined(((_a4 = self.parent) == null ? void 0 : _a4.scopePath) ?? null)
      });
      self = self.parent;
    }
    return self === base ? result.reverse() : void 0;
  }
};
var _a2;
var StateStackImpl = (_a2 = class {
  /**
   * Invariant:
   * ```
   * if (contentNameScopesList !== nameScopesList && contentNameScopesList?.parent !== nameScopesList) {
   * 	throw new Error();
   * }
   * if (this.parent && !nameScopesList.extends(this.parent.contentNameScopesList)) {
   * 	throw new Error();
   * }
   * ```
   */
  constructor(parent, ruleId, enterPos, anchorPos, beginRuleCapturedEOL, endRule, nameScopesList, contentNameScopesList) {
    __publicField(this, "_stackElementBrand");
    /**
     * The position on the current line where this state was pushed.
     * This is relevant only while tokenizing a line, to detect endless loops.
     * Its value is meaningless across lines.
     */
    __publicField(this, "_enterPos");
    /**
     * The captured anchor position when this stack element was pushed.
     * This is relevant only while tokenizing a line, to restore the anchor position when popping.
     * Its value is meaningless across lines.
     */
    __publicField(this, "_anchorPos");
    /**
     * The depth of the stack.
     */
    __publicField(this, "depth");
    this.parent = parent;
    this.ruleId = ruleId;
    this.beginRuleCapturedEOL = beginRuleCapturedEOL;
    this.endRule = endRule;
    this.nameScopesList = nameScopesList;
    this.contentNameScopesList = contentNameScopesList;
    this.depth = this.parent ? this.parent.depth + 1 : 1;
    this._enterPos = enterPos;
    this._anchorPos = anchorPos;
  }
  equals(other) {
    if (other === null) {
      return false;
    }
    return _a2._equals(this, other);
  }
  static _equals(a, b) {
    if (a === b) {
      return true;
    }
    if (!this._structuralEquals(a, b)) {
      return false;
    }
    return AttributedScopeStack.equals(a.contentNameScopesList, b.contentNameScopesList);
  }
  /**
   * A structural equals check. Does not take into account `scopes`.
   */
  static _structuralEquals(a, b) {
    do {
      if (a === b) {
        return true;
      }
      if (!a && !b) {
        return true;
      }
      if (!a || !b) {
        return false;
      }
      if (a.depth !== b.depth || a.ruleId !== b.ruleId || a.endRule !== b.endRule) {
        return false;
      }
      a = a.parent;
      b = b.parent;
    } while (true);
  }
  clone() {
    return this;
  }
  static _reset(el) {
    while (el) {
      el._enterPos = -1;
      el._anchorPos = -1;
      el = el.parent;
    }
  }
  reset() {
    _a2._reset(this);
  }
  pop() {
    return this.parent;
  }
  safePop() {
    if (this.parent) {
      return this.parent;
    }
    return this;
  }
  push(ruleId, enterPos, anchorPos, beginRuleCapturedEOL, endRule, nameScopesList, contentNameScopesList) {
    return new _a2(
      this,
      ruleId,
      enterPos,
      anchorPos,
      beginRuleCapturedEOL,
      endRule,
      nameScopesList,
      contentNameScopesList
    );
  }
  getEnterPos() {
    return this._enterPos;
  }
  getAnchorPos() {
    return this._anchorPos;
  }
  getRule(grammar) {
    return grammar.getRule(this.ruleId);
  }
  toString() {
    const r4 = [];
    this._writeString(r4, 0);
    return "[" + r4.join(",") + "]";
  }
  _writeString(res, outIndex) {
    var _a4, _b;
    if (this.parent) {
      outIndex = this.parent._writeString(res, outIndex);
    }
    res[outIndex++] = `(${this.ruleId}, ${(_a4 = this.nameScopesList) == null ? void 0 : _a4.toString()}, ${(_b = this.contentNameScopesList) == null ? void 0 : _b.toString()})`;
    return outIndex;
  }
  withContentNameScopesList(contentNameScopeStack) {
    if (this.contentNameScopesList === contentNameScopeStack) {
      return this;
    }
    return this.parent.push(
      this.ruleId,
      this._enterPos,
      this._anchorPos,
      this.beginRuleCapturedEOL,
      this.endRule,
      this.nameScopesList,
      contentNameScopeStack
    );
  }
  withEndRule(endRule) {
    if (this.endRule === endRule) {
      return this;
    }
    return new _a2(
      this.parent,
      this.ruleId,
      this._enterPos,
      this._anchorPos,
      this.beginRuleCapturedEOL,
      endRule,
      this.nameScopesList,
      this.contentNameScopesList
    );
  }
  // Used to warn of endless loops
  hasSameRuleAs(other) {
    let el = this;
    while (el && el._enterPos === other._enterPos) {
      if (el.ruleId === other.ruleId) {
        return true;
      }
      el = el.parent;
    }
    return false;
  }
  toStateStackFrame() {
    var _a4, _b, _c;
    return {
      ruleId: ruleIdToNumber(this.ruleId),
      beginRuleCapturedEOL: this.beginRuleCapturedEOL,
      endRule: this.endRule,
      nameScopesList: ((_b = this.nameScopesList) == null ? void 0 : _b.getExtensionIfDefined(((_a4 = this.parent) == null ? void 0 : _a4.nameScopesList) ?? null)) ?? [],
      contentNameScopesList: ((_c = this.contentNameScopesList) == null ? void 0 : _c.getExtensionIfDefined(this.nameScopesList)) ?? []
    };
  }
  static pushFrame(self, frame) {
    const namesScopeList = AttributedScopeStack.fromExtension((self == null ? void 0 : self.nameScopesList) ?? null, frame.nameScopesList);
    return new _a2(
      self,
      ruleIdFromNumber(frame.ruleId),
      frame.enterPos ?? -1,
      frame.anchorPos ?? -1,
      frame.beginRuleCapturedEOL,
      frame.endRule,
      namesScopeList,
      AttributedScopeStack.fromExtension(namesScopeList, frame.contentNameScopesList)
    );
  }
}, // TODO remove me
__publicField(_a2, "NULL", new _a2(
  null,
  0,
  0,
  0,
  false,
  null,
  null,
  null
)), _a2);
var BalancedBracketSelectors = class {
  constructor(balancedBracketScopes, unbalancedBracketScopes) {
    __publicField(this, "balancedBracketScopes");
    __publicField(this, "unbalancedBracketScopes");
    __publicField(this, "allowAny", false);
    this.balancedBracketScopes = balancedBracketScopes.flatMap(
      (selector) => {
        if (selector === "*") {
          this.allowAny = true;
          return [];
        }
        return createMatchers(selector, nameMatcher).map((m) => m.matcher);
      }
    );
    this.unbalancedBracketScopes = unbalancedBracketScopes.flatMap(
      (selector) => createMatchers(selector, nameMatcher).map((m) => m.matcher)
    );
  }
  get matchesAlways() {
    return this.allowAny && this.unbalancedBracketScopes.length === 0;
  }
  get matchesNever() {
    return this.balancedBracketScopes.length === 0 && !this.allowAny;
  }
  match(scopes) {
    for (const excluder of this.unbalancedBracketScopes) {
      if (excluder(scopes)) {
        return false;
      }
    }
    for (const includer of this.balancedBracketScopes) {
      if (includer(scopes)) {
        return true;
      }
    }
    return this.allowAny;
  }
};
var LineTokens = class {
  constructor(emitBinaryTokens, lineText, tokenTypeOverrides, balancedBracketSelectors) {
    __publicField(this, "_emitBinaryTokens");
    /**
     * defined only if `false`.
     */
    __publicField(this, "_lineText");
    /**
     * used only if `_emitBinaryTokens` is false.
     */
    __publicField(this, "_tokens");
    /**
     * used only if `_emitBinaryTokens` is true.
     */
    __publicField(this, "_binaryTokens");
    __publicField(this, "_lastTokenEndIndex");
    __publicField(this, "_tokenTypeOverrides");
    this.balancedBracketSelectors = balancedBracketSelectors;
    this._emitBinaryTokens = emitBinaryTokens;
    this._tokenTypeOverrides = tokenTypeOverrides;
    if (false) {
      this._lineText = lineText;
    } else {
      this._lineText = null;
    }
    this._tokens = [];
    this._binaryTokens = [];
    this._lastTokenEndIndex = 0;
  }
  produce(stack, endIndex) {
    this.produceFromScopes(stack.contentNameScopesList, endIndex);
  }
  produceFromScopes(scopesList, endIndex) {
    var _a4;
    if (this._lastTokenEndIndex >= endIndex) {
      return;
    }
    if (this._emitBinaryTokens) {
      let metadata = (scopesList == null ? void 0 : scopesList.tokenAttributes) ?? 0;
      let containsBalancedBrackets = false;
      if ((_a4 = this.balancedBracketSelectors) == null ? void 0 : _a4.matchesAlways) {
        containsBalancedBrackets = true;
      }
      if (this._tokenTypeOverrides.length > 0 || this.balancedBracketSelectors && !this.balancedBracketSelectors.matchesAlways && !this.balancedBracketSelectors.matchesNever) {
        const scopes2 = (scopesList == null ? void 0 : scopesList.getScopeNames()) ?? [];
        for (const tokenType of this._tokenTypeOverrides) {
          if (tokenType.matcher(scopes2)) {
            metadata = EncodedTokenMetadata.set(
              metadata,
              0,
              toOptionalTokenType(tokenType.type),
              null,
              -1,
              0,
              0
            );
          }
        }
        if (this.balancedBracketSelectors) {
          containsBalancedBrackets = this.balancedBracketSelectors.match(scopes2);
        }
      }
      if (containsBalancedBrackets) {
        metadata = EncodedTokenMetadata.set(
          metadata,
          0,
          8,
          containsBalancedBrackets,
          -1,
          0,
          0
        );
      }
      if (this._binaryTokens.length > 0 && this._binaryTokens[this._binaryTokens.length - 1] === metadata) {
        this._lastTokenEndIndex = endIndex;
        return;
      }
      this._binaryTokens.push(this._lastTokenEndIndex);
      this._binaryTokens.push(metadata);
      this._lastTokenEndIndex = endIndex;
      return;
    }
    const scopes = (scopesList == null ? void 0 : scopesList.getScopeNames()) ?? [];
    this._tokens.push({
      startIndex: this._lastTokenEndIndex,
      endIndex,
      // value: lineText.substring(lastTokenEndIndex, endIndex),
      scopes
    });
    this._lastTokenEndIndex = endIndex;
  }
  getResult(stack, lineLength) {
    if (this._tokens.length > 0 && this._tokens[this._tokens.length - 1].startIndex === lineLength - 1) {
      this._tokens.pop();
    }
    if (this._tokens.length === 0) {
      this._lastTokenEndIndex = -1;
      this.produce(stack, lineLength);
      this._tokens[this._tokens.length - 1].startIndex = 0;
    }
    return this._tokens;
  }
  getBinaryResult(stack, lineLength) {
    if (this._binaryTokens.length > 0 && this._binaryTokens[this._binaryTokens.length - 2] === lineLength - 1) {
      this._binaryTokens.pop();
      this._binaryTokens.pop();
    }
    if (this._binaryTokens.length === 0) {
      this._lastTokenEndIndex = -1;
      this.produce(stack, lineLength);
      this._binaryTokens[this._binaryTokens.length - 2] = 0;
    }
    const result = new Uint32Array(this._binaryTokens.length);
    for (let i = 0, len = this._binaryTokens.length; i < len; i++) {
      result[i] = this._binaryTokens[i];
    }
    return result;
  }
};
var SyncRegistry = class {
  constructor(theme, _onigLib) {
    __publicField(this, "_grammars", /* @__PURE__ */ new Map());
    __publicField(this, "_rawGrammars", /* @__PURE__ */ new Map());
    __publicField(this, "_injectionGrammars", /* @__PURE__ */ new Map());
    __publicField(this, "_theme");
    this._onigLib = _onigLib;
    this._theme = theme;
  }
  dispose() {
    for (const grammar of this._grammars.values()) {
      grammar.dispose();
    }
  }
  setTheme(theme) {
    this._theme = theme;
  }
  getColorMap() {
    return this._theme.getColorMap();
  }
  /**
   * Add `grammar` to registry and return a list of referenced scope names
   */
  addGrammar(grammar, injectionScopeNames) {
    this._rawGrammars.set(grammar.scopeName, grammar);
    if (injectionScopeNames) {
      this._injectionGrammars.set(grammar.scopeName, injectionScopeNames);
    }
  }
  /**
   * Lookup a raw grammar.
   */
  lookup(scopeName) {
    return this._rawGrammars.get(scopeName);
  }
  /**
   * Returns the injections for the given grammar
   */
  injections(targetScope) {
    return this._injectionGrammars.get(targetScope);
  }
  /**
   * Get the default theme settings
   */
  getDefaults() {
    return this._theme.getDefaults();
  }
  /**
   * Match a scope in the theme.
   */
  themeMatch(scopePath) {
    return this._theme.match(scopePath);
  }
  /**
   * Lookup a grammar.
   */
  grammarForScopeName(scopeName, initialLanguage, embeddedLanguages, tokenTypes, balancedBracketSelectors) {
    if (!this._grammars.has(scopeName)) {
      let rawGrammar = this._rawGrammars.get(scopeName);
      if (!rawGrammar) {
        return null;
      }
      this._grammars.set(scopeName, createGrammar(
        scopeName,
        rawGrammar,
        initialLanguage,
        embeddedLanguages,
        tokenTypes,
        balancedBracketSelectors,
        this,
        this._onigLib
      ));
    }
    return this._grammars.get(scopeName);
  }
};
var Registry = class {
  constructor(options) {
    __publicField(this, "_options");
    __publicField(this, "_syncRegistry");
    __publicField(this, "_ensureGrammarCache");
    this._options = options;
    this._syncRegistry = new SyncRegistry(
      Theme.createFromRawTheme(options.theme, options.colorMap),
      options.onigLib
    );
    this._ensureGrammarCache = /* @__PURE__ */ new Map();
  }
  dispose() {
    this._syncRegistry.dispose();
  }
  /**
   * Change the theme. Once called, no previous `ruleStack` should be used anymore.
   */
  setTheme(theme, colorMap) {
    this._syncRegistry.setTheme(Theme.createFromRawTheme(theme, colorMap));
  }
  /**
   * Returns a lookup array for color ids.
   */
  getColorMap() {
    return this._syncRegistry.getColorMap();
  }
  /**
   * Load the grammar for `scopeName` and all referenced included grammars asynchronously.
   * Please do not use language id 0.
   */
  loadGrammarWithEmbeddedLanguages(initialScopeName, initialLanguage, embeddedLanguages) {
    return this.loadGrammarWithConfiguration(initialScopeName, initialLanguage, { embeddedLanguages });
  }
  /**
   * Load the grammar for `scopeName` and all referenced included grammars asynchronously.
   * Please do not use language id 0.
   */
  loadGrammarWithConfiguration(initialScopeName, initialLanguage, configuration) {
    return this._loadGrammar(
      initialScopeName,
      initialLanguage,
      configuration.embeddedLanguages,
      configuration.tokenTypes,
      new BalancedBracketSelectors(
        configuration.balancedBracketSelectors || [],
        configuration.unbalancedBracketSelectors || []
      )
    );
  }
  /**
   * Load the grammar for `scopeName` and all referenced included grammars asynchronously.
   */
  loadGrammar(initialScopeName) {
    return this._loadGrammar(initialScopeName, 0, null, null, null);
  }
  _loadGrammar(initialScopeName, initialLanguage, embeddedLanguages, tokenTypes, balancedBracketSelectors) {
    const dependencyProcessor = new ScopeDependencyProcessor(this._syncRegistry, initialScopeName);
    while (dependencyProcessor.Q.length > 0) {
      dependencyProcessor.Q.map((request) => this._loadSingleGrammar(request.scopeName));
      dependencyProcessor.processQueue();
    }
    return this._grammarForScopeName(
      initialScopeName,
      initialLanguage,
      embeddedLanguages,
      tokenTypes,
      balancedBracketSelectors
    );
  }
  _loadSingleGrammar(scopeName) {
    if (!this._ensureGrammarCache.has(scopeName)) {
      this._doLoadSingleGrammar(scopeName);
      this._ensureGrammarCache.set(scopeName, true);
    }
  }
  _doLoadSingleGrammar(scopeName) {
    const grammar = this._options.loadGrammar(scopeName);
    if (grammar) {
      const injections = typeof this._options.getInjections === "function" ? this._options.getInjections(scopeName) : void 0;
      this._syncRegistry.addGrammar(grammar, injections);
    }
  }
  /**
   * Adds a rawGrammar.
   */
  addGrammar(rawGrammar, injections = [], initialLanguage = 0, embeddedLanguages = null) {
    this._syncRegistry.addGrammar(rawGrammar, injections);
    return this._grammarForScopeName(rawGrammar.scopeName, initialLanguage, embeddedLanguages);
  }
  /**
   * Get the grammar for `scopeName`. The grammar must first be created via `loadGrammar` or `addGrammar`.
   */
  _grammarForScopeName(scopeName, initialLanguage = 0, embeddedLanguages = null, tokenTypes = null, balancedBracketSelectors = null) {
    return this._syncRegistry.grammarForScopeName(
      scopeName,
      initialLanguage,
      embeddedLanguages,
      tokenTypes,
      balancedBracketSelectors
    );
  }
};
var INITIAL = StateStackImpl.NULL;

// ../../../node_modules/.pnpm/html-void-elements@3.0.0/node_modules/html-void-elements/index.js
var htmlVoidElements = [
  "area",
  "base",
  "basefont",
  "bgsound",
  "br",
  "col",
  "command",
  "embed",
  "frame",
  "hr",
  "image",
  "img",
  "input",
  "keygen",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
];

// ../../../node_modules/.pnpm/property-information@7.1.0/node_modules/property-information/lib/util/schema.js
var Schema = class {
  /**
   * @param {SchemaType['property']} property
   *   Property.
   * @param {SchemaType['normal']} normal
   *   Normal.
   * @param {Space | undefined} [space]
   *   Space.
   * @returns
   *   Schema.
   */
  constructor(property, normal, space) {
    this.normal = normal;
    this.property = property;
    if (space) {
      this.space = space;
    }
  }
};
Schema.prototype.normal = {};
Schema.prototype.property = {};
Schema.prototype.space = void 0;

// ../../../node_modules/.pnpm/property-information@7.1.0/node_modules/property-information/lib/util/merge.js
function merge(definitions, space) {
  const property = {};
  const normal = {};
  for (const definition of definitions) {
    Object.assign(property, definition.property);
    Object.assign(normal, definition.normal);
  }
  return new Schema(property, normal, space);
}

// ../../../node_modules/.pnpm/property-information@7.1.0/node_modules/property-information/lib/normalize.js
function normalize(value) {
  return value.toLowerCase();
}

// ../../../node_modules/.pnpm/property-information@7.1.0/node_modules/property-information/lib/util/info.js
var Info = class {
  /**
   * @param {string} property
   *   Property.
   * @param {string} attribute
   *   Attribute.
   * @returns
   *   Info.
   */
  constructor(property, attribute) {
    this.attribute = attribute;
    this.property = property;
  }
};
Info.prototype.attribute = "";
Info.prototype.booleanish = false;
Info.prototype.boolean = false;
Info.prototype.commaOrSpaceSeparated = false;
Info.prototype.commaSeparated = false;
Info.prototype.defined = false;
Info.prototype.mustUseProperty = false;
Info.prototype.number = false;
Info.prototype.overloadedBoolean = false;
Info.prototype.property = "";
Info.prototype.spaceSeparated = false;
Info.prototype.space = void 0;

// ../../../node_modules/.pnpm/property-information@7.1.0/node_modules/property-information/lib/util/types.js
var types_exports = {};
__export(types_exports, {
  boolean: () => boolean,
  booleanish: () => booleanish,
  commaOrSpaceSeparated: () => commaOrSpaceSeparated,
  commaSeparated: () => commaSeparated,
  number: () => number,
  overloadedBoolean: () => overloadedBoolean,
  spaceSeparated: () => spaceSeparated
});
var powers = 0;
var boolean = increment();
var booleanish = increment();
var overloadedBoolean = increment();
var number = increment();
var spaceSeparated = increment();
var commaSeparated = increment();
var commaOrSpaceSeparated = increment();
function increment() {
  return 2 ** ++powers;
}

// ../../../node_modules/.pnpm/property-information@7.1.0/node_modules/property-information/lib/util/defined-info.js
var checks = (
  /** @type {ReadonlyArray<keyof typeof types>} */
  Object.keys(types_exports)
);
var DefinedInfo = class extends Info {
  /**
   * @constructor
   * @param {string} property
   *   Property.
   * @param {string} attribute
   *   Attribute.
   * @param {number | null | undefined} [mask]
   *   Mask.
   * @param {Space | undefined} [space]
   *   Space.
   * @returns
   *   Info.
   */
  constructor(property, attribute, mask, space) {
    let index = -1;
    super(property, attribute);
    mark(this, "space", space);
    if (typeof mask === "number") {
      while (++index < checks.length) {
        const check = checks[index];
        mark(this, checks[index], (mask & types_exports[check]) === types_exports[check]);
      }
    }
  }
};
DefinedInfo.prototype.defined = true;
function mark(values, key2, value) {
  if (value) {
    values[key2] = value;
  }
}

// ../../../node_modules/.pnpm/property-information@7.1.0/node_modules/property-information/lib/util/create.js
function create(definition) {
  const properties = {};
  const normals = {};
  for (const [property, value] of Object.entries(definition.properties)) {
    const info = new DefinedInfo(
      property,
      definition.transform(definition.attributes || {}, property),
      value,
      definition.space
    );
    if (definition.mustUseProperty && definition.mustUseProperty.includes(property)) {
      info.mustUseProperty = true;
    }
    properties[property] = info;
    normals[normalize(property)] = property;
    normals[normalize(info.attribute)] = property;
  }
  return new Schema(properties, normals, definition.space);
}

// ../../../node_modules/.pnpm/property-information@7.1.0/node_modules/property-information/lib/aria.js
var aria = create({
  properties: {
    ariaActiveDescendant: null,
    ariaAtomic: booleanish,
    ariaAutoComplete: null,
    ariaBusy: booleanish,
    ariaChecked: booleanish,
    ariaColCount: number,
    ariaColIndex: number,
    ariaColSpan: number,
    ariaControls: spaceSeparated,
    ariaCurrent: null,
    ariaDescribedBy: spaceSeparated,
    ariaDetails: null,
    ariaDisabled: booleanish,
    ariaDropEffect: spaceSeparated,
    ariaErrorMessage: null,
    ariaExpanded: booleanish,
    ariaFlowTo: spaceSeparated,
    ariaGrabbed: booleanish,
    ariaHasPopup: null,
    ariaHidden: booleanish,
    ariaInvalid: null,
    ariaKeyShortcuts: null,
    ariaLabel: null,
    ariaLabelledBy: spaceSeparated,
    ariaLevel: number,
    ariaLive: null,
    ariaModal: booleanish,
    ariaMultiLine: booleanish,
    ariaMultiSelectable: booleanish,
    ariaOrientation: null,
    ariaOwns: spaceSeparated,
    ariaPlaceholder: null,
    ariaPosInSet: number,
    ariaPressed: booleanish,
    ariaReadOnly: booleanish,
    ariaRelevant: null,
    ariaRequired: booleanish,
    ariaRoleDescription: spaceSeparated,
    ariaRowCount: number,
    ariaRowIndex: number,
    ariaRowSpan: number,
    ariaSelected: booleanish,
    ariaSetSize: number,
    ariaSort: null,
    ariaValueMax: number,
    ariaValueMin: number,
    ariaValueNow: number,
    ariaValueText: null,
    role: null
  },
  transform(_, property) {
    return property === "role" ? property : "aria-" + property.slice(4).toLowerCase();
  }
});

// ../../../node_modules/.pnpm/property-information@7.1.0/node_modules/property-information/lib/util/case-sensitive-transform.js
function caseSensitiveTransform(attributes, attribute) {
  return attribute in attributes ? attributes[attribute] : attribute;
}

// ../../../node_modules/.pnpm/property-information@7.1.0/node_modules/property-information/lib/util/case-insensitive-transform.js
function caseInsensitiveTransform(attributes, property) {
  return caseSensitiveTransform(attributes, property.toLowerCase());
}

// ../../../node_modules/.pnpm/property-information@7.1.0/node_modules/property-information/lib/html.js
var html = create({
  attributes: {
    acceptcharset: "accept-charset",
    classname: "class",
    htmlfor: "for",
    httpequiv: "http-equiv"
  },
  mustUseProperty: ["checked", "multiple", "muted", "selected"],
  properties: {
    // Standard Properties.
    abbr: null,
    accept: commaSeparated,
    acceptCharset: spaceSeparated,
    accessKey: spaceSeparated,
    action: null,
    allow: null,
    allowFullScreen: boolean,
    allowPaymentRequest: boolean,
    allowUserMedia: boolean,
    alt: null,
    as: null,
    async: boolean,
    autoCapitalize: null,
    autoComplete: spaceSeparated,
    autoFocus: boolean,
    autoPlay: boolean,
    blocking: spaceSeparated,
    capture: null,
    charSet: null,
    checked: boolean,
    cite: null,
    className: spaceSeparated,
    cols: number,
    colSpan: null,
    content: null,
    contentEditable: booleanish,
    controls: boolean,
    controlsList: spaceSeparated,
    coords: number | commaSeparated,
    crossOrigin: null,
    data: null,
    dateTime: null,
    decoding: null,
    default: boolean,
    defer: boolean,
    dir: null,
    dirName: null,
    disabled: boolean,
    download: overloadedBoolean,
    draggable: booleanish,
    encType: null,
    enterKeyHint: null,
    fetchPriority: null,
    form: null,
    formAction: null,
    formEncType: null,
    formMethod: null,
    formNoValidate: boolean,
    formTarget: null,
    headers: spaceSeparated,
    height: number,
    hidden: overloadedBoolean,
    high: number,
    href: null,
    hrefLang: null,
    htmlFor: spaceSeparated,
    httpEquiv: spaceSeparated,
    id: null,
    imageSizes: null,
    imageSrcSet: null,
    inert: boolean,
    inputMode: null,
    integrity: null,
    is: null,
    isMap: boolean,
    itemId: null,
    itemProp: spaceSeparated,
    itemRef: spaceSeparated,
    itemScope: boolean,
    itemType: spaceSeparated,
    kind: null,
    label: null,
    lang: null,
    language: null,
    list: null,
    loading: null,
    loop: boolean,
    low: number,
    manifest: null,
    max: null,
    maxLength: number,
    media: null,
    method: null,
    min: null,
    minLength: number,
    multiple: boolean,
    muted: boolean,
    name: null,
    nonce: null,
    noModule: boolean,
    noValidate: boolean,
    onAbort: null,
    onAfterPrint: null,
    onAuxClick: null,
    onBeforeMatch: null,
    onBeforePrint: null,
    onBeforeToggle: null,
    onBeforeUnload: null,
    onBlur: null,
    onCancel: null,
    onCanPlay: null,
    onCanPlayThrough: null,
    onChange: null,
    onClick: null,
    onClose: null,
    onContextLost: null,
    onContextMenu: null,
    onContextRestored: null,
    onCopy: null,
    onCueChange: null,
    onCut: null,
    onDblClick: null,
    onDrag: null,
    onDragEnd: null,
    onDragEnter: null,
    onDragExit: null,
    onDragLeave: null,
    onDragOver: null,
    onDragStart: null,
    onDrop: null,
    onDurationChange: null,
    onEmptied: null,
    onEnded: null,
    onError: null,
    onFocus: null,
    onFormData: null,
    onHashChange: null,
    onInput: null,
    onInvalid: null,
    onKeyDown: null,
    onKeyPress: null,
    onKeyUp: null,
    onLanguageChange: null,
    onLoad: null,
    onLoadedData: null,
    onLoadedMetadata: null,
    onLoadEnd: null,
    onLoadStart: null,
    onMessage: null,
    onMessageError: null,
    onMouseDown: null,
    onMouseEnter: null,
    onMouseLeave: null,
    onMouseMove: null,
    onMouseOut: null,
    onMouseOver: null,
    onMouseUp: null,
    onOffline: null,
    onOnline: null,
    onPageHide: null,
    onPageShow: null,
    onPaste: null,
    onPause: null,
    onPlay: null,
    onPlaying: null,
    onPopState: null,
    onProgress: null,
    onRateChange: null,
    onRejectionHandled: null,
    onReset: null,
    onResize: null,
    onScroll: null,
    onScrollEnd: null,
    onSecurityPolicyViolation: null,
    onSeeked: null,
    onSeeking: null,
    onSelect: null,
    onSlotChange: null,
    onStalled: null,
    onStorage: null,
    onSubmit: null,
    onSuspend: null,
    onTimeUpdate: null,
    onToggle: null,
    onUnhandledRejection: null,
    onUnload: null,
    onVolumeChange: null,
    onWaiting: null,
    onWheel: null,
    open: boolean,
    optimum: number,
    pattern: null,
    ping: spaceSeparated,
    placeholder: null,
    playsInline: boolean,
    popover: null,
    popoverTarget: null,
    popoverTargetAction: null,
    poster: null,
    preload: null,
    readOnly: boolean,
    referrerPolicy: null,
    rel: spaceSeparated,
    required: boolean,
    reversed: boolean,
    rows: number,
    rowSpan: number,
    sandbox: spaceSeparated,
    scope: null,
    scoped: boolean,
    seamless: boolean,
    selected: boolean,
    shadowRootClonable: boolean,
    shadowRootDelegatesFocus: boolean,
    shadowRootMode: null,
    shape: null,
    size: number,
    sizes: null,
    slot: null,
    span: number,
    spellCheck: booleanish,
    src: null,
    srcDoc: null,
    srcLang: null,
    srcSet: null,
    start: number,
    step: null,
    style: null,
    tabIndex: number,
    target: null,
    title: null,
    translate: null,
    type: null,
    typeMustMatch: boolean,
    useMap: null,
    value: booleanish,
    width: number,
    wrap: null,
    writingSuggestions: null,
    // Legacy.
    // See: https://html.spec.whatwg.org/#other-elements,-attributes-and-apis
    align: null,
    // Several. Use CSS `text-align` instead,
    aLink: null,
    // `<body>`. Use CSS `a:active {color}` instead
    archive: spaceSeparated,
    // `<object>`. List of URIs to archives
    axis: null,
    // `<td>` and `<th>`. Use `scope` on `<th>`
    background: null,
    // `<body>`. Use CSS `background-image` instead
    bgColor: null,
    // `<body>` and table elements. Use CSS `background-color` instead
    border: number,
    // `<table>`. Use CSS `border-width` instead,
    borderColor: null,
    // `<table>`. Use CSS `border-color` instead,
    bottomMargin: number,
    // `<body>`
    cellPadding: null,
    // `<table>`
    cellSpacing: null,
    // `<table>`
    char: null,
    // Several table elements. When `align=char`, sets the character to align on
    charOff: null,
    // Several table elements. When `char`, offsets the alignment
    classId: null,
    // `<object>`
    clear: null,
    // `<br>`. Use CSS `clear` instead
    code: null,
    // `<object>`
    codeBase: null,
    // `<object>`
    codeType: null,
    // `<object>`
    color: null,
    // `<font>` and `<hr>`. Use CSS instead
    compact: boolean,
    // Lists. Use CSS to reduce space between items instead
    declare: boolean,
    // `<object>`
    event: null,
    // `<script>`
    face: null,
    // `<font>`. Use CSS instead
    frame: null,
    // `<table>`
    frameBorder: null,
    // `<iframe>`. Use CSS `border` instead
    hSpace: number,
    // `<img>` and `<object>`
    leftMargin: number,
    // `<body>`
    link: null,
    // `<body>`. Use CSS `a:link {color: *}` instead
    longDesc: null,
    // `<frame>`, `<iframe>`, and `<img>`. Use an `<a>`
    lowSrc: null,
    // `<img>`. Use a `<picture>`
    marginHeight: number,
    // `<body>`
    marginWidth: number,
    // `<body>`
    noResize: boolean,
    // `<frame>`
    noHref: boolean,
    // `<area>`. Use no href instead of an explicit `nohref`
    noShade: boolean,
    // `<hr>`. Use background-color and height instead of borders
    noWrap: boolean,
    // `<td>` and `<th>`
    object: null,
    // `<applet>`
    profile: null,
    // `<head>`
    prompt: null,
    // `<isindex>`
    rev: null,
    // `<link>`
    rightMargin: number,
    // `<body>`
    rules: null,
    // `<table>`
    scheme: null,
    // `<meta>`
    scrolling: booleanish,
    // `<frame>`. Use overflow in the child context
    standby: null,
    // `<object>`
    summary: null,
    // `<table>`
    text: null,
    // `<body>`. Use CSS `color` instead
    topMargin: number,
    // `<body>`
    valueType: null,
    // `<param>`
    version: null,
    // `<html>`. Use a doctype.
    vAlign: null,
    // Several. Use CSS `vertical-align` instead
    vLink: null,
    // `<body>`. Use CSS `a:visited {color}` instead
    vSpace: number,
    // `<img>` and `<object>`
    // Non-standard Properties.
    allowTransparency: null,
    autoCorrect: null,
    autoSave: null,
    disablePictureInPicture: boolean,
    disableRemotePlayback: boolean,
    prefix: null,
    property: null,
    results: number,
    security: null,
    unselectable: null
  },
  space: "html",
  transform: caseInsensitiveTransform
});

// ../../../node_modules/.pnpm/property-information@7.1.0/node_modules/property-information/lib/svg.js
var svg = create({
  attributes: {
    accentHeight: "accent-height",
    alignmentBaseline: "alignment-baseline",
    arabicForm: "arabic-form",
    baselineShift: "baseline-shift",
    capHeight: "cap-height",
    className: "class",
    clipPath: "clip-path",
    clipRule: "clip-rule",
    colorInterpolation: "color-interpolation",
    colorInterpolationFilters: "color-interpolation-filters",
    colorProfile: "color-profile",
    colorRendering: "color-rendering",
    crossOrigin: "crossorigin",
    dataType: "datatype",
    dominantBaseline: "dominant-baseline",
    enableBackground: "enable-background",
    fillOpacity: "fill-opacity",
    fillRule: "fill-rule",
    floodColor: "flood-color",
    floodOpacity: "flood-opacity",
    fontFamily: "font-family",
    fontSize: "font-size",
    fontSizeAdjust: "font-size-adjust",
    fontStretch: "font-stretch",
    fontStyle: "font-style",
    fontVariant: "font-variant",
    fontWeight: "font-weight",
    glyphName: "glyph-name",
    glyphOrientationHorizontal: "glyph-orientation-horizontal",
    glyphOrientationVertical: "glyph-orientation-vertical",
    hrefLang: "hreflang",
    horizAdvX: "horiz-adv-x",
    horizOriginX: "horiz-origin-x",
    horizOriginY: "horiz-origin-y",
    imageRendering: "image-rendering",
    letterSpacing: "letter-spacing",
    lightingColor: "lighting-color",
    markerEnd: "marker-end",
    markerMid: "marker-mid",
    markerStart: "marker-start",
    navDown: "nav-down",
    navDownLeft: "nav-down-left",
    navDownRight: "nav-down-right",
    navLeft: "nav-left",
    navNext: "nav-next",
    navPrev: "nav-prev",
    navRight: "nav-right",
    navUp: "nav-up",
    navUpLeft: "nav-up-left",
    navUpRight: "nav-up-right",
    onAbort: "onabort",
    onActivate: "onactivate",
    onAfterPrint: "onafterprint",
    onBeforePrint: "onbeforeprint",
    onBegin: "onbegin",
    onCancel: "oncancel",
    onCanPlay: "oncanplay",
    onCanPlayThrough: "oncanplaythrough",
    onChange: "onchange",
    onClick: "onclick",
    onClose: "onclose",
    onCopy: "oncopy",
    onCueChange: "oncuechange",
    onCut: "oncut",
    onDblClick: "ondblclick",
    onDrag: "ondrag",
    onDragEnd: "ondragend",
    onDragEnter: "ondragenter",
    onDragExit: "ondragexit",
    onDragLeave: "ondragleave",
    onDragOver: "ondragover",
    onDragStart: "ondragstart",
    onDrop: "ondrop",
    onDurationChange: "ondurationchange",
    onEmptied: "onemptied",
    onEnd: "onend",
    onEnded: "onended",
    onError: "onerror",
    onFocus: "onfocus",
    onFocusIn: "onfocusin",
    onFocusOut: "onfocusout",
    onHashChange: "onhashchange",
    onInput: "oninput",
    onInvalid: "oninvalid",
    onKeyDown: "onkeydown",
    onKeyPress: "onkeypress",
    onKeyUp: "onkeyup",
    onLoad: "onload",
    onLoadedData: "onloadeddata",
    onLoadedMetadata: "onloadedmetadata",
    onLoadStart: "onloadstart",
    onMessage: "onmessage",
    onMouseDown: "onmousedown",
    onMouseEnter: "onmouseenter",
    onMouseLeave: "onmouseleave",
    onMouseMove: "onmousemove",
    onMouseOut: "onmouseout",
    onMouseOver: "onmouseover",
    onMouseUp: "onmouseup",
    onMouseWheel: "onmousewheel",
    onOffline: "onoffline",
    onOnline: "ononline",
    onPageHide: "onpagehide",
    onPageShow: "onpageshow",
    onPaste: "onpaste",
    onPause: "onpause",
    onPlay: "onplay",
    onPlaying: "onplaying",
    onPopState: "onpopstate",
    onProgress: "onprogress",
    onRateChange: "onratechange",
    onRepeat: "onrepeat",
    onReset: "onreset",
    onResize: "onresize",
    onScroll: "onscroll",
    onSeeked: "onseeked",
    onSeeking: "onseeking",
    onSelect: "onselect",
    onShow: "onshow",
    onStalled: "onstalled",
    onStorage: "onstorage",
    onSubmit: "onsubmit",
    onSuspend: "onsuspend",
    onTimeUpdate: "ontimeupdate",
    onToggle: "ontoggle",
    onUnload: "onunload",
    onVolumeChange: "onvolumechange",
    onWaiting: "onwaiting",
    onZoom: "onzoom",
    overlinePosition: "overline-position",
    overlineThickness: "overline-thickness",
    paintOrder: "paint-order",
    panose1: "panose-1",
    pointerEvents: "pointer-events",
    referrerPolicy: "referrerpolicy",
    renderingIntent: "rendering-intent",
    shapeRendering: "shape-rendering",
    stopColor: "stop-color",
    stopOpacity: "stop-opacity",
    strikethroughPosition: "strikethrough-position",
    strikethroughThickness: "strikethrough-thickness",
    strokeDashArray: "stroke-dasharray",
    strokeDashOffset: "stroke-dashoffset",
    strokeLineCap: "stroke-linecap",
    strokeLineJoin: "stroke-linejoin",
    strokeMiterLimit: "stroke-miterlimit",
    strokeOpacity: "stroke-opacity",
    strokeWidth: "stroke-width",
    tabIndex: "tabindex",
    textAnchor: "text-anchor",
    textDecoration: "text-decoration",
    textRendering: "text-rendering",
    transformOrigin: "transform-origin",
    typeOf: "typeof",
    underlinePosition: "underline-position",
    underlineThickness: "underline-thickness",
    unicodeBidi: "unicode-bidi",
    unicodeRange: "unicode-range",
    unitsPerEm: "units-per-em",
    vAlphabetic: "v-alphabetic",
    vHanging: "v-hanging",
    vIdeographic: "v-ideographic",
    vMathematical: "v-mathematical",
    vectorEffect: "vector-effect",
    vertAdvY: "vert-adv-y",
    vertOriginX: "vert-origin-x",
    vertOriginY: "vert-origin-y",
    wordSpacing: "word-spacing",
    writingMode: "writing-mode",
    xHeight: "x-height",
    // These were camelcased in Tiny. Now lowercased in SVG 2
    playbackOrder: "playbackorder",
    timelineBegin: "timelinebegin"
  },
  properties: {
    about: commaOrSpaceSeparated,
    accentHeight: number,
    accumulate: null,
    additive: null,
    alignmentBaseline: null,
    alphabetic: number,
    amplitude: number,
    arabicForm: null,
    ascent: number,
    attributeName: null,
    attributeType: null,
    azimuth: number,
    bandwidth: null,
    baselineShift: null,
    baseFrequency: null,
    baseProfile: null,
    bbox: null,
    begin: null,
    bias: number,
    by: null,
    calcMode: null,
    capHeight: number,
    className: spaceSeparated,
    clip: null,
    clipPath: null,
    clipPathUnits: null,
    clipRule: null,
    color: null,
    colorInterpolation: null,
    colorInterpolationFilters: null,
    colorProfile: null,
    colorRendering: null,
    content: null,
    contentScriptType: null,
    contentStyleType: null,
    crossOrigin: null,
    cursor: null,
    cx: null,
    cy: null,
    d: null,
    dataType: null,
    defaultAction: null,
    descent: number,
    diffuseConstant: number,
    direction: null,
    display: null,
    dur: null,
    divisor: number,
    dominantBaseline: null,
    download: boolean,
    dx: null,
    dy: null,
    edgeMode: null,
    editable: null,
    elevation: number,
    enableBackground: null,
    end: null,
    event: null,
    exponent: number,
    externalResourcesRequired: null,
    fill: null,
    fillOpacity: number,
    fillRule: null,
    filter: null,
    filterRes: null,
    filterUnits: null,
    floodColor: null,
    floodOpacity: null,
    focusable: null,
    focusHighlight: null,
    fontFamily: null,
    fontSize: null,
    fontSizeAdjust: null,
    fontStretch: null,
    fontStyle: null,
    fontVariant: null,
    fontWeight: null,
    format: null,
    fr: null,
    from: null,
    fx: null,
    fy: null,
    g1: commaSeparated,
    g2: commaSeparated,
    glyphName: commaSeparated,
    glyphOrientationHorizontal: null,
    glyphOrientationVertical: null,
    glyphRef: null,
    gradientTransform: null,
    gradientUnits: null,
    handler: null,
    hanging: number,
    hatchContentUnits: null,
    hatchUnits: null,
    height: null,
    href: null,
    hrefLang: null,
    horizAdvX: number,
    horizOriginX: number,
    horizOriginY: number,
    id: null,
    ideographic: number,
    imageRendering: null,
    initialVisibility: null,
    in: null,
    in2: null,
    intercept: number,
    k: number,
    k1: number,
    k2: number,
    k3: number,
    k4: number,
    kernelMatrix: commaOrSpaceSeparated,
    kernelUnitLength: null,
    keyPoints: null,
    // SEMI_COLON_SEPARATED
    keySplines: null,
    // SEMI_COLON_SEPARATED
    keyTimes: null,
    // SEMI_COLON_SEPARATED
    kerning: null,
    lang: null,
    lengthAdjust: null,
    letterSpacing: null,
    lightingColor: null,
    limitingConeAngle: number,
    local: null,
    markerEnd: null,
    markerMid: null,
    markerStart: null,
    markerHeight: null,
    markerUnits: null,
    markerWidth: null,
    mask: null,
    maskContentUnits: null,
    maskUnits: null,
    mathematical: null,
    max: null,
    media: null,
    mediaCharacterEncoding: null,
    mediaContentEncodings: null,
    mediaSize: number,
    mediaTime: null,
    method: null,
    min: null,
    mode: null,
    name: null,
    navDown: null,
    navDownLeft: null,
    navDownRight: null,
    navLeft: null,
    navNext: null,
    navPrev: null,
    navRight: null,
    navUp: null,
    navUpLeft: null,
    navUpRight: null,
    numOctaves: null,
    observer: null,
    offset: null,
    onAbort: null,
    onActivate: null,
    onAfterPrint: null,
    onBeforePrint: null,
    onBegin: null,
    onCancel: null,
    onCanPlay: null,
    onCanPlayThrough: null,
    onChange: null,
    onClick: null,
    onClose: null,
    onCopy: null,
    onCueChange: null,
    onCut: null,
    onDblClick: null,
    onDrag: null,
    onDragEnd: null,
    onDragEnter: null,
    onDragExit: null,
    onDragLeave: null,
    onDragOver: null,
    onDragStart: null,
    onDrop: null,
    onDurationChange: null,
    onEmptied: null,
    onEnd: null,
    onEnded: null,
    onError: null,
    onFocus: null,
    onFocusIn: null,
    onFocusOut: null,
    onHashChange: null,
    onInput: null,
    onInvalid: null,
    onKeyDown: null,
    onKeyPress: null,
    onKeyUp: null,
    onLoad: null,
    onLoadedData: null,
    onLoadedMetadata: null,
    onLoadStart: null,
    onMessage: null,
    onMouseDown: null,
    onMouseEnter: null,
    onMouseLeave: null,
    onMouseMove: null,
    onMouseOut: null,
    onMouseOver: null,
    onMouseUp: null,
    onMouseWheel: null,
    onOffline: null,
    onOnline: null,
    onPageHide: null,
    onPageShow: null,
    onPaste: null,
    onPause: null,
    onPlay: null,
    onPlaying: null,
    onPopState: null,
    onProgress: null,
    onRateChange: null,
    onRepeat: null,
    onReset: null,
    onResize: null,
    onScroll: null,
    onSeeked: null,
    onSeeking: null,
    onSelect: null,
    onShow: null,
    onStalled: null,
    onStorage: null,
    onSubmit: null,
    onSuspend: null,
    onTimeUpdate: null,
    onToggle: null,
    onUnload: null,
    onVolumeChange: null,
    onWaiting: null,
    onZoom: null,
    opacity: null,
    operator: null,
    order: null,
    orient: null,
    orientation: null,
    origin: null,
    overflow: null,
    overlay: null,
    overlinePosition: number,
    overlineThickness: number,
    paintOrder: null,
    panose1: null,
    path: null,
    pathLength: number,
    patternContentUnits: null,
    patternTransform: null,
    patternUnits: null,
    phase: null,
    ping: spaceSeparated,
    pitch: null,
    playbackOrder: null,
    pointerEvents: null,
    points: null,
    pointsAtX: number,
    pointsAtY: number,
    pointsAtZ: number,
    preserveAlpha: null,
    preserveAspectRatio: null,
    primitiveUnits: null,
    propagate: null,
    property: commaOrSpaceSeparated,
    r: null,
    radius: null,
    referrerPolicy: null,
    refX: null,
    refY: null,
    rel: commaOrSpaceSeparated,
    rev: commaOrSpaceSeparated,
    renderingIntent: null,
    repeatCount: null,
    repeatDur: null,
    requiredExtensions: commaOrSpaceSeparated,
    requiredFeatures: commaOrSpaceSeparated,
    requiredFonts: commaOrSpaceSeparated,
    requiredFormats: commaOrSpaceSeparated,
    resource: null,
    restart: null,
    result: null,
    rotate: null,
    rx: null,
    ry: null,
    scale: null,
    seed: null,
    shapeRendering: null,
    side: null,
    slope: null,
    snapshotTime: null,
    specularConstant: number,
    specularExponent: number,
    spreadMethod: null,
    spacing: null,
    startOffset: null,
    stdDeviation: null,
    stemh: null,
    stemv: null,
    stitchTiles: null,
    stopColor: null,
    stopOpacity: null,
    strikethroughPosition: number,
    strikethroughThickness: number,
    string: null,
    stroke: null,
    strokeDashArray: commaOrSpaceSeparated,
    strokeDashOffset: null,
    strokeLineCap: null,
    strokeLineJoin: null,
    strokeMiterLimit: number,
    strokeOpacity: number,
    strokeWidth: null,
    style: null,
    surfaceScale: number,
    syncBehavior: null,
    syncBehaviorDefault: null,
    syncMaster: null,
    syncTolerance: null,
    syncToleranceDefault: null,
    systemLanguage: commaOrSpaceSeparated,
    tabIndex: number,
    tableValues: null,
    target: null,
    targetX: number,
    targetY: number,
    textAnchor: null,
    textDecoration: null,
    textRendering: null,
    textLength: null,
    timelineBegin: null,
    title: null,
    transformBehavior: null,
    type: null,
    typeOf: commaOrSpaceSeparated,
    to: null,
    transform: null,
    transformOrigin: null,
    u1: null,
    u2: null,
    underlinePosition: number,
    underlineThickness: number,
    unicode: null,
    unicodeBidi: null,
    unicodeRange: null,
    unitsPerEm: number,
    values: null,
    vAlphabetic: number,
    vMathematical: number,
    vectorEffect: null,
    vHanging: number,
    vIdeographic: number,
    version: null,
    vertAdvY: number,
    vertOriginX: number,
    vertOriginY: number,
    viewBox: null,
    viewTarget: null,
    visibility: null,
    width: null,
    widths: null,
    wordSpacing: null,
    writingMode: null,
    x: null,
    x1: null,
    x2: null,
    xChannelSelector: null,
    xHeight: number,
    y: null,
    y1: null,
    y2: null,
    yChannelSelector: null,
    z: null,
    zoomAndPan: null
  },
  space: "svg",
  transform: caseSensitiveTransform
});

// ../../../node_modules/.pnpm/property-information@7.1.0/node_modules/property-information/lib/xlink.js
var xlink = create({
  properties: {
    xLinkActuate: null,
    xLinkArcRole: null,
    xLinkHref: null,
    xLinkRole: null,
    xLinkShow: null,
    xLinkTitle: null,
    xLinkType: null
  },
  space: "xlink",
  transform(_, property) {
    return "xlink:" + property.slice(5).toLowerCase();
  }
});

// ../../../node_modules/.pnpm/property-information@7.1.0/node_modules/property-information/lib/xmlns.js
var xmlns = create({
  attributes: { xmlnsxlink: "xmlns:xlink" },
  properties: { xmlnsXLink: null, xmlns: null },
  space: "xmlns",
  transform: caseInsensitiveTransform
});

// ../../../node_modules/.pnpm/property-information@7.1.0/node_modules/property-information/lib/xml.js
var xml = create({
  properties: { xmlBase: null, xmlLang: null, xmlSpace: null },
  space: "xml",
  transform(_, property) {
    return "xml:" + property.slice(3).toLowerCase();
  }
});

// ../../../node_modules/.pnpm/property-information@7.1.0/node_modules/property-information/lib/find.js
var cap = /[A-Z]/g;
var dash = /-[a-z]/g;
var valid = /^data[-\w.:]+$/i;
function find(schema, value) {
  const normal = normalize(value);
  let property = value;
  let Type = Info;
  if (normal in schema.normal) {
    return schema.property[schema.normal[normal]];
  }
  if (normal.length > 4 && normal.slice(0, 4) === "data" && valid.test(value)) {
    if (value.charAt(4) === "-") {
      const rest = value.slice(5).replace(dash, camelcase);
      property = "data" + rest.charAt(0).toUpperCase() + rest.slice(1);
    } else {
      const rest = value.slice(4);
      if (!dash.test(rest)) {
        let dashes = rest.replace(cap, kebab);
        if (dashes.charAt(0) !== "-") {
          dashes = "-" + dashes;
        }
        value = "data" + dashes;
      }
    }
    Type = DefinedInfo;
  }
  return new Type(property, value);
}
function kebab($0) {
  return "-" + $0.toLowerCase();
}
function camelcase($0) {
  return $0.charAt(1).toUpperCase();
}

// ../../../node_modules/.pnpm/property-information@7.1.0/node_modules/property-information/index.js
var html2 = merge([aria, html, xlink, xmlns, xml], "html");
var svg2 = merge([aria, svg, xlink, xmlns, xml], "svg");

// ../../../node_modules/.pnpm/zwitch@2.0.4/node_modules/zwitch/index.js
var own = {}.hasOwnProperty;
function zwitch(key2, options) {
  const settings = options || {};
  function one2(value, ...parameters) {
    let fn = one2.invalid;
    const handlers = one2.handlers;
    if (value && own.call(value, key2)) {
      const id = String(value[key2]);
      fn = own.call(handlers, id) ? handlers[id] : one2.unknown;
    }
    if (fn) {
      return fn.call(this, value, ...parameters);
    }
  }
  one2.handlers = settings.handlers || {};
  one2.invalid = settings.invalid;
  one2.unknown = settings.unknown;
  return one2;
}

// ../../../node_modules/.pnpm/stringify-entities@4.0.4/node_modules/stringify-entities/lib/core.js
var defaultSubsetRegex = /["&'<>`]/g;
var surrogatePairsRegex = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
var controlCharactersRegex = (
  // eslint-disable-next-line no-control-regex, unicorn/no-hex-escape
  /[\x01-\t\v\f\x0E-\x1F\x7F\x81\x8D\x8F\x90\x9D\xA0-\uFFFF]/g
);
var regexEscapeRegex = /[|\\{}()[\]^$+*?.]/g;
var subsetToRegexCache = /* @__PURE__ */ new WeakMap();
function core(value, options) {
  value = value.replace(
    options.subset ? charactersToExpressionCached(options.subset) : defaultSubsetRegex,
    basic
  );
  if (options.subset || options.escapeOnly) {
    return value;
  }
  return value.replace(surrogatePairsRegex, surrogate).replace(controlCharactersRegex, basic);
  function surrogate(pair, index, all2) {
    return options.format(
      (pair.charCodeAt(0) - 55296) * 1024 + pair.charCodeAt(1) - 56320 + 65536,
      all2.charCodeAt(index + 2),
      options
    );
  }
  function basic(character, index, all2) {
    return options.format(
      character.charCodeAt(0),
      all2.charCodeAt(index + 1),
      options
    );
  }
}
function charactersToExpressionCached(subset) {
  let cached = subsetToRegexCache.get(subset);
  if (!cached) {
    cached = charactersToExpression(subset);
    subsetToRegexCache.set(subset, cached);
  }
  return cached;
}
function charactersToExpression(subset) {
  const groups = [];
  let index = -1;
  while (++index < subset.length) {
    groups.push(subset[index].replace(regexEscapeRegex, "\\$&"));
  }
  return new RegExp("(?:" + groups.join("|") + ")", "g");
}

// ../../../node_modules/.pnpm/stringify-entities@4.0.4/node_modules/stringify-entities/lib/util/to-hexadecimal.js
var hexadecimalRegex = /[\dA-Fa-f]/;
function toHexadecimal(code, next, omit) {
  const value = "&#x" + code.toString(16).toUpperCase();
  return omit && next && !hexadecimalRegex.test(String.fromCharCode(next)) ? value : value + ";";
}

// ../../../node_modules/.pnpm/stringify-entities@4.0.4/node_modules/stringify-entities/lib/util/to-decimal.js
var decimalRegex = /\d/;
function toDecimal(code, next, omit) {
  const value = "&#" + String(code);
  return omit && next && !decimalRegex.test(String.fromCharCode(next)) ? value : value + ";";
}

// ../../../node_modules/.pnpm/character-entities-legacy@3.0.0/node_modules/character-entities-legacy/index.js
var characterEntitiesLegacy = [
  "AElig",
  "AMP",
  "Aacute",
  "Acirc",
  "Agrave",
  "Aring",
  "Atilde",
  "Auml",
  "COPY",
  "Ccedil",
  "ETH",
  "Eacute",
  "Ecirc",
  "Egrave",
  "Euml",
  "GT",
  "Iacute",
  "Icirc",
  "Igrave",
  "Iuml",
  "LT",
  "Ntilde",
  "Oacute",
  "Ocirc",
  "Ograve",
  "Oslash",
  "Otilde",
  "Ouml",
  "QUOT",
  "REG",
  "THORN",
  "Uacute",
  "Ucirc",
  "Ugrave",
  "Uuml",
  "Yacute",
  "aacute",
  "acirc",
  "acute",
  "aelig",
  "agrave",
  "amp",
  "aring",
  "atilde",
  "auml",
  "brvbar",
  "ccedil",
  "cedil",
  "cent",
  "copy",
  "curren",
  "deg",
  "divide",
  "eacute",
  "ecirc",
  "egrave",
  "eth",
  "euml",
  "frac12",
  "frac14",
  "frac34",
  "gt",
  "iacute",
  "icirc",
  "iexcl",
  "igrave",
  "iquest",
  "iuml",
  "laquo",
  "lt",
  "macr",
  "micro",
  "middot",
  "nbsp",
  "not",
  "ntilde",
  "oacute",
  "ocirc",
  "ograve",
  "ordf",
  "ordm",
  "oslash",
  "otilde",
  "ouml",
  "para",
  "plusmn",
  "pound",
  "quot",
  "raquo",
  "reg",
  "sect",
  "shy",
  "sup1",
  "sup2",
  "sup3",
  "szlig",
  "thorn",
  "times",
  "uacute",
  "ucirc",
  "ugrave",
  "uml",
  "uuml",
  "yacute",
  "yen",
  "yuml"
];

// ../../../node_modules/.pnpm/character-entities-html4@2.1.0/node_modules/character-entities-html4/index.js
var characterEntitiesHtml4 = {
  nbsp: " ",
  iexcl: "¡",
  cent: "¢",
  pound: "£",
  curren: "¤",
  yen: "¥",
  brvbar: "¦",
  sect: "§",
  uml: "¨",
  copy: "©",
  ordf: "ª",
  laquo: "«",
  not: "¬",
  shy: "­",
  reg: "®",
  macr: "¯",
  deg: "°",
  plusmn: "±",
  sup2: "²",
  sup3: "³",
  acute: "´",
  micro: "µ",
  para: "¶",
  middot: "·",
  cedil: "¸",
  sup1: "¹",
  ordm: "º",
  raquo: "»",
  frac14: "¼",
  frac12: "½",
  frac34: "¾",
  iquest: "¿",
  Agrave: "À",
  Aacute: "Á",
  Acirc: "Â",
  Atilde: "Ã",
  Auml: "Ä",
  Aring: "Å",
  AElig: "Æ",
  Ccedil: "Ç",
  Egrave: "È",
  Eacute: "É",
  Ecirc: "Ê",
  Euml: "Ë",
  Igrave: "Ì",
  Iacute: "Í",
  Icirc: "Î",
  Iuml: "Ï",
  ETH: "Ð",
  Ntilde: "Ñ",
  Ograve: "Ò",
  Oacute: "Ó",
  Ocirc: "Ô",
  Otilde: "Õ",
  Ouml: "Ö",
  times: "×",
  Oslash: "Ø",
  Ugrave: "Ù",
  Uacute: "Ú",
  Ucirc: "Û",
  Uuml: "Ü",
  Yacute: "Ý",
  THORN: "Þ",
  szlig: "ß",
  agrave: "à",
  aacute: "á",
  acirc: "â",
  atilde: "ã",
  auml: "ä",
  aring: "å",
  aelig: "æ",
  ccedil: "ç",
  egrave: "è",
  eacute: "é",
  ecirc: "ê",
  euml: "ë",
  igrave: "ì",
  iacute: "í",
  icirc: "î",
  iuml: "ï",
  eth: "ð",
  ntilde: "ñ",
  ograve: "ò",
  oacute: "ó",
  ocirc: "ô",
  otilde: "õ",
  ouml: "ö",
  divide: "÷",
  oslash: "ø",
  ugrave: "ù",
  uacute: "ú",
  ucirc: "û",
  uuml: "ü",
  yacute: "ý",
  thorn: "þ",
  yuml: "ÿ",
  fnof: "ƒ",
  Alpha: "Α",
  Beta: "Β",
  Gamma: "Γ",
  Delta: "Δ",
  Epsilon: "Ε",
  Zeta: "Ζ",
  Eta: "Η",
  Theta: "Θ",
  Iota: "Ι",
  Kappa: "Κ",
  Lambda: "Λ",
  Mu: "Μ",
  Nu: "Ν",
  Xi: "Ξ",
  Omicron: "Ο",
  Pi: "Π",
  Rho: "Ρ",
  Sigma: "Σ",
  Tau: "Τ",
  Upsilon: "Υ",
  Phi: "Φ",
  Chi: "Χ",
  Psi: "Ψ",
  Omega: "Ω",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  omicron: "ο",
  pi: "π",
  rho: "ρ",
  sigmaf: "ς",
  sigma: "σ",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  thetasym: "ϑ",
  upsih: "ϒ",
  piv: "ϖ",
  bull: "•",
  hellip: "…",
  prime: "′",
  Prime: "″",
  oline: "‾",
  frasl: "⁄",
  weierp: "℘",
  image: "ℑ",
  real: "ℜ",
  trade: "™",
  alefsym: "ℵ",
  larr: "←",
  uarr: "↑",
  rarr: "→",
  darr: "↓",
  harr: "↔",
  crarr: "↵",
  lArr: "⇐",
  uArr: "⇑",
  rArr: "⇒",
  dArr: "⇓",
  hArr: "⇔",
  forall: "∀",
  part: "∂",
  exist: "∃",
  empty: "∅",
  nabla: "∇",
  isin: "∈",
  notin: "∉",
  ni: "∋",
  prod: "∏",
  sum: "∑",
  minus: "−",
  lowast: "∗",
  radic: "√",
  prop: "∝",
  infin: "∞",
  ang: "∠",
  and: "∧",
  or: "∨",
  cap: "∩",
  cup: "∪",
  int: "∫",
  there4: "∴",
  sim: "∼",
  cong: "≅",
  asymp: "≈",
  ne: "≠",
  equiv: "≡",
  le: "≤",
  ge: "≥",
  sub: "⊂",
  sup: "⊃",
  nsub: "⊄",
  sube: "⊆",
  supe: "⊇",
  oplus: "⊕",
  otimes: "⊗",
  perp: "⊥",
  sdot: "⋅",
  lceil: "⌈",
  rceil: "⌉",
  lfloor: "⌊",
  rfloor: "⌋",
  lang: "〈",
  rang: "〉",
  loz: "◊",
  spades: "♠",
  clubs: "♣",
  hearts: "♥",
  diams: "♦",
  quot: '"',
  amp: "&",
  lt: "<",
  gt: ">",
  OElig: "Œ",
  oelig: "œ",
  Scaron: "Š",
  scaron: "š",
  Yuml: "Ÿ",
  circ: "ˆ",
  tilde: "˜",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  zwnj: "‌",
  zwj: "‍",
  lrm: "‎",
  rlm: "‏",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  dagger: "†",
  Dagger: "‡",
  permil: "‰",
  lsaquo: "‹",
  rsaquo: "›",
  euro: "€"
};

// ../../../node_modules/.pnpm/stringify-entities@4.0.4/node_modules/stringify-entities/lib/constant/dangerous.js
var dangerous = [
  "cent",
  "copy",
  "divide",
  "gt",
  "lt",
  "not",
  "para",
  "times"
];

// ../../../node_modules/.pnpm/stringify-entities@4.0.4/node_modules/stringify-entities/lib/util/to-named.js
var own2 = {}.hasOwnProperty;
var characters = {};
var key;
for (key in characterEntitiesHtml4) {
  if (own2.call(characterEntitiesHtml4, key)) {
    characters[characterEntitiesHtml4[key]] = key;
  }
}
var notAlphanumericRegex = /[^\dA-Za-z]/;
function toNamed(code, next, omit, attribute) {
  const character = String.fromCharCode(code);
  if (own2.call(characters, character)) {
    const name = characters[character];
    const value = "&" + name;
    if (omit && characterEntitiesLegacy.includes(name) && !dangerous.includes(name) && (!attribute || next && next !== 61 && notAlphanumericRegex.test(String.fromCharCode(next)))) {
      return value;
    }
    return value + ";";
  }
  return "";
}

// ../../../node_modules/.pnpm/stringify-entities@4.0.4/node_modules/stringify-entities/lib/util/format-smart.js
function formatSmart(code, next, options) {
  let numeric = toHexadecimal(code, next, options.omitOptionalSemicolons);
  let named;
  if (options.useNamedReferences || options.useShortestReferences) {
    named = toNamed(
      code,
      next,
      options.omitOptionalSemicolons,
      options.attribute
    );
  }
  if ((options.useShortestReferences || !named) && options.useShortestReferences) {
    const decimal = toDecimal(code, next, options.omitOptionalSemicolons);
    if (decimal.length < numeric.length) {
      numeric = decimal;
    }
  }
  return named && (!options.useShortestReferences || named.length < numeric.length) ? named : numeric;
}

// ../../../node_modules/.pnpm/stringify-entities@4.0.4/node_modules/stringify-entities/lib/index.js
function stringifyEntities(value, options) {
  return core(value, Object.assign({ format: formatSmart }, options));
}

// ../../../node_modules/.pnpm/hast-util-to-html@9.0.5/node_modules/hast-util-to-html/lib/handle/comment.js
var htmlCommentRegex = /^>|^->|<!--|-->|--!>|<!-$/g;
var bogusCommentEntitySubset = [">"];
var commentEntitySubset = ["<", ">"];
function comment(node, _1, _2, state) {
  return state.settings.bogusComments ? "<?" + stringifyEntities(
    node.value,
    Object.assign({}, state.settings.characterReferences, {
      subset: bogusCommentEntitySubset
    })
  ) + ">" : "<!--" + node.value.replace(htmlCommentRegex, encode) + "-->";
  function encode($0) {
    return stringifyEntities(
      $0,
      Object.assign({}, state.settings.characterReferences, {
        subset: commentEntitySubset
      })
    );
  }
}

// ../../../node_modules/.pnpm/hast-util-to-html@9.0.5/node_modules/hast-util-to-html/lib/handle/doctype.js
function doctype(_1, _2, _3, state) {
  return "<!" + (state.settings.upperDoctype ? "DOCTYPE" : "doctype") + (state.settings.tightDoctype ? "" : " ") + "html>";
}

// ../../../node_modules/.pnpm/ccount@2.0.1/node_modules/ccount/index.js
function ccount(value, character) {
  const source = String(value);
  if (typeof character !== "string") {
    throw new TypeError("Expected character");
  }
  let count = 0;
  let index = source.indexOf(character);
  while (index !== -1) {
    count++;
    index = source.indexOf(character, index + character.length);
  }
  return count;
}

// ../../../node_modules/.pnpm/comma-separated-tokens@2.0.3/node_modules/comma-separated-tokens/index.js
function stringify(values, options) {
  const settings = options || {};
  const input = values[values.length - 1] === "" ? [...values, ""] : values;
  return input.join(
    (settings.padRight ? " " : "") + "," + (settings.padLeft === false ? "" : " ")
  ).trim();
}

// ../../../node_modules/.pnpm/space-separated-tokens@2.0.2/node_modules/space-separated-tokens/index.js
function stringify2(values) {
  return values.join(" ").trim();
}

// ../../../node_modules/.pnpm/hast-util-whitespace@3.0.0/node_modules/hast-util-whitespace/lib/index.js
var re = /[ \t\n\f\r]/g;
function whitespace(thing) {
  return typeof thing === "object" ? thing.type === "text" ? empty(thing.value) : false : empty(thing);
}
function empty(value) {
  return value.replace(re, "") === "";
}

// ../../../node_modules/.pnpm/hast-util-to-html@9.0.5/node_modules/hast-util-to-html/lib/omission/util/siblings.js
var siblingAfter = siblings(1);
var siblingBefore = siblings(-1);
var emptyChildren = [];
function siblings(increment2) {
  return sibling;
  function sibling(parent, index, includeWhitespace) {
    const siblings2 = parent ? parent.children : emptyChildren;
    let offset = (index || 0) + increment2;
    let next = siblings2[offset];
    if (!includeWhitespace) {
      while (next && whitespace(next)) {
        offset += increment2;
        next = siblings2[offset];
      }
    }
    return next;
  }
}

// ../../../node_modules/.pnpm/hast-util-to-html@9.0.5/node_modules/hast-util-to-html/lib/omission/omission.js
var own3 = {}.hasOwnProperty;
function omission(handlers) {
  return omit;
  function omit(node, index, parent) {
    return own3.call(handlers, node.tagName) && handlers[node.tagName](node, index, parent);
  }
}

// ../../../node_modules/.pnpm/hast-util-to-html@9.0.5/node_modules/hast-util-to-html/lib/omission/closing.js
var closing = omission({
  body,
  caption: headOrColgroupOrCaption,
  colgroup: headOrColgroupOrCaption,
  dd,
  dt,
  head: headOrColgroupOrCaption,
  html: html3,
  li,
  optgroup,
  option,
  p,
  rp: rubyElement,
  rt: rubyElement,
  tbody,
  td: cells,
  tfoot,
  th: cells,
  thead,
  tr
});
function headOrColgroupOrCaption(_, index, parent) {
  const next = siblingAfter(parent, index, true);
  return !next || next.type !== "comment" && !(next.type === "text" && whitespace(next.value.charAt(0)));
}
function html3(_, index, parent) {
  const next = siblingAfter(parent, index);
  return !next || next.type !== "comment";
}
function body(_, index, parent) {
  const next = siblingAfter(parent, index);
  return !next || next.type !== "comment";
}
function p(_, index, parent) {
  const next = siblingAfter(parent, index);
  return next ? next.type === "element" && (next.tagName === "address" || next.tagName === "article" || next.tagName === "aside" || next.tagName === "blockquote" || next.tagName === "details" || next.tagName === "div" || next.tagName === "dl" || next.tagName === "fieldset" || next.tagName === "figcaption" || next.tagName === "figure" || next.tagName === "footer" || next.tagName === "form" || next.tagName === "h1" || next.tagName === "h2" || next.tagName === "h3" || next.tagName === "h4" || next.tagName === "h5" || next.tagName === "h6" || next.tagName === "header" || next.tagName === "hgroup" || next.tagName === "hr" || next.tagName === "main" || next.tagName === "menu" || next.tagName === "nav" || next.tagName === "ol" || next.tagName === "p" || next.tagName === "pre" || next.tagName === "section" || next.tagName === "table" || next.tagName === "ul") : !parent || // Confusing parent.
  !(parent.type === "element" && (parent.tagName === "a" || parent.tagName === "audio" || parent.tagName === "del" || parent.tagName === "ins" || parent.tagName === "map" || parent.tagName === "noscript" || parent.tagName === "video"));
}
function li(_, index, parent) {
  const next = siblingAfter(parent, index);
  return !next || next.type === "element" && next.tagName === "li";
}
function dt(_, index, parent) {
  const next = siblingAfter(parent, index);
  return Boolean(
    next && next.type === "element" && (next.tagName === "dt" || next.tagName === "dd")
  );
}
function dd(_, index, parent) {
  const next = siblingAfter(parent, index);
  return !next || next.type === "element" && (next.tagName === "dt" || next.tagName === "dd");
}
function rubyElement(_, index, parent) {
  const next = siblingAfter(parent, index);
  return !next || next.type === "element" && (next.tagName === "rp" || next.tagName === "rt");
}
function optgroup(_, index, parent) {
  const next = siblingAfter(parent, index);
  return !next || next.type === "element" && next.tagName === "optgroup";
}
function option(_, index, parent) {
  const next = siblingAfter(parent, index);
  return !next || next.type === "element" && (next.tagName === "option" || next.tagName === "optgroup");
}
function thead(_, index, parent) {
  const next = siblingAfter(parent, index);
  return Boolean(
    next && next.type === "element" && (next.tagName === "tbody" || next.tagName === "tfoot")
  );
}
function tbody(_, index, parent) {
  const next = siblingAfter(parent, index);
  return !next || next.type === "element" && (next.tagName === "tbody" || next.tagName === "tfoot");
}
function tfoot(_, index, parent) {
  return !siblingAfter(parent, index);
}
function tr(_, index, parent) {
  const next = siblingAfter(parent, index);
  return !next || next.type === "element" && next.tagName === "tr";
}
function cells(_, index, parent) {
  const next = siblingAfter(parent, index);
  return !next || next.type === "element" && (next.tagName === "td" || next.tagName === "th");
}

// ../../../node_modules/.pnpm/hast-util-to-html@9.0.5/node_modules/hast-util-to-html/lib/omission/opening.js
var opening = omission({
  body: body2,
  colgroup,
  head,
  html: html4,
  tbody: tbody2
});
function html4(node) {
  const head2 = siblingAfter(node, -1);
  return !head2 || head2.type !== "comment";
}
function head(node) {
  const seen = /* @__PURE__ */ new Set();
  for (const child2 of node.children) {
    if (child2.type === "element" && (child2.tagName === "base" || child2.tagName === "title")) {
      if (seen.has(child2.tagName)) return false;
      seen.add(child2.tagName);
    }
  }
  const child = node.children[0];
  return !child || child.type === "element";
}
function body2(node) {
  const head2 = siblingAfter(node, -1, true);
  return !head2 || head2.type !== "comment" && !(head2.type === "text" && whitespace(head2.value.charAt(0))) && !(head2.type === "element" && (head2.tagName === "meta" || head2.tagName === "link" || head2.tagName === "script" || head2.tagName === "style" || head2.tagName === "template"));
}
function colgroup(node, index, parent) {
  const previous = siblingBefore(parent, index);
  const head2 = siblingAfter(node, -1, true);
  if (parent && previous && previous.type === "element" && previous.tagName === "colgroup" && closing(previous, parent.children.indexOf(previous), parent)) {
    return false;
  }
  return Boolean(head2 && head2.type === "element" && head2.tagName === "col");
}
function tbody2(node, index, parent) {
  const previous = siblingBefore(parent, index);
  const head2 = siblingAfter(node, -1);
  if (parent && previous && previous.type === "element" && (previous.tagName === "thead" || previous.tagName === "tbody") && closing(previous, parent.children.indexOf(previous), parent)) {
    return false;
  }
  return Boolean(head2 && head2.type === "element" && head2.tagName === "tr");
}

// ../../../node_modules/.pnpm/hast-util-to-html@9.0.5/node_modules/hast-util-to-html/lib/handle/element.js
var constants = {
  // See: <https://html.spec.whatwg.org/#attribute-name-state>.
  name: [
    ["	\n\f\r &/=>".split(""), "	\n\f\r \"&'/=>`".split("")],
    [`\0	
\f\r "&'/<=>`.split(""), "\0	\n\f\r \"&'/<=>`".split("")]
  ],
  // See: <https://html.spec.whatwg.org/#attribute-value-(unquoted)-state>.
  unquoted: [
    ["	\n\f\r &>".split(""), "\0	\n\f\r \"&'<=>`".split("")],
    ["\0	\n\f\r \"&'<=>`".split(""), "\0	\n\f\r \"&'<=>`".split("")]
  ],
  // See: <https://html.spec.whatwg.org/#attribute-value-(single-quoted)-state>.
  single: [
    ["&'".split(""), "\"&'`".split("")],
    ["\0&'".split(""), "\0\"&'`".split("")]
  ],
  // See: <https://html.spec.whatwg.org/#attribute-value-(double-quoted)-state>.
  double: [
    ['"&'.split(""), "\"&'`".split("")],
    ['\0"&'.split(""), "\0\"&'`".split("")]
  ]
};
function element(node, index, parent, state) {
  const schema = state.schema;
  const omit = schema.space === "svg" ? false : state.settings.omitOptionalTags;
  let selfClosing = schema.space === "svg" ? state.settings.closeEmptyElements : state.settings.voids.includes(node.tagName.toLowerCase());
  const parts = [];
  let last;
  if (schema.space === "html" && node.tagName === "svg") {
    state.schema = svg2;
  }
  const attributes = serializeAttributes(state, node.properties);
  const content = state.all(
    schema.space === "html" && node.tagName === "template" ? node.content : node
  );
  state.schema = schema;
  if (content) selfClosing = false;
  if (attributes || !omit || !opening(node, index, parent)) {
    parts.push("<", node.tagName, attributes ? " " + attributes : "");
    if (selfClosing && (schema.space === "svg" || state.settings.closeSelfClosing)) {
      last = attributes.charAt(attributes.length - 1);
      if (!state.settings.tightSelfClosing || last === "/" || last && last !== '"' && last !== "'") {
        parts.push(" ");
      }
      parts.push("/");
    }
    parts.push(">");
  }
  parts.push(content);
  if (!selfClosing && (!omit || !closing(node, index, parent))) {
    parts.push("</" + node.tagName + ">");
  }
  return parts.join("");
}
function serializeAttributes(state, properties) {
  const values = [];
  let index = -1;
  let key2;
  if (properties) {
    for (key2 in properties) {
      if (properties[key2] !== null && properties[key2] !== void 0) {
        const value = serializeAttribute(state, key2, properties[key2]);
        if (value) values.push(value);
      }
    }
  }
  while (++index < values.length) {
    const last = state.settings.tightAttributes ? values[index].charAt(values[index].length - 1) : void 0;
    if (index !== values.length - 1 && last !== '"' && last !== "'") {
      values[index] += " ";
    }
  }
  return values.join("");
}
function serializeAttribute(state, key2, value) {
  const info = find(state.schema, key2);
  const x = state.settings.allowParseErrors && state.schema.space === "html" ? 0 : 1;
  const y = state.settings.allowDangerousCharacters ? 0 : 1;
  let quote = state.quote;
  let result;
  if (info.overloadedBoolean && (value === info.attribute || value === "")) {
    value = true;
  } else if ((info.boolean || info.overloadedBoolean) && (typeof value !== "string" || value === info.attribute || value === "")) {
    value = Boolean(value);
  }
  if (value === null || value === void 0 || value === false || typeof value === "number" && Number.isNaN(value)) {
    return "";
  }
  const name = stringifyEntities(
    info.attribute,
    Object.assign({}, state.settings.characterReferences, {
      // Always encode without parse errors in non-HTML.
      subset: constants.name[x][y]
    })
  );
  if (value === true) return name;
  value = Array.isArray(value) ? (info.commaSeparated ? stringify : stringify2)(value, {
    padLeft: !state.settings.tightCommaSeparatedLists
  }) : String(value);
  if (state.settings.collapseEmptyAttributes && !value) return name;
  if (state.settings.preferUnquoted) {
    result = stringifyEntities(
      value,
      Object.assign({}, state.settings.characterReferences, {
        attribute: true,
        subset: constants.unquoted[x][y]
      })
    );
  }
  if (result !== value) {
    if (state.settings.quoteSmart && ccount(value, quote) > ccount(value, state.alternative)) {
      quote = state.alternative;
    }
    result = quote + stringifyEntities(
      value,
      Object.assign({}, state.settings.characterReferences, {
        // Always encode without parse errors in non-HTML.
        subset: (quote === "'" ? constants.single : constants.double)[x][y],
        attribute: true
      })
    ) + quote;
  }
  return name + (result ? "=" + result : result);
}

// ../../../node_modules/.pnpm/hast-util-to-html@9.0.5/node_modules/hast-util-to-html/lib/handle/text.js
var textEntitySubset = ["<", "&"];
function text(node, _, parent, state) {
  return parent && parent.type === "element" && (parent.tagName === "script" || parent.tagName === "style") ? node.value : stringifyEntities(
    node.value,
    Object.assign({}, state.settings.characterReferences, {
      subset: textEntitySubset
    })
  );
}

// ../../../node_modules/.pnpm/hast-util-to-html@9.0.5/node_modules/hast-util-to-html/lib/handle/raw.js
function raw(node, index, parent, state) {
  return state.settings.allowDangerousHtml ? node.value : text(node, index, parent, state);
}

// ../../../node_modules/.pnpm/hast-util-to-html@9.0.5/node_modules/hast-util-to-html/lib/handle/root.js
function root(node, _1, _2, state) {
  return state.all(node);
}

// ../../../node_modules/.pnpm/hast-util-to-html@9.0.5/node_modules/hast-util-to-html/lib/handle/index.js
var handle = zwitch("type", {
  invalid,
  unknown,
  handlers: { comment, doctype, element, raw, root, text }
});
function invalid(node) {
  throw new Error("Expected node, not `" + node + "`");
}
function unknown(node_) {
  const node = (
    /** @type {Nodes} */
    node_
  );
  throw new Error("Cannot compile unknown node `" + node.type + "`");
}

// ../../../node_modules/.pnpm/hast-util-to-html@9.0.5/node_modules/hast-util-to-html/lib/index.js
var emptyOptions = {};
var emptyCharacterReferences = {};
var emptyChildren2 = [];
function toHtml(tree, options) {
  const options_ = options || emptyOptions;
  const quote = options_.quote || '"';
  const alternative = quote === '"' ? "'" : '"';
  if (quote !== '"' && quote !== "'") {
    throw new Error("Invalid quote `" + quote + "`, expected `'` or `\"`");
  }
  const state = {
    one,
    all,
    settings: {
      omitOptionalTags: options_.omitOptionalTags || false,
      allowParseErrors: options_.allowParseErrors || false,
      allowDangerousCharacters: options_.allowDangerousCharacters || false,
      quoteSmart: options_.quoteSmart || false,
      preferUnquoted: options_.preferUnquoted || false,
      tightAttributes: options_.tightAttributes || false,
      upperDoctype: options_.upperDoctype || false,
      tightDoctype: options_.tightDoctype || false,
      bogusComments: options_.bogusComments || false,
      tightCommaSeparatedLists: options_.tightCommaSeparatedLists || false,
      tightSelfClosing: options_.tightSelfClosing || false,
      collapseEmptyAttributes: options_.collapseEmptyAttributes || false,
      allowDangerousHtml: options_.allowDangerousHtml || false,
      voids: options_.voids || htmlVoidElements,
      characterReferences: options_.characterReferences || emptyCharacterReferences,
      closeSelfClosing: options_.closeSelfClosing || false,
      closeEmptyElements: options_.closeEmptyElements || false
    },
    schema: options_.space === "svg" ? svg2 : html2,
    quote,
    alternative
  };
  return state.one(
    Array.isArray(tree) ? { type: "root", children: tree } : tree,
    void 0,
    void 0
  );
}
function one(node, index, parent) {
  return handle(node, index, parent, this);
}
function all(parent) {
  const results = [];
  const children = parent && parent.children || emptyChildren2;
  let index = -1;
  while (++index < children.length) {
    results[index] = this.one(children[index], index, parent);
  }
  return results.join("");
}

// ../../../node_modules/.pnpm/emoji-regex-xs@1.0.0/node_modules/emoji-regex-xs/index.mjs
var r = String.raw;
var seq = r`(?:\p{Emoji}\uFE0F\u20E3?|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Emoji_Presentation})`;
var sTags = r`\u{E0061}-\u{E007A}`;
var emoji_regex_xs_default = () => new RegExp(r`[\u{1F1E6}-\u{1F1FF}]{2}|\u{1F3F4}[${sTags}]{2}[\u{E0030}-\u{E0039}${sTags}]{1,3}\u{E007F}|${seq}(?:\u200D${seq})*`, "gu");

// ../../../node_modules/.pnpm/regex@6.0.1/node_modules/regex/src/utils-internals.js
var noncapturingDelim = String.raw`\(\?(?:[:=!>A-Za-z\-]|<[=!]|\(DEFINE\))`;
function incrementIfAtLeast(arr, threshold) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] >= threshold) {
      arr[i]++;
    }
  }
}
function spliceStr(str, pos, oldValue, newValue) {
  return str.slice(0, pos) + newValue + str.slice(pos + oldValue.length);
}

// ../../../node_modules/.pnpm/regex-utilities@2.3.0/node_modules/regex-utilities/src/index.js
var Context = Object.freeze({
  DEFAULT: "DEFAULT",
  CHAR_CLASS: "CHAR_CLASS"
});
function replaceUnescaped(expression, needle, replacement, context) {
  const re2 = new RegExp(String.raw`${needle}|(?<$skip>\[\^?|\\?.)`, "gsu");
  const negated = [false];
  let numCharClassesOpen = 0;
  let result = "";
  for (const match of expression.matchAll(re2)) {
    const { 0: m, groups: { $skip } } = match;
    if (!$skip && (!context || context === Context.DEFAULT === !numCharClassesOpen)) {
      if (replacement instanceof Function) {
        result += replacement(match, {
          context: numCharClassesOpen ? Context.CHAR_CLASS : Context.DEFAULT,
          negated: negated[negated.length - 1]
        });
      } else {
        result += replacement;
      }
      continue;
    }
    if (m[0] === "[") {
      numCharClassesOpen++;
      negated.push(m[1] === "^");
    } else if (m === "]" && numCharClassesOpen) {
      numCharClassesOpen--;
      negated.pop();
    }
    result += m;
  }
  return result;
}
function forEachUnescaped(expression, needle, callback, context) {
  replaceUnescaped(expression, needle, callback, context);
}
function execUnescaped(expression, needle, pos = 0, context) {
  if (!new RegExp(needle, "su").test(expression)) {
    return null;
  }
  const re2 = new RegExp(`${needle}|(?<$skip>\\\\?.)`, "gsu");
  re2.lastIndex = pos;
  let numCharClassesOpen = 0;
  let match;
  while (match = re2.exec(expression)) {
    const { 0: m, groups: { $skip } } = match;
    if (!$skip && (!context || context === Context.DEFAULT === !numCharClassesOpen)) {
      return match;
    }
    if (m === "[") {
      numCharClassesOpen++;
    } else if (m === "]" && numCharClassesOpen) {
      numCharClassesOpen--;
    }
    if (re2.lastIndex == match.index) {
      re2.lastIndex++;
    }
  }
  return null;
}
function hasUnescaped(expression, needle, context) {
  return !!execUnescaped(expression, needle, 0, context);
}
function getGroupContents(expression, contentsStartPos) {
  const token2 = /\\?./gsu;
  token2.lastIndex = contentsStartPos;
  let contentsEndPos = expression.length;
  let numCharClassesOpen = 0;
  let numGroupsOpen = 1;
  let match;
  while (match = token2.exec(expression)) {
    const [m] = match;
    if (m === "[") {
      numCharClassesOpen++;
    } else if (!numCharClassesOpen) {
      if (m === "(") {
        numGroupsOpen++;
      } else if (m === ")") {
        numGroupsOpen--;
        if (!numGroupsOpen) {
          contentsEndPos = match.index;
          break;
        }
      }
    } else if (m === "]") {
      numCharClassesOpen--;
    }
  }
  return expression.slice(contentsStartPos, contentsEndPos);
}

// ../../../node_modules/.pnpm/regex@6.0.1/node_modules/regex/src/atomic.js
var atomicPluginToken = new RegExp(String.raw`(?<noncapturingStart>${noncapturingDelim})|(?<capturingStart>\((?:\?<[^>]+>)?)|\\?.`, "gsu");
function atomic(expression, data) {
  const hiddenCaptures = (data == null ? void 0 : data.hiddenCaptures) ?? [];
  let captureTransfers = (data == null ? void 0 : data.captureTransfers) ?? /* @__PURE__ */ new Map();
  if (!/\(\?>/.test(expression)) {
    return {
      pattern: expression,
      captureTransfers,
      hiddenCaptures
    };
  }
  const aGDelim = "(?>";
  const emulatedAGDelim = "(?:(?=(";
  const captureNumMap = [0];
  const addedHiddenCaptures = [];
  let numCapturesBeforeAG = 0;
  let numAGs = 0;
  let aGPos = NaN;
  let hasProcessedAG;
  do {
    hasProcessedAG = false;
    let numCharClassesOpen = 0;
    let numGroupsOpenInAG = 0;
    let inAG = false;
    let match;
    atomicPluginToken.lastIndex = Number.isNaN(aGPos) ? 0 : aGPos + emulatedAGDelim.length;
    while (match = atomicPluginToken.exec(expression)) {
      const { 0: m, index, groups: { capturingStart, noncapturingStart } } = match;
      if (m === "[") {
        numCharClassesOpen++;
      } else if (!numCharClassesOpen) {
        if (m === aGDelim && !inAG) {
          aGPos = index;
          inAG = true;
        } else if (inAG && noncapturingStart) {
          numGroupsOpenInAG++;
        } else if (capturingStart) {
          if (inAG) {
            numGroupsOpenInAG++;
          } else {
            numCapturesBeforeAG++;
            captureNumMap.push(numCapturesBeforeAG + numAGs);
          }
        } else if (m === ")" && inAG) {
          if (!numGroupsOpenInAG) {
            numAGs++;
            const addedCaptureNum = numCapturesBeforeAG + numAGs;
            expression = `${expression.slice(0, aGPos)}${emulatedAGDelim}${expression.slice(aGPos + aGDelim.length, index)}))<$$${addedCaptureNum}>)${expression.slice(index + 1)}`;
            hasProcessedAG = true;
            addedHiddenCaptures.push(addedCaptureNum);
            incrementIfAtLeast(hiddenCaptures, addedCaptureNum);
            if (captureTransfers.size) {
              const newCaptureTransfers = /* @__PURE__ */ new Map();
              captureTransfers.forEach((from, to) => {
                newCaptureTransfers.set(
                  to >= addedCaptureNum ? to + 1 : to,
                  from.map((f) => f >= addedCaptureNum ? f + 1 : f)
                );
              });
              captureTransfers = newCaptureTransfers;
            }
            break;
          }
          numGroupsOpenInAG--;
        }
      } else if (m === "]") {
        numCharClassesOpen--;
      }
    }
  } while (hasProcessedAG);
  hiddenCaptures.push(...addedHiddenCaptures);
  expression = replaceUnescaped(
    expression,
    String.raw`\\(?<backrefNum>[1-9]\d*)|<\$\$(?<wrappedBackrefNum>\d+)>`,
    ({ 0: m, groups: { backrefNum, wrappedBackrefNum } }) => {
      if (backrefNum) {
        const bNum = +backrefNum;
        if (bNum > captureNumMap.length - 1) {
          throw new Error(`Backref "${m}" greater than number of captures`);
        }
        return `\\${captureNumMap[bNum]}`;
      }
      return `\\${wrappedBackrefNum}`;
    },
    Context.DEFAULT
  );
  return {
    pattern: expression,
    captureTransfers,
    hiddenCaptures
  };
}
var baseQuantifier = String.raw`(?:[?*+]|\{\d+(?:,\d*)?\})`;
var possessivePluginToken = new RegExp(String.raw`
\\(?: \d+
  | c[A-Za-z]
  | [gk]<[^>]+>
  | [pPu]\{[^\}]+\}
  | u[A-Fa-f\d]{4}
  | x[A-Fa-f\d]{2}
  )
| \((?: \? (?: [:=!>]
  | <(?:[=!]|[^>]+>)
  | [A-Za-z\-]+:
  | \(DEFINE\)
  ))?
| (?<qBase>${baseQuantifier})(?<qMod>[?+]?)(?<invalidQ>[?*+\{]?)
| \\?.
`.replace(/\s+/g, ""), "gsu");
function possessive(expression) {
  if (!new RegExp(`${baseQuantifier}\\+`).test(expression)) {
    return {
      pattern: expression
    };
  }
  const openGroupIndices = [];
  let lastGroupIndex = null;
  let lastCharClassIndex = null;
  let lastToken = "";
  let numCharClassesOpen = 0;
  let match;
  possessivePluginToken.lastIndex = 0;
  while (match = possessivePluginToken.exec(expression)) {
    const { 0: m, index, groups: { qBase, qMod, invalidQ } } = match;
    if (m === "[") {
      if (!numCharClassesOpen) {
        lastCharClassIndex = index;
      }
      numCharClassesOpen++;
    } else if (m === "]") {
      if (numCharClassesOpen) {
        numCharClassesOpen--;
      } else {
        lastCharClassIndex = null;
      }
    } else if (!numCharClassesOpen) {
      if (qMod === "+" && lastToken && !lastToken.startsWith("(")) {
        if (invalidQ) {
          throw new Error(`Invalid quantifier "${m}"`);
        }
        let charsAdded = -1;
        if (/^\{\d+\}$/.test(qBase)) {
          expression = spliceStr(expression, index + qBase.length, qMod, "");
        } else {
          if (lastToken === ")" || lastToken === "]") {
            const nodeIndex = lastToken === ")" ? lastGroupIndex : lastCharClassIndex;
            if (nodeIndex === null) {
              throw new Error(`Invalid unmatched "${lastToken}"`);
            }
            expression = `${expression.slice(0, nodeIndex)}(?>${expression.slice(nodeIndex, index)}${qBase})${expression.slice(index + m.length)}`;
          } else {
            expression = `${expression.slice(0, index - lastToken.length)}(?>${lastToken}${qBase})${expression.slice(index + m.length)}`;
          }
          charsAdded += 4;
        }
        possessivePluginToken.lastIndex += charsAdded;
      } else if (m[0] === "(") {
        openGroupIndices.push(index);
      } else if (m === ")") {
        lastGroupIndex = openGroupIndices.length ? openGroupIndices.pop() : null;
      }
    }
    lastToken = m;
  }
  return {
    pattern: expression
  };
}

// ../../../node_modules/.pnpm/regex-recursion@6.0.2/node_modules/regex-recursion/src/index.js
var r2 = String.raw;
var gRToken = r2`\\g<(?<gRNameOrNum>[^>&]+)&R=(?<gRDepth>[^>]+)>`;
var recursiveToken = r2`\(\?R=(?<rDepth>[^\)]+)\)|${gRToken}`;
var namedCaptureDelim = r2`\(\?<(?![=!])(?<captureName>[^>]+)>`;
var captureDelim = r2`${namedCaptureDelim}|(?<unnamed>\()(?!\?)`;
var token = new RegExp(r2`${namedCaptureDelim}|${recursiveToken}|\(\?|\\?.`, "gsu");
var overlappingRecursionMsg = "Cannot use multiple overlapping recursions";
function recursion(pattern, data) {
  const { hiddenCaptures, mode } = {
    hiddenCaptures: [],
    mode: "plugin",
    ...data
  };
  let captureTransfers = (data == null ? void 0 : data.captureTransfers) ?? /* @__PURE__ */ new Map();
  if (!new RegExp(recursiveToken, "su").test(pattern)) {
    return {
      pattern,
      captureTransfers,
      hiddenCaptures
    };
  }
  if (mode === "plugin" && hasUnescaped(pattern, r2`\(\?\(DEFINE\)`, Context.DEFAULT)) {
    throw new Error("DEFINE groups cannot be used with recursion");
  }
  const addedHiddenCaptures = [];
  const hasNumberedBackref = hasUnescaped(pattern, r2`\\[1-9]`, Context.DEFAULT);
  const groupContentsStartPos = /* @__PURE__ */ new Map();
  const openGroups = [];
  let hasRecursed = false;
  let numCharClassesOpen = 0;
  let numCapturesPassed = 0;
  let match;
  token.lastIndex = 0;
  while (match = token.exec(pattern)) {
    const { 0: m, groups: { captureName, rDepth, gRNameOrNum, gRDepth } } = match;
    if (m === "[") {
      numCharClassesOpen++;
    } else if (!numCharClassesOpen) {
      if (rDepth) {
        assertMaxInBounds(rDepth);
        if (hasRecursed) {
          throw new Error(overlappingRecursionMsg);
        }
        if (hasNumberedBackref) {
          throw new Error(
            // When used in `external` mode by transpilers other than Regex+, backrefs might have
            // gone through conversion from named to numbered, so avoid a misleading error
            `${mode === "external" ? "Backrefs" : "Numbered backrefs"} cannot be used with global recursion`
          );
        }
        const left = pattern.slice(0, match.index);
        const right = pattern.slice(token.lastIndex);
        if (hasUnescaped(right, recursiveToken, Context.DEFAULT)) {
          throw new Error(overlappingRecursionMsg);
        }
        const reps = +rDepth - 1;
        pattern = makeRecursive(
          left,
          right,
          reps,
          false,
          hiddenCaptures,
          addedHiddenCaptures,
          numCapturesPassed
        );
        captureTransfers = mapCaptureTransfers(
          captureTransfers,
          left,
          reps,
          addedHiddenCaptures.length,
          0,
          numCapturesPassed
        );
        break;
      } else if (gRNameOrNum) {
        assertMaxInBounds(gRDepth);
        let isWithinReffedGroup = false;
        for (const g of openGroups) {
          if (g.name === gRNameOrNum || g.num === +gRNameOrNum) {
            isWithinReffedGroup = true;
            if (g.hasRecursedWithin) {
              throw new Error(overlappingRecursionMsg);
            }
            break;
          }
        }
        if (!isWithinReffedGroup) {
          throw new Error(r2`Recursive \g cannot be used outside the referenced group "${mode === "external" ? gRNameOrNum : r2`\g<${gRNameOrNum}&R=${gRDepth}>`}"`);
        }
        const startPos = groupContentsStartPos.get(gRNameOrNum);
        const groupContents = getGroupContents(pattern, startPos);
        if (hasNumberedBackref && hasUnescaped(groupContents, r2`${namedCaptureDelim}|\((?!\?)`, Context.DEFAULT)) {
          throw new Error(
            // When used in `external` mode by transpilers other than Regex+, backrefs might have
            // gone through conversion from named to numbered, so avoid a misleading error
            `${mode === "external" ? "Backrefs" : "Numbered backrefs"} cannot be used with recursion of capturing groups`
          );
        }
        const groupContentsLeft = pattern.slice(startPos, match.index);
        const groupContentsRight = groupContents.slice(groupContentsLeft.length + m.length);
        const numAddedHiddenCapturesPreExpansion = addedHiddenCaptures.length;
        const reps = +gRDepth - 1;
        const expansion = makeRecursive(
          groupContentsLeft,
          groupContentsRight,
          reps,
          true,
          hiddenCaptures,
          addedHiddenCaptures,
          numCapturesPassed
        );
        captureTransfers = mapCaptureTransfers(
          captureTransfers,
          groupContentsLeft,
          reps,
          addedHiddenCaptures.length - numAddedHiddenCapturesPreExpansion,
          numAddedHiddenCapturesPreExpansion,
          numCapturesPassed
        );
        const pre = pattern.slice(0, startPos);
        const post = pattern.slice(startPos + groupContents.length);
        pattern = `${pre}${expansion}${post}`;
        token.lastIndex += expansion.length - m.length - groupContentsLeft.length - groupContentsRight.length;
        openGroups.forEach((g) => g.hasRecursedWithin = true);
        hasRecursed = true;
      } else if (captureName) {
        numCapturesPassed++;
        groupContentsStartPos.set(String(numCapturesPassed), token.lastIndex);
        groupContentsStartPos.set(captureName, token.lastIndex);
        openGroups.push({
          num: numCapturesPassed,
          name: captureName
        });
      } else if (m[0] === "(") {
        const isUnnamedCapture = m === "(";
        if (isUnnamedCapture) {
          numCapturesPassed++;
          groupContentsStartPos.set(String(numCapturesPassed), token.lastIndex);
        }
        openGroups.push(isUnnamedCapture ? { num: numCapturesPassed } : {});
      } else if (m === ")") {
        openGroups.pop();
      }
    } else if (m === "]") {
      numCharClassesOpen--;
    }
  }
  hiddenCaptures.push(...addedHiddenCaptures);
  return {
    pattern,
    captureTransfers,
    hiddenCaptures
  };
}
function assertMaxInBounds(max) {
  const errMsg = `Max depth must be integer between 2 and 100; used ${max}`;
  if (!/^[1-9]\d*$/.test(max)) {
    throw new Error(errMsg);
  }
  max = +max;
  if (max < 2 || max > 100) {
    throw new Error(errMsg);
  }
}
function makeRecursive(left, right, reps, isSubpattern, hiddenCaptures, addedHiddenCaptures, numCapturesPassed) {
  const namesInRecursed = /* @__PURE__ */ new Set();
  if (isSubpattern) {
    forEachUnescaped(left + right, namedCaptureDelim, ({ groups: { captureName } }) => {
      namesInRecursed.add(captureName);
    }, Context.DEFAULT);
  }
  const rest = [
    reps,
    isSubpattern ? namesInRecursed : null,
    hiddenCaptures,
    addedHiddenCaptures,
    numCapturesPassed
  ];
  return `${left}${repeatWithDepth(`(?:${left}`, "forward", ...rest)}(?:)${repeatWithDepth(`${right})`, "backward", ...rest)}${right}`;
}
function repeatWithDepth(pattern, direction, reps, namesInRecursed, hiddenCaptures, addedHiddenCaptures, numCapturesPassed) {
  const startNum = 2;
  const getDepthNum = (i) => direction === "forward" ? i + startNum : reps - i + startNum - 1;
  let result = "";
  for (let i = 0; i < reps; i++) {
    const depthNum = getDepthNum(i);
    result += replaceUnescaped(
      pattern,
      r2`${captureDelim}|\\k<(?<backref>[^>]+)>`,
      ({ 0: m, groups: { captureName, unnamed, backref } }) => {
        if (backref && namesInRecursed && !namesInRecursed.has(backref)) {
          return m;
        }
        const suffix = `_$${depthNum}`;
        if (unnamed || captureName) {
          const addedCaptureNum = numCapturesPassed + addedHiddenCaptures.length + 1;
          addedHiddenCaptures.push(addedCaptureNum);
          incrementIfAtLeast2(hiddenCaptures, addedCaptureNum);
          return unnamed ? m : `(?<${captureName}${suffix}>`;
        }
        return r2`\k<${backref}${suffix}>`;
      },
      Context.DEFAULT
    );
  }
  return result;
}
function incrementIfAtLeast2(arr, threshold) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] >= threshold) {
      arr[i]++;
    }
  }
}
function mapCaptureTransfers(captureTransfers, left, reps, numCapturesAddedInExpansion, numAddedHiddenCapturesPreExpansion, numCapturesPassed) {
  if (captureTransfers.size && numCapturesAddedInExpansion) {
    let numCapturesInLeft = 0;
    forEachUnescaped(left, captureDelim, () => numCapturesInLeft++, Context.DEFAULT);
    const recursionDelimCaptureNum = numCapturesPassed - numCapturesInLeft + numAddedHiddenCapturesPreExpansion;
    const newCaptureTransfers = /* @__PURE__ */ new Map();
    captureTransfers.forEach((from, to) => {
      const numCapturesInRight = (numCapturesAddedInExpansion - numCapturesInLeft * reps) / reps;
      const numCapturesAddedInLeft = numCapturesInLeft * reps;
      const newTo = to > recursionDelimCaptureNum + numCapturesInLeft ? to + numCapturesAddedInExpansion : to;
      const newFrom = [];
      for (const f of from) {
        if (f <= recursionDelimCaptureNum) {
          newFrom.push(f);
        } else if (f > recursionDelimCaptureNum + numCapturesInLeft + numCapturesInRight) {
          newFrom.push(f + numCapturesAddedInExpansion);
        } else if (f <= recursionDelimCaptureNum + numCapturesInLeft) {
          for (let i = 0; i <= reps; i++) {
            newFrom.push(f + numCapturesInLeft * i);
          }
        } else {
          for (let i = 0; i <= reps; i++) {
            newFrom.push(f + numCapturesAddedInLeft + numCapturesInRight * i);
          }
        }
      }
      newCaptureTransfers.set(newTo, newFrom);
    });
    return newCaptureTransfers;
  }
  return captureTransfers;
}

// ../../../node_modules/.pnpm/oniguruma-to-es@3.1.1/node_modules/oniguruma-to-es/dist/esm/index.js
var cp = String.fromCodePoint;
var r3 = String.raw;
var envFlags = {
  flagGroups: (() => {
    try {
      new RegExp("(?i:)");
    } catch {
      return false;
    }
    return true;
  })(),
  unicodeSets: (() => {
    try {
      new RegExp("", "v");
    } catch {
      return false;
    }
    return true;
  })()
};
envFlags.literalHyphenIncorrectlyCreatesRange = (() => {
  if (!envFlags.unicodeSets) {
    return false;
  }
  try {
    new RegExp(r3`[\d\-a]`, "v");
  } catch {
    return true;
  }
  return false;
})();
function getNewCurrentFlags(current, { enable, disable }) {
  return {
    dotAll: !(disable == null ? void 0 : disable.dotAll) && !!((enable == null ? void 0 : enable.dotAll) || current.dotAll),
    ignoreCase: !(disable == null ? void 0 : disable.ignoreCase) && !!((enable == null ? void 0 : enable.ignoreCase) || current.ignoreCase)
  };
}
function getOrInsert(map, key2, defaultValue) {
  if (!map.has(key2)) {
    map.set(key2, defaultValue);
  }
  return map.get(key2);
}
function isMinTarget(target, min) {
  return EsVersion[target] >= EsVersion[min];
}
function throwIfNot(value, msg) {
  if (!value) {
    throw new Error(msg ?? "Value expected");
  }
  return value;
}
var EsVersion = {
  ES2025: 2025,
  ES2024: 2024,
  ES2018: 2018
};
var Target = (
  /** @type {const} */
  {
    auto: "auto",
    ES2025: "ES2025",
    ES2024: "ES2024",
    ES2018: "ES2018"
  }
);
function getOptions(options) {
  if ((options == null ? void 0 : options.target) !== void 0 && !Target[options.target]) {
    throw new Error(`Unexpected target "${options.target}"`);
  }
  const opts = {
    // Sets the level of emulation rigor/strictness.
    accuracy: "default",
    // Disables advanced emulation that relies on returning a `RegExp` subclass, resulting in
    // certain patterns not being emulatable.
    avoidSubclass: false,
    // Oniguruma flags; a string with `i`, `m`, `x`, `D`, `S`, `W` in any order (all optional).
    // Oniguruma's `m` is equivalent to JavaScript's `s` (`dotAll`).
    flags: "",
    // Include JavaScript flag `g` (`global`) in the result.
    global: false,
    // Include JavaScript flag `d` (`hasIndices`) in the result.
    hasIndices: false,
    // Delay regex construction until first use if the transpiled pattern is at least this length.
    lazyCompileLength: Infinity,
    // JavaScript version used for generated regexes. Using `auto` detects the best value based on
    // your environment. Later targets allow faster processing, simpler generated source, and
    // support for additional features.
    target: "auto",
    // Disables optimizations that simplify the pattern when it doesn't change the meaning.
    verbose: false,
    ...options,
    // Advanced options that override standard behavior, error checking, and flags when enabled.
    rules: {
      // Useful with TextMate grammars that merge backreferences across patterns.
      allowOrphanBackrefs: false,
      // Use ASCII-based `\b` and `\B`, which increases search performance of generated regexes.
      asciiWordBoundaries: false,
      // Allow unnamed captures and numbered calls (backreferences and subroutines) when using
      // named capture. This is Oniguruma option `ONIG_OPTION_CAPTURE_GROUP`; on by default in
      // `vscode-oniguruma`.
      captureGroup: false,
      // Change the recursion depth limit from Oniguruma's `20` to an integer `2`–`20`.
      recursionLimit: 20,
      // `^` as `\A`; `$` as`\Z`. Improves search performance of generated regexes without changing
      // meaning if searching line by line. This is Oniguruma option `ONIG_OPTION_SINGLELINE`.
      singleline: false,
      ...options == null ? void 0 : options.rules
    }
  };
  if (opts.target === "auto") {
    opts.target = envFlags.flagGroups ? "ES2025" : envFlags.unicodeSets ? "ES2024" : "ES2018";
  }
  return opts;
}
var CharsWithoutIgnoreCaseExpansion = /* @__PURE__ */ new Set([
  cp(304),
  // İ
  cp(305)
  // ı
]);
function getIgnoreCaseMatchChars(char) {
  if (CharsWithoutIgnoreCaseExpansion.has(char)) {
    return [char];
  }
  const set = /* @__PURE__ */ new Set();
  const lower = char.toLowerCase();
  const upper = lower.toUpperCase();
  const title = LowerToTitleCaseMap.get(lower);
  const altLower = LowerToAlternativeLowerCaseMap.get(lower);
  const altUpper = LowerToAlternativeUpperCaseMap.get(lower);
  if ([...upper].length === 1) {
    set.add(upper);
  }
  altUpper && set.add(altUpper);
  title && set.add(title);
  set.add(lower);
  altLower && set.add(altLower);
  return [...set];
}
var JsUnicodeProperties = new Set(
  `C Other
Cc Control cntrl
Cf Format
Cn Unassigned
Co Private_Use
Cs Surrogate
L Letter
LC Cased_Letter
Ll Lowercase_Letter
Lm Modifier_Letter
Lo Other_Letter
Lt Titlecase_Letter
Lu Uppercase_Letter
M Mark Combining_Mark
Mc Spacing_Mark
Me Enclosing_Mark
Mn Nonspacing_Mark
N Number
Nd Decimal_Number digit
Nl Letter_Number
No Other_Number
P Punctuation punct
Pc Connector_Punctuation
Pd Dash_Punctuation
Pe Close_Punctuation
Pf Final_Punctuation
Pi Initial_Punctuation
Po Other_Punctuation
Ps Open_Punctuation
S Symbol
Sc Currency_Symbol
Sk Modifier_Symbol
Sm Math_Symbol
So Other_Symbol
Z Separator
Zl Line_Separator
Zp Paragraph_Separator
Zs Space_Separator
ASCII
ASCII_Hex_Digit AHex
Alphabetic Alpha
Any
Assigned
Bidi_Control Bidi_C
Bidi_Mirrored Bidi_M
Case_Ignorable CI
Cased
Changes_When_Casefolded CWCF
Changes_When_Casemapped CWCM
Changes_When_Lowercased CWL
Changes_When_NFKC_Casefolded CWKCF
Changes_When_Titlecased CWT
Changes_When_Uppercased CWU
Dash
Default_Ignorable_Code_Point DI
Deprecated Dep
Diacritic Dia
Emoji
Emoji_Component EComp
Emoji_Modifier EMod
Emoji_Modifier_Base EBase
Emoji_Presentation EPres
Extended_Pictographic ExtPict
Extender Ext
Grapheme_Base Gr_Base
Grapheme_Extend Gr_Ext
Hex_Digit Hex
IDS_Binary_Operator IDSB
IDS_Trinary_Operator IDST
ID_Continue IDC
ID_Start IDS
Ideographic Ideo
Join_Control Join_C
Logical_Order_Exception LOE
Lowercase Lower
Math
Noncharacter_Code_Point NChar
Pattern_Syntax Pat_Syn
Pattern_White_Space Pat_WS
Quotation_Mark QMark
Radical
Regional_Indicator RI
Sentence_Terminal STerm
Soft_Dotted SD
Terminal_Punctuation Term
Unified_Ideograph UIdeo
Uppercase Upper
Variation_Selector VS
White_Space space
XID_Continue XIDC
XID_Start XIDS`.split(/\s/)
);
var JsUnicodePropertiesMap = /* @__PURE__ */ new Map();
for (const p2 of JsUnicodeProperties) {
  JsUnicodePropertiesMap.set(slug(p2), p2);
}
var JsUnicodePropertiesOfStrings = /* @__PURE__ */ new Set([
  // ES2024 properties of strings; none are supported by Oniguruma
  "Basic_Emoji",
  "Emoji_Keycap_Sequence",
  "RGI_Emoji",
  "RGI_Emoji_Flag_Sequence",
  "RGI_Emoji_Modifier_Sequence",
  "RGI_Emoji_Tag_Sequence",
  "RGI_Emoji_ZWJ_Sequence"
]);
var JsUnicodePropertiesOfStringsMap = /* @__PURE__ */ new Map();
for (const p2 of JsUnicodePropertiesOfStrings) {
  JsUnicodePropertiesOfStringsMap.set(slug(p2), p2);
}
var LowerToAlternativeLowerCaseMap = /* @__PURE__ */ new Map([
  ["s", cp(383)],
  // s, ſ
  [cp(383), "s"]
  // ſ, s
]);
var LowerToAlternativeUpperCaseMap = /* @__PURE__ */ new Map([
  [cp(223), cp(7838)],
  // ß, ẞ
  [cp(107), cp(8490)],
  // k, K (Kelvin)
  [cp(229), cp(8491)],
  // å, Å (Angstrom)
  [cp(969), cp(8486)]
  // ω, Ω (Ohm)
]);
var LowerToTitleCaseMap = new Map([
  titleEntry(453),
  titleEntry(456),
  titleEntry(459),
  titleEntry(498),
  ...titleRange(8072, 8079),
  ...titleRange(8088, 8095),
  ...titleRange(8104, 8111),
  titleEntry(8124),
  titleEntry(8140),
  titleEntry(8188)
]);
var PosixClassesMap = /* @__PURE__ */ new Map([
  ["alnum", r3`[\p{Alpha}\p{Nd}]`],
  ["alpha", r3`\p{Alpha}`],
  ["ascii", r3`\p{ASCII}`],
  ["blank", r3`[\p{Zs}\t]`],
  ["cntrl", r3`\p{cntrl}`],
  ["digit", r3`\p{Nd}`],
  ["graph", r3`[\P{space}&&\P{cntrl}&&\P{Cn}&&\P{Cs}]`],
  ["lower", r3`\p{Lower}`],
  ["print", r3`[[\P{space}&&\P{cntrl}&&\P{Cn}&&\P{Cs}]\p{Zs}]`],
  ["punct", r3`[\p{P}\p{S}]`],
  // New value from Oniguruma 6.9.9
  ["space", r3`\p{space}`],
  ["upper", r3`\p{Upper}`],
  ["word", r3`[\p{Alpha}\p{M}\p{Nd}\p{Pc}]`],
  ["xdigit", r3`\p{AHex}`]
]);
var PosixProperties = /* @__PURE__ */ new Set([
  "alnum",
  "blank",
  "graph",
  "print",
  "word",
  "xdigit"
  // The following are available with the same name in JS (see `JsUnicodeProperties`), so can be
  // handled as standard Unicode properties
  // 'alpha', // (JS: Alpha)
  // 'ascii', // (JS: ASCII)
  // 'cntrl', // (JS: cntrl)
  // 'digit', // (JS: digit)
  // 'lower', // (JS: Lower)
  // 'punct', // (JS: punct)
  // 'space', // (JS: space)
  // 'upper', // (JS: Upper)
]);
function range(start, end) {
  const range2 = [];
  for (let i = start; i <= end; i++) {
    range2.push(i);
  }
  return range2;
}
function slug(name) {
  return name.replace(/[- _]+/g, "").toLowerCase();
}
function titleEntry(codePoint) {
  const char = cp(codePoint);
  return [char.toLowerCase(), char];
}
function titleRange(start, end) {
  return range(start, end).map((codePoint) => titleEntry(codePoint));
}
var UnicodePropertiesWithSpecificCase = /* @__PURE__ */ new Set([
  "Lower",
  "Lowercase",
  "Upper",
  "Uppercase",
  "Ll",
  "Lowercase_Letter",
  "Lt",
  "Titlecase_Letter",
  "Lu",
  "Uppercase_Letter"
  // The `Changes_When_*` properties (and their aliases) could be included, but they're very rare.
  // Some other properties include a handful of chars with specific cases only, but these chars are
  // generally extreme edge cases and using such properties case insensitively generally produces
  // undesired behavior anyway
]);
var TokenTypes = (
  /** @type {const} */
  {
    Alternator: "Alternator",
    Assertion: "Assertion",
    Backreference: "Backreference",
    Character: "Character",
    CharacterClassClose: "CharacterClassClose",
    CharacterClassHyphen: "CharacterClassHyphen",
    CharacterClassIntersector: "CharacterClassIntersector",
    CharacterClassOpen: "CharacterClassOpen",
    CharacterSet: "CharacterSet",
    Directive: "Directive",
    GroupClose: "GroupClose",
    GroupOpen: "GroupOpen",
    Subroutine: "Subroutine",
    Quantifier: "Quantifier",
    // These aren't allowed in char classes, so they aren't equivalent to JS `[\q{}]`
    VariableLengthCharacterSet: "VariableLengthCharacterSet",
    // Intermediate representation not included in results
    EscapedNumber: "EscapedNumber"
  }
);
var TokenCharacterSetKinds = {
  any: "any",
  digit: "digit",
  dot: "dot",
  hex: "hex",
  non_newline: "non_newline",
  posix: "posix",
  property: "property",
  space: "space",
  word: "word"
};
var TokenDirectiveKinds = {
  flags: "flags",
  keep: "keep"
};
var TokenGroupKinds = {
  absent_repeater: "absent_repeater",
  atomic: "atomic",
  capturing: "capturing",
  group: "group",
  lookahead: "lookahead",
  lookbehind: "lookbehind"
};
var EscapeCharCodes = /* @__PURE__ */ new Map([
  ["a", 7],
  // alert/bell (Not available in JS)
  ["b", 8],
  // backspace (only in char classes)
  ["e", 27],
  // escape (Not available in JS)
  ["f", 12],
  // form feed
  ["n", 10],
  // line feed
  ["r", 13],
  // carriage return
  ["t", 9],
  // horizontal tab
  ["v", 11]
  // vertical tab
]);
var charClassOpenPattern = r3`\[\^?`;
var sharedEscapesPattern = `${// Control char
"c.? | C(?:-.?)?"}|${// Unicode property; Onig considers `\p` an identity escape, but e.g. `\p{`, `\p{ ^L}`, and
// `\p{gc=L}` are invalid
r3`[pP]\{(?:\^?[-\x20_]*[A-Za-z][-\x20\w]*\})?`}|${// Hex encoded byte sequence; attempt match before other `\xNN` hex char
r3`x[89A-Fa-f]\p{AHex}(?:\\x[89A-Fa-f]\p{AHex})*`}|${// Hex char
r3`u(?:\p{AHex}{4})? | x\{[^\}]*\}? | x\p{AHex}{0,2}`}|${// Enclosed octal code point
r3`o\{[^\}]*\}?`}|${// Escaped number
r3`\d{1,3}`}`;
var quantifierRe = /[?*+][?+]?|\{(?:\d+(?:,\d*)?|,\d+)\}\??/;
var tokenRe = new RegExp(r3`
  \\ (?:
    ${sharedEscapesPattern}
    | [gk]<[^>]*>?
    | [gk]'[^']*'?
    | .
  )
  | \( (?:
    \? (?:
      [:=!>({]
      | <[=!]
      | <[^>]*>
      | '[^']*'
      | ~\|?
      | #(?:[^)\\]|\\.?)*
      | [^:)]*[:)]
    )?
    | \*
  )?
  | ${quantifierRe.source}
  | ${charClassOpenPattern}
  | .
`.replace(/\s+/g, ""), "gsu");
var charClassTokenRe = new RegExp(r3`
  \\ (?:
    ${sharedEscapesPattern}
    | .
  )
  | \[:(?:\^?\p{Alpha}+|\^):\]
  | ${charClassOpenPattern}
  | &&
  | .
`.replace(/\s+/g, ""), "gsu");
function tokenize(pattern, flags = "", rules) {
  rules = {
    // `ONIG_OPTION_CAPTURE_GROUP`
    captureGroup: false,
    // `ONIG_OPTION_SINGLELINE`
    singleline: false,
    ...rules
  };
  if (typeof pattern !== "string") {
    throw new Error("String expected as pattern");
  }
  if (!/^[imxDSW]*$/.test(flags)) {
    throw new Error(`Flags "${flags}" includes unsupported value`);
  }
  const extended = flags.includes("x");
  const xStack = [extended];
  const context = {
    captureGroup: rules.captureGroup,
    getCurrentModX: () => xStack.at(-1),
    numOpenGroups: 0,
    popModX() {
      xStack.pop();
    },
    pushModX(isXOn) {
      xStack.push(isXOn);
    },
    replaceCurrentModX(isXOn) {
      xStack[xStack.length - 1] = isXOn;
    },
    singleline: rules.singleline
  };
  let tokens = [];
  let match;
  tokenRe.lastIndex = 0;
  while (match = tokenRe.exec(pattern)) {
    const result = getTokenWithDetails(context, pattern, match[0], tokenRe.lastIndex);
    if (result.tokens) {
      tokens.push(...result.tokens);
    } else if (result.token) {
      tokens.push(result.token);
    }
    if (result.lastIndex !== void 0) {
      tokenRe.lastIndex = result.lastIndex;
    }
  }
  const potentialUnnamedCaptureTokens = [];
  let numNamedAndOptInUnnamedCaptures = 0;
  tokens.forEach((t) => {
    if (t.type === TokenTypes.GroupOpen) {
      if (t.kind === TokenGroupKinds.capturing) {
        t.number = ++numNamedAndOptInUnnamedCaptures;
      } else if (t.raw === "(") {
        potentialUnnamedCaptureTokens.push(t);
      }
    }
  });
  if (!numNamedAndOptInUnnamedCaptures) {
    potentialUnnamedCaptureTokens.forEach((t, i) => {
      t.kind = TokenGroupKinds.capturing;
      t.number = i + 1;
    });
  }
  const numCaptures = numNamedAndOptInUnnamedCaptures || potentialUnnamedCaptureTokens.length;
  tokens = tokens.map(
    (t) => t.type === TokenTypes.EscapedNumber ? splitEscapedNumToken(t, numCaptures) : t
  ).flat();
  return {
    tokens,
    flags: {
      ignoreCase: flags.includes("i"),
      // Flag m is called `multiline` in Onig, but that has a different meaning in JS. Onig flag m
      // is equivalent to JS flag s
      dotAll: flags.includes("m"),
      // Flag x is fully handled during tokenization
      extended,
      // Flags D, S, W are currently only supported as top-level flags
      digitIsAscii: flags.includes("D"),
      spaceIsAscii: flags.includes("S"),
      wordIsAscii: flags.includes("W")
    },
    rules
  };
}
function getTokenWithDetails(context, pattern, m, lastIndex) {
  const [m0, m1] = m;
  if (m0 === "[") {
    const result = getAllTokensForCharClass(pattern, m, lastIndex);
    return {
      // Array of all of the char class's tokens
      tokens: result.tokens,
      // Jump forward to the end of the char class
      lastIndex: result.lastIndex
    };
  }
  if (m0 === "\\") {
    if ("AbBGzZ".includes(m1)) {
      return {
        token: createToken(TokenTypes.Assertion, m, {
          kind: m
        })
      };
    }
    if (/^\\g[<']/.test(m)) {
      if (!/^\\g(?:<[^>]+>|'[^']+')$/.test(m)) {
        throw new Error(`Invalid group name "${m}"`);
      }
      return {
        token: createToken(TokenTypes.Subroutine, m)
      };
    }
    if (/^\\k[<']/.test(m)) {
      if (!/^\\k(?:<[^>]+>|'[^']+')$/.test(m)) {
        throw new Error(`Invalid group name "${m}"`);
      }
      return {
        token: createToken(TokenTypes.Backreference, m)
      };
    }
    if (m1 === "K") {
      return {
        token: createToken(TokenTypes.Directive, m, {
          kind: TokenDirectiveKinds.keep
        })
      };
    }
    if (m1 === "N") {
      return {
        token: createToken(TokenTypes.CharacterSet, m, {
          kind: TokenCharacterSetKinds.non_newline
        })
      };
    }
    if (m1 === "O") {
      return {
        token: createToken(TokenTypes.CharacterSet, m, {
          kind: TokenCharacterSetKinds.any
        })
      };
    }
    if ("RX".includes(m1)) {
      return {
        token: createToken(TokenTypes.VariableLengthCharacterSet, m, {
          kind: m
        })
      };
    }
    if ("yY".includes(m1)) {
      throw new Error(`Unsupported grapheme boundary "${m}"`);
    }
    const result = createTokenForSharedEscape(m, { inCharClass: false });
    return Array.isArray(result) ? { tokens: result } : { token: result };
  }
  if (m0 === "(") {
    if (m === "(*") {
      throw new Error(`Unsupported named callout "${m}"`);
    }
    if (m === "(?{") {
      throw new Error(`Unsupported callout "${m}"`);
    }
    if (m === "(?#") {
      if (pattern[lastIndex] !== ")") {
        throw new Error('Unclosed comment group "(?#"');
      }
      return {
        lastIndex: lastIndex + 1
      };
    }
    if (/^\(\?[-imx]+[:)]$/.test(m)) {
      return {
        token: createTokenForFlagMod(m, context)
      };
    }
    context.pushModX(context.getCurrentModX());
    context.numOpenGroups++;
    if (
      // Unnamed capture if no named captures present and `captureGroup` not enabled, else
      // noncapturing group
      m === "(" && !context.captureGroup || // Noncapturing group
      m === "(?:"
    ) {
      return {
        token: createToken(TokenTypes.GroupOpen, m, {
          // For `(`, will later change to `capturing` and add `number` prop if no named captures
          kind: TokenGroupKinds.group
        })
      };
    }
    if (m === "(?>") {
      return {
        token: createToken(TokenTypes.GroupOpen, m, {
          kind: TokenGroupKinds.atomic
        })
      };
    }
    if (m === "(?=" || m === "(?!" || m === "(?<=" || m === "(?<!") {
      return {
        token: createToken(TokenTypes.GroupOpen, m, {
          kind: m[2] === "<" ? TokenGroupKinds.lookbehind : TokenGroupKinds.lookahead,
          negate: m.endsWith("!")
        })
      };
    }
    if (m === "(" && context.captureGroup || m.startsWith("(?<") && m.endsWith(">") || m.startsWith("(?'") && m.endsWith("'")) {
      const token2 = createToken(TokenTypes.GroupOpen, m, {
        kind: TokenGroupKinds.capturing
        // Will add `number` prop in a second pass
      });
      if (m !== "(") {
        token2.name = m.slice(3, -1);
      }
      return {
        token: token2
      };
    }
    if (m.startsWith("(?~")) {
      if (m === "(?~|") {
        throw new Error(`Unsupported absent function kind "${m}"`);
      }
      return {
        token: createToken(TokenTypes.GroupOpen, m, {
          kind: TokenGroupKinds.absent_repeater
        })
      };
    }
    if (m === "(?(") {
      throw new Error(`Unsupported conditional "${m}"`);
    }
    throw new Error(`Invalid or unsupported group option "${m}"`);
  }
  if (m === ")") {
    context.popModX();
    context.numOpenGroups--;
    if (context.numOpenGroups < 0) {
      throw new Error('Unmatched ")"');
    }
    return {
      token: createToken(TokenTypes.GroupClose, m)
    };
  }
  if (m === "#" && context.getCurrentModX()) {
    const end = pattern.indexOf("\n", lastIndex);
    return {
      // Jump forward to the end of the comment
      lastIndex: end === -1 ? pattern.length : end
    };
  }
  if (/^\s$/.test(m) && context.getCurrentModX()) {
    const re2 = /\s+/y;
    re2.lastIndex = lastIndex;
    const rest = re2.exec(pattern);
    return {
      // Jump forward to the end of the whitespace
      lastIndex: rest ? re2.lastIndex : lastIndex
    };
  }
  if (m === ".") {
    return {
      token: createToken(TokenTypes.CharacterSet, m, {
        kind: TokenCharacterSetKinds.dot
      })
    };
  }
  if (m === "^" || m === "$") {
    const kind = context.singleline ? {
      "^": r3`\A`,
      "$": r3`\Z`
    }[m] : m;
    return {
      token: createToken(TokenTypes.Assertion, m, {
        kind
      })
    };
  }
  if (m === "|") {
    return {
      token: createToken(TokenTypes.Alternator, m)
    };
  }
  if (quantifierRe.test(m)) {
    return {
      token: createTokenForQuantifier(m)
    };
  }
  assertSingleCodePoint(m);
  return {
    token: createToken(TokenTypes.Character, m, {
      value: m.codePointAt(0)
    })
  };
}
function getAllTokensForCharClass(pattern, opener, lastIndex) {
  const tokens = [createToken(TokenTypes.CharacterClassOpen, opener, {
    negate: opener[1] === "^"
  })];
  let numCharClassesOpen = 1;
  let match;
  charClassTokenRe.lastIndex = lastIndex;
  while (match = charClassTokenRe.exec(pattern)) {
    const m = match[0];
    if (m[0] === "[" && m[1] !== ":") {
      numCharClassesOpen++;
      tokens.push(createToken(TokenTypes.CharacterClassOpen, m, {
        negate: m[1] === "^"
      }));
    } else if (m === "]") {
      if (tokens.at(-1).type === TokenTypes.CharacterClassOpen) {
        tokens.push(createToken(TokenTypes.Character, m, {
          value: 93
        }));
      } else {
        numCharClassesOpen--;
        tokens.push(createToken(TokenTypes.CharacterClassClose, m));
        if (!numCharClassesOpen) {
          break;
        }
      }
    } else {
      const result = createTokenForAnyTokenWithinCharClass(m);
      if (Array.isArray(result)) {
        tokens.push(...result);
      } else {
        tokens.push(result);
      }
    }
  }
  return {
    tokens,
    lastIndex: charClassTokenRe.lastIndex || pattern.length
  };
}
function createTokenForAnyTokenWithinCharClass(raw2) {
  if (raw2[0] === "\\") {
    return createTokenForSharedEscape(raw2, { inCharClass: true });
  }
  if (raw2[0] === "[") {
    const posix = /\[:(?<negate>\^?)(?<name>[a-z]+):\]/.exec(raw2);
    if (!posix || !PosixClassesMap.get(posix.groups.name)) {
      throw new Error(`Invalid POSIX class "${raw2}"`);
    }
    return createToken(TokenTypes.CharacterSet, raw2, {
      kind: TokenCharacterSetKinds.posix,
      negate: !!posix.groups.negate,
      value: posix.groups.name
    });
  }
  if (raw2 === "-") {
    return createToken(TokenTypes.CharacterClassHyphen, raw2);
  }
  if (raw2 === "&&") {
    return createToken(TokenTypes.CharacterClassIntersector, raw2);
  }
  assertSingleCodePoint(raw2);
  return createToken(TokenTypes.Character, raw2, {
    value: raw2.codePointAt(0)
  });
}
function createTokenForSharedEscape(raw2, { inCharClass }) {
  const char1 = raw2[1];
  if (char1 === "c" || char1 === "C") {
    return createTokenForControlChar(raw2);
  }
  if ("dDhHsSwW".includes(char1)) {
    return createTokenForShorthandCharClass(raw2);
  }
  if (raw2.startsWith(r3`\o{`)) {
    throw new Error(`Incomplete, invalid, or unsupported octal code point "${raw2}"`);
  }
  if (/^\\[pP]\{/.test(raw2)) {
    if (raw2.length === 3) {
      throw new Error(`Incomplete or invalid Unicode property "${raw2}"`);
    }
    return createTokenForUnicodeProperty(raw2);
  }
  if (new RegExp("^\\\\x[89A-Fa-f]\\p{AHex}", "u").test(raw2)) {
    try {
      const bytes = raw2.split(/\\x/).slice(1).map((hex) => parseInt(hex, 16));
      const decoded = new TextDecoder("utf-8", {
        ignoreBOM: true,
        fatal: true
      }).decode(new Uint8Array(bytes));
      const encoder = new TextEncoder();
      const tokens = [...decoded].map((char) => {
        const raw22 = [...encoder.encode(char)].map((byte) => `\\x${byte.toString(16)}`).join("");
        return createToken(TokenTypes.Character, raw22, {
          value: char.codePointAt(0)
        });
      });
      return tokens;
    } catch {
      throw new Error(`Multibyte code "${raw2}" incomplete or invalid in Oniguruma`);
    }
  }
  if (char1 === "u" || char1 === "x") {
    return createToken(TokenTypes.Character, raw2, {
      value: getValidatedHexCharCode(raw2)
    });
  }
  if (EscapeCharCodes.has(char1)) {
    return createToken(TokenTypes.Character, raw2, {
      value: EscapeCharCodes.get(char1)
    });
  }
  if (/\d/.test(char1)) {
    return createToken(TokenTypes.EscapedNumber, raw2, {
      inCharClass
    });
  }
  if (raw2 === "\\") {
    throw new Error(r3`Incomplete escape "\"`);
  }
  if (char1 === "M") {
    throw new Error(`Unsupported meta "${raw2}"`);
  }
  if ([...raw2].length === 2) {
    return createToken(TokenTypes.Character, raw2, {
      value: raw2.codePointAt(1)
    });
  }
  throw new Error(`Unexpected escape "${raw2}"`);
}
function createToken(type, raw2, data) {
  return {
    type,
    raw: raw2,
    ...data
  };
}
function createTokenForControlChar(raw2) {
  const char = raw2[1] === "c" ? raw2[2] : raw2[3];
  if (!char || !/[A-Za-z]/.test(char)) {
    throw new Error(`Unsupported control character "${raw2}"`);
  }
  return createToken(TokenTypes.Character, raw2, {
    value: char.toUpperCase().codePointAt(0) - 64
  });
}
function createTokenForFlagMod(raw2, context) {
  let { on, off } = /^\(\?(?<on>[imx]*)(?:-(?<off>[-imx]*))?/.exec(raw2).groups;
  off ?? (off = "");
  const isXOn = (context.getCurrentModX() || on.includes("x")) && !off.includes("x");
  const enabledFlags = getFlagPropsForToken(on);
  const disabledFlags = getFlagPropsForToken(off);
  const flagChanges = {};
  enabledFlags && (flagChanges.enable = enabledFlags);
  disabledFlags && (flagChanges.disable = disabledFlags);
  if (raw2.endsWith(")")) {
    context.replaceCurrentModX(isXOn);
    return createToken(TokenTypes.Directive, raw2, {
      kind: TokenDirectiveKinds.flags,
      flags: flagChanges
    });
  }
  if (raw2.endsWith(":")) {
    context.pushModX(isXOn);
    context.numOpenGroups++;
    const token2 = createToken(TokenTypes.GroupOpen, raw2, {
      kind: TokenGroupKinds.group
    });
    if (enabledFlags || disabledFlags) {
      token2.flags = flagChanges;
    }
    return token2;
  }
  throw new Error(`Unexpected flag modifier "${raw2}"`);
}
function createTokenForQuantifier(raw2) {
  const data = {};
  if (raw2[0] === "{") {
    const { min, max } = /^\{(?<min>\d*)(?:,(?<max>\d*))?/.exec(raw2).groups;
    const limit = 1e5;
    if (+min > limit || +max > limit) {
      throw new Error("Quantifier value unsupported in Oniguruma");
    }
    data.min = +min;
    data.max = max === void 0 ? +min : max === "" ? Infinity : +max;
    data.greedy = !raw2.endsWith("?");
    data.possessive = false;
  } else {
    data.min = raw2[0] === "+" ? 1 : 0;
    data.max = raw2[0] === "?" ? 1 : Infinity;
    data.greedy = raw2[1] !== "?";
    data.possessive = raw2[1] === "+";
  }
  return createToken(TokenTypes.Quantifier, raw2, data);
}
function createTokenForShorthandCharClass(raw2) {
  const lower = raw2[1].toLowerCase();
  return createToken(TokenTypes.CharacterSet, raw2, {
    kind: {
      "d": TokenCharacterSetKinds.digit,
      "h": TokenCharacterSetKinds.hex,
      // Not available in JS
      "s": TokenCharacterSetKinds.space,
      // Different than JS
      "w": TokenCharacterSetKinds.word
    }[lower],
    negate: raw2[1] !== lower
  });
}
function createTokenForUnicodeProperty(raw2) {
  const { p: p2, neg, value } = /^\\(?<p>[pP])\{(?<neg>\^?)(?<value>[^}]+)/.exec(raw2).groups;
  const negate = p2 === "P" && !neg || p2 === "p" && !!neg;
  return createToken(TokenTypes.CharacterSet, raw2, {
    kind: TokenCharacterSetKinds.property,
    negate,
    value
  });
}
function getFlagPropsForToken(flags) {
  const obj = {};
  if (flags.includes("i")) {
    obj.ignoreCase = true;
  }
  if (flags.includes("m")) {
    obj.dotAll = true;
  }
  if (flags.includes("x")) {
    obj.extended = true;
  }
  return Object.keys(obj).length ? obj : null;
}
function getValidatedHexCharCode(raw2) {
  if (new RegExp("^(?:\\\\u(?!\\p{AHex}{4})|\\\\x(?!\\p{AHex}{1,2}|\\{\\p{AHex}{1,8}\\}))", "u").test(raw2)) {
    throw new Error(`Incomplete or invalid escape "${raw2}"`);
  }
  const hex = raw2[2] === "{" ? new RegExp("^\\\\x\\{\\s*(?<hex>\\p{AHex}+)", "u").exec(raw2).groups.hex : raw2.slice(2);
  const dec = parseInt(hex, 16);
  return dec;
}
function splitEscapedNumToken(token2, numCaptures) {
  const { raw: raw2, inCharClass } = token2;
  const value = raw2.slice(1);
  if (!inCharClass && // Single digit 1-9 outside a char class is always treated as a backref
  (value !== "0" && value.length === 1 || // Leading 0 makes it octal; backrefs can't include following literal digits
  value[0] !== "0" && +value <= numCaptures)) {
    return [createToken(TokenTypes.Backreference, raw2)];
  }
  const tokens = [];
  const matches2 = value.match(/^[0-7]+|\d/g);
  for (let i = 0; i < matches2.length; i++) {
    const m = matches2[i];
    let value2;
    if (i === 0 && m !== "8" && m !== "9") {
      value2 = parseInt(m, 8);
      if (value2 > 127) {
        throw new Error(r3`Octal encoded byte above 177 unsupported "${raw2}"`);
      }
    } else {
      value2 = m.codePointAt(0);
    }
    tokens.push(createToken(TokenTypes.Character, (i === 0 ? "\\" : "") + m, {
      value: value2
    }));
  }
  return tokens;
}
function assertSingleCodePoint(raw2) {
  if ([...raw2].length !== 1) {
    throw new Error(`Expected "${raw2}" to be a single code point`);
  }
}
function hasOnlyChild({ alternatives }, kidFn) {
  return alternatives.length === 1 && alternatives[0].elements.length === 1 && (!kidFn || kidFn(alternatives[0].elements[0]));
}
function isAlwaysZeroLength({ type }) {
  return type === AstTypes.Assertion || type === AstTypes.Directive;
}
function isAlwaysNonZeroLength(node) {
  const types = [
    AstTypes.Character,
    AstTypes.CharacterClass,
    AstTypes.CharacterSet
  ];
  return types.includes(node.type) || node.type === AstTypes.Quantifier && node.min && types.includes(node.element.type);
}
function isConsumptiveGroup({ type }) {
  return type === AstTypes.CapturingGroup || type === AstTypes.Group;
}
function isLookaround({ type, kind }) {
  return type === AstTypes.Assertion && (kind === AstAssertionKinds.lookahead || kind === AstAssertionKinds.lookbehind);
}
function traverse(path, state, visitor) {
  let ast = path.node;
  while (ast.parent) {
    ast = ast.parent;
  }
  function traverseArray(array, parent) {
    for (let i = 0; i < array.length; i++) {
      const keyShift = traverseNode(array[i], parent, i, array);
      i = Math.max(-1, i + keyShift);
    }
  }
  function traverseNode(node, parent = null, key2 = null, container = null) {
    let keyShift = 0;
    let skipTraversingKidsOfPath = false;
    const path2 = {
      node,
      parent,
      key: key2,
      container,
      ast,
      remove() {
        throwIfNot(container, "Container expected").splice(Math.max(0, key2 + keyShift), 1);
        keyShift -= 1;
      },
      removeAllNextSiblings() {
        return throwIfNot(container, "Container expected").splice(key2 + 1);
      },
      removeAllPrevSiblings() {
        const shifted = key2 + keyShift;
        keyShift -= shifted;
        return throwIfNot(container, "Container expected").splice(0, Math.max(0, shifted));
      },
      replaceWith(newNode) {
        setParent(newNode, parent);
        if (container) {
          container[Math.max(0, key2 + keyShift)] = newNode;
        } else {
          parent[key2] = newNode;
        }
      },
      skip() {
        skipTraversingKidsOfPath = true;
      }
    };
    const visitorKey = getAstTypeAliases(node).find((key22) => !!visitor[key22]);
    const methods = visitorKey && visitor[visitorKey];
    const enterFn = typeof methods === "function" ? methods : methods == null ? void 0 : methods.enter;
    const exitFn = methods == null ? void 0 : methods.exit;
    enterFn == null ? void 0 : enterFn(path2, state);
    if (!skipTraversingKidsOfPath) {
      switch (node.type) {
        case AstTypes.Regex:
          traverseNode(node.pattern, node, "pattern");
          traverseNode(node.flags, node, "flags");
          break;
        case AstTypes.Alternative:
        case AstTypes.CharacterClass:
          traverseArray(node.elements, node);
          break;
        case AstTypes.Assertion:
          if (isLookaround(node)) {
            traverseArray(node.alternatives, node);
          }
          break;
        case AstTypes.Backreference:
        case AstTypes.Character:
        case AstTypes.CharacterSet:
        case AstTypes.Directive:
        case AstTypes.Flags:
        case AstTypes.Recursion:
        case AstTypes.Subroutine:
        case AstTypes.VariableLengthCharacterSet:
          break;
        case AstTypes.AbsentFunction:
        case AstTypes.CapturingGroup:
        case AstTypes.Group:
        case AstTypes.Pattern:
          traverseArray(node.alternatives, node);
          break;
        case AstTypes.CharacterClassIntersection:
          traverseArray(node.classes, node);
          break;
        case AstTypes.CharacterClassRange:
          traverseNode(node.min, node, "min");
          traverseNode(node.max, node, "max");
          break;
        case AstTypes.Quantifier:
          traverseNode(node.element, node, "element");
          break;
        default:
          throw new Error(`Unexpected node type "${node.type}"`);
      }
    }
    exitFn == null ? void 0 : exitFn(path2, state);
    return keyShift;
  }
  traverseNode(path.node, path.parent, path.key, path.container);
}
var AstTypeAliases = {
  AnyGroup: "AnyGroup",
  AnyNode: "AnyNode"
};
function getAstTypeAliases(node) {
  const types = [AstTypeAliases.AnyNode];
  if (isConsumptiveGroup(node) || isLookaround(node)) {
    types.push(AstTypeAliases.AnyGroup);
  }
  types.push(node.type);
  return types;
}
function setParent(node, parent) {
  if ("parent" in parent) {
    node.parent = parent;
  }
}
var AstTypes = {
  AbsentFunction: "AbsentFunction",
  Alternative: "Alternative",
  Assertion: "Assertion",
  Backreference: "Backreference",
  CapturingGroup: "CapturingGroup",
  Character: "Character",
  CharacterClass: "CharacterClass",
  CharacterClassIntersection: "CharacterClassIntersection",
  CharacterClassRange: "CharacterClassRange",
  CharacterSet: "CharacterSet",
  Directive: "Directive",
  Flags: "Flags",
  Group: "Group",
  Pattern: "Pattern",
  Quantifier: "Quantifier",
  Regex: "Regex",
  Subroutine: "Subroutine",
  VariableLengthCharacterSet: "VariableLengthCharacterSet",
  // Used only by the transformer for Regex+ ASTs
  Recursion: "Recursion"
};
var AstAbsentFunctionKinds = {
  // See <github.com/slevithan/oniguruma-to-es/issues/13>
  repeater: "repeater"
};
var AstAssertionKinds = {
  line_end: "line_end",
  line_start: "line_start",
  lookahead: "lookahead",
  lookbehind: "lookbehind",
  search_start: "search_start",
  string_end: "string_end",
  string_end_newline: "string_end_newline",
  string_start: "string_start",
  word_boundary: "word_boundary"
};
var AstCharacterSetKinds = TokenCharacterSetKinds;
var AstDirectiveKinds = TokenDirectiveKinds;
var AstVariableLengthCharacterSetKinds = {
  grapheme: "grapheme",
  newline: "newline"
};
function parse({ tokens, flags, rules }, options) {
  const opts = {
    skipBackrefValidation: false,
    skipLookbehindValidation: false,
    skipPropertyNameValidation: false,
    verbose: false,
    ...options
  };
  const context = {
    capturingGroups: [],
    current: 0,
    hasNumberedRef: false,
    namedGroupsByName: /* @__PURE__ */ new Map(),
    parent: null,
    skipBackrefValidation: opts.skipBackrefValidation,
    skipLookbehindValidation: opts.skipLookbehindValidation,
    skipPropertyNameValidation: opts.skipPropertyNameValidation,
    subroutines: [],
    token: null,
    tokens,
    verbose: opts.verbose,
    walk
  };
  function walk(parent, state) {
    const token2 = tokens[context.current];
    context.parent = parent;
    context.token = token2;
    context.current++;
    switch (token2.type) {
      case TokenTypes.Alternator:
        return createAlternative();
      case TokenTypes.Assertion:
        return createAssertionFromToken(token2);
      case TokenTypes.Backreference:
        return parseBackreference(context);
      case TokenTypes.Character:
        return createCharacter(token2.value, { useLastValid: !!state.isCheckingRangeEnd });
      case TokenTypes.CharacterClassHyphen:
        return parseCharacterClassHyphen(context, state);
      case TokenTypes.CharacterClassOpen:
        return parseCharacterClassOpen(context, state);
      case TokenTypes.CharacterSet:
        return parseCharacterSet(context);
      case TokenTypes.Directive:
        return createDirectiveFromToken(token2);
      case TokenTypes.GroupOpen:
        return parseGroupOpen(context, state);
      case TokenTypes.Quantifier:
        return parseQuantifier(context);
      case TokenTypes.Subroutine:
        return parseSubroutine(context);
      case TokenTypes.VariableLengthCharacterSet:
        return createVariableLengthCharacterSet(token2.kind);
      default:
        throw new Error(`Unexpected token type "${token2.type}"`);
    }
  }
  const ast = createRegex(createPattern(), createFlags(flags));
  let top = ast.pattern.alternatives[0];
  while (context.current < tokens.length) {
    const node = walk(top, {});
    if (node.type === AstTypes.Alternative) {
      ast.pattern.alternatives.push(node);
      top = node;
    } else {
      top.elements.push(node);
    }
  }
  const { capturingGroups, hasNumberedRef, namedGroupsByName, subroutines } = context;
  if (hasNumberedRef && namedGroupsByName.size && !rules.captureGroup) {
    throw new Error("Numbered backref/subroutine not allowed when using named capture");
  }
  for (const { ref } of subroutines) {
    if (typeof ref === "number") {
      if (ref > capturingGroups.length) {
        throw new Error(`Subroutine uses a group number that's not defined`);
      }
    } else if (!namedGroupsByName.has(ref)) {
      throw new Error(r3`Subroutine uses a group name that's not defined "\g<${ref}>"`);
    } else if (namedGroupsByName.get(ref).length > 1) {
      throw new Error(r3`Subroutine uses a duplicate group name "\g<${ref}>"`);
    }
  }
  traverse({ node: ast }, null, {
    AnyNode({ node, parent }) {
      node.parent = parent;
    }
  });
  return ast;
}
function parseBackreference(context) {
  const { raw: raw2 } = context.token;
  const hasKWrapper = /^\\k[<']/.test(raw2);
  const ref = hasKWrapper ? raw2.slice(3, -1) : raw2.slice(1);
  const fromNum = (num, isRelative = false) => {
    const numCapturesToLeft = context.capturingGroups.length;
    let orphan = false;
    if (num > numCapturesToLeft) {
      if (context.skipBackrefValidation) {
        orphan = true;
      } else {
        throw new Error(`Not enough capturing groups defined to the left "${raw2}"`);
      }
    }
    context.hasNumberedRef = true;
    return createBackreference(isRelative ? numCapturesToLeft + 1 - num : num, { orphan });
  };
  if (hasKWrapper) {
    const numberedRef = /^(?<sign>-?)0*(?<num>[1-9]\d*)$/.exec(ref);
    if (numberedRef) {
      return fromNum(+numberedRef.groups.num, !!numberedRef.groups.sign);
    }
    if (/[-+]/.test(ref)) {
      throw new Error(`Invalid backref name "${raw2}"`);
    }
    if (!context.namedGroupsByName.has(ref)) {
      throw new Error(`Group name not defined to the left "${raw2}"`);
    }
    return createBackreference(ref);
  }
  return fromNum(+ref);
}
function parseCharacterClassHyphen(context, state) {
  const { parent, tokens, walk } = context;
  const prevSiblingNode = parent.elements.at(-1);
  const nextToken = tokens[context.current];
  if (!state.isCheckingRangeEnd && prevSiblingNode && prevSiblingNode.type !== AstTypes.CharacterClass && prevSiblingNode.type !== AstTypes.CharacterClassRange && nextToken && nextToken.type !== TokenTypes.CharacterClassOpen && nextToken.type !== TokenTypes.CharacterClassClose && nextToken.type !== TokenTypes.CharacterClassIntersector) {
    const nextNode = walk(parent, {
      ...state,
      isCheckingRangeEnd: true
    });
    if (prevSiblingNode.type === AstTypes.Character && nextNode.type === AstTypes.Character) {
      parent.elements.pop();
      return createCharacterClassRange(prevSiblingNode, nextNode);
    }
    throw new Error("Invalid character class range");
  }
  return createCharacter(45);
}
function parseCharacterClassOpen(context, state) {
  const { token: token2, tokens, verbose, walk } = context;
  const firstClassToken = tokens[context.current];
  let node = createCharacterClass({ negate: token2.negate });
  const intersection = node.elements[0];
  let nextToken = throwIfUnclosedCharacterClass(firstClassToken);
  while (nextToken.type !== TokenTypes.CharacterClassClose) {
    if (nextToken.type === TokenTypes.CharacterClassIntersector) {
      intersection.classes.push(createCharacterClass({ negate: false, baseOnly: true }));
      context.current++;
    } else {
      const cc = intersection.classes.at(-1);
      cc.elements.push(walk(cc, state));
    }
    nextToken = throwIfUnclosedCharacterClass(tokens[context.current], firstClassToken);
  }
  if (!verbose) {
    optimizeCharacterClassIntersection(intersection);
  }
  if (intersection.classes.length === 1) {
    const cc = intersection.classes[0];
    cc.negate = node.negate !== cc.negate;
    node = cc;
  }
  context.current++;
  return node;
}
function parseCharacterSet({ token: token2, skipPropertyNameValidation }) {
  let { kind, negate, value } = token2;
  if (kind === TokenCharacterSetKinds.property) {
    const normalized = slug(value);
    if (PosixProperties.has(normalized)) {
      kind = TokenCharacterSetKinds.posix;
      value = normalized;
    } else {
      return createUnicodeProperty(value, {
        negate,
        skipPropertyNameValidation
      });
    }
  }
  if (kind === TokenCharacterSetKinds.posix) {
    return {
      type: AstTypes.CharacterSet,
      kind: AstCharacterSetKinds.posix,
      negate,
      value
    };
  }
  return createCharacterSet(kind, { negate });
}
function parseGroupOpen(context, state) {
  const { token: token2, tokens, capturingGroups, namedGroupsByName, skipLookbehindValidation, verbose, walk } = context;
  let node = createByGroupKind(token2);
  const isAbsentFunction = node.type === AstTypes.AbsentFunction;
  const isLookbehind = node.kind === AstAssertionKinds.lookbehind;
  const isNegLookbehind = isLookbehind && node.negate;
  if (node.type === AstTypes.CapturingGroup) {
    capturingGroups.push(node);
    if (node.name) {
      getOrInsert(namedGroupsByName, node.name, []).push(node);
    }
  }
  if (isAbsentFunction && state.isInAbsentFunction) {
    throw new Error("Nested absent function not supported by Oniguruma");
  }
  let nextToken = throwIfUnclosedGroup(tokens[context.current]);
  while (nextToken.type !== TokenTypes.GroupClose) {
    if (nextToken.type === TokenTypes.Alternator) {
      node.alternatives.push(createAlternative());
      context.current++;
    } else {
      const alt = node.alternatives.at(-1);
      const child = walk(alt, {
        ...state,
        isInAbsentFunction: state.isInAbsentFunction || isAbsentFunction,
        isInLookbehind: state.isInLookbehind || isLookbehind,
        isInNegLookbehind: state.isInNegLookbehind || isNegLookbehind
      });
      alt.elements.push(child);
      if ((isLookbehind || state.isInLookbehind) && !skipLookbehindValidation) {
        const msg = "Lookbehind includes a pattern not allowed by Oniguruma";
        if (isNegLookbehind || state.isInNegLookbehind) {
          if (child.kind === AstAssertionKinds.lookahead || child.type === AstTypes.CapturingGroup) {
            throw new Error(msg);
          }
        } else {
          if (child.kind === AstAssertionKinds.lookahead || child.kind === AstAssertionKinds.lookbehind && child.negate) {
            throw new Error(msg);
          }
        }
      }
    }
    nextToken = throwIfUnclosedGroup(tokens[context.current]);
  }
  if (!verbose) {
    node = getOptimizedGroup(node);
  }
  context.current++;
  return node;
}
function parseQuantifier({ token: token2, parent }) {
  const { min, max, greedy, possessive: possessive2 } = token2;
  const quantifiedNode = parent.elements.at(-1);
  if (!quantifiedNode || quantifiedNode.type === AstTypes.Assertion || quantifiedNode.type === AstTypes.Directive) {
    throw new Error(`Quantifier requires a repeatable token`);
  }
  const node = createQuantifier(quantifiedNode, min, max, greedy, possessive2);
  parent.elements.pop();
  return node;
}
function parseSubroutine(context) {
  const { token: token2, capturingGroups, subroutines } = context;
  let ref = token2.raw.slice(3, -1);
  const numberedRef = /^(?<sign>[-+]?)0*(?<num>[1-9]\d*)$/.exec(ref);
  if (numberedRef) {
    const num = +numberedRef.groups.num;
    const numCapturesToLeft = capturingGroups.length;
    context.hasNumberedRef = true;
    ref = {
      "": num,
      "+": numCapturesToLeft + num,
      "-": numCapturesToLeft + 1 - num
    }[numberedRef.groups.sign];
    if (ref < 1) {
      throw new Error("Invalid subroutine number");
    }
  } else if (ref === "0") {
    ref = 0;
  }
  const node = createSubroutine(ref);
  subroutines.push(node);
  return node;
}
function createAbsentFunction(kind) {
  if (kind !== AstAbsentFunctionKinds.repeater) {
    throw new Error(`Unexpected absent function kind "${kind}"`);
  }
  return {
    type: AstTypes.AbsentFunction,
    kind,
    alternatives: [createAlternative()]
  };
}
function createAlternative() {
  return {
    type: AstTypes.Alternative,
    elements: []
  };
}
function createAssertion(kind, options) {
  const negate = !!(options == null ? void 0 : options.negate);
  return {
    type: AstTypes.Assertion,
    kind,
    ...kind === AstAssertionKinds.word_boundary && { negate }
  };
}
function createAssertionFromToken({ kind }) {
  return createAssertion(
    throwIfNot({
      "^": AstAssertionKinds.line_start,
      "$": AstAssertionKinds.line_end,
      "\\A": AstAssertionKinds.string_start,
      "\\b": AstAssertionKinds.word_boundary,
      "\\B": AstAssertionKinds.word_boundary,
      "\\G": AstAssertionKinds.search_start,
      "\\z": AstAssertionKinds.string_end,
      "\\Z": AstAssertionKinds.string_end_newline
    }[kind], `Unexpected assertion kind "${kind}"`),
    { negate: kind === r3`\B` }
  );
}
function createBackreference(ref, options) {
  const orphan = !!(options == null ? void 0 : options.orphan);
  return {
    type: AstTypes.Backreference,
    ...orphan && { orphan },
    ref
  };
}
function createByGroupKind({ flags, kind, name, negate, number: number2 }) {
  switch (kind) {
    case TokenGroupKinds.absent_repeater:
      return createAbsentFunction(AstAbsentFunctionKinds.repeater);
    case TokenGroupKinds.atomic:
      return createGroup({ atomic: true });
    case TokenGroupKinds.capturing:
      return createCapturingGroup(number2, name);
    case TokenGroupKinds.group:
      return createGroup({ flags });
    case TokenGroupKinds.lookahead:
    case TokenGroupKinds.lookbehind:
      return createLookaround({
        behind: kind === TokenGroupKinds.lookbehind,
        negate
      });
    default:
      throw new Error(`Unexpected group kind "${kind}"`);
  }
}
function createCapturingGroup(number2, name) {
  const hasName = name !== void 0;
  if (hasName && !isValidGroupNameOniguruma(name)) {
    throw new Error(`Group name "${name}" invalid in Oniguruma`);
  }
  return {
    type: AstTypes.CapturingGroup,
    number: number2,
    ...hasName && { name },
    alternatives: [createAlternative()]
  };
}
function createCharacter(charCode, options) {
  const opts = {
    useLastValid: false,
    ...options
  };
  if (charCode > 1114111) {
    const hex = charCode.toString(16);
    if (opts.useLastValid) {
      charCode = 1114111;
    } else if (charCode > 1310719) {
      throw new Error(`Invalid code point out of range "\\x{${hex}}"`);
    } else {
      throw new Error(`Invalid code point out of range in JS "\\x{${hex}}"`);
    }
  }
  return {
    type: AstTypes.Character,
    value: charCode
  };
}
function createCharacterClass(options) {
  const opts = {
    baseOnly: false,
    negate: false,
    ...options
  };
  return {
    type: AstTypes.CharacterClass,
    negate: opts.negate,
    elements: opts.baseOnly ? [] : [createCharacterClassIntersection()]
  };
}
function createCharacterClassIntersection() {
  return {
    type: AstTypes.CharacterClassIntersection,
    classes: [createCharacterClass({ negate: false, baseOnly: true })]
  };
}
function createCharacterClassRange(min, max) {
  if (max.value < min.value) {
    throw new Error("Character class range out of order");
  }
  return {
    type: AstTypes.CharacterClassRange,
    min,
    max
  };
}
function createCharacterSet(kind, { negate }) {
  const node = {
    type: AstTypes.CharacterSet,
    kind: throwIfNot(AstCharacterSetKinds[kind], `Unexpected character set kind "${kind}"`)
  };
  if (kind === TokenCharacterSetKinds.digit || kind === TokenCharacterSetKinds.hex || kind === TokenCharacterSetKinds.space || kind === TokenCharacterSetKinds.word) {
    node.negate = negate;
  }
  return node;
}
function createDirectiveFromToken({ kind, flags }) {
  const node = {
    type: AstTypes.Directive,
    kind: throwIfNot(AstDirectiveKinds[kind], `Unexpected directive kind "${kind}"`)
  };
  if (kind === TokenDirectiveKinds.flags) {
    node.flags = flags;
  }
  return node;
}
function createFlags({ ignoreCase, dotAll, extended, digitIsAscii, spaceIsAscii, wordIsAscii }) {
  return {
    type: AstTypes.Flags,
    ignoreCase,
    dotAll,
    extended,
    digitIsAscii,
    spaceIsAscii,
    wordIsAscii
  };
}
function createGroup(options) {
  const atomic2 = options == null ? void 0 : options.atomic;
  const flags = options == null ? void 0 : options.flags;
  return {
    type: AstTypes.Group,
    ...atomic2 && { atomic: atomic2 },
    ...flags && { flags },
    alternatives: [createAlternative()]
  };
}
function createLookaround(options) {
  const opts = {
    behind: false,
    negate: false,
    ...options
  };
  return {
    type: AstTypes.Assertion,
    kind: opts.behind ? AstAssertionKinds.lookbehind : AstAssertionKinds.lookahead,
    negate: opts.negate,
    alternatives: [createAlternative()]
  };
}
function createPattern() {
  return {
    type: AstTypes.Pattern,
    alternatives: [createAlternative()]
  };
}
function createQuantifier(element2, min, max, greedy = true, possessive2 = false) {
  const node = {
    type: AstTypes.Quantifier,
    min,
    max,
    greedy,
    possessive: possessive2,
    element: element2
  };
  if (max < min) {
    return {
      ...node,
      min: max,
      max: min,
      possessive: true
    };
  }
  return node;
}
function createRegex(pattern, flags) {
  return {
    type: AstTypes.Regex,
    pattern,
    flags
  };
}
function createSubroutine(ref) {
  return {
    type: AstTypes.Subroutine,
    ref
  };
}
function createUnicodeProperty(value, options) {
  const opts = {
    negate: false,
    skipPropertyNameValidation: false,
    ...options
  };
  return {
    type: AstTypes.CharacterSet,
    kind: AstCharacterSetKinds.property,
    value: opts.skipPropertyNameValidation ? value : getJsUnicodePropertyName(value),
    negate: opts.negate
  };
}
function createVariableLengthCharacterSet(kind) {
  return {
    type: AstTypes.VariableLengthCharacterSet,
    kind: throwIfNot({
      "\\R": AstVariableLengthCharacterSetKinds.newline,
      "\\X": AstVariableLengthCharacterSetKinds.grapheme
    }[kind], `Unexpected varcharset kind "${kind}"`)
  };
}
function getJsUnicodePropertyName(value) {
  const slugged = slug(value);
  if (JsUnicodePropertiesOfStringsMap.has(slugged)) {
    throw new Error(r3`Unicode property "\p{${value}}" unsupported in Oniguruma`);
  }
  const jsName = JsUnicodePropertiesMap.get(slugged);
  if (jsName) {
    return jsName;
  }
  return value.trim().replace(/[- _]+/g, "_").replace(/[A-Z][a-z]+(?=[A-Z])/g, "$&_").replace(/[A-Za-z]+/g, (m) => m[0].toUpperCase() + m.slice(1).toLowerCase());
}
function getOptimizedGroup(node) {
  const firstAltFirstEl = node.alternatives[0].elements[0];
  if (node.type === AstTypes.Group && hasOnlyChild(node, (kid) => kid.type === AstTypes.Group) && !(node.atomic && firstAltFirstEl.flags) && !(node.flags && (firstAltFirstEl.atomic || firstAltFirstEl.flags))) {
    if (node.atomic) {
      firstAltFirstEl.atomic = true;
    } else if (node.flags) {
      firstAltFirstEl.flags = node.flags;
    }
    return firstAltFirstEl;
  }
  return node;
}
function isValidGroupNameOniguruma(name) {
  return /^[\p{Alpha}\p{Pc}][^)]*$/u.test(name);
}
function optimizeCharacterClassIntersection(intersection) {
  for (let i = 0; i < intersection.classes.length; i++) {
    const cc = intersection.classes[i];
    const firstChild = cc.elements[0];
    if (cc.elements.length === 1 && firstChild.type === AstTypes.CharacterClass) {
      intersection.classes[i] = firstChild;
      firstChild.negate = cc.negate !== firstChild.negate;
    }
  }
}
function throwIfUnclosedCharacterClass(token2, firstClassToken) {
  return throwIfNot(
    token2,
    // Easier to understand error when applicable
    `${(firstClassToken == null ? void 0 : firstClassToken.value) === 93 ? "Empty" : "Unclosed"} character class`
  );
}
function throwIfUnclosedGroup(token2) {
  return throwIfNot(token2, "Unclosed group");
}
function transform(ast, options) {
  const opts = {
    // A couple edge cases exist where options `accuracy` and `bestEffortTarget` are used:
    // - `VariableLengthCharacterSet` kind `grapheme` (`\X`): An exact representation would require
    //   heavy Unicode data; a best-effort approximation requires knowing the target.
    // - `CharacterSet` kind `posix` with values `graph` and `print`: Their complex Unicode-based
    //   representations would be hard to change to ASCII-based after the fact in the generator
    //   based on `target`/`accuracy`, so produce the appropriate structure here.
    accuracy: "default",
    asciiWordBoundaries: false,
    avoidSubclass: false,
    bestEffortTarget: "ES2025",
    ...options
  };
  const firstPassState = {
    accuracy: opts.accuracy,
    asciiWordBoundaries: opts.asciiWordBoundaries,
    avoidSubclass: opts.avoidSubclass,
    flagDirectivesByAlt: /* @__PURE__ */ new Map(),
    jsGroupNameMap: /* @__PURE__ */ new Map(),
    minTargetEs2024: isMinTarget(opts.bestEffortTarget, "ES2024"),
    passedLookbehind: false,
    strategy: null,
    // Subroutines can appear before the groups they ref, so collect reffed nodes for a second pass 
    subroutineRefMap: /* @__PURE__ */ new Map(),
    supportedGNodes: /* @__PURE__ */ new Set(),
    digitIsAscii: ast.flags.digitIsAscii,
    spaceIsAscii: ast.flags.spaceIsAscii,
    wordIsAscii: ast.flags.wordIsAscii
  };
  traverse({ node: ast }, firstPassState, FirstPassVisitor);
  const globalFlags = {
    dotAll: ast.flags.dotAll,
    ignoreCase: ast.flags.ignoreCase
  };
  const secondPassState = {
    currentFlags: globalFlags,
    prevFlags: null,
    globalFlags,
    groupOriginByCopy: /* @__PURE__ */ new Map(),
    groupsByName: /* @__PURE__ */ new Map(),
    multiplexCapturesToLeftByRef: /* @__PURE__ */ new Map(),
    openRefs: /* @__PURE__ */ new Map(),
    reffedNodesByReferencer: /* @__PURE__ */ new Map(),
    subroutineRefMap: firstPassState.subroutineRefMap
  };
  traverse({ node: ast }, secondPassState, SecondPassVisitor);
  const thirdPassState = {
    groupsByName: secondPassState.groupsByName,
    highestOrphanBackref: 0,
    numCapturesToLeft: 0,
    reffedNodesByReferencer: secondPassState.reffedNodesByReferencer
  };
  traverse({ node: ast }, thirdPassState, ThirdPassVisitor);
  ast._originMap = secondPassState.groupOriginByCopy;
  ast._strategy = firstPassState.strategy;
  return ast;
}
var FirstPassVisitor = {
  AbsentFunction({ node, replaceWith }) {
    const group = prepContainer(createGroup(), [
      adoptAndSwapKids(createLookaround({ negate: true }), node.alternatives),
      createUnicodeProperty("Any")
    ]);
    const quantifier = createQuantifier(group, 0, Infinity);
    group.parent = quantifier;
    replaceWith(prepContainer(createGroup(), [quantifier]));
  },
  Alternative: {
    enter({ node, parent, key: key2 }, { flagDirectivesByAlt }) {
      const flagDirectives = node.elements.filter((el) => el.kind === AstDirectiveKinds.flags);
      for (let i = key2 + 1; i < parent.alternatives.length; i++) {
        const forwardSiblingAlt = parent.alternatives[i];
        getOrInsert(flagDirectivesByAlt, forwardSiblingAlt, []).push(...flagDirectives);
      }
    },
    exit({ node }, { flagDirectivesByAlt }) {
      var _a4;
      if ((_a4 = flagDirectivesByAlt.get(node)) == null ? void 0 : _a4.length) {
        const flags = getCombinedFlagModsFromFlagNodes(flagDirectivesByAlt.get(node));
        if (flags) {
          const flagGroup = prepContainer(createGroup({ flags }), node.elements);
          flagGroup.parent = node;
          node.elements = [flagGroup];
        }
      }
    }
  },
  Assertion({ node, key: key2, container, ast, remove, replaceWith }, state) {
    const { kind, negate } = node;
    const { asciiWordBoundaries, avoidSubclass, supportedGNodes, wordIsAscii } = state;
    if (kind === AstAssertionKinds.line_end) {
      replaceWith(parseFragment(r3`(?=\z|\n)`));
    } else if (kind === AstAssertionKinds.line_start) {
      replaceWith(parseFragment(r3`(?<=\A|\n(?!\z))`, { skipLookbehindValidation: true }));
    } else if (kind === AstAssertionKinds.lookbehind) {
      state.passedLookbehind = true;
    } else if (kind === AstAssertionKinds.search_start) {
      if (supportedGNodes.has(node)) {
        ast.flags.sticky = true;
        remove();
      } else {
        const prev = container[key2 - 1];
        if (prev && isAlwaysNonZeroLength(prev)) {
          replaceWith(prepContainer(createLookaround({ negate: true })));
        } else if (avoidSubclass) {
          throw new Error(r3`Uses "\G" in a way that requires a subclass`);
        } else {
          replaceWith(createAssertion(AstAssertionKinds.string_start));
          state.strategy = "clip_search";
        }
      }
    } else if (kind === AstAssertionKinds.string_end_newline) {
      replaceWith(parseFragment(r3`(?=\n?\z)`));
    } else if (kind === AstAssertionKinds.word_boundary && !wordIsAscii && !asciiWordBoundaries) {
      const b = `(?:(?<=${defaultWordChar})(?!${defaultWordChar})|(?<!${defaultWordChar})(?=${defaultWordChar}))`;
      const B = `(?:(?<=${defaultWordChar})(?=${defaultWordChar})|(?<!${defaultWordChar})(?!${defaultWordChar}))`;
      replaceWith(parseFragment(negate ? B : b));
    }
  },
  Backreference({ node }, { jsGroupNameMap }) {
    let { ref } = node;
    if (typeof ref === "string" && !isValidGroupNameJs(ref)) {
      ref = getAndStoreJsGroupName(ref, jsGroupNameMap);
      node.ref = ref;
    }
  },
  CapturingGroup({ node }, { jsGroupNameMap, subroutineRefMap }) {
    let { name } = node;
    if (name && !isValidGroupNameJs(name)) {
      name = getAndStoreJsGroupName(name, jsGroupNameMap);
      node.name = name;
    }
    subroutineRefMap.set(node.number, node);
    if (name) {
      subroutineRefMap.set(name, node);
    }
  },
  CharacterSet({ node, replaceWith }, { accuracy, minTargetEs2024, digitIsAscii, spaceIsAscii, wordIsAscii }) {
    const { kind, negate, value } = node;
    if (digitIsAscii && (kind === AstCharacterSetKinds.digit || value === "digit")) {
      replaceWith(createCharacterSet(AstCharacterSetKinds.digit, { negate }));
      return;
    }
    if (spaceIsAscii && (kind === AstCharacterSetKinds.space || value === "space")) {
      replaceWith(setNegate(parseFragment(asciiSpaceChar), negate));
      return;
    }
    if (wordIsAscii && (kind === AstCharacterSetKinds.word || value === "word")) {
      replaceWith(createCharacterSet(AstCharacterSetKinds.word, { negate }));
      return;
    }
    if (kind === AstCharacterSetKinds.any) {
      replaceWith(createUnicodeProperty("Any"));
    } else if (kind === AstCharacterSetKinds.digit) {
      replaceWith(createUnicodeProperty("Nd", { negate }));
    } else if (kind === AstCharacterSetKinds.hex) {
      replaceWith(createUnicodeProperty("AHex", { negate }));
    } else if (kind === AstCharacterSetKinds.non_newline) {
      replaceWith(parseFragment(r3`[^\n]`));
    } else if (kind === AstCharacterSetKinds.space) {
      replaceWith(createUnicodeProperty("space", { negate }));
    } else if (kind === AstCharacterSetKinds.word) {
      replaceWith(setNegate(parseFragment(defaultWordChar), negate));
    } else if (kind === AstCharacterSetKinds.property) {
      if (!JsUnicodeProperties.has(value)) {
        node.key = "sc";
      }
    } else if (kind === AstCharacterSetKinds.posix) {
      if (!minTargetEs2024 && (value === "graph" || value === "print")) {
        if (accuracy === "strict") {
          throw new Error(`POSIX class "${value}" requires min target ES2024 or non-strict accuracy`);
        }
        let ascii = {
          graph: "!-~",
          print: " -~"
        }[value];
        if (negate) {
          ascii = `\0-${cp(ascii.codePointAt(0) - 1)}${cp(ascii.codePointAt(2) + 1)}-􏿿`;
        }
        replaceWith(parseFragment(`[${ascii}]`));
      } else {
        replaceWith(setNegate(parseFragment(PosixClassesMap.get(value)), negate));
      }
    }
  },
  Directive(path, state) {
    const { node, parent, ast, remove, replaceWith, removeAllPrevSiblings, removeAllNextSiblings } = path;
    const { kind, flags } = node;
    if (kind === AstDirectiveKinds.flags) {
      if (!flags.enable && !flags.disable) {
        remove();
      } else {
        const flagGroup = prepContainer(createGroup({ flags }), removeAllNextSiblings());
        replaceWith(flagGroup);
        traverseReplacement(flagGroup, path, state, FirstPassVisitor);
      }
    } else if (kind === AstDirectiveKinds.keep) {
      const firstAltFirstEl = ast.pattern.alternatives[0].elements[0];
      const hasWrapperGroup = (
        // Not emulatable if within a `CapturingGroup`
        hasOnlyChild(ast.pattern, (kid) => kid.type === AstTypes.Group) && firstAltFirstEl.alternatives.length === 1
      );
      const topLevel = hasWrapperGroup ? firstAltFirstEl : ast.pattern;
      if (parent.parent !== topLevel || topLevel.alternatives.length > 1) {
        throw new Error(r3`Uses "\K" in a way that's unsupported`);
      }
      replaceWith(prepContainer(createLookaround({ behind: true }), removeAllPrevSiblings()));
    }
  },
  Flags({ node, parent }) {
    [
      "digitIsAscii",
      // Flag D
      "extended",
      // Flag x
      "spaceIsAscii",
      // Flag S
      "wordIsAscii"
      // Flag W
    ].forEach((f) => delete node[f]);
    Object.assign(node, {
      // JS flag g; no Onig equiv
      global: false,
      // JS flag d; no Onig equiv
      hasIndices: false,
      // JS flag m; no Onig equiv but its behavior is always on in Onig. Onig's only line break
      // char is line feed, unlike JS, so this flag isn't used since it would produce inaccurate
      // results (also allows `^` and `$` to be used in the generator for string start and end)
      multiline: false,
      // JS flag y; no Onig equiv, but used for `\G` emulation
      sticky: node.sticky ?? false
      // Note: Regex+ doesn't allow explicitly adding flags it handles implicitly, so leave out
      // properties `unicode` (JS flag u) and `unicodeSets` (JS flag v). Keep the existing values
      // for `ignoreCase` (flag i) and `dotAll` (JS flag s, but Onig flag m)
    });
    parent.options = {
      disable: {
        // Onig uses different rules for flag x than Regex+, so disable the implicit flag
        x: true,
        // Onig has no flag to control "named capture only" mode but contextually applies its
        // behavior when named capturing is used, so disable Regex+'s implicit flag for it
        n: true
      },
      force: {
        // Always add flag v because we're generating an AST that relies on it (it enables JS
        // support for Onig features nested classes, set intersection, Unicode properties, etc.).
        // However, the generator might disable flag v based on its `target` option
        v: true
      }
    };
  },
  Group({ node }) {
    if (!node.flags) {
      return;
    }
    const { enable, disable } = node.flags;
    (enable == null ? void 0 : enable.extended) && delete enable.extended;
    (disable == null ? void 0 : disable.extended) && delete disable.extended;
    (enable == null ? void 0 : enable.dotAll) && (disable == null ? void 0 : disable.dotAll) && delete enable.dotAll;
    (enable == null ? void 0 : enable.ignoreCase) && (disable == null ? void 0 : disable.ignoreCase) && delete enable.ignoreCase;
    enable && !Object.keys(enable).length && delete node.flags.enable;
    disable && !Object.keys(disable).length && delete node.flags.disable;
    !node.flags.enable && !node.flags.disable && delete node.flags;
  },
  Pattern: {
    enter({ node }, { supportedGNodes }) {
      const leadingGs = [];
      let hasAltWithLeadG = false;
      let hasAltWithoutLeadG = false;
      for (const alt of node.alternatives) {
        if (alt.elements.length === 1 && alt.elements[0].kind === AstAssertionKinds.search_start) {
          alt.elements.pop();
        } else {
          const leadingG = getLeadingG(alt.elements);
          if (leadingG) {
            hasAltWithLeadG = true;
            Array.isArray(leadingG) ? leadingGs.push(...leadingG) : leadingGs.push(leadingG);
          } else {
            hasAltWithoutLeadG = true;
          }
        }
      }
      if (hasAltWithLeadG && !hasAltWithoutLeadG) {
        leadingGs.forEach((g) => supportedGNodes.add(g));
      }
    },
    exit(_, { accuracy, passedLookbehind, strategy }) {
      if (accuracy === "strict" && passedLookbehind && strategy) {
        throw new Error(r3`Uses "\G" in a way that requires non-strict accuracy`);
      }
    }
  },
  Quantifier({ node }) {
    if (node.element.type === AstTypes.Quantifier) {
      const group = prepContainer(createGroup(), [node.element]);
      group.parent = node;
      node.element = group;
    }
  },
  Subroutine({ node }, { jsGroupNameMap }) {
    let { ref } = node;
    if (typeof ref === "string" && !isValidGroupNameJs(ref)) {
      ref = getAndStoreJsGroupName(ref, jsGroupNameMap);
      node.ref = ref;
    }
  },
  VariableLengthCharacterSet({ node, replaceWith }, { accuracy, minTargetEs2024 }) {
    const { kind } = node;
    if (kind === AstVariableLengthCharacterSetKinds.newline) {
      replaceWith(parseFragment("(?>\r\n?|[\n\v\f\u2028\u2029])"));
    } else if (kind === AstVariableLengthCharacterSetKinds.grapheme) {
      if (accuracy === "strict") {
        throw new Error(r3`Use of "\X" requires non-strict accuracy`);
      }
      const emoji = minTargetEs2024 ? r3`\p{RGI_Emoji}` : emoji_regex_xs_default().source.replace(/\\u\{/g, `\\x{`);
      replaceWith(parseFragment(r3`(?>\r\n|${emoji}|\P{M}\p{M}*)`, { skipPropertyNameValidation: true }));
    } else {
      throw new Error(`Unexpected varcharset kind "${kind}"`);
    }
  }
};
var SecondPassVisitor = {
  Backreference({ node }, { multiplexCapturesToLeftByRef, reffedNodesByReferencer }) {
    const { orphan, ref } = node;
    if (!orphan) {
      reffedNodesByReferencer.set(node, [...multiplexCapturesToLeftByRef.get(ref).map(({ node: node2 }) => node2)]);
    }
  },
  CapturingGroup: {
    enter({
      node,
      replaceWith,
      skip
    }, {
      groupOriginByCopy,
      groupsByName,
      multiplexCapturesToLeftByRef,
      openRefs,
      reffedNodesByReferencer
    }) {
      const origin = groupOriginByCopy.get(node);
      if (origin && openRefs.has(node.number)) {
        const recursion2 = createRecursion(node.number);
        reffedNodesByReferencer.set(recursion2, openRefs.get(node.number));
        replaceWith(recursion2);
        skip();
        return;
      }
      openRefs.set(node.number, node);
      multiplexCapturesToLeftByRef.set(node.number, []);
      if (node.name) {
        getOrInsert(multiplexCapturesToLeftByRef, node.name, []);
      }
      const multiplexNodes = multiplexCapturesToLeftByRef.get(node.name ?? node.number);
      for (let i = 0; i < multiplexNodes.length; i++) {
        const multiplex = multiplexNodes[i];
        if (
          // This group is from subroutine expansion, and there's a multiplex value from either the
          // origin node or a prior subroutine expansion group with the same origin
          origin === multiplex.node || origin && origin === multiplex.origin || // This group is not from subroutine expansion, and it comes after a subroutine expansion
          // group that refers to this group
          node === multiplex.origin
        ) {
          multiplexNodes.splice(i, 1);
          break;
        }
      }
      multiplexCapturesToLeftByRef.get(node.number).push({ node, origin });
      if (node.name) {
        multiplexCapturesToLeftByRef.get(node.name).push({ node, origin });
      }
      if (node.name) {
        const groupsWithSameName = getOrInsert(groupsByName, node.name, /* @__PURE__ */ new Map());
        let hasDuplicateNameToRemove = false;
        if (origin) {
          hasDuplicateNameToRemove = true;
        } else {
          for (const groupInfo of groupsWithSameName.values()) {
            if (!groupInfo.hasDuplicateNameToRemove) {
              hasDuplicateNameToRemove = true;
              break;
            }
          }
        }
        groupsByName.get(node.name).set(node, { node, hasDuplicateNameToRemove });
      }
    },
    exit({ node }, { openRefs }) {
      openRefs.delete(node.number);
    }
  },
  Group: {
    enter({ node }, state) {
      state.prevFlags = state.currentFlags;
      if (node.flags) {
        state.currentFlags = getNewCurrentFlags(state.currentFlags, node.flags);
      }
    },
    exit(_, state) {
      state.currentFlags = state.prevFlags;
    }
  },
  Recursion({ node, parent }, { reffedNodesByReferencer }) {
    const { ref } = node;
    let reffed = parent;
    while (reffed = reffed.parent) {
      if (reffed.type === AstTypes.CapturingGroup && (reffed.name === ref || reffed.number === ref)) {
        break;
      }
    }
    reffedNodesByReferencer.set(node, reffed);
  },
  Subroutine(path, state) {
    const { node, replaceWith } = path;
    const { ref } = node;
    const reffedGroupNode = state.subroutineRefMap.get(ref);
    const isGlobalRecursion = ref === 0;
    const expandedSubroutine = isGlobalRecursion ? createRecursion(0) : (
      // The reffed group might itself contain subroutines, which are expanded during sub-traversal
      cloneCapturingGroup(reffedGroupNode, state.groupOriginByCopy, null)
    );
    let replacement = expandedSubroutine;
    if (!isGlobalRecursion) {
      const reffedGroupFlagMods = getCombinedFlagModsFromFlagNodes(getAllParents(reffedGroupNode, (node2) => {
        return node2.type === AstTypes.Group && !!node2.flags;
      }));
      const reffedGroupFlags = reffedGroupFlagMods ? getNewCurrentFlags(state.globalFlags, reffedGroupFlagMods) : state.globalFlags;
      if (!areFlagsEqual(reffedGroupFlags, state.currentFlags)) {
        replacement = prepContainer(createGroup({
          flags: getFlagModsFromFlags(reffedGroupFlags)
        }), [expandedSubroutine]);
      }
    }
    replaceWith(replacement);
    if (!isGlobalRecursion) {
      traverseReplacement(replacement, path, state, SecondPassVisitor);
    }
  }
};
var ThirdPassVisitor = {
  Backreference({ node, replaceWith }, state) {
    if (node.orphan) {
      state.highestOrphanBackref = Math.max(state.highestOrphanBackref, node.ref);
      return;
    }
    const reffedNodes = state.reffedNodesByReferencer.get(node);
    const participants = reffedNodes.filter((reffed) => canParticipateWithNode(reffed, node));
    if (!participants.length) {
      replaceWith(prepContainer(createLookaround({ negate: true })));
    } else if (participants.length > 1) {
      const alts = participants.map((reffed) => adoptAndSwapKids(
        createAlternative(),
        [createBackreference(reffed.number)]
      ));
      replaceWith(adoptAndSwapKids(createGroup(), alts));
    } else {
      node.ref = participants[0].number;
    }
  },
  CapturingGroup({ node }, state) {
    node.number = ++state.numCapturesToLeft;
    if (node.name) {
      if (state.groupsByName.get(node.name).get(node).hasDuplicateNameToRemove) {
        delete node.name;
      }
    }
  },
  Recursion({ node }, state) {
    if (node.ref === 0) {
      return;
    }
    node.ref = state.reffedNodesByReferencer.get(node).number;
  },
  Regex: {
    exit({ node }, state) {
      const numCapsNeeded = Math.max(state.highestOrphanBackref - state.numCapturesToLeft, 0);
      for (let i = 0; i < numCapsNeeded; i++) {
        const emptyCapture = createCapturingGroup();
        node.pattern.alternatives.at(-1).elements.push(emptyCapture);
      }
    }
  }
};
var asciiSpaceChar = "[	-\r ]";
var defaultWordChar = r3`[\p{L}\p{M}\p{N}\p{Pc}]`;
function adoptAndSwapKids(parent, kids) {
  kids.forEach((kid) => kid.parent = parent);
  parent[getContainerAccessor(parent)] = kids;
  return parent;
}
function areFlagsEqual(a, b) {
  return a.dotAll === b.dotAll && a.ignoreCase === b.ignoreCase;
}
function canParticipateWithNode(capture, node) {
  let rightmostPoint = node;
  do {
    if (rightmostPoint.type === AstTypes.Pattern) {
      return false;
    }
    if (rightmostPoint.type === AstTypes.Alternative) {
      continue;
    }
    if (rightmostPoint === capture) {
      return false;
    }
    const kidsOfParent = getKids(rightmostPoint.parent);
    for (const kid of kidsOfParent) {
      if (kid === rightmostPoint) {
        break;
      }
      if (kid === capture) {
        return true;
      }
      if (hasDescendant(kid, capture)) {
        return true;
      }
    }
  } while (rightmostPoint = rightmostPoint.parent);
  throw new Error("Unexpected path");
}
function cloneCapturingGroup(obj, originMap, up, up2) {
  const store = Array.isArray(obj) ? [] : {};
  for (const [key2, value] of Object.entries(obj)) {
    if (key2 === "parent") {
      store.parent = Array.isArray(up) ? up2 : up;
    } else if (value && typeof value === "object") {
      store[key2] = cloneCapturingGroup(value, originMap, store, up);
    } else {
      if (key2 === "type" && value === AstTypes.CapturingGroup) {
        originMap.set(store, originMap.get(obj) ?? obj);
      }
      store[key2] = value;
    }
  }
  return store;
}
function createRecursion(ref) {
  return {
    type: AstTypes.Recursion,
    ref
  };
}
function getAllParents(node, filterFn) {
  const results = [];
  while (node = node.parent) {
    if (!filterFn || filterFn(node)) {
      results.push(node);
    }
  }
  return results;
}
function getAndStoreJsGroupName(name, map) {
  if (map.has(name)) {
    return map.get(name);
  }
  const jsName = `$${map.size}_${name.replace(/^[^$_\p{IDS}]|[^$\u200C\u200D\p{IDC}]/ug, "_")}`;
  map.set(name, jsName);
  return jsName;
}
function getContainerAccessor(node) {
  for (const accessor of ["alternatives", "classes", "elements"]) {
    if (node[accessor]) {
      return accessor;
    }
  }
  return null;
}
function getCombinedFlagModsFromFlagNodes(flagNodes) {
  const flagProps = ["dotAll", "ignoreCase"];
  const combinedFlags = { enable: {}, disable: {} };
  flagNodes.forEach(({ flags }) => {
    flagProps.forEach((prop) => {
      var _a4, _b;
      if ((_a4 = flags.enable) == null ? void 0 : _a4[prop]) {
        delete combinedFlags.disable[prop];
        combinedFlags.enable[prop] = true;
      }
      if ((_b = flags.disable) == null ? void 0 : _b[prop]) {
        combinedFlags.disable[prop] = true;
      }
    });
  });
  if (!Object.keys(combinedFlags.enable).length) {
    delete combinedFlags.enable;
  }
  if (!Object.keys(combinedFlags.disable).length) {
    delete combinedFlags.disable;
  }
  if (combinedFlags.enable || combinedFlags.disable) {
    return combinedFlags;
  }
  return null;
}
function getFlagModsFromFlags({ dotAll, ignoreCase }) {
  const mods = {};
  if (dotAll || ignoreCase) {
    mods.enable = {};
    dotAll && (mods.enable.dotAll = true);
    ignoreCase && (mods.enable.ignoreCase = true);
  }
  if (!dotAll || !ignoreCase) {
    mods.disable = {};
    !dotAll && (mods.disable.dotAll = true);
    !ignoreCase && (mods.disable.ignoreCase = true);
  }
  return mods;
}
function getKids(node) {
  if (!node) {
    throw new Error("Node expected");
  }
  if (node.type === AstTypes.Quantifier) {
    return [node.element];
  }
  const accessor = getContainerAccessor(node);
  return accessor && node[accessor];
}
function getLeadingG(els) {
  const firstToConsider = els.find((el) => el.kind === AstAssertionKinds.search_start || isLoneGLookaround(el, { negate: false }) || !isAlwaysZeroLength(el));
  if (!firstToConsider) {
    return null;
  }
  if (firstToConsider.kind === AstAssertionKinds.search_start) {
    return firstToConsider;
  }
  if (isLookaround(firstToConsider)) {
    return firstToConsider.alternatives[0].elements[0];
  }
  if (isConsumptiveGroup(firstToConsider)) {
    const gNodesForGroup = [];
    for (const alt of firstToConsider.alternatives) {
      const leadingG = getLeadingG(alt.elements);
      if (!leadingG) {
        return null;
      }
      Array.isArray(leadingG) ? gNodesForGroup.push(...leadingG) : gNodesForGroup.push(leadingG);
    }
    return gNodesForGroup;
  }
  return null;
}
function hasDescendant(node, descendant) {
  const kids = getKids(node) ?? [];
  for (const kid of kids) {
    if (kid === descendant || hasDescendant(kid, descendant)) {
      return true;
    }
  }
  return false;
}
function isLoneGLookaround(node, options) {
  const opts = {
    negate: null,
    ...options
  };
  return isLookaround(node) && (opts.negate === null || node.negate === opts.negate) && hasOnlyChild(node, (kid) => kid.kind === AstAssertionKinds.search_start);
}
function isValidGroupNameJs(name) {
  return /^[$_\p{IDS}][$\u200C\u200D\p{IDC}]*$/u.test(name);
}
function parseFragment(pattern, options) {
  const ast = parse(tokenize(pattern), options);
  const alts = ast.pattern.alternatives;
  if (alts.length > 1 || alts[0].elements.length > 1) {
    return adoptAndSwapKids(createGroup(), alts);
  }
  return alts[0].elements[0];
}
function prepContainer(node, kids) {
  const accessor = getContainerAccessor(node);
  node[accessor][0].parent = node;
  if (kids) {
    adoptAndSwapKids(node[accessor][0], kids);
  }
  return node;
}
function setNegate(node, negate) {
  node.negate = negate;
  return node;
}
function traverseReplacement(replacement, { parent, key: key2, container }, state, visitor) {
  traverse({
    // Don't use the `node` from `path`
    node: replacement,
    parent,
    key: key2,
    container
  }, state, visitor);
}
function generate(ast, options) {
  const opts = getOptions(options);
  const minTargetEs2024 = isMinTarget(opts.target, "ES2024");
  const minTargetEs2025 = isMinTarget(opts.target, "ES2025");
  const recursionLimit = opts.rules.recursionLimit;
  if (!Number.isInteger(recursionLimit) || recursionLimit < 2 || recursionLimit > 20) {
    throw new Error("Invalid recursionLimit; use 2-20");
  }
  let hasCaseInsensitiveNode = null;
  let hasCaseSensitiveNode = null;
  if (!minTargetEs2025) {
    const iStack = [ast.flags.ignoreCase];
    traverse({ node: ast }, {
      getCurrentModI: () => iStack.at(-1),
      popModI() {
        iStack.pop();
      },
      pushModI(isIOn) {
        iStack.push(isIOn);
      },
      setHasCasedChar() {
        if (iStack.at(-1)) {
          hasCaseInsensitiveNode = true;
        } else {
          hasCaseSensitiveNode = true;
        }
      }
    }, FlagModifierVisitor);
  }
  const appliedGlobalFlags = {
    dotAll: ast.flags.dotAll,
    // - Turn global flag i on if a case insensitive node was used and no case sensitive nodes were
    //   used (to avoid unnecessary node expansion).
    // - Turn global flag i off if a case sensitive node was used (since case sensitivity can't be
    //   forced without the use of ES2025 flag groups)
    ignoreCase: !!((ast.flags.ignoreCase || hasCaseInsensitiveNode) && !hasCaseSensitiveNode)
  };
  let lastNode = null;
  const state = {
    accuracy: opts.accuracy,
    appliedGlobalFlags,
    captureMap: /* @__PURE__ */ new Map(),
    currentFlags: {
      dotAll: ast.flags.dotAll,
      ignoreCase: ast.flags.ignoreCase
    },
    inCharClass: false,
    lastNode,
    originMap: ast._originMap,
    recursionLimit,
    useAppliedIgnoreCase: !!(!minTargetEs2025 && hasCaseInsensitiveNode && hasCaseSensitiveNode),
    useFlagMods: minTargetEs2025,
    useFlagV: minTargetEs2024,
    verbose: opts.verbose
  };
  function gen(node) {
    state.lastNode = lastNode;
    lastNode = node;
    switch (node.type) {
      case AstTypes.Regex:
        return {
          pattern: gen(node.pattern),
          flags: gen(node.flags),
          options: { ...node.options }
        };
      case AstTypes.Alternative:
        return node.elements.map(gen).join("");
      case AstTypes.Assertion:
        return genAssertion(node, state, gen);
      case AstTypes.Backreference:
        return genBackreference(node, state);
      case AstTypes.CapturingGroup:
        return genCapturingGroup(node, state, gen);
      case AstTypes.Character:
        return genCharacter(node, state);
      case AstTypes.CharacterClass:
        return genCharacterClass(node, state, gen);
      case AstTypes.CharacterClassIntersection:
        if (!state.useFlagV) {
          throw new Error("Use of class intersection requires min target ES2024");
        }
        return node.classes.map(gen).join("&&");
      case AstTypes.CharacterClassRange:
        return genCharacterClassRange(node, state);
      case AstTypes.CharacterSet:
        return genCharacterSet(node, state);
      case AstTypes.Flags:
        return genFlags(node, state);
      case AstTypes.Group:
        return genGroup(node, state, gen);
      case AstTypes.Pattern:
        return node.alternatives.map(gen).join("|");
      case AstTypes.Quantifier:
        return gen(node.element) + getQuantifierStr(node);
      case AstTypes.Recursion:
        return genRecursion(node, state);
      default:
        throw new Error(`Unexpected node type "${node.type}"`);
    }
  }
  const result = gen(ast);
  if (!minTargetEs2024) {
    delete result.options.force.v;
    result.options.disable.v = true;
    result.options.unicodeSetsPlugin = null;
  }
  result._captureTransfers = /* @__PURE__ */ new Map();
  result._hiddenCaptures = [];
  state.captureMap.forEach((value, key2) => {
    if (value.hidden) {
      result._hiddenCaptures.push(key2);
    }
    if (value.transferTo) {
      getOrInsert(result._captureTransfers, value.transferTo, []).push(key2);
    }
  });
  return result;
}
var FlagModifierVisitor = {
  AnyGroup: {
    enter({ node }, state) {
      const currentModI = state.getCurrentModI();
      state.pushModI(
        node.flags ? getNewCurrentFlags({ ignoreCase: currentModI }, node.flags).ignoreCase : currentModI
      );
    },
    exit(_, state) {
      state.popModI();
    }
  },
  Backreference(_, state) {
    state.setHasCasedChar();
  },
  Character({ node }, state) {
    if (charHasCase(cp(node.value))) {
      state.setHasCasedChar();
    }
  },
  CharacterClassRange({ node, skip }, state) {
    skip();
    if (getCasesOutsideCharClassRange(node, { firstOnly: true }).length) {
      state.setHasCasedChar();
    }
  },
  CharacterSet({ node }, state) {
    if (node.kind === AstCharacterSetKinds.property && UnicodePropertiesWithSpecificCase.has(node.value)) {
      state.setHasCasedChar();
    }
  }
};
var BaseEscapeChars = /* @__PURE__ */ new Set([
  "$",
  "(",
  ")",
  "*",
  "+",
  ".",
  "?",
  "[",
  "\\",
  "]",
  "^",
  "{",
  "|",
  "}"
]);
var CharClassEscapeChars = /* @__PURE__ */ new Set([
  "-",
  "\\",
  "]",
  "^",
  // Literal `[` doesn't require escaping with flag u, but this can help work around regex source
  // linters and regex syntax processors that expect unescaped `[` to create a nested class
  "["
]);
var CharClassEscapeCharsFlagV = /* @__PURE__ */ new Set([
  "(",
  ")",
  "-",
  "/",
  "[",
  "\\",
  "]",
  "^",
  "{",
  "|",
  "}",
  // Double punctuators; also includes already-listed `-` and `^`
  "!",
  "#",
  "$",
  "%",
  "&",
  "*",
  "+",
  ",",
  ".",
  ":",
  ";",
  "<",
  "=",
  ">",
  "?",
  "@",
  "`",
  "~"
]);
var CharCodeEscapeMap = /* @__PURE__ */ new Map([
  [9, r3`\t`],
  // horizontal tab
  [10, r3`\n`],
  // line feed
  [11, r3`\v`],
  // vertical tab
  [12, r3`\f`],
  // form feed
  [13, r3`\r`],
  // carriage return
  [8232, r3`\u2028`],
  // line separator
  [8233, r3`\u2029`],
  // paragraph separator
  [65279, r3`\uFEFF`]
  // ZWNBSP/BOM
]);
var casedRe = new RegExp("^\\p{Cased}$", "u");
function charHasCase(char) {
  return casedRe.test(char);
}
function genAssertion(node, _, gen) {
  const { kind, negate, alternatives } = node;
  if (isLookaround(node)) {
    const prefix = `${kind === AstAssertionKinds.lookahead ? "" : "<"}${negate ? "!" : "="}`;
    return `(?${prefix}${alternatives.map(gen).join("|")})`;
  }
  if (kind === AstAssertionKinds.string_end) {
    return "$";
  }
  if (kind === AstAssertionKinds.string_start) {
    return "^";
  }
  if (kind === AstAssertionKinds.word_boundary) {
    return negate ? r3`\B` : r3`\b`;
  }
  throw new Error(`Unexpected assertion kind "${kind}"`);
}
function genBackreference({ ref }, state) {
  if (typeof ref !== "number") {
    throw new Error("Unexpected named backref in transformed AST");
  }
  if (!state.useFlagMods && state.accuracy === "strict" && state.currentFlags.ignoreCase && !state.captureMap.get(ref).ignoreCase) {
    throw new Error("Use of case-insensitive backref to case-sensitive group requires target ES2025 or non-strict accuracy");
  }
  return "\\" + ref;
}
function genCapturingGroup(node, state, gen) {
  const { name, number: number2, alternatives } = node;
  const data = { ignoreCase: state.currentFlags.ignoreCase };
  const origin = state.originMap.get(node);
  if (origin) {
    data.hidden = true;
    if (number2 > origin.number) {
      data.transferTo = origin.number;
    }
  }
  state.captureMap.set(number2, data);
  return `(${name ? `?<${name}>` : ""}${alternatives.map(gen).join("|")})`;
}
function genCharacter({ value }, state) {
  const char = cp(value);
  const escaped = getCharEscape(value, {
    isAfterBackref: state.lastNode.type === AstTypes.Backreference,
    inCharClass: state.inCharClass,
    useFlagV: state.useFlagV
  });
  if (escaped !== char) {
    return escaped;
  }
  if (state.useAppliedIgnoreCase && state.currentFlags.ignoreCase && charHasCase(char)) {
    const cases = getIgnoreCaseMatchChars(char);
    return state.inCharClass ? cases.join("") : cases.length > 1 ? `[${cases.join("")}]` : cases[0];
  }
  return char;
}
function genCharacterClass({ negate, parent, elements }, state, gen) {
  var _a4;
  if (envFlags.literalHyphenIncorrectlyCreatesRange && state.useFlagV && elements.some(isLiteralHyphen)) {
    elements = elements.filter((node) => !isLiteralHyphen(node));
    elements.push(createCharacter(45));
  }
  const genClass = () => `[${negate ? "^" : ""}${elements.map(gen).join("")}]`;
  if (!state.inCharClass) {
    state.inCharClass = true;
    const result = genClass();
    state.inCharClass = false;
    return result;
  }
  const firstType = (_a4 = elements[0]) == null ? void 0 : _a4.type;
  if (!negate && firstType && // Allows many nested classes to work with `target` ES2018 which doesn't support nesting
  ((!state.useFlagV || !state.verbose) && parent.type === AstTypes.CharacterClass && firstType !== AstTypes.CharacterClassIntersection && !(envFlags.literalHyphenIncorrectlyCreatesRange && state.useFlagV) || !state.verbose && parent.type === AstTypes.CharacterClassIntersection && // JS doesn't allow intersection with union or ranges
  elements.length === 1 && firstType !== AstTypes.CharacterClass && firstType !== AstTypes.CharacterClassRange)) {
    return elements.map(gen).join("");
  }
  if (!state.useFlagV && parent.type === AstTypes.CharacterClass) {
    throw new Error("Use of nested character class requires min target ES2024");
  }
  return genClass();
}
function genCharacterClassRange(node, state) {
  const min = node.min.value;
  const max = node.max.value;
  const escOpts = {
    isAfterBackref: false,
    inCharClass: true,
    useFlagV: state.useFlagV
  };
  const minStr = getCharEscape(min, escOpts);
  const maxStr = getCharEscape(max, escOpts);
  const extraChars = /* @__PURE__ */ new Set();
  if (state.useAppliedIgnoreCase && state.currentFlags.ignoreCase) {
    const charsOutsideRange = getCasesOutsideCharClassRange(node);
    const ranges = getCodePointRangesFromChars(charsOutsideRange);
    ranges.forEach((value) => {
      extraChars.add(
        Array.isArray(value) ? `${getCharEscape(value[0], escOpts)}-${getCharEscape(value[1], escOpts)}` : getCharEscape(value, escOpts)
      );
    });
  }
  return `${minStr}-${maxStr}${[...extraChars].join("")}`;
}
function genCharacterSet({ kind, negate, value, key: key2 }, state) {
  if (kind === AstCharacterSetKinds.dot) {
    return state.currentFlags.dotAll ? state.appliedGlobalFlags.dotAll || state.useFlagMods ? "." : "[^]" : (
      // Onig's only line break char is line feed, unlike JS
      r3`[^\n]`
    );
  }
  if (kind === AstCharacterSetKinds.digit) {
    return negate ? r3`\D` : r3`\d`;
  }
  if (kind === AstCharacterSetKinds.property) {
    if (state.useAppliedIgnoreCase && state.currentFlags.ignoreCase && UnicodePropertiesWithSpecificCase.has(value)) {
      throw new Error(`Unicode property "${value}" can't be case-insensitive when other chars have specific case`);
    }
    return `${negate ? r3`\P` : r3`\p`}{${key2 ? `${key2}=` : ""}${value}}`;
  }
  if (kind === AstCharacterSetKinds.word) {
    return negate ? r3`\W` : r3`\w`;
  }
  throw new Error(`Unexpected character set kind "${kind}"`);
}
function genFlags(node, state) {
  return (
    // The transformer should never turn on the properties for flags d, g, and m since Onig doesn't
    // have equivs. Flag m is never relied on since Onig uses different line break chars than JS
    // (node.hasIndices ? 'd' : '') +
    // (node.global ? 'g' : '') +
    // (node.multiline ? 'm' : '') +
    (state.appliedGlobalFlags.ignoreCase ? "i" : "") + (node.dotAll ? "s" : "") + (node.sticky ? "y" : "")
  );
}
function genGroup({ atomic: atomic2, flags, parent, alternatives }, state, gen) {
  const currentFlags = state.currentFlags;
  if (flags) {
    state.currentFlags = getNewCurrentFlags(currentFlags, flags);
  }
  const contents = alternatives.map(gen).join("|");
  const result = !state.verbose && alternatives.length === 1 && parent.type !== AstTypes.Quantifier && !atomic2 && (!state.useFlagMods || !flags) ? contents : `(?${getGroupPrefix(atomic2, flags, state.useFlagMods)}${contents})`;
  state.currentFlags = currentFlags;
  return result;
}
function genRecursion({ ref }, state) {
  const limit = state.recursionLimit;
  return ref === 0 ? `(?R=${limit})` : r3`\g<${ref}&R=${limit}>`;
}
function getCasesOutsideCharClassRange(node, options) {
  const firstOnly = !!(options == null ? void 0 : options.firstOnly);
  const min = node.min.value;
  const max = node.max.value;
  const found = [];
  if (min < 65 && (max === 65535 || max >= 131071) || min === 65536 && max >= 131071) {
    return found;
  }
  for (let i = min; i <= max; i++) {
    const char = cp(i);
    if (!charHasCase(char)) {
      continue;
    }
    const charsOutsideRange = getIgnoreCaseMatchChars(char).filter((caseOfChar) => {
      const num = caseOfChar.codePointAt(0);
      return num < min || num > max;
    });
    if (charsOutsideRange.length) {
      found.push(...charsOutsideRange);
      if (firstOnly) {
        break;
      }
    }
  }
  return found;
}
function getCharEscape(codePoint, { isAfterBackref, inCharClass, useFlagV }) {
  if (CharCodeEscapeMap.has(codePoint)) {
    return CharCodeEscapeMap.get(codePoint);
  }
  if (
    // Control chars, etc.; condition modeled on the Chrome developer console's display for strings
    codePoint < 32 || codePoint > 126 && codePoint < 160 || // Unicode planes 4-16; unassigned, special purpose, and private use area
    codePoint > 262143 || // Avoid corrupting a preceding backref by immediately following it with a literal digit
    isAfterBackref && isDigitCharCode(codePoint)
  ) {
    return codePoint > 255 ? `\\u{${codePoint.toString(16).toUpperCase()}}` : `\\x${codePoint.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  const escapeChars = inCharClass ? useFlagV ? CharClassEscapeCharsFlagV : CharClassEscapeChars : BaseEscapeChars;
  const char = cp(codePoint);
  return (escapeChars.has(char) ? "\\" : "") + char;
}
function getCodePointRangesFromChars(chars) {
  const codePoints = chars.map((char) => char.codePointAt(0)).sort((a, b) => a - b);
  const values = [];
  let start = null;
  for (let i = 0; i < codePoints.length; i++) {
    if (codePoints[i + 1] === codePoints[i] + 1) {
      start ?? (start = codePoints[i]);
    } else if (start === null) {
      values.push(codePoints[i]);
    } else {
      values.push([start, codePoints[i]]);
      start = null;
    }
  }
  return values;
}
function getGroupPrefix(atomic2, flagMods, useFlagMods) {
  if (atomic2) {
    return ">";
  }
  let mods = "";
  if (flagMods && useFlagMods) {
    const { enable, disable } = flagMods;
    mods = ((enable == null ? void 0 : enable.ignoreCase) ? "i" : "") + ((enable == null ? void 0 : enable.dotAll) ? "s" : "") + (disable ? "-" : "") + ((disable == null ? void 0 : disable.ignoreCase) ? "i" : "") + ((disable == null ? void 0 : disable.dotAll) ? "s" : "");
  }
  return `${mods}:`;
}
function getQuantifierStr({ min, max, greedy, possessive: possessive2 }) {
  let base;
  if (!min && max === 1) {
    base = "?";
  } else if (!min && max === Infinity) {
    base = "*";
  } else if (min === 1 && max === Infinity) {
    base = "+";
  } else if (min === max) {
    base = `{${min}}`;
  } else {
    base = `{${min},${max === Infinity ? "" : max}}`;
  }
  return base + (possessive2 ? "+" : greedy ? "" : "?");
}
function isDigitCharCode(value) {
  return value > 47 && value < 58;
}
function isLiteralHyphen({ type, value }) {
  return type === AstTypes.Character && value === 45;
}
var _captureMap, _compiled, _pattern, _nameMap, _strategy, __EmulatedRegExp_instances, execCore_fn, _a3;
var EmulatedRegExp = (_a3 = class extends RegExp {
  /**
  @overload
  @param {string} pattern
  @param {string} [flags]
  @param {EmulatedRegExpOptions} [options]
  */
  /**
  @overload
  @param {EmulatedRegExp} pattern
  @param {string} [flags]
  */
  constructor(pattern, flags, options) {
    var __super = (...args) => {
      super(...args);
      __privateAdd(this, __EmulatedRegExp_instances);
      /**
      @type {Map<number, {
        hidden?: true;
        transferTo?: number;
      }>}
      */
      __privateAdd(this, _captureMap, /* @__PURE__ */ new Map());
      /**
      @type {RegExp | EmulatedRegExp | null}
      */
      __privateAdd(this, _compiled, null);
      /**
      @type {string}
      */
      __privateAdd(this, _pattern);
      /**
      @type {Map<number, string>?}
      */
      __privateAdd(this, _nameMap, null);
      /**
      @type {string?}
      */
      __privateAdd(this, _strategy, null);
      /**
      Can be used to serialize the instance.
      @type {EmulatedRegExpOptions}
      */
      __publicField(this, "rawOptions", {});
      return this;
    };
    const lazyCompile = !!(options == null ? void 0 : options.lazyCompile);
    if (pattern instanceof RegExp) {
      if (options) {
        throw new Error("Cannot provide options when copying a regexp");
      }
      const re2 = pattern;
      __super(re2, flags);
      __privateSet(this, _pattern, re2.source);
      if (re2 instanceof _a3) {
        __privateSet(this, _captureMap, __privateGet(re2, _captureMap));
        __privateSet(this, _nameMap, __privateGet(re2, _nameMap));
        __privateSet(this, _strategy, __privateGet(re2, _strategy));
        this.rawOptions = re2.rawOptions;
      }
    } else {
      const opts = {
        hiddenCaptures: [],
        strategy: null,
        transfers: [],
        ...options
      };
      __super(lazyCompile ? "" : pattern, flags);
      __privateSet(this, _pattern, pattern);
      __privateSet(this, _captureMap, createCaptureMap(opts.hiddenCaptures, opts.transfers));
      __privateSet(this, _strategy, opts.strategy);
      this.rawOptions = options ?? {};
    }
    if (!lazyCompile) {
      __privateSet(this, _compiled, this);
    }
  }
  // Override the getter with one that works with lazy-compiled regexes
  get source() {
    return __privateGet(this, _pattern) || "(?:)";
  }
  /**
  Called internally by all String/RegExp methods that use regexes.
  @override
  @param {string} str
  @returns {RegExpExecArray?}
  */
  exec(str) {
    if (!__privateGet(this, _compiled)) {
      const { lazyCompile, ...rest } = this.rawOptions;
      __privateSet(this, _compiled, new _a3(__privateGet(this, _pattern), this.flags, rest));
    }
    const useLastIndex = this.global || this.sticky;
    const pos = this.lastIndex;
    if (__privateGet(this, _strategy) === "clip_search" && useLastIndex && pos) {
      this.lastIndex = 0;
      const match = __privateMethod(this, __EmulatedRegExp_instances, execCore_fn).call(this, str.slice(pos));
      if (match) {
        adjustMatchDetailsForOffset(match, pos, str, this.hasIndices);
        this.lastIndex += pos;
      }
      return match;
    }
    return __privateMethod(this, __EmulatedRegExp_instances, execCore_fn).call(this, str);
  }
}, _captureMap = new WeakMap(), _compiled = new WeakMap(), _pattern = new WeakMap(), _nameMap = new WeakMap(), _strategy = new WeakMap(), __EmulatedRegExp_instances = new WeakSet(), /**
Adds support for hidden and transfer captures.
@param {string} str
@returns
*/
execCore_fn = function(str) {
  __privateGet(this, _compiled).lastIndex = this.lastIndex;
  const match = __superGet(_a3.prototype, this, "exec").call(__privateGet(this, _compiled), str);
  this.lastIndex = __privateGet(this, _compiled).lastIndex;
  if (!match || !__privateGet(this, _captureMap).size) {
    return match;
  }
  const matchCopy = [...match];
  match.length = 1;
  let indicesCopy;
  if (this.hasIndices) {
    indicesCopy = [...match.indices];
    match.indices.length = 1;
  }
  const mappedNums = [0];
  for (let i = 1; i < matchCopy.length; i++) {
    const { hidden, transferTo } = __privateGet(this, _captureMap).get(i) ?? {};
    if (hidden) {
      mappedNums.push(null);
    } else {
      mappedNums.push(match.length);
      match.push(matchCopy[i]);
      if (this.hasIndices) {
        match.indices.push(indicesCopy[i]);
      }
    }
    if (transferTo && matchCopy[i] !== void 0) {
      const to = throwIfNot(mappedNums[transferTo]);
      match[to] = matchCopy[i];
      if (this.hasIndices) {
        match.indices[to] = indicesCopy[i];
      }
      if (match.groups) {
        if (!__privateGet(this, _nameMap)) {
          __privateSet(this, _nameMap, createNameMap(this.source));
        }
        const name = __privateGet(this, _nameMap).get(transferTo);
        if (name) {
          match.groups[name] = matchCopy[i];
          if (this.hasIndices) {
            match.indices.groups[name] = indicesCopy[i];
          }
        }
      }
    }
  }
  return match;
}, _a3);
function adjustMatchDetailsForOffset(match, offset, input, hasIndices) {
  match.index += offset;
  match.input = input;
  if (hasIndices) {
    const indices = match.indices;
    for (let i = 0; i < indices.length; i++) {
      const arr = indices[i];
      if (arr) {
        indices[i] = [arr[0] + offset, arr[1] + offset];
      }
    }
    const groupIndices = indices.groups;
    if (groupIndices) {
      Object.keys(groupIndices).forEach((key2) => {
        const arr = groupIndices[key2];
        if (arr) {
          groupIndices[key2] = [arr[0] + offset, arr[1] + offset];
        }
      });
    }
  }
}
function createCaptureMap(hiddenCaptures, transfers) {
  const captureMap = /* @__PURE__ */ new Map();
  for (const num of hiddenCaptures) {
    captureMap.set(num, {
      hidden: true
    });
  }
  for (const [to, from] of transfers) {
    for (const num of from) {
      getOrInsert(captureMap, num, {}).transferTo = to;
    }
  }
  return captureMap;
}
function createNameMap(pattern) {
  const re2 = /(?<capture>\((?:\?<(?![=!])(?<name>[^>]+)>|(?!\?)))|\\?./gsu;
  const map = /* @__PURE__ */ new Map();
  let numCharClassesOpen = 0;
  let numCaptures = 0;
  let match;
  while (match = re2.exec(pattern)) {
    const { 0: m, groups: { capture, name } } = match;
    if (m === "[") {
      numCharClassesOpen++;
    } else if (!numCharClassesOpen) {
      if (capture) {
        numCaptures++;
        if (name) {
          map.set(numCaptures, name);
        }
      }
    } else if (m === "]") {
      numCharClassesOpen--;
    }
  }
  return map;
}
function toRegExp(pattern, options) {
  const d = toRegExpDetails(pattern, options);
  if (d.options) {
    return new EmulatedRegExp(d.pattern, d.flags, d.options);
  }
  return new RegExp(d.pattern, d.flags);
}
function toRegExpDetails(pattern, options) {
  const opts = getOptions(options);
  const tokenized = tokenize(pattern, opts.flags, {
    captureGroup: opts.rules.captureGroup,
    singleline: opts.rules.singleline
  });
  const onigurumaAst = parse(tokenized, {
    skipBackrefValidation: opts.rules.allowOrphanBackrefs,
    verbose: opts.verbose
  });
  const regexAst = transform(onigurumaAst, {
    accuracy: opts.accuracy,
    asciiWordBoundaries: opts.rules.asciiWordBoundaries,
    avoidSubclass: opts.avoidSubclass,
    bestEffortTarget: opts.target
  });
  const generated = generate(regexAst, opts);
  const recursionResult = recursion(generated.pattern, {
    captureTransfers: generated._captureTransfers,
    hiddenCaptures: generated._hiddenCaptures,
    mode: "external"
  });
  const possessiveResult = possessive(recursionResult.pattern);
  const atomicResult = atomic(possessiveResult.pattern, {
    captureTransfers: recursionResult.captureTransfers,
    hiddenCaptures: recursionResult.hiddenCaptures
  });
  const details = {
    pattern: atomicResult.pattern,
    flags: `${opts.hasIndices ? "d" : ""}${opts.global ? "g" : ""}${generated.flags}${generated.options.disable.v ? "u" : "v"}`
  };
  if (opts.avoidSubclass) {
    if (opts.lazyCompileLength !== Infinity) {
      throw new Error("Lazy compilation requires subclass");
    }
  } else {
    const hiddenCaptures = atomicResult.hiddenCaptures.sort((a, b) => a - b);
    const transfers = Array.from(atomicResult.captureTransfers);
    const strategy = regexAst._strategy;
    const lazyCompile = details.pattern.length >= opts.lazyCompileLength;
    if (hiddenCaptures.length || transfers.length || strategy || lazyCompile) {
      details.options = {
        ...hiddenCaptures.length && { hiddenCaptures },
        ...transfers.length && { transfers },
        ...strategy && { strategy },
        ...lazyCompile && { lazyCompile }
      };
    }
  }
  return details;
}

// ../../../node_modules/.pnpm/@shikijs+engine-javascript@2.5.0/node_modules/@shikijs/engine-javascript/dist/shared/engine-javascript.hzpS1_41.mjs
var MAX = 4294967295;
var JavaScriptScanner = class {
  constructor(patterns, options = {}) {
    __publicField(this, "regexps");
    this.patterns = patterns;
    this.options = options;
    const {
      forgiving = false,
      cache,
      regexConstructor
    } = options;
    if (!regexConstructor) {
      throw new Error("Option `regexConstructor` is not provided");
    }
    this.regexps = patterns.map((p2) => {
      if (typeof p2 !== "string") {
        return p2;
      }
      const cached = cache == null ? void 0 : cache.get(p2);
      if (cached) {
        if (cached instanceof RegExp) {
          return cached;
        }
        if (forgiving)
          return null;
        throw cached;
      }
      try {
        const regex = regexConstructor(p2);
        cache == null ? void 0 : cache.set(p2, regex);
        return regex;
      } catch (e) {
        cache == null ? void 0 : cache.set(p2, e);
        if (forgiving)
          return null;
        throw e;
      }
    });
  }
  findNextMatchSync(string, startPosition, _options) {
    const str = typeof string === "string" ? string : string.content;
    const pending = [];
    function toResult(index, match, offset = 0) {
      return {
        index,
        captureIndices: match.indices.map((indice) => {
          if (indice == null) {
            return {
              start: MAX,
              end: MAX,
              length: 0
            };
          }
          return {
            start: indice[0] + offset,
            end: indice[1] + offset,
            length: indice[1] - indice[0]
          };
        })
      };
    }
    for (let i = 0; i < this.regexps.length; i++) {
      const regexp = this.regexps[i];
      if (!regexp)
        continue;
      try {
        regexp.lastIndex = startPosition;
        const match = regexp.exec(str);
        if (!match)
          continue;
        if (match.index === startPosition) {
          return toResult(i, match, 0);
        }
        pending.push([i, match, 0]);
      } catch (e) {
        if (this.options.forgiving)
          continue;
        throw e;
      }
    }
    if (pending.length) {
      const minIndex = Math.min(...pending.map((m) => m[1].index));
      for (const [i, match, offset] of pending) {
        if (match.index === minIndex) {
          return toResult(i, match, offset);
        }
      }
    }
    return null;
  }
};

// ../../../node_modules/.pnpm/@shikijs+engine-javascript@2.5.0/node_modules/@shikijs/engine-javascript/dist/engine-compile.mjs
function defaultJavaScriptRegexConstructor(pattern, options) {
  return toRegExp(
    pattern,
    {
      global: true,
      hasIndices: true,
      // This has no benefit for the standard JS engine, but it avoids a perf penalty for
      // precompiled grammars when constructing extremely long patterns that aren't always used
      lazyCompileLength: 3e3,
      rules: {
        // Needed since TextMate grammars merge backrefs across patterns
        allowOrphanBackrefs: true,
        // Improves search performance for generated regexes
        asciiWordBoundaries: true,
        // Follow `vscode-oniguruma` which enables this Oniguruma option by default
        captureGroup: true,
        // Oniguruma uses depth limit `20`; lowered here to keep regexes shorter and maybe
        // sometimes faster, but can be increased if issues reported due to low limit
        recursionLimit: 5,
        // Oniguruma option for `^`->`\A`, `$`->`\Z`; improves search performance without any
        // change in meaning since TM grammars search line by line
        singleline: true
      },
      ...options
    }
  );
}
function createJavaScriptRegexEngine(options = {}) {
  const _options = Object.assign(
    {
      target: "auto",
      cache: /* @__PURE__ */ new Map()
    },
    options
  );
  _options.regexConstructor || (_options.regexConstructor = (pattern) => defaultJavaScriptRegexConstructor(pattern, { target: _options.target }));
  return {
    createScanner(patterns) {
      return new JavaScriptScanner(patterns, _options);
    },
    createString(s) {
      return {
        content: s
      };
    }
  };
}

// ../../../node_modules/.pnpm/@shikijs+core@2.5.0/node_modules/@shikijs/core/dist/index.mjs
function createOnigurumaEngine2(options) {
  warnDeprecated("import `createOnigurumaEngine` from `@shikijs/engine-oniguruma` or `shiki/engine/oniguruma` instead");
  return createOnigurumaEngine(options);
}
function createWasmOnigEngine(options) {
  warnDeprecated("import `createOnigurumaEngine` from `@shikijs/engine-oniguruma` or `shiki/engine/oniguruma` instead");
  return createOnigurumaEngine(options);
}
function loadWasm2(options) {
  warnDeprecated("import `loadWasm` from `@shikijs/engine-oniguruma` or `shiki/engine/oniguruma` instead");
  return loadWasm(options);
}
function resolveColorReplacements(theme, options) {
  const replacements = typeof theme === "string" ? {} : { ...theme.colorReplacements };
  const themeName = typeof theme === "string" ? theme : theme.name;
  for (const [key2, value] of Object.entries((options == null ? void 0 : options.colorReplacements) || {})) {
    if (typeof value === "string")
      replacements[key2] = value;
    else if (key2 === themeName)
      Object.assign(replacements, value);
  }
  return replacements;
}
function applyColorReplacements(color, replacements) {
  if (!color)
    return color;
  return (replacements == null ? void 0 : replacements[color == null ? void 0 : color.toLowerCase()]) || color;
}
function toArray(x) {
  return Array.isArray(x) ? x : [x];
}
async function normalizeGetter(p2) {
  return Promise.resolve(typeof p2 === "function" ? p2() : p2).then((r4) => r4.default || r4);
}
function isPlainLang(lang) {
  return !lang || ["plaintext", "txt", "text", "plain"].includes(lang);
}
function isSpecialLang(lang) {
  return lang === "ansi" || isPlainLang(lang);
}
function isNoneTheme(theme) {
  return theme === "none";
}
function isSpecialTheme(theme) {
  return isNoneTheme(theme);
}
function addClassToHast(node, className) {
  var _a4;
  if (!className)
    return node;
  node.properties || (node.properties = {});
  (_a4 = node.properties).class || (_a4.class = []);
  if (typeof node.properties.class === "string")
    node.properties.class = node.properties.class.split(/\s+/g);
  if (!Array.isArray(node.properties.class))
    node.properties.class = [];
  const targets = Array.isArray(className) ? className : className.split(/\s+/g);
  for (const c of targets) {
    if (c && !node.properties.class.includes(c))
      node.properties.class.push(c);
  }
  return node;
}
function splitLines(code, preserveEnding = false) {
  var _a4;
  const parts = code.split(/(\r?\n)/g);
  let index = 0;
  const lines = [];
  for (let i = 0; i < parts.length; i += 2) {
    const line = preserveEnding ? parts[i] + (parts[i + 1] || "") : parts[i];
    lines.push([line, index]);
    index += parts[i].length;
    index += ((_a4 = parts[i + 1]) == null ? void 0 : _a4.length) || 0;
  }
  return lines;
}
function createPositionConverter(code) {
  const lines = splitLines(code, true).map(([line]) => line);
  function indexToPos(index) {
    if (index === code.length) {
      return {
        line: lines.length - 1,
        character: lines[lines.length - 1].length
      };
    }
    let character = index;
    let line = 0;
    for (const lineText of lines) {
      if (character < lineText.length)
        break;
      character -= lineText.length;
      line++;
    }
    return { line, character };
  }
  function posToIndex(line, character) {
    let index = 0;
    for (let i = 0; i < line; i++)
      index += lines[i].length;
    index += character;
    return index;
  }
  return {
    lines,
    indexToPos,
    posToIndex
  };
}
function guessEmbeddedLanguages(code, _lang, highlighter) {
  const langs = /* @__PURE__ */ new Set();
  for (const match of code.matchAll(/lang=["']([\w-]+)["']/g)) {
    langs.add(match[1]);
  }
  for (const match of code.matchAll(/(?:```|~~~)([\w-]+)/g)) {
    langs.add(match[1]);
  }
  for (const match of code.matchAll(/\\begin\{([\w-]+)\}/g)) {
    langs.add(match[1]);
  }
  if (!highlighter)
    return Array.from(langs);
  const bundle = highlighter.getBundledLanguages();
  return Array.from(langs).filter((l) => l && bundle[l]);
}
function splitToken(token2, offsets) {
  let lastOffset = 0;
  const tokens = [];
  for (const offset of offsets) {
    if (offset > lastOffset) {
      tokens.push({
        ...token2,
        content: token2.content.slice(lastOffset, offset),
        offset: token2.offset + lastOffset
      });
    }
    lastOffset = offset;
  }
  if (lastOffset < token2.content.length) {
    tokens.push({
      ...token2,
      content: token2.content.slice(lastOffset),
      offset: token2.offset + lastOffset
    });
  }
  return tokens;
}
function splitTokens(tokens, breakpoints) {
  const sorted = Array.from(breakpoints instanceof Set ? breakpoints : new Set(breakpoints)).sort((a, b) => a - b);
  if (!sorted.length)
    return tokens;
  return tokens.map((line) => {
    return line.flatMap((token2) => {
      const breakpointsInToken = sorted.filter((i) => token2.offset < i && i < token2.offset + token2.content.length).map((i) => i - token2.offset).sort((a, b) => a - b);
      if (!breakpointsInToken.length)
        return token2;
      return splitToken(token2, breakpointsInToken);
    });
  });
}
function flatTokenVariants(merged, variantsOrder, cssVariablePrefix, defaultColor) {
  const token2 = {
    content: merged.content,
    explanation: merged.explanation,
    offset: merged.offset
  };
  const styles = variantsOrder.map((t) => getTokenStyleObject(merged.variants[t]));
  const styleKeys = new Set(styles.flatMap((t) => Object.keys(t)));
  const mergedStyles = {};
  styles.forEach((cur, idx) => {
    for (const key2 of styleKeys) {
      const value = cur[key2] || "inherit";
      if (idx === 0 && defaultColor) {
        mergedStyles[key2] = value;
      } else {
        const keyName = key2 === "color" ? "" : key2 === "background-color" ? "-bg" : `-${key2}`;
        const varKey = cssVariablePrefix + variantsOrder[idx] + (key2 === "color" ? "" : keyName);
        mergedStyles[varKey] = value;
      }
    }
  });
  token2.htmlStyle = mergedStyles;
  return token2;
}
function getTokenStyleObject(token2) {
  const styles = {};
  if (token2.color)
    styles.color = token2.color;
  if (token2.bgColor)
    styles["background-color"] = token2.bgColor;
  if (token2.fontStyle) {
    if (token2.fontStyle & FontStyle.Italic)
      styles["font-style"] = "italic";
    if (token2.fontStyle & FontStyle.Bold)
      styles["font-weight"] = "bold";
    if (token2.fontStyle & FontStyle.Underline)
      styles["text-decoration"] = "underline";
  }
  return styles;
}
function stringifyTokenStyle(token2) {
  if (typeof token2 === "string")
    return token2;
  return Object.entries(token2).map(([key2, value]) => `${key2}:${value}`).join(";");
}
var _grammarStateMap = /* @__PURE__ */ new WeakMap();
function setLastGrammarStateToMap(keys, state) {
  _grammarStateMap.set(keys, state);
}
function getLastGrammarStateFromMap(keys) {
  return _grammarStateMap.get(keys);
}
var GrammarState = class _GrammarState {
  constructor(...args) {
    /**
     * Theme to Stack mapping
     */
    __publicField(this, "_stacks", {});
    __publicField(this, "lang");
    if (args.length === 2) {
      const [stacksMap, lang] = args;
      this.lang = lang;
      this._stacks = stacksMap;
    } else {
      const [stack, lang, theme] = args;
      this.lang = lang;
      this._stacks = { [theme]: stack };
    }
  }
  get themes() {
    return Object.keys(this._stacks);
  }
  get theme() {
    return this.themes[0];
  }
  get _stack() {
    return this._stacks[this.theme];
  }
  /**
   * Static method to create a initial grammar state.
   */
  static initial(lang, themes) {
    return new _GrammarState(
      Object.fromEntries(toArray(themes).map((theme) => [theme, INITIAL])),
      lang
    );
  }
  /**
   * Get the internal stack object.
   * @internal
   */
  getInternalStack(theme = this.theme) {
    return this._stacks[theme];
  }
  /**
   * @deprecated use `getScopes` instead
   */
  get scopes() {
    warnDeprecated("GrammarState.scopes is deprecated, use GrammarState.getScopes() instead");
    return getScopes(this._stacks[this.theme]);
  }
  getScopes(theme = this.theme) {
    return getScopes(this._stacks[theme]);
  }
  toJSON() {
    return {
      lang: this.lang,
      theme: this.theme,
      themes: this.themes,
      scopes: this.getScopes()
    };
  }
};
function getScopes(stack) {
  const scopes = [];
  const visited = /* @__PURE__ */ new Set();
  function pushScope(stack2) {
    var _a4;
    if (visited.has(stack2))
      return;
    visited.add(stack2);
    const name = (_a4 = stack2 == null ? void 0 : stack2.nameScopesList) == null ? void 0 : _a4.scopeName;
    if (name)
      scopes.push(name);
    if (stack2.parent)
      pushScope(stack2.parent);
  }
  pushScope(stack);
  return scopes;
}
function getGrammarStack(state, theme) {
  if (!(state instanceof GrammarState))
    throw new ShikiError("Invalid grammar state");
  return state.getInternalStack(theme);
}
function transformerDecorations() {
  const map = /* @__PURE__ */ new WeakMap();
  function getContext(shiki) {
    if (!map.has(shiki.meta)) {
      let normalizePosition = function(p2) {
        if (typeof p2 === "number") {
          if (p2 < 0 || p2 > shiki.source.length)
            throw new ShikiError(`Invalid decoration offset: ${p2}. Code length: ${shiki.source.length}`);
          return {
            ...converter.indexToPos(p2),
            offset: p2
          };
        } else {
          const line = converter.lines[p2.line];
          if (line === void 0)
            throw new ShikiError(`Invalid decoration position ${JSON.stringify(p2)}. Lines length: ${converter.lines.length}`);
          if (p2.character < 0 || p2.character > line.length)
            throw new ShikiError(`Invalid decoration position ${JSON.stringify(p2)}. Line ${p2.line} length: ${line.length}`);
          return {
            ...p2,
            offset: converter.posToIndex(p2.line, p2.character)
          };
        }
      };
      const converter = createPositionConverter(shiki.source);
      const decorations2 = (shiki.options.decorations || []).map((d) => ({
        ...d,
        start: normalizePosition(d.start),
        end: normalizePosition(d.end)
      }));
      verifyIntersections(decorations2);
      map.set(shiki.meta, {
        decorations: decorations2,
        converter,
        source: shiki.source
      });
    }
    return map.get(shiki.meta);
  }
  return {
    name: "shiki:decorations",
    tokens(tokens) {
      var _a4;
      if (!((_a4 = this.options.decorations) == null ? void 0 : _a4.length))
        return;
      const ctx = getContext(this);
      const breakpoints = ctx.decorations.flatMap((d) => [d.start.offset, d.end.offset]);
      const splitted = splitTokens(tokens, breakpoints);
      return splitted;
    },
    code(codeEl) {
      var _a4;
      if (!((_a4 = this.options.decorations) == null ? void 0 : _a4.length))
        return;
      const ctx = getContext(this);
      const lines = Array.from(codeEl.children).filter((i) => i.type === "element" && i.tagName === "span");
      if (lines.length !== ctx.converter.lines.length)
        throw new ShikiError(`Number of lines in code element (${lines.length}) does not match the number of lines in the source (${ctx.converter.lines.length}). Failed to apply decorations.`);
      function applyLineSection(line, start, end, decoration) {
        const lineEl = lines[line];
        let text2 = "";
        let startIndex = -1;
        let endIndex = -1;
        if (start === 0)
          startIndex = 0;
        if (end === 0)
          endIndex = 0;
        if (end === Number.POSITIVE_INFINITY)
          endIndex = lineEl.children.length;
        if (startIndex === -1 || endIndex === -1) {
          for (let i = 0; i < lineEl.children.length; i++) {
            text2 += stringify3(lineEl.children[i]);
            if (startIndex === -1 && text2.length === start)
              startIndex = i + 1;
            if (endIndex === -1 && text2.length === end)
              endIndex = i + 1;
          }
        }
        if (startIndex === -1)
          throw new ShikiError(`Failed to find start index for decoration ${JSON.stringify(decoration.start)}`);
        if (endIndex === -1)
          throw new ShikiError(`Failed to find end index for decoration ${JSON.stringify(decoration.end)}`);
        const children = lineEl.children.slice(startIndex, endIndex);
        if (!decoration.alwaysWrap && children.length === lineEl.children.length) {
          applyDecoration(lineEl, decoration, "line");
        } else if (!decoration.alwaysWrap && children.length === 1 && children[0].type === "element") {
          applyDecoration(children[0], decoration, "token");
        } else {
          const wrapper = {
            type: "element",
            tagName: "span",
            properties: {},
            children
          };
          applyDecoration(wrapper, decoration, "wrapper");
          lineEl.children.splice(startIndex, children.length, wrapper);
        }
      }
      function applyLine(line, decoration) {
        lines[line] = applyDecoration(lines[line], decoration, "line");
      }
      function applyDecoration(el, decoration, type) {
        var _a5;
        const properties = decoration.properties || {};
        const transform2 = decoration.transform || ((i) => i);
        el.tagName = decoration.tagName || "span";
        el.properties = {
          ...el.properties,
          ...properties,
          class: el.properties.class
        };
        if ((_a5 = decoration.properties) == null ? void 0 : _a5.class)
          addClassToHast(el, decoration.properties.class);
        el = transform2(el, type) || el;
        return el;
      }
      const lineApplies = [];
      const sorted = ctx.decorations.sort((a, b) => b.start.offset - a.start.offset || a.end.offset - b.end.offset);
      for (const decoration of sorted) {
        const { start, end } = decoration;
        if (start.line === end.line) {
          applyLineSection(start.line, start.character, end.character, decoration);
        } else if (start.line < end.line) {
          applyLineSection(start.line, start.character, Number.POSITIVE_INFINITY, decoration);
          for (let i = start.line + 1; i < end.line; i++)
            lineApplies.unshift(() => applyLine(i, decoration));
          applyLineSection(end.line, 0, end.character, decoration);
        }
      }
      lineApplies.forEach((i) => i());
    }
  };
}
function verifyIntersections(items) {
  for (let i = 0; i < items.length; i++) {
    const foo = items[i];
    if (foo.start.offset > foo.end.offset)
      throw new ShikiError(`Invalid decoration range: ${JSON.stringify(foo.start)} - ${JSON.stringify(foo.end)}`);
    for (let j = i + 1; j < items.length; j++) {
      const bar = items[j];
      const isFooHasBarStart = foo.start.offset <= bar.start.offset && bar.start.offset < foo.end.offset;
      const isFooHasBarEnd = foo.start.offset < bar.end.offset && bar.end.offset <= foo.end.offset;
      const isBarHasFooStart = bar.start.offset <= foo.start.offset && foo.start.offset < bar.end.offset;
      const isBarHasFooEnd = bar.start.offset < foo.end.offset && foo.end.offset <= bar.end.offset;
      if (isFooHasBarStart || isFooHasBarEnd || isBarHasFooStart || isBarHasFooEnd) {
        if (isFooHasBarStart && isFooHasBarEnd)
          continue;
        if (isBarHasFooStart && isBarHasFooEnd)
          continue;
        throw new ShikiError(`Decorations ${JSON.stringify(foo.start)} and ${JSON.stringify(bar.start)} intersect.`);
      }
    }
  }
}
function stringify3(el) {
  if (el.type === "text")
    return el.value;
  if (el.type === "element")
    return el.children.map(stringify3).join("");
  return "";
}
var builtInTransformers = [
  transformerDecorations()
];
function getTransformers(options) {
  return [
    ...options.transformers || [],
    ...builtInTransformers
  ];
}
var namedColors = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite"
];
var decorations = {
  1: "bold",
  2: "dim",
  3: "italic",
  4: "underline",
  7: "reverse",
  8: "hidden",
  9: "strikethrough"
};
function findSequence(value, position) {
  const nextEscape = value.indexOf("\x1B", position);
  if (nextEscape !== -1) {
    if (value[nextEscape + 1] === "[") {
      const nextClose = value.indexOf("m", nextEscape);
      if (nextClose !== -1) {
        return {
          sequence: value.substring(nextEscape + 2, nextClose).split(";"),
          startPosition: nextEscape,
          position: nextClose + 1
        };
      }
    }
  }
  return {
    position: value.length
  };
}
function parseColor(sequence) {
  const colorMode = sequence.shift();
  if (colorMode === "2") {
    const rgb = sequence.splice(0, 3).map((x) => Number.parseInt(x));
    if (rgb.length !== 3 || rgb.some((x) => Number.isNaN(x)))
      return;
    return {
      type: "rgb",
      rgb
    };
  } else if (colorMode === "5") {
    const index = sequence.shift();
    if (index) {
      return { type: "table", index: Number(index) };
    }
  }
}
function parseSequence(sequence) {
  const commands = [];
  while (sequence.length > 0) {
    const code = sequence.shift();
    if (!code)
      continue;
    const codeInt = Number.parseInt(code);
    if (Number.isNaN(codeInt))
      continue;
    if (codeInt === 0) {
      commands.push({ type: "resetAll" });
    } else if (codeInt <= 9) {
      const decoration = decorations[codeInt];
      if (decoration) {
        commands.push({
          type: "setDecoration",
          value: decorations[codeInt]
        });
      }
    } else if (codeInt <= 29) {
      const decoration = decorations[codeInt - 20];
      if (decoration) {
        commands.push({
          type: "resetDecoration",
          value: decoration
        });
        if (decoration === "dim") {
          commands.push({
            type: "resetDecoration",
            value: "bold"
          });
        }
      }
    } else if (codeInt <= 37) {
      commands.push({
        type: "setForegroundColor",
        value: { type: "named", name: namedColors[codeInt - 30] }
      });
    } else if (codeInt === 38) {
      const color = parseColor(sequence);
      if (color) {
        commands.push({
          type: "setForegroundColor",
          value: color
        });
      }
    } else if (codeInt === 39) {
      commands.push({
        type: "resetForegroundColor"
      });
    } else if (codeInt <= 47) {
      commands.push({
        type: "setBackgroundColor",
        value: { type: "named", name: namedColors[codeInt - 40] }
      });
    } else if (codeInt === 48) {
      const color = parseColor(sequence);
      if (color) {
        commands.push({
          type: "setBackgroundColor",
          value: color
        });
      }
    } else if (codeInt === 49) {
      commands.push({
        type: "resetBackgroundColor"
      });
    } else if (codeInt === 53) {
      commands.push({
        type: "setDecoration",
        value: "overline"
      });
    } else if (codeInt === 55) {
      commands.push({
        type: "resetDecoration",
        value: "overline"
      });
    } else if (codeInt >= 90 && codeInt <= 97) {
      commands.push({
        type: "setForegroundColor",
        value: { type: "named", name: namedColors[codeInt - 90 + 8] }
      });
    } else if (codeInt >= 100 && codeInt <= 107) {
      commands.push({
        type: "setBackgroundColor",
        value: { type: "named", name: namedColors[codeInt - 100 + 8] }
      });
    }
  }
  return commands;
}
function createAnsiSequenceParser() {
  let foreground = null;
  let background = null;
  let decorations2 = /* @__PURE__ */ new Set();
  return {
    parse(value) {
      const tokens = [];
      let position = 0;
      do {
        const findResult = findSequence(value, position);
        const text2 = findResult.sequence ? value.substring(position, findResult.startPosition) : value.substring(position);
        if (text2.length > 0) {
          tokens.push({
            value: text2,
            foreground,
            background,
            decorations: new Set(decorations2)
          });
        }
        if (findResult.sequence) {
          const commands = parseSequence(findResult.sequence);
          for (const styleToken of commands) {
            if (styleToken.type === "resetAll") {
              foreground = null;
              background = null;
              decorations2.clear();
            } else if (styleToken.type === "resetForegroundColor") {
              foreground = null;
            } else if (styleToken.type === "resetBackgroundColor") {
              background = null;
            } else if (styleToken.type === "resetDecoration") {
              decorations2.delete(styleToken.value);
            }
          }
          for (const styleToken of commands) {
            if (styleToken.type === "setForegroundColor") {
              foreground = styleToken.value;
            } else if (styleToken.type === "setBackgroundColor") {
              background = styleToken.value;
            } else if (styleToken.type === "setDecoration") {
              decorations2.add(styleToken.value);
            }
          }
        }
        position = findResult.position;
      } while (position < value.length);
      return tokens;
    }
  };
}
var defaultNamedColorsMap = {
  black: "#000000",
  red: "#bb0000",
  green: "#00bb00",
  yellow: "#bbbb00",
  blue: "#0000bb",
  magenta: "#ff00ff",
  cyan: "#00bbbb",
  white: "#eeeeee",
  brightBlack: "#555555",
  brightRed: "#ff5555",
  brightGreen: "#00ff00",
  brightYellow: "#ffff55",
  brightBlue: "#5555ff",
  brightMagenta: "#ff55ff",
  brightCyan: "#55ffff",
  brightWhite: "#ffffff"
};
function createColorPalette(namedColorsMap = defaultNamedColorsMap) {
  function namedColor(name) {
    return namedColorsMap[name];
  }
  function rgbColor(rgb) {
    return `#${rgb.map((x) => Math.max(0, Math.min(x, 255)).toString(16).padStart(2, "0")).join("")}`;
  }
  let colorTable;
  function getColorTable() {
    if (colorTable) {
      return colorTable;
    }
    colorTable = [];
    for (let i = 0; i < namedColors.length; i++) {
      colorTable.push(namedColor(namedColors[i]));
    }
    let levels = [0, 95, 135, 175, 215, 255];
    for (let r4 = 0; r4 < 6; r4++) {
      for (let g = 0; g < 6; g++) {
        for (let b = 0; b < 6; b++) {
          colorTable.push(rgbColor([levels[r4], levels[g], levels[b]]));
        }
      }
    }
    let level = 8;
    for (let i = 0; i < 24; i++, level += 10) {
      colorTable.push(rgbColor([level, level, level]));
    }
    return colorTable;
  }
  function tableColor(index) {
    return getColorTable()[index];
  }
  function value(color) {
    switch (color.type) {
      case "named":
        return namedColor(color.name);
      case "rgb":
        return rgbColor(color.rgb);
      case "table":
        return tableColor(color.index);
    }
  }
  return {
    value
  };
}
function tokenizeAnsiWithTheme(theme, fileContents, options) {
  const colorReplacements = resolveColorReplacements(theme, options);
  const lines = splitLines(fileContents);
  const colorPalette = createColorPalette(
    Object.fromEntries(
      namedColors.map((name) => {
        var _a4;
        return [
          name,
          (_a4 = theme.colors) == null ? void 0 : _a4[`terminal.ansi${name[0].toUpperCase()}${name.substring(1)}`]
        ];
      })
    )
  );
  const parser = createAnsiSequenceParser();
  return lines.map(
    (line) => parser.parse(line[0]).map((token2) => {
      let color;
      let bgColor;
      if (token2.decorations.has("reverse")) {
        color = token2.background ? colorPalette.value(token2.background) : theme.bg;
        bgColor = token2.foreground ? colorPalette.value(token2.foreground) : theme.fg;
      } else {
        color = token2.foreground ? colorPalette.value(token2.foreground) : theme.fg;
        bgColor = token2.background ? colorPalette.value(token2.background) : void 0;
      }
      color = applyColorReplacements(color, colorReplacements);
      bgColor = applyColorReplacements(bgColor, colorReplacements);
      if (token2.decorations.has("dim"))
        color = dimColor(color);
      let fontStyle = FontStyle.None;
      if (token2.decorations.has("bold"))
        fontStyle |= FontStyle.Bold;
      if (token2.decorations.has("italic"))
        fontStyle |= FontStyle.Italic;
      if (token2.decorations.has("underline"))
        fontStyle |= FontStyle.Underline;
      return {
        content: token2.value,
        offset: line[1],
        // TODO: more accurate offset? might need to fork ansi-sequence-parser
        color,
        bgColor,
        fontStyle
      };
    })
  );
}
function dimColor(color) {
  const hexMatch = color.match(/#([0-9a-f]{3})([0-9a-f]{3})?([0-9a-f]{2})?/);
  if (hexMatch) {
    if (hexMatch[3]) {
      const alpha = Math.round(Number.parseInt(hexMatch[3], 16) / 2).toString(16).padStart(2, "0");
      return `#${hexMatch[1]}${hexMatch[2]}${alpha}`;
    } else if (hexMatch[2]) {
      return `#${hexMatch[1]}${hexMatch[2]}80`;
    } else {
      return `#${Array.from(hexMatch[1]).map((x) => `${x}${x}`).join("")}80`;
    }
  }
  const cssVarMatch = color.match(/var\((--[\w-]+-ansi-[\w-]+)\)/);
  if (cssVarMatch)
    return `var(${cssVarMatch[1]}-dim)`;
  return color;
}
function codeToTokensBase(internal, code, options = {}) {
  const {
    lang = "text",
    theme: themeName = internal.getLoadedThemes()[0]
  } = options;
  if (isPlainLang(lang) || isNoneTheme(themeName))
    return splitLines(code).map((line) => [{ content: line[0], offset: line[1] }]);
  const { theme, colorMap } = internal.setTheme(themeName);
  if (lang === "ansi")
    return tokenizeAnsiWithTheme(theme, code, options);
  const _grammar = internal.getLanguage(lang);
  if (options.grammarState) {
    if (options.grammarState.lang !== _grammar.name) {
      throw new ShikiError(`Grammar state language "${options.grammarState.lang}" does not match highlight language "${_grammar.name}"`);
    }
    if (!options.grammarState.themes.includes(theme.name)) {
      throw new ShikiError(`Grammar state themes "${options.grammarState.themes}" do not contain highlight theme "${theme.name}"`);
    }
  }
  return tokenizeWithTheme(code, _grammar, theme, colorMap, options);
}
function getLastGrammarState(...args) {
  if (args.length === 2) {
    return getLastGrammarStateFromMap(args[1]);
  }
  const [internal, code, options = {}] = args;
  const {
    lang = "text",
    theme: themeName = internal.getLoadedThemes()[0]
  } = options;
  if (isPlainLang(lang) || isNoneTheme(themeName))
    throw new ShikiError("Plain language does not have grammar state");
  if (lang === "ansi")
    throw new ShikiError("ANSI language does not have grammar state");
  const { theme, colorMap } = internal.setTheme(themeName);
  const _grammar = internal.getLanguage(lang);
  return new GrammarState(
    _tokenizeWithTheme(code, _grammar, theme, colorMap, options).stateStack,
    _grammar.name,
    theme.name
  );
}
function tokenizeWithTheme(code, grammar, theme, colorMap, options) {
  const result = _tokenizeWithTheme(code, grammar, theme, colorMap, options);
  const grammarState = new GrammarState(
    _tokenizeWithTheme(code, grammar, theme, colorMap, options).stateStack,
    grammar.name,
    theme.name
  );
  setLastGrammarStateToMap(result.tokens, grammarState);
  return result.tokens;
}
function _tokenizeWithTheme(code, grammar, theme, colorMap, options) {
  const colorReplacements = resolveColorReplacements(theme, options);
  const {
    tokenizeMaxLineLength = 0,
    tokenizeTimeLimit = 500
  } = options;
  const lines = splitLines(code);
  let stateStack = options.grammarState ? getGrammarStack(options.grammarState, theme.name) ?? INITIAL : options.grammarContextCode != null ? _tokenizeWithTheme(
    options.grammarContextCode,
    grammar,
    theme,
    colorMap,
    {
      ...options,
      grammarState: void 0,
      grammarContextCode: void 0
    }
  ).stateStack : INITIAL;
  let actual = [];
  const final = [];
  for (let i = 0, len = lines.length; i < len; i++) {
    const [line, lineOffset] = lines[i];
    if (line === "") {
      actual = [];
      final.push([]);
      continue;
    }
    if (tokenizeMaxLineLength > 0 && line.length >= tokenizeMaxLineLength) {
      actual = [];
      final.push([{
        content: line,
        offset: lineOffset,
        color: "",
        fontStyle: 0
      }]);
      continue;
    }
    let resultWithScopes;
    let tokensWithScopes;
    let tokensWithScopesIndex;
    if (options.includeExplanation) {
      resultWithScopes = grammar.tokenizeLine(line, stateStack, tokenizeTimeLimit);
      tokensWithScopes = resultWithScopes.tokens;
      tokensWithScopesIndex = 0;
    }
    const result = grammar.tokenizeLine2(line, stateStack, tokenizeTimeLimit);
    const tokensLength = result.tokens.length / 2;
    for (let j = 0; j < tokensLength; j++) {
      const startIndex = result.tokens[2 * j];
      const nextStartIndex = j + 1 < tokensLength ? result.tokens[2 * j + 2] : line.length;
      if (startIndex === nextStartIndex)
        continue;
      const metadata = result.tokens[2 * j + 1];
      const color = applyColorReplacements(
        colorMap[EncodedTokenMetadata.getForeground(metadata)],
        colorReplacements
      );
      const fontStyle = EncodedTokenMetadata.getFontStyle(metadata);
      const token2 = {
        content: line.substring(startIndex, nextStartIndex),
        offset: lineOffset + startIndex,
        color,
        fontStyle
      };
      if (options.includeExplanation) {
        const themeSettingsSelectors = [];
        if (options.includeExplanation !== "scopeName") {
          for (const setting of theme.settings) {
            let selectors;
            switch (typeof setting.scope) {
              case "string":
                selectors = setting.scope.split(/,/).map((scope) => scope.trim());
                break;
              case "object":
                selectors = setting.scope;
                break;
              default:
                continue;
            }
            themeSettingsSelectors.push({
              settings: setting,
              selectors: selectors.map((selector) => selector.split(/ /))
            });
          }
        }
        token2.explanation = [];
        let offset = 0;
        while (startIndex + offset < nextStartIndex) {
          const tokenWithScopes = tokensWithScopes[tokensWithScopesIndex];
          const tokenWithScopesText = line.substring(
            tokenWithScopes.startIndex,
            tokenWithScopes.endIndex
          );
          offset += tokenWithScopesText.length;
          token2.explanation.push({
            content: tokenWithScopesText,
            scopes: options.includeExplanation === "scopeName" ? explainThemeScopesNameOnly(
              tokenWithScopes.scopes
            ) : explainThemeScopesFull(
              themeSettingsSelectors,
              tokenWithScopes.scopes
            )
          });
          tokensWithScopesIndex += 1;
        }
      }
      actual.push(token2);
    }
    final.push(actual);
    actual = [];
    stateStack = result.ruleStack;
  }
  return {
    tokens: final,
    stateStack
  };
}
function explainThemeScopesNameOnly(scopes) {
  return scopes.map((scope) => ({ scopeName: scope }));
}
function explainThemeScopesFull(themeSelectors, scopes) {
  const result = [];
  for (let i = 0, len = scopes.length; i < len; i++) {
    const scope = scopes[i];
    result[i] = {
      scopeName: scope,
      themeMatches: explainThemeScope(themeSelectors, scope, scopes.slice(0, i))
    };
  }
  return result;
}
function matchesOne(selector, scope) {
  return selector === scope || scope.substring(0, selector.length) === selector && scope[selector.length] === ".";
}
function matches(selectors, scope, parentScopes) {
  if (!matchesOne(selectors[selectors.length - 1], scope))
    return false;
  let selectorParentIndex = selectors.length - 2;
  let parentIndex = parentScopes.length - 1;
  while (selectorParentIndex >= 0 && parentIndex >= 0) {
    if (matchesOne(selectors[selectorParentIndex], parentScopes[parentIndex]))
      selectorParentIndex -= 1;
    parentIndex -= 1;
  }
  if (selectorParentIndex === -1)
    return true;
  return false;
}
function explainThemeScope(themeSettingsSelectors, scope, parentScopes) {
  const result = [];
  for (const { selectors, settings } of themeSettingsSelectors) {
    for (const selectorPieces of selectors) {
      if (matches(selectorPieces, scope, parentScopes)) {
        result.push(settings);
        break;
      }
    }
  }
  return result;
}
function codeToTokensWithThemes(internal, code, options) {
  const themes = Object.entries(options.themes).filter((i) => i[1]).map((i) => ({ color: i[0], theme: i[1] }));
  const themedTokens = themes.map((t) => {
    const tokens2 = codeToTokensBase(internal, code, {
      ...options,
      theme: t.theme
    });
    const state = getLastGrammarStateFromMap(tokens2);
    const theme = typeof t.theme === "string" ? t.theme : t.theme.name;
    return {
      tokens: tokens2,
      state,
      theme
    };
  });
  const tokens = syncThemesTokenization(
    ...themedTokens.map((i) => i.tokens)
  );
  const mergedTokens = tokens[0].map(
    (line, lineIdx) => line.map((_token, tokenIdx) => {
      const mergedToken = {
        content: _token.content,
        variants: {},
        offset: _token.offset
      };
      if ("includeExplanation" in options && options.includeExplanation) {
        mergedToken.explanation = _token.explanation;
      }
      tokens.forEach((t, themeIdx) => {
        const {
          content: _,
          explanation: __,
          offset: ___,
          ...styles
        } = t[lineIdx][tokenIdx];
        mergedToken.variants[themes[themeIdx].color] = styles;
      });
      return mergedToken;
    })
  );
  const mergedGrammarState = themedTokens[0].state ? new GrammarState(
    Object.fromEntries(themedTokens.map((s) => {
      var _a4;
      return [s.theme, (_a4 = s.state) == null ? void 0 : _a4.getInternalStack(s.theme)];
    })),
    themedTokens[0].state.lang
  ) : void 0;
  if (mergedGrammarState)
    setLastGrammarStateToMap(mergedTokens, mergedGrammarState);
  return mergedTokens;
}
function syncThemesTokenization(...themes) {
  const outThemes = themes.map(() => []);
  const count = themes.length;
  for (let i = 0; i < themes[0].length; i++) {
    const lines = themes.map((t) => t[i]);
    const outLines = outThemes.map(() => []);
    outThemes.forEach((t, i2) => t.push(outLines[i2]));
    const indexes = lines.map(() => 0);
    const current = lines.map((l) => l[0]);
    while (current.every((t) => t)) {
      const minLength = Math.min(...current.map((t) => t.content.length));
      for (let n = 0; n < count; n++) {
        const token2 = current[n];
        if (token2.content.length === minLength) {
          outLines[n].push(token2);
          indexes[n] += 1;
          current[n] = lines[n][indexes[n]];
        } else {
          outLines[n].push({
            ...token2,
            content: token2.content.slice(0, minLength)
          });
          current[n] = {
            ...token2,
            content: token2.content.slice(minLength),
            offset: token2.offset + minLength
          };
        }
      }
    }
  }
  return outThemes;
}
function codeToTokens(internal, code, options) {
  let bg;
  let fg;
  let tokens;
  let themeName;
  let rootStyle;
  let grammarState;
  if ("themes" in options) {
    const {
      defaultColor = "light",
      cssVariablePrefix = "--shiki-"
    } = options;
    const themes = Object.entries(options.themes).filter((i) => i[1]).map((i) => ({ color: i[0], theme: i[1] })).sort((a, b) => a.color === defaultColor ? -1 : b.color === defaultColor ? 1 : 0);
    if (themes.length === 0)
      throw new ShikiError("`themes` option must not be empty");
    const themeTokens = codeToTokensWithThemes(
      internal,
      code,
      options
    );
    grammarState = getLastGrammarStateFromMap(themeTokens);
    if (defaultColor && !themes.find((t) => t.color === defaultColor))
      throw new ShikiError(`\`themes\` option must contain the defaultColor key \`${defaultColor}\``);
    const themeRegs = themes.map((t) => internal.getTheme(t.theme));
    const themesOrder = themes.map((t) => t.color);
    tokens = themeTokens.map((line) => line.map((token2) => flatTokenVariants(token2, themesOrder, cssVariablePrefix, defaultColor)));
    if (grammarState)
      setLastGrammarStateToMap(tokens, grammarState);
    const themeColorReplacements = themes.map((t) => resolveColorReplacements(t.theme, options));
    fg = themes.map((t, idx) => (idx === 0 && defaultColor ? "" : `${cssVariablePrefix + t.color}:`) + (applyColorReplacements(themeRegs[idx].fg, themeColorReplacements[idx]) || "inherit")).join(";");
    bg = themes.map((t, idx) => (idx === 0 && defaultColor ? "" : `${cssVariablePrefix + t.color}-bg:`) + (applyColorReplacements(themeRegs[idx].bg, themeColorReplacements[idx]) || "inherit")).join(";");
    themeName = `shiki-themes ${themeRegs.map((t) => t.name).join(" ")}`;
    rootStyle = defaultColor ? void 0 : [fg, bg].join(";");
  } else if ("theme" in options) {
    const colorReplacements = resolveColorReplacements(options.theme, options);
    tokens = codeToTokensBase(
      internal,
      code,
      options
    );
    const _theme = internal.getTheme(options.theme);
    bg = applyColorReplacements(_theme.bg, colorReplacements);
    fg = applyColorReplacements(_theme.fg, colorReplacements);
    themeName = _theme.name;
    grammarState = getLastGrammarStateFromMap(tokens);
  } else {
    throw new ShikiError("Invalid options, either `theme` or `themes` must be provided");
  }
  return {
    tokens,
    fg,
    bg,
    themeName,
    rootStyle,
    grammarState
  };
}
function codeToHast(internal, code, options, transformerContext = {
  meta: {},
  options,
  codeToHast: (_code, _options) => codeToHast(internal, _code, _options),
  codeToTokens: (_code, _options) => codeToTokens(internal, _code, _options)
}) {
  var _a4, _b;
  let input = code;
  for (const transformer of getTransformers(options))
    input = ((_a4 = transformer.preprocess) == null ? void 0 : _a4.call(transformerContext, input, options)) || input;
  let {
    tokens,
    fg,
    bg,
    themeName,
    rootStyle,
    grammarState
  } = codeToTokens(internal, input, options);
  const {
    mergeWhitespaces = true
  } = options;
  if (mergeWhitespaces === true)
    tokens = mergeWhitespaceTokens(tokens);
  else if (mergeWhitespaces === "never")
    tokens = splitWhitespaceTokens(tokens);
  const contextSource = {
    ...transformerContext,
    get source() {
      return input;
    }
  };
  for (const transformer of getTransformers(options))
    tokens = ((_b = transformer.tokens) == null ? void 0 : _b.call(contextSource, tokens)) || tokens;
  return tokensToHast(
    tokens,
    {
      ...options,
      fg,
      bg,
      themeName,
      rootStyle
    },
    contextSource,
    grammarState
  );
}
function tokensToHast(tokens, options, transformerContext, grammarState = getLastGrammarStateFromMap(tokens)) {
  var _a4, _b, _c;
  const transformers = getTransformers(options);
  const lines = [];
  const root2 = {
    type: "root",
    children: []
  };
  const {
    structure = "classic",
    tabindex = "0"
  } = options;
  let preNode = {
    type: "element",
    tagName: "pre",
    properties: {
      class: `shiki ${options.themeName || ""}`,
      style: options.rootStyle || `background-color:${options.bg};color:${options.fg}`,
      ...tabindex !== false && tabindex != null ? {
        tabindex: tabindex.toString()
      } : {},
      ...Object.fromEntries(
        Array.from(
          Object.entries(options.meta || {})
        ).filter(([key2]) => !key2.startsWith("_"))
      )
    },
    children: []
  };
  let codeNode = {
    type: "element",
    tagName: "code",
    properties: {},
    children: lines
  };
  const lineNodes = [];
  const context = {
    ...transformerContext,
    structure,
    addClassToHast,
    get source() {
      return transformerContext.source;
    },
    get tokens() {
      return tokens;
    },
    get options() {
      return options;
    },
    get root() {
      return root2;
    },
    get pre() {
      return preNode;
    },
    get code() {
      return codeNode;
    },
    get lines() {
      return lineNodes;
    }
  };
  tokens.forEach((line, idx) => {
    var _a5, _b2;
    if (idx) {
      if (structure === "inline")
        root2.children.push({ type: "element", tagName: "br", properties: {}, children: [] });
      else if (structure === "classic")
        lines.push({ type: "text", value: "\n" });
    }
    let lineNode = {
      type: "element",
      tagName: "span",
      properties: { class: "line" },
      children: []
    };
    let col = 0;
    for (const token2 of line) {
      let tokenNode = {
        type: "element",
        tagName: "span",
        properties: {
          ...token2.htmlAttrs
        },
        children: [{ type: "text", value: token2.content }]
      };
      if (typeof token2.htmlStyle === "string")
        warnDeprecated("`htmlStyle` as a string is deprecated. Use an object instead.");
      const style = stringifyTokenStyle(token2.htmlStyle || getTokenStyleObject(token2));
      if (style)
        tokenNode.properties.style = style;
      for (const transformer of transformers)
        tokenNode = ((_a5 = transformer == null ? void 0 : transformer.span) == null ? void 0 : _a5.call(context, tokenNode, idx + 1, col, lineNode, token2)) || tokenNode;
      if (structure === "inline")
        root2.children.push(tokenNode);
      else if (structure === "classic")
        lineNode.children.push(tokenNode);
      col += token2.content.length;
    }
    if (structure === "classic") {
      for (const transformer of transformers)
        lineNode = ((_b2 = transformer == null ? void 0 : transformer.line) == null ? void 0 : _b2.call(context, lineNode, idx + 1)) || lineNode;
      lineNodes.push(lineNode);
      lines.push(lineNode);
    }
  });
  if (structure === "classic") {
    for (const transformer of transformers)
      codeNode = ((_a4 = transformer == null ? void 0 : transformer.code) == null ? void 0 : _a4.call(context, codeNode)) || codeNode;
    preNode.children.push(codeNode);
    for (const transformer of transformers)
      preNode = ((_b = transformer == null ? void 0 : transformer.pre) == null ? void 0 : _b.call(context, preNode)) || preNode;
    root2.children.push(preNode);
  }
  let result = root2;
  for (const transformer of transformers)
    result = ((_c = transformer == null ? void 0 : transformer.root) == null ? void 0 : _c.call(context, result)) || result;
  if (grammarState)
    setLastGrammarStateToMap(result, grammarState);
  return result;
}
function mergeWhitespaceTokens(tokens) {
  return tokens.map((line) => {
    const newLine = [];
    let carryOnContent = "";
    let firstOffset = 0;
    line.forEach((token2, idx) => {
      const isUnderline = token2.fontStyle && token2.fontStyle & FontStyle.Underline;
      const couldMerge = !isUnderline;
      if (couldMerge && token2.content.match(/^\s+$/) && line[idx + 1]) {
        if (!firstOffset)
          firstOffset = token2.offset;
        carryOnContent += token2.content;
      } else {
        if (carryOnContent) {
          if (couldMerge) {
            newLine.push({
              ...token2,
              offset: firstOffset,
              content: carryOnContent + token2.content
            });
          } else {
            newLine.push(
              {
                content: carryOnContent,
                offset: firstOffset
              },
              token2
            );
          }
          firstOffset = 0;
          carryOnContent = "";
        } else {
          newLine.push(token2);
        }
      }
    });
    return newLine;
  });
}
function splitWhitespaceTokens(tokens) {
  return tokens.map((line) => {
    return line.flatMap((token2) => {
      if (token2.content.match(/^\s+$/))
        return token2;
      const match = token2.content.match(/^(\s*)(.*?)(\s*)$/);
      if (!match)
        return token2;
      const [, leading, content, trailing] = match;
      if (!leading && !trailing)
        return token2;
      const expanded = [{
        ...token2,
        offset: token2.offset + leading.length,
        content
      }];
      if (leading) {
        expanded.unshift({
          content: leading,
          offset: token2.offset
        });
      }
      if (trailing) {
        expanded.push({
          content: trailing,
          offset: token2.offset + leading.length + content.length
        });
      }
      return expanded;
    });
  });
}
function codeToHtml(internal, code, options) {
  var _a4;
  const context = {
    meta: {},
    options,
    codeToHast: (_code, _options) => codeToHast(internal, _code, _options),
    codeToTokens: (_code, _options) => codeToTokens(internal, _code, _options)
  };
  let result = toHtml(codeToHast(internal, code, options, context));
  for (const transformer of getTransformers(options))
    result = ((_a4 = transformer.postprocess) == null ? void 0 : _a4.call(context, result, options)) || result;
  return result;
}
var VSCODE_FALLBACK_EDITOR_FG = { light: "#333333", dark: "#bbbbbb" };
var VSCODE_FALLBACK_EDITOR_BG = { light: "#fffffe", dark: "#1e1e1e" };
var RESOLVED_KEY = "__shiki_resolved";
function normalizeTheme(rawTheme) {
  var _a4, _b, _c, _d, _e;
  if (rawTheme == null ? void 0 : rawTheme[RESOLVED_KEY])
    return rawTheme;
  const theme = {
    ...rawTheme
  };
  if (theme.tokenColors && !theme.settings) {
    theme.settings = theme.tokenColors;
    delete theme.tokenColors;
  }
  theme.type || (theme.type = "dark");
  theme.colorReplacements = { ...theme.colorReplacements };
  theme.settings || (theme.settings = []);
  let { bg, fg } = theme;
  if (!bg || !fg) {
    const globalSetting = theme.settings ? theme.settings.find((s) => !s.name && !s.scope) : void 0;
    if ((_a4 = globalSetting == null ? void 0 : globalSetting.settings) == null ? void 0 : _a4.foreground)
      fg = globalSetting.settings.foreground;
    if ((_b = globalSetting == null ? void 0 : globalSetting.settings) == null ? void 0 : _b.background)
      bg = globalSetting.settings.background;
    if (!fg && ((_c = theme == null ? void 0 : theme.colors) == null ? void 0 : _c["editor.foreground"]))
      fg = theme.colors["editor.foreground"];
    if (!bg && ((_d = theme == null ? void 0 : theme.colors) == null ? void 0 : _d["editor.background"]))
      bg = theme.colors["editor.background"];
    if (!fg)
      fg = theme.type === "light" ? VSCODE_FALLBACK_EDITOR_FG.light : VSCODE_FALLBACK_EDITOR_FG.dark;
    if (!bg)
      bg = theme.type === "light" ? VSCODE_FALLBACK_EDITOR_BG.light : VSCODE_FALLBACK_EDITOR_BG.dark;
    theme.fg = fg;
    theme.bg = bg;
  }
  if (!(theme.settings[0] && theme.settings[0].settings && !theme.settings[0].scope)) {
    theme.settings.unshift({
      settings: {
        foreground: theme.fg,
        background: theme.bg
      }
    });
  }
  let replacementCount = 0;
  const replacementMap = /* @__PURE__ */ new Map();
  function getReplacementColor(value) {
    var _a5;
    if (replacementMap.has(value))
      return replacementMap.get(value);
    replacementCount += 1;
    const hex = `#${replacementCount.toString(16).padStart(8, "0").toLowerCase()}`;
    if ((_a5 = theme.colorReplacements) == null ? void 0 : _a5[`#${hex}`])
      return getReplacementColor(value);
    replacementMap.set(value, hex);
    return hex;
  }
  theme.settings = theme.settings.map((setting) => {
    var _a5, _b2;
    const replaceFg = ((_a5 = setting.settings) == null ? void 0 : _a5.foreground) && !setting.settings.foreground.startsWith("#");
    const replaceBg = ((_b2 = setting.settings) == null ? void 0 : _b2.background) && !setting.settings.background.startsWith("#");
    if (!replaceFg && !replaceBg)
      return setting;
    const clone2 = {
      ...setting,
      settings: {
        ...setting.settings
      }
    };
    if (replaceFg) {
      const replacement = getReplacementColor(setting.settings.foreground);
      theme.colorReplacements[replacement] = setting.settings.foreground;
      clone2.settings.foreground = replacement;
    }
    if (replaceBg) {
      const replacement = getReplacementColor(setting.settings.background);
      theme.colorReplacements[replacement] = setting.settings.background;
      clone2.settings.background = replacement;
    }
    return clone2;
  });
  for (const key2 of Object.keys(theme.colors || {})) {
    if (key2 === "editor.foreground" || key2 === "editor.background" || key2.startsWith("terminal.ansi")) {
      if (!((_e = theme.colors[key2]) == null ? void 0 : _e.startsWith("#"))) {
        const replacement = getReplacementColor(theme.colors[key2]);
        theme.colorReplacements[replacement] = theme.colors[key2];
        theme.colors[key2] = replacement;
      }
    }
  }
  Object.defineProperty(theme, RESOLVED_KEY, {
    enumerable: false,
    writable: false,
    value: true
  });
  return theme;
}
async function resolveLangs(langs) {
  return Array.from(new Set((await Promise.all(
    langs.filter((l) => !isSpecialLang(l)).map(async (lang) => await normalizeGetter(lang).then((r4) => Array.isArray(r4) ? r4 : [r4]))
  )).flat()));
}
async function resolveThemes(themes) {
  const resolved = await Promise.all(
    themes.map(
      async (theme) => isSpecialTheme(theme) ? null : normalizeTheme(await normalizeGetter(theme))
    )
  );
  return resolved.filter((i) => !!i);
}
var ShikiError3 = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ShikiError";
  }
};
var Registry2 = class extends Registry {
  constructor(_resolver, _themes, _langs, _alias = {}) {
    super(_resolver);
    __publicField(this, "_resolvedThemes", /* @__PURE__ */ new Map());
    __publicField(this, "_resolvedGrammars", /* @__PURE__ */ new Map());
    __publicField(this, "_langMap", /* @__PURE__ */ new Map());
    __publicField(this, "_langGraph", /* @__PURE__ */ new Map());
    __publicField(this, "_textmateThemeCache", /* @__PURE__ */ new WeakMap());
    __publicField(this, "_loadedThemesCache", null);
    __publicField(this, "_loadedLanguagesCache", null);
    this._resolver = _resolver;
    this._themes = _themes;
    this._langs = _langs;
    this._alias = _alias;
    this._themes.map((t) => this.loadTheme(t));
    this.loadLanguages(this._langs);
  }
  getTheme(theme) {
    if (typeof theme === "string")
      return this._resolvedThemes.get(theme);
    else
      return this.loadTheme(theme);
  }
  loadTheme(theme) {
    const _theme = normalizeTheme(theme);
    if (_theme.name) {
      this._resolvedThemes.set(_theme.name, _theme);
      this._loadedThemesCache = null;
    }
    return _theme;
  }
  getLoadedThemes() {
    if (!this._loadedThemesCache)
      this._loadedThemesCache = [...this._resolvedThemes.keys()];
    return this._loadedThemesCache;
  }
  // Override and re-implement this method to cache the textmate themes as `TextMateTheme.createFromRawTheme`
  // is expensive. Themes can switch often especially for dual-theme support.
  //
  // The parent class also accepts `colorMap` as the second parameter, but since we don't use that,
  // we omit here so it's easier to cache the themes.
  setTheme(theme) {
    let textmateTheme = this._textmateThemeCache.get(theme);
    if (!textmateTheme) {
      textmateTheme = Theme.createFromRawTheme(theme);
      this._textmateThemeCache.set(theme, textmateTheme);
    }
    this._syncRegistry.setTheme(textmateTheme);
  }
  getGrammar(name) {
    if (this._alias[name]) {
      const resolved = /* @__PURE__ */ new Set([name]);
      while (this._alias[name]) {
        name = this._alias[name];
        if (resolved.has(name))
          throw new ShikiError3(`Circular alias \`${Array.from(resolved).join(" -> ")} -> ${name}\``);
        resolved.add(name);
      }
    }
    return this._resolvedGrammars.get(name);
  }
  loadLanguage(lang) {
    var _a4, _b, _c, _d;
    if (this.getGrammar(lang.name))
      return;
    const embeddedLazilyBy = new Set(
      [...this._langMap.values()].filter((i) => {
        var _a5;
        return (_a5 = i.embeddedLangsLazy) == null ? void 0 : _a5.includes(lang.name);
      })
    );
    this._resolver.addLanguage(lang);
    const grammarConfig = {
      balancedBracketSelectors: lang.balancedBracketSelectors || ["*"],
      unbalancedBracketSelectors: lang.unbalancedBracketSelectors || []
    };
    this._syncRegistry._rawGrammars.set(lang.scopeName, lang);
    const g = this.loadGrammarWithConfiguration(lang.scopeName, 1, grammarConfig);
    g.name = lang.name;
    this._resolvedGrammars.set(lang.name, g);
    if (lang.aliases) {
      lang.aliases.forEach((alias) => {
        this._alias[alias] = lang.name;
      });
    }
    this._loadedLanguagesCache = null;
    if (embeddedLazilyBy.size) {
      for (const e of embeddedLazilyBy) {
        this._resolvedGrammars.delete(e.name);
        this._loadedLanguagesCache = null;
        (_b = (_a4 = this._syncRegistry) == null ? void 0 : _a4._injectionGrammars) == null ? void 0 : _b.delete(e.scopeName);
        (_d = (_c = this._syncRegistry) == null ? void 0 : _c._grammars) == null ? void 0 : _d.delete(e.scopeName);
        this.loadLanguage(this._langMap.get(e.name));
      }
    }
  }
  dispose() {
    super.dispose();
    this._resolvedThemes.clear();
    this._resolvedGrammars.clear();
    this._langMap.clear();
    this._langGraph.clear();
    this._loadedThemesCache = null;
  }
  loadLanguages(langs) {
    for (const lang of langs)
      this.resolveEmbeddedLanguages(lang);
    const langsGraphArray = Array.from(this._langGraph.entries());
    const missingLangs = langsGraphArray.filter(([_, lang]) => !lang);
    if (missingLangs.length) {
      const dependents = langsGraphArray.filter(([_, lang]) => {
        var _a4;
        return lang && ((_a4 = lang.embeddedLangs) == null ? void 0 : _a4.some((l) => missingLangs.map(([name]) => name).includes(l)));
      }).filter((lang) => !missingLangs.includes(lang));
      throw new ShikiError3(`Missing languages ${missingLangs.map(([name]) => `\`${name}\``).join(", ")}, required by ${dependents.map(([name]) => `\`${name}\``).join(", ")}`);
    }
    for (const [_, lang] of langsGraphArray)
      this._resolver.addLanguage(lang);
    for (const [_, lang] of langsGraphArray)
      this.loadLanguage(lang);
  }
  getLoadedLanguages() {
    if (!this._loadedLanguagesCache) {
      this._loadedLanguagesCache = [
        .../* @__PURE__ */ new Set([...this._resolvedGrammars.keys(), ...Object.keys(this._alias)])
      ];
    }
    return this._loadedLanguagesCache;
  }
  resolveEmbeddedLanguages(lang) {
    this._langMap.set(lang.name, lang);
    this._langGraph.set(lang.name, lang);
    if (lang.embeddedLangs) {
      for (const embeddedLang of lang.embeddedLangs)
        this._langGraph.set(embeddedLang, this._langMap.get(embeddedLang));
    }
  }
};
var Resolver = class {
  constructor(engine, langs) {
    __publicField(this, "_langs", /* @__PURE__ */ new Map());
    __publicField(this, "_scopeToLang", /* @__PURE__ */ new Map());
    __publicField(this, "_injections", /* @__PURE__ */ new Map());
    __publicField(this, "_onigLib");
    this._onigLib = {
      createOnigScanner: (patterns) => engine.createScanner(patterns),
      createOnigString: (s) => engine.createString(s)
    };
    langs.forEach((i) => this.addLanguage(i));
  }
  get onigLib() {
    return this._onigLib;
  }
  getLangRegistration(langIdOrAlias) {
    return this._langs.get(langIdOrAlias);
  }
  loadGrammar(scopeName) {
    return this._scopeToLang.get(scopeName);
  }
  addLanguage(l) {
    this._langs.set(l.name, l);
    if (l.aliases) {
      l.aliases.forEach((a) => {
        this._langs.set(a, l);
      });
    }
    this._scopeToLang.set(l.scopeName, l);
    if (l.injectTo) {
      l.injectTo.forEach((i) => {
        if (!this._injections.get(i))
          this._injections.set(i, []);
        this._injections.get(i).push(l.scopeName);
      });
    }
  }
  getInjections(scopeName) {
    const scopeParts = scopeName.split(".");
    let injections = [];
    for (let i = 1; i <= scopeParts.length; i++) {
      const subScopeName = scopeParts.slice(0, i).join(".");
      injections = [...injections, ...this._injections.get(subScopeName) || []];
    }
    return injections;
  }
};
var instancesCount = 0;
function createShikiInternalSync(options) {
  instancesCount += 1;
  if (options.warnings !== false && instancesCount >= 10 && instancesCount % 10 === 0)
    console.warn(`[Shiki] ${instancesCount} instances have been created. Shiki is supposed to be used as a singleton, consider refactoring your code to cache your highlighter instance; Or call \`highlighter.dispose()\` to release unused instances.`);
  let isDisposed = false;
  if (!options.engine)
    throw new ShikiError3("`engine` option is required for synchronous mode");
  const langs = (options.langs || []).flat(1);
  const themes = (options.themes || []).flat(1).map(normalizeTheme);
  const resolver = new Resolver(options.engine, langs);
  const _registry = new Registry2(resolver, themes, langs, options.langAlias);
  let _lastTheme;
  function getLanguage(name) {
    ensureNotDisposed();
    const _lang = _registry.getGrammar(typeof name === "string" ? name : name.name);
    if (!_lang)
      throw new ShikiError3(`Language \`${name}\` not found, you may need to load it first`);
    return _lang;
  }
  function getTheme(name) {
    if (name === "none")
      return { bg: "", fg: "", name: "none", settings: [], type: "dark" };
    ensureNotDisposed();
    const _theme = _registry.getTheme(name);
    if (!_theme)
      throw new ShikiError3(`Theme \`${name}\` not found, you may need to load it first`);
    return _theme;
  }
  function setTheme(name) {
    ensureNotDisposed();
    const theme = getTheme(name);
    if (_lastTheme !== name) {
      _registry.setTheme(theme);
      _lastTheme = name;
    }
    const colorMap = _registry.getColorMap();
    return {
      theme,
      colorMap
    };
  }
  function getLoadedThemes() {
    ensureNotDisposed();
    return _registry.getLoadedThemes();
  }
  function getLoadedLanguages() {
    ensureNotDisposed();
    return _registry.getLoadedLanguages();
  }
  function loadLanguageSync(...langs2) {
    ensureNotDisposed();
    _registry.loadLanguages(langs2.flat(1));
  }
  async function loadLanguage(...langs2) {
    return loadLanguageSync(await resolveLangs(langs2));
  }
  function loadThemeSync(...themes2) {
    ensureNotDisposed();
    for (const theme of themes2.flat(1)) {
      _registry.loadTheme(theme);
    }
  }
  async function loadTheme(...themes2) {
    ensureNotDisposed();
    return loadThemeSync(await resolveThemes(themes2));
  }
  function ensureNotDisposed() {
    if (isDisposed)
      throw new ShikiError3("Shiki instance has been disposed");
  }
  function dispose() {
    if (isDisposed)
      return;
    isDisposed = true;
    _registry.dispose();
    instancesCount -= 1;
  }
  return {
    setTheme,
    getTheme,
    getLanguage,
    getLoadedThemes,
    getLoadedLanguages,
    loadLanguage,
    loadLanguageSync,
    loadTheme,
    loadThemeSync,
    dispose,
    [Symbol.dispose]: dispose
  };
}
async function createShikiInternal(options) {
  if (options.loadWasm) {
    warnDeprecated("`loadWasm` option is deprecated. Use `engine: createOnigurumaEngine(loadWasm)` instead.");
  }
  if (!options.engine) {
    warnDeprecated("`engine` option is required. Use `createOnigurumaEngine` or `createJavaScriptRegexEngine` to create an engine.");
  }
  const [
    themes,
    langs,
    engine
  ] = await Promise.all([
    resolveThemes(options.themes || []),
    resolveLangs(options.langs || []),
    options.engine || createOnigurumaEngine(options.loadWasm || getDefaultWasmLoader())
  ]);
  return createShikiInternalSync({
    ...options,
    themes,
    langs,
    engine
  });
}
function getShikiInternal(options) {
  warnDeprecated("`getShikiInternal` is deprecated. Use `createShikiInternal` instead.");
  return createShikiInternal(options);
}
async function createHighlighterCore(options) {
  const internal = await createShikiInternal(options);
  return {
    getLastGrammarState: (...args) => getLastGrammarState(internal, ...args),
    codeToTokensBase: (code, options2) => codeToTokensBase(internal, code, options2),
    codeToTokensWithThemes: (code, options2) => codeToTokensWithThemes(internal, code, options2),
    codeToTokens: (code, options2) => codeToTokens(internal, code, options2),
    codeToHast: (code, options2) => codeToHast(internal, code, options2),
    codeToHtml: (code, options2) => codeToHtml(internal, code, options2),
    getBundledLanguages: () => ({}),
    getBundledThemes: () => ({}),
    ...internal,
    getInternalContext: () => internal
  };
}
function createHighlighterCoreSync(options) {
  const internal = createShikiInternalSync(options);
  return {
    getLastGrammarState: (...args) => getLastGrammarState(internal, ...args),
    codeToTokensBase: (code, options2) => codeToTokensBase(internal, code, options2),
    codeToTokensWithThemes: (code, options2) => codeToTokensWithThemes(internal, code, options2),
    codeToTokens: (code, options2) => codeToTokens(internal, code, options2),
    codeToHast: (code, options2) => codeToHast(internal, code, options2),
    codeToHtml: (code, options2) => codeToHtml(internal, code, options2),
    getBundledLanguages: () => ({}),
    getBundledThemes: () => ({}),
    ...internal,
    getInternalContext: () => internal
  };
}
function makeSingletonHighlighterCore(createHighlighter) {
  let _shiki;
  async function getSingletonHighlighterCore2(options) {
    if (!_shiki) {
      _shiki = createHighlighter({
        ...options,
        themes: options.themes || [],
        langs: options.langs || []
      });
      return _shiki;
    } else {
      const s = await _shiki;
      await Promise.all([
        s.loadTheme(...options.themes || []),
        s.loadLanguage(...options.langs || [])
      ]);
      return s;
    }
  }
  return getSingletonHighlighterCore2;
}
var getSingletonHighlighterCore = makeSingletonHighlighterCore(createHighlighterCore);
function getHighlighterCore(options) {
  warnDeprecated("`getHighlighterCore` is deprecated. Use `createHighlighterCore` or `getSingletonHighlighterCore` instead.");
  return createHighlighterCore(options);
}
function createdBundledHighlighter(arg1, arg2, arg3) {
  let bundledLanguages;
  let bundledThemes;
  let engine;
  if (arg2) {
    warnDeprecated("`createdBundledHighlighter` signature with `bundledLanguages` and `bundledThemes` is deprecated. Use the options object signature instead.");
    bundledLanguages = arg1;
    bundledThemes = arg2;
    engine = () => createOnigurumaEngine2(arg3);
  } else {
    const options = arg1;
    bundledLanguages = options.langs;
    bundledThemes = options.themes;
    engine = options.engine;
  }
  async function createHighlighter(options) {
    function resolveLang(lang) {
      if (typeof lang === "string") {
        if (isSpecialLang(lang))
          return [];
        const bundle = bundledLanguages[lang];
        if (!bundle)
          throw new ShikiError(`Language \`${lang}\` is not included in this bundle. You may want to load it from external source.`);
        return bundle;
      }
      return lang;
    }
    function resolveTheme(theme) {
      if (isSpecialTheme(theme))
        return "none";
      if (typeof theme === "string") {
        const bundle = bundledThemes[theme];
        if (!bundle)
          throw new ShikiError(`Theme \`${theme}\` is not included in this bundle. You may want to load it from external source.`);
        return bundle;
      }
      return theme;
    }
    const _themes = (options.themes ?? []).map((i) => resolveTheme(i));
    const langs = (options.langs ?? []).map((i) => resolveLang(i));
    const core2 = await createHighlighterCore({
      engine: options.engine ?? engine(),
      ...options,
      themes: _themes,
      langs
    });
    return {
      ...core2,
      loadLanguage(...langs2) {
        return core2.loadLanguage(...langs2.map(resolveLang));
      },
      loadTheme(...themes) {
        return core2.loadTheme(...themes.map(resolveTheme));
      },
      getBundledLanguages() {
        return bundledLanguages;
      },
      getBundledThemes() {
        return bundledThemes;
      }
    };
  }
  return createHighlighter;
}
function makeSingletonHighlighter(createHighlighter) {
  let _shiki;
  async function getSingletonHighlighter(options = {}) {
    if (!_shiki) {
      _shiki = createHighlighter({
        ...options,
        themes: options.themes || [],
        langs: options.langs || []
      });
      return _shiki;
    } else {
      const s = await _shiki;
      await Promise.all([
        s.loadTheme(...options.themes || []),
        s.loadLanguage(...options.langs || [])
      ]);
      return s;
    }
  }
  return getSingletonHighlighter;
}
function createSingletonShorthands(createHighlighter, config) {
  const getSingletonHighlighter = makeSingletonHighlighter(createHighlighter);
  async function get(code, options) {
    var _a4;
    const shiki = await getSingletonHighlighter({
      langs: [options.lang],
      themes: "theme" in options ? [options.theme] : Object.values(options.themes)
    });
    const langs = await ((_a4 = config == null ? void 0 : config.guessEmbeddedLanguages) == null ? void 0 : _a4.call(config, code, options.lang, shiki));
    if (langs) {
      await shiki.loadLanguage(...langs);
    }
    return shiki;
  }
  return {
    getSingletonHighlighter(options) {
      return getSingletonHighlighter(options);
    },
    async codeToHtml(code, options) {
      const shiki = await get(code, options);
      return shiki.codeToHtml(code, options);
    },
    async codeToHast(code, options) {
      const shiki = await get(code, options);
      return shiki.codeToHast(code, options);
    },
    async codeToTokens(code, options) {
      const shiki = await get(code, options);
      return shiki.codeToTokens(code, options);
    },
    async codeToTokensBase(code, options) {
      const shiki = await get(code, options);
      return shiki.codeToTokensBase(code, options);
    },
    async codeToTokensWithThemes(code, options) {
      const shiki = await get(code, options);
      return shiki.codeToTokensWithThemes(code, options);
    },
    async getLastGrammarState(code, options) {
      const shiki = await getSingletonHighlighter({
        langs: [options.lang],
        themes: [options.theme]
      });
      return shiki.getLastGrammarState(code, options);
    }
  };
}
function createJavaScriptRegexEngine2(options) {
  warnDeprecated("import `createJavaScriptRegexEngine` from `@shikijs/engine-javascript` or `shiki/engine/javascript` instead");
  return createJavaScriptRegexEngine(options);
}
function defaultJavaScriptRegexConstructor2(pattern) {
  warnDeprecated("import `defaultJavaScriptRegexConstructor` from `@shikijs/engine-javascript` or `shiki/engine/javascript` instead");
  return defaultJavaScriptRegexConstructor(pattern);
}
function createCssVariablesTheme(options = {}) {
  var _a4;
  const {
    name = "css-variables",
    variablePrefix = "--shiki-",
    fontStyle = true
  } = options;
  const variable = (name2) => {
    var _a5;
    if ((_a5 = options.variableDefaults) == null ? void 0 : _a5[name2])
      return `var(${variablePrefix}${name2}, ${options.variableDefaults[name2]})`;
    return `var(${variablePrefix}${name2})`;
  };
  const theme = {
    name,
    type: "dark",
    colors: {
      "editor.foreground": variable("foreground"),
      "editor.background": variable("background"),
      "terminal.ansiBlack": variable("ansi-black"),
      "terminal.ansiRed": variable("ansi-red"),
      "terminal.ansiGreen": variable("ansi-green"),
      "terminal.ansiYellow": variable("ansi-yellow"),
      "terminal.ansiBlue": variable("ansi-blue"),
      "terminal.ansiMagenta": variable("ansi-magenta"),
      "terminal.ansiCyan": variable("ansi-cyan"),
      "terminal.ansiWhite": variable("ansi-white"),
      "terminal.ansiBrightBlack": variable("ansi-bright-black"),
      "terminal.ansiBrightRed": variable("ansi-bright-red"),
      "terminal.ansiBrightGreen": variable("ansi-bright-green"),
      "terminal.ansiBrightYellow": variable("ansi-bright-yellow"),
      "terminal.ansiBrightBlue": variable("ansi-bright-blue"),
      "terminal.ansiBrightMagenta": variable("ansi-bright-magenta"),
      "terminal.ansiBrightCyan": variable("ansi-bright-cyan"),
      "terminal.ansiBrightWhite": variable("ansi-bright-white")
    },
    tokenColors: [
      {
        scope: [
          "keyword.operator.accessor",
          "meta.group.braces.round.function.arguments",
          "meta.template.expression",
          "markup.fenced_code meta.embedded.block"
        ],
        settings: {
          foreground: variable("foreground")
        }
      },
      {
        scope: "emphasis",
        settings: {
          fontStyle: "italic"
        }
      },
      {
        scope: ["strong", "markup.heading.markdown", "markup.bold.markdown"],
        settings: {
          fontStyle: "bold"
        }
      },
      {
        scope: ["markup.italic.markdown"],
        settings: {
          fontStyle: "italic"
        }
      },
      {
        scope: "meta.link.inline.markdown",
        settings: {
          fontStyle: "underline",
          foreground: variable("token-link")
        }
      },
      {
        scope: ["string", "markup.fenced_code", "markup.inline"],
        settings: {
          foreground: variable("token-string")
        }
      },
      {
        scope: ["comment", "string.quoted.docstring.multi"],
        settings: {
          foreground: variable("token-comment")
        }
      },
      {
        scope: [
          "constant.numeric",
          "constant.language",
          "constant.other.placeholder",
          "constant.character.format.placeholder",
          "variable.language.this",
          "variable.other.object",
          "variable.other.class",
          "variable.other.constant",
          "meta.property-name",
          "meta.property-value",
          "support"
        ],
        settings: {
          foreground: variable("token-constant")
        }
      },
      {
        scope: [
          "keyword",
          "storage.modifier",
          "storage.type",
          "storage.control.clojure",
          "entity.name.function.clojure",
          "entity.name.tag.yaml",
          "support.function.node",
          "support.type.property-name.json",
          "punctuation.separator.key-value",
          "punctuation.definition.template-expression"
        ],
        settings: {
          foreground: variable("token-keyword")
        }
      },
      {
        scope: "variable.parameter.function",
        settings: {
          foreground: variable("token-parameter")
        }
      },
      {
        scope: [
          "support.function",
          "entity.name.type",
          "entity.other.inherited-class",
          "meta.function-call",
          "meta.instance.constructor",
          "entity.other.attribute-name",
          "entity.name.function",
          "constant.keyword.clojure"
        ],
        settings: {
          foreground: variable("token-function")
        }
      },
      {
        scope: [
          "entity.name.tag",
          "string.quoted",
          "string.regexp",
          "string.interpolated",
          "string.template",
          "string.unquoted.plain.out.yaml",
          "keyword.other.template"
        ],
        settings: {
          foreground: variable("token-string-expression")
        }
      },
      {
        scope: [
          "punctuation.definition.arguments",
          "punctuation.definition.dict",
          "punctuation.separator",
          "meta.function-call.arguments"
        ],
        settings: {
          foreground: variable("token-punctuation")
        }
      },
      {
        // [Custom] Markdown links
        scope: [
          "markup.underline.link",
          "punctuation.definition.metadata.markdown"
        ],
        settings: {
          foreground: variable("token-link")
        }
      },
      {
        // [Custom] Markdown list
        scope: ["beginning.punctuation.definition.list.markdown"],
        settings: {
          foreground: variable("token-string")
        }
      },
      {
        // [Custom] Markdown punctuation definition brackets
        scope: [
          "punctuation.definition.string.begin.markdown",
          "punctuation.definition.string.end.markdown",
          "string.other.link.title.markdown",
          "string.other.link.description.markdown"
        ],
        settings: {
          foreground: variable("token-keyword")
        }
      },
      {
        // [Custom] Diff
        scope: [
          "markup.inserted",
          "meta.diff.header.to-file",
          "punctuation.definition.inserted"
        ],
        settings: {
          foreground: variable("token-inserted")
        }
      },
      {
        scope: [
          "markup.deleted",
          "meta.diff.header.from-file",
          "punctuation.definition.deleted"
        ],
        settings: {
          foreground: variable("token-deleted")
        }
      },
      {
        scope: [
          "markup.changed",
          "punctuation.definition.changed"
        ],
        settings: {
          foreground: variable("token-changed")
        }
      }
    ]
  };
  if (!fontStyle) {
    theme.tokenColors = (_a4 = theme.tokenColors) == null ? void 0 : _a4.map((tokenColor) => {
      var _a5;
      if ((_a5 = tokenColor.settings) == null ? void 0 : _a5.fontStyle)
        delete tokenColor.settings.fontStyle;
      return tokenColor;
    });
  }
  return theme;
}

export {
  ShikiError,
  createOnigurumaEngine,
  enableDeprecationWarnings,
  warnDeprecated,
  FontStyle,
  EncodedTokenMetadata,
  toHtml,
  createOnigurumaEngine2,
  createWasmOnigEngine,
  loadWasm2 as loadWasm,
  resolveColorReplacements,
  applyColorReplacements,
  toArray,
  normalizeGetter,
  isPlainLang,
  isSpecialLang,
  isNoneTheme,
  isSpecialTheme,
  addClassToHast,
  splitLines,
  createPositionConverter,
  guessEmbeddedLanguages,
  splitToken,
  splitTokens,
  flatTokenVariants,
  getTokenStyleObject,
  stringifyTokenStyle,
  transformerDecorations,
  tokenizeAnsiWithTheme,
  codeToTokensBase,
  tokenizeWithTheme,
  codeToTokensWithThemes,
  codeToTokens,
  codeToHast,
  tokensToHast,
  codeToHtml,
  normalizeTheme,
  createShikiInternalSync,
  createShikiInternal,
  getShikiInternal,
  createHighlighterCore,
  createHighlighterCoreSync,
  makeSingletonHighlighterCore,
  getSingletonHighlighterCore,
  getHighlighterCore,
  createdBundledHighlighter,
  makeSingletonHighlighter,
  createSingletonShorthands,
  createJavaScriptRegexEngine2 as createJavaScriptRegexEngine,
  defaultJavaScriptRegexConstructor2 as defaultJavaScriptRegexConstructor,
  createCssVariablesTheme
};
//# sourceMappingURL=chunk-5Y2WVNAC.js.map
