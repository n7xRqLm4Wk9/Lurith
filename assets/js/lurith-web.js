/* Lurith Web Edition — in-browser Lua 5.1 / Roblox Luau obfuscation engine.
 * Self-contained, no dependencies. Runs entirely client-side.
 * This is a lightweight companion to the full Lurith engine (Discord bot / CLI).
 */
(function (global) {
  "use strict";

  var VERSION = "5.0.0";
  var WATERMARK = "-- [obfuscated by Lurith v" + VERSION + " | https://discord.gg/XSYDVYbqNz ]";

  /* Keywords that are reserved in both Lua 5.1 and Luau.
   * `continue`, `type` and `export` are handled contextually (they are Luau
   * keywords but `type(x)` is also a common plain-Lua function call). */
  var KEYWORDS = new Set([
    "and", "break", "do", "else", "elseif", "end", "false", "for", "function",
    "goto", "if", "in", "local", "nil", "not", "or", "repeat", "return",
    "then", "true", "until", "while"
  ]);

  /* Tokens that can begin/end a statement or block (used for activation + boundaries). */
  var ACT_SET = new Set([
    "local", "if", "while", "for", "do", "repeat", "return", "break", "goto",
    "end", "until", "else", "elseif", "then"
  ]);

  var MULTI3 = ["...", "//=", "..="];
  var MULTI2 = ["==", "~=", "<=", ">=", "+=", "-=", "*=", "/=", "%=", "^=", "//", "..", "::", "->"];

  function isIdStart(c) {
    return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_" || c.charCodeAt(0) >= 128;
  }
  function isIdChar(c) { return isIdStart(c) || (c >= "0" && c <= "9"); }
  function isDigit(c) { return c >= "0" && c <= "9"; }
  function isHex(c) {
    return (c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
  }
  function isWs(c) {
    return c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v" || c === "\u00a0";
  }

  /* ------------------------------------------------------------------ *
   * Tokenizer
   * ------------------------------------------------------------------ */
  function tokenize(src) {
    var tokens = [];
    var i = 0, n = src.length;
    function push(type, value) { tokens.push({ type: type, value: value }); }

    while (i < n) {
      var c = src[i];

      if (isWs(c)) {
        var wsStart = i;
        while (i < n && isWs(src[i])) i++;
        push("ws", src.slice(wsStart, i));
        continue;
      }

      // Shebang, only at the very first character
      if (c === "#" && i === 0) {
        var sh = i;
        while (i < n && src[i] !== "\n") i++;
        push("shebang", src.slice(sh, i));
        continue;
      }

      // Comments
      if (c === "-" && src[i + 1] === "-") {
        var j = i + 2, eq = 0;
        while (src[j] === "=") { eq++; j++; }
        if (src[j] === "[") {
          var close = "]" + repeatChar("=", eq) + "]";
          var end = src.indexOf(close, j + 1);
          if (end === -1) end = n; else end += close.length;
          push("comment", src.slice(i, end));
          i = end;
          continue;
        }
        var lc = i;
        while (i < n && src[i] !== "\n") i++;
        push("comment", src.slice(lc, i));
        continue;
      }

      // Short strings
      if (c === '"' || c === "'") {
        i = readShortString(src, i, c, tokens);
        continue;
      }

      // Luau interpolated (backtick) strings — tokenized but never transformed
      if (c === "`") {
        i = readBacktickString(src, i, tokens);
        continue;
      }

      // Long strings [[...]] / [=[...]=]
      if (c === "[") {
        var j2 = i + 1, eq2 = 0;
        while (src[j2] === "=") { eq2++; j2++; }
        if (src[j2] === "[") {
          var close2 = "]" + repeatChar("=", eq2) + "]";
          var end2 = src.indexOf(close2, j2 + 1);
          if (end2 === -1) end2 = n; else end2 += close2.length;
          push("string", src.slice(i, end2));
          i = end2;
          continue;
        }
        push("symbol", "[");
        i++;
        continue;
      }

      // Numbers
      if (isDigit(c) || (c === "." && isDigit(src[i + 1] || ""))) {
        var ns = i;
        if (c === "0" && (src[i + 1] === "x" || src[i + 1] === "X" || src[i + 1] === "b" || src[i + 1] === "B")) {
          i += 2;
          while (i < n && isHex(src[i])) i++;
          push("number", src.slice(ns, i));
          continue;
        }
        while (i < n && (isDigit(src[i]) || src[i] === ".")) {
          if (src[i] === "." && src[i + 1] === ".") break;
          i++;
        }
        if (src[i] === "e" || src[i] === "E") {
          var k = i + 1;
          if (src[k] === "+" || src[k] === "-") k++;
          if (isDigit(src[k] || "")) {
            i = k;
            while (i < n && isDigit(src[i])) i++;
          }
        }
        push("number", src.slice(ns, i));
        continue;
      }

      // Identifiers
      if (isIdStart(c)) {
        var id = i;
        while (i < n && isIdChar(src[i])) i++;
        var word = src.slice(id, i);
        push(KEYWORDS.has(word) ? "keyword" : "ident", word);
        continue;
      }

      // Multi-character symbols
      var hit = false;
      for (var m3 = 0; m3 < MULTI3.length; m3++) {
        if (src.startsWith(MULTI3[m3], i)) { push("symbol", MULTI3[m3]); i += 3; hit = true; break; }
      }
      if (hit) continue;
      for (var m2 = 0; m2 < MULTI2.length; m2++) {
        if (src.startsWith(MULTI2[m2], i)) { push("symbol", MULTI2[m2]); i += 2; hit = true; break; }
      }
      if (hit) continue;

      push("symbol", c);
      i++;
    }
    return tokens;
  }

  function repeatChar(ch, count) {
    var s = "";
    for (var i = 0; i < count; i++) s += ch;
    return s;
  }

  function readShortString(src, i, quote, tokens) {
    var start = i;
    i++;
    while (i < src.length) {
      var c = src[i];
      if (c === "\\") { i += 2; continue; }
      if (c === quote) { i++; break; }
      if (c === "\n") break;
      i++;
    }
    tokens.push({ type: "string", value: src.slice(start, i) });
    return i;
  }

  function readBacktickString(src, i, tokens) {
    var start = i;
    i++;
    var depth = 0;
    while (i < src.length) {
      var c = src[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "{") { depth++; i++; continue; }
      if (c === "}") { if (depth > 0) depth--; i++; continue; }
      if (c === "`") {
        if (depth === 0) { i++; break; }
        i++; continue;
      }
      if (c === '"' || c === "'") { i = readShortString(src, i, c, []); continue; }
      if (c === "[") {
        var j = i + 1, eq = 0;
        while (src[j] === "=") { eq++; j++; }
        if (src[j] === "[") {
          var close = "]" + repeatChar("=", eq) + "]";
          var e = src.indexOf(close, j + 1);
          i = e === -1 ? src.length : e + close.length;
          continue;
        }
        i++; continue;
      }
      i++;
    }
    tokens.push({ type: "string", value: src.slice(start, i) });
    return i;
  }

  /* ------------------------------------------------------------------ *
   * String decoding (escape sequences -> UTF-8 bytes)
   * ------------------------------------------------------------------ */
  function utf8bytes(str) {
    var bytes = [];
    for (var k = 0; k < str.length; k++) {
      var cp = str.codePointAt(k);
      if (cp > 0xffff) k++;
      if (cp < 0x80) bytes.push(cp);
      else if (cp < 0x800) { bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63)); }
      else if (cp < 0x10000) { bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)); }
      else { bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)); }
    }
    return bytes;
  }

  function decodeShortString(raw) {
    var q = raw[0];
    var terminated = raw.length > 1 && raw[raw.length - 1] === q;
    var body = terminated ? raw.slice(1, -1) : raw.slice(1);
    var out = [];
    var i = 0;
    while (i < body.length) {
      var c = body[i];
      if (c !== "\\") { out.push(c); i++; continue; }
      i++;
      if (i >= body.length) break;
      var e = body[i];
      if (e === "a") { out.push("\x07"); i++; }
      else if (e === "b") { out.push("\b"); i++; }
      else if (e === "f") { out.push("\f"); i++; }
      else if (e === "n") { out.push("\n"); i++; }
      else if (e === "r") { out.push("\r"); i++; }
      else if (e === "t") { out.push("\t"); i++; }
      else if (e === "v") { out.push("\v"); i++; }
      else if (e === "z") { i++; while (i < body.length && /\s/.test(body[i])) i++; }
      else if (e === "x") {
        var h = body.slice(i + 1, i + 3);
        var code = parseInt(h, 16);
        if (!isNaN(code) && h.length === 2) { out.push(String.fromCharCode(code)); i += 3; }
        else { out.push("x"); i++; }
      }
      else if (e === "u") {
        if (body[i + 1] === "{") {
          var close = body.indexOf("}", i + 2);
          var hex = body.slice(i + 2, close === -1 ? body.length : close);
          var cp = parseInt(hex, 16);
          if (!isNaN(cp) && hex.length > 0) { out.push(String.fromCodePoint(cp)); i = close === -1 ? body.length : close + 1; }
          else { out.push("u"); i++; }
        } else { out.push("u"); i++; }
      }
      else if (isDigit(e)) {
        var d = "";
        while (d.length < 3 && i < body.length && isDigit(body[i])) { d += body[i]; i++; }
        var code2 = parseInt(d, 10);
        if (!isNaN(code2)) out.push(String.fromCharCode(code2 > 255 ? 255 : code2));
      }
      else if (e === "\n") { out.push("\n"); i++; }
      else { out.push(e); i++; }
    }
    return utf8bytes(out.join(""));
  }

  /* Identifiers referenced inside a Luau interpolated string (`Hello {name}!`).
   * These must never be renamed, otherwise the interpolation breaks. */
  function backtickRefs(raw) {
    var refs = new Set();
    var i = 1, n = raw.length;
    while (i < n) {
      var c = raw[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "{") {
        var depth = 1;
        var j = i + 1;
        var seg = "";
        while (j < n && depth > 0) {
          var ch = raw[j];
          if (ch === "\\") { seg += raw.slice(j, j + 2); j += 2; continue; }
          if (ch === "{") depth++;
          else if (ch === "}") { depth--; if (depth === 0) break; }
          seg += ch;
          j++;
        }
        var re = /[A-Za-z_][A-Za-z0-9_]*/g;
        var m;
        while ((m = re.exec(seg)) !== null) {
          if (!KEYWORDS.has(m[0])) refs.add(m[0]);
        }
        i = j + 1;
        continue;
      }
      i++;
    }
    return refs;
  }

  function decodeLongString(raw) {
    var i = 1, eq = 0;
    while (raw[i] === "=") { eq++; i++; }
    var body = raw.slice(i + 1, raw.length - 1 - eq - 1);
    if (body[0] === "\n") body = body.slice(1);
    else if (body[0] === "\r" && body[1] === "\n") body = body.slice(2);
    return utf8bytes(body);
  }

  function stringCharExpr(bytes, chunkSize) {
    if (bytes.length === 0) return "string.char()";
    var parts = [];
    for (var s = 0; s < bytes.length; s += chunkSize) {
      parts.push("string.char(" + bytes.slice(s, s + chunkSize).join(",") + ")");
    }
    return parts.join("..");
  }

  /* ------------------------------------------------------------------ *
   * Deterministic PRNG (seeded from source) so identical input is stable
   * ------------------------------------------------------------------ */
  function hashString(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function maskInteger(n, rng) {
    if (n === 0) return "(1-1)";
    if (n === 1) return "(2-1)";
    if (n === -1) return "(0-1)";
    var pos = Math.abs(n);
    var k = 1 + Math.floor(rng() * Math.min(9, pos - 1));
    if (n > 0) return "(" + (n - k) + "+" + k + ")";
    return "(" + (n + k) + "-" + k + ")";
  }

  /* ------------------------------------------------------------------ *
   * Core obfuscation
   * ------------------------------------------------------------------ */
  function needSpace(a, b) {
    if (!a) return false;
    if (/[A-Za-z0-9_]/.test(a) && /[A-Za-z0-9_]/.test(b)) return true;
    if (a === "-" && b === "-") return true;
    if (a === "[" && b === "[") return true;
    if (a === "]" && b === "]") return true;
    if (a === "." && /[0-9]/.test(b)) return true;
    if (/[0-9]/.test(a) && b === ".") return true;
    return false;
  }

  var PRESETS = {
    "normal":    { strings: true, minStringLen: 4, numbers: true, numberChance: 0.30, rename: true, decoys: 0 },
    "high":      { strings: true, minStringLen: 1, numbers: true, numberChance: 0.60, rename: true, decoys: 2 },
    "very-high": { strings: true, minStringLen: 0, numbers: true, numberChance: 0.90, rename: true, decoys: 4 }
  };

  function obfuscate(source, options) {
    options = options || {};
    var level = options.level || "normal";
    var base = PRESETS[level] || PRESETS.normal;
    var opts = {
      strings: options.strings !== undefined ? !!options.strings : base.strings,
      minStringLen: options.minStringLen !== undefined ? options.minStringLen : base.minStringLen,
      numbers: options.numbers !== undefined ? !!options.numbers : base.numbers,
      numberChance: options.numberChance !== undefined ? options.numberChance : base.numberChance,
      rename: options.rename !== undefined ? !!options.rename : base.rename,
      decoys: options.decoys !== undefined ? options.decoys : base.decoys,
      watermark: options.watermark !== undefined ? !!options.watermark : true,
      chunkSize: options.chunkSize !== undefined ? options.chunkSize : 16
    };

    var tokens = tokenize(source);

    /* ---- Pass 0: collect all identifier names + detect global `string` reassignment ---- */
    var allNames = new Set();
    var stringGlobalReassigned = false;
    for (var t = 0; t < tokens.length; t++) {
      var tk = tokens[t];
      if (tk.type === "ident") allNames.add(tk.value);
      if (tk.type === "ident" && tk.value === "string") {
        var nx = nextSignificant(tokens, t);
        var pv = prevSignificant(tokens, t);
        if (nx && nx.type === "symbol" && nx.value === "=" &&
            !(pv && pv.type === "symbol" && (pv.value === "." || pv.value === ":"))) {
          stringGlobalReassigned = true;
        }
      }
      if (tk.type === "keyword" && tk.value === "function") {
        var n1 = nextSignificant(tokens, t);
        if (n1 && n1.type === "ident" && n1.value === "string") {
          var n2 = nextSignificant(tokens, indexOfToken(tokens, n1));
          if (n2 && n2.type === "symbol" && n2.value === "(") stringGlobalReassigned = true;
        }
      }
    }

    /* ---- Identifiers referenced inside backtick interpolations: never rename ---- */
    var interpRefs = new Set();
    for (var t2 = 0; t2 < tokens.length; t2++) {
      if (tokens[t2].type === "string" && tokens[t2].value[0] === "`") {
        var brefs = backtickRefs(tokens[t2].value);
        brefs.forEach(function (r) { interpRefs.add(r); });
      }
    }

    /* ---- Reserved set for generated names ---- */
    var reserved = new Set(allNames);
    interpRefs.forEach(function (r) { reserved.add(r); });
    KEYWORDS.forEach(function (k) { reserved.add(k); });
    reserved.add("self");
    reserved.add("_G");
    reserved.add("_ENV");
    var nameAlpha = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    var nameCounter = 0;
    function genName() {
      while (true) {
        var n = nameCounter++;
        var s = "_" + (n === 0 ? "a" : base52(n));
        if (!reserved.has(s)) { reserved.add(s); return s; }
      }
    }
    function renameFor(name) {
      if (!opts.rename || interpRefs.has(name)) return name;
      return genName();
    }
    function base52(n) {
      var out = "";
      do { out = nameAlpha[n % 62] + out; n = Math.floor(n / 62); } while (n > 0);
      return out;
    }

    var rng = mulberry32(hashString(source));

    /* ---- Emitter state ---- */
    var out = [];
    var lastCh = "";
    function emitText(s) {
      if (s === "") return;
      if (needSpace(lastCh, s[0])) out.push(" ");
      out.push(s);
      lastCh = s[s.length - 1];
    }
    function emitNewline() {
      if (lastCh === "\n") return;
      out.push("\n");
      lastCh = "\n";
    }

    /* ---- Scope state ---- */
    var scopeStack = [new Map()];
    var pendingStack = [[]];
    var blockStack = ["chunk"];
    var afterUntil = false;
    var d = 0;                 // delimiter depth: () [] {}
    var tableStack = [];       // combined depth just inside each open table constructor
    var tableFieldStart = false; // true when the next token could be a table key
    var forPendingStack = [];  // { vars, depth } for loop variables
    var prevSig = null;        // previous significant (non-ws/comment) token
    var atStatementStart = true;

    function pushScope(kind) {
      var parentPending = pendingStack[pendingStack.length - 1];
      var m = new Map();
      for (var p = 0; p < parentPending.length; p++) m.set(parentPending[p].name, parentPending[p].newName);
      scopeStack.push(m);
      pendingStack.push([]);
      blockStack.push(kind);
    }
    function popScope() {
      scopeStack.pop();
      pendingStack.pop();
      blockStack.pop();
    }
    function activatePending() {
      var top = pendingStack.length - 1;
      var list = pendingStack[top];
      var map = scopeStack[top];
      for (var k = 0; k < list.length; k++) map.set(list[k].name, list[k].newName);
      pendingStack[top] = [];
    }
    function lookupName(name) {
      for (var s = scopeStack.length - 1; s >= 0; s--) {
        if (scopeStack[s].has(name)) return scopeStack[s].get(name);
      }
      return null;
    }
    function shadowedInScope(name) {
      for (var s = scopeStack.length - 1; s >= 0; s--) {
        if (scopeStack[s].has(name)) return true;
      }
      return false;
    }

    /* ---- Token helpers ---- */
    function skipWsComments(i) {
      while (i < tokens.length) {
        var t = tokens[i];
        if (t.type === "ws" || t.type === "comment" || t.type === "shebang") i++;
        else break;
      }
      return i;
    }
    function nextSignificant(arr, idx) {
      var i = idx + 1;
      while (i < arr.length) {
        if (arr[i].type !== "ws" && arr[i].type !== "comment" && arr[i].type !== "shebang") return arr[i];
        i++;
      }
      return null;
    }
    function prevSignificant(arr, idx) {
      var i = idx - 1;
      while (i >= 0) {
        if (arr[i].type !== "ws" && arr[i].type !== "comment" && arr[i].type !== "shebang") return arr[i];
        i--;
      }
      return null;
    }
    function indexOfToken(arr, tok) {
      for (var i = 0; i < arr.length; i++) if (arr[i] === tok) return i;
      return -1;
    }

    /* Skip (drop) a `: type` annotation. Stops at , = ) or a statement boundary. */
    function skipType(j) {
      j++; // skip ':'
      var tDepth = 0;
      while (j < tokens.length) {
        var t = tokens[j];
        if (t.type === "ws") {
          if (/\n/.test(t.value) && tDepth === 0) return j;
          j++; continue;
        }
        if (t.type === "comment" || t.type === "shebang") { j++; continue; }
        if (t.type === "symbol") {
          var v = t.value;
          if (tDepth === 0 && (v === "," || v === "=" || v === ")")) return j;
          if (v === "(" || v === "[" || v === "{" || v === "<") tDepth++;
          else if (v === ")" || v === "]" || v === "}" || v === ">") tDepth--;
          j++; continue;
        }
        if (t.type === "keyword" && tDepth === 0 && ACT_SET.has(t.value)) return j;
        j++;
      }
      return j;
    }

    /* Emit an angle-bracketed attribute/generic verbatim: <const>, <T>, <T, U> */
    function emitAngleRaw(j) {
      var start = j;
      var depth = 0;
      while (j < tokens.length) {
        var t = tokens[j];
        if (t.type === "symbol" && t.value === "<") { depth++; emitText("<"); }
        else if (t.type === "symbol" && t.value === ">") { depth--; emitText(">"); if (depth === 0) { j++; break; } }
        else emitText(t.value);
        j++;
      }
      return j;
    }

    /* ---- Emitters for a single ordinary token ---- */
    function nextSigEq(i) {
      var nx = nextSignificant(tokens, i);
      return nx && nx.type === "symbol" && nx.value === "=";
    }

    function emitIdent(tok, i) {
      var v = tok.value;
      // Type alias / export statement: copy verbatim to the next boundary.
      if (atStatementStart && (v === "type" || v === "export")) {
        emitText(v);
        prevSig = tok;
        atStatementStart = false;
        return rawCopyStatement(i + 1);
      }
      // Field access (`obj.field`, `obj:method`) — never rename the field name.
      var isField = prevSig && prevSig.type === "symbol" &&
        (prevSig.value === "." || prevSig.value === ":");
      // Table key position (`{ a = 1 }`) — never rename the key.
      var isKey = tableFieldStart && !isField && nextSigEq(i);
      if (opts.rename && !isField && !isKey) {
        var m = lookupName(v);
        emitText(m !== null ? m : v);
      } else {
        emitText(v);
      }
      tableFieldStart = false;
    }

    function rawCopyStatement(i) {
      var ang = 0;
      while (i < tokens.length) {
        var t = tokens[i];
        if (t.type === "ws") {
          if (/\n/.test(t.value) && ang === 0 && d === 0) return i;
          i++; continue;
        }
        if (t.type === "comment" || t.type === "shebang") { i++; continue; }
        if (t.type === "symbol") {
          var v = t.value;
          if (v === ";" && ang === 0 && d === 0) return i;
          if (v === "(" || v === "[") { emitText(v); d++; }
          else if (v === "{") { emitText("{"); d++; tableStack.push(d); }
          else if (v === ")") { d--; emitText(")"); }
          else if (v === "]") { d--; emitText("]"); }
          else if (v === "}") { d--; tableStack.pop(); emitText("}"); }
          else if (v === "<") { ang++; emitText("<"); }
          else if (v === ">") { ang--; emitText(">"); }
          else emitText(v);
          prevSig = t; atStatementStart = false; i++;
          continue;
        }
        if (t.type === "keyword") {
          if (ang === 0 && d === 0 && ACT_SET.has(t.value)) return i;
          emitText(t.value);
          prevSig = t; atStatementStart = false; i++;
          continue;
        }
        emitText(t.value);
        prevSig = t; atStatementStart = false; i++;
      }
      return i;
    }

    /* ---- Structural handlers ---- */
    function handleLocal(i) {
      emitText("local");
      prevSig = tokens[i];
      atStatementStart = false;
      var j = skipWsComments(i + 1);
      if (tokens[j] && tokens[j].type === "keyword" && tokens[j].value === "function") {
        emitText("function");
        j = skipWsComments(j + 1);
        if (tokens[j] && tokens[j].type === "ident") {
          var nn = renameFor(tokens[j].value);
          emitText(nn);
          if (opts.rename) scopeStack[scopeStack.length - 1].set(tokens[j].value, nn);
          j = skipWsComments(j + 1);
          if (tokens[j] && tokens[j].type === "symbol" && tokens[j].value === "<") j = emitAngleRaw(j);
          j = skipWsComments(j);
        }
        pushScope("function");
        if (tokens[j] && tokens[j].type === "symbol" && tokens[j].value === "(") j = parseParams(j);
        prevSig = tokens[Math.max(i, j - 1)];
        return j;
      }

      var declared = [];
      while (tokens[j] && tokens[j].type === "ident") {
        declared.push({ name: tokens[j].value, newName: renameFor(tokens[j].value) });
        j = skipWsComments(j + 1);
        if (tokens[j] && tokens[j].type === "symbol" && tokens[j].value === ":") j = skipType(j);
        if (tokens[j] && tokens[j].type === "symbol" && tokens[j].value === "<") j = emitAngleRaw(j);
        j = skipWsComments(j);
        if (tokens[j] && tokens[j].type === "symbol" && tokens[j].value === ",") { j = skipWsComments(j + 1); continue; }
        break;
      }
      for (var di = 0; di < declared.length; di++) {
        if (di > 0) emitText(",");
        emitText(declared[di].newName);
      }
      j = skipWsComments(j);
      if (tokens[j] && tokens[j].type === "symbol" && tokens[j].value === "=") {
        emitText("=");
        var pend = pendingStack[pendingStack.length - 1];
        for (var pi = 0; pi < declared.length; pi++) pend.push(declared[pi]);
        prevSig = tokens[j];
        return j + 1;
      }
      for (var ei = 0; ei < declared.length; ei++) {
        scopeStack[scopeStack.length - 1].set(declared[ei].name, declared[ei].newName);
      }
      prevSig = tokens[Math.max(i, j - 1)];
      return j;
    }

    function parseParams(j) {
      emitText("(");
      j = skipWsComments(j + 1);
      var needComma = false;
      while (j < tokens.length) {
        var t = tokens[j];
        if (t.type === "ws" || t.type === "comment" || t.type === "shebang") { j++; continue; }
        if (t.type === "symbol" && t.value === ")") break;
        if (t.type === "symbol" && t.value === "...") {
          if (needComma) emitText(",");
          emitText("...");
          needComma = true;
          j = skipWsComments(j + 1);
          continue;
        }
        if (t.type === "ident") {
          if (needComma) emitText(",");
          var nn = renameFor(t.value);
          emitText(nn);
          if (opts.rename) scopeStack[scopeStack.length - 1].set(t.value, nn);
          needComma = true;
          j = skipWsComments(j + 1);
          if (tokens[j] && tokens[j].type === "symbol" && tokens[j].value === ":") j = skipType(j);
          if (tokens[j] && tokens[j].type === "symbol" && tokens[j].value === "<") j = emitAngleRaw(j);
          j = skipWsComments(j);
          continue;
        }
        j++;
      }
      if (tokens[j] && tokens[j].type === "symbol" && tokens[j].value === ")") {
        emitText(")");
        j++;
      }
      prevSig = tokens[Math.max(0, j - 1)];
      return j;
    }

    function handleFunction(i) {
      emitText("function");
      prevSig = tokens[i];
      atStatementStart = false;
      var j = skipWsComments(i + 1);
      var t = tokens[j];

      if (t && t.type === "ident") {
        var t2 = nextSignificant(tokens, j);
        if (t2 && t2.type === "symbol" && (t2.value === "." || t2.value === ":")) {
          // function t.m(...) / function t:m(...)
          var m = opts.rename ? lookupName(t.value) : null;
          emitText(m !== null ? m : t.value);
          j = skipWsComments(j + 1);
          while (tokens[j] && tokens[j].type === "symbol" && (tokens[j].value === "." || tokens[j].value === ":")) {
            emitText(tokens[j].value);
            j = skipWsComments(j + 1);
            if (tokens[j] && tokens[j].type === "ident") { emitText(tokens[j].value); j = skipWsComments(j + 1); }
            else break;
          }
          if (tokens[j] && tokens[j].type === "symbol" && tokens[j].value === "<") j = emitAngleRaw(j);
          j = skipWsComments(j);
          pushScope("function");
          if (tokens[j] && tokens[j].type === "symbol" && tokens[j].value === "(") j = parseParams(j);
          else prevSig = tokens[Math.max(i, j - 1)];
        } else if (t2 && t2.type === "symbol" && t2.value === "(") {
          // global function foo(...)
          emitText(t.value);
          j = skipWsComments(j + 1);
          pushScope("function");
          j = parseParams(j);
        } else {
          emitText(t.value);
          j = skipWsComments(j + 1);
          pushScope("function");
          prevSig = tokens[Math.max(i, j - 1)];
        }
      } else {
        j = skipWsComments(j);
        if (tokens[j] && tokens[j].type === "symbol" && tokens[j].value === "<") j = emitAngleRaw(j);
        j = skipWsComments(j);
        pushScope("function");
        if (tokens[j] && tokens[j].type === "symbol" && tokens[j].value === "(") j = parseParams(j);
        else prevSig = tokens[Math.max(i, j - 1)];
      }
      return j;
    }

    function handleFor(i) {
      emitText("for");
      prevSig = tokens[i];
      atStatementStart = false;
      var j = skipWsComments(i + 1);
      var vars = [];
      while (tokens[j] && tokens[j].type === "ident") {
        var nn = renameFor(tokens[j].value);
        vars.push({ name: tokens[j].value, newName: nn });
        emitText(nn);
        j = skipWsComments(j + 1);
        if (tokens[j] && tokens[j].type === "symbol" && tokens[j].value === ",") {
          emitText(",");
          j = skipWsComments(j + 1);
          continue;
        }
        break;
      }
      forPendingStack.push({ vars: vars, depth: d });
      return j;
    }

    function addForVars() {
      if (forPendingStack.length === 0) return;
      var top = forPendingStack[forPendingStack.length - 1];
      if (top.depth === d) {
        var map = scopeStack[scopeStack.length - 1];
        for (var v = 0; v < top.vars.length; v++) map.set(top.vars[v].name, top.vars[v].newName);
        forPendingStack.pop();
      }
    }

    function emitToken(tok, i) {
      tableFieldStart = false;
      if (tok.type === "ident") {
        return emitIdent(tok, i);
      }
      if (tok.type === "string") {
        if (tok.value[0] === "`") { emitText(tok.value); return null; }
        if (opts.strings && !stringGlobalReassigned && !shadowedInScope("string")) {
          var bytes = tok.value[0] === "[" ? decodeLongString(tok.value) : decodeShortString(tok.value);
          if (bytes.length >= opts.minStringLen) {
            emitText(stringCharExpr(bytes, opts.chunkSize));
            return null;
          }
        }
        emitText(tok.value);
        return null;
      }
      if (tok.type === "number") {
        if (opts.numbers && /^-?\d+$/.test(tok.value)) {
          var pv = prevSig;
          var afterDot = pv && pv.type === "symbol" && pv.value === ".";
          if (!afterDot && rng() < opts.numberChance) {
            emitText(maskInteger(parseInt(tok.value, 10), rng));
            return null;
          }
        }
        emitText(tok.value);
        return null;
      }
      emitText(tok.value);
      return null;
    }

    /* ---- Decoys ---- */
    var decoysLeft = opts.decoys;
    var chunkBoundaries = 0;
    function maybeDecoy() {
      if (decoysLeft <= 0) return;
      if (scopeStack.length !== 1) return;
      chunkBoundaries++;
      if (chunkBoundaries % 3 !== 0) return;
      var name = genName();
      var r = rng();
      var num = 1 + Math.floor(rng() * 0xffff);
      if (r < 0.34) emitText("do local " + name + " = " + num + " end");
      else if (r < 0.67) emitText("do local " + name + " = " + num + " + " + (num % 9 + 1) + " end");
      else emitText("do if " + num + " > " + (num >> 1) + " then local " + name + " = " + (num % 13) + " end end");
      emitNewline();
      decoysLeft--;
    }

    /* ---- Preamble: shebang + Luau mode directives + watermark ---- */
    var headLines = [];
    var firstCode = 0;
    while (firstCode < tokens.length) {
      var ft = tokens[firstCode];
      if (ft.type === "ws" || ft.type === "comment" || ft.type === "shebang") {
        if (ft.type === "shebang") headLines.push(ft.value);
        else if (ft.type === "comment" && /^--!/.test(ft.value.trim())) headLines.push(ft.value.trim());
        firstCode++;
      } else break;
    }
    if (opts.watermark) headLines.push(WATERMARK);
    var head = headLines.length ? headLines.join("\n") + "\n" : "";

    /* ---- Main pass ---- */
    var i = firstCode;
    while (i < tokens.length) {
      var tok = tokens[i];

      if (tok.type === "ws") {
        if (/\n/.test(tok.value) && d === 0) {
          activatePending();
          if (afterUntil) { popScope(); afterUntil = false; }
          emitNewline();
          atStatementStart = true;
          maybeDecoy();
        }
        i++;
        continue;
      }
      if (tok.type === "comment" || tok.type === "shebang") { i++; continue; }

      if (tok.type === "symbol" && tok.value === ";" && d === 0) {
        activatePending();
        if (afterUntil) { popScope(); afterUntil = false; }
        emitNewline();
        atStatementStart = true;
        maybeDecoy();
        i++;
        continue;
      }

      if (tok.type === "keyword") {
        tableFieldStart = false;
        if (d === 0 && ACT_SET.has(tok.value)) {
          activatePending();
          if (afterUntil) { popScope(); afterUntil = false; }
        }
        switch (tok.value) {
          case "local": i = handleLocal(i); continue;
          case "function": i = handleFunction(i); continue;
          case "for": i = handleFor(i); continue;
          case "if": case "while": emitText(tok.value); prevSig = tok; atStatementStart = false; i++; continue;
          case "do":
            pushScope("do");
            addForVars();
            emitText("do"); prevSig = tok; atStatementStart = true; i++; continue;
          case "then":
            pushScope("then"); emitText("then"); prevSig = tok; atStatementStart = true; i++; continue;
          case "repeat":
            pushScope("repeat"); emitText("repeat"); prevSig = tok; atStatementStart = true; i++; continue;
          case "end":
            popScope(); emitText("end"); prevSig = tok; atStatementStart = true; i++; continue;
          case "until":
            emitText("until"); afterUntil = true; prevSig = tok; atStatementStart = false; i++; continue;
          case "else":
            popScope(); pushScope("else"); emitText("else"); prevSig = tok; atStatementStart = true; i++; continue;
          case "elseif":
            popScope(); emitText("elseif"); prevSig = tok; atStatementStart = true; i++; continue;
          default:
            emitText(tok.value); prevSig = tok; atStatementStart = false; i++; continue;
        }
      }

      // Ordinary token
      if (tok.type === "symbol") {
        var sv = tok.value;
        if (sv === "(" || sv === "[") { emitText(sv); d++; tableFieldStart = false; }
        else if (sv === "{") {
          emitText("{"); d++; tableStack.push(d); tableFieldStart = true;
        }
        else if (sv === ")") { d--; emitText(")"); tableFieldStart = false; }
        else if (sv === "]") { d--; emitText("]"); tableFieldStart = false; }
        else if (sv === "}") {
          d--; tableStack.pop(); emitText("}"); tableFieldStart = false;
        }
        else if (sv === "," || sv === ";") {
          emitText(sv);
          if (tableStack.length > 0 && d === tableStack[tableStack.length - 1]) {
            tableFieldStart = true;
          } else {
            tableFieldStart = false;
          }
        }
        else { emitText(sv); tableFieldStart = false; }
        prevSig = tok;
        atStatementStart = false;
        i++;
        continue;
      }

      var ret = emitToken(tok, i);
      if (ret !== null && ret !== undefined) {
        i = ret;
      } else {
        prevSig = tok;
        atStatementStart = false;
        i++;
      }
    }
    activatePending();

    var body = out.join("");
    var code = head + body;

    return {
      code: code,
      watermark: WATERMARK,
      level: level,
      stats: {
        inputBytes: byteLength(source),
        outputBytes: byteLength(code),
        inputLines: lineCount(source),
        outputLines: lineCount(code)
      }
    };
  }

  function byteLength(s) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s).length;
    return s.length;
  }
  function lineCount(s) {
    if (s.length === 0) return 0;
    var n = 1;
    for (var i = 0; i < s.length; i++) if (s[i] === "\n") n++;
    return n;
  }

  var SAMPLE = [
    "--!strict",
    "local PlayerService = game:GetService(\"Players\")",
    "local ReplicatedStorage = game:GetService(\"ReplicatedStorage\")",
    "",
    "local function greet(player: Player): string",
    "\tlocal display = player.DisplayName",
    "\tlocal message = string.format(\"Welcome back, %s!\", display)",
    "\tfor i = 1, 3 do",
    "\t\tmessage = message .. \"!\"",
    "\tend",
    "\treturn message",
    "end",
    "",
    "local function onJoin(player: Player)",
    "\tlocal msg = greet(player)",
    "\tprint(msg)",
    "end",
    "",
    "PlayerService.PlayerAdded:Connect(onJoin)"
  ].join("\n");

  var api = {
    version: VERSION,
    watermark: WATERMARK,
    obfuscate: obfuscate,
    presets: Object.keys(PRESETS),
    sample: SAMPLE
  };

  global.LurithWeb = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
