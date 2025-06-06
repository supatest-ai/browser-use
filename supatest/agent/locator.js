
() => {
  // Utility functions
  var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/content/services/playwright/utils/isomorphic/ariaSnapshot.ts
function parseAriaSnapshot(yaml, text, options = {}) {
  var _a2;
  const lineCounter = new yaml.LineCounter();
  const parseOptions = __spreadValues({
    keepSourceTokens: true,
    lineCounter
  }, options);
  const yamlDoc = yaml.parseDocument(text, parseOptions);
  const errors = [];
  const convertRange = (range) => {
    return [lineCounter.linePos(range[0]), lineCounter.linePos(range[1])];
  };
  const addError = (error) => {
    errors.push({
      message: error.message,
      range: [lineCounter.linePos(error.pos[0]), lineCounter.linePos(error.pos[1])]
    });
  };
  const convertSeq = (container, seq) => {
    for (const item of seq.items) {
      const itemIsString = item instanceof yaml.Scalar && typeof item.value === "string";
      if (itemIsString) {
        const childNode = KeyParser.parse(item, parseOptions, errors);
        if (childNode) {
          container.children = container.children || [];
          container.children.push(childNode);
        }
        continue;
      }
      const itemIsMap = item instanceof yaml.YAMLMap;
      if (itemIsMap) {
        convertMap(container, item);
        continue;
      }
      errors.push({
        message: "Sequence items should be strings or maps",
        range: convertRange(item.range || seq.range)
      });
    }
  };
  const convertMap = (container, map) => {
    var _a3;
    for (const entry of map.items) {
      container.children = container.children || [];
      const keyIsString = entry.key instanceof yaml.Scalar && typeof entry.key.value === "string";
      if (!keyIsString) {
        errors.push({
          message: "Only string keys are supported",
          range: convertRange(entry.key.range || map.range)
        });
        continue;
      }
      const key = entry.key;
      const value = entry.value;
      if (key.value === "text") {
        const valueIsString = value instanceof yaml.Scalar && typeof value.value === "string";
        if (!valueIsString) {
          errors.push({
            message: "Text value should be a string",
            range: convertRange(entry.value.range || map.range)
          });
          continue;
        }
        container.children.push({
          kind: "text",
          text: valueOrRegex(value.value)
        });
        continue;
      }
      if (key.value === "/children") {
        const valueIsString = value instanceof yaml.Scalar && typeof value.value === "string";
        if (!valueIsString || value.value !== "contain" && value.value !== "equal" && value.value !== "deep-equal") {
          errors.push({
            message: 'Strict value should be "contain", "equal" or "deep-equal"',
            range: convertRange(entry.value.range || map.range)
          });
          continue;
        }
        container.containerMode = value.value;
        continue;
      }
      if (key.value.startsWith("/")) {
        const valueIsString = value instanceof yaml.Scalar && typeof value.value === "string";
        if (!valueIsString) {
          errors.push({
            message: "Property value should be a string",
            range: convertRange(entry.value.range || map.range)
          });
          continue;
        }
        container.props = (_a3 = container.props) != null ? _a3 : {};
        container.props[key.value.slice(1)] = valueOrRegex(value.value);
        continue;
      }
      const childNode = KeyParser.parse(key, parseOptions, errors);
      if (!childNode)
        continue;
      const valueIsScalar = value instanceof yaml.Scalar;
      if (valueIsScalar) {
        const type = typeof value.value;
        if (type !== "string" && type !== "number" && type !== "boolean") {
          errors.push({
            message: "Node value should be a string or a sequence",
            range: convertRange(entry.value.range || map.range)
          });
          continue;
        }
        container.children.push(__spreadProps(__spreadValues({}, childNode), {
          children: [{
            kind: "text",
            text: valueOrRegex(String(value.value))
          }]
        }));
        continue;
      }
      const valueIsSequence = value instanceof yaml.YAMLSeq;
      if (valueIsSequence) {
        container.children.push(childNode);
        convertSeq(childNode, value);
        continue;
      }
      errors.push({
        message: "Map values should be strings or sequences",
        range: convertRange(entry.value.range || map.range)
      });
    }
  };
  const fragment = { kind: "role", role: "fragment" };
  yamlDoc.errors.forEach(addError);
  if (errors.length)
    return { errors, fragment };
  if (!(yamlDoc.contents instanceof yaml.YAMLSeq)) {
    errors.push({
      message: 'Aria snapshot must be a YAML sequence, elements starting with " -"',
      range: yamlDoc.contents ? convertRange(yamlDoc.contents.range) : [{ line: 0, col: 0 }, { line: 0, col: 0 }]
    });
  }
  if (errors.length)
    return { errors, fragment };
  convertSeq(fragment, yamlDoc.contents);
  if (errors.length)
    return { errors, fragment: emptyFragment };
  if (((_a2 = fragment.children) == null ? void 0 : _a2.length) === 1)
    return { fragment: fragment.children[0], errors };
  return { fragment, errors };
}
var emptyFragment = { kind: "role", role: "fragment" };
function normalizeWhitespace(text) {
  return text.replace(/[\u200b\u00ad]/g, "").replace(/[\r\n\s\t]+/g, " ").trim();
}
function valueOrRegex(value) {
  return value.startsWith("/") && value.endsWith("/") && value.length > 1 ? { pattern: value.slice(1, -1) } : normalizeWhitespace(value);
}
var KeyParser = class _KeyParser {
  constructor(input) {
    __publicField(this, "_input");
    __publicField(this, "_pos");
    __publicField(this, "_length");
    this._input = input;
    this._pos = 0;
    this._length = input.length;
  }
  static parse(text, options, errors) {
    try {
      return new _KeyParser(text.value)._parse();
    } catch (e) {
      if (e instanceof ParserError) {
        const message = options.prettyErrors === false ? e.message : e.message + ":\n\n" + text.value + "\n" + " ".repeat(e.pos) + "^\n";
        errors.push({
          message,
          range: [options.lineCounter.linePos(text.range[0]), options.lineCounter.linePos(text.range[0] + e.pos)]
        });
        return null;
      }
      throw e;
    }
  }
  _peek() {
    return this._input[this._pos] || "";
  }
  _next() {
    if (this._pos < this._length)
      return this._input[this._pos++];
    return null;
  }
  _eof() {
    return this._pos >= this._length;
  }
  _isWhitespace() {
    return !this._eof() && /\s/.test(this._peek());
  }
  _skipWhitespace() {
    while (this._isWhitespace())
      this._pos++;
  }
  _readIdentifier(type) {
    if (this._eof())
      this._throwError(`Unexpected end of input when expecting ${type}`);
    const start = this._pos;
    while (!this._eof() && /[a-zA-Z]/.test(this._peek()))
      this._pos++;
    return this._input.slice(start, this._pos);
  }
  _readString() {
    let result2 = "";
    let escaped = false;
    while (!this._eof()) {
      const ch = this._next();
      if (escaped) {
        result2 += ch;
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        return result2;
      } else {
        result2 += ch;
      }
    }
    this._throwError("Unterminated string");
  }
  _throwError(message, offset = 0) {
    throw new ParserError(message, offset || this._pos);
  }
  _readRegex() {
    let result2 = "";
    let escaped = false;
    let insideClass = false;
    while (!this._eof()) {
      const ch = this._next();
      if (escaped) {
        result2 += ch;
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
        result2 += ch;
      } else if (ch === "/" && !insideClass) {
        return { pattern: result2 };
      } else if (ch === "[") {
        insideClass = true;
        result2 += ch;
      } else if (ch === "]" && insideClass) {
        result2 += ch;
        insideClass = false;
      } else {
        result2 += ch;
      }
    }
    this._throwError("Unterminated regex");
  }
  _readStringOrRegex() {
    const ch = this._peek();
    if (ch === '"') {
      this._next();
      return normalizeWhitespace(this._readString());
    }
    if (ch === "/") {
      this._next();
      return this._readRegex();
    }
    return null;
  }
  _readAttributes(result2) {
    let errorPos = this._pos;
    while (true) {
      this._skipWhitespace();
      if (this._peek() === "[") {
        this._next();
        this._skipWhitespace();
        errorPos = this._pos;
        const flagName = this._readIdentifier("attribute");
        this._skipWhitespace();
        let flagValue = "";
        if (this._peek() === "=") {
          this._next();
          this._skipWhitespace();
          errorPos = this._pos;
          while (this._peek() !== "]" && !this._isWhitespace() && !this._eof())
            flagValue += this._next();
        }
        this._skipWhitespace();
        if (this._peek() !== "]")
          this._throwError("Expected ]");
        this._next();
        this._applyAttribute(result2, flagName, flagValue || "true", errorPos);
      } else {
        break;
      }
    }
  }
  _parse() {
    this._skipWhitespace();
    const role = this._readIdentifier("role");
    this._skipWhitespace();
    const name = this._readStringOrRegex() || "";
    const result2 = { kind: "role", role, name };
    this._readAttributes(result2);
    this._skipWhitespace();
    if (!this._eof())
      this._throwError("Unexpected input");
    return result2;
  }
  _applyAttribute(node, key, value, errorPos) {
    if (key === "checked") {
      this._assert(value === "true" || value === "false" || value === "mixed", 'Value of "checked" attribute must be a boolean or "mixed"', errorPos);
      node.checked = value === "true" ? true : value === "false" ? false : "mixed";
      return;
    }
    if (key === "disabled") {
      this._assert(value === "true" || value === "false", 'Value of "disabled" attribute must be a boolean', errorPos);
      node.disabled = value === "true";
      return;
    }
    if (key === "expanded") {
      this._assert(value === "true" || value === "false", 'Value of "expanded" attribute must be a boolean', errorPos);
      node.expanded = value === "true";
      return;
    }
    if (key === "level") {
      this._assert(!isNaN(Number(value)), 'Value of "level" attribute must be a number', errorPos);
      node.level = Number(value);
      return;
    }
    if (key === "pressed") {
      this._assert(value === "true" || value === "false" || value === "mixed", 'Value of "pressed" attribute must be a boolean or "mixed"', errorPos);
      node.pressed = value === "true" ? true : value === "false" ? false : "mixed";
      return;
    }
    if (key === "selected") {
      this._assert(value === "true" || value === "false", 'Value of "selected" attribute must be a boolean', errorPos);
      node.selected = value === "true";
      return;
    }
    this._assert(false, `Unsupported attribute [${key}]`, errorPos);
  }
  _assert(value, message, valuePos) {
    if (!value)
      this._throwError(message || "Assertion error", valuePos);
  }
};
var ParserError = class extends Error {
  constructor(message, pos) {
    super(message);
    __publicField(this, "pos");
    this.pos = pos;
  }
};

// src/content/services/playwright/utils/isomorphic/cssTokenizer.ts
var between = function(num, first, last) {
  return num >= first && num <= last;
};
function digit(code) {
  return between(code, 48, 57);
}
function hexdigit(code) {
  return digit(code) || between(code, 65, 70) || between(code, 97, 102);
}
function uppercaseletter(code) {
  return between(code, 65, 90);
}
function lowercaseletter(code) {
  return between(code, 97, 122);
}
function letter(code) {
  return uppercaseletter(code) || lowercaseletter(code);
}
function nonascii(code) {
  return code >= 128;
}
function namestartchar(code) {
  return letter(code) || nonascii(code) || code === 95;
}
function namechar(code) {
  return namestartchar(code) || digit(code) || code === 45;
}
function nonprintable(code) {
  return between(code, 0, 8) || code === 11 || between(code, 14, 31) || code === 127;
}
function newline(code) {
  return code === 10;
}
function whitespace(code) {
  return newline(code) || code === 9 || code === 32;
}
var maximumallowedcodepoint = 1114111;
var InvalidCharacterError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidCharacterError";
  }
};
function preprocess(str) {
  const codepoints = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code === 13 && str.charCodeAt(i + 1) === 10) {
      code = 10;
      i++;
    }
    if (code === 13 || code === 12)
      code = 10;
    if (code === 0)
      code = 65533;
    if (between(code, 55296, 56319) && between(str.charCodeAt(i + 1), 56320, 57343)) {
      const lead = code - 55296;
      const trail = str.charCodeAt(i + 1) - 56320;
      code = Math.pow(2, 16) + lead * Math.pow(2, 10) + trail;
      i++;
    }
    codepoints.push(code);
  }
  return codepoints;
}
function stringFromCode(code) {
  if (code <= 65535)
    return String.fromCharCode(code);
  code -= Math.pow(2, 16);
  const lead = Math.floor(code / Math.pow(2, 10)) + 55296;
  const trail = code % Math.pow(2, 10) + 56320;
  return String.fromCharCode(lead) + String.fromCharCode(trail);
}
function tokenize(str1) {
  const str = preprocess(str1);
  let i = -1;
  const tokens = [];
  let code;
  let line = 0;
  let column = 0;
  let lastLineLength = 0;
  const incrLineno = function() {
    line += 1;
    lastLineLength = column;
    column = 0;
  };
  const locStart = { line, column };
  const codepoint = function(i2) {
    if (i2 >= str.length)
      return -1;
    return str[i2];
  };
  const next = function(num) {
    if (num === void 0)
      num = 1;
    if (num > 3)
      throw "Spec Error: no more than three codepoints of lookahead.";
    return codepoint(i + num);
  };
  const consume = function(num) {
    if (num === void 0)
      num = 1;
    i += num;
    code = codepoint(i);
    if (newline(code))
      incrLineno();
    else
      column += num;
    return true;
  };
  const reconsume = function() {
    i -= 1;
    if (newline(code)) {
      line -= 1;
      column = lastLineLength;
    } else {
      column -= 1;
    }
    locStart.line = line;
    locStart.column = column;
    return true;
  };
  const eof = function(codepoint2) {
    if (codepoint2 === void 0)
      codepoint2 = code;
    return codepoint2 === -1;
  };
  const donothing = function() {
  };
  const parseerror = function() {
  };
  const consumeAToken = function() {
    consumeComments();
    consume();
    if (whitespace(code)) {
      while (whitespace(next()))
        consume();
      return new WhitespaceToken();
    } else if (code === 34) {
      return consumeAStringToken();
    } else if (code === 35) {
      if (namechar(next()) || areAValidEscape(next(1), next(2))) {
        const token = new HashToken("");
        if (wouldStartAnIdentifier(next(1), next(2), next(3)))
          token.type = "id";
        token.value = consumeAName();
        return token;
      } else {
        return new DelimToken(code);
      }
    } else if (code === 36) {
      if (next() === 61) {
        consume();
        return new SuffixMatchToken();
      } else {
        return new DelimToken(code);
      }
    } else if (code === 39) {
      return consumeAStringToken();
    } else if (code === 40) {
      return new OpenParenToken();
    } else if (code === 41) {
      return new CloseParenToken();
    } else if (code === 42) {
      if (next() === 61) {
        consume();
        return new SubstringMatchToken();
      } else {
        return new DelimToken(code);
      }
    } else if (code === 43) {
      if (startsWithANumber()) {
        reconsume();
        return consumeANumericToken();
      } else {
        return new DelimToken(code);
      }
    } else if (code === 44) {
      return new CommaToken();
    } else if (code === 45) {
      if (startsWithANumber()) {
        reconsume();
        return consumeANumericToken();
      } else if (next(1) === 45 && next(2) === 62) {
        consume(2);
        return new CDCToken();
      } else if (startsWithAnIdentifier()) {
        reconsume();
        return consumeAnIdentlikeToken();
      } else {
        return new DelimToken(code);
      }
    } else if (code === 46) {
      if (startsWithANumber()) {
        reconsume();
        return consumeANumericToken();
      } else {
        return new DelimToken(code);
      }
    } else if (code === 58) {
      return new ColonToken();
    } else if (code === 59) {
      return new SemicolonToken();
    } else if (code === 60) {
      if (next(1) === 33 && next(2) === 45 && next(3) === 45) {
        consume(3);
        return new CDOToken();
      } else {
        return new DelimToken(code);
      }
    } else if (code === 64) {
      if (wouldStartAnIdentifier(next(1), next(2), next(3)))
        return new AtKeywordToken(consumeAName());
      else
        return new DelimToken(code);
    } else if (code === 91) {
      return new OpenSquareToken();
    } else if (code === 92) {
      if (startsWithAValidEscape()) {
        reconsume();
        return consumeAnIdentlikeToken();
      } else {
        parseerror();
        return new DelimToken(code);
      }
    } else if (code === 93) {
      return new CloseSquareToken();
    } else if (code === 94) {
      if (next() === 61) {
        consume();
        return new PrefixMatchToken();
      } else {
        return new DelimToken(code);
      }
    } else if (code === 123) {
      return new OpenCurlyToken();
    } else if (code === 124) {
      if (next() === 61) {
        consume();
        return new DashMatchToken();
      } else if (next() === 124) {
        consume();
        return new ColumnToken();
      } else {
        return new DelimToken(code);
      }
    } else if (code === 125) {
      return new CloseCurlyToken();
    } else if (code === 126) {
      if (next() === 61) {
        consume();
        return new IncludeMatchToken();
      } else {
        return new DelimToken(code);
      }
    } else if (digit(code)) {
      reconsume();
      return consumeANumericToken();
    } else if (namestartchar(code)) {
      reconsume();
      return consumeAnIdentlikeToken();
    } else if (eof()) {
      return new EOFToken();
    } else {
      return new DelimToken(code);
    }
  };
  const consumeComments = function() {
    while (next(1) === 47 && next(2) === 42) {
      consume(2);
      while (true) {
        consume();
        if (code === 42 && next() === 47) {
          consume();
          break;
        } else if (eof()) {
          parseerror();
          return;
        }
      }
    }
  };
  const consumeANumericToken = function() {
    const num = consumeANumber();
    if (wouldStartAnIdentifier(next(1), next(2), next(3))) {
      const token = new DimensionToken();
      token.value = num.value;
      token.repr = num.repr;
      token.type = num.type;
      token.unit = consumeAName();
      return token;
    } else if (next() === 37) {
      consume();
      const token = new PercentageToken();
      token.value = num.value;
      token.repr = num.repr;
      return token;
    } else {
      const token = new NumberToken();
      token.value = num.value;
      token.repr = num.repr;
      token.type = num.type;
      return token;
    }
  };
  const consumeAnIdentlikeToken = function() {
    const str2 = consumeAName();
    if (str2.toLowerCase() === "url" && next() === 40) {
      consume();
      while (whitespace(next(1)) && whitespace(next(2)))
        consume();
      if (next() === 34 || next() === 39)
        return new FunctionToken(str2);
      else if (whitespace(next()) && (next(2) === 34 || next(2) === 39))
        return new FunctionToken(str2);
      else
        return consumeAURLToken();
    } else if (next() === 40) {
      consume();
      return new FunctionToken(str2);
    } else {
      return new IdentToken(str2);
    }
  };
  const consumeAStringToken = function(endingCodePoint) {
    if (endingCodePoint === void 0)
      endingCodePoint = code;
    let string = "";
    while (consume()) {
      if (code === endingCodePoint || eof()) {
        return new StringToken(string);
      } else if (newline(code)) {
        parseerror();
        reconsume();
        return new BadStringToken();
      } else if (code === 92) {
        if (eof(next()))
          donothing();
        else if (newline(next()))
          consume();
        else
          string += stringFromCode(consumeEscape());
      } else {
        string += stringFromCode(code);
      }
    }
    throw new Error("Internal error");
  };
  const consumeAURLToken = function() {
    const token = new URLToken("");
    while (whitespace(next()))
      consume();
    if (eof(next()))
      return token;
    while (consume()) {
      if (code === 41 || eof()) {
        return token;
      } else if (whitespace(code)) {
        while (whitespace(next()))
          consume();
        if (next() === 41 || eof(next())) {
          consume();
          return token;
        } else {
          consumeTheRemnantsOfABadURL();
          return new BadURLToken();
        }
      } else if (code === 34 || code === 39 || code === 40 || nonprintable(code)) {
        parseerror();
        consumeTheRemnantsOfABadURL();
        return new BadURLToken();
      } else if (code === 92) {
        if (startsWithAValidEscape()) {
          token.value += stringFromCode(consumeEscape());
        } else {
          parseerror();
          consumeTheRemnantsOfABadURL();
          return new BadURLToken();
        }
      } else {
        token.value += stringFromCode(code);
      }
    }
    throw new Error("Internal error");
  };
  const consumeEscape = function() {
    consume();
    if (hexdigit(code)) {
      const digits = [code];
      for (let total = 0; total < 5; total++) {
        if (hexdigit(next())) {
          consume();
          digits.push(code);
        } else {
          break;
        }
      }
      if (whitespace(next()))
        consume();
      let value = parseInt(digits.map(function(x) {
        return String.fromCharCode(x);
      }).join(""), 16);
      if (value > maximumallowedcodepoint)
        value = 65533;
      return value;
    } else if (eof()) {
      return 65533;
    } else {
      return code;
    }
  };
  const areAValidEscape = function(c1, c2) {
    if (c1 !== 92)
      return false;
    if (newline(c2))
      return false;
    return true;
  };
  const startsWithAValidEscape = function() {
    return areAValidEscape(code, next());
  };
  const wouldStartAnIdentifier = function(c1, c2, c3) {
    if (c1 === 45)
      return namestartchar(c2) || c2 === 45 || areAValidEscape(c2, c3);
    else if (namestartchar(c1))
      return true;
    else if (c1 === 92)
      return areAValidEscape(c1, c2);
    else
      return false;
  };
  const startsWithAnIdentifier = function() {
    return wouldStartAnIdentifier(code, next(1), next(2));
  };
  const wouldStartANumber = function(c1, c2, c3) {
    if (c1 === 43 || c1 === 45) {
      if (digit(c2))
        return true;
      if (c2 === 46 && digit(c3))
        return true;
      return false;
    } else if (c1 === 46) {
      if (digit(c2))
        return true;
      return false;
    } else if (digit(c1)) {
      return true;
    } else {
      return false;
    }
  };
  const startsWithANumber = function() {
    return wouldStartANumber(code, next(1), next(2));
  };
  const consumeAName = function() {
    let result2 = "";
    while (consume()) {
      if (namechar(code)) {
        result2 += stringFromCode(code);
      } else if (startsWithAValidEscape()) {
        result2 += stringFromCode(consumeEscape());
      } else {
        reconsume();
        return result2;
      }
    }
    throw new Error("Internal parse error");
  };
  const consumeANumber = function() {
    let repr = "";
    let type = "integer";
    if (next() === 43 || next() === 45) {
      consume();
      repr += stringFromCode(code);
    }
    while (digit(next())) {
      consume();
      repr += stringFromCode(code);
    }
    if (next(1) === 46 && digit(next(2))) {
      consume();
      repr += stringFromCode(code);
      consume();
      repr += stringFromCode(code);
      type = "number";
      while (digit(next())) {
        consume();
        repr += stringFromCode(code);
      }
    }
    const c1 = next(1), c2 = next(2), c3 = next(3);
    if ((c1 === 69 || c1 === 101) && digit(c2)) {
      consume();
      repr += stringFromCode(code);
      consume();
      repr += stringFromCode(code);
      type = "number";
      while (digit(next())) {
        consume();
        repr += stringFromCode(code);
      }
    } else if ((c1 === 69 || c1 === 101) && (c2 === 43 || c2 === 45) && digit(c3)) {
      consume();
      repr += stringFromCode(code);
      consume();
      repr += stringFromCode(code);
      consume();
      repr += stringFromCode(code);
      type = "number";
      while (digit(next())) {
        consume();
        repr += stringFromCode(code);
      }
    }
    const value = convertAStringToANumber(repr);
    return { type, value, repr };
  };
  const convertAStringToANumber = function(string) {
    return +string;
  };
  const consumeTheRemnantsOfABadURL = function() {
    while (consume()) {
      if (code === 41 || eof()) {
        return;
      } else if (startsWithAValidEscape()) {
        consumeEscape();
        donothing();
      } else {
        donothing();
      }
    }
  };
  let iterationCount = 0;
  while (!eof(next())) {
    tokens.push(consumeAToken());
    iterationCount++;
    if (iterationCount > str.length * 2)
      throw new Error("I'm infinite-looping!");
  }
  return tokens;
}
var CSSParserToken = class {
  constructor() {
    __publicField(this, "tokenType", "");
    __publicField(this, "value");
  }
  toJSON() {
    return { token: this.tokenType };
  }
  toString() {
    return this.tokenType;
  }
  toSource() {
    return "" + this;
  }
};
var BadStringToken = class extends CSSParserToken {
  constructor() {
    super(...arguments);
    __publicField(this, "tokenType", "BADSTRING");
  }
};
var BadURLToken = class extends CSSParserToken {
  constructor() {
    super(...arguments);
    __publicField(this, "tokenType", "BADURL");
  }
};
var WhitespaceToken = class extends CSSParserToken {
  constructor() {
    super(...arguments);
    __publicField(this, "tokenType", "WHITESPACE");
  }
  toString() {
    return "WS";
  }
  toSource() {
    return " ";
  }
};
var CDOToken = class extends CSSParserToken {
  constructor() {
    super(...arguments);
    __publicField(this, "tokenType", "CDO");
  }
  toSource() {
    return "<!--";
  }
};
var CDCToken = class extends CSSParserToken {
  constructor() {
    super(...arguments);
    __publicField(this, "tokenType", "CDC");
  }
  toSource() {
    return "-->";
  }
};
var ColonToken = class extends CSSParserToken {
  constructor() {
    super(...arguments);
    __publicField(this, "tokenType", ":");
  }
};
var SemicolonToken = class extends CSSParserToken {
  constructor() {
    super(...arguments);
    __publicField(this, "tokenType", ";");
  }
};
var CommaToken = class extends CSSParserToken {
  constructor() {
    super(...arguments);
    __publicField(this, "tokenType", ",");
  }
};
var GroupingToken = class extends CSSParserToken {
  constructor() {
    super(...arguments);
    __publicField(this, "value", "");
    __publicField(this, "mirror", "");
  }
};
var OpenCurlyToken = class extends GroupingToken {
  constructor() {
    super();
    __publicField(this, "tokenType", "{");
    this.value = "{";
    this.mirror = "}";
  }
};
var CloseCurlyToken = class extends GroupingToken {
  constructor() {
    super();
    __publicField(this, "tokenType", "}");
    this.value = "}";
    this.mirror = "{";
  }
};
var OpenSquareToken = class extends GroupingToken {
  constructor() {
    super();
    __publicField(this, "tokenType", "[");
    this.value = "[";
    this.mirror = "]";
  }
};
var CloseSquareToken = class extends GroupingToken {
  constructor() {
    super();
    __publicField(this, "tokenType", "]");
    this.value = "]";
    this.mirror = "[";
  }
};
var OpenParenToken = class extends GroupingToken {
  constructor() {
    super();
    __publicField(this, "tokenType", "(");
    this.value = "(";
    this.mirror = ")";
  }
};
var CloseParenToken = class extends GroupingToken {
  constructor() {
    super();
    __publicField(this, "tokenType", ")");
    this.value = ")";
    this.mirror = "(";
  }
};
var IncludeMatchToken = class extends CSSParserToken {
  constructor() {
    super(...arguments);
    __publicField(this, "tokenType", "~=");
  }
};
var DashMatchToken = class extends CSSParserToken {
  constructor() {
    super(...arguments);
    __publicField(this, "tokenType", "|=");
  }
};
var PrefixMatchToken = class extends CSSParserToken {
  constructor() {
    super(...arguments);
    __publicField(this, "tokenType", "^=");
  }
};
var SuffixMatchToken = class extends CSSParserToken {
  constructor() {
    super(...arguments);
    __publicField(this, "tokenType", "$=");
  }
};
var SubstringMatchToken = class extends CSSParserToken {
  constructor() {
    super(...arguments);
    __publicField(this, "tokenType", "*=");
  }
};
var ColumnToken = class extends CSSParserToken {
  constructor() {
    super(...arguments);
    __publicField(this, "tokenType", "||");
  }
};
var EOFToken = class extends CSSParserToken {
  constructor() {
    super(...arguments);
    __publicField(this, "tokenType", "EOF");
  }
  toSource() {
    return "";
  }
};
var DelimToken = class extends CSSParserToken {
  constructor(code) {
    super();
    __publicField(this, "tokenType", "DELIM");
    __publicField(this, "value", "");
    this.value = stringFromCode(code);
  }
  toString() {
    return "DELIM(" + this.value + ")";
  }
  toJSON() {
    const json = this.constructor.prototype.constructor.prototype.toJSON.call(this);
    json.value = this.value;
    return json;
  }
  toSource() {
    if (this.value === "\\")
      return "\\\n";
    else
      return this.value;
  }
};
var StringValuedToken = class extends CSSParserToken {
  constructor() {
    super(...arguments);
    __publicField(this, "value", "");
  }
  ASCIIMatch(str) {
    return this.value.toLowerCase() === str.toLowerCase();
  }
  toJSON() {
    const json = this.constructor.prototype.constructor.prototype.toJSON.call(this);
    json.value = this.value;
    return json;
  }
};
var IdentToken = class extends StringValuedToken {
  constructor(val) {
    super();
    __publicField(this, "tokenType", "IDENT");
    this.value = val;
  }
  toString() {
    return "IDENT(" + this.value + ")";
  }
  toSource() {
    return escapeIdent(this.value);
  }
};
var FunctionToken = class extends StringValuedToken {
  constructor(val) {
    super();
    __publicField(this, "tokenType", "FUNCTION");
    __publicField(this, "mirror");
    this.value = val;
    this.mirror = ")";
  }
  toString() {
    return "FUNCTION(" + this.value + ")";
  }
  toSource() {
    return escapeIdent(this.value) + "(";
  }
};
var AtKeywordToken = class extends StringValuedToken {
  constructor(val) {
    super();
    __publicField(this, "tokenType", "AT-KEYWORD");
    this.value = val;
  }
  toString() {
    return "AT(" + this.value + ")";
  }
  toSource() {
    return "@" + escapeIdent(this.value);
  }
};
var HashToken = class extends StringValuedToken {
  constructor(val) {
    super();
    __publicField(this, "tokenType", "HASH");
    __publicField(this, "type");
    this.value = val;
    this.type = "unrestricted";
  }
  toString() {
    return "HASH(" + this.value + ")";
  }
  toJSON() {
    const json = this.constructor.prototype.constructor.prototype.toJSON.call(this);
    json.value = this.value;
    json.type = this.type;
    return json;
  }
  toSource() {
    if (this.type === "id")
      return "#" + escapeIdent(this.value);
    else
      return "#" + escapeHash(this.value);
  }
};
var StringToken = class extends StringValuedToken {
  constructor(val) {
    super();
    __publicField(this, "tokenType", "STRING");
    this.value = val;
  }
  toString() {
    return '"' + escapeString(this.value) + '"';
  }
};
var URLToken = class extends StringValuedToken {
  constructor(val) {
    super();
    __publicField(this, "tokenType", "URL");
    this.value = val;
  }
  toString() {
    return "URL(" + this.value + ")";
  }
  toSource() {
    return 'url("' + escapeString(this.value) + '")';
  }
};
var NumberToken = class extends CSSParserToken {
  constructor() {
    super();
    __publicField(this, "tokenType", "NUMBER");
    __publicField(this, "type");
    __publicField(this, "repr");
    this.type = "integer";
    this.repr = "";
  }
  toString() {
    if (this.type === "integer")
      return "INT(" + this.value + ")";
    return "NUMBER(" + this.value + ")";
  }
  toJSON() {
    const json = super.toJSON();
    json.value = this.value;
    json.type = this.type;
    json.repr = this.repr;
    return json;
  }
  toSource() {
    return this.repr;
  }
};
var PercentageToken = class extends CSSParserToken {
  constructor() {
    super();
    __publicField(this, "tokenType", "PERCENTAGE");
    __publicField(this, "repr");
    this.repr = "";
  }
  toString() {
    return "PERCENTAGE(" + this.value + ")";
  }
  toJSON() {
    const json = this.constructor.prototype.constructor.prototype.toJSON.call(this);
    json.value = this.value;
    json.repr = this.repr;
    return json;
  }
  toSource() {
    return this.repr + "%";
  }
};
var DimensionToken = class extends CSSParserToken {
  constructor() {
    super();
    __publicField(this, "tokenType", "DIMENSION");
    __publicField(this, "type");
    __publicField(this, "repr");
    __publicField(this, "unit");
    this.type = "integer";
    this.repr = "";
    this.unit = "";
  }
  toString() {
    return "DIM(" + this.value + "," + this.unit + ")";
  }
  toJSON() {
    const json = this.constructor.prototype.constructor.prototype.toJSON.call(this);
    json.value = this.value;
    json.type = this.type;
    json.repr = this.repr;
    json.unit = this.unit;
    return json;
  }
  toSource() {
    const source = this.repr;
    let unit = escapeIdent(this.unit);
    if (unit[0].toLowerCase() === "e" && (unit[1] === "-" || between(unit.charCodeAt(1), 48, 57))) {
      unit = "\\65 " + unit.slice(1, unit.length);
    }
    return source + unit;
  }
};
function escapeIdent(string) {
  string = "" + string;
  let result2 = "";
  const firstcode = string.charCodeAt(0);
  for (let i = 0; i < string.length; i++) {
    const code = string.charCodeAt(i);
    if (code === 0)
      throw new InvalidCharacterError("Invalid character: the input contains U+0000.");
    if (between(code, 1, 31) || code === 127 || i === 0 && between(code, 48, 57) || i === 1 && between(code, 48, 57) && firstcode === 45)
      result2 += "\\" + code.toString(16) + " ";
    else if (code >= 128 || code === 45 || code === 95 || between(code, 48, 57) || between(code, 65, 90) || between(code, 97, 122))
      result2 += string[i];
    else
      result2 += "\\" + string[i];
  }
  return result2;
}
function escapeHash(string) {
  string = "" + string;
  let result2 = "";
  for (let i = 0; i < string.length; i++) {
    const code = string.charCodeAt(i);
    if (code === 0)
      throw new InvalidCharacterError("Invalid character: the input contains U+0000.");
    if (code >= 128 || code === 45 || code === 95 || between(code, 48, 57) || between(code, 65, 90) || between(code, 97, 122))
      result2 += string[i];
    else
      result2 += "\\" + code.toString(16) + " ";
  }
  return result2;
}
function escapeString(string) {
  string = "" + string;
  let result2 = "";
  for (let i = 0; i < string.length; i++) {
    const code = string.charCodeAt(i);
    if (code === 0)
      throw new InvalidCharacterError("Invalid character: the input contains U+0000.");
    if (between(code, 1, 31) || code === 127)
      result2 += "\\" + code.toString(16) + " ";
    else if (code === 34 || code === 92)
      result2 += "\\" + string[i];
    else
      result2 += string[i];
  }
  return result2;
}

// src/content/services/playwright/utils/isomorphic/cssParser.ts
var InvalidSelectorError = class extends Error {
};
function parseCSS(selector, customNames) {
  let tokens;
  try {
    tokens = tokenize(selector);
    if (!(tokens[tokens.length - 1] instanceof EOFToken))
      tokens.push(new EOFToken());
  } catch (e) {
    const newMessage = e.message + ` while parsing css selector "${selector}". Did you mean to CSS.escape it?`;
    const index = (e.stack || "").indexOf(e.message);
    if (index !== -1)
      e.stack = e.stack.substring(0, index) + newMessage + e.stack.substring(index + e.message.length);
    e.message = newMessage;
    throw e;
  }
  const unsupportedToken = tokens.find((token) => {
    return token instanceof AtKeywordToken || token instanceof BadStringToken || token instanceof BadURLToken || token instanceof ColumnToken || token instanceof CDOToken || token instanceof CDCToken || token instanceof SemicolonToken || // TODO: Consider using these for something, e.g. to escape complex strings.
    // For example :xpath{ (//div/bar[@attr="foo"])[2]/baz }
    // Or this way :xpath( {complex-xpath-goes-here("hello")} )
    token instanceof OpenCurlyToken || token instanceof CloseCurlyToken || // TODO: Consider treating these as strings?
    token instanceof URLToken || token instanceof PercentageToken;
  });
  if (unsupportedToken)
    throw new InvalidSelectorError(`Unsupported token "${unsupportedToken.toSource()}" while parsing css selector "${selector}". Did you mean to CSS.escape it?`);
  let pos = 0;
  const names = /* @__PURE__ */ new Set();
  function unexpected() {
    return new InvalidSelectorError(`Unexpected token "${tokens[pos].toSource()}" while parsing css selector "${selector}". Did you mean to CSS.escape it?`);
  }
  function skipWhitespace() {
    while (tokens[pos] instanceof WhitespaceToken)
      pos++;
  }
  function isIdent(p = pos) {
    return tokens[p] instanceof IdentToken;
  }
  function isString(p = pos) {
    return tokens[p] instanceof StringToken;
  }
  function isNumber(p = pos) {
    return tokens[p] instanceof NumberToken;
  }
  function isComma(p = pos) {
    return tokens[p] instanceof CommaToken;
  }
  function isOpenParen(p = pos) {
    return tokens[p] instanceof OpenParenToken;
  }
  function isCloseParen(p = pos) {
    return tokens[p] instanceof CloseParenToken;
  }
  function isFunction2(p = pos) {
    return tokens[p] instanceof FunctionToken;
  }
  function isStar(p = pos) {
    return tokens[p] instanceof DelimToken && tokens[p].value === "*";
  }
  function isEOF(p = pos) {
    return tokens[p] instanceof EOFToken;
  }
  function isClauseCombinator(p = pos) {
    return tokens[p] instanceof DelimToken && [">", "+", "~"].includes(tokens[p].value);
  }
  function isSelectorClauseEnd(p = pos) {
    return isComma(p) || isCloseParen(p) || isEOF(p) || isClauseCombinator(p) || tokens[p] instanceof WhitespaceToken;
  }
  function consumeFunctionArguments() {
    const result3 = [consumeArgument()];
    while (true) {
      skipWhitespace();
      if (!isComma())
        break;
      pos++;
      result3.push(consumeArgument());
    }
    return result3;
  }
  function consumeArgument() {
    skipWhitespace();
    if (isNumber())
      return tokens[pos++].value;
    if (isString())
      return tokens[pos++].value;
    return consumeComplexSelector();
  }
  function consumeComplexSelector() {
    const result3 = { simples: [] };
    skipWhitespace();
    if (isClauseCombinator()) {
      result3.simples.push({ selector: { functions: [{ name: "scope", args: [] }] }, combinator: "" });
    } else {
      result3.simples.push({ selector: consumeSimpleSelector(), combinator: "" });
    }
    while (true) {
      skipWhitespace();
      if (isClauseCombinator()) {
        result3.simples[result3.simples.length - 1].combinator = tokens[pos++].value;
        skipWhitespace();
      } else if (isSelectorClauseEnd()) {
        break;
      }
      result3.simples.push({ combinator: "", selector: consumeSimpleSelector() });
    }
    return result3;
  }
  function consumeSimpleSelector() {
    let rawCSSString = "";
    const functions = [];
    while (!isSelectorClauseEnd()) {
      if (isIdent() || isStar()) {
        rawCSSString += tokens[pos++].toSource();
      } else if (tokens[pos] instanceof HashToken) {
        rawCSSString += tokens[pos++].toSource();
      } else if (tokens[pos] instanceof DelimToken && tokens[pos].value === ".") {
        pos++;
        if (isIdent())
          rawCSSString += "." + tokens[pos++].toSource();
        else
          throw unexpected();
      } else if (tokens[pos] instanceof ColonToken) {
        pos++;
        if (isIdent()) {
          if (!customNames.has(tokens[pos].value.toLowerCase())) {
            rawCSSString += ":" + tokens[pos++].toSource();
          } else {
            const name = tokens[pos++].value.toLowerCase();
            functions.push({ name, args: [] });
            names.add(name);
          }
        } else if (isFunction2()) {
          const name = tokens[pos++].value.toLowerCase();
          if (!customNames.has(name)) {
            rawCSSString += `:${name}(${consumeBuiltinFunctionArguments()})`;
          } else {
            functions.push({ name, args: consumeFunctionArguments() });
            names.add(name);
          }
          skipWhitespace();
          if (!isCloseParen())
            throw unexpected();
          pos++;
        } else {
          throw unexpected();
        }
      } else if (tokens[pos] instanceof OpenSquareToken) {
        rawCSSString += "[";
        pos++;
        while (!(tokens[pos] instanceof CloseSquareToken) && !isEOF())
          rawCSSString += tokens[pos++].toSource();
        if (!(tokens[pos] instanceof CloseSquareToken))
          throw unexpected();
        rawCSSString += "]";
        pos++;
      } else {
        throw unexpected();
      }
    }
    if (!rawCSSString && !functions.length)
      throw unexpected();
    return { css: rawCSSString || void 0, functions };
  }
  function consumeBuiltinFunctionArguments() {
    let s = "";
    let balance = 1;
    while (!isEOF()) {
      if (isOpenParen() || isFunction2())
        balance++;
      if (isCloseParen())
        balance--;
      if (!balance)
        break;
      s += tokens[pos++].toSource();
    }
    return s;
  }
  const result2 = consumeFunctionArguments();
  if (!isEOF())
    throw unexpected();
  if (result2.some((arg) => typeof arg !== "object" || !("simples" in arg)))
    throw new InvalidSelectorError(`Error while parsing css selector "${selector}". Did you mean to CSS.escape it?`);
  return { selector: result2, names: Array.from(names) };
}

// src/content/services/playwright/utils/isomorphic/selectorParser.ts
var kNestedSelectorNames = /* @__PURE__ */ new Set(["internal:has", "internal:has-not", "internal:and", "internal:or", "internal:chain", "left-of", "right-of", "above", "below", "near"]);
var kNestedSelectorNamesWithDistance = /* @__PURE__ */ new Set(["left-of", "right-of", "above", "below", "near"]);
var customCSSNames = /* @__PURE__ */ new Set(["not", "is", "where", "has", "scope", "light", "visible", "text", "text-matches", "text-is", "has-text", "above", "below", "right-of", "left-of", "near", "nth-match"]);
function parseSelector(selector) {
  const parsedStrings = parseSelectorString(selector);
  const parts = [];
  for (const part of parsedStrings.parts) {
    if (part.name === "css" || part.name === "css:light") {
      if (part.name === "css:light")
        part.body = ":light(" + part.body + ")";
      const parsedCSS = parseCSS(part.body, customCSSNames);
      parts.push({
        name: "css",
        body: parsedCSS.selector,
        source: part.body
      });
      continue;
    }
    if (kNestedSelectorNames.has(part.name)) {
      let innerSelector;
      let distance;
      try {
        const unescaped = JSON.parse("[" + part.body + "]");
        if (!Array.isArray(unescaped) || unescaped.length < 1 || unescaped.length > 2 || typeof unescaped[0] !== "string")
          throw new InvalidSelectorError(`Malformed selector: ${part.name}=` + part.body);
        innerSelector = unescaped[0];
        if (unescaped.length === 2) {
          if (typeof unescaped[1] !== "number" || !kNestedSelectorNamesWithDistance.has(part.name))
            throw new InvalidSelectorError(`Malformed selector: ${part.name}=` + part.body);
          distance = unescaped[1];
        }
      } catch (e) {
        throw new InvalidSelectorError(`Malformed selector: ${part.name}=` + part.body);
      }
      const nested = { name: part.name, source: part.body, body: { parsed: parseSelector(innerSelector), distance } };
      const lastFrame = [...nested.body.parsed.parts].reverse().find((part2) => part2.name === "internal:control" && part2.body === "enter-frame");
      const lastFrameIndex = lastFrame ? nested.body.parsed.parts.indexOf(lastFrame) : -1;
      if (lastFrameIndex !== -1 && selectorPartsEqual(nested.body.parsed.parts.slice(0, lastFrameIndex + 1), parts.slice(0, lastFrameIndex + 1)))
        nested.body.parsed.parts.splice(0, lastFrameIndex + 1);
      parts.push(nested);
      continue;
    }
    parts.push(__spreadProps(__spreadValues({}, part), { source: part.body }));
  }
  if (kNestedSelectorNames.has(parts[0].name))
    throw new InvalidSelectorError(`"${parts[0].name}" selector cannot be first`);
  return {
    capture: parsedStrings.capture,
    parts
  };
}
function selectorPartsEqual(list1, list2) {
  return stringifySelector({ parts: list1 }) === stringifySelector({ parts: list2 });
}
function stringifySelector(selector, forceEngineName) {
  if (typeof selector === "string")
    return selector;
  return selector.parts.map((p, i) => {
    let includeEngine = true;
    if (!forceEngineName && i !== selector.capture) {
      if (p.name === "css")
        includeEngine = false;
      else if (p.name === "xpath" && p.source.startsWith("//") || p.source.startsWith(".."))
        includeEngine = false;
    }
    const prefix = includeEngine ? p.name + "=" : "";
    return `${i === selector.capture ? "*" : ""}${prefix}${p.source}`;
  }).join(" >> ");
}
function visitAllSelectorParts(selector, visitor) {
  const visit = (selector2, nested) => {
    for (const part of selector2.parts) {
      visitor(part, nested);
      if (kNestedSelectorNames.has(part.name))
        visit(part.body.parsed, true);
    }
  };
  visit(selector, false);
}
function parseSelectorString(selector) {
  let index = 0;
  let quote;
  let start = 0;
  const result2 = { parts: [] };
  const append = () => {
    const part = selector.substring(start, index).trim();
    const eqIndex = part.indexOf("=");
    let name;
    let body;
    if (eqIndex !== -1 && part.substring(0, eqIndex).trim().match(/^[a-zA-Z_0-9-+:*]+$/)) {
      name = part.substring(0, eqIndex).trim();
      body = part.substring(eqIndex + 1);
    } else if (part.length > 1 && part[0] === '"' && part[part.length - 1] === '"') {
      name = "text";
      body = part;
    } else if (part.length > 1 && part[0] === "'" && part[part.length - 1] === "'") {
      name = "text";
      body = part;
    } else if (/^\(*\/\//.test(part) || part.startsWith("..")) {
      name = "xpath";
      body = part;
    } else {
      name = "css";
      body = part;
    }
    let capture = false;
    if (name[0] === "*") {
      capture = true;
      name = name.substring(1);
    }
    result2.parts.push({ name, body });
    if (capture) {
      if (result2.capture !== void 0)
        throw new InvalidSelectorError(`Only one of the selectors can capture using * modifier`);
      result2.capture = result2.parts.length - 1;
    }
  };
  if (!selector.includes(">>")) {
    index = selector.length;
    append();
    return result2;
  }
  const shouldIgnoreTextSelectorQuote = () => {
    const prefix = selector.substring(start, index);
    const match = prefix.match(/^\s*text\s*=(.*)$/);
    return !!match && !!match[1];
  };
  while (index < selector.length) {
    const c = selector[index];
    if (c === "\\" && index + 1 < selector.length) {
      index += 2;
    } else if (c === quote) {
      quote = void 0;
      index++;
    } else if (!quote && (c === '"' || c === "'" || c === "`") && !shouldIgnoreTextSelectorQuote()) {
      quote = c;
      index++;
    } else if (!quote && c === ">" && selector[index + 1] === ">") {
      append();
      index += 2;
      start = index;
    } else {
      index++;
    }
  }
  append();
  return result2;
}
function parseAttributeSelector(selector, allowUnquotedStrings) {
  let wp = 0;
  let EOL = selector.length === 0;
  const next = () => selector[wp] || "";
  const eat1 = () => {
    const result3 = next();
    ++wp;
    EOL = wp >= selector.length;
    return result3;
  };
  const syntaxError = (stage) => {
    if (EOL)
      throw new InvalidSelectorError(`Unexpected end of selector while parsing selector \`${selector}\``);
    throw new InvalidSelectorError(`Error while parsing selector \`${selector}\` - unexpected symbol "${next()}" at position ${wp}` + (stage ? " during " + stage : ""));
  };
  function skipSpaces() {
    while (!EOL && /\s/.test(next()))
      eat1();
  }
  function isCSSNameChar(char) {
    return char >= "\x80" || char >= "0" && char <= "9" || char >= "A" && char <= "Z" || char >= "a" && char <= "z" || char >= "0" && char <= "9" || char === "_" || char === "-";
  }
  function readIdentifier() {
    let result3 = "";
    skipSpaces();
    while (!EOL && isCSSNameChar(next()))
      result3 += eat1();
    return result3;
  }
  function readQuotedString(quote) {
    let result3 = eat1();
    if (result3 !== quote)
      syntaxError("parsing quoted string");
    while (!EOL && next() !== quote) {
      if (next() === "\\")
        eat1();
      result3 += eat1();
    }
    if (next() !== quote)
      syntaxError("parsing quoted string");
    result3 += eat1();
    return result3;
  }
  function readRegularExpression() {
    if (eat1() !== "/")
      syntaxError("parsing regular expression");
    let source = "";
    let inClass = false;
    while (!EOL) {
      if (next() === "\\") {
        source += eat1();
        if (EOL)
          syntaxError("parsing regular expression");
      } else if (inClass && next() === "]") {
        inClass = false;
      } else if (!inClass && next() === "[") {
        inClass = true;
      } else if (!inClass && next() === "/") {
        break;
      }
      source += eat1();
    }
    if (eat1() !== "/")
      syntaxError("parsing regular expression");
    let flags = "";
    while (!EOL && next().match(/[dgimsuy]/))
      flags += eat1();
    try {
      return new RegExp(source, flags);
    } catch (e) {
      throw new InvalidSelectorError(`Error while parsing selector \`${selector}\`: ${e.message}`);
    }
  }
  function readAttributeToken() {
    let token = "";
    skipSpaces();
    if (next() === `'` || next() === `"`)
      token = readQuotedString(next()).slice(1, -1);
    else
      token = readIdentifier();
    if (!token)
      syntaxError("parsing property path");
    return token;
  }
  function readOperator() {
    skipSpaces();
    let op = "";
    if (!EOL)
      op += eat1();
    if (!EOL && op !== "=")
      op += eat1();
    if (!["=", "*=", "^=", "$=", "|=", "~="].includes(op))
      syntaxError("parsing operator");
    return op;
  }
  function readAttribute() {
    eat1();
    const jsonPath = [];
    jsonPath.push(readAttributeToken());
    skipSpaces();
    while (next() === ".") {
      eat1();
      jsonPath.push(readAttributeToken());
      skipSpaces();
    }
    if (next() === "]") {
      eat1();
      return { name: jsonPath.join("."), jsonPath, op: "<truthy>", value: null, caseSensitive: false };
    }
    const operator = readOperator();
    let value = void 0;
    let caseSensitive = true;
    skipSpaces();
    if (next() === "/") {
      if (operator !== "=")
        throw new InvalidSelectorError(`Error while parsing selector \`${selector}\` - cannot use ${operator} in attribute with regular expression`);
      value = readRegularExpression();
    } else if (next() === `'` || next() === `"`) {
      value = readQuotedString(next()).slice(1, -1);
      skipSpaces();
      if (next() === "i" || next() === "I") {
        caseSensitive = false;
        eat1();
      } else if (next() === "s" || next() === "S") {
        caseSensitive = true;
        eat1();
      }
    } else {
      value = "";
      while (!EOL && (isCSSNameChar(next()) || next() === "+" || next() === "."))
        value += eat1();
      if (value === "true") {
        value = true;
      } else if (value === "false") {
        value = false;
      } else {
        if (!allowUnquotedStrings) {
          value = +value;
          if (Number.isNaN(value))
            syntaxError("parsing attribute value");
        }
      }
    }
    skipSpaces();
    if (next() !== "]")
      syntaxError("parsing attribute value");
    eat1();
    if (operator !== "=" && typeof value !== "string")
      throw new InvalidSelectorError(`Error while parsing selector \`${selector}\` - cannot use ${operator} in attribute with non-string matching value - ${value}`);
    return { name: jsonPath.join("."), jsonPath, op: operator, value, caseSensitive };
  }
  const result2 = {
    name: "",
    attributes: []
  };
  result2.name = readIdentifier();
  skipSpaces();
  while (next() === "[") {
    result2.attributes.push(readAttribute());
    skipSpaces();
  }
  if (!EOL)
    syntaxError(void 0);
  if (!result2.name && !result2.attributes.length)
    throw new InvalidSelectorError(`Error while parsing selector \`${selector}\` - selector cannot be empty`);
  return result2;
}

// src/content/services/playwright/utils/isomorphic/stringUtils.ts
function escapeWithQuotes(text, char = "'") {
  const stringified = JSON.stringify(text);
  const escapedText = stringified.substring(1, stringified.length - 1).replace(/\\"/g, '"');
  if (char === "'")
    return char + escapedText.replace(/[']/g, "\\'") + char;
  if (char === '"')
    return char + escapedText.replace(/["]/g, '\\"') + char;
  if (char === "`")
    return char + escapedText.replace(/[`]/g, "`") + char;
  throw new Error("Invalid escape char");
}
function toTitleCase(name) {
  return name.charAt(0).toUpperCase() + name.substring(1);
}
function toSnakeCase(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z])([A-Z][a-z])/g, "$1_$2").toLowerCase();
}
function cssEscape(s) {
  let result2 = "";
  for (let i = 0; i < s.length; i++)
    result2 += cssEscapeOne(s, i);
  return result2;
}
function quoteCSSAttributeValue(text) {
  return `"${cssEscape(text).replace(/\\ /g, " ")}"`;
}
function cssEscapeOne(s, i) {
  const c = s.charCodeAt(i);
  if (c === 0)
    return "\uFFFD";
  if (c >= 1 && c <= 31 || c >= 48 && c <= 57 && (i === 0 || i === 1 && s.charCodeAt(0) === 45))
    return "\\" + c.toString(16) + " ";
  if (i === 0 && c === 45 && s.length === 1)
    return "\\" + s.charAt(i);
  if (c >= 128 || c === 45 || c === 95 || c >= 48 && c <= 57 || c >= 65 && c <= 90 || c >= 97 && c <= 122)
    return s.charAt(i);
  return "\\" + s.charAt(i);
}
var normalizedWhitespaceCache;
function cacheNormalizedWhitespaces() {
  normalizedWhitespaceCache = /* @__PURE__ */ new Map();
}
function normalizeWhiteSpace(text) {
  let result2 = normalizedWhitespaceCache == null ? void 0 : normalizedWhitespaceCache.get(text);
  if (result2 === void 0) {
    result2 = text.replace(/[\u200b\u00ad]/g, "").trim().replace(/\s+/g, " ");
    normalizedWhitespaceCache == null ? void 0 : normalizedWhitespaceCache.set(text, result2);
  }
  return result2;
}
function normalizeEscapedRegexQuotes(source) {
  return source.replace(/(^|[^\\])(\\\\)*\\(['"`])/g, "$1$2$3");
}
function escapeRegexForSelector(re) {
  if (re.unicode || re.unicodeSets)
    return String(re);
  return String(re).replace(/(^|[^\\])(\\\\)*(["'`])/g, "$1$2\\$3").replace(/>>/g, "\\>\\>");
}
function escapeForTextSelector(text, exact) {
  if (typeof text !== "string")
    return escapeRegexForSelector(text);
  return `${JSON.stringify(text)}${exact ? "s" : "i"}`;
}
function escapeForAttributeSelector(value, exact) {
  if (typeof value !== "string")
    return escapeRegexForSelector(value);
  return `"${value.replace(/\\/g, "\\\\").replace(/["]/g, '\\"')}"${exact ? "s" : "i"}`;
}
function trimString(input, cap, suffix = "") {
  if (input.length <= cap)
    return input;
  const chars = [...input];
  if (chars.length > cap)
    return chars.slice(0, cap - suffix.length).join("") + suffix;
  return chars.join("");
}
function trimStringWithEllipsis(input, cap) {
  return trimString(input, cap, "\u2026");
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\<FUNCTIONS>");
}
function longestCommonSubstring(s1, s2) {
  const n = s1.length;
  const m = s2.length;
  let maxLen = 0;
  let endingIndex = 0;
  const dp = Array(n + 1).fill(null).map(() => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        if (dp[i][j] > maxLen) {
          maxLen = dp[i][j];
          endingIndex = i;
        }
      }
    }
  }
  return s1.slice(endingIndex - maxLen, endingIndex);
}

// src/content/services/playwright/utils/isomorphic/locatorGenerators.ts
function asLocator(lang, selector, isFrameLocator = false) {
  return asLocators(lang, selector, isFrameLocator, 1)[0];
}
function asLocators(lang, selector, isFrameLocator = false, maxOutputSize = 20, preferredQuote) {
  try {
    return innerAsLocators(new generators[lang](preferredQuote), parseSelector(selector), isFrameLocator, maxOutputSize);
  } catch (e) {
    return [selector];
  }
}
function innerAsLocators(factory, parsed, isFrameLocator = false, maxOutputSize = 20) {
  const parts = [...parsed.parts];
  const tokens = [];
  let nextBase = isFrameLocator ? "frame-locator" : "page";
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    const base = nextBase;
    nextBase = "locator";
    if (part.name === "internal:describe")
      continue;
    if (part.name === "nth") {
      if (part.body === "0")
        tokens.push([factory.generateLocator(base, "first", ""), factory.generateLocator(base, "nth", "0")]);
      else if (part.body === "-1")
        tokens.push([factory.generateLocator(base, "last", ""), factory.generateLocator(base, "nth", "-1")]);
      else
        tokens.push([factory.generateLocator(base, "nth", part.body)]);
      continue;
    }
    if (part.name === "visible") {
      tokens.push([factory.generateLocator(base, "visible", part.body), factory.generateLocator(base, "default", `visible=${part.body}`)]);
      continue;
    }
    if (part.name === "internal:text") {
      const { exact, text } = detectExact(part.body);
      tokens.push([factory.generateLocator(base, "text", text, { exact })]);
      continue;
    }
    if (part.name === "internal:has-text") {
      const { exact, text } = detectExact(part.body);
      if (!exact) {
        tokens.push([factory.generateLocator(base, "has-text", text, { exact })]);
        continue;
      }
    }
    if (part.name === "internal:has-not-text") {
      const { exact, text } = detectExact(part.body);
      if (!exact) {
        tokens.push([factory.generateLocator(base, "has-not-text", text, { exact })]);
        continue;
      }
    }
    if (part.name === "internal:has") {
      const inners = innerAsLocators(factory, part.body.parsed, false, maxOutputSize);
      tokens.push(inners.map((inner) => factory.generateLocator(base, "has", inner)));
      continue;
    }
    if (part.name === "internal:has-not") {
      const inners = innerAsLocators(factory, part.body.parsed, false, maxOutputSize);
      tokens.push(inners.map((inner) => factory.generateLocator(base, "hasNot", inner)));
      continue;
    }
    if (part.name === "internal:and") {
      const inners = innerAsLocators(factory, part.body.parsed, false, maxOutputSize);
      tokens.push(inners.map((inner) => factory.generateLocator(base, "and", inner)));
      continue;
    }
    if (part.name === "internal:or") {
      const inners = innerAsLocators(factory, part.body.parsed, false, maxOutputSize);
      tokens.push(inners.map((inner) => factory.generateLocator(base, "or", inner)));
      continue;
    }
    if (part.name === "internal:chain") {
      const inners = innerAsLocators(factory, part.body.parsed, false, maxOutputSize);
      tokens.push(inners.map((inner) => factory.generateLocator(base, "chain", inner)));
      continue;
    }
    if (part.name === "internal:label") {
      const { exact, text } = detectExact(part.body);
      tokens.push([factory.generateLocator(base, "label", text, { exact })]);
      continue;
    }
    if (part.name === "internal:role") {
      const attrSelector = parseAttributeSelector(part.body, true);
      const options = { attrs: [] };
      for (const attr of attrSelector.attributes) {
        if (attr.name === "name") {
          options.exact = attr.caseSensitive;
          options.name = attr.value;
        } else {
          if (attr.name === "level" && typeof attr.value === "string")
            attr.value = +attr.value;
          options.attrs.push({ name: attr.name === "include-hidden" ? "includeHidden" : attr.name, value: attr.value });
        }
      }
      tokens.push([factory.generateLocator(base, "role", attrSelector.name, options)]);
      continue;
    }
    if (part.name === "internal:testid") {
      const attrSelector = parseAttributeSelector(part.body, true);
      const { value } = attrSelector.attributes[0];
      tokens.push([factory.generateLocator(base, "test-id", value)]);
      continue;
    }
    if (part.name === "internal:attr") {
      const attrSelector = parseAttributeSelector(part.body, true);
      const { name, value, caseSensitive } = attrSelector.attributes[0];
      const text = value;
      const exact = !!caseSensitive;
      if (name === "placeholder") {
        tokens.push([factory.generateLocator(base, "placeholder", text, { exact })]);
        continue;
      }
      if (name === "alt") {
        tokens.push([factory.generateLocator(base, "alt", text, { exact })]);
        continue;
      }
      if (name === "title") {
        tokens.push([factory.generateLocator(base, "title", text, { exact })]);
        continue;
      }
    }
    if (part.name === "internal:control" && part.body === "enter-frame") {
      const lastTokens = tokens[tokens.length - 1];
      const lastPart = parts[index - 1];
      const transformed = lastTokens.map((token) => factory.chainLocators([token, factory.generateLocator(base, "frame", "")]));
      if (["xpath", "css"].includes(lastPart.name)) {
        transformed.push(
          factory.generateLocator(base, "frame-locator", stringifySelector({ parts: [lastPart] })),
          factory.generateLocator(base, "frame-locator", stringifySelector({ parts: [lastPart] }, true))
        );
      }
      lastTokens.splice(0, lastTokens.length, ...transformed);
      nextBase = "frame-locator";
      continue;
    }
    const nextPart = parts[index + 1];
    const selectorPart = stringifySelector({ parts: [part] });
    const locatorPart = factory.generateLocator(base, "default", selectorPart);
    if (nextPart && ["internal:has-text", "internal:has-not-text"].includes(nextPart.name)) {
      const { exact, text } = detectExact(nextPart.body);
      if (!exact) {
        const nextLocatorPart = factory.generateLocator("locator", nextPart.name === "internal:has-text" ? "has-text" : "has-not-text", text, { exact });
        const options = {};
        if (nextPart.name === "internal:has-text")
          options.hasText = text;
        else
          options.hasNotText = text;
        const combinedPart = factory.generateLocator(base, "default", selectorPart, options);
        tokens.push([factory.chainLocators([locatorPart, nextLocatorPart]), combinedPart]);
        index++;
        continue;
      }
    }
    let locatorPartWithEngine;
    if (["xpath", "css"].includes(part.name)) {
      const selectorPart2 = stringifySelector(
        { parts: [part] },
        /* forceEngineName */
        true
      );
      locatorPartWithEngine = factory.generateLocator(base, "default", selectorPart2);
    }
    tokens.push([locatorPart, locatorPartWithEngine].filter(Boolean));
  }
  return combineTokens(factory, tokens, maxOutputSize);
}
function combineTokens(factory, tokens, maxOutputSize) {
  const currentTokens = tokens.map(() => "");
  const result2 = [];
  const visit = (index) => {
    if (index === tokens.length) {
      result2.push(factory.chainLocators(currentTokens));
      return result2.length < maxOutputSize;
    }
    for (const taken of tokens[index]) {
      currentTokens[index] = taken;
      if (!visit(index + 1))
        return false;
    }
    return true;
  };
  visit(0);
  return result2;
}
function detectExact(text) {
  let exact = false;
  const match = text.match(/^\/(.*)\/([igm]*)$/);
  if (match)
    return { text: new RegExp(match[1], match[2]) };
  if (text.endsWith('"')) {
    text = JSON.parse(text);
    exact = true;
  } else if (text.endsWith('"s')) {
    text = JSON.parse(text.substring(0, text.length - 1));
    exact = true;
  } else if (text.endsWith('"i')) {
    text = JSON.parse(text.substring(0, text.length - 1));
    exact = false;
  }
  return { exact, text };
}
var JavaScriptLocatorFactory = class {
  constructor(preferredQuote) {
    this.preferredQuote = preferredQuote;
  }
  generateLocator(base, kind, body, options = {}) {
    switch (kind) {
      case "default":
        if (options.hasText !== void 0)
          return `locator(${this.quote(body)}, { hasText: ${this.toHasText(options.hasText)} })`;
        if (options.hasNotText !== void 0)
          return `locator(${this.quote(body)}, { hasNotText: ${this.toHasText(options.hasNotText)} })`;
        return `locator(${this.quote(body)})`;
      case "frame-locator":
        return `frameLocator(${this.quote(body)})`;
      case "frame":
        return `contentFrame()`;
      case "nth":
        return `nth(${body})`;
      case "first":
        return `first()`;
      case "last":
        return `last()`;
      case "visible":
        return `filter({ visible: ${body === "true" ? "true" : "false"} })`;
      case "role":
        const attrs = [];
        if (isRegExp(options.name)) {
          attrs.push(`name: ${this.regexToSourceString(options.name)}`);
        } else if (typeof options.name === "string") {
          attrs.push(`name: ${this.quote(options.name)}`);
          if (options.exact)
            attrs.push(`exact: true`);
        }
        for (const { name, value } of options.attrs)
          attrs.push(`${name}: ${typeof value === "string" ? this.quote(value) : value}`);
        const attrString = attrs.length ? `, { ${attrs.join(", ")} }` : "";
        return `getByRole(${this.quote(body)}${attrString})`;
      case "has-text":
        return `filter({ hasText: ${this.toHasText(body)} })`;
      case "has-not-text":
        return `filter({ hasNotText: ${this.toHasText(body)} })`;
      case "has":
        return `filter({ has: ${body} })`;
      case "hasNot":
        return `filter({ hasNot: ${body} })`;
      case "and":
        return `and(${body})`;
      case "or":
        return `or(${body})`;
      case "chain":
        return `locator(${body})`;
      case "test-id":
        return `getByTestId(${this.toTestIdValue(body)})`;
      case "text":
        return this.toCallWithExact("getByText", body, !!options.exact);
      case "alt":
        return this.toCallWithExact("getByAltText", body, !!options.exact);
      case "placeholder":
        return this.toCallWithExact("getByPlaceholder", body, !!options.exact);
      case "label":
        return this.toCallWithExact("getByLabel", body, !!options.exact);
      case "title":
        return this.toCallWithExact("getByTitle", body, !!options.exact);
      default:
        throw new Error("Unknown selector kind " + kind);
    }
  }
  chainLocators(locators) {
    return locators.join(".");
  }
  regexToSourceString(re) {
    return normalizeEscapedRegexQuotes(String(re));
  }
  toCallWithExact(method, body, exact) {
    if (isRegExp(body))
      return `${method}(${this.regexToSourceString(body)})`;
    return exact ? `${method}(${this.quote(body)}, { exact: true })` : `${method}(${this.quote(body)})`;
  }
  toHasText(body) {
    if (isRegExp(body))
      return this.regexToSourceString(body);
    return this.quote(body);
  }
  toTestIdValue(value) {
    if (isRegExp(value))
      return this.regexToSourceString(value);
    return this.quote(value);
  }
  quote(text) {
    var _a2;
    return escapeWithQuotes(text, (_a2 = this.preferredQuote) != null ? _a2 : "'");
  }
};
var PythonLocatorFactory = class {
  generateLocator(base, kind, body, options = {}) {
    switch (kind) {
      case "default":
        if (options.hasText !== void 0)
          return `locator(${this.quote(body)}, has_text=${this.toHasText(options.hasText)})`;
        if (options.hasNotText !== void 0)
          return `locator(${this.quote(body)}, has_not_text=${this.toHasText(options.hasNotText)})`;
        return `locator(${this.quote(body)})`;
      case "frame-locator":
        return `frame_locator(${this.quote(body)})`;
      case "frame":
        return `content_frame`;
      case "nth":
        return `nth(${body})`;
      case "first":
        return `first`;
      case "last":
        return `last`;
      case "visible":
        return `filter(visible=${body === "true" ? "True" : "False"})`;
      case "role":
        const attrs = [];
        if (isRegExp(options.name)) {
          attrs.push(`name=${this.regexToString(options.name)}`);
        } else if (typeof options.name === "string") {
          attrs.push(`name=${this.quote(options.name)}`);
          if (options.exact)
            attrs.push(`exact=True`);
        }
        for (const { name, value } of options.attrs) {
          let valueString = typeof value === "string" ? this.quote(value) : value;
          if (typeof value === "boolean")
            valueString = value ? "True" : "False";
          attrs.push(`${toSnakeCase(name)}=${valueString}`);
        }
        const attrString = attrs.length ? `, ${attrs.join(", ")}` : "";
        return `get_by_role(${this.quote(body)}${attrString})`;
      case "has-text":
        return `filter(has_text=${this.toHasText(body)})`;
      case "has-not-text":
        return `filter(has_not_text=${this.toHasText(body)})`;
      case "has":
        return `filter(has=${body})`;
      case "hasNot":
        return `filter(has_not=${body})`;
      case "and":
        return `and_(${body})`;
      case "or":
        return `or_(${body})`;
      case "chain":
        return `locator(${body})`;
      case "test-id":
        return `get_by_test_id(${this.toTestIdValue(body)})`;
      case "text":
        return this.toCallWithExact("get_by_text", body, !!options.exact);
      case "alt":
        return this.toCallWithExact("get_by_alt_text", body, !!options.exact);
      case "placeholder":
        return this.toCallWithExact("get_by_placeholder", body, !!options.exact);
      case "label":
        return this.toCallWithExact("get_by_label", body, !!options.exact);
      case "title":
        return this.toCallWithExact("get_by_title", body, !!options.exact);
      default:
        throw new Error("Unknown selector kind " + kind);
    }
  }
  chainLocators(locators) {
    return locators.join(".");
  }
  regexToString(body) {
    const suffix = body.flags.includes("i") ? ", re.IGNORECASE" : "";
    return `re.compile(r"${normalizeEscapedRegexQuotes(body.source).replace(/\\\//, "/").replace(/"/g, '\\"')}"${suffix})`;
  }
  toCallWithExact(method, body, exact) {
    if (isRegExp(body))
      return `${method}(${this.regexToString(body)})`;
    if (exact)
      return `${method}(${this.quote(body)}, exact=True)`;
    return `${method}(${this.quote(body)})`;
  }
  toHasText(body) {
    if (isRegExp(body))
      return this.regexToString(body);
    return `${this.quote(body)}`;
  }
  toTestIdValue(value) {
    if (isRegExp(value))
      return this.regexToString(value);
    return this.quote(value);
  }
  quote(text) {
    return escapeWithQuotes(text, '"');
  }
};
var JavaLocatorFactory = class {
  generateLocator(base, kind, body, options = {}) {
    let clazz;
    switch (base) {
      case "page":
        clazz = "Page";
        break;
      case "frame-locator":
        clazz = "FrameLocator";
        break;
      case "locator":
        clazz = "Locator";
        break;
    }
    switch (kind) {
      case "default":
        if (options.hasText !== void 0)
          return `locator(${this.quote(body)}, new ${clazz}.LocatorOptions().setHasText(${this.toHasText(options.hasText)}))`;
        if (options.hasNotText !== void 0)
          return `locator(${this.quote(body)}, new ${clazz}.LocatorOptions().setHasNotText(${this.toHasText(options.hasNotText)}))`;
        return `locator(${this.quote(body)})`;
      case "frame-locator":
        return `frameLocator(${this.quote(body)})`;
      case "frame":
        return `contentFrame()`;
      case "nth":
        return `nth(${body})`;
      case "first":
        return `first()`;
      case "last":
        return `last()`;
      case "visible":
        return `filter(new ${clazz}.FilterOptions().setVisible(${body === "true" ? "true" : "false"}))`;
      case "role":
        const attrs = [];
        if (isRegExp(options.name)) {
          attrs.push(`.setName(${this.regexToString(options.name)})`);
        } else if (typeof options.name === "string") {
          attrs.push(`.setName(${this.quote(options.name)})`);
          if (options.exact)
            attrs.push(`.setExact(true)`);
        }
        for (const { name, value } of options.attrs)
          attrs.push(`.set${toTitleCase(name)}(${typeof value === "string" ? this.quote(value) : value})`);
        const attrString = attrs.length ? `, new ${clazz}.GetByRoleOptions()${attrs.join("")}` : "";
        return `getByRole(AriaRole.${toSnakeCase(body).toUpperCase()}${attrString})`;
      case "has-text":
        return `filter(new ${clazz}.FilterOptions().setHasText(${this.toHasText(body)}))`;
      case "has-not-text":
        return `filter(new ${clazz}.FilterOptions().setHasNotText(${this.toHasText(body)}))`;
      case "has":
        return `filter(new ${clazz}.FilterOptions().setHas(${body}))`;
      case "hasNot":
        return `filter(new ${clazz}.FilterOptions().setHasNot(${body}))`;
      case "and":
        return `and(${body})`;
      case "or":
        return `or(${body})`;
      case "chain":
        return `locator(${body})`;
      case "test-id":
        return `getByTestId(${this.toTestIdValue(body)})`;
      case "text":
        return this.toCallWithExact(clazz, "getByText", body, !!options.exact);
      case "alt":
        return this.toCallWithExact(clazz, "getByAltText", body, !!options.exact);
      case "placeholder":
        return this.toCallWithExact(clazz, "getByPlaceholder", body, !!options.exact);
      case "label":
        return this.toCallWithExact(clazz, "getByLabel", body, !!options.exact);
      case "title":
        return this.toCallWithExact(clazz, "getByTitle", body, !!options.exact);
      default:
        throw new Error("Unknown selector kind " + kind);
    }
  }
  chainLocators(locators) {
    return locators.join(".");
  }
  regexToString(body) {
    const suffix = body.flags.includes("i") ? ", Pattern.CASE_INSENSITIVE" : "";
    return `Pattern.compile(${this.quote(normalizeEscapedRegexQuotes(body.source))}${suffix})`;
  }
  toCallWithExact(clazz, method, body, exact) {
    if (isRegExp(body))
      return `${method}(${this.regexToString(body)})`;
    if (exact)
      return `${method}(${this.quote(body)}, new ${clazz}.${toTitleCase(method)}Options().setExact(true))`;
    return `${method}(${this.quote(body)})`;
  }
  toHasText(body) {
    if (isRegExp(body))
      return this.regexToString(body);
    return this.quote(body);
  }
  toTestIdValue(value) {
    if (isRegExp(value))
      return this.regexToString(value);
    return this.quote(value);
  }
  quote(text) {
    return escapeWithQuotes(text, '"');
  }
};
var CSharpLocatorFactory = class {
  generateLocator(base, kind, body, options = {}) {
    switch (kind) {
      case "default":
        if (options.hasText !== void 0)
          return `Locator(${this.quote(body)}, new() { ${this.toHasText(options.hasText)} })`;
        if (options.hasNotText !== void 0)
          return `Locator(${this.quote(body)}, new() { ${this.toHasNotText(options.hasNotText)} })`;
        return `Locator(${this.quote(body)})`;
      case "frame-locator":
        return `FrameLocator(${this.quote(body)})`;
      case "frame":
        return `ContentFrame`;
      case "nth":
        return `Nth(${body})`;
      case "first":
        return `First`;
      case "last":
        return `Last`;
      case "visible":
        return `Filter(new() { Visible = ${body === "true" ? "true" : "false"} })`;
      case "role":
        const attrs = [];
        if (isRegExp(options.name)) {
          attrs.push(`NameRegex = ${this.regexToString(options.name)}`);
        } else if (typeof options.name === "string") {
          attrs.push(`Name = ${this.quote(options.name)}`);
          if (options.exact)
            attrs.push(`Exact = true`);
        }
        for (const { name, value } of options.attrs)
          attrs.push(`${toTitleCase(name)} = ${typeof value === "string" ? this.quote(value) : value}`);
        const attrString = attrs.length ? `, new() { ${attrs.join(", ")} }` : "";
        return `GetByRole(AriaRole.${toTitleCase(body)}${attrString})`;
      case "has-text":
        return `Filter(new() { ${this.toHasText(body)} })`;
      case "has-not-text":
        return `Filter(new() { ${this.toHasNotText(body)} })`;
      case "has":
        return `Filter(new() { Has = ${body} })`;
      case "hasNot":
        return `Filter(new() { HasNot = ${body} })`;
      case "and":
        return `And(${body})`;
      case "or":
        return `Or(${body})`;
      case "chain":
        return `Locator(${body})`;
      case "test-id":
        return `GetByTestId(${this.toTestIdValue(body)})`;
      case "text":
        return this.toCallWithExact("GetByText", body, !!options.exact);
      case "alt":
        return this.toCallWithExact("GetByAltText", body, !!options.exact);
      case "placeholder":
        return this.toCallWithExact("GetByPlaceholder", body, !!options.exact);
      case "label":
        return this.toCallWithExact("GetByLabel", body, !!options.exact);
      case "title":
        return this.toCallWithExact("GetByTitle", body, !!options.exact);
      default:
        throw new Error("Unknown selector kind " + kind);
    }
  }
  chainLocators(locators) {
    return locators.join(".");
  }
  regexToString(body) {
    const suffix = body.flags.includes("i") ? ", RegexOptions.IgnoreCase" : "";
    return `new Regex(${this.quote(normalizeEscapedRegexQuotes(body.source))}${suffix})`;
  }
  toCallWithExact(method, body, exact) {
    if (isRegExp(body))
      return `${method}(${this.regexToString(body)})`;
    if (exact)
      return `${method}(${this.quote(body)}, new() { Exact = true })`;
    return `${method}(${this.quote(body)})`;
  }
  toHasText(body) {
    if (isRegExp(body))
      return `HasTextRegex = ${this.regexToString(body)}`;
    return `HasText = ${this.quote(body)}`;
  }
  toTestIdValue(value) {
    if (isRegExp(value))
      return this.regexToString(value);
    return this.quote(value);
  }
  toHasNotText(body) {
    if (isRegExp(body))
      return `HasNotTextRegex = ${this.regexToString(body)}`;
    return `HasNotText = ${this.quote(body)}`;
  }
  quote(text) {
    return escapeWithQuotes(text, '"');
  }
};
var JsonlLocatorFactory = class {
  generateLocator(base, kind, body, options = {}) {
    return JSON.stringify({
      kind,
      body,
      options
    });
  }
  chainLocators(locators) {
    const objects = locators.map((l) => JSON.parse(l));
    for (let i = 0; i < objects.length - 1; ++i)
      objects[i].next = objects[i + 1];
    return JSON.stringify(objects[0]);
  }
};
var generators = {
  javascript: JavaScriptLocatorFactory,
  python: PythonLocatorFactory,
  java: JavaLocatorFactory,
  csharp: CSharpLocatorFactory,
  jsonl: JsonlLocatorFactory
};
function isRegExp(obj) {
  return obj instanceof RegExp;
}

// src/content/services/playwright/injected/src/domUtils.ts
var globalOptions = {};
function setGlobalOptions(options) {
  globalOptions = options;
}
function getGlobalOptions() {
  return globalOptions;
}
function isInsideScope(scope, element) {
  while (element) {
    if (scope.contains(element))
      return true;
    element = enclosingShadowHost(element);
  }
  return false;
}
function parentElementOrShadowHost(element) {
  if (element.parentElement)
    return element.parentElement;
  if (!element.parentNode)
    return;
  if (element.parentNode.nodeType === 11 && element.parentNode.host)
    return element.parentNode.host;
}
function enclosingShadowRootOrDocument(element) {
  let node = element;
  while (node.parentNode)
    node = node.parentNode;
  if (node.nodeType === 11 || node.nodeType === 9)
    return node;
}
function enclosingShadowHost(element) {
  while (element.parentElement)
    element = element.parentElement;
  return parentElementOrShadowHost(element);
}
function closestCrossShadow(element, css, scope) {
  while (element) {
    const closest = element.closest(css);
    if (scope && closest !== scope && (closest == null ? void 0 : closest.contains(scope)))
      return;
    if (closest)
      return closest;
    element = enclosingShadowHost(element);
  }
}
function getElementComputedStyle(element, pseudo) {
  return element.ownerDocument && element.ownerDocument.defaultView ? element.ownerDocument.defaultView.getComputedStyle(element, pseudo) : void 0;
}
function isElementStyleVisibilityVisible(element, style) {
  style = style != null ? style : getElementComputedStyle(element);
  if (!style)
    return true;
  if (Element.prototype.checkVisibility && globalOptions.browserNameForWorkarounds !== "webkit") {
    if (!element.checkVisibility())
      return false;
  } else {
    const detailsOrSummary = element.closest("details,summary");
    if (detailsOrSummary !== element && (detailsOrSummary == null ? void 0 : detailsOrSummary.nodeName) === "DETAILS" && !detailsOrSummary.open)
      return false;
  }
  if (style.visibility !== "visible")
    return false;
  return true;
}
function box(element) {
  const style = getElementComputedStyle(element);
  if (!style)
    return { visible: true };
  if (style.display === "contents") {
    for (let child = element.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 1 && isElementVisible(child))
        return { visible: true, style };
      if (child.nodeType === 3 && isVisibleTextNode(child))
        return { visible: true, style };
    }
    return { visible: false, style };
  }
  if (!isElementStyleVisibilityVisible(element, style))
    return { style, visible: false };
  const rect = element.getBoundingClientRect();
  return { rect, style, visible: rect.width > 0 && rect.height > 0 };
}
function isElementVisible(element) {
  return box(element).visible;
}
function isVisibleTextNode(node) {
  const range = node.ownerDocument.createRange();
  range.selectNode(node);
  const rect = range.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
function elementSafeTagName(element) {
  if (element instanceof HTMLFormElement)
    return "FORM";
  return element.tagName.toUpperCase();
}

// src/content/services/playwright/injected/src/roleUtils.ts
function hasExplicitAccessibleName(e) {
  return e.hasAttribute("aria-label") || e.hasAttribute("aria-labelledby");
}
var kAncestorPreventingLandmark = "article:not([role]), aside:not([role]), main:not([role]), nav:not([role]), section:not([role]), [role=article], [role=complementary], [role=main], [role=navigation], [role=region]";
var kGlobalAriaAttributes = [
  ["aria-atomic", void 0],
  ["aria-busy", void 0],
  ["aria-controls", void 0],
  ["aria-current", void 0],
  ["aria-describedby", void 0],
  ["aria-details", void 0],
  // Global use deprecated in ARIA 1.2
  // ['aria-disabled', undefined],
  ["aria-dropeffect", void 0],
  // Global use deprecated in ARIA 1.2
  // ['aria-errormessage', undefined],
  ["aria-flowto", void 0],
  ["aria-grabbed", void 0],
  // Global use deprecated in ARIA 1.2
  // ['aria-haspopup', undefined],
  ["aria-hidden", void 0],
  // Global use deprecated in ARIA 1.2
  // ['aria-invalid', undefined],
  ["aria-keyshortcuts", void 0],
  [
    "aria-label",
    [
      "caption",
      "code",
      "deletion",
      "emphasis",
      "generic",
      "insertion",
      "paragraph",
      "presentation",
      "strong",
      "subscript",
      "superscript"
    ]
  ],
  [
    "aria-labelledby",
    [
      "caption",
      "code",
      "deletion",
      "emphasis",
      "generic",
      "insertion",
      "paragraph",
      "presentation",
      "strong",
      "subscript",
      "superscript"
    ]
  ],
  ["aria-live", void 0],
  ["aria-owns", void 0],
  ["aria-relevant", void 0],
  ["aria-roledescription", ["generic"]]
];
function hasGlobalAriaAttribute(element, forRole) {
  return kGlobalAriaAttributes.some(([attr, prohibited]) => {
    return !(prohibited == null ? void 0 : prohibited.includes(forRole || "")) && element.hasAttribute(attr);
  });
}
function hasTabIndex(element) {
  return !Number.isNaN(Number(String(element.getAttribute("tabindex"))));
}
function isFocusable(element) {
  return !isNativelyDisabled(element) && (isNativelyFocusable(element) || hasTabIndex(element));
}
function isNativelyFocusable(element) {
  const tagName = elementSafeTagName(element);
  if (["BUTTON", "DETAILS", "SELECT", "TEXTAREA"].includes(tagName)) return true;
  if (tagName === "A" || tagName === "AREA") return element.hasAttribute("href");
  if (tagName === "INPUT") return !element.hidden;
  return false;
}
var kImplicitRoleByTagName = {
  A: (e) => {
    return e.hasAttribute("href") ? "link" : null;
  },
  AREA: (e) => {
    return e.hasAttribute("href") ? "link" : null;
  },
  ARTICLE: () => "article",
  ASIDE: () => "complementary",
  BLOCKQUOTE: () => "blockquote",
  BUTTON: () => "button",
  CAPTION: () => "caption",
  CODE: () => "code",
  DATALIST: () => "listbox",
  DD: () => "definition",
  DEL: () => "deletion",
  DETAILS: () => "group",
  DFN: () => "term",
  DIALOG: () => "dialog",
  DT: () => "term",
  EM: () => "emphasis",
  FIELDSET: () => "group",
  FIGURE: () => "figure",
  FOOTER: (e) => closestCrossShadow(e, kAncestorPreventingLandmark) ? null : "contentinfo",
  FORM: (e) => hasExplicitAccessibleName(e) ? "form" : null,
  H1: () => "heading",
  H2: () => "heading",
  H3: () => "heading",
  H4: () => "heading",
  H5: () => "heading",
  H6: () => "heading",
  HEADER: (e) => closestCrossShadow(e, kAncestorPreventingLandmark) ? null : "banner",
  HR: () => "separator",
  HTML: () => "document",
  IMG: (e) => e.getAttribute("alt") === "" && !e.getAttribute("title") && !hasGlobalAriaAttribute(e) && !hasTabIndex(e) ? "presentation" : "img",
  INPUT: (e) => {
    const type = e.type.toLowerCase();
    if (type === "search") return e.hasAttribute("list") ? "combobox" : "searchbox";
    if (["email", "tel", "text", "url", ""].includes(type)) {
      const list = getIdRefs(e, e.getAttribute("list"))[0];
      return list && elementSafeTagName(list) === "DATALIST" ? "combobox" : "textbox";
    }
    if (type === "hidden") return null;
    if (type === "file" && !getGlobalOptions().inputFileRoleTextbox) return "button";
    return inputTypeToRole[type] || "textbox";
  },
  INS: () => "insertion",
  LI: () => "listitem",
  MAIN: () => "main",
  MARK: () => "mark",
  MATH: () => "math",
  MENU: () => "list",
  METER: () => "meter",
  NAV: () => "navigation",
  OL: () => "list",
  OPTGROUP: () => "group",
  OPTION: () => "option",
  OUTPUT: () => "status",
  P: () => "paragraph",
  PROGRESS: () => "progressbar",
  SECTION: (e) => hasExplicitAccessibleName(e) ? "region" : null,
  SELECT: (e) => e.hasAttribute("multiple") || e.size > 1 ? "listbox" : "combobox",
  STRONG: () => "strong",
  SUB: () => "subscript",
  SUP: () => "superscript",
  // For <svg> we default to Chrome behavior:
  // - Chrome reports 'img'.
  // - Firefox reports 'diagram' that is not in official ARIA spec yet.
  // - Safari reports 'no role', but still computes accessible name.
  SVG: () => "img",
  TABLE: () => "table",
  TBODY: () => "rowgroup",
  TD: (e) => {
    const table = closestCrossShadow(e, "table");
    const role = table ? getExplicitAriaRole(table) : "";
    return role === "grid" || role === "treegrid" ? "gridcell" : "cell";
  },
  TEXTAREA: () => "textbox",
  TFOOT: () => "rowgroup",
  TH: (e) => {
    if (e.getAttribute("scope") === "col") return "columnheader";
    if (e.getAttribute("scope") === "row") return "rowheader";
    const table = closestCrossShadow(e, "table");
    const role = table ? getExplicitAriaRole(table) : "";
    return role === "grid" || role === "treegrid" ? "gridcell" : "cell";
  },
  THEAD: () => "rowgroup",
  TIME: () => "time",
  TR: () => "row",
  UL: () => "list"
};
var kPresentationInheritanceParents = {
  DD: ["DL", "DIV"],
  DIV: ["DL"],
  DT: ["DL", "DIV"],
  LI: ["OL", "UL"],
  TBODY: ["TABLE"],
  TD: ["TR"],
  TFOOT: ["TABLE"],
  TH: ["TR"],
  THEAD: ["TABLE"],
  TR: ["THEAD", "TBODY", "TFOOT", "TABLE"]
};
function getImplicitAriaRole(element) {
  var _a2;
  const implicitRole = ((_a2 = kImplicitRoleByTagName[elementSafeTagName(element)]) == null ? void 0 : _a2.call(kImplicitRoleByTagName, element)) || "";
  if (!implicitRole) return null;
  let ancestor = element;
  while (ancestor) {
    const parent = parentElementOrShadowHost(ancestor);
    const parents = kPresentationInheritanceParents[elementSafeTagName(ancestor)];
    if (!parents || !parent || !parents.includes(elementSafeTagName(parent))) break;
    const parentExplicitRole = getExplicitAriaRole(parent);
    if ((parentExplicitRole === "none" || parentExplicitRole === "presentation") && !hasPresentationConflictResolution(parent, parentExplicitRole))
      return parentExplicitRole;
    ancestor = parent;
  }
  return implicitRole;
}
var validRoles = [
  "alert",
  "alertdialog",
  "application",
  "article",
  "banner",
  "blockquote",
  "button",
  "caption",
  "cell",
  "checkbox",
  "code",
  "columnheader",
  "combobox",
  "complementary",
  "contentinfo",
  "definition",
  "deletion",
  "dialog",
  "directory",
  "document",
  "emphasis",
  "feed",
  "figure",
  "form",
  "generic",
  "grid",
  "gridcell",
  "group",
  "heading",
  "img",
  "insertion",
  "link",
  "list",
  "listbox",
  "listitem",
  "log",
  "main",
  "mark",
  "marquee",
  "math",
  "meter",
  "menu",
  "menubar",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "navigation",
  "none",
  "note",
  "option",
  "paragraph",
  "presentation",
  "progressbar",
  "radio",
  "radiogroup",
  "region",
  "row",
  "rowgroup",
  "rowheader",
  "scrollbar",
  "search",
  "searchbox",
  "separator",
  "slider",
  "spinbutton",
  "status",
  "strong",
  "subscript",
  "superscript",
  "switch",
  "tab",
  "table",
  "tablist",
  "tabpanel",
  "term",
  "textbox",
  "time",
  "timer",
  "toolbar",
  "tooltip",
  "tree",
  "treegrid",
  "treeitem"
];
function getExplicitAriaRole(element) {
  const roles = (element.getAttribute("role") || "").split(" ").map((role) => role.trim());
  return roles.find((role) => validRoles.includes(role)) || null;
}
function hasPresentationConflictResolution(element, role) {
  return hasGlobalAriaAttribute(element, role) || isFocusable(element);
}
function getAriaRole(element) {
  const explicitRole = getExplicitAriaRole(element);
  if (!explicitRole) return getImplicitAriaRole(element);
  if (explicitRole === "none" || explicitRole === "presentation") {
    const implicitRole = getImplicitAriaRole(element);
    if (hasPresentationConflictResolution(element, implicitRole)) return implicitRole;
  }
  return explicitRole;
}
function getAriaBoolean(attr) {
  return attr === null ? void 0 : attr.toLowerCase() === "true";
}
function isElementIgnoredForAria(element) {
  return ["STYLE", "SCRIPT", "NOSCRIPT", "TEMPLATE"].includes(elementSafeTagName(element));
}
function isElementHiddenForAria(element) {
  if (isElementIgnoredForAria(element)) return true;
  const style = getElementComputedStyle(element);
  const isSlot = element.nodeName === "SLOT";
  if ((style == null ? void 0 : style.display) === "contents" && !isSlot) {
    for (let child = element.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 1 && !isElementHiddenForAria(child)) return false;
      if (child.nodeType === 3 && isVisibleTextNode(child)) return false;
    }
    return true;
  }
  const isOptionInsideSelect = element.nodeName === "OPTION" && !!element.closest("select");
  if (!isOptionInsideSelect && !isSlot && !isElementStyleVisibilityVisible(element, style)) return true;
  return belongsToDisplayNoneOrAriaHiddenOrNonSlotted(element);
}
function belongsToDisplayNoneOrAriaHiddenOrNonSlotted(element) {
  let hidden = cacheIsHidden == null ? void 0 : cacheIsHidden.get(element);
  if (hidden === void 0) {
    hidden = false;
    if (element.parentElement && element.parentElement.shadowRoot && !element.assignedSlot) hidden = true;
    if (!hidden) {
      const style = getElementComputedStyle(element);
      hidden = !style || style.display === "none" || getAriaBoolean(element.getAttribute("aria-hidden")) === true;
    }
    if (!hidden) {
      const parent = parentElementOrShadowHost(element);
      if (parent) hidden = belongsToDisplayNoneOrAriaHiddenOrNonSlotted(parent);
    }
    cacheIsHidden == null ? void 0 : cacheIsHidden.set(element, hidden);
  }
  return hidden;
}
function getIdRefs(element, ref) {
  if (!ref) return [];
  const root = enclosingShadowRootOrDocument(element);
  if (!root) return [];
  try {
    const ids = ref.split(" ").filter((id) => !!id);
    const result2 = [];
    for (const id of ids) {
      const firstElement = root.querySelector("#" + CSS.escape(id));
      if (firstElement && !result2.includes(firstElement)) result2.push(firstElement);
    }
    return result2;
  } catch (e) {
    return [];
  }
}
function trimFlatString(s) {
  return s.trim();
}
function asFlatString(s) {
  return s.split("\xA0").map(
    (chunk) => chunk.replace(/\r\n/g, "\n").replace(/[\u200b\u00ad]/g, "").replace(/\s\s*/g, " ")
  ).join("\xA0").trim();
}
function queryInAriaOwned(element, selector) {
  const result2 = [...element.querySelectorAll(selector)];
  for (const owned of getIdRefs(element, element.getAttribute("aria-owns"))) {
    if (owned.matches(selector)) result2.push(owned);
    result2.push(...owned.querySelectorAll(selector));
  }
  return result2;
}
function getCSSContent(element, pseudo) {
  const cache = pseudo === "::before" ? cachePseudoContentBefore : pseudo === "::after" ? cachePseudoContentAfter : cachePseudoContent;
  if (cache == null ? void 0 : cache.has(element)) return cache == null ? void 0 : cache.get(element);
  const style = getElementComputedStyle(element, pseudo);
  let content;
  if (style && style.display !== "none" && style.visibility !== "hidden") {
    content = parseCSSContentPropertyAsString(element, style.content, !!pseudo);
  }
  if (pseudo && content !== void 0) {
    const display = (style == null ? void 0 : style.display) || "inline";
    if (display !== "inline") content = " " + content + " ";
  }
  if (cache) cache.set(element, content);
  return content;
}
function parseCSSContentPropertyAsString(element, content, isPseudo) {
  if (!content || content === "none" || content === "normal") {
    return;
  }
  try {
    let tokens = tokenize(content).filter((token) => !(token instanceof WhitespaceToken));
    const delimIndex = tokens.findIndex((token) => token instanceof DelimToken && token.value === "/");
    if (delimIndex !== -1) {
      tokens = tokens.slice(delimIndex + 1);
    } else if (!isPseudo) {
      return;
    }
    const accumulated = [];
    let index = 0;
    while (index < tokens.length) {
      if (tokens[index] instanceof StringToken) {
        accumulated.push(tokens[index].value);
        index++;
      } else if (index + 2 < tokens.length && tokens[index] instanceof FunctionToken && tokens[index].value === "attr" && tokens[index + 1] instanceof IdentToken && tokens[index + 2] instanceof CloseParenToken) {
        const attrName = tokens[index + 1].value;
        accumulated.push(element.getAttribute(attrName) || "");
        index += 3;
      } else {
        return;
      }
    }
    return accumulated.join("");
  } catch (e) {
  }
}
function getAriaLabelledByElements(element) {
  const ref = element.getAttribute("aria-labelledby");
  if (ref === null) return null;
  const refs = getIdRefs(element, ref);
  return refs.length ? refs : null;
}
function allowsNameFromContent(role, targetDescendant) {
  const alwaysAllowsNameFromContent = [
    "button",
    "cell",
    "checkbox",
    "columnheader",
    "gridcell",
    "heading",
    "link",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "radio",
    "row",
    "rowheader",
    "switch",
    "tab",
    "tooltip",
    "treeitem"
  ].includes(role);
  const descendantAllowsNameFromContent = targetDescendant && [
    "",
    "caption",
    "code",
    "contentinfo",
    "definition",
    "deletion",
    "emphasis",
    "insertion",
    "list",
    "listitem",
    "mark",
    "none",
    "paragraph",
    "presentation",
    "region",
    "row",
    "rowgroup",
    "section",
    "strong",
    "subscript",
    "superscript",
    "table",
    "term",
    "time"
  ].includes(role);
  return alwaysAllowsNameFromContent || descendantAllowsNameFromContent;
}
function getElementAccessibleName(element, includeHidden) {
  const cache = includeHidden ? cacheAccessibleNameHidden : cacheAccessibleName;
  let accessibleName = cache == null ? void 0 : cache.get(element);
  if (accessibleName === void 0) {
    accessibleName = "";
    const elementProhibitsNaming = [
      "caption",
      "code",
      "definition",
      "deletion",
      "emphasis",
      "generic",
      "insertion",
      "mark",
      "paragraph",
      "presentation",
      "strong",
      "subscript",
      "suggestion",
      "superscript",
      "term",
      "time"
    ].includes(getAriaRole(element) || "");
    if (!elementProhibitsNaming) {
      accessibleName = asFlatString(
        getTextAlternativeInternal(element, {
          includeHidden,
          visitedElements: /* @__PURE__ */ new Set(),
          embeddedInTargetElement: "self"
        })
      );
    }
    cache == null ? void 0 : cache.set(element, accessibleName);
  }
  return accessibleName;
}
function getElementAccessibleDescription(element, includeHidden) {
  const cache = includeHidden ? cacheAccessibleDescriptionHidden : cacheAccessibleDescription;
  let accessibleDescription = cache == null ? void 0 : cache.get(element);
  if (accessibleDescription === void 0) {
    accessibleDescription = "";
    if (element.hasAttribute("aria-describedby")) {
      const describedBy = getIdRefs(element, element.getAttribute("aria-describedby"));
      accessibleDescription = asFlatString(
        describedBy.map(
          (ref) => getTextAlternativeInternal(ref, {
            includeHidden,
            visitedElements: /* @__PURE__ */ new Set(),
            embeddedInDescribedBy: { element: ref, hidden: isElementHiddenForAria(ref) }
          })
        ).join(" ")
      );
    } else if (element.hasAttribute("aria-description")) {
      accessibleDescription = asFlatString(element.getAttribute("aria-description") || "");
    } else {
      accessibleDescription = asFlatString(element.getAttribute("title") || "");
    }
    cache == null ? void 0 : cache.set(element, accessibleDescription);
  }
  return accessibleDescription;
}
var kAriaInvalidRoles = [
  "application",
  "checkbox",
  "combobox",
  "gridcell",
  "listbox",
  "radiogroup",
  "slider",
  "spinbutton",
  "textbox",
  "tree",
  "columnheader",
  "rowheader",
  "searchbox",
  "switch",
  "treegrid"
];
function getAriaInvalid(element) {
  const role = getAriaRole(element) || "";
  if (!role || !kAriaInvalidRoles.includes(role)) return "false";
  const ariaInvalid = element.getAttribute("aria-invalid");
  if (!ariaInvalid || ariaInvalid.trim() === "" || ariaInvalid.toLocaleLowerCase() === "false") return "false";
  if (ariaInvalid === "true" || ariaInvalid === "grammar" || ariaInvalid === "spelling") return ariaInvalid;
  return "true";
}
function getValidityInvalid(element) {
  if ("validity" in element) {
    const validity = element.validity;
    return (validity == null ? void 0 : validity.valid) === false;
  }
  return false;
}
function getElementAccessibleErrorMessage(element) {
  const cache = cacheAccessibleErrorMessage;
  let accessibleErrorMessage = cacheAccessibleErrorMessage == null ? void 0 : cacheAccessibleErrorMessage.get(element);
  if (accessibleErrorMessage === void 0) {
    accessibleErrorMessage = "";
    const isAriaInvalid = getAriaInvalid(element) !== "false";
    const isValidityInvalid = getValidityInvalid(element);
    if (isAriaInvalid || isValidityInvalid) {
      const errorMessageId = element.getAttribute("aria-errormessage");
      const errorMessages = getIdRefs(element, errorMessageId);
      const parts = errorMessages.map(
        (errorMessage) => asFlatString(
          getTextAlternativeInternal(errorMessage, {
            visitedElements: /* @__PURE__ */ new Set(),
            embeddedInDescribedBy: { element: errorMessage, hidden: isElementHiddenForAria(errorMessage) }
          })
        )
      );
      accessibleErrorMessage = parts.join(" ").trim();
    }
    cache == null ? void 0 : cache.set(element, accessibleErrorMessage);
  }
  return accessibleErrorMessage;
}
function getTextAlternativeInternal(element, options) {
  var _a2, _b, _c, _d;
  if (options.visitedElements.has(element)) return "";
  const childOptions = __spreadProps(__spreadValues({}, options), {
    embeddedInTargetElement: options.embeddedInTargetElement === "self" ? "descendant" : options.embeddedInTargetElement
  });
  if (!options.includeHidden) {
    const isEmbeddedInHiddenReferenceTraversal = !!((_a2 = options.embeddedInLabelledBy) == null ? void 0 : _a2.hidden) || !!((_b = options.embeddedInDescribedBy) == null ? void 0 : _b.hidden) || !!((_c = options.embeddedInNativeTextAlternative) == null ? void 0 : _c.hidden) || !!((_d = options.embeddedInLabel) == null ? void 0 : _d.hidden);
    if (isElementIgnoredForAria(element) || !isEmbeddedInHiddenReferenceTraversal && isElementHiddenForAria(element)) {
      options.visitedElements.add(element);
      return "";
    }
  }
  const labelledBy = getAriaLabelledByElements(element);
  if (!options.embeddedInLabelledBy) {
    const accessibleName = (labelledBy || []).map(
      (ref) => getTextAlternativeInternal(ref, __spreadProps(__spreadValues({}, options), {
        embeddedInLabelledBy: { element: ref, hidden: isElementHiddenForAria(ref) },
        embeddedInDescribedBy: void 0,
        embeddedInTargetElement: void 0,
        embeddedInLabel: void 0,
        embeddedInNativeTextAlternative: void 0
      }))
    ).join(" ");
    if (accessibleName) return accessibleName;
  }
  const role = getAriaRole(element) || "";
  const tagName = elementSafeTagName(element);
  if (!!options.embeddedInLabel || !!options.embeddedInLabelledBy || options.embeddedInTargetElement === "descendant") {
    const isOwnLabel = [
      ...element.labels || []
    ].includes(element);
    const isOwnLabelledBy = (labelledBy || []).includes(element);
    if (!isOwnLabel && !isOwnLabelledBy) {
      if (role === "textbox") {
        options.visitedElements.add(element);
        if (tagName === "INPUT" || tagName === "TEXTAREA")
          return element.value;
        return element.textContent || "";
      }
      if (["combobox", "listbox"].includes(role)) {
        options.visitedElements.add(element);
        let selectedOptions;
        if (tagName === "SELECT") {
          selectedOptions = [...element.selectedOptions];
          if (!selectedOptions.length && element.options.length)
            selectedOptions.push(element.options[0]);
        } else {
          const listbox = role === "combobox" ? queryInAriaOwned(element, "*").find((e) => getAriaRole(e) === "listbox") : element;
          selectedOptions = listbox ? queryInAriaOwned(listbox, '[aria-selected="true"]').filter((e) => getAriaRole(e) === "option") : [];
        }
        if (!selectedOptions.length && tagName === "INPUT") {
          return element.value;
        }
        return selectedOptions.map((option) => getTextAlternativeInternal(option, childOptions)).join(" ");
      }
      if (["progressbar", "scrollbar", "slider", "spinbutton", "meter"].includes(role)) {
        options.visitedElements.add(element);
        if (element.hasAttribute("aria-valuetext")) return element.getAttribute("aria-valuetext") || "";
        if (element.hasAttribute("aria-valuenow")) return element.getAttribute("aria-valuenow") || "";
        return element.getAttribute("value") || "";
      }
      if (["menu"].includes(role)) {
        options.visitedElements.add(element);
        return "";
      }
    }
  }
  const ariaLabel = element.getAttribute("aria-label") || "";
  if (trimFlatString(ariaLabel)) {
    options.visitedElements.add(element);
    return ariaLabel;
  }
  if (!["presentation", "none"].includes(role)) {
    if (tagName === "INPUT" && ["button", "submit", "reset"].includes(element.type)) {
      options.visitedElements.add(element);
      const value = element.value || "";
      if (trimFlatString(value)) return value;
      if (element.type === "submit") return "Submit";
      if (element.type === "reset") return "Reset";
      const title = element.getAttribute("title") || "";
      return title;
    }
    if (!getGlobalOptions().inputFileRoleTextbox && tagName === "INPUT" && element.type === "file") {
      options.visitedElements.add(element);
      const labels = element.labels || [];
      if (labels.length && !options.embeddedInLabelledBy) return getAccessibleNameFromAssociatedLabels(labels, options);
      return "Choose File";
    }
    if (tagName === "INPUT" && element.type === "image") {
      options.visitedElements.add(element);
      const labels = element.labels || [];
      if (labels.length && !options.embeddedInLabelledBy) return getAccessibleNameFromAssociatedLabels(labels, options);
      const alt = element.getAttribute("alt") || "";
      if (trimFlatString(alt)) return alt;
      const title = element.getAttribute("title") || "";
      if (trimFlatString(title)) return title;
      return "Submit";
    }
    if (!labelledBy && tagName === "BUTTON") {
      options.visitedElements.add(element);
      const labels = element.labels || [];
      if (labels.length) return getAccessibleNameFromAssociatedLabels(labels, options);
    }
    if (!labelledBy && tagName === "OUTPUT") {
      options.visitedElements.add(element);
      const labels = element.labels || [];
      if (labels.length) return getAccessibleNameFromAssociatedLabels(labels, options);
      return element.getAttribute("title") || "";
    }
    if (!labelledBy && (tagName === "TEXTAREA" || tagName === "SELECT" || tagName === "INPUT")) {
      options.visitedElements.add(element);
      const labels = element.labels || [];
      if (labels.length) return getAccessibleNameFromAssociatedLabels(labels, options);
      const usePlaceholder = tagName === "INPUT" && ["text", "password", "search", "tel", "email", "url"].includes(element.type) || tagName === "TEXTAREA";
      const placeholder = element.getAttribute("placeholder") || "";
      const title = element.getAttribute("title") || "";
      if (!usePlaceholder || title) return title;
      return placeholder;
    }
    if (!labelledBy && tagName === "FIELDSET") {
      options.visitedElements.add(element);
      for (let child = element.firstElementChild; child; child = child.nextElementSibling) {
        if (elementSafeTagName(child) === "LEGEND") {
          return getTextAlternativeInternal(child, __spreadProps(__spreadValues({}, childOptions), {
            embeddedInNativeTextAlternative: { element: child, hidden: isElementHiddenForAria(child) }
          }));
        }
      }
      const title = element.getAttribute("title") || "";
      return title;
    }
    if (!labelledBy && tagName === "FIGURE") {
      options.visitedElements.add(element);
      for (let child = element.firstElementChild; child; child = child.nextElementSibling) {
        if (elementSafeTagName(child) === "FIGCAPTION") {
          return getTextAlternativeInternal(child, __spreadProps(__spreadValues({}, childOptions), {
            embeddedInNativeTextAlternative: { element: child, hidden: isElementHiddenForAria(child) }
          }));
        }
      }
      const title = element.getAttribute("title") || "";
      return title;
    }
    if (tagName === "IMG") {
      options.visitedElements.add(element);
      const alt = element.getAttribute("alt") || "";
      if (trimFlatString(alt)) return alt;
      const title = element.getAttribute("title") || "";
      return title;
    }
    if (tagName === "TABLE") {
      options.visitedElements.add(element);
      for (let child = element.firstElementChild; child; child = child.nextElementSibling) {
        if (elementSafeTagName(child) === "CAPTION") {
          return getTextAlternativeInternal(child, __spreadProps(__spreadValues({}, childOptions), {
            embeddedInNativeTextAlternative: { element: child, hidden: isElementHiddenForAria(child) }
          }));
        }
      }
      const summary = element.getAttribute("summary") || "";
      if (summary) return summary;
    }
    if (tagName === "AREA") {
      options.visitedElements.add(element);
      const alt = element.getAttribute("alt") || "";
      if (trimFlatString(alt)) return alt;
      const title = element.getAttribute("title") || "";
      return title;
    }
    if (tagName === "SVG" || element.ownerSVGElement) {
      options.visitedElements.add(element);
      for (let child = element.firstElementChild; child; child = child.nextElementSibling) {
        if (elementSafeTagName(child) === "TITLE" && child.ownerSVGElement) {
          return getTextAlternativeInternal(child, __spreadProps(__spreadValues({}, childOptions), {
            embeddedInLabelledBy: { element: child, hidden: isElementHiddenForAria(child) }
          }));
        }
      }
    }
    if (element.ownerSVGElement && tagName === "A") {
      const title = element.getAttribute("xlink:title") || "";
      if (trimFlatString(title)) {
        options.visitedElements.add(element);
        return title;
      }
    }
  }
  const shouldNameFromContentForSummary = tagName === "SUMMARY" && !["presentation", "none"].includes(role);
  if (allowsNameFromContent(role, options.embeddedInTargetElement === "descendant") || shouldNameFromContentForSummary || !!options.embeddedInLabelledBy || !!options.embeddedInDescribedBy || !!options.embeddedInLabel || !!options.embeddedInNativeTextAlternative) {
    options.visitedElements.add(element);
    const accessibleName = innerAccumulatedElementText(element, childOptions);
    const maybeTrimmedAccessibleName = options.embeddedInTargetElement === "self" ? trimFlatString(accessibleName) : accessibleName;
    if (maybeTrimmedAccessibleName) return accessibleName;
  }
  if (!["presentation", "none"].includes(role) || tagName === "IFRAME") {
    options.visitedElements.add(element);
    const title = element.getAttribute("title") || "";
    if (trimFlatString(title)) return title;
  }
  options.visitedElements.add(element);
  return "";
}
function innerAccumulatedElementText(element, options) {
  const tokens = [];
  const visit = (node, skipSlotted) => {
    var _a2;
    if (skipSlotted && node.assignedSlot) return;
    if (node.nodeType === 1) {
      const display = ((_a2 = getElementComputedStyle(node)) == null ? void 0 : _a2.display) || "inline";
      let token = getTextAlternativeInternal(node, options);
      if (display !== "inline" || node.nodeName === "BR") token = " " + token + " ";
      tokens.push(token);
    } else if (node.nodeType === 3) {
      tokens.push(node.textContent || "");
    }
  };
  tokens.push(getCSSContent(element, "::before") || "");
  const content = getCSSContent(element);
  if (content !== void 0) {
    tokens.push(content);
  } else {
    const assignedNodes = element.nodeName === "SLOT" ? element.assignedNodes() : [];
    if (assignedNodes.length) {
      for (const child of assignedNodes) visit(child, false);
    } else {
      for (let child = element.firstChild; child; child = child.nextSibling) visit(child, true);
      if (element.shadowRoot) {
        for (let child = element.shadowRoot.firstChild; child; child = child.nextSibling) visit(child, true);
      }
      for (const owned of getIdRefs(element, element.getAttribute("aria-owns"))) visit(owned, true);
    }
  }
  tokens.push(getCSSContent(element, "::after") || "");
  return tokens.join("");
}
var kAriaSelectedRoles = ["gridcell", "option", "row", "tab", "rowheader", "columnheader", "treeitem"];
function getAriaSelected(element) {
  if (elementSafeTagName(element) === "OPTION") return element.selected;
  if (kAriaSelectedRoles.includes(getAriaRole(element) || ""))
    return getAriaBoolean(element.getAttribute("aria-selected")) === true;
  return false;
}
var kAriaCheckedRoles = [
  "checkbox",
  "menuitemcheckbox",
  "option",
  "radio",
  "switch",
  "menuitemradio",
  "treeitem"
];
function getAriaChecked(element) {
  const result2 = getChecked(element, true);
  return result2 === "error" ? false : result2;
}
function getCheckedAllowMixed(element) {
  return getChecked(element, true);
}
function getCheckedWithoutMixed(element) {
  const result2 = getChecked(element, false);
  return result2;
}
function getChecked(element, allowMixed) {
  const tagName = elementSafeTagName(element);
  if (allowMixed && tagName === "INPUT" && element.indeterminate) return "mixed";
  if (tagName === "INPUT" && ["checkbox", "radio"].includes(element.type))
    return element.checked;
  if (kAriaCheckedRoles.includes(getAriaRole(element) || "")) {
    const checked = element.getAttribute("aria-checked");
    if (checked === "true") return true;
    if (allowMixed && checked === "mixed") return "mixed";
    return false;
  }
  return "error";
}
var kAriaReadonlyRoles = [
  "checkbox",
  "combobox",
  "grid",
  "gridcell",
  "listbox",
  "radiogroup",
  "slider",
  "spinbutton",
  "textbox",
  "columnheader",
  "rowheader",
  "searchbox",
  "switch",
  "treegrid"
];
function getReadonly(element) {
  const tagName = elementSafeTagName(element);
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tagName)) return element.hasAttribute("readonly");
  if (kAriaReadonlyRoles.includes(getAriaRole(element) || "")) return element.getAttribute("aria-readonly") === "true";
  if (element.isContentEditable) return false;
  return "error";
}
var kAriaPressedRoles = ["button"];
function getAriaPressed(element) {
  if (kAriaPressedRoles.includes(getAriaRole(element) || "")) {
    const pressed = element.getAttribute("aria-pressed");
    if (pressed === "true") return true;
    if (pressed === "mixed") return "mixed";
  }
  return false;
}
var kAriaExpandedRoles = [
  "application",
  "button",
  "checkbox",
  "combobox",
  "gridcell",
  "link",
  "listbox",
  "menuitem",
  "row",
  "rowheader",
  "tab",
  "treeitem",
  "columnheader",
  "menuitemcheckbox",
  "menuitemradio",
  "rowheader",
  "switch"
];
function getAriaExpanded(element) {
  if (elementSafeTagName(element) === "DETAILS") return element.open;
  if (kAriaExpandedRoles.includes(getAriaRole(element) || "")) {
    const expanded = element.getAttribute("aria-expanded");
    if (expanded === null) return void 0;
    if (expanded === "true") return true;
    return false;
  }
  return void 0;
}
var kAriaLevelRoles = ["heading", "listitem", "row", "treeitem"];
function getAriaLevel(element) {
  const native = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 }[elementSafeTagName(element)];
  if (native) return native;
  if (kAriaLevelRoles.includes(getAriaRole(element) || "")) {
    const attr = element.getAttribute("aria-level");
    const value = attr === null ? Number.NaN : Number(attr);
    if (Number.isInteger(value) && value >= 1) return value;
  }
  return 0;
}
var kAriaDisabledRoles = [
  "application",
  "button",
  "composite",
  "gridcell",
  "group",
  "input",
  "link",
  "menuitem",
  "scrollbar",
  "separator",
  "tab",
  "checkbox",
  "columnheader",
  "combobox",
  "grid",
  "listbox",
  "menu",
  "menubar",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "radiogroup",
  "row",
  "rowheader",
  "searchbox",
  "select",
  "slider",
  "spinbutton",
  "switch",
  "tablist",
  "textbox",
  "toolbar",
  "tree",
  "treegrid",
  "treeitem"
];
function getAriaDisabled(element) {
  return isNativelyDisabled(element) || hasExplicitAriaDisabled(element);
}
function isNativelyDisabled(element) {
  const isNativeFormControl = ["BUTTON", "INPUT", "SELECT", "TEXTAREA", "OPTION", "OPTGROUP"].includes(element.tagName);
  return isNativeFormControl && (element.hasAttribute("disabled") || belongsToDisabledFieldSet(element));
}
function belongsToDisabledFieldSet(element) {
  const fieldSetElement = element == null ? void 0 : element.closest("FIELDSET[DISABLED]");
  if (!fieldSetElement) return false;
  const legendElement = fieldSetElement.querySelector(":scope > LEGEND");
  return !legendElement || !legendElement.contains(element);
}
function hasExplicitAriaDisabled(element, isAncestor = false) {
  if (!element) return false;
  if (isAncestor || kAriaDisabledRoles.includes(getAriaRole(element) || "")) {
    const attribute = (element.getAttribute("aria-disabled") || "").toLowerCase();
    if (attribute === "true") return true;
    if (attribute === "false") return false;
    return hasExplicitAriaDisabled(parentElementOrShadowHost(element), true);
  }
  return false;
}
function getAccessibleNameFromAssociatedLabels(labels, options) {
  return [...labels].map(
    (label) => getTextAlternativeInternal(label, __spreadProps(__spreadValues({}, options), {
      embeddedInLabel: { element: label, hidden: isElementHiddenForAria(label) },
      embeddedInNativeTextAlternative: void 0,
      embeddedInLabelledBy: void 0,
      embeddedInDescribedBy: void 0,
      embeddedInTargetElement: void 0
    }))
  ).filter((accessibleName) => !!accessibleName).join(" ");
}
function receivesPointerEvents(element) {
  const cache = cachePointerEvents;
  let e = element;
  let result2;
  const parents = [];
  for (; e; e = parentElementOrShadowHost(e)) {
    const cached = cache.get(e);
    if (cached !== void 0) {
      result2 = cached;
      break;
    }
    parents.push(e);
    const style = getElementComputedStyle(e);
    if (!style) {
      result2 = true;
      break;
    }
    const value = style.pointerEvents;
    if (value) {
      result2 = value !== "none";
      break;
    }
  }
  if (result2 === void 0) result2 = true;
  for (const parent of parents) cache.set(parent, result2);
  return result2;
}
var cacheAccessibleName;
var cacheAccessibleNameHidden;
var cacheAccessibleDescription;
var cacheAccessibleDescriptionHidden;
var cacheAccessibleErrorMessage;
var cacheIsHidden;
var cachePseudoContent;
var cachePseudoContentBefore;
var cachePseudoContentAfter;
var cachePointerEvents;
var cachesCounter = 0;
function beginAriaCaches() {
  ++cachesCounter;
  cacheAccessibleName != null ? cacheAccessibleName : cacheAccessibleName = /* @__PURE__ */ new Map();
  cacheAccessibleNameHidden != null ? cacheAccessibleNameHidden : cacheAccessibleNameHidden = /* @__PURE__ */ new Map();
  cacheAccessibleDescription != null ? cacheAccessibleDescription : cacheAccessibleDescription = /* @__PURE__ */ new Map();
  cacheAccessibleDescriptionHidden != null ? cacheAccessibleDescriptionHidden : cacheAccessibleDescriptionHidden = /* @__PURE__ */ new Map();
  cacheAccessibleErrorMessage != null ? cacheAccessibleErrorMessage : cacheAccessibleErrorMessage = /* @__PURE__ */ new Map();
  cacheIsHidden != null ? cacheIsHidden : cacheIsHidden = /* @__PURE__ */ new Map();
  cachePseudoContent != null ? cachePseudoContent : cachePseudoContent = /* @__PURE__ */ new Map();
  cachePseudoContentBefore != null ? cachePseudoContentBefore : cachePseudoContentBefore = /* @__PURE__ */ new Map();
  cachePseudoContentAfter != null ? cachePseudoContentAfter : cachePseudoContentAfter = /* @__PURE__ */ new Map();
  cachePointerEvents != null ? cachePointerEvents : cachePointerEvents = /* @__PURE__ */ new Map();
}
function endAriaCaches() {
  if (!--cachesCounter) {
    cacheAccessibleName = void 0;
    cacheAccessibleNameHidden = void 0;
    cacheAccessibleDescription = void 0;
    cacheAccessibleDescriptionHidden = void 0;
    cacheAccessibleErrorMessage = void 0;
    cacheIsHidden = void 0;
    cachePseudoContent = void 0;
    cachePseudoContentBefore = void 0;
    cachePseudoContentAfter = void 0;
    cachePointerEvents = void 0;
  }
}
var inputTypeToRole = {
  button: "button",
  checkbox: "checkbox",
  image: "button",
  number: "spinbutton",
  radio: "radio",
  range: "slider",
  reset: "button",
  submit: "button"
};

// src/content/services/playwright/injected/src/yaml.ts
function yamlEscapeKeyIfNeeded(str) {
  if (!yamlStringNeedsQuotes(str))
    return str;
  return `'` + str.replace(/'/g, `''`) + `'`;
}
function yamlEscapeValueIfNeeded(str) {
  if (!yamlStringNeedsQuotes(str))
    return str;
  return '"' + str.replace(/[\\"\x00-\x1f\x7f-\x9f]/g, (c) => {
    switch (c) {
      case "\\":
        return "\\\\";
      case '"':
        return '\\"';
      case "\b":
        return "\\b";
      case "\f":
        return "\\f";
      case "\n":
        return "\\n";
      case "\r":
        return "\\r";
      case "	":
        return "\\t";
      default:
        const code = c.charCodeAt(0);
        return "\\x" + code.toString(16).padStart(2, "0");
    }
  }) + '"';
}
function yamlStringNeedsQuotes(str) {
  if (str.length === 0)
    return true;
  if (/^\s|\s$/.test(str))
    return true;
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(str))
    return true;
  if (/^-/.test(str))
    return true;
  if (/[\n:](\s|$)/.test(str))
    return true;
  if (/\s#/.test(str))
    return true;
  if (/[\n\r]/.test(str))
    return true;
  if (/^[&*\],?!>|@"'#%]/.test(str))
    return true;
  if (/[{}`]/.test(str))
    return true;
  if (/^\[/.test(str))
    return true;
  if (!isNaN(Number(str)) || ["y", "n", "yes", "no", "true", "false", "on", "off", "null"].includes(str.toLowerCase()))
    return true;
  return false;
}

// src/content/services/playwright/injected/src/ariaSnapshot.ts
var lastRef = 0;
function generateAriaTree(rootElement, options) {
  const visited = /* @__PURE__ */ new Set();
  const snapshot = {
    root: {
      role: "fragment",
      name: "",
      children: [],
      element: rootElement,
      props: {},
      box: box(rootElement),
      receivesPointerEvents: true
    },
    elements: /* @__PURE__ */ new Map()
  };
  const visit = (ariaNode, node) => {
    if (visited.has(node)) return;
    visited.add(node);
    if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
      const text = node.nodeValue;
      if (ariaNode.role !== "textbox" && text) ariaNode.children.push(node.nodeValue || "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node;
    let isVisible = !isElementHiddenForAria(element);
    if (options == null ? void 0 : options.forAI) isVisible = isVisible || isElementVisible(element);
    if (!isVisible) return;
    const ariaChildren = [];
    if (element.hasAttribute("aria-owns")) {
      const ids = element.getAttribute("aria-owns").split(/\s+/);
      for (const id of ids) {
        const ownedElement = rootElement.ownerDocument.getElementById(id);
        if (ownedElement) ariaChildren.push(ownedElement);
      }
    }
    const childAriaNode = toAriaNode(element, options);
    if (childAriaNode) {
      if (childAriaNode.ref) snapshot.elements.set(childAriaNode.ref, element);
      ariaNode.children.push(childAriaNode);
    }
    processElement(childAriaNode || ariaNode, element, ariaChildren);
  };
  function processElement(ariaNode, element, ariaChildren = []) {
    var _a2;
    const display = ((_a2 = getElementComputedStyle(element)) == null ? void 0 : _a2.display) || "inline";
    const treatAsBlock = display !== "inline" || element.nodeName === "BR" ? " " : "";
    if (treatAsBlock) ariaNode.children.push(treatAsBlock);
    ariaNode.children.push(getCSSContent(element, "::before") || "");
    const assignedNodes = element.nodeName === "SLOT" ? element.assignedNodes() : [];
    if (assignedNodes.length) {
      for (const child of assignedNodes) visit(ariaNode, child);
    } else {
      for (let child = element.firstChild; child; child = child.nextSibling) {
        if (!child.assignedSlot) visit(ariaNode, child);
      }
      if (element.shadowRoot) {
        for (let child = element.shadowRoot.firstChild; child; child = child.nextSibling) visit(ariaNode, child);
      }
    }
    for (const child of ariaChildren) visit(ariaNode, child);
    ariaNode.children.push(getCSSContent(element, "::after") || "");
    if (treatAsBlock) ariaNode.children.push(treatAsBlock);
    if (ariaNode.children.length === 1 && ariaNode.name === ariaNode.children[0]) ariaNode.children = [];
    if (ariaNode.role === "link" && element.hasAttribute("href")) {
      const href = element.getAttribute("href");
      ariaNode.props["url"] = href;
    }
  }
  beginAriaCaches();
  try {
    visit(snapshot.root, rootElement);
  } finally {
    endAriaCaches();
  }
  normalizeStringChildren(snapshot.root);
  normalizeGenericRoles(snapshot.root);
  return snapshot;
}
function ariaRef(element, role, name, options) {
  var _a2;
  if (!(options == null ? void 0 : options.forAI)) return void 0;
  let ariaRef2;
  ariaRef2 = element._ariaRef;
  if (!ariaRef2 || ariaRef2.role !== role || ariaRef2.name !== name) {
    ariaRef2 = { role, name, ref: ((_a2 = options == null ? void 0 : options.refPrefix) != null ? _a2 : "") + "e" + ++lastRef };
    element._ariaRef = ariaRef2;
  }
  return ariaRef2.ref;
}
function toAriaNode(element, options) {
  var _a2;
  if (element.nodeName === "IFRAME") {
    return {
      role: "iframe",
      name: "",
      ref: ariaRef(element, "iframe", "", options),
      children: [],
      props: {},
      element,
      box: box(element),
      receivesPointerEvents: true
    };
  }
  const defaultRole = (options == null ? void 0 : options.forAI) ? "generic" : null;
  const role = (_a2 = getAriaRole(element)) != null ? _a2 : defaultRole;
  if (!role || role === "presentation" || role === "none") return null;
  const name = normalizeWhiteSpace(getElementAccessibleName(element, false) || "");
  const receivesPointerEvents3 = receivesPointerEvents(element);
  const result2 = {
    role,
    name,
    ref: ariaRef(element, role, name, options),
    children: [],
    props: {},
    element,
    box: box(element),
    receivesPointerEvents: receivesPointerEvents3
  };
  if (kAriaCheckedRoles.includes(role)) result2.checked = getAriaChecked(element);
  if (kAriaDisabledRoles.includes(role)) result2.disabled = getAriaDisabled(element);
  if (kAriaExpandedRoles.includes(role)) result2.expanded = getAriaExpanded(element);
  if (kAriaLevelRoles.includes(role)) result2.level = getAriaLevel(element);
  if (kAriaPressedRoles.includes(role)) result2.pressed = getAriaPressed(element);
  if (kAriaSelectedRoles.includes(role)) result2.selected = getAriaSelected(element);
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.type !== "checkbox" && element.type !== "radio" && (element.type !== "file" || getGlobalOptions().inputFileRoleTextbox))
      result2.children = [element.value];
  }
  return result2;
}
function normalizeGenericRoles(node) {
  const normalizeChildren = (node2) => {
    const result2 = [];
    for (const child of node2.children || []) {
      if (typeof child === "string") {
        result2.push(child);
        continue;
      }
      const normalized = normalizeChildren(child);
      result2.push(...normalized);
    }
    const removeSelf = node2.role === "generic" && result2.length <= 1 && result2.every((c) => typeof c !== "string" && receivesPointerEvents2(c));
    if (removeSelf) return result2;
    node2.children = result2;
    return [node2];
  };
  normalizeChildren(node);
}
function normalizeStringChildren(rootA11yNode) {
  const flushChildren = (buffer, normalizedChildren) => {
    if (!buffer.length) return;
    const text = normalizeWhiteSpace(buffer.join(""));
    if (text) normalizedChildren.push(text);
    buffer.length = 0;
  };
  const visit = (ariaNode) => {
    const normalizedChildren = [];
    const buffer = [];
    for (const child of ariaNode.children || []) {
      if (typeof child === "string") {
        buffer.push(child);
      } else {
        flushChildren(buffer, normalizedChildren);
        visit(child);
        normalizedChildren.push(child);
      }
    }
    flushChildren(buffer, normalizedChildren);
    ariaNode.children = normalizedChildren.length ? normalizedChildren : [];
    if (ariaNode.children.length === 1 && ariaNode.children[0] === ariaNode.name) ariaNode.children = [];
  };
  visit(rootA11yNode);
}
function matchesText(text, template) {
  if (!template) return true;
  if (!text) return false;
  if (typeof template === "string") return text === template;
  return !!text.match(new RegExp(template.pattern));
}
function matchesTextNode(text, template) {
  return matchesText(text, template.text);
}
function matchesName(text, template) {
  return matchesText(text, template.name);
}
function matchesAriaTree(rootElement, template) {
  const snapshot = generateAriaTree(rootElement);
  const matches = matchesNodeDeep(snapshot.root, template, false, false);
  return {
    matches,
    received: {
      raw: renderAriaTree(snapshot, { mode: "raw" }),
      regex: renderAriaTree(snapshot, { mode: "regex" })
    }
  };
}
function getAllByAria(rootElement, template) {
  const root = generateAriaTree(rootElement).root;
  const matches = matchesNodeDeep(root, template, true, false);
  return matches.map((n) => n.element);
}
function matchesNode(node, template, isDeepEqual) {
  var _a2;
  if (typeof node === "string" && template.kind === "text") return matchesTextNode(node, template);
  if (node === null || typeof node !== "object" || template.kind !== "role") return false;
  if (template.role !== "fragment" && template.role !== node.role) return false;
  if (template.checked !== void 0 && template.checked !== node.checked) return false;
  if (template.disabled !== void 0 && template.disabled !== node.disabled) return false;
  if (template.expanded !== void 0 && template.expanded !== node.expanded) return false;
  if (template.level !== void 0 && template.level !== node.level) return false;
  if (template.pressed !== void 0 && template.pressed !== node.pressed) return false;
  if (template.selected !== void 0 && template.selected !== node.selected) return false;
  if (!matchesName(node.name, template)) return false;
  if (!matchesText(node.props.url, (_a2 = template.props) == null ? void 0 : _a2.url)) return false;
  if (template.containerMode === "contain") return containsList(node.children || [], template.children || []);
  if (template.containerMode === "equal") return listEqual(node.children || [], template.children || [], false);
  if (template.containerMode === "deep-equal" || isDeepEqual)
    return listEqual(node.children || [], template.children || [], true);
  return containsList(node.children || [], template.children || []);
}
function listEqual(children, template, isDeepEqual) {
  if (template.length !== children.length) return false;
  for (let i = 0; i < template.length; ++i) {
    if (!matchesNode(children[i], template[i], isDeepEqual)) return false;
  }
  return true;
}
function containsList(children, template) {
  if (template.length > children.length) return false;
  const cc = children.slice();
  const tt = template.slice();
  for (const t of tt) {
    let c = cc.shift();
    while (c) {
      if (matchesNode(c, t, false)) break;
      c = cc.shift();
    }
    if (!c) return false;
  }
  return true;
}
function matchesNodeDeep(root, template, collectAll, isDeepEqual) {
  const results = [];
  const visit = (node, parent) => {
    if (matchesNode(node, template, isDeepEqual)) {
      const result2 = typeof node === "string" ? parent : node;
      if (result2) results.push(result2);
      return !collectAll;
    }
    if (typeof node === "string") return false;
    for (const child of node.children || []) {
      if (visit(child, node)) return true;
    }
    return false;
  };
  visit(root, null);
  return results;
}
function renderAriaTree(ariaSnapshot, options) {
  const lines = [];
  const includeText = (options == null ? void 0 : options.mode) === "regex" ? textContributesInfo : () => true;
  const renderString = (options == null ? void 0 : options.mode) === "regex" ? convertToBestGuessRegex : (str) => str;
  const visit = (ariaNode2, parentAriaNode, indent) => {
    if (typeof ariaNode2 === "string") {
      if (parentAriaNode && !includeText(parentAriaNode, ariaNode2)) return;
      const text = yamlEscapeValueIfNeeded(renderString(ariaNode2));
      if (text) lines.push(indent + "- text: " + text);
      return;
    }
    let key = ariaNode2.role;
    if (ariaNode2.name && ariaNode2.name.length <= 900) {
      const name = renderString(ariaNode2.name);
      if (name) {
        const stringifiedName = name.startsWith("/") && name.endsWith("/") ? name : JSON.stringify(name);
        key += " " + stringifiedName;
      }
    }
    if (ariaNode2.checked === "mixed") key += ` [checked=mixed]`;
    if (ariaNode2.checked === true) key += ` [checked]`;
    if (ariaNode2.disabled) key += ` [disabled]`;
    if (ariaNode2.expanded) key += ` [expanded]`;
    if (ariaNode2.level) key += ` [level=${ariaNode2.level}]`;
    if (ariaNode2.pressed === "mixed") key += ` [pressed=mixed]`;
    if (ariaNode2.pressed === true) key += ` [pressed]`;
    if (ariaNode2.selected === true) key += ` [selected]`;
    if ((options == null ? void 0 : options.forAI) && receivesPointerEvents2(ariaNode2)) {
      const ref = ariaNode2.ref;
      const cursor = hasPointerCursor(ariaNode2) ? " [cursor=pointer]" : "";
      if (ref) key += ` [ref=${ref}]${cursor}`;
    }
    const escapedKey = indent + "- " + yamlEscapeKeyIfNeeded(key);
    const hasProps = !!Object.keys(ariaNode2.props).length;
    if (!ariaNode2.children.length && !hasProps) {
      lines.push(escapedKey);
    } else if (ariaNode2.children.length === 1 && typeof ariaNode2.children[0] === "string" && !hasProps) {
      const text = includeText(ariaNode2, ariaNode2.children[0]) ? renderString(ariaNode2.children[0]) : null;
      if (text) lines.push(escapedKey + ": " + yamlEscapeValueIfNeeded(text));
      else lines.push(escapedKey);
    } else {
      lines.push(escapedKey + ":");
      for (const [name, value] of Object.entries(ariaNode2.props))
        lines.push(indent + "  - /" + name + ": " + yamlEscapeValueIfNeeded(value));
      for (const child of ariaNode2.children || []) visit(child, ariaNode2, indent + "  ");
    }
  };
  const ariaNode = ariaSnapshot.root;
  if (ariaNode.role === "fragment") {
    for (const child of ariaNode.children || []) visit(child, ariaNode, "");
  } else {
    visit(ariaNode, null, "");
  }
  return lines.join("\n");
}
function convertToBestGuessRegex(text) {
  const dynamicContent = [
    // 2mb
    { regex: /\b[\d,.]+[bkmBKM]+\b/, replacement: "[\\d,.]+[bkmBKM]+" },
    // 2ms, 20s
    { regex: /\b\d+[hmsp]+\b/, replacement: "\\d+[hmsp]+" },
    { regex: /\b[\d,.]+[hmsp]+\b/, replacement: "[\\d,.]+[hmsp]+" },
    // Do not replace single digits with regex by default.
    // 2+ digits: [Issue 22, 22.3, 2.33, 2,333]
    { regex: /\b\d+,\d+\b/, replacement: "\\d+,\\d+" },
    { regex: /\b\d+\.\d{2,}\b/, replacement: "\\d+\\.\\d+" },
    { regex: /\b\d{2,}\.\d+\b/, replacement: "\\d+\\.\\d+" },
    { regex: /\b\d{2,}\b/, replacement: "\\d+" }
  ];
  let pattern = "";
  let lastIndex = 0;
  const combinedRegex = new RegExp(dynamicContent.map((r) => "(" + r.regex.source + ")").join("|"), "g");
  text.replace(combinedRegex, (match, ...args2) => {
    const offset = args2[args2.length - 2];
    const groups = args2.slice(0, -2);
    pattern += escapeRegExp(text.slice(lastIndex, offset));
    for (let i = 0; i < groups.length; i++) {
      if (groups[i]) {
        const { replacement } = dynamicContent[i];
        pattern += replacement;
        break;
      }
    }
    lastIndex = offset + match.length;
    return match;
  });
  if (!pattern) return text;
  pattern += escapeRegExp(text.slice(lastIndex));
  return String(new RegExp(pattern));
}
function textContributesInfo(node, text) {
  if (!text.length) return false;
  if (!node.name) return true;
  if (node.name.length > text.length) return false;
  const substr = text.length <= 200 && node.name.length <= 200 ? longestCommonSubstring(text, node.name) : "";
  let filtered = text;
  while (substr && filtered.includes(substr)) filtered = filtered.replace(substr, "");
  return filtered.trim().length / text.length > 0.1;
}
function receivesPointerEvents2(ariaNode) {
  return ariaNode.box.visible && ariaNode.receivesPointerEvents;
}
function hasPointerCursor(ariaNode) {
  var _a2;
  return ((_a2 = ariaNode.box.style) == null ? void 0 : _a2.cursor) === "pointer";
}

// src/content/services/playwright/injected/src/highlight.css?inline
var highlight_default = {};

// src/content/services/playwright/injected/src/highlight.ts
var Highlight = class {
  constructor(injectedScript) {
    __publicField(this, "_glassPaneElement");
    __publicField(this, "_glassPaneShadow");
    __publicField(this, "_renderedEntries", []);
    __publicField(this, "_actionPointElement");
    __publicField(this, "_isUnderTest");
    __publicField(this, "_injectedScript");
    __publicField(this, "_rafRequest");
    __publicField(this, "_language", "javascript");
    this._injectedScript = injectedScript;
    const document2 = injectedScript.document;
    this._isUnderTest = injectedScript.isUnderTest;
    this._glassPaneElement = document2.createElement("x-pw-glass");
    this._glassPaneElement.style.position = "fixed";
    this._glassPaneElement.style.top = "0";
    this._glassPaneElement.style.right = "0";
    this._glassPaneElement.style.bottom = "0";
    this._glassPaneElement.style.left = "0";
    this._glassPaneElement.style.zIndex = "2147483646";
    this._glassPaneElement.style.pointerEvents = "none";
    this._glassPaneElement.style.display = "flex";
    this._glassPaneElement.style.backgroundColor = "transparent";
    for (const eventName of [
      "click",
      "auxclick",
      "dragstart",
      "input",
      "keydown",
      "keyup",
      "pointerdown",
      "pointerup",
      "mousedown",
      "mouseup",
      "mouseleave",
      "focus",
      "scroll"
    ]) {
      this._glassPaneElement.addEventListener(eventName, (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
      });
    }
    this._actionPointElement = document2.createElement("x-pw-action-point");
    this._actionPointElement.setAttribute("hidden", "true");
    this._glassPaneShadow = this._glassPaneElement.attachShadow({ mode: this._isUnderTest ? "open" : "closed" });
    if (typeof this._glassPaneShadow.adoptedStyleSheets.push === "function") {
      const sheet = new this._injectedScript.window.CSSStyleSheet();
      sheet.replaceSync(highlight_default);
      this._glassPaneShadow.adoptedStyleSheets.push(sheet);
    } else {
      const styleElement = this._injectedScript.document.createElement("style");
      styleElement.textContent = highlight_default;
      this._glassPaneShadow.appendChild(styleElement);
    }
    this._glassPaneShadow.appendChild(this._actionPointElement);
  }
  install() {
    if (this._injectedScript.document.documentElement && !this._injectedScript.document.documentElement.contains(this._glassPaneElement))
      this._injectedScript.document.documentElement.appendChild(this._glassPaneElement);
  }
  setLanguage(language) {
    this._language = language;
  }
  runHighlightOnRaf(selector) {
    if (this._rafRequest) cancelAnimationFrame(this._rafRequest);
    const elements = this._injectedScript.querySelectorAll(selector, this._injectedScript.document.documentElement);
    const locator = asLocator(this._language, stringifySelector(selector));
    const color = elements.length > 1 ? "#f6b26b7f" : "#6fa8dc7f";
    this.updateHighlight(
      elements.map((element, index) => {
        const suffix = elements.length > 1 ? ` [${index + 1} of ${elements.length}]` : "";
        return { element, color, tooltipText: locator + suffix };
      })
    );
    this._rafRequest = requestAnimationFrame(() => this.runHighlightOnRaf(selector));
  }
  uninstall() {
    if (this._rafRequest) cancelAnimationFrame(this._rafRequest);
    this._glassPaneElement.remove();
  }
  showActionPoint(x, y) {
    this._actionPointElement.style.top = y + "px";
    this._actionPointElement.style.left = x + "px";
    this._actionPointElement.hidden = false;
  }
  hideActionPoint() {
    this._actionPointElement.hidden = true;
  }
  clearHighlight() {
    var _a2, _b;
    for (const entry of this._renderedEntries) {
      (_a2 = entry.highlightElement) == null ? void 0 : _a2.remove();
      (_b = entry.tooltipElement) == null ? void 0 : _b.remove();
    }
    this._renderedEntries = [];
  }
  maskElements(elements, color) {
    this.updateHighlight(elements.map((element) => ({ element, color })));
  }
  updateHighlight(entries) {
    if (this._highlightIsUpToDate(entries)) return;
    this.clearHighlight();
    for (const entry of entries) {
      const highlightElement = this._createHighlightElement();
      this._glassPaneShadow.appendChild(highlightElement);
      let tooltipElement;
      if (entry.tooltipText) {
        tooltipElement = this._injectedScript.document.createElement("x-pw-tooltip");
        this._glassPaneShadow.appendChild(tooltipElement);
        tooltipElement.style.top = "0";
        tooltipElement.style.left = "0";
        tooltipElement.style.display = "flex";
        const lineElement = this._injectedScript.document.createElement("x-pw-tooltip-line");
        lineElement.textContent = entry.tooltipText;
        tooltipElement.appendChild(lineElement);
      }
      this._renderedEntries.push({
        targetElement: entry.element,
        color: entry.color,
        tooltipElement,
        highlightElement
      });
    }
    for (const entry of this._renderedEntries) {
      entry.box = entry.targetElement.getBoundingClientRect();
      if (!entry.tooltipElement) continue;
      const { anchorLeft, anchorTop } = this.tooltipPosition(entry.box, entry.tooltipElement);
      entry.tooltipTop = anchorTop;
      entry.tooltipLeft = anchorLeft;
    }
    for (const entry of this._renderedEntries) {
      if (entry.tooltipElement) {
        entry.tooltipElement.style.top = entry.tooltipTop + "px";
        entry.tooltipElement.style.left = entry.tooltipLeft + "px";
      }
      const box2 = entry.box;
      entry.highlightElement.style.backgroundColor = entry.color;
      entry.highlightElement.style.left = box2.x + "px";
      entry.highlightElement.style.top = box2.y + "px";
      entry.highlightElement.style.width = box2.width + "px";
      entry.highlightElement.style.height = box2.height + "px";
      entry.highlightElement.style.display = "block";
      if (this._isUnderTest)
        console.error(
          "Highlight box for test: " + JSON.stringify({ x: box2.x, y: box2.y, width: box2.width, height: box2.height })
        );
    }
  }
  firstBox() {
    var _a2;
    return (_a2 = this._renderedEntries[0]) == null ? void 0 : _a2.box;
  }
  tooltipPosition(box2, tooltipElement) {
    const tooltipWidth = tooltipElement.offsetWidth;
    const tooltipHeight = tooltipElement.offsetHeight;
    const totalWidth = this._glassPaneElement.offsetWidth;
    const totalHeight = this._glassPaneElement.offsetHeight;
    let anchorLeft = box2.left;
    if (anchorLeft + tooltipWidth > totalWidth - 5) anchorLeft = totalWidth - tooltipWidth - 5;
    let anchorTop = box2.bottom + 5;
    if (anchorTop + tooltipHeight > totalHeight - 5) {
      if (box2.top > tooltipHeight + 5) {
        anchorTop = box2.top - tooltipHeight - 5;
      } else {
        anchorTop = totalHeight - 5 - tooltipHeight;
      }
    }
    return { anchorLeft, anchorTop };
  }
  _highlightIsUpToDate(entries) {
    if (entries.length !== this._renderedEntries.length) return false;
    for (let i = 0; i < this._renderedEntries.length; ++i) {
      if (entries[i].element !== this._renderedEntries[i].targetElement) return false;
      if (entries[i].color !== this._renderedEntries[i].color) return false;
      const oldBox = this._renderedEntries[i].box;
      if (!oldBox) return false;
      const box2 = entries[i].element.getBoundingClientRect();
      if (box2.top !== oldBox.top || box2.right !== oldBox.right || box2.bottom !== oldBox.bottom || box2.left !== oldBox.left)
        return false;
    }
    return true;
  }
  _createHighlightElement() {
    return this._injectedScript.document.createElement("x-pw-highlight");
  }
  appendChild(element) {
    this._glassPaneShadow.appendChild(element);
  }
};

// src/content/services/playwright/injected/src/layoutSelectorUtils.ts
function boxRightOf(box1, box2, maxDistance) {
  const distance = box1.left - box2.right;
  if (distance < 0 || maxDistance !== void 0 && distance > maxDistance)
    return;
  return distance + Math.max(box2.bottom - box1.bottom, 0) + Math.max(box1.top - box2.top, 0);
}
function boxLeftOf(box1, box2, maxDistance) {
  const distance = box2.left - box1.right;
  if (distance < 0 || maxDistance !== void 0 && distance > maxDistance)
    return;
  return distance + Math.max(box2.bottom - box1.bottom, 0) + Math.max(box1.top - box2.top, 0);
}
function boxAbove(box1, box2, maxDistance) {
  const distance = box2.top - box1.bottom;
  if (distance < 0 || maxDistance !== void 0 && distance > maxDistance)
    return;
  return distance + Math.max(box1.left - box2.left, 0) + Math.max(box2.right - box1.right, 0);
}
function boxBelow(box1, box2, maxDistance) {
  const distance = box1.top - box2.bottom;
  if (distance < 0 || maxDistance !== void 0 && distance > maxDistance)
    return;
  return distance + Math.max(box1.left - box2.left, 0) + Math.max(box2.right - box1.right, 0);
}
function boxNear(box1, box2, maxDistance) {
  const kThreshold = maxDistance === void 0 ? 50 : maxDistance;
  let score = 0;
  if (box1.left - box2.right >= 0)
    score += box1.left - box2.right;
  if (box2.left - box1.right >= 0)
    score += box2.left - box1.right;
  if (box2.top - box1.bottom >= 0)
    score += box2.top - box1.bottom;
  if (box1.top - box2.bottom >= 0)
    score += box1.top - box2.bottom;
  return score > kThreshold ? void 0 : score;
}
var kLayoutSelectorNames = ["left-of", "right-of", "above", "below", "near"];
function layoutSelectorScore(name, element, inner, maxDistance) {
  const box2 = element.getBoundingClientRect();
  const scorer = { "left-of": boxLeftOf, "right-of": boxRightOf, "above": boxAbove, "below": boxBelow, "near": boxNear }[name];
  let bestScore;
  for (const e of inner) {
    if (e === element)
      continue;
    const score = scorer(box2, e.getBoundingClientRect(), maxDistance);
    if (score === void 0)
      continue;
    if (bestScore === void 0 || score < bestScore)
      bestScore = score;
  }
  return bestScore;
}

// src/content/services/playwright/injected/src/selectorUtils.ts
function matchesComponentAttribute(obj, attr) {
  for (const token of attr.jsonPath) {
    if (obj !== void 0 && obj !== null) obj = obj[token];
  }
  return matchesAttributePart(obj, attr);
}
function matchesAttributePart(value, attr) {
  const objValue = typeof value === "string" && !attr.caseSensitive ? value.toUpperCase() : value;
  const attrValue = typeof attr.value === "string" && !attr.caseSensitive ? attr.value.toUpperCase() : attr.value;
  if (attr.op === "<truthy>") return !!objValue;
  if (attr.op === "=") {
    if (attrValue instanceof RegExp) return typeof objValue === "string" && !!objValue.match(attrValue);
    return objValue === attrValue;
  }
  if (typeof objValue !== "string" || typeof attrValue !== "string") return false;
  if (attr.op === "*=") return objValue.includes(attrValue);
  if (attr.op === "^=") return objValue.startsWith(attrValue);
  if (attr.op === "$=") return objValue.endsWith(attrValue);
  if (attr.op === "|=") return objValue === attrValue || objValue.startsWith(attrValue + "-");
  if (attr.op === "~=") return objValue.split(" ").includes(attrValue);
  return false;
}
function shouldSkipForTextMatching(element) {
  const document2 = element.ownerDocument;
  return element.nodeName === "SCRIPT" || element.nodeName === "NOSCRIPT" || element.nodeName === "STYLE" || document2.head && document2.head.contains(element);
}
function elementText(cache, root) {
  let value = cache.get(root);
  if (value === void 0) {
    value = { full: "", normalized: "", immediate: [] };
    if (!shouldSkipForTextMatching(root)) {
      let currentImmediate = "";
      if (root instanceof HTMLInputElement && (root.type === "submit" || root.type === "button")) {
        value = { full: root.value, normalized: normalizeWhiteSpace(root.value), immediate: [root.value] };
      } else {
        for (let child = root.firstChild; child; child = child.nextSibling) {
          if (child.nodeType === Node.TEXT_NODE) {
            value.full += child.nodeValue || "";
            currentImmediate += child.nodeValue || "";
          } else if (child.nodeType === Node.COMMENT_NODE) {
            continue;
          } else {
            if (currentImmediate) value.immediate.push(currentImmediate);
            currentImmediate = "";
            if (child.nodeType === Node.ELEMENT_NODE) value.full += elementText(cache, child).full;
          }
        }
        if (currentImmediate) value.immediate.push(currentImmediate);
        if (root.shadowRoot) value.full += elementText(cache, root.shadowRoot).full;
        if (value.full) value.normalized = normalizeWhiteSpace(value.full);
      }
    }
    cache.set(root, value);
  }
  return value;
}
function elementMatchesText(cache, element, matcher) {
  if (shouldSkipForTextMatching(element)) return "none";
  if (!matcher(elementText(cache, element))) return "none";
  for (let child = element.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === Node.ELEMENT_NODE && matcher(elementText(cache, child))) return "selfAndChildren";
  }
  if (element.shadowRoot && matcher(elementText(cache, element.shadowRoot))) return "selfAndChildren";
  return "self";
}
function getElementLabels(textCache, element) {
  const labels = getAriaLabelledByElements(element);
  if (labels) return labels.map((label) => elementText(textCache, label));
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel !== null && !!ariaLabel.trim())
    return [{ full: ariaLabel, normalized: normalizeWhiteSpace(ariaLabel), immediate: [ariaLabel] }];
  const isNonHiddenInput = element.nodeName === "INPUT" && element.type !== "hidden";
  if (["BUTTON", "METER", "OUTPUT", "PROGRESS", "SELECT", "TEXTAREA"].includes(element.nodeName) || isNonHiddenInput) {
    const labels2 = element.labels;
    if (labels2) return [...labels2].map((label) => elementText(textCache, label));
  }
  return [];
}

// src/content/services/playwright/injected/src/reactSelectorEngine.ts
function getFunctionComponentName(component) {
  return component.displayName || component.name || "Anonymous";
}
function getComponentName(reactElement) {
  if (reactElement.type) {
    switch (typeof reactElement.type) {
      case "function":
        return getFunctionComponentName(reactElement.type);
      case "string":
        return reactElement.type;
      case "object":
        return reactElement.type.displayName || (reactElement.type.render ? getFunctionComponentName(reactElement.type.render) : "");
    }
  }
  if (reactElement._currentElement) {
    const elementType = reactElement._currentElement.type;
    if (typeof elementType === "string") return elementType;
    if (typeof elementType === "function") return elementType.displayName || elementType.name || "Anonymous";
  }
  return "";
}
function getComponentKey(reactElement) {
  var _a2, _b;
  return (_b = reactElement.key) != null ? _b : (_a2 = reactElement._currentElement) == null ? void 0 : _a2.key;
}
function getChildren(reactElement) {
  if (reactElement.child) {
    const children = [];
    for (let child = reactElement.child; child; child = child.sibling) children.push(child);
    return children;
  }
  if (!reactElement._currentElement) return [];
  const isKnownElement = (reactElement2) => {
    var _a2;
    const elementType = (_a2 = reactElement2._currentElement) == null ? void 0 : _a2.type;
    return typeof elementType === "function" || typeof elementType === "string";
  };
  if (reactElement._renderedComponent) {
    const child = reactElement._renderedComponent;
    return isKnownElement(child) ? [child] : [];
  }
  if (reactElement._renderedChildren) return [...Object.values(reactElement._renderedChildren)].filter(isKnownElement);
  return [];
}
function getProps(reactElement) {
  var _a2;
  const props = (
    // React 16+
    reactElement.memoizedProps || // React 15
    ((_a2 = reactElement._currentElement) == null ? void 0 : _a2.props)
  );
  if (!props || typeof props === "string") return props;
  const result2 = __spreadValues({}, props);
  delete result2.children;
  return result2;
}
function buildComponentsTree(reactElement) {
  var _a2;
  const treeNode = {
    key: getComponentKey(reactElement),
    name: getComponentName(reactElement),
    children: getChildren(reactElement).map(buildComponentsTree),
    rootElements: [],
    props: getProps(reactElement)
  };
  const rootElement = (
    // React 16+
    // @see https://github.com/baruchvlz/resq/blob/5c15a5e04d3f7174087248f5a158c3d6dcc1ec72/src/utils.js#L29
    reactElement.stateNode || // React 15
    reactElement._hostNode || ((_a2 = reactElement._renderedComponent) == null ? void 0 : _a2._hostNode)
  );
  if (rootElement instanceof Element) {
    treeNode.rootElements.push(rootElement);
  } else {
    for (const child of treeNode.children) treeNode.rootElements.push(...child.rootElements);
  }
  return treeNode;
}
function filterComponentsTree(treeNode, searchFn, result2 = []) {
  if (searchFn(treeNode)) result2.push(treeNode);
  for (const child of treeNode.children) filterComponentsTree(child, searchFn, result2);
  return result2;
}
function findReactRoots(root, roots = []) {
  const document2 = root.ownerDocument || root;
  const walker = document2.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  do {
    const node = walker.currentNode;
    const reactNode = node;
    const rootKey = Object.keys(reactNode).find((key) => key.startsWith("__reactContainer") && reactNode[key] !== null);
    if (rootKey) {
      roots.push(reactNode[rootKey].stateNode.current);
    } else {
      const legacyRootKey = "_reactRootContainer";
      if (reactNode.hasOwnProperty(legacyRootKey) && reactNode[legacyRootKey] !== null) {
        roots.push(reactNode[legacyRootKey]._internalRoot.current);
      }
    }
    if (node instanceof Element && node.hasAttribute("data-reactroot")) {
      for (const key of Object.keys(node)) {
        if (key.startsWith("__reactInternalInstance") || key.startsWith("__reactFiber")) roots.push(node[key]);
      }
    }
    const shadowRoot = node instanceof Element ? node.shadowRoot : null;
    if (shadowRoot) findReactRoots(shadowRoot, roots);
  } while (walker.nextNode());
  return roots;
}
var createReactEngine = () => ({
  queryAll(scope, selector) {
    const { name, attributes } = parseAttributeSelector(selector, false);
    const reactRoots = findReactRoots(scope.ownerDocument || scope);
    const trees = reactRoots.map((reactRoot) => buildComponentsTree(reactRoot));
    const treeNodes = trees.map(
      (tree) => filterComponentsTree(tree, (treeNode) => {
        var _a2;
        const props = (_a2 = treeNode.props) != null ? _a2 : {};
        if (treeNode.key !== void 0) props.key = treeNode.key;
        if (name && treeNode.name !== name) return false;
        if (treeNode.rootElements.some((domNode) => !isInsideScope(scope, domNode))) return false;
        for (const attr of attributes) {
          if (!matchesComponentAttribute(props, attr)) return false;
        }
        return true;
      })
    ).flat();
    const allRootElements = /* @__PURE__ */ new Set();
    for (const treeNode of treeNodes) {
      for (const domNode of treeNode.rootElements) allRootElements.add(domNode);
    }
    return [...allRootElements];
  }
});

// src/content/services/playwright/injected/src/roleSelectorEngine.ts
var kSupportedAttributes = [
  "selected",
  "checked",
  "pressed",
  "expanded",
  "level",
  "disabled",
  "name",
  "include-hidden"
];
kSupportedAttributes.sort();
function validateSupportedRole(attr, roles, role) {
  if (!roles.includes(role))
    throw new Error(
      `"${attr}" attribute is only supported for roles: ${roles.slice().sort().map((role2) => `"${role2}"`).join(", ")}`
    );
}
function validateSupportedValues(attr, values) {
  if (attr.op !== "<truthy>" && !values.includes(attr.value))
    throw new Error(`"${attr.name}" must be one of ${values.map((v) => JSON.stringify(v)).join(", ")}`);
}
function validateSupportedOp(attr, ops) {
  if (!ops.includes(attr.op)) throw new Error(`"${attr.name}" does not support "${attr.op}" matcher`);
}
function validateAttributes(attrs, role) {
  const options = { role };
  for (const attr of attrs) {
    switch (attr.name) {
      case "checked": {
        validateSupportedRole(attr.name, kAriaCheckedRoles, role);
        validateSupportedValues(attr, [true, false, "mixed"]);
        validateSupportedOp(attr, ["<truthy>", "="]);
        options.checked = attr.op === "<truthy>" ? true : attr.value;
        break;
      }
      case "pressed": {
        validateSupportedRole(attr.name, kAriaPressedRoles, role);
        validateSupportedValues(attr, [true, false, "mixed"]);
        validateSupportedOp(attr, ["<truthy>", "="]);
        options.pressed = attr.op === "<truthy>" ? true : attr.value;
        break;
      }
      case "selected": {
        validateSupportedRole(attr.name, kAriaSelectedRoles, role);
        validateSupportedValues(attr, [true, false]);
        validateSupportedOp(attr, ["<truthy>", "="]);
        options.selected = attr.op === "<truthy>" ? true : attr.value;
        break;
      }
      case "expanded": {
        validateSupportedRole(attr.name, kAriaExpandedRoles, role);
        validateSupportedValues(attr, [true, false]);
        validateSupportedOp(attr, ["<truthy>", "="]);
        options.expanded = attr.op === "<truthy>" ? true : attr.value;
        break;
      }
      case "level": {
        validateSupportedRole(attr.name, kAriaLevelRoles, role);
        if (typeof attr.value === "string") attr.value = +attr.value;
        if (attr.op !== "=" || typeof attr.value !== "number" || Number.isNaN(attr.value))
          throw new Error(`"level" attribute must be compared to a number`);
        options.level = attr.value;
        break;
      }
      case "disabled": {
        validateSupportedValues(attr, [true, false]);
        validateSupportedOp(attr, ["<truthy>", "="]);
        options.disabled = attr.op === "<truthy>" ? true : attr.value;
        break;
      }
      case "name": {
        if (attr.op === "<truthy>") throw new Error(`"name" attribute must have a value`);
        if (typeof attr.value !== "string" && !(attr.value instanceof RegExp))
          throw new Error(`"name" attribute must be a string or a regular expression`);
        options.name = attr.value;
        options.nameOp = attr.op;
        options.exact = attr.caseSensitive;
        break;
      }
      case "include-hidden": {
        validateSupportedValues(attr, [true, false]);
        validateSupportedOp(attr, ["<truthy>", "="]);
        options.includeHidden = attr.op === "<truthy>" ? true : attr.value;
        break;
      }
      default: {
        throw new Error(
          `Unknown attribute "${attr.name}", must be one of ${kSupportedAttributes.map((a) => `"${a}"`).join(", ")}.`
        );
      }
    }
  }
  return options;
}
function queryRole(scope, options, internal) {
  const result2 = [];
  const match = (element) => {
    if (getAriaRole(element) !== options.role) return;
    if (options.selected !== void 0 && getAriaSelected(element) !== options.selected) return;
    if (options.checked !== void 0 && getAriaChecked(element) !== options.checked) return;
    if (options.pressed !== void 0 && getAriaPressed(element) !== options.pressed) return;
    if (options.expanded !== void 0 && getAriaExpanded(element) !== options.expanded) return;
    if (options.level !== void 0 && getAriaLevel(element) !== options.level) return;
    if (options.disabled !== void 0 && getAriaDisabled(element) !== options.disabled) return;
    if (!options.includeHidden) {
      const isHidden = isElementHiddenForAria(element);
      if (isHidden) return;
    }
    if (options.name !== void 0) {
      const accessibleName = normalizeWhiteSpace(getElementAccessibleName(element, !!options.includeHidden));
      if (typeof options.name === "string") options.name = normalizeWhiteSpace(options.name);
      if (internal && !options.exact && options.nameOp === "=") options.nameOp = "*=";
      if (!matchesAttributePart(accessibleName, {
        name: "",
        jsonPath: [],
        op: options.nameOp || "=",
        value: options.name,
        caseSensitive: !!options.exact
      }))
        return;
    }
    result2.push(element);
  };
  const query = (root) => {
    const shadows = [];
    if (root.shadowRoot) shadows.push(root.shadowRoot);
    for (const element of root.querySelectorAll("*")) {
      match(element);
      if (element.shadowRoot) shadows.push(element.shadowRoot);
    }
    shadows.forEach(query);
  };
  query(scope);
  return result2;
}
function createRoleEngine(internal) {
  return {
    queryAll: (scope, selector) => {
      const parsed = parseAttributeSelector(selector, true);
      const role = parsed.name.toLowerCase();
      if (!role) throw new Error(`Role must not be empty`);
      const options = validateAttributes(parsed.attributes, role);
      beginAriaCaches();
      try {
        return queryRole(scope, options, internal);
      } finally {
        endAriaCaches();
      }
    }
  };
}

// src/content/services/playwright/injected/src/selectorEvaluator.ts
var SelectorEvaluatorImpl = class {
  constructor() {
    __publicField(this, "_engines");
    __publicField(this, "_cacheQueryCSS");
    __publicField(this, "_cacheMatches");
    __publicField(this, "_cacheQuery");
    __publicField(this, "_cacheMatchesSimple");
    __publicField(this, "_cacheMatchesParents");
    __publicField(this, "_cacheCallMatches");
    __publicField(this, "_cacheCallQuery");
    __publicField(this, "_cacheQuerySimple");
    __publicField(this, "_cacheText");
    __publicField(this, "_scoreMap");
    __publicField(this, "_retainCacheCounter", 0);
    this._cacheText = /* @__PURE__ */ new Map();
    this._cacheQueryCSS = /* @__PURE__ */ new Map();
    this._cacheMatches = /* @__PURE__ */ new Map();
    this._cacheQuery = /* @__PURE__ */ new Map();
    this._cacheMatchesSimple = /* @__PURE__ */ new Map();
    this._cacheMatchesParents = /* @__PURE__ */ new Map();
    this._cacheCallMatches = /* @__PURE__ */ new Map();
    this._cacheCallQuery = /* @__PURE__ */ new Map();
    this._cacheQuerySimple = /* @__PURE__ */ new Map();
    this._engines = /* @__PURE__ */ new Map();
    this._engines.set("not", notEngine);
    this._engines.set("is", isEngine);
    this._engines.set("where", isEngine);
    this._engines.set("has", hasEngine);
    this._engines.set("scope", scopeEngine);
    this._engines.set("light", lightEngine);
    this._engines.set("visible", visibleEngine);
    this._engines.set("text", textEngine);
    this._engines.set("text-is", textIsEngine);
    this._engines.set("text-matches", textMatchesEngine);
    this._engines.set("has-text", hasTextEngine);
    this._engines.set("right-of", createLayoutEngine("right-of"));
    this._engines.set("left-of", createLayoutEngine("left-of"));
    this._engines.set("above", createLayoutEngine("above"));
    this._engines.set("below", createLayoutEngine("below"));
    this._engines.set("near", createLayoutEngine("near"));
    this._engines.set("nth-match", nthMatchEngine);
    const allNames = [...this._engines.keys()];
    allNames.sort();
    const parserNames = [...customCSSNames];
    parserNames.sort();
    if (allNames.join("|") !== parserNames.join("|"))
      throw new Error(
        `Please keep customCSSNames in sync with evaluator engines: ${allNames.join("|")} vs ${parserNames.join("|")}`
      );
  }
  begin() {
    ++this._retainCacheCounter;
  }
  end() {
    --this._retainCacheCounter;
    if (!this._retainCacheCounter) {
      this._cacheQueryCSS.clear();
      this._cacheMatches.clear();
      this._cacheQuery.clear();
      this._cacheMatchesSimple.clear();
      this._cacheMatchesParents.clear();
      this._cacheCallMatches.clear();
      this._cacheCallQuery.clear();
      this._cacheQuerySimple.clear();
      this._cacheText.clear();
    }
  }
  _cached(cache, main, rest, cb) {
    if (!cache.has(main)) cache.set(main, []);
    const entries = cache.get(main);
    const entry = entries.find((e) => rest.every((value, index) => e.rest[index] === value));
    if (entry) return entry.result;
    const result2 = cb();
    entries.push({ rest, result: result2 });
    return result2;
  }
  _checkSelector(s) {
    const wellFormed = typeof s === "object" && s && (Array.isArray(s) || "simples" in s && s.simples.length);
    if (!wellFormed) throw new Error(`Malformed selector "${s}"`);
    return s;
  }
  matches(element, s, context) {
    const selector = this._checkSelector(s);
    this.begin();
    try {
      return this._cached(
        this._cacheMatches,
        element,
        [selector, context.scope, context.pierceShadow, context.originalScope],
        () => {
          if (Array.isArray(selector)) return this._matchesEngine(isEngine, element, selector, context);
          if (this._hasScopeClause(selector)) context = this._expandContextForScopeMatching(context);
          if (!this._matchesSimple(element, selector.simples[selector.simples.length - 1].selector, context))
            return false;
          return this._matchesParents(element, selector, selector.simples.length - 2, context);
        }
      );
    } finally {
      this.end();
    }
  }
  query(context, s) {
    const selector = this._checkSelector(s);
    this.begin();
    try {
      return this._cached(
        this._cacheQuery,
        selector,
        [context.scope, context.pierceShadow, context.originalScope],
        () => {
          if (Array.isArray(selector)) return this._queryEngine(isEngine, context, selector);
          if (this._hasScopeClause(selector)) context = this._expandContextForScopeMatching(context);
          const previousScoreMap = this._scoreMap;
          this._scoreMap = /* @__PURE__ */ new Map();
          let elements = this._querySimple(context, selector.simples[selector.simples.length - 1].selector);
          elements = elements.filter(
            (element) => this._matchesParents(element, selector, selector.simples.length - 2, context)
          );
          if (this._scoreMap.size) {
            elements.sort((a, b) => {
              const aScore = this._scoreMap.get(a);
              const bScore = this._scoreMap.get(b);
              if (aScore === bScore) return 0;
              if (aScore === void 0) return 1;
              if (bScore === void 0) return -1;
              return aScore - bScore;
            });
          }
          this._scoreMap = previousScoreMap;
          return elements;
        }
      );
    } finally {
      this.end();
    }
  }
  _markScore(element, score) {
    if (this._scoreMap) this._scoreMap.set(element, score);
  }
  _hasScopeClause(selector) {
    return selector.simples.some((simple) => simple.selector.functions.some((f) => f.name === "scope"));
  }
  _expandContextForScopeMatching(context) {
    if (context.scope.nodeType !== 1) return context;
    const scope = parentElementOrShadowHost(context.scope);
    if (!scope) return context;
    return __spreadProps(__spreadValues({}, context), { scope, originalScope: context.originalScope || context.scope });
  }
  _matchesSimple(element, simple, context) {
    return this._cached(
      this._cacheMatchesSimple,
      element,
      [simple, context.scope, context.pierceShadow, context.originalScope],
      () => {
        if (element === context.scope) return false;
        if (simple.css && !this._matchesCSS(element, simple.css)) return false;
        for (const func of simple.functions) {
          if (!this._matchesEngine(this._getEngine(func.name), element, func.args, context)) return false;
        }
        return true;
      }
    );
  }
  _querySimple(context, simple) {
    if (!simple.functions.length) return this._queryCSS(context, simple.css || "*");
    return this._cached(
      this._cacheQuerySimple,
      simple,
      [context.scope, context.pierceShadow, context.originalScope],
      () => {
        let css = simple.css;
        const funcs = simple.functions;
        if (css === "*" && funcs.length) css = void 0;
        let elements;
        let firstIndex = -1;
        if (css !== void 0) {
          elements = this._queryCSS(context, css);
        } else {
          firstIndex = funcs.findIndex((func) => this._getEngine(func.name).query !== void 0);
          if (firstIndex === -1) firstIndex = 0;
          elements = this._queryEngine(this._getEngine(funcs[firstIndex].name), context, funcs[firstIndex].args);
        }
        for (let i = 0; i < funcs.length; i++) {
          if (i === firstIndex) continue;
          const engine = this._getEngine(funcs[i].name);
          if (engine.matches !== void 0)
            elements = elements.filter((e) => this._matchesEngine(engine, e, funcs[i].args, context));
        }
        for (let i = 0; i < funcs.length; i++) {
          if (i === firstIndex) continue;
          const engine = this._getEngine(funcs[i].name);
          if (engine.matches === void 0)
            elements = elements.filter((e) => this._matchesEngine(engine, e, funcs[i].args, context));
        }
        return elements;
      }
    );
  }
  _matchesParents(element, complex, index, context) {
    if (index < 0) return true;
    return this._cached(
      this._cacheMatchesParents,
      element,
      [complex, index, context.scope, context.pierceShadow, context.originalScope],
      () => {
        const { selector: simple, combinator } = complex.simples[index];
        if (combinator === ">") {
          const parent = parentElementOrShadowHostInContext(element, context);
          if (!parent || !this._matchesSimple(parent, simple, context)) return false;
          return this._matchesParents(parent, complex, index - 1, context);
        }
        if (combinator === "+") {
          const previousSibling = previousSiblingInContext(element, context);
          if (!previousSibling || !this._matchesSimple(previousSibling, simple, context)) return false;
          return this._matchesParents(previousSibling, complex, index - 1, context);
        }
        if (combinator === "") {
          let parent = parentElementOrShadowHostInContext(element, context);
          while (parent) {
            if (this._matchesSimple(parent, simple, context)) {
              if (this._matchesParents(parent, complex, index - 1, context)) return true;
              if (complex.simples[index - 1].combinator === "") break;
            }
            parent = parentElementOrShadowHostInContext(parent, context);
          }
          return false;
        }
        if (combinator === "~") {
          let previousSibling = previousSiblingInContext(element, context);
          while (previousSibling) {
            if (this._matchesSimple(previousSibling, simple, context)) {
              if (this._matchesParents(previousSibling, complex, index - 1, context)) return true;
              if (complex.simples[index - 1].combinator === "~") break;
            }
            previousSibling = previousSiblingInContext(previousSibling, context);
          }
          return false;
        }
        if (combinator === ">=") {
          let parent = element;
          while (parent) {
            if (this._matchesSimple(parent, simple, context)) {
              if (this._matchesParents(parent, complex, index - 1, context)) return true;
              if (complex.simples[index - 1].combinator === "") break;
            }
            parent = parentElementOrShadowHostInContext(parent, context);
          }
          return false;
        }
        throw new Error(`Unsupported combinator "${combinator}"`);
      }
    );
  }
  _matchesEngine(engine, element, args2, context) {
    if (engine.matches) return this._callMatches(engine, element, args2, context);
    if (engine.query) return this._callQuery(engine, args2, context).includes(element);
    throw new Error(`Selector engine should implement "matches" or "query"`);
  }
  _queryEngine(engine, context, args2) {
    if (engine.query) return this._callQuery(engine, args2, context);
    if (engine.matches)
      return this._queryCSS(context, "*").filter((element) => this._callMatches(engine, element, args2, context));
    throw new Error(`Selector engine should implement "matches" or "query"`);
  }
  _callMatches(engine, element, args2, context) {
    return this._cached(
      this._cacheCallMatches,
      element,
      [engine, context.scope, context.pierceShadow, context.originalScope, ...args2],
      () => {
        return engine.matches(element, args2, context, this);
      }
    );
  }
  _callQuery(engine, args2, context) {
    return this._cached(
      this._cacheCallQuery,
      engine,
      [context.scope, context.pierceShadow, context.originalScope, ...args2],
      () => {
        return engine.query(context, args2, this);
      }
    );
  }
  _matchesCSS(element, css) {
    return element.matches(css);
  }
  _queryCSS(context, css) {
    return this._cached(
      this._cacheQueryCSS,
      css,
      [context.scope, context.pierceShadow, context.originalScope],
      () => {
        let result2 = [];
        function query(root) {
          result2 = result2.concat([...root.querySelectorAll(css)]);
          if (!context.pierceShadow) return;
          if (root.shadowRoot) query(root.shadowRoot);
          for (const element of root.querySelectorAll("*")) {
            if (element.shadowRoot) query(element.shadowRoot);
          }
        }
        query(context.scope);
        return result2;
      }
    );
  }
  _getEngine(name) {
    const engine = this._engines.get(name);
    if (!engine) throw new Error(`Unknown selector engine "${name}"`);
    return engine;
  }
};
var isEngine = {
  matches(element, args2, context, evaluator) {
    if (args2.length === 0) throw new Error(`"is" engine expects non-empty selector list`);
    return args2.some((selector) => evaluator.matches(element, selector, context));
  },
  query(context, args2, evaluator) {
    if (args2.length === 0) throw new Error(`"is" engine expects non-empty selector list`);
    let elements = [];
    for (const arg of args2) elements = elements.concat(evaluator.query(context, arg));
    return args2.length === 1 ? elements : sortInDOMOrder(elements);
  }
};
var hasEngine = {
  matches(element, args2, context, evaluator) {
    if (args2.length === 0) throw new Error(`"has" engine expects non-empty selector list`);
    return evaluator.query(__spreadProps(__spreadValues({}, context), { scope: element }), args2).length > 0;
  }
  // TODO: we can implement efficient "query" by matching "args" and returning
  // all parents/descendants, just have to be careful with the ":scope" matching.
};
var scopeEngine = {
  matches(element, args2, context, evaluator) {
    if (args2.length !== 0) throw new Error(`"scope" engine expects no arguments`);
    const actualScope = context.originalScope || context.scope;
    if (actualScope.nodeType === 9)
      return element === actualScope.documentElement;
    return element === actualScope;
  },
  query(context, args2, evaluator) {
    if (args2.length !== 0) throw new Error(`"scope" engine expects no arguments`);
    const actualScope = context.originalScope || context.scope;
    if (actualScope.nodeType === 9) {
      const root = actualScope.documentElement;
      return root ? [root] : [];
    }
    if (actualScope.nodeType === 1) return [actualScope];
    return [];
  }
};
var notEngine = {
  matches(element, args2, context, evaluator) {
    if (args2.length === 0) throw new Error(`"not" engine expects non-empty selector list`);
    return !evaluator.matches(element, args2, context);
  }
};
var lightEngine = {
  query(context, args2, evaluator) {
    return evaluator.query(__spreadProps(__spreadValues({}, context), { pierceShadow: false }), args2);
  },
  matches(element, args2, context, evaluator) {
    return evaluator.matches(element, args2, __spreadProps(__spreadValues({}, context), { pierceShadow: false }));
  }
};
var visibleEngine = {
  matches(element, args2, context, evaluator) {
    if (args2.length) throw new Error(`"visible" engine expects no arguments`);
    return isElementVisible(element);
  }
};
var textEngine = {
  matches(element, args2, context, evaluator) {
    if (args2.length !== 1 || typeof args2[0] !== "string") throw new Error(`"text" engine expects a single string`);
    const text = normalizeWhiteSpace(args2[0]).toLowerCase();
    const matcher = (elementText2) => elementText2.normalized.toLowerCase().includes(text);
    return elementMatchesText(evaluator._cacheText, element, matcher) === "self";
  }
};
var textIsEngine = {
  matches(element, args2, context, evaluator) {
    if (args2.length !== 1 || typeof args2[0] !== "string") throw new Error(`"text-is" engine expects a single string`);
    const text = normalizeWhiteSpace(args2[0]);
    const matcher = (elementText2) => {
      if (!text && !elementText2.immediate.length) return true;
      return elementText2.immediate.some((s) => normalizeWhiteSpace(s) === text);
    };
    return elementMatchesText(evaluator._cacheText, element, matcher) !== "none";
  }
};
var textMatchesEngine = {
  matches(element, args2, context, evaluator) {
    if (args2.length === 0 || typeof args2[0] !== "string" || args2.length > 2 || args2.length === 2 && typeof args2[1] !== "string")
      throw new Error(`"text-matches" engine expects a regexp body and optional regexp flags`);
    const re = new RegExp(args2[0], args2.length === 2 ? args2[1] : void 0);
    const matcher = (elementText2) => re.test(elementText2.full);
    return elementMatchesText(evaluator._cacheText, element, matcher) === "self";
  }
};
var hasTextEngine = {
  matches(element, args2, context, evaluator) {
    if (args2.length !== 1 || typeof args2[0] !== "string") throw new Error(`"has-text" engine expects a single string`);
    if (shouldSkipForTextMatching(element)) return false;
    const text = normalizeWhiteSpace(args2[0]).toLowerCase();
    const matcher = (elementText2) => elementText2.normalized.toLowerCase().includes(text);
    return matcher(elementText(evaluator._cacheText, element));
  }
};
function createLayoutEngine(name) {
  return {
    matches(element, args2, context, evaluator) {
      const maxDistance = args2.length && typeof args2[args2.length - 1] === "number" ? args2[args2.length - 1] : void 0;
      const queryArgs = maxDistance === void 0 ? args2 : args2.slice(0, args2.length - 1);
      if (args2.length < 1 + (maxDistance === void 0 ? 0 : 1))
        throw new Error(`"${name}" engine expects a selector list and optional maximum distance in pixels`);
      const inner = evaluator.query(context, queryArgs);
      const score = layoutSelectorScore(name, element, inner, maxDistance);
      if (score === void 0) return false;
      evaluator._markScore(element, score);
      return true;
    }
  };
}
var nthMatchEngine = {
  query(context, args2, evaluator) {
    let index = args2[args2.length - 1];
    if (args2.length < 2) throw new Error(`"nth-match" engine expects non-empty selector list and an index argument`);
    if (typeof index !== "number" || index < 1)
      throw new Error(`"nth-match" engine expects a one-based index as the last argument`);
    const elements = isEngine.query(context, args2.slice(0, args2.length - 1), evaluator);
    index--;
    return index < elements.length ? [elements[index]] : [];
  }
};
function parentElementOrShadowHostInContext(element, context) {
  if (element === context.scope) return;
  if (!context.pierceShadow) return element.parentElement || void 0;
  return parentElementOrShadowHost(element);
}
function previousSiblingInContext(element, context) {
  if (element === context.scope) return;
  return element.previousElementSibling || void 0;
}
function sortInDOMOrder(elements) {
  const elementToEntry = /* @__PURE__ */ new Map();
  const roots = [];
  const result2 = [];
  function append(element) {
    let entry = elementToEntry.get(element);
    if (entry) return entry;
    const parent = parentElementOrShadowHost(element);
    if (parent) {
      const parentEntry = append(parent);
      parentEntry.children.push(element);
    } else {
      roots.push(element);
    }
    entry = { children: [], taken: false };
    elementToEntry.set(element, entry);
    return entry;
  }
  for (const e of elements) append(e).taken = true;
  function visit(element) {
    const entry = elementToEntry.get(element);
    if (entry.taken) result2.push(element);
    if (entry.children.length > 1) {
      const set = new Set(entry.children);
      entry.children = [];
      let child = element.firstElementChild;
      while (child && entry.children.length < set.size) {
        if (set.has(child)) entry.children.push(child);
        child = child.nextElementSibling;
      }
      child = element.shadowRoot ? element.shadowRoot.firstElementChild : null;
      while (child && entry.children.length < set.size) {
        if (set.has(child)) entry.children.push(child);
        child = child.nextElementSibling;
      }
    }
    entry.children.forEach(visit);
  }
  roots.forEach(visit);
  return result2;
}

// src/content/services/playwright/injected/src/selectorGenerator.ts
var kTextScoreRange = 10;
var kExactPenalty = kTextScoreRange / 2;
var kTestIdScore = 1;
var kOtherTestIdScore = 2;
var kIframeByAttributeScore = 10;
var kBeginPenalizedScore = 50;
var kRoleWithNameScore = 100;
var kPlaceholderScore = 120;
var kLabelScore = 140;
var kAltTextScore = 160;
var kTextScore = 180;
var kTitleScore = 200;
var kTextScoreRegex = 250;
var kPlaceholderScoreExact = kPlaceholderScore + kExactPenalty;
var kLabelScoreExact = kLabelScore + kExactPenalty;
var kRoleWithNameScoreExact = kRoleWithNameScore + kExactPenalty;
var kAltTextScoreExact = kAltTextScore + kExactPenalty;
var kTextScoreExact = kTextScore + kExactPenalty;
var kTitleScoreExact = kTitleScore + kExactPenalty;
var kEndPenalizedScore = 300;
var kCSSIdScore = 500;
var kRoleWithoutNameScore = 510;
var kCSSInputTypeNameScore = 520;
var kCSSTagNameScore = 530;
var kNthScore = 1e4;
var kCSSFallbackScore = 1e7;
var kScoreThresholdForTextExpect = 1e3;
function generateSelector(injectedScript, targetElement, options) {
  var _a2;
  injectedScript._evaluator.begin();
  const cache = { allowText: /* @__PURE__ */ new Map(), disallowText: /* @__PURE__ */ new Map() };
  beginAriaCaches();
  try {
    let selectors = [];
    if (options.forTextExpect) {
      let targetTokens = cssFallback(injectedScript, targetElement.ownerDocument.documentElement, options);
      for (let element = targetElement; element; element = parentElementOrShadowHost(element)) {
        const tokens = generateSelectorFor(cache, injectedScript, element, __spreadProps(__spreadValues({}, options), { noText: true }));
        if (!tokens) continue;
        const score = combineScores(tokens);
        if (score <= kScoreThresholdForTextExpect) {
          targetTokens = tokens;
          break;
        }
      }
      selectors = [joinTokens(targetTokens)];
    } else {
      if (!targetElement.matches("input,textarea,select") && !targetElement.isContentEditable && !options.isVerifyingText) {
        const interactiveParent = closestCrossShadow(
          targetElement,
          "button,select,input,[role=button],[role=checkbox],[role=radio],a,[role=link]",
          options.root
        );
        if (interactiveParent && isElementVisible(interactiveParent)) targetElement = interactiveParent;
      }
      if (options.multiple) {
        const withText = generateSelectorFor(cache, injectedScript, targetElement, options);
        const withoutText = generateSelectorFor(cache, injectedScript, targetElement, __spreadProps(__spreadValues({}, options), { noText: true }));
        let tokens = [withText, withoutText];
        cache.allowText.clear();
        cache.disallowText.clear();
        if (withText && hasCSSIdToken(withText))
          tokens.push(generateSelectorFor(cache, injectedScript, targetElement, __spreadProps(__spreadValues({}, options), { noCSSId: true })));
        if (withoutText && hasCSSIdToken(withoutText))
          tokens.push(
            generateSelectorFor(cache, injectedScript, targetElement, __spreadProps(__spreadValues({}, options), { noText: true, noCSSId: true }))
          );
        tokens = tokens.filter(Boolean);
        if (!tokens.length) {
          const css = cssFallback(injectedScript, targetElement, options);
          tokens.push(css);
          if (hasCSSIdToken(css))
            tokens.push(cssFallback(injectedScript, targetElement, __spreadProps(__spreadValues({}, options), { noCSSId: true })));
        }
        selectors = [...new Set(tokens.map((t) => joinTokens(t)))];
      } else {
        const targetTokens = generateSelectorFor(cache, injectedScript, targetElement, options) || cssFallback(injectedScript, targetElement, options);
        selectors = [joinTokens(targetTokens)];
      }
    }
    const selector = selectors[0];
    const parsedSelector = injectedScript.parseSelector(selector);
    return {
      selector,
      selectors,
      elements: injectedScript.querySelectorAll(parsedSelector, (_a2 = options.root) != null ? _a2 : targetElement.ownerDocument)
    };
  } finally {
    endAriaCaches();
    injectedScript._evaluator.end();
  }
}
function filterRegexTokens(textCandidates) {
  return textCandidates.filter((c) => c[0].selector[0] !== "/");
}
function generateSelectorFor(cache, injectedScript, targetElement, options) {
  if (options.root && !isInsideScope(options.root, targetElement))
    throw new Error(`Target element must belong to the root's subtree`);
  if (targetElement === options.root) return [{ engine: "css", selector: ":scope", score: 1 }];
  if (targetElement.ownerDocument.documentElement === targetElement)
    return [{ engine: "css", selector: "html", score: 1 }];
  const calculate = (element, allowText) => {
    var _a2;
    const allowNthMatch = element === targetElement;
    let textCandidates = allowText ? buildTextCandidates(injectedScript, element, element === targetElement) : [];
    if (element !== targetElement) {
      textCandidates = filterRegexTokens(textCandidates);
    }
    const noTextCandidates = buildNoTextCandidates(injectedScript, element, options).filter((token) => !options.omitInternalEngines || !token.engine.startsWith("internal:")).map((token) => [token]);
    let result2 = chooseFirstSelector(
      injectedScript,
      (_a2 = options.root) != null ? _a2 : targetElement.ownerDocument,
      element,
      [...textCandidates, ...noTextCandidates],
      allowNthMatch
    );
    textCandidates = filterRegexTokens(textCandidates);
    const checkWithText = (textCandidatesToUse) => {
      const allowParentText = allowText && !textCandidatesToUse.length;
      const candidates = [...textCandidatesToUse, ...noTextCandidates].filter((c) => {
        if (!result2) return true;
        return combineScores(c) < combineScores(result2);
      });
      let bestPossibleInParent = candidates[0];
      if (!bestPossibleInParent) return;
      for (let parent = parentElementOrShadowHost(element); parent && parent !== options.root; parent = parentElementOrShadowHost(parent)) {
        const parentTokens = calculateCached(parent, allowParentText);
        if (!parentTokens) continue;
        if (result2 && combineScores([...parentTokens, ...bestPossibleInParent]) >= combineScores(result2)) continue;
        bestPossibleInParent = chooseFirstSelector(injectedScript, parent, element, candidates, allowNthMatch);
        if (!bestPossibleInParent) return;
        const combined = [...parentTokens, ...bestPossibleInParent];
        if (!result2 || combineScores(combined) < combineScores(result2)) result2 = combined;
      }
    };
    checkWithText(textCandidates);
    if (element === targetElement && textCandidates.length) checkWithText([]);
    return result2;
  };
  const calculateCached = (element, allowText) => {
    const map = allowText ? cache.allowText : cache.disallowText;
    let value = map.get(element);
    if (value === void 0) {
      value = calculate(element, allowText);
      map.set(element, value);
    }
    return value;
  };
  return calculate(targetElement, !options.noText);
}
function buildNoTextCandidates(injectedScript, element, options) {
  const candidates = [];
  {
    for (const attr of ["data-testid", "data-test-id", "data-test"]) {
      if (attr !== options.testIdAttributeName && element.getAttribute(attr))
        candidates.push({
          engine: "css",
          selector: `[${attr}=${quoteCSSAttributeValue(element.getAttribute(attr))}]`,
          score: kOtherTestIdScore
        });
    }
    if (!options.noCSSId) {
      const idAttr = element.getAttribute("id");
      if (idAttr && !isGuidLike(idAttr) && !isDynamicId(idAttr))
        candidates.push({ engine: "css", selector: makeSelectorForId(idAttr), score: kCSSIdScore });
    }
    candidates.push({ engine: "css", selector: cssEscape(element.nodeName.toLowerCase()), score: kCSSTagNameScore });
  }
  if (element.nodeName === "IFRAME") {
    for (const attribute of ["name", "title"]) {
      if (element.getAttribute(attribute))
        candidates.push({
          engine: "css",
          selector: `${cssEscape(element.nodeName.toLowerCase())}[${attribute}=${quoteCSSAttributeValue(element.getAttribute(attribute))}]`,
          score: kIframeByAttributeScore
        });
    }
    if (element.getAttribute(options.testIdAttributeName))
      candidates.push({
        engine: "css",
        selector: `[${options.testIdAttributeName}=${quoteCSSAttributeValue(element.getAttribute(options.testIdAttributeName))}]`,
        score: kTestIdScore
      });
    penalizeScoreForLength([candidates]);
    return candidates;
  }
  if (element.getAttribute(options.testIdAttributeName))
    candidates.push({
      engine: "internal:testid",
      selector: `[${options.testIdAttributeName}=${escapeForAttributeSelector(element.getAttribute(options.testIdAttributeName), true)}]`,
      score: kTestIdScore
    });
  if (element.nodeName === "INPUT" || element.nodeName === "TEXTAREA") {
    const input = element;
    if (input.placeholder) {
      candidates.push({
        engine: "internal:attr",
        selector: `[placeholder=${escapeForAttributeSelector(input.placeholder, true)}]`,
        score: kPlaceholderScoreExact
      });
      for (const alternative of suitableTextAlternatives(input.placeholder))
        candidates.push({
          engine: "internal:attr",
          selector: `[placeholder=${escapeForAttributeSelector(alternative.text, false)}]`,
          score: kPlaceholderScore - alternative.scoreBonus
        });
    }
  }
  const labels = getElementLabels(injectedScript._evaluator._cacheText, element);
  for (const label of labels) {
    const labelText = label.normalized;
    candidates.push({
      engine: "internal:label",
      selector: escapeForTextSelector(labelText, true),
      score: kLabelScoreExact
    });
    for (const alternative of suitableTextAlternatives(labelText))
      candidates.push({
        engine: "internal:label",
        selector: escapeForTextSelector(alternative.text, false),
        score: kLabelScore - alternative.scoreBonus
      });
  }
  const ariaRole = getAriaRole(element);
  if (ariaRole && !["none", "presentation"].includes(ariaRole))
    candidates.push({ engine: "internal:role", selector: ariaRole, score: kRoleWithoutNameScore });
  if (element.getAttribute("name") && [
    "BUTTON",
    "FORM",
    "FIELDSET",
    "FRAME",
    "IFRAME",
    "INPUT",
    "KEYGEN",
    "OBJECT",
    "OUTPUT",
    "SELECT",
    "TEXTAREA",
    "MAP",
    "META",
    "PARAM"
  ].includes(element.nodeName))
    candidates.push({
      engine: "css",
      selector: `${cssEscape(element.nodeName.toLowerCase())}[name=${quoteCSSAttributeValue(element.getAttribute("name"))}]`,
      score: kCSSInputTypeNameScore
    });
  if (["INPUT", "TEXTAREA"].includes(element.nodeName) && element.getAttribute("type") !== "hidden") {
    if (element.getAttribute("type"))
      candidates.push({
        engine: "css",
        selector: `${cssEscape(element.nodeName.toLowerCase())}[type=${quoteCSSAttributeValue(element.getAttribute("type"))}]`,
        score: kCSSInputTypeNameScore
      });
  }
  if (["INPUT", "TEXTAREA", "SELECT"].includes(element.nodeName) && element.getAttribute("type") !== "hidden")
    candidates.push({
      engine: "css",
      selector: cssEscape(element.nodeName.toLowerCase()),
      score: kCSSInputTypeNameScore + 1
    });
  penalizeScoreForLength([candidates]);
  return candidates;
}
function buildTextCandidates(injectedScript, element, isTargetNode) {
  if (element.nodeName === "SELECT") return [];
  const candidates = [];
  const title = element.getAttribute("title");
  if (title) {
    candidates.push([
      {
        engine: "internal:attr",
        selector: `[title=${escapeForAttributeSelector(title, true)}]`,
        score: kTitleScoreExact
      }
    ]);
    for (const alternative of suitableTextAlternatives(title))
      candidates.push([
        {
          engine: "internal:attr",
          selector: `[title=${escapeForAttributeSelector(alternative.text, false)}]`,
          score: kTitleScore - alternative.scoreBonus
        }
      ]);
  }
  const alt = element.getAttribute("alt");
  if (alt && ["APPLET", "AREA", "IMG", "INPUT"].includes(element.nodeName)) {
    candidates.push([
      {
        engine: "internal:attr",
        selector: `[alt=${escapeForAttributeSelector(alt, true)}]`,
        score: kAltTextScoreExact
      }
    ]);
    for (const alternative of suitableTextAlternatives(alt))
      candidates.push([
        {
          engine: "internal:attr",
          selector: `[alt=${escapeForAttributeSelector(alternative.text, false)}]`,
          score: kAltTextScore - alternative.scoreBonus
        }
      ]);
  }
  const text = elementText(injectedScript._evaluator._cacheText, element).normalized;
  const textAlternatives = text ? suitableTextAlternatives(text) : [];
  if (text) {
    if (isTargetNode) {
      if (text.length <= 80)
        candidates.push([
          { engine: "internal:text", selector: escapeForTextSelector(text, true), score: kTextScoreExact }
        ]);
      for (const alternative of textAlternatives)
        candidates.push([
          {
            engine: "internal:text",
            selector: escapeForTextSelector(alternative.text, false),
            score: kTextScore - alternative.scoreBonus
          }
        ]);
    }
    const cssToken = {
      engine: "css",
      selector: cssEscape(element.nodeName.toLowerCase()),
      score: kCSSTagNameScore
    };
    for (const alternative of textAlternatives)
      candidates.push([
        cssToken,
        {
          engine: "internal:has-text",
          selector: escapeForTextSelector(alternative.text, false),
          score: kTextScore - alternative.scoreBonus
        }
      ]);
    if (text.length <= 80) {
      const re = new RegExp("^" + escapeRegExp(text) + "$");
      candidates.push([
        cssToken,
        { engine: "internal:has-text", selector: escapeForTextSelector(re, false), score: kTextScoreRegex }
      ]);
    }
  }
  const ariaRole = getAriaRole(element);
  if (ariaRole && !["none", "presentation"].includes(ariaRole)) {
    const ariaName = getElementAccessibleName(element, false);
    if (ariaName) {
      const roleToken = {
        engine: "internal:role",
        selector: `${ariaRole}[name=${escapeForAttributeSelector(ariaName, true)}]`,
        score: kRoleWithNameScoreExact
      };
      candidates.push([roleToken]);
      for (const alternative of suitableTextAlternatives(ariaName))
        candidates.push([
          {
            engine: "internal:role",
            selector: `${ariaRole}[name=${escapeForAttributeSelector(alternative.text, false)}]`,
            score: kRoleWithNameScore - alternative.scoreBonus
          }
        ]);
    } else {
      const roleToken = { engine: "internal:role", selector: `${ariaRole}`, score: kRoleWithoutNameScore };
      for (const alternative of textAlternatives)
        candidates.push([
          roleToken,
          {
            engine: "internal:has-text",
            selector: escapeForTextSelector(alternative.text, false),
            score: kTextScore - alternative.scoreBonus
          }
        ]);
      if (text.length <= 80) {
        const re = new RegExp("^" + escapeRegExp(text) + "$");
        candidates.push([
          roleToken,
          { engine: "internal:has-text", selector: escapeForTextSelector(re, false), score: kTextScoreRegex }
        ]);
      }
    }
  }
  penalizeScoreForLength(candidates);
  return candidates;
}
function makeSelectorForId(id) {
  return /^[a-zA-Z][a-zA-Z0-9\-\_]+$/.test(id) ? "#" + id : `[id="${cssEscape(id)}"]`;
}
function hasCSSIdToken(tokens) {
  return tokens.some(
    (token) => token.engine === "css" && (token.selector.startsWith("#") || token.selector.startsWith('[id="'))
  );
}
function cssFallback(injectedScript, targetElement, options) {
  var _a2;
  const root = (_a2 = options.root) != null ? _a2 : targetElement.ownerDocument;
  const tokens = [];
  function uniqueCSSSelector(prefix) {
    const path = tokens.slice();
    if (prefix) path.unshift(prefix);
    const selector = path.join(" > ");
    const parsedSelector = injectedScript.parseSelector(selector);
    const node = injectedScript.querySelector(parsedSelector, root, false);
    return node === targetElement ? selector : void 0;
  }
  function makeStrict(selector) {
    const token = { engine: "css", selector, score: kCSSFallbackScore };
    const parsedSelector = injectedScript.parseSelector(selector);
    const elements = injectedScript.querySelectorAll(parsedSelector, root);
    if (elements.length === 1) return [token];
    const nth = { engine: "nth", selector: String(elements.indexOf(targetElement)), score: kNthScore };
    return [token, nth];
  }
  for (let element = targetElement; element && element !== root; element = parentElementOrShadowHost(element)) {
    const nodeName = element.nodeName.toLowerCase();
    let bestTokenForLevel = "";
    if (element.id && !options.noCSSId && !isDynamicId(element.id)) {
      const token = makeSelectorForId(element.id);
      const selector = uniqueCSSSelector(token);
      if (selector) return makeStrict(selector);
      bestTokenForLevel = token;
    }
    const parent = element.parentNode;
    const classes = [...element.classList];
    for (let i = 0; i < classes.length; ++i) {
      const token = "." + cssEscape(classes.slice(0, i + 1).join("."));
      const selector = uniqueCSSSelector(token);
      if (selector) return makeStrict(selector);
      if (!bestTokenForLevel && parent) {
        const sameClassSiblings = parent.querySelectorAll(token);
        if (sameClassSiblings.length === 1) bestTokenForLevel = token;
      }
    }
    if (parent) {
      const siblings = [...parent.children];
      const sameTagSiblings = siblings.filter((sibling) => sibling.nodeName.toLowerCase() === nodeName);
      const token = sameTagSiblings.indexOf(element) === 0 ? cssEscape(nodeName) : `${cssEscape(nodeName)}:nth-child(${1 + siblings.indexOf(element)})`;
      const selector = uniqueCSSSelector(token);
      if (selector) return makeStrict(selector);
      if (!bestTokenForLevel) bestTokenForLevel = token;
    } else if (!bestTokenForLevel) {
      bestTokenForLevel = cssEscape(nodeName);
    }
    tokens.unshift(bestTokenForLevel);
  }
  return makeStrict(uniqueCSSSelector());
}
function penalizeScoreForLength(groups) {
  for (const group of groups) {
    for (const token of group) {
      if (token.score > kBeginPenalizedScore && token.score < kEndPenalizedScore)
        token.score += Math.min(kTextScoreRange, token.selector.length / 10 | 0);
    }
  }
}
function joinTokens(tokens) {
  const parts = [];
  let lastEngine = "";
  for (const { engine, selector } of tokens) {
    if (parts.length && (lastEngine !== "css" || engine !== "css" || selector.startsWith(":nth-match(")))
      parts.push(">>");
    lastEngine = engine;
    if (engine === "css") parts.push(selector);
    else parts.push(`${engine}=${selector}`);
  }
  return parts.join(" ");
}
function combineScores(tokens) {
  let score = 0;
  for (let i = 0; i < tokens.length; i++) score += tokens[i].score * (tokens.length - i);
  return score;
}
function chooseFirstSelector(injectedScript, scope, targetElement, selectors, allowNthMatch) {
  const joined = selectors.map((tokens) => ({ tokens, score: combineScores(tokens) }));
  joined.sort((a, b) => a.score - b.score);
  let bestWithIndex = null;
  for (const { tokens } of joined) {
    const parsedSelector = injectedScript.parseSelector(joinTokens(tokens));
    const result2 = injectedScript.querySelectorAll(parsedSelector, scope);
    if (result2[0] === targetElement && result2.length === 1) {
      return tokens;
    }
    const index = result2.indexOf(targetElement);
    if (!allowNthMatch || bestWithIndex || index === -1 || result2.length > 5) continue;
    const nth = { engine: "nth", selector: String(index), score: kNthScore };
    bestWithIndex = [...tokens, nth];
  }
  return bestWithIndex;
}
function isGuidLike(id) {
  let lastCharacterType;
  let transitionCount = 0;
  for (let i = 0; i < id.length; ++i) {
    const c = id[i];
    let characterType;
    if (c === "-" || c === "_") continue;
    if (c >= "a" && c <= "z") characterType = "lower";
    else if (c >= "A" && c <= "Z") characterType = "upper";
    else if (c >= "0" && c <= "9") characterType = "digit";
    else characterType = "other";
    if (characterType === "lower" && lastCharacterType === "upper") {
      lastCharacterType = characterType;
      continue;
    }
    if (lastCharacterType && lastCharacterType !== characterType) ++transitionCount;
    lastCharacterType = characterType;
  }
  return transitionCount >= id.length / 4;
}
function trimWordBoundary(text, maxLength) {
  if (text.length <= maxLength) return text;
  text = text.substring(0, maxLength);
  const match = text.match(/^(.*)\b(.+?)$/);
  if (!match) return "";
  return match[1].trimEnd();
}
function suitableTextAlternatives(text) {
  let result2 = [];
  {
    const match = text.match(/^([\d.,]+)[^.,\w]/);
    const leadingNumberLength = match ? match[1].length : 0;
    if (leadingNumberLength) {
      const alt = trimWordBoundary(text.substring(leadingNumberLength).trimStart(), 80);
      result2.push({ text: alt, scoreBonus: alt.length <= 30 ? 2 : 1 });
    }
  }
  {
    const match = text.match(/[^.,\w]([\d.,]+)$/);
    const trailingNumberLength = match ? match[1].length : 0;
    if (trailingNumberLength) {
      const alt = trimWordBoundary(text.substring(0, text.length - trailingNumberLength).trimEnd(), 80);
      result2.push({ text: alt, scoreBonus: alt.length <= 30 ? 2 : 1 });
    }
  }
  if (text.length <= 30) {
    result2.push({ text, scoreBonus: 0 });
  } else {
    result2.push({ text: trimWordBoundary(text, 80), scoreBonus: 0 });
    result2.push({ text: trimWordBoundary(text, 30), scoreBonus: 1 });
  }
  result2 = result2.filter((r) => r.text);
  if (!result2.length) result2.push({ text: text.substring(0, 80), scoreBonus: 0 });
  return result2;
}
function isDynamicId(id) {
  const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}/i;
  const isEntirelyNumbers = /^\d+$/;
  const timeBasedIds = /\d{13,}$/;
  const libPrefixes = /^(rc[-_]|r[-_]|react[-_]|ember\d+|vue[-_]|ng[-_]|ember[-_]|ext[-_]|comp[-_]|mantine[-_]|mui[-_]|chakra[-_]|ant[-_]|antd[-_]|bs[-_]|bootstrap[-_]|radix[-_]|headlessui[-_]|headless[-_]|p[-_]|prime[-_]|sui[-_]|semantic[-_])|kon[-_]|rf[-_]/i;
  const randomColonsPattern = /:\w+:/;
  const digitSuffix = /[-_](?=.*\d)[a-z\d]{4,}$/i;
  const randomAlphanumericPattern = /^(?=.*[a-z])(?=.*[0-9])[a-z0-9]{8,}$|^[a-z0-9]{12,}$/i;
  const semanticPattern = /^_?[a-zA-Z][a-zA-Z0-9]*(?:([A-Z][a-zA-Z0-9]+)|([-_]{1,2}[a-zA-Z0-9]+))*$/;
  return uuidPattern.test(id) || isEntirelyNumbers.test(id) || timeBasedIds.test(id) || libPrefixes.test(id) || randomColonsPattern.test(id) || digitSuffix.test(id) || randomAlphanumericPattern.test(id) || !semanticPattern.test(id);
}

// src/content/services/playwright/injected/src/vueSelectorEngine.ts
function basename(filename, ext) {
  const normalized = filename.replace(/^[a-zA-Z]:/, "").replace(/\\/g, "/");
  let result2 = normalized.substring(normalized.lastIndexOf("/") + 1);
  if (ext && result2.endsWith(ext)) result2 = result2.substring(0, result2.length - ext.length);
  return result2;
}
function toUpper(_, c) {
  return c ? c.toUpperCase() : "";
}
var classifyRE = /(?:^|[-_/])(\w)/g;
var classify = (str) => {
  return str && str.replace(classifyRE, toUpper);
};
function buildComponentsTreeVue3(instance) {
  function getComponentTypeName(options) {
    const name = options.name || options._componentTag || options.__playwright_guessedName;
    if (name) return name;
    const file = options.__file;
    if (file) return classify(basename(file, ".vue"));
  }
  function saveComponentName(instance2, key) {
    instance2.type.__playwright_guessedName = key;
    return key;
  }
  function getInstanceName(instance2) {
    var _a2, _b, _c, _d;
    const name = getComponentTypeName(instance2.type || {});
    if (name) return name;
    if (instance2.root === instance2) return "Root";
    for (const key in (_b = (_a2 = instance2.parent) == null ? void 0 : _a2.type) == null ? void 0 : _b.components) {
      if (((_c = instance2.parent) == null ? void 0 : _c.type.components[key]) === instance2.type) return saveComponentName(instance2, key);
    }
    for (const key in (_d = instance2.appContext) == null ? void 0 : _d.components) {
      if (instance2.appContext.components[key] === instance2.type) return saveComponentName(instance2, key);
    }
    return "Anonymous Component";
  }
  function isBeingDestroyed(instance2) {
    return instance2._isBeingDestroyed || instance2.isUnmounted;
  }
  function isFragment(instance2) {
    return instance2.subTree.type.toString() === "Symbol(Fragment)";
  }
  function getInternalInstanceChildren(subTree) {
    const list = [];
    if (subTree.component) list.push(subTree.component);
    if (subTree.suspense) list.push(...getInternalInstanceChildren(subTree.suspense.activeBranch));
    if (Array.isArray(subTree.children)) {
      subTree.children.forEach((childSubTree) => {
        if (childSubTree.component) list.push(childSubTree.component);
        else list.push(...getInternalInstanceChildren(childSubTree));
      });
    }
    return list.filter((child) => {
      var _a2;
      return !isBeingDestroyed(child) && !((_a2 = child.type.devtools) == null ? void 0 : _a2.hide);
    });
  }
  function getRootElementsFromComponentInstance(instance2) {
    if (isFragment(instance2)) return getFragmentRootElements(instance2.subTree);
    return [instance2.subTree.el];
  }
  function getFragmentRootElements(vnode) {
    if (!vnode.children) return [];
    const list = [];
    for (let i = 0, l = vnode.children.length; i < l; i++) {
      const childVnode = vnode.children[i];
      if (childVnode.component) list.push(...getRootElementsFromComponentInstance(childVnode.component));
      else if (childVnode.el) list.push(childVnode.el);
    }
    return list;
  }
  function buildComponentsTree2(instance2) {
    return {
      name: getInstanceName(instance2),
      children: getInternalInstanceChildren(instance2.subTree).map(buildComponentsTree2),
      rootElements: getRootElementsFromComponentInstance(instance2),
      props: instance2.props
    };
  }
  return buildComponentsTree2(instance);
}
function buildComponentsTreeVue2(instance) {
  function getComponentName2(options) {
    const name = options.displayName || options.name || options._componentTag;
    if (name) return name;
    const file = options.__file;
    if (file) return classify(basename(file, ".vue"));
  }
  function getInstanceName(instance2) {
    const name = getComponentName2(instance2.$options || instance2.fnOptions || {});
    if (name) return name;
    return instance2.$root === instance2 ? "Root" : "Anonymous Component";
  }
  function getInternalInstanceChildren(instance2) {
    if (instance2.$children) return instance2.$children;
    if (Array.isArray(instance2.subTree.children))
      return instance2.subTree.children.filter((vnode) => !!vnode.component).map((vnode) => vnode.component);
    return [];
  }
  function buildComponentsTree2(instance2) {
    return {
      name: getInstanceName(instance2),
      children: getInternalInstanceChildren(instance2).map(buildComponentsTree2),
      rootElements: [instance2.$el],
      props: instance2._props
    };
  }
  return buildComponentsTree2(instance);
}
function filterComponentsTree2(treeNode, searchFn, result2 = []) {
  if (searchFn(treeNode)) result2.push(treeNode);
  for (const child of treeNode.children) filterComponentsTree2(child, searchFn, result2);
  return result2;
}
function findVueRoots(root, roots = []) {
  const document2 = root.ownerDocument || root;
  const walker = document2.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const vue2Roots = /* @__PURE__ */ new Set();
  do {
    const node = walker.currentNode;
    if (node.__vue__) vue2Roots.add(node.__vue__.$root);
    if (node.__vue_app__ && node._vnode && node._vnode.component)
      roots.push({ root: node._vnode.component, version: 3 });
    const shadowRoot = node instanceof Element ? node.shadowRoot : null;
    if (shadowRoot) findVueRoots(shadowRoot, roots);
  } while (walker.nextNode());
  for (const vue2root of vue2Roots) {
    roots.push({
      version: 2,
      root: vue2root
    });
  }
  return roots;
}
var createVueEngine = () => ({
  queryAll(scope, selector) {
    const document2 = scope.ownerDocument || scope;
    const { name, attributes } = parseAttributeSelector(selector, false);
    const vueRoots = findVueRoots(document2);
    const trees = vueRoots.map(
      (vueRoot) => vueRoot.version === 3 ? buildComponentsTreeVue3(vueRoot.root) : buildComponentsTreeVue2(vueRoot.root)
    );
    const treeNodes = trees.map(
      (tree) => filterComponentsTree2(tree, (treeNode) => {
        if (name && treeNode.name !== name) return false;
        if (treeNode.rootElements.some((rootElement) => !isInsideScope(scope, rootElement))) return false;
        for (const attr of attributes) {
          if (!matchesComponentAttribute(treeNode.props, attr)) return false;
        }
        return true;
      })
    ).flat();
    const allRootElements = /* @__PURE__ */ new Set();
    for (const treeNode of treeNodes) {
      for (const rootElement of treeNode.rootElements) allRootElements.add(rootElement);
    }
    return [...allRootElements];
  }
});

// src/content/services/playwright/injected/src/xpathSelectorEngine.ts
var XPathEngine = {
  queryAll(root, selector) {
    if (selector.startsWith("/") && root.nodeType !== Node.DOCUMENT_NODE)
      selector = "." + selector;
    const result2 = [];
    const document2 = root.ownerDocument || root;
    if (!document2)
      return result2;
    const it = document2.evaluate(selector, root, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE);
    for (let node = it.iterateNext(); node; node = it.iterateNext()) {
      if (node.nodeType === Node.ELEMENT_NODE)
        result2.push(node);
    }
    return result2;
  }
};

// src/content/services/playwright/utils/isomorphic/locatorUtils.ts
function getByAttributeTextSelector(attrName, text, options) {
  return `internal:attr=[${attrName}=${escapeForAttributeSelector(text, (options == null ? void 0 : options.exact) || false)}]`;
}
function getByTestIdSelector(testIdAttributeName, testId) {
  return `internal:testid=[${testIdAttributeName}=${escapeForAttributeSelector(testId, true)}]`;
}
function getByLabelSelector(text, options) {
  return "internal:label=" + escapeForTextSelector(text, !!(options == null ? void 0 : options.exact));
}
function getByAltTextSelector(text, options) {
  return getByAttributeTextSelector("alt", text, options);
}
function getByTitleSelector(text, options) {
  return getByAttributeTextSelector("title", text, options);
}
function getByPlaceholderSelector(text, options) {
  return getByAttributeTextSelector("placeholder", text, options);
}
function getByTextSelector(text, options) {
  return "internal:text=" + escapeForTextSelector(text, !!(options == null ? void 0 : options.exact));
}
function getByRoleSelector(role, options = {}) {
  const props = [];
  if (options.checked !== void 0)
    props.push(["checked", String(options.checked)]);
  if (options.disabled !== void 0)
    props.push(["disabled", String(options.disabled)]);
  if (options.selected !== void 0)
    props.push(["selected", String(options.selected)]);
  if (options.expanded !== void 0)
    props.push(["expanded", String(options.expanded)]);
  if (options.includeHidden !== void 0)
    props.push(["include-hidden", String(options.includeHidden)]);
  if (options.level !== void 0)
    props.push(["level", String(options.level)]);
  if (options.name !== void 0)
    props.push(["name", escapeForAttributeSelector(options.name, !!options.exact)]);
  if (options.pressed !== void 0)
    props.push(["pressed", String(options.pressed)]);
  return `internal:role=${role}${props.map(([n, v]) => `[${n}=${v}]`).join("")}`;
}

// src/content/services/playwright/injected/src/consoleApi.ts
var selectorSymbol = Symbol("selector");
var _a;
_a = selectorSymbol;
var _Locator = class _Locator {
  constructor(injectedScript, selector, options) {
    __publicField(this, _a);
    __publicField(this, "element");
    __publicField(this, "elements");
    if (options == null ? void 0 : options.hasText) selector += ` >> internal:has-text=${escapeForTextSelector(options.hasText, false)}`;
    if (options == null ? void 0 : options.hasNotText)
      selector += ` >> internal:has-not-text=${escapeForTextSelector(options.hasNotText, false)}`;
    if (options == null ? void 0 : options.has) selector += ` >> internal:has=` + JSON.stringify(options.has[selectorSymbol]);
    if (options == null ? void 0 : options.hasNot) selector += ` >> internal:has-not=` + JSON.stringify(options.hasNot[selectorSymbol]);
    if ((options == null ? void 0 : options.visible) !== void 0) selector += ` >> visible=${options.visible ? "true" : "false"}`;
    this[selectorSymbol] = selector;
    if (selector) {
      const parsed = injectedScript.parseSelector(selector);
      this.element = injectedScript.querySelector(parsed, injectedScript.document, false);
      this.elements = injectedScript.querySelectorAll(parsed, injectedScript.document);
    }
    const selectorBase = selector;
    const self = this;
    self.locator = (selector2, options2) => {
      return new _Locator(injectedScript, selectorBase ? selectorBase + " >> " + selector2 : selector2, options2);
    };
    self.getByTestId = (testId) => self.locator(getByTestIdSelector(injectedScript.testIdAttributeNameForStrictErrorAndConsoleCodegen(), testId));
    self.getByAltText = (text, options2) => self.locator(getByAltTextSelector(text, options2));
    self.getByLabel = (text, options2) => self.locator(getByLabelSelector(text, options2));
    self.getByPlaceholder = (text, options2) => self.locator(getByPlaceholderSelector(text, options2));
    self.getByText = (text, options2) => self.locator(getByTextSelector(text, options2));
    self.getByTitle = (text, options2) => self.locator(getByTitleSelector(text, options2));
    self.getByRole = (role, options2 = {}) => self.locator(getByRoleSelector(role, options2));
    self.filter = (options2) => new _Locator(injectedScript, selector, options2);
    self.first = () => self.locator("nth=0");
    self.last = () => self.locator("nth=-1");
    self.nth = (index) => self.locator(`nth=${index}`);
    self.and = (locator) => new _Locator(injectedScript, selectorBase + ` >> internal:and=` + JSON.stringify(locator[selectorSymbol]));
    self.or = (locator) => new _Locator(injectedScript, selectorBase + ` >> internal:or=` + JSON.stringify(locator[selectorSymbol]));
  }
};
var Locator = _Locator;
var ConsoleAPI = class {
  constructor(injectedScript) {
    __publicField(this, "_injectedScript");
    this._injectedScript = injectedScript;
  }
  install() {
    if (this._injectedScript.window.playwright) return;
    this._injectedScript.window.playwright = __spreadValues({
      $: (selector, strict) => this._querySelector(selector, !!strict),
      $: (selector) => this._querySelectorAll(selector),
      inspect: (selector) => this._inspect(selector),
      selector: (element) => this._selector(element),
      generateLocator: (element, language) => this._generateLocator(element, language),
      ariaSnapshot: (element, options) => {
        return this._injectedScript.ariaSnapshot(element || this._injectedScript.document.body, options);
      },
      resume: () => this._resume()
    }, new Locator(this._injectedScript, ""));
    delete this._injectedScript.window.playwright.filter;
    delete this._injectedScript.window.playwright.first;
    delete this._injectedScript.window.playwright.last;
    delete this._injectedScript.window.playwright.nth;
    delete this._injectedScript.window.playwright.and;
    delete this._injectedScript.window.playwright.or;
  }
  _querySelector(selector, strict) {
    if (typeof selector !== "string") throw new Error(`Usage: playwright.query('Playwright >> selector').`);
    const parsed = this._injectedScript.parseSelector(selector);
    return this._injectedScript.querySelector(parsed, this._injectedScript.document, strict);
  }
  _querySelectorAll(selector) {
    if (typeof selector !== "string") throw new Error(`Usage: playwright.$('Playwright >> selector').`);
    const parsed = this._injectedScript.parseSelector(selector);
    return this._injectedScript.querySelectorAll(parsed, this._injectedScript.document);
  }
  _inspect(selector) {
    if (typeof selector !== "string") throw new Error(`Usage: playwright.inspect('Playwright >> selector').`);
    this._injectedScript.window.inspect(this._querySelector(selector, false));
  }
  _selector(element) {
    if (!(element instanceof Element)) throw new Error(`Usage: playwright.selector(element).`);
    return this._injectedScript.generateSelectorSimple(element);
  }
  _generateLocator(element, language) {
    if (!(element instanceof Element)) throw new Error(`Usage: playwright.locator(element).`);
    const selector = this._injectedScript.generateSelectorSimple(element);
    return asLocator(language || "javascript", selector);
  }
  _resume() {
    this._injectedScript.window.__pw_resume().catch(() => {
    });
  }
};

// src/content/services/playwright/utils/isomorphic/utilityScriptSerializers.ts
function isRegExp2(obj) {
  try {
    return obj instanceof RegExp || Object.prototype.toString.call(obj) === "[object RegExp]";
  } catch (error) {
    return false;
  }
}
function isDate(obj) {
  try {
    return obj instanceof Date || Object.prototype.toString.call(obj) === "[object Date]";
  } catch (error) {
    return false;
  }
}
function isURL(obj) {
  try {
    return obj instanceof URL || Object.prototype.toString.call(obj) === "[object URL]";
  } catch (error) {
    return false;
  }
}
function isError(obj) {
  var _a2;
  try {
    return obj instanceof Error || obj && ((_a2 = Object.getPrototypeOf(obj)) == null ? void 0 : _a2.name) === "Error";
  } catch (error) {
    return false;
  }
}
function isTypedArray(obj, constructor) {
  try {
    return obj instanceof constructor || Object.prototype.toString.call(obj) === `[object ${constructor.name}]`;
  } catch (error) {
    return false;
  }
}
var typedArrayConstructors = {
  i8: Int8Array,
  ui8: Uint8Array,
  ui8c: Uint8ClampedArray,
  i16: Int16Array,
  ui16: Uint16Array,
  i32: Int32Array,
  ui32: Uint32Array,
  // TODO: add Float16Array once it's in baseline
  f32: Float32Array,
  f64: Float64Array,
  bi64: BigInt64Array,
  bui64: BigUint64Array
};
function typedArrayToBase64(array) {
  if ("toBase64" in array)
    return array.toBase64();
  const binary = Array.from(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)).map((b) => String.fromCharCode(b)).join("");
  return btoa(binary);
}
function base64ToTypedArray(base64, TypedArrayConstructor) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++)
    bytes[i] = binary.charCodeAt(i);
  return new TypedArrayConstructor(bytes.buffer);
}
function parseEvaluationResultValue(value, handles2 = [], refs = /* @__PURE__ */ new Map()) {
  if (Object.is(value, void 0))
    return void 0;
  if (typeof value === "object" && value) {
    if ("ref" in value)
      return refs.get(value.ref);
    if ("v" in value) {
      if (value.v === "undefined")
        return void 0;
      if (value.v === "null")
        return null;
      if (value.v === "NaN")
        return NaN;
      if (value.v === "Infinity")
        return Infinity;
      if (value.v === "-Infinity")
        return -Infinity;
      if (value.v === "-0")
        return -0;
      return void 0;
    }
    if ("d" in value)
      return new Date(value.d);
    if ("u" in value)
      return new URL(value.u);
    if ("bi" in value)
      return BigInt(value.bi);
    if ("e" in value) {
      const error = new Error(value.e.m);
      error.name = value.e.n;
      error.stack = value.e.s;
      return error;
    }
    if ("r" in value)
      return new RegExp(value.r.p, value.r.f);
    if ("a" in value) {
      const result2 = [];
      refs.set(value.id, result2);
      for (const a of value.a)
        result2.push(parseEvaluationResultValue(a, handles2, refs));
      return result2;
    }
    if ("o" in value) {
      const result2 = {};
      refs.set(value.id, result2);
      for (const { k, v } of value.o) {
        if (k === "__proto__")
          continue;
        result2[k] = parseEvaluationResultValue(v, handles2, refs);
      }
      return result2;
    }
    if ("h" in value)
      return handles2[value.h];
    if ("ta" in value)
      return base64ToTypedArray(value.ta.b, typedArrayConstructors[value.ta.k]);
  }
  return value;
}
function serializeAsCallArgument(value, handleSerializer) {
  return serialize(value, handleSerializer, { visited: /* @__PURE__ */ new Map(), lastId: 0 });
}
function serialize(value, handleSerializer, visitorInfo) {
  if (value && typeof value === "object") {
    if (typeof globalThis.Window === "function" && value instanceof globalThis.Window)
      return "ref: <Window>";
    if (typeof globalThis.Document === "function" && value instanceof globalThis.Document)
      return "ref: <Document>";
    if (typeof globalThis.Node === "function" && value instanceof globalThis.Node)
      return "ref: <Node>";
  }
  return innerSerialize(value, handleSerializer, visitorInfo);
}
function innerSerialize(value, handleSerializer, visitorInfo) {
  var _a2;
  const result2 = handleSerializer(value);
  if ("fallThrough" in result2)
    value = result2.fallThrough;
  else
    return result2;
  if (typeof value === "symbol")
    return { v: "undefined" };
  if (Object.is(value, void 0))
    return { v: "undefined" };
  if (Object.is(value, null))
    return { v: "null" };
  if (Object.is(value, NaN))
    return { v: "NaN" };
  if (Object.is(value, Infinity))
    return { v: "Infinity" };
  if (Object.is(value, -Infinity))
    return { v: "-Infinity" };
  if (Object.is(value, -0))
    return { v: "-0" };
  if (typeof value === "boolean")
    return value;
  if (typeof value === "number")
    return value;
  if (typeof value === "string")
    return value;
  if (typeof value === "bigint")
    return { bi: value.toString() };
  if (isError(value)) {
    let stack;
    if ((_a2 = value.stack) == null ? void 0 : _a2.startsWith(value.name + ": " + value.message)) {
      stack = value.stack;
    } else {
      stack = `${value.name}: ${value.message}
${value.stack}`;
    }
    return { e: { n: value.name, m: value.message, s: stack } };
  }
  if (isDate(value))
    return { d: value.toJSON() };
  if (isURL(value))
    return { u: value.toJSON() };
  if (isRegExp2(value))
    return { r: { p: value.source, f: value.flags } };
  for (const [k, ctor] of Object.entries(typedArrayConstructors)) {
    if (isTypedArray(value, ctor))
      return { ta: { b: typedArrayToBase64(value), k } };
  }
  const id = visitorInfo.visited.get(value);
  if (id)
    return { ref: id };
  if (Array.isArray(value)) {
    const a = [];
    const id2 = ++visitorInfo.lastId;
    visitorInfo.visited.set(value, id2);
    for (let i = 0; i < value.length; ++i)
      a.push(serialize(value[i], handleSerializer, visitorInfo));
    return { a, id: id2 };
  }
  if (typeof value === "object") {
    const o = [];
    const id2 = ++visitorInfo.lastId;
    visitorInfo.visited.set(value, id2);
    for (const name of Object.keys(value)) {
      let item;
      try {
        item = value[name];
      } catch (e) {
        continue;
      }
      if (name === "toJSON" && typeof item === "function")
        o.push({ k: name, v: { o: [], id: 0 } });
      else
        o.push({ k: name, v: serialize(item, handleSerializer, visitorInfo) });
    }
    let jsonWrapper;
    try {
      if (o.length === 0 && value.toJSON && typeof value.toJSON === "function")
        jsonWrapper = { value: value.toJSON() };
    } catch (e) {
    }
    if (jsonWrapper)
      return innerSerialize(jsonWrapper.value, handleSerializer, visitorInfo);
    return { o, id: id2 };
  }
}

// src/content/services/playwright/injected/src/utilityScript.ts
var kRuntimeGuid = "$runtime_guid$";
var kUtilityScriptIsUnderTest = false;
var kPlaywrightBinding = `__playwright__binding__${kRuntimeGuid}`;
var kUtilityScriptGlobalProperty = `__playwright_utility_script__${kRuntimeGuid}`;
var UtilityScript = class {
  // eslint-disable-next-line no-restricted-globals
  constructor(global) {
    // eslint-disable-next-line no-restricted-globals
    __publicField(this, "global");
    __publicField(this, "builtins");
    __publicField(this, "isUnderTest");
    __publicField(this, "_bindings", /* @__PURE__ */ new Map());
    var _a2, _b, _c, _d, _e, _f, _g, _h, _i;
    this.global = global;
    this.isUnderTest = kUtilityScriptIsUnderTest;
    this.builtins = {
      setTimeout: (_a2 = global.setTimeout) == null ? void 0 : _a2.bind(global),
      clearTimeout: (_b = global.clearTimeout) == null ? void 0 : _b.bind(global),
      setInterval: (_c = global.setInterval) == null ? void 0 : _c.bind(global),
      clearInterval: (_d = global.clearInterval) == null ? void 0 : _d.bind(global),
      requestAnimationFrame: (_e = global.requestAnimationFrame) == null ? void 0 : _e.bind(global),
      cancelAnimationFrame: (_f = global.cancelAnimationFrame) == null ? void 0 : _f.bind(global),
      requestIdleCallback: (_g = global.requestIdleCallback) == null ? void 0 : _g.bind(global),
      cancelIdleCallback: (_h = global.cancelIdleCallback) == null ? void 0 : _h.bind(global),
      performance: global.performance,
      eval: (_i = global.eval) == null ? void 0 : _i.bind(global),
      Intl: global.Intl,
      Date: global.Date,
      Map: global.Map,
      Set: global.Set
    };
    if (this.isUnderTest) global.builtins = this.builtins;
  }
  evaluate(isFunction, returnByValue, expression, argCount, ...argsAndHandles) {
    const args = argsAndHandles.slice(0, argCount);
    const handles = argsAndHandles.slice(argCount);
    const parameters = [];
    for (let i = 0; i < args.length; i++) parameters[i] = parseEvaluationResultValue(args[i], handles);
    let result = eval(expression);
    if (isFunction === true) {
      result = result(...parameters);
    } else if (isFunction === false) {
      result = result;
    } else {
      if (typeof result === "function") result = result(...parameters);
    }
    return returnByValue ? this._promiseAwareJsonValueNoThrow(result) : result;
  }
  jsonValue(returnByValue2, value) {
    if (value === void 0) return void 0;
    return serializeAsCallArgument(value, (value2) => ({ fallThrough: value2 }));
  }
  addBinding(bindingName, needsHandle) {
    const data = {
      callbacks: /* @__PURE__ */ new Map(),
      lastSeq: 0,
      handles: /* @__PURE__ */ new Map()
    };
    this._bindings.set(bindingName, data);
    this.global[bindingName] = (...args2) => {
      if (needsHandle && args2.slice(1).some((arg) => arg !== void 0))
        throw new Error(`exposeBindingHandle supports a single argument, ${args2.length} received`);
      const seq = ++data.lastSeq;
      const promise = new Promise((resolve, reject) => data.callbacks.set(seq, { resolve, reject }));
      let payload;
      if (needsHandle) {
        data.handles.set(seq, args2[0]);
        payload = { name: bindingName, seq };
      } else {
        const serializedArgs = [];
        for (let i = 0; i < args2.length; i++) {
          serializedArgs[i] = serializeAsCallArgument(args2[i], (v) => {
            return { fallThrough: v };
          });
        }
        payload = { name: bindingName, seq, serializedArgs };
      }
      this.global[kPlaywrightBinding](JSON.stringify(payload));
      return promise;
    };
  }
  takeBindingHandle(arg) {
    const handles2 = this._bindings.get(arg.name).handles;
    const handle = handles2.get(arg.seq);
    handles2.delete(arg.seq);
    return handle;
  }
  deliverBindingResult(arg) {
    const callbacks = this._bindings.get(arg.name).callbacks;
    if ("error" in arg) callbacks.get(arg.seq).reject(arg.error);
    else callbacks.get(arg.seq).resolve(arg.result);
    callbacks.delete(arg.seq);
  }
  _promiseAwareJsonValueNoThrow(value) {
    const safeJson = (value2) => {
      try {
        return this.jsonValue(true, value2);
      } catch (e) {
        return void 0;
      }
    };
    if (value && typeof value === "object" && typeof value.then === "function") {
      return (() => __async(this, null, function* () {
        const promiseValue = yield value;
        return safeJson(promiseValue);
      }))();
    }
    return safeJson(value);
  }
};
function ensureUtilityScript(global) {
  global = global != null ? global : globalThis;
  let utilityScript = global[kUtilityScriptGlobalProperty];
  if (utilityScript) return utilityScript;
  utilityScript = new UtilityScript(global);
  Object.defineProperty(global, kUtilityScriptGlobalProperty, {
    value: utilityScript,
    configurable: false,
    enumerable: false,
    writable: false
  });
  return utilityScript;
}

// src/content/services/playwright/injected/src/injectedScript.ts
var InjectedScript = class {
  // eslint-disable-next-line no-restricted-globals
  constructor(window2, options) {
    __publicField(this, "_engines");
    __publicField(this, "_evaluator");
    __publicField(this, "_stableRafCount");
    __publicField(this, "_browserName");
    __publicField(this, "onGlobalListenersRemoved");
    __publicField(this, "_hitTargetInterceptor");
    __publicField(this, "_highlight");
    __publicField(this, "isUnderTest");
    __publicField(this, "_sdkLanguage");
    __publicField(this, "_testIdAttributeNameForStrictErrorAndConsoleCodegen", "data-testid");
    __publicField(this, "_markedElements");
    // eslint-disable-next-line no-restricted-globals
    __publicField(this, "window");
    __publicField(this, "document");
    __publicField(this, "consoleApi");
    __publicField(this, "_lastAriaSnapshot");
    // Recorder must use any external dependencies through InjectedScript.
    // Otherwise it will end up with a copy of all modules it uses, and any
    // module-level globals will be duplicated, which leads to subtle bugs.
    __publicField(this, "utils", {
      asLocator,
      cacheNormalizedWhitespaces,
      elementText,
      getAriaRole,
      getElementAccessibleDescription,
      getElementAccessibleName,
      isElementVisible,
      isInsideScope,
      normalizeWhiteSpace,
      parseAriaSnapshot,
      builtins: null
    });
    __publicField(this, "_autoClosingTags");
    __publicField(this, "_booleanAttributes");
    __publicField(this, "_eventTypes");
    __publicField(this, "_hoverHitTargetInterceptorEvents");
    __publicField(this, "_tapHitTargetInterceptorEvents");
    __publicField(this, "_mouseHitTargetInterceptorEvents");
    __publicField(this, "_allHitTargetInterceptorEvents");
    var _a2;
    this.window = window2;
    this.document = window2.document;
    const utilityScript = ensureUtilityScript(window2);
    this.isUnderTest = (_a2 = options.isUnderTest) != null ? _a2 : utilityScript.isUnderTest;
    this.utils.builtins = utilityScript.builtins;
    this._sdkLanguage = options.sdkLanguage;
    this._testIdAttributeNameForStrictErrorAndConsoleCodegen = options.testIdAttributeName;
    this._evaluator = new SelectorEvaluatorImpl();
    this.consoleApi = new ConsoleAPI(this);
    this.onGlobalListenersRemoved = /* @__PURE__ */ new Set();
    this._autoClosingTags = /* @__PURE__ */ new Set([
      "AREA",
      "BASE",
      "BR",
      "COL",
      "COMMAND",
      "EMBED",
      "HR",
      "IMG",
      "INPUT",
      "KEYGEN",
      "LINK",
      "MENUITEM",
      "META",
      "PARAM",
      "SOURCE",
      "TRACK",
      "WBR"
    ]);
    this._booleanAttributes = /* @__PURE__ */ new Set(["checked", "selected", "disabled", "readonly", "multiple"]);
    this._eventTypes = /* @__PURE__ */ new Map([
      ["auxclick", "mouse"],
      ["click", "mouse"],
      ["dblclick", "mouse"],
      ["mousedown", "mouse"],
      ["mouseeenter", "mouse"],
      ["mouseleave", "mouse"],
      ["mousemove", "mouse"],
      ["mouseout", "mouse"],
      ["mouseover", "mouse"],
      ["mouseup", "mouse"],
      ["mouseleave", "mouse"],
      ["mousewheel", "mouse"],
      ["keydown", "keyboard"],
      ["keyup", "keyboard"],
      ["keypress", "keyboard"],
      ["textInput", "keyboard"],
      ["touchstart", "touch"],
      ["touchmove", "touch"],
      ["touchend", "touch"],
      ["touchcancel", "touch"],
      ["pointerover", "pointer"],
      ["pointerout", "pointer"],
      ["pointerenter", "pointer"],
      ["pointerleave", "pointer"],
      ["pointerdown", "pointer"],
      ["pointerup", "pointer"],
      ["pointermove", "pointer"],
      ["pointercancel", "pointer"],
      ["gotpointercapture", "pointer"],
      ["lostpointercapture", "pointer"],
      ["focus", "focus"],
      ["blur", "focus"],
      ["drag", "drag"],
      ["dragstart", "drag"],
      ["dragend", "drag"],
      ["dragover", "drag"],
      ["dragenter", "drag"],
      ["dragleave", "drag"],
      ["dragexit", "drag"],
      ["drop", "drag"],
      ["wheel", "wheel"],
      ["deviceorientation", "deviceorientation"],
      ["deviceorientationabsolute", "deviceorientation"],
      ["devicemotion", "devicemotion"]
    ]);
    this._hoverHitTargetInterceptorEvents = /* @__PURE__ */ new Set(["mousemove"]);
    this._tapHitTargetInterceptorEvents = /* @__PURE__ */ new Set([
      "pointerdown",
      "pointerup",
      "touchstart",
      "touchend",
      "touchcancel"
    ]);
    this._mouseHitTargetInterceptorEvents = /* @__PURE__ */ new Set([
      "mousedown",
      "mouseup",
      "pointerdown",
      "pointerup",
      "click",
      "auxclick",
      "dblclick",
      "contextmenu"
    ]);
    this._allHitTargetInterceptorEvents = /* @__PURE__ */ new Set([
      ...this._hoverHitTargetInterceptorEvents,
      ...this._tapHitTargetInterceptorEvents,
      ...this._mouseHitTargetInterceptorEvents
    ]);
    this._engines = /* @__PURE__ */ new Map();
    this._engines.set("xpath", XPathEngine);
    this._engines.set("xpath:light", XPathEngine);
    this._engines.set("_react", createReactEngine());
    this._engines.set("_vue", createVueEngine());
    this._engines.set("role", createRoleEngine(false));
    this._engines.set("text", this._createTextEngine(true, false));
    this._engines.set("text:light", this._createTextEngine(false, false));
    this._engines.set("id", this._createAttributeEngine("id", true));
    this._engines.set("id:light", this._createAttributeEngine("id", false));
    this._engines.set("data-testid", this._createAttributeEngine("data-testid", true));
    this._engines.set("data-testid:light", this._createAttributeEngine("data-testid", false));
    this._engines.set("data-test-id", this._createAttributeEngine("data-test-id", true));
    this._engines.set("data-test-id:light", this._createAttributeEngine("data-test-id", false));
    this._engines.set("data-test", this._createAttributeEngine("data-test", true));
    this._engines.set("data-test:light", this._createAttributeEngine("data-test", false));
    this._engines.set("css", this._createCSSEngine());
    this._engines.set("nth", { queryAll: () => [] });
    this._engines.set("visible", this._createVisibleEngine());
    this._engines.set("internal:control", this._createControlEngine());
    this._engines.set("internal:has", this._createHasEngine());
    this._engines.set("internal:has-not", this._createHasNotEngine());
    this._engines.set("internal:and", { queryAll: () => [] });
    this._engines.set("internal:or", { queryAll: () => [] });
    this._engines.set("internal:chain", this._createInternalChainEngine());
    this._engines.set("internal:label", this._createInternalLabelEngine());
    this._engines.set("internal:text", this._createTextEngine(true, true));
    this._engines.set("internal:has-text", this._createInternalHasTextEngine());
    this._engines.set("internal:has-not-text", this._createInternalHasNotTextEngine());
    this._engines.set("internal:attr", this._createNamedAttributeEngine());
    this._engines.set("internal:testid", this._createNamedAttributeEngine());
    this._engines.set("internal:role", createRoleEngine(true));
    this._engines.set("internal:describe", this._createDescribeEngine());
    this._engines.set("aria-ref", this._createAriaRefEngine());
    for (const { name, source } of options.customEngines) this._engines.set(name, this.eval(source));
    this._stableRafCount = options.stableRafCount;
    this._browserName = options.browserName;
    setGlobalOptions({
      browserNameForWorkarounds: options.browserName,
      inputFileRoleTextbox: options.inputFileRoleTextbox
    });
    this._setupGlobalListenersRemovalDetection();
    this._setupHitTargetInterceptors();
    if (this.isUnderTest) this.window.__injectedScript = this;
  }
  eval(expression2) {
    return this.window.eval(expression2);
  }
  testIdAttributeNameForStrictErrorAndConsoleCodegen() {
    return this._testIdAttributeNameForStrictErrorAndConsoleCodegen;
  }
  parseSelector(selector) {
    const result2 = parseSelector(selector);
    visitAllSelectorParts(result2, (part) => {
      if (!this._engines.has(part.name))
        throw this.createStacklessError(`Unknown engine "${part.name}" while parsing selector ${selector}`);
    });
    return result2;
  }
  generateSelector(targetElement, options) {
    return generateSelector(this, targetElement, options);
  }
  generateSelectorSimple(targetElement, options) {
    return generateSelector(this, targetElement, __spreadProps(__spreadValues({}, options), {
      testIdAttributeName: this._testIdAttributeNameForStrictErrorAndConsoleCodegen
    })).selector;
  }
  querySelector(selector, root, strict) {
    const result2 = this.querySelectorAll(selector, root);
    if (strict && result2.length > 1) throw this.strictModeViolationError(selector, result2);
    return result2[0];
  }
  _queryNth(elements, part) {
    const list = [...elements];
    let nth = +part.body;
    if (nth === -1) nth = list.length - 1;
    return new Set(list.slice(nth, nth + 1));
  }
  _queryLayoutSelector(elements, part, originalRoot) {
    const name = part.name;
    const body = part.body;
    const result2 = [];
    const inner = this.querySelectorAll(body.parsed, originalRoot);
    for (const element of elements) {
      const score = layoutSelectorScore(name, element, inner, body.distance);
      if (score !== void 0) result2.push({ element, score });
    }
    result2.sort((a, b) => a.score - b.score);
    return new Set(result2.map((r) => r.element));
  }
  ariaSnapshot(node, options) {
    if (node.nodeType !== Node.ELEMENT_NODE)
      throw this.createStacklessError("Can only capture aria snapshot of Element nodes.");
    this._lastAriaSnapshot = generateAriaTree(node, options);
    return renderAriaTree(this._lastAriaSnapshot, options);
  }
  getAllByAria(document2, template) {
    return getAllByAria(document2.documentElement, template);
  }
  querySelectorAll(selector, root) {
    if (selector.capture !== void 0) {
      if (selector.parts.some((part) => part.name === "nth"))
        throw this.createStacklessError(`Can't query n-th element in a request with the capture.`);
      const withHas = { parts: selector.parts.slice(0, selector.capture + 1) };
      if (selector.capture < selector.parts.length - 1) {
        const parsed = { parts: selector.parts.slice(selector.capture + 1) };
        const has = { name: "internal:has", body: { parsed }, source: stringifySelector(parsed) };
        withHas.parts.push(has);
      }
      return this.querySelectorAll(withHas, root);
    }
    if (!root["querySelectorAll"]) throw this.createStacklessError("Node is not queryable.");
    if (selector.capture !== void 0) {
      throw this.createStacklessError("Internal error: there should not be a capture in the selector.");
    }
    if (root.nodeType === 11 && selector.parts.length === 1 && selector.parts[0].name === "css" && selector.parts[0].source === ":scope")
      return [root];
    this._evaluator.begin();
    try {
      let roots = /* @__PURE__ */ new Set([root]);
      for (const part of selector.parts) {
        if (part.name === "nth") {
          roots = this._queryNth(roots, part);
        } else if (part.name === "internal:and") {
          const andElements = this.querySelectorAll(part.body.parsed, root);
          roots = new Set(andElements.filter((e) => roots.has(e)));
        } else if (part.name === "internal:or") {
          const orElements = this.querySelectorAll(part.body.parsed, root);
          roots = new Set(sortInDOMOrder(/* @__PURE__ */ new Set([...roots, ...orElements])));
        } else if (kLayoutSelectorNames.includes(part.name)) {
          roots = this._queryLayoutSelector(roots, part, root);
        } else {
          const next = /* @__PURE__ */ new Set();
          for (const root2 of roots) {
            const all = this._queryEngineAll(part, root2);
            for (const one of all) next.add(one);
          }
          roots = next;
        }
      }
      return [...roots];
    } finally {
      this._evaluator.end();
    }
  }
  _queryEngineAll(part, root) {
    const result2 = this._engines.get(part.name).queryAll(root, part.body);
    for (const element of result2) {
      if (!("nodeName" in element))
        throw this.createStacklessError(`Expected a Node but got ${Object.prototype.toString.call(element)}`);
    }
    return result2;
  }
  _createAttributeEngine(attribute, shadow) {
    const toCSS = (selector) => {
      const css = `[${attribute}=${JSON.stringify(selector)}]`;
      return [{ simples: [{ selector: { css, functions: [] }, combinator: "" }] }];
    };
    return {
      queryAll: (root, selector) => {
        return this._evaluator.query({ scope: root, pierceShadow: shadow }, toCSS(selector));
      }
    };
  }
  _createCSSEngine() {
    return {
      queryAll: (root, body) => {
        return this._evaluator.query({ scope: root, pierceShadow: true }, body);
      }
    };
  }
  _createTextEngine(shadow, internal) {
    const queryAll = (root, selector) => {
      const { matcher, kind } = createTextMatcher(selector, internal);
      const result2 = [];
      let lastDidNotMatchSelf = null;
      const appendElement = (element) => {
        if (kind === "lax" && lastDidNotMatchSelf && lastDidNotMatchSelf.contains(element)) return false;
        const matches = elementMatchesText(this._evaluator._cacheText, element, matcher);
        if (matches === "none") lastDidNotMatchSelf = element;
        if (matches === "self" || matches === "selfAndChildren" && kind === "strict" && !internal)
          result2.push(element);
      };
      if (root.nodeType === Node.ELEMENT_NODE) appendElement(root);
      const elements = this._evaluator._queryCSS({ scope: root, pierceShadow: shadow }, "*");
      for (const element of elements) appendElement(element);
      return result2;
    };
    return { queryAll };
  }
  _createInternalHasTextEngine() {
    return {
      queryAll: (root, selector) => {
        if (root.nodeType !== 1) return [];
        const element = root;
        const text = elementText(this._evaluator._cacheText, element);
        const { matcher } = createTextMatcher(selector, true);
        return matcher(text) ? [element] : [];
      }
    };
  }
  _createInternalHasNotTextEngine() {
    return {
      queryAll: (root, selector) => {
        if (root.nodeType !== 1) return [];
        const element = root;
        const text = elementText(this._evaluator._cacheText, element);
        const { matcher } = createTextMatcher(selector, true);
        return matcher(text) ? [] : [element];
      }
    };
  }
  _createInternalLabelEngine() {
    return {
      queryAll: (root, selector) => {
        const { matcher } = createTextMatcher(selector, true);
        const allElements = this._evaluator._queryCSS({ scope: root, pierceShadow: true }, "*");
        return allElements.filter((element) => {
          return getElementLabels(this._evaluator._cacheText, element).some((label) => matcher(label));
        });
      }
    };
  }
  _createNamedAttributeEngine() {
    const queryAll = (root, selector) => {
      const parsed = parseAttributeSelector(selector, true);
      if (parsed.name || parsed.attributes.length !== 1) throw new Error("Malformed attribute selector: " + selector);
      const { name, value, caseSensitive } = parsed.attributes[0];
      const lowerCaseValue = caseSensitive ? null : value.toLowerCase();
      let matcher;
      if (value instanceof RegExp) matcher = (s) => !!s.match(value);
      else if (caseSensitive) matcher = (s) => s === value;
      else matcher = (s) => s.toLowerCase().includes(lowerCaseValue);
      const elements = this._evaluator._queryCSS(
        { scope: root, pierceShadow: true },
        `[${name}]`
      );
      return elements.filter((e) => matcher(e.getAttribute(name)));
    };
    return { queryAll };
  }
  _createDescribeEngine() {
    const queryAll = (root) => {
      if (root.nodeType !== 1) return [];
      return [root];
    };
    return { queryAll };
  }
  _createControlEngine() {
    return {
      queryAll(root, body) {
        if (body === "enter-frame") return [];
        if (body === "return-empty") return [];
        if (body === "component") {
          if (root.nodeType !== 1) return [];
          return [root.childElementCount === 1 ? root.firstElementChild : root];
        }
        throw new Error(`Internal error, unknown internal:control selector ${body}`);
      }
    };
  }
  _createHasEngine() {
    const queryAll = (root, body) => {
      if (root.nodeType !== 1) return [];
      const has = !!this.querySelector(body.parsed, root, false);
      return has ? [root] : [];
    };
    return { queryAll };
  }
  _createHasNotEngine() {
    const queryAll = (root, body) => {
      if (root.nodeType !== 1) return [];
      const has = !!this.querySelector(body.parsed, root, false);
      return has ? [] : [root];
    };
    return { queryAll };
  }
  _createVisibleEngine() {
    const queryAll = (root, body) => {
      if (root.nodeType !== 1) return [];
      const visible = body === "true";
      return isElementVisible(root) === visible ? [root] : [];
    };
    return { queryAll };
  }
  _createInternalChainEngine() {
    const queryAll = (root, body) => {
      return this.querySelectorAll(body.parsed, root);
    };
    return { queryAll };
  }
  extend(source, params) {
    const constrFunction = this.window.eval(`
    (() => {
      const module = {};
      ${source}
      return module.exports.default();
    })()`);
    return new constrFunction(this, params);
  }
  viewportRatio(element) {
    return __async(this, null, function* () {
      return yield new Promise((resolve) => {
        const observer = new IntersectionObserver((entries) => {
          resolve(entries[0].intersectionRatio);
          observer.disconnect();
        });
        observer.observe(element);
        requestAnimationFrame(() => {
        });
      });
    });
  }
  getElementBorderWidth(node) {
    if (node.nodeType !== Node.ELEMENT_NODE || !node.ownerDocument || !node.ownerDocument.defaultView)
      return { left: 0, top: 0 };
    const style = node.ownerDocument.defaultView.getComputedStyle(node);
    return { left: parseInt(style.borderLeftWidth || "", 10), top: parseInt(style.borderTopWidth || "", 10) };
  }
  describeIFrameStyle(iframe) {
    if (!iframe.ownerDocument || !iframe.ownerDocument.defaultView) return "error:notconnected";
    const defaultView = iframe.ownerDocument.defaultView;
    for (let e = iframe; e; e = parentElementOrShadowHost(e)) {
      if (defaultView.getComputedStyle(e).transform !== "none") return "transformed";
    }
    const iframeStyle = defaultView.getComputedStyle(iframe);
    return {
      left: parseInt(iframeStyle.borderLeftWidth || "", 10) + parseInt(iframeStyle.paddingLeft || "", 10),
      top: parseInt(iframeStyle.borderTopWidth || "", 10) + parseInt(iframeStyle.paddingTop || "", 10)
    };
  }
  retarget(node, behavior) {
    let element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element) return null;
    if (behavior === "none") return element;
    if (!element.matches("input, textarea, select") && !element.isContentEditable) {
      if (behavior === "button-link") element = element.closest("button, [role=button], a, [role=link]") || element;
      else element = element.closest("button, [role=button], [role=checkbox], [role=radio]") || element;
    }
    if (behavior === "follow-label") {
      if (!element.matches(
        "a, input, textarea, button, select, [role=link], [role=button], [role=checkbox], [role=radio]"
      ) && !element.isContentEditable) {
        const enclosingLabel = element.closest("label");
        if (enclosingLabel && enclosingLabel.control) element = enclosingLabel.control;
      }
    }
    return element;
  }
  checkElementStates(node, states) {
    return __async(this, null, function* () {
      if (states.includes("stable")) {
        const stableResult = yield this._checkElementIsStable(node);
        if (stableResult === false) return { missingState: "stable" };
        if (stableResult === "error:notconnected") return "error:notconnected";
      }
      for (const state of states) {
        if (state !== "stable") {
          const result2 = this.elementState(node, state);
          if (result2.received === "error:notconnected") return "error:notconnected";
          if (!result2.matches) return { missingState: state };
        }
      }
    });
  }
  _checkElementIsStable(node) {
    return __async(this, null, function* () {
      const continuePolling = Symbol("continuePolling");
      let lastRect;
      let stableRafCounter = 0;
      let lastTime = 0;
      const check = () => {
        const element = this.retarget(node, "no-follow-label");
        if (!element) return "error:notconnected";
        const time = performance.now();
        if (this._stableRafCount > 1 && time - lastTime < 15) return continuePolling;
        lastTime = time;
        const clientRect = element.getBoundingClientRect();
        const rect = { x: clientRect.top, y: clientRect.left, width: clientRect.width, height: clientRect.height };
        if (lastRect) {
          const samePosition = rect.x === lastRect.x && rect.y === lastRect.y && rect.width === lastRect.width && rect.height === lastRect.height;
          if (!samePosition) return false;
          if (++stableRafCounter >= this._stableRafCount) return true;
        }
        lastRect = rect;
        return continuePolling;
      };
      let fulfill;
      let reject;
      const result2 = new Promise((f, r) => {
        fulfill = f;
        reject = r;
      });
      const raf = () => {
        try {
          const success = check();
          if (success !== continuePolling) fulfill(success);
          else requestAnimationFrame(raf);
        } catch (e) {
          reject(e);
        }
      };
      requestAnimationFrame(raf);
      return result2;
    });
  }
  _createAriaRefEngine() {
    const queryAll = (root, selector) => {
      var _a2, _b;
      const result2 = (_b = (_a2 = this._lastAriaSnapshot) == null ? void 0 : _a2.elements) == null ? void 0 : _b.get(selector);
      return result2 && result2.isConnected ? [result2] : [];
    };
    return { queryAll };
  }
  elementState(node, state) {
    const element = this.retarget(node, ["visible", "hidden"].includes(state) ? "none" : "follow-label");
    if (!element || !element.isConnected) {
      if (state === "hidden") return { matches: true, received: "hidden" };
      return { matches: false, received: "error:notconnected" };
    }
    if (state === "visible" || state === "hidden") {
      const visible = isElementVisible(element);
      return {
        matches: state === "visible" ? visible : !visible,
        received: visible ? "visible" : "hidden"
      };
    }
    if (state === "disabled" || state === "enabled") {
      const disabled = getAriaDisabled(element);
      return {
        matches: state === "disabled" ? disabled : !disabled,
        received: disabled ? "disabled" : "enabled"
      };
    }
    if (state === "editable") {
      const disabled = getAriaDisabled(element);
      const readonly = getReadonly(element);
      if (readonly === "error")
        throw this.createStacklessError(
          "Element is not an <input>, <textarea>, <select> or [contenteditable] and does not have a role allowing [aria-readonly]"
        );
      return {
        matches: !disabled && !readonly,
        received: disabled ? "disabled" : readonly ? "readOnly" : "editable"
      };
    }
    if (state === "checked" || state === "unchecked") {
      const need = state === "checked";
      const checked = getCheckedWithoutMixed(element);
      if (checked === "error") throw this.createStacklessError("Not a checkbox or radio button");
      return {
        matches: need === checked,
        received: checked ? "checked" : "unchecked"
      };
    }
    if (state === "indeterminate") {
      const checked = getCheckedAllowMixed(element);
      if (checked === "error") throw this.createStacklessError("Not a checkbox or radio button");
      return {
        matches: checked === "mixed",
        received: checked === true ? "checked" : checked === false ? "unchecked" : "mixed"
      };
    }
    throw this.createStacklessError(`Unexpected element state "${state}"`);
  }
  selectOptions(node, optionsToSelect) {
    const element = this.retarget(node, "follow-label");
    if (!element) return "error:notconnected";
    if (element.nodeName.toLowerCase() !== "select")
      throw this.createStacklessError("Element is not a <select> element");
    const select = element;
    const options = [...select.options];
    const selectedOptions = [];
    let remainingOptionsToSelect = optionsToSelect.slice();
    for (let index = 0; index < options.length; index++) {
      const option = options[index];
      const filter = (optionToSelect) => {
        if (optionToSelect instanceof Node) return option === optionToSelect;
        let matches = true;
        if (optionToSelect.valueOrLabel !== void 0)
          matches = matches && (optionToSelect.valueOrLabel === option.value || optionToSelect.valueOrLabel === option.label);
        if (optionToSelect.value !== void 0) matches = matches && optionToSelect.value === option.value;
        if (optionToSelect.label !== void 0) matches = matches && optionToSelect.label === option.label;
        if (optionToSelect.index !== void 0) matches = matches && optionToSelect.index === index;
        return matches;
      };
      if (!remainingOptionsToSelect.some(filter)) continue;
      selectedOptions.push(option);
      if (select.multiple) {
        remainingOptionsToSelect = remainingOptionsToSelect.filter((o) => !filter(o));
      } else {
        remainingOptionsToSelect = [];
        break;
      }
    }
    if (remainingOptionsToSelect.length) return "error:optionsnotfound";
    select.value = void 0;
    selectedOptions.forEach((option) => option.selected = true);
    select.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return selectedOptions.map((option) => option.value);
  }
  fill(node, value) {
    const element = this.retarget(node, "follow-label");
    if (!element) return "error:notconnected";
    if (element.nodeName.toLowerCase() === "input") {
      const input = element;
      const type = input.type.toLowerCase();
      const kInputTypesToSetValue = /* @__PURE__ */ new Set(["color", "date", "time", "datetime-local", "month", "range", "week"]);
      const kInputTypesToTypeInto = /* @__PURE__ */ new Set(["", "email", "number", "password", "search", "tel", "text", "url"]);
      if (!kInputTypesToTypeInto.has(type) && !kInputTypesToSetValue.has(type))
        throw this.createStacklessError(`Input of type "${type}" cannot be filled`);
      if (type === "number") {
        value = value.trim();
        if (isNaN(Number(value))) throw this.createStacklessError("Cannot type text into input[type=number]");
      }
      if (kInputTypesToSetValue.has(type)) {
        value = value.trim();
        input.focus();
        input.value = value;
        if (input.value !== value) throw this.createStacklessError("Malformed value");
        element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return "done";
      }
    } else if (element.nodeName.toLowerCase() === "textarea") {
    } else if (!element.isContentEditable) {
      throw this.createStacklessError("Element is not an <input>, <textarea> or [contenteditable] element");
    }
    this.selectText(element);
    return "needsinput";
  }
  selectText(node) {
    const element = this.retarget(node, "follow-label");
    if (!element) return "error:notconnected";
    if (element.nodeName.toLowerCase() === "input") {
      const input = element;
      input.select();
      input.focus();
      return "done";
    }
    if (element.nodeName.toLowerCase() === "textarea") {
      const textarea = element;
      textarea.selectionStart = 0;
      textarea.selectionEnd = textarea.value.length;
      textarea.focus();
      return "done";
    }
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    const selection = element.ownerDocument.defaultView.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    element.focus();
    return "done";
  }
  _activelyFocused(node) {
    const activeElement = node.getRootNode().activeElement;
    const isFocused = activeElement === node && !!node.ownerDocument && node.ownerDocument.hasFocus();
    return { activeElement, isFocused };
  }
  focusNode(node, resetSelectionIfNotFocused) {
    if (!node.isConnected) return "error:notconnected";
    if (node.nodeType !== Node.ELEMENT_NODE) throw this.createStacklessError("Node is not an element");
    const { activeElement, isFocused: wasFocused } = this._activelyFocused(node);
    if (node.isContentEditable && !wasFocused && activeElement && activeElement.blur) {
      activeElement.blur();
    }
    node.focus();
    node.focus();
    if (resetSelectionIfNotFocused && !wasFocused && node.nodeName.toLowerCase() === "input") {
      try {
        const input = node;
        input.setSelectionRange(0, 0);
      } catch (e) {
      }
    }
    return "done";
  }
  blurNode(node) {
    if (!node.isConnected) return "error:notconnected";
    if (node.nodeType !== Node.ELEMENT_NODE) throw this.createStacklessError("Node is not an element");
    node.blur();
    return "done";
  }
  setInputFiles(node, payloads) {
    if (node.nodeType !== Node.ELEMENT_NODE) return "Node is not of type HTMLElement";
    const element = node;
    if (element.nodeName !== "INPUT") return "Not an <input> element";
    const input = element;
    const type = (input.getAttribute("type") || "").toLowerCase();
    if (type !== "file") return "Not an input[type=file] element";
    const files = payloads.map((file) => {
      const bytes = Uint8Array.from(atob(file.buffer), (c) => c.charCodeAt(0));
      return new File([bytes], file.name, { type: file.mimeType, lastModified: file.lastModifiedMs });
    });
    const dt = new DataTransfer();
    for (const file of files) dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  expectHitTarget(hitPoint, targetElement) {
    const roots = [];
    let parentElement = targetElement;
    while (parentElement) {
      const root = enclosingShadowRootOrDocument(parentElement);
      if (!root) break;
      roots.push(root);
      if (root.nodeType === 9) break;
      parentElement = root.host;
    }
    let hitElement;
    for (let index = roots.length - 1; index >= 0; index--) {
      const root = roots[index];
      const elements = root.elementsFromPoint(hitPoint.x, hitPoint.y);
      const singleElement = root.elementFromPoint(hitPoint.x, hitPoint.y);
      if (singleElement && elements[0] && parentElementOrShadowHost(singleElement) === elements[0]) {
        const style = this.window.getComputedStyle(singleElement);
        if ((style == null ? void 0 : style.display) === "contents") {
          elements.unshift(singleElement);
        }
      }
      if (elements[0] && elements[0].shadowRoot === root && elements[1] === singleElement) {
        elements.shift();
      }
      const innerElement = elements[0];
      if (!innerElement) break;
      hitElement = innerElement;
      if (index && innerElement !== roots[index - 1].host) break;
    }
    const hitParents = [];
    while (hitElement && hitElement !== targetElement) {
      hitParents.push(hitElement);
      hitElement = parentElementOrShadowHost(hitElement);
    }
    if (hitElement === targetElement) return "done";
    const hitTargetDescription = this.previewNode(hitParents[0] || this.document.documentElement);
    let rootHitTargetDescription;
    let element = targetElement;
    while (element) {
      const index = hitParents.indexOf(element);
      if (index !== -1) {
        if (index > 1) rootHitTargetDescription = this.previewNode(hitParents[index - 1]);
        break;
      }
      element = parentElementOrShadowHost(element);
    }
    if (rootHitTargetDescription)
      return { hitTargetDescription: `${hitTargetDescription} from ${rootHitTargetDescription} subtree` };
    return { hitTargetDescription };
  }
  // Life of a pointer action, for example click.
  //
  // 0. Retry items 1 and 2 while action fails due to navigation or element being detached.
  //   1. Resolve selector to an element.
  //   2. Retry the following steps until the element is detached or frame navigates away.
  //     2a. Wait for the element to be stable (not moving), visible and enabled.
  //     2b. Scroll element into view. Scrolling alternates between:
  //         - Built-in protocol scrolling.
  //         - Anchoring to the top/left, bottom/right and center/center.
  //         This is to scroll elements from under sticky headers/footers.
  //     2c. Click point is calculated, either based on explicitly specified position,
  //         or some visible point of the element based on protocol content quads.
  //     2d. Click point relative to page viewport is converted relative to the target iframe
  //         for the next hit-point check.
  //     2e. (injected) Hit target at the click point must be a descendant of the target element.
  //         This prevents mis-clicking in edge cases like <iframe> overlaying the target.
  //     2f. (injected) Events specific for click (or some other action type) are intercepted on
  //         the Window with capture:true. See 2i for details.
  //         Note: this step is skipped for drag&drop (see inline comments for the reason).
  //     2g. Necessary keyboard modifiers are pressed.
  //     2h. Click event is issued (mousemove + mousedown + mouseup).
  //     2i. (injected) For each event, we check that hit target at the event point
  //         is a descendant of the target element.
  //         This guarantees no race between issuing the event and handling it in the page,
  //         for example due to layout shift.
  //         When hit target check fails, we block all future events in the page.
  //     2j. Keyboard modifiers are restored.
  //     2k. (injected) Event interceptor is removed.
  //     2l. All navigations triggered between 2g-2k are awaited to be either committed or canceled.
  //     2m. If failed, wait for increasing amount of time before the next retry.
  setupHitTargetInterceptor(node, action, hitPoint, blockAllEvents) {
    const element = this.retarget(node, "button-link");
    if (!element || !element.isConnected) return "error:notconnected";
    if (hitPoint) {
      const preliminaryResult = this.expectHitTarget(hitPoint, element);
      if (preliminaryResult !== "done") return preliminaryResult.hitTargetDescription;
    }
    if (action === "drag") return { stop: () => "done" };
    const events = {
      hover: this._hoverHitTargetInterceptorEvents,
      tap: this._tapHitTargetInterceptorEvents,
      mouse: this._mouseHitTargetInterceptorEvents
    }[action];
    let result2;
    const listener = (event) => {
      if (!events.has(event.type)) return;
      if (!event.isTrusted) return;
      const point = !!this.window.TouchEvent && event instanceof this.window.TouchEvent ? event.touches[0] : event;
      if (result2 === void 0 && point) result2 = this.expectHitTarget({ x: point.clientX, y: point.clientY }, element);
      if (blockAllEvents || result2 !== "done" && result2 !== void 0) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    };
    const stop = () => {
      if (this._hitTargetInterceptor === listener) this._hitTargetInterceptor = void 0;
      return result2 || "done";
    };
    this._hitTargetInterceptor = listener;
    return { stop };
  }
  dispatchEvent(node, type, eventInitObj) {
    var _a2, _b, _c, _d, _e;
    let event;
    const eventInit = __spreadValues({ bubbles: true, cancelable: true, composed: true }, eventInitObj);
    switch (this._eventTypes.get(type)) {
      case "mouse":
        event = new MouseEvent(type, eventInit);
        break;
      case "keyboard":
        event = new KeyboardEvent(type, eventInit);
        break;
      case "touch": {
        if (this._browserName === "webkit") {
          const createTouch = (t) => {
            var _a3, _b2, _c2;
            if (t instanceof Touch) return t;
            let pageX = t.pageX;
            if (pageX === void 0 && t.clientX !== void 0)
              pageX = t.clientX + (((_a3 = this.document.scrollingElement) == null ? void 0 : _a3.scrollLeft) || 0);
            let pageY = t.pageY;
            if (pageY === void 0 && t.clientY !== void 0)
              pageY = t.clientY + (((_b2 = this.document.scrollingElement) == null ? void 0 : _b2.scrollTop) || 0);
            return this.document.createTouch(
              this.window,
              (_c2 = t.target) != null ? _c2 : node,
              t.identifier,
              pageX,
              pageY,
              t.screenX,
              t.screenY,
              t.radiusX,
              t.radiusY,
              t.rotationAngle,
              t.force
            );
          };
          const createTouchList = (touches) => {
            if (touches instanceof TouchList || !touches) return touches;
            return this.document.createTouchList(...touches.map(createTouch));
          };
          (_a2 = eventInit.target) != null ? _a2 : eventInit.target = node;
          eventInit.touches = createTouchList(eventInit.touches);
          eventInit.targetTouches = createTouchList(eventInit.targetTouches);
          eventInit.changedTouches = createTouchList(eventInit.changedTouches);
          event = new TouchEvent(type, eventInit);
        } else {
          (_b = eventInit.target) != null ? _b : eventInit.target = node;
          eventInit.touches = (_c = eventInit.touches) == null ? void 0 : _c.map(
            (t) => {
              var _a3;
              return t instanceof Touch ? t : new Touch(__spreadProps(__spreadValues({}, t), { target: (_a3 = t.target) != null ? _a3 : node }));
            }
          );
          eventInit.targetTouches = (_d = eventInit.targetTouches) == null ? void 0 : _d.map(
            (t) => {
              var _a3;
              return t instanceof Touch ? t : new Touch(__spreadProps(__spreadValues({}, t), { target: (_a3 = t.target) != null ? _a3 : node }));
            }
          );
          eventInit.changedTouches = (_e = eventInit.changedTouches) == null ? void 0 : _e.map(
            (t) => {
              var _a3;
              return t instanceof Touch ? t : new Touch(__spreadProps(__spreadValues({}, t), { target: (_a3 = t.target) != null ? _a3 : node }));
            }
          );
          event = new TouchEvent(type, eventInit);
        }
        break;
      }
      case "pointer":
        event = new PointerEvent(type, eventInit);
        break;
      case "focus":
        event = new FocusEvent(type, eventInit);
        break;
      case "drag":
        event = new DragEvent(type, eventInit);
        break;
      case "wheel":
        event = new WheelEvent(type, eventInit);
        break;
      case "deviceorientation":
        try {
          event = new DeviceOrientationEvent(type, eventInit);
        } catch (e) {
          const { bubbles, cancelable, alpha, beta, gamma, absolute } = eventInit;
          event = this.document.createEvent("DeviceOrientationEvent");
          event.initDeviceOrientationEvent(type, bubbles, cancelable, alpha, beta, gamma, absolute);
        }
        break;
      case "devicemotion":
        try {
          event = new DeviceMotionEvent(type, eventInit);
        } catch (e) {
          const { bubbles, cancelable, acceleration, accelerationIncludingGravity, rotationRate, interval } = eventInit;
          event = this.document.createEvent("DeviceMotionEvent");
          event.initDeviceMotionEvent(
            type,
            bubbles,
            cancelable,
            acceleration,
            accelerationIncludingGravity,
            rotationRate,
            interval
          );
        }
        break;
      default:
        event = new Event(type, eventInit);
        break;
    }
    node.dispatchEvent(event);
  }
  previewNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return oneLine(`#text=${node.nodeValue || ""}`);
    if (node.nodeType !== Node.ELEMENT_NODE) return oneLine(`<${node.nodeName.toLowerCase()} />`);
    const element = node;
    const attrs = [];
    for (let i = 0; i < element.attributes.length; i++) {
      const { name, value } = element.attributes[i];
      if (name === "style") continue;
      if (!value && this._booleanAttributes.has(name)) attrs.push(` ${name}`);
      else attrs.push(` ${name}="${value}"`);
    }
    attrs.sort((a, b) => a.length - b.length);
    const attrText = trimStringWithEllipsis(attrs.join(""), 500);
    if (this._autoClosingTags.has(element.nodeName)) return oneLine(`<${element.nodeName.toLowerCase()}${attrText}/>`);
    const children = element.childNodes;
    let onlyText = false;
    if (children.length <= 5) {
      onlyText = true;
      for (let i = 0; i < children.length; i++) onlyText = onlyText && children[i].nodeType === Node.TEXT_NODE;
    }
    const text = onlyText ? element.textContent || "" : children.length ? "\u2026" : "";
    return oneLine(
      `<${element.nodeName.toLowerCase()}${attrText}>${trimStringWithEllipsis(text, 50)}</${element.nodeName.toLowerCase()}>`
    );
  }
  strictModeViolationError(selector, matches) {
    const infos = matches.slice(0, 10).map((m) => ({
      preview: this.previewNode(m),
      selector: this.generateSelectorSimple(m)
    }));
    const lines = infos.map(
      (info, i) => `
    ${i + 1}) ${info.preview} aka ${asLocator(this._sdkLanguage, info.selector)}`
    );
    if (infos.length < matches.length) lines.push("\n    ...");
    return this.createStacklessError(
      `strict mode violation: ${asLocator(this._sdkLanguage, stringifySelector(selector))} resolved to ${matches.length} elements:${lines.join("")}
`
    );
  }
  createStacklessError(message) {
    if (this._browserName === "firefox") {
      const error2 = new Error("Error: " + message);
      error2.stack = "";
      return error2;
    }
    const error = new Error(message);
    delete error.stack;
    return error;
  }
  createHighlight() {
    return new Highlight(this);
  }
  maskSelectors(selectors, color) {
    if (this._highlight) this.hideHighlight();
    this._highlight = new Highlight(this);
    this._highlight.install();
    const elements = [];
    for (const selector of selectors) elements.push(this.querySelectorAll(selector, this.document.documentElement));
    this._highlight.maskElements(elements.flat(), color);
  }
  highlight(selector) {
    if (!this._highlight) {
      this._highlight = new Highlight(this);
      this._highlight.install();
    }
    this._highlight.runHighlightOnRaf(selector);
  }
  hideHighlight() {
    if (this._highlight) {
      this._highlight.uninstall();
      delete this._highlight;
    }
  }
  markTargetElements(markedElements, callId) {
    var _a2, _b;
    if (((_a2 = this._markedElements) == null ? void 0 : _a2.callId) !== callId) this._markedElements = void 0;
    const previous = ((_b = this._markedElements) == null ? void 0 : _b.elements) || /* @__PURE__ */ new Set();
    const unmarkEvent = new CustomEvent("__playwright_unmark_target__", {
      bubbles: true,
      cancelable: true,
      detail: callId,
      composed: true
    });
    for (const element of previous) {
      if (!markedElements.has(element)) element.dispatchEvent(unmarkEvent);
    }
    const markEvent = new CustomEvent("__playwright_mark_target__", {
      bubbles: true,
      cancelable: true,
      detail: callId,
      composed: true
    });
    for (const element of markedElements) {
      if (!previous.has(element)) element.dispatchEvent(markEvent);
    }
    this._markedElements = { callId, elements: markedElements };
  }
  _setupGlobalListenersRemovalDetection() {
    const customEventName = "__playwright_global_listeners_check__";
    let seenEvent = false;
    const handleCustomEvent = () => seenEvent = true;
    this.window.addEventListener(customEventName, handleCustomEvent);
    new MutationObserver((entries) => {
      const newDocumentElement = entries.some(
        (entry) => Array.from(entry.addedNodes).includes(this.document.documentElement)
      );
      if (!newDocumentElement) return;
      seenEvent = false;
      this.window.dispatchEvent(new CustomEvent(customEventName));
      if (seenEvent) return;
      this.window.addEventListener(customEventName, handleCustomEvent);
      for (const callback of this.onGlobalListenersRemoved) callback();
    }).observe(this.document, { childList: true });
  }
  _setupHitTargetInterceptors() {
    const listener = (event) => {
      var _a2;
      return (_a2 = this._hitTargetInterceptor) == null ? void 0 : _a2.call(this, event);
    };
    const addHitTargetInterceptorListeners = () => {
      for (const event of this._allHitTargetInterceptorEvents)
        this.window.addEventListener(event, listener, { capture: true, passive: false });
    };
    addHitTargetInterceptorListeners();
    this.onGlobalListenersRemoved.add(addHitTargetInterceptorListeners);
  }
  expect(element, options, elements) {
    return __async(this, null, function* () {
      const isArray = options.expression === "to.have.count" || options.expression.endsWith(".array");
      if (isArray) return this.expectArray(elements, options);
      if (!element) {
        if (!options.isNot && options.expression === "to.be.hidden") return { matches: true };
        if (options.isNot && options.expression === "to.be.visible") return { matches: false };
        if (!options.isNot && options.expression === "to.be.detached") return { matches: true };
        if (options.isNot && options.expression === "to.be.attached") return { matches: false };
        if (options.isNot && options.expression === "to.be.in.viewport") return { matches: false };
        return { matches: options.isNot, missingReceived: true };
      }
      return yield this.expectSingleElement(element, options);
    });
  }
  expectSingleElement(element, options) {
    return __async(this, null, function* () {
      var _a2, _b;
      const expression2 = options.expression;
      {
        let result2;
        if (expression2 === "to.have.attribute") {
          const hasAttribute = element.hasAttribute(options.expressionArg);
          result2 = {
            matches: hasAttribute,
            received: hasAttribute ? "attribute present" : "attribute not present"
          };
        } else if (expression2 === "to.be.checked") {
          const { checked, indeterminate } = options.expectedValue;
          if (indeterminate) {
            if (checked !== void 0)
              throw this.createStacklessError("Can't assert indeterminate and checked at the same time");
            result2 = this.elementState(element, "indeterminate");
          } else {
            result2 = this.elementState(element, checked === false ? "unchecked" : "checked");
          }
        } else if (expression2 === "to.be.disabled") {
          result2 = this.elementState(element, "disabled");
        } else if (expression2 === "to.be.editable") {
          result2 = this.elementState(element, "editable");
        } else if (expression2 === "to.be.readonly") {
          result2 = this.elementState(element, "editable");
          result2.matches = !result2.matches;
        } else if (expression2 === "to.be.empty") {
          if (element.nodeName === "INPUT" || element.nodeName === "TEXTAREA") {
            const value = element.value;
            result2 = { matches: !value, received: value ? "notEmpty" : "empty" };
          } else {
            const text = (_a2 = element.textContent) == null ? void 0 : _a2.trim();
            result2 = { matches: !text, received: text ? "notEmpty" : "empty" };
          }
        } else if (expression2 === "to.be.enabled") {
          result2 = this.elementState(element, "enabled");
        } else if (expression2 === "to.be.focused") {
          const focused = this._activelyFocused(element).isFocused;
          result2 = {
            matches: focused,
            received: focused ? "focused" : "inactive"
          };
        } else if (expression2 === "to.be.hidden") {
          result2 = this.elementState(element, "hidden");
        } else if (expression2 === "to.be.visible") {
          result2 = this.elementState(element, "visible");
        } else if (expression2 === "to.be.attached") {
          result2 = {
            matches: true,
            received: "attached"
          };
        } else if (expression2 === "to.be.detached") {
          result2 = {
            matches: false,
            received: "attached"
          };
        }
        if (result2) {
          if (result2.received === "error:notconnected") throw this.createStacklessError("Element is not connected");
          return result2;
        }
      }
      {
        if (expression2 === "to.have.property") {
          let target = element;
          const properties = options.expressionArg.split(".");
          for (let i = 0; i < properties.length - 1; i++) {
            if (typeof target !== "object" || !(properties[i] in target)) return { received: void 0, matches: false };
            target = target[properties[i]];
          }
          const received = target[properties[properties.length - 1]];
          const matches = deepEquals(received, options.expectedValue);
          return { received, matches };
        }
      }
      {
        if (expression2 === "to.be.in.viewport") {
          const ratio = yield this.viewportRatio(element);
          return {
            received: `viewport ratio ${ratio}`,
            matches: ratio > 0 && ratio > ((_b = options.expectedNumber) != null ? _b : 0) - 1e-9
          };
        }
      }
      {
        if (expression2 === "to.have.values") {
          element = this.retarget(element, "follow-label");
          if (element.nodeName !== "SELECT" || !element.multiple)
            throw this.createStacklessError("Not a select element with a multiple attribute");
          const received = [...element.selectedOptions].map((o) => o.value);
          if (received.length !== options.expectedText.length) return { received, matches: false };
          return {
            received,
            matches: received.map((r, i) => new ExpectedTextMatcher(options.expectedText[i]).matches(r)).every(Boolean)
          };
        }
      }
      {
        if (expression2 === "to.match.aria") {
          const result2 = matchesAriaTree(element, options.expectedValue);
          return {
            received: result2.received,
            matches: !!result2.matches.length
          };
        }
      }
      {
        let received;
        if (expression2 === "to.have.attribute.value") {
          const value = element.getAttribute(options.expressionArg);
          if (value === null) return { received: null, matches: false };
          received = value;
        } else if (["to.have.class", "to.contain.class"].includes(expression2)) {
          if (!options.expectedText) throw this.createStacklessError("Expected text is not provided for " + expression2);
          return {
            received: element.classList.toString(),
            matches: new ExpectedTextMatcher(options.expectedText[0]).matchesClassList(
              this,
              element.classList,
              /* partial */
              expression2 === "to.contain.class"
            )
          };
        } else if (expression2 === "to.have.css") {
          received = this.window.getComputedStyle(element).getPropertyValue(options.expressionArg);
        } else if (expression2 === "to.have.id") {
          received = element.id;
        } else if (expression2 === "to.have.text") {
          received = options.useInnerText ? element.innerText : elementText(/* @__PURE__ */ new Map(), element).full;
        } else if (expression2 === "to.have.accessible.name") {
          received = getElementAccessibleName(
            element,
            false
            /* includeHidden */
          );
        } else if (expression2 === "to.have.accessible.description") {
          received = getElementAccessibleDescription(
            element,
            false
            /* includeHidden */
          );
        } else if (expression2 === "to.have.accessible.error.message") {
          received = getElementAccessibleErrorMessage(element);
        } else if (expression2 === "to.have.role") {
          received = getAriaRole(element) || "";
        } else if (expression2 === "to.have.title") {
          received = this.document.title;
        } else if (expression2 === "to.have.url") {
          received = this.document.location.href;
        } else if (expression2 === "to.have.value") {
          element = this.retarget(element, "follow-label");
          if (element.nodeName !== "INPUT" && element.nodeName !== "TEXTAREA" && element.nodeName !== "SELECT")
            throw this.createStacklessError("Not an input element");
          received = element.value;
        }
        if (received !== void 0 && options.expectedText) {
          const matcher = new ExpectedTextMatcher(options.expectedText[0]);
          return { received, matches: matcher.matches(received) };
        }
      }
      throw this.createStacklessError("Unknown expect matcher: " + expression2);
    });
  }
  expectArray(elements, options) {
    const expression2 = options.expression;
    if (expression2 === "to.have.count") {
      const received2 = elements.length;
      const matches2 = received2 === options.expectedNumber;
      return { received: received2, matches: matches2 };
    }
    if (!options.expectedText) throw this.createStacklessError("Expected text is not provided for " + expression2);
    if (["to.have.class.array", "to.contain.class.array"].includes(expression2)) {
      const receivedClassLists = elements.map((e) => e.classList);
      const received2 = receivedClassLists.map(String);
      if (receivedClassLists.length !== options.expectedText.length) return { received: received2, matches: false };
      const matches2 = this._matchSequentially(
        options.expectedText,
        receivedClassLists,
        (matcher, r) => matcher.matchesClassList(
          this,
          r,
          /* partial */
          expression2 === "to.contain.class.array"
        )
      );
      return {
        received: received2,
        matches: matches2
      };
    }
    if (!["to.contain.text.array", "to.have.text.array"].includes(expression2))
      throw this.createStacklessError("Unknown expect matcher: " + expression2);
    const received = elements.map(
      (e) => options.useInnerText ? e.innerText : elementText(/* @__PURE__ */ new Map(), e).full
    );
    const lengthShouldMatch = expression2 !== "to.contain.text.array";
    const matchesLength = received.length === options.expectedText.length || !lengthShouldMatch;
    if (!matchesLength) return { received, matches: false };
    const matches = this._matchSequentially(options.expectedText, received, (matcher, r) => matcher.matches(r));
    return { received, matches };
  }
  _matchSequentially(expectedText, received, matchFn) {
    const matchers = expectedText.map((e) => new ExpectedTextMatcher(e));
    let mIndex = 0;
    let rIndex = 0;
    while (mIndex < matchers.length && rIndex < received.length) {
      if (matchFn(matchers[mIndex], received[rIndex])) ++mIndex;
      ++rIndex;
    }
    return mIndex === matchers.length;
  }
};
function oneLine(s) {
  return s.replace(/\n/g, "\u21B5").replace(/\t/g, "\u21C6");
}
function cssUnquote(s) {
  s = s.substring(1, s.length - 1);
  if (!s.includes("\\")) return s;
  const r = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "\\" && i + 1 < s.length) i++;
    r.push(s[i++]);
  }
  return r.join("");
}
function createTextMatcher(selector, internal) {
  if (selector[0] === "/" && selector.lastIndexOf("/") > 0) {
    const lastSlash = selector.lastIndexOf("/");
    const re = new RegExp(selector.substring(1, lastSlash), selector.substring(lastSlash + 1));
    return { matcher: (elementText2) => re.test(elementText2.full), kind: "regex" };
  }
  const unquote = internal ? JSON.parse.bind(JSON) : cssUnquote;
  let strict = false;
  if (selector.length > 1 && selector[0] === '"' && selector[selector.length - 1] === '"') {
    selector = unquote(selector);
    strict = true;
  } else if (internal && selector.length > 1 && selector[0] === '"' && selector[selector.length - 2] === '"' && selector[selector.length - 1] === "i") {
    selector = unquote(selector.substring(0, selector.length - 1));
    strict = false;
  } else if (internal && selector.length > 1 && selector[0] === '"' && selector[selector.length - 2] === '"' && selector[selector.length - 1] === "s") {
    selector = unquote(selector.substring(0, selector.length - 1));
    strict = true;
  } else if (selector.length > 1 && selector[0] === "'" && selector[selector.length - 1] === "'") {
    selector = unquote(selector);
    strict = true;
  }
  selector = normalizeWhiteSpace(selector);
  if (strict) {
    if (internal) return { kind: "strict", matcher: (elementText2) => elementText2.normalized === selector };
    const strictTextNodeMatcher = (elementText2) => {
      if (!selector && !elementText2.immediate.length) return true;
      return elementText2.immediate.some((s) => normalizeWhiteSpace(s) === selector);
    };
    return { matcher: strictTextNodeMatcher, kind: "strict" };
  }
  selector = selector.toLowerCase();
  return {
    kind: "lax",
    matcher: (elementText2) => elementText2.normalized.toLowerCase().includes(selector)
  };
}
var ExpectedTextMatcher = class {
  constructor(expected) {
    __publicField(this, "_string");
    __publicField(this, "_substring");
    __publicField(this, "_regex");
    __publicField(this, "_normalizeWhiteSpace");
    __publicField(this, "_ignoreCase");
    this._normalizeWhiteSpace = expected.normalizeWhiteSpace;
    this._ignoreCase = expected.ignoreCase;
    this._string = expected.matchSubstring ? void 0 : this.normalize(expected.string);
    this._substring = expected.matchSubstring ? this.normalize(expected.string) : void 0;
    if (expected.regexSource) {
      const flags = new Set((expected.regexFlags || "").split(""));
      if (expected.ignoreCase === false) flags.delete("i");
      if (expected.ignoreCase === true) flags.add("i");
      this._regex = new RegExp(expected.regexSource, [...flags].join(""));
    }
  }
  matches(text) {
    if (!this._regex) text = this.normalize(text);
    if (this._string !== void 0) return text === this._string;
    if (this._substring !== void 0) return text.includes(this._substring);
    if (this._regex) return !!this._regex.test(text);
    return false;
  }
  matchesClassList(injectedScript, classList, partial) {
    if (partial) {
      if (this._regex)
        throw injectedScript.createStacklessError(
          "Partial matching does not support regular expressions. Please provide a string value."
        );
      return this._string.split(/\s+/g).filter(Boolean).every((className) => classList.contains(className));
    }
    return this.matches(classList.toString());
  }
  normalize(s) {
    if (!s) return s;
    if (this._normalizeWhiteSpace) s = normalizeWhiteSpace(s);
    if (this._ignoreCase) s = s.toLocaleLowerCase();
    return s;
  }
};
function deepEquals(a, b) {
  if (a === b) return true;
  if (a && b && typeof a === "object" && typeof b === "object") {
    if (a.constructor !== b.constructor) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; ++i) {
        if (!deepEquals(a[i], b[i])) return false;
      }
      return true;
    }
    if (a instanceof RegExp) return a.source === b.source && a.flags === b.flags;
    if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
    if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    for (let i = 0; i < keys.length; ++i) {
      if (!b.hasOwnProperty(keys[i])) return false;
    }
    for (const key of keys) {
      if (!deepEquals(a[key], b[key])) return false;
    }
    return true;
  }
  if (typeof a === "number" && typeof b === "number") return isNaN(a) && isNaN(b);
  return false;
}

// src/content/services/locators/locator.ts
function escapeAttribute(value, espaceDotsAndSpaces) {
  if (!espaceDotsAndSpaces) {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\f/g, "\\f");
  }
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\f/g, "\\f").replace(/\./g, "\\.").replace(/\s/g, "\\ ");
}
function isDynamicId2(id) {
  const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}/i;
  const isEntirelyNumbers = /^\d+$/;
  const timeBasedIds = /\d{13,}$/;
  const libPrefixes = /^(rc[-_]|r[-_]|react[-_]|ember\d+|vue[-_]|ng[-_]|ember[-_]|ext[-_]|comp[-_]|mantine[-_]|mui[-_]|chakra[-_]|ant[-_]|antd[-_]|bs[-_]|bootstrap[-_]|radix[-_]|headlessui[-_]|headless[-_]|p[-_]|prime[-_]|sui[-_]|semantic[-_])|kon[-_]|rf[-_]/i;
  const randomColonsPattern = /:\w+:/;
  const digitSuffix = /[-_](?=.*\d)[a-z\d]{4,}$/i;
  const randomAlphanumericPattern = /^(?=.*[a-z])(?=.*[0-9])[a-z0-9]{8,}$|^[a-z0-9]{12,}$/i;
  const semanticPattern = /^_?[a-zA-Z][a-zA-Z0-9]*(?:([A-Z][a-zA-Z0-9]+)|([-_]{1,2}[a-zA-Z0-9]+))*$/;
  return uuidPattern.test(id) || isEntirelyNumbers.test(id) || timeBasedIds.test(id) || libPrefixes.test(id) || randomColonsPattern.test(id) || digitSuffix.test(id) || randomAlphanumericPattern.test(id) || !semanticPattern.test(id);
}
function isDynamicAttr(name, value) {
  if (name === "id") {
    return isDynamicId2(value);
  }
  return false;
}
function isUniqueCSSSelector(element, selector, logErrors = false) {
  try {
    const elements = Array.from(document.querySelectorAll(selector));
    if (elements.length === 1 && elements[0] === element) {
      return true;
    }
    return false;
  } catch (error) {
    if (logErrors) {
      console.error("Invalid selector:", selector, error);
    }
    return false;
  }
}
function hasDeterministicStarting(selector, options) {
  const idString = "#";
  const dataString = "data-";
  try {
    const startingParentSelector = selector.split(">")[0].trim() || "";
    if (options.deterministicLocatorCounter !== void 0 && options.deterministicLocatorCounter > 0 && (startingParentSelector.startsWith(idString) || startingParentSelector.includes(dataString))) {
      return true;
    }
  } catch (error) {
    if (options.logErrors) {
      console.error("Could not check if selector has deterministic starting:", selector, error);
    }
    return false;
  }
  return false;
}
function isUniqueXPathSelector(element, xpath, logErrors = false) {
  try {
    const result2 = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    return result2.snapshotLength === 1 && result2.snapshotItem(0) === element;
  } catch (error) {
    if (logErrors) {
      console.error("Invalid XPath selector:", xpath, error);
    }
    return false;
  }
}
var VALID_TAGS_FOR_TEXT_SELECTORS = /* @__PURE__ */ new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "label",
  "button",
  "a",
  "li",
  "td",
  "th",
  "span",
  "strong",
  "em",
  "span",
  "b",
  "i",
  "small",
  "caption",
  "figcaption"
]);
function getElementTagName(element) {
  return element.localName.toLowerCase();
}
function normalizeText(text) {
  return text.trim().replace(/\s+/g, " ");
}
function getTextSelector(element) {
  const textContent = element.textContent || "";
  const normalizedText = normalizeText(textContent);
  let textSelector = null;
  if (normalizedText) {
    const tagName = element.tagName.toLowerCase();
    textSelector = `${tagName}:has-text("${escapeAttribute(normalizedText)}")`;
  }
  return textSelector;
}
function isUniqueTextSelector(textSelectorElement, searchText) {
  let matches = 0;
  const elements = Array.from(document.querySelectorAll(textSelectorElement.tagName.toLowerCase()));
  for (const element of elements) {
    if (matches > 1) break;
    const normalizedText = normalizeText(element.textContent || "");
    if (normalizedText) {
      if (normalizedText.toLowerCase().includes(searchText.toLowerCase())) matches++;
    }
  }
  return matches === 1;
}
function getNthOfTypeSelector(element) {
  const parent = element.parentElement;
  if (!parent) return getElementTagName(element);
  const tagName = getElementTagName(element);
  const siblings = Array.from(parent.children);
  const sameTypeSiblings = siblings.filter((child) => getElementTagName(child) === tagName);
  if (sameTypeSiblings.length === 1) {
    return tagName;
  }
  const index = sameTypeSiblings.indexOf(element) + 1;
  return `${tagName}:nth-of-type(${index})`;
}
function getAllAttributeSelectors(element, attributes, includeTag = true) {
  if (!attributes) return [];
  const selectors = [];
  for (const attrName of attributes) {
    const attrValue = element.getAttribute(attrName);
    if (attrValue && !isDynamicAttr(attrName, attrValue)) {
      const espaceDotsAndSpaces = attrName.startsWith("data-");
      const attrSelector = `[${attrName}="${escapeAttribute(attrValue, espaceDotsAndSpaces)}"]`;
      const selector = includeTag ? `${getElementTagName(element)}${attrSelector}` : attrSelector;
      if (isUniqueCSSSelector(element, selector)) {
        selectors.push(selector);
      }
    }
  }
  return selectors;
}
function getAllElementSelectors(element, options) {
  const selectors = [];
  const { dataAttributes, nameAttributes, customAttrFallback } = options;
  if (element.id && !isDynamicId2(element.id)) {
    const idSelector = `#${CSS.escape(element.id)}`;
    if (isUniqueCSSSelector(element, idSelector)) {
      if (options.deterministicLocatorCounter !== void 0) {
        options.deterministicLocatorCounter++;
      }
      selectors.push(idSelector);
    }
  }
  const dataAttributeSelectors = getAllAttributeSelectors(element, dataAttributes);
  if (dataAttributeSelectors.length > 0) {
    if (options.deterministicLocatorCounter !== void 0) {
      options.deterministicLocatorCounter++;
    }
    selectors.push(...dataAttributeSelectors);
  }
  const otherAttributes = [...nameAttributes || [], ...customAttrFallback || []];
  const otherAttributeSelectors = getAllAttributeSelectors(element, otherAttributes);
  if (otherAttributeSelectors.length > 0) {
    selectors.push(...otherAttributeSelectors);
  }
  return selectors;
}
function getAllUniqueCssSelectors(element, options) {
  const allUniqueSelectors = /* @__PURE__ */ new Set();
  const maxDepth = options.maxDepth || 10;
  const initialSelectors = getAllElementSelectors(element, options);
  let paths = [];
  if (initialSelectors.length > 0) {
    for (const selector of initialSelectors) {
      if (isUniqueCSSSelector(element, selector, options.logErrors)) {
        allUniqueSelectors.add(selector);
      }
      paths.push({
        selectors: [selector],
        currentElement: element.parentElement,
        depth: 1
      });
    }
  } else {
    const nthOfTypeSelector = getNthOfTypeSelector(element);
    if (isUniqueCSSSelector(element, nthOfTypeSelector, options.logErrors)) {
      if (hasDeterministicStarting(nthOfTypeSelector, options)) {
        allUniqueSelectors.add(nthOfTypeSelector);
      }
    }
    paths.push({
      selectors: [nthOfTypeSelector],
      currentElement: element.parentElement,
      depth: 1
    });
  }
  while (paths.length > 0) {
    const newPaths = [];
    for (const path of paths) {
      const combinedSelector = path.selectors.join(" > ");
      if (isUniqueCSSSelector(element, combinedSelector, options.logErrors)) {
        if (hasDeterministicStarting(combinedSelector, options)) {
          allUniqueSelectors.add(combinedSelector);
        }
      }
      if (path.depth >= maxDepth || !path.currentElement) {
        continue;
      }
      const parentElement = path.currentElement;
      const parentSelectors = getAllElementSelectors(parentElement, options);
      if (parentSelectors.length > 0) {
        for (const parentSelector of parentSelectors) {
          const newSelectors = [parentSelector, ...path.selectors];
          newPaths.push({
            selectors: newSelectors,
            currentElement: parentElement.parentElement,
            depth: path.depth + 1
          });
        }
      } else {
        const parentNthOfTypeSelector = getNthOfTypeSelector(parentElement);
        const newSelectors = [parentNthOfTypeSelector, ...path.selectors];
        newPaths.push({
          selectors: newSelectors,
          currentElement: parentElement.parentElement,
          depth: path.depth + 1
        });
      }
    }
    paths = newPaths;
  }
  return Array.from(allUniqueSelectors);
}
function getUniqueAttributeSelector(element, allAttributes, logErrors = false) {
  for (const attrName of allAttributes) {
    const attrValue = element.getAttribute(attrName);
    if (attrValue && !isDynamicAttr(attrName, attrValue)) {
      const selector = `[@${attrName}="${escapeAttribute(attrValue)}"]`;
      if (isUniqueXPathSelector(element, `//*${selector}`, logErrors)) {
        return selector;
      }
    }
  }
  return null;
}
function getXPath(element, options) {
  const steps = [];
  let currentElement = element;
  while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE) {
    let step = currentElement.localName.toLowerCase();
    const id = currentElement.getAttribute("id");
    if (id && !isDynamicId2(id)) {
      const idSelector = `[@id="${escapeAttribute(id)}"]`;
      if (isUniqueXPathSelector(currentElement, `//*${idSelector}`, options.logErrors)) {
        step = `*${idSelector}`;
        steps.unshift(step);
        break;
      }
    }
    const allAttributes = [
      ...options.dataAttributes || [],
      ...options.nameAttributes || [],
      ...options.customAttrFallback || []
    ];
    const uniqueAttributeSelector = getUniqueAttributeSelector(currentElement, allAttributes, options.logErrors);
    if (uniqueAttributeSelector) {
      step += uniqueAttributeSelector;
      steps.unshift(step);
      break;
    }
    const siblings = currentElement.parentNode ? Array.from(currentElement.parentNode.children) : [];
    const similiarSiblings = siblings.filter((sibling) => sibling.localName === currentElement.localName);
    if (similiarSiblings.length > 1) {
      const index = similiarSiblings.indexOf(currentElement) + 1;
      step += `[${index}]`;
    }
    steps.unshift(step);
    currentElement = currentElement.parentNode;
  }
  if (steps.length === 1 && steps[0].startsWith("svg")) {
    return "//" + steps[0];
  } else if (steps.length > 1 && steps[steps.length - 1].startsWith("svg")) {
    steps.pop();
  }
  return "//" + steps.join("/");
}
function getAbsoluteXPath(element) {
  const steps = [];
  let currentElement = element;
  while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE) {
    let step = currentElement.localName.toLowerCase();
    const siblings = currentElement.parentNode ? Array.from(currentElement.parentNode.children) : [];
    const similiarSiblings = siblings.filter((sibling) => sibling.localName === currentElement.localName);
    if (similiarSiblings.length > 1) {
      const index = similiarSiblings.indexOf(currentElement) + 1;
      step += `[${index}]`;
    }
    steps.unshift(step);
    currentElement = currentElement.parentNode;
  }
  if (steps.length === 1 && steps[0].startsWith("svg")) {
    return "//" + steps[0];
  } else if (steps.length > 1 && steps[steps.length - 1].startsWith("svg")) {
    steps.pop();
  }
  return "//" + steps.join("/");
}
function getAllUniqueSelectors(element, options = {}) {
  if (!(element instanceof Element)) return [];
  const {
    maxDepth = 10,
    // Adjusted max depth
    dataAttributes = ["data-test-id", "data-testid", "data-test", "data-qa", "data-cy"],
    nameAttributes = ["name", "title", "placeholder", "alt", "type", "href", "role"],
    includeTag = true,
    logErrors = false,
    customAttrFallback = [
      "data-pixel-component",
      "data-row-col",
      "data-name",
      "data-icon-name",
      "data-icon",
      "data-node-key",
      "data-id",
      "data-menu-xmlid"
    ],
    deterministicLocatorCounter = 0
  } = options;
  const allSelectors = [];
  const cssSelectors = getAllUniqueCssSelectors(element, {
    maxDepth,
    dataAttributes,
    nameAttributes,
    includeTag,
    logErrors,
    customAttrFallback,
    deterministicLocatorCounter
  });
  if (cssSelectors.length > 0) {
    cssSelectors.forEach((cssSelector) => {
      const modifiedSelector = cssSelector.replace(/\\/g, "\\\\");
      allSelectors.push(modifiedSelector);
    });
  }
  const tagName = element.tagName.toLowerCase();
  if (VALID_TAGS_FOR_TEXT_SELECTORS.has(tagName)) {
    const normalizedText = normalizeText(element.textContent || "");
    const textSelector = getTextSelector(element);
    if (textSelector && isUniqueTextSelector(element, normalizedText)) {
      allSelectors.push(textSelector);
    }
  }
  const xpathSelector = getXPath(element, {
    logErrors,
    dataAttributes,
    nameAttributes,
    customAttrFallback
  });
  if (xpathSelector) {
    allSelectors.push(`xpath=${xpathSelector}`);
  }
  if (!xpathSelector.startsWith("//html")) {
    const absoluteXPath = getAbsoluteXPath(element);
    if (absoluteXPath) {
      allSelectors.push(`xpath=${absoluteXPath}`);
    }
  }
  const modifiedSelectors = allSelectors.map((selector) => ({
    locatorValue: selector,
    isSelected: false
  }));
  return modifiedSelectors;
}

// src/content/services/generateLocators.ts
var TEST_ID_ATTRIBUTE_NAME = "data-test-id";
var LANGUAGE = "javascript";
function generateLocatorsForElement(element, injectedScript, isVerifyingText) {
  let locator = null;
  let allUniqueLocators = [];
  const { selector, selectors } = injectedScript.generateSelector(element, {
    testIdAttributeName: TEST_ID_ATTRIBUTE_NAME,
    multiple: true,
    omitInternalEngines: false,
    isVerifyingText
  });
  if (!selector || !selectors || (selectors == null ? void 0 : selectors.length) === 0) return null;
  locator = asLocator(LANGUAGE, selector);
  allUniqueLocators = selectors.map((s) => {
    const locator2 = asLocator(LANGUAGE, s);
    const isSelected = locator2 === s;
    return {
      locatorValue: locator2,
      isSelected
    };
  });
  const fallbackLocators = getAllUniqueSelectors(element);
  const modifiedFallbackLocators = fallbackLocators.map((loc) => __spreadProps(__spreadValues({}, loc), {
    locatorValue: `locator('${loc.locatorValue}')`
  }));
  allUniqueLocators.push(...modifiedFallbackLocators);
  return { locator, allUniqueLocators };
}

// src/content/services/elementUtils.ts
function getFirstMeaningfulText(element) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
  if (element instanceof HTMLInputElement) {
    const value = (_a2 = element.value) == null ? void 0 : _a2.trim();
    const placeholder = (_b = element.placeholder) == null ? void 0 : _b.trim();
    const name = (_c = element.name) == null ? void 0 : _c.trim();
    const label = getInputLabelText(element);
    return truncateText(value || placeholder || label || name || "");
  }
  if (element instanceof HTMLSelectElement) {
    const selectedOption = element.options[element.selectedIndex];
    const selectedText = (_d = selectedOption == null ? void 0 : selectedOption.text) == null ? void 0 : _d.trim();
    const selectedValue = (_e = selectedOption == null ? void 0 : selectedOption.value) == null ? void 0 : _e.trim();
    const label = getInputLabelText(element);
    return truncateText(selectedText || selectedValue || label || element.name || "");
  }
  if (element instanceof HTMLButtonElement) {
    const buttonText = (_f = element.textContent) == null ? void 0 : _f.trim();
    const ariaLabel = (_g = element.getAttribute("aria-label")) == null ? void 0 : _g.trim();
    const title = (_h = element.title) == null ? void 0 : _h.trim();
    const value = (_i = element.value) == null ? void 0 : _i.trim();
    return truncateText(buttonText || ariaLabel || title || value || "");
  }
  if (element instanceof HTMLAnchorElement) {
    const text = (_j = element.textContent) == null ? void 0 : _j.trim();
    const ariaLabel = (_k = element.getAttribute("aria-label")) == null ? void 0 : _k.trim();
    const title = (_l = element.title) == null ? void 0 : _l.trim();
    let href = (_m = element.getAttribute("href")) == null ? void 0 : _m.trim();
    if (href) {
      href = href.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
    }
    return truncateText(text || ariaLabel || title || href || "");
  }
  if (element.tagName.toLowerCase() === "svg" || element.tagName.toLowerCase() === "img") {
    return getVisualElementText(element);
  }
  if (TEXT_ELEMENTS.includes(element.tagName.toLowerCase())) {
    const directText = Array.from(element.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => {
      var _a3;
      return (_a3 = node.textContent) == null ? void 0 : _a3.trim();
    }).filter(Boolean).join(" ");
    if (directText) {
      return truncateText(directText);
    }
  }
  const fullText = (_n = element.textContent) == null ? void 0 : _n.trim();
  if (fullText) {
    return truncateText(fullText);
  }
  return "";
}
function getElementContext(element) {
  var _a2, _b, _c, _d, _e, _f;
  const ariaLabel = (_a2 = element.getAttribute("aria-label")) == null ? void 0 : _a2.trim();
  if (ariaLabel) {
    return truncateText(ariaLabel);
  }
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labelElement = document.getElementById(labelledBy);
    if (labelElement) {
      return truncateText(((_b = labelElement.textContent) == null ? void 0 : _b.trim()) || "");
    }
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
    const id = element.id;
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) {
        return truncateText(((_c = label.textContent) == null ? void 0 : _c.trim()) || "");
      }
    }
    const parentLabel = element.closest("label");
    if (parentLabel) {
      const labelText = ((_d = parentLabel.textContent) == null ? void 0 : _d.trim()) || "";
      return truncateText(labelText.replace(element.value || "", "").trim());
    }
  }
  const fieldset = element.closest("fieldset");
  if (fieldset) {
    const legend = fieldset.querySelector("legend");
    if (legend) {
      return truncateText(((_e = legend.textContent) == null ? void 0 : _e.trim()) || "");
    }
  }
  const closestHeading = findClosestHeading(element);
  if (closestHeading) {
    return truncateText(((_f = closestHeading.textContent) == null ? void 0 : _f.trim()) || "");
  }
  return "";
}
function findClosestHeading(element) {
  let current = element;
  while (current && current !== document.body) {
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (HEADING_ELEMENTS.includes(sibling.tagName.toLowerCase())) {
        return sibling;
      }
      sibling = sibling.previousElementSibling;
    }
    current = current.parentElement;
  }
  return element.closest(HEADING_ELEMENTS.join(","));
}
function getInputLabelText(element) {
  var _a2, _b;
  const context = getElementContext(element);
  if (context) {
    return context;
  }
  if (element instanceof HTMLInputElement) {
    const placeholder = (_a2 = element.placeholder) == null ? void 0 : _a2.trim();
    const name = (_b = element.name) == null ? void 0 : _b.trim();
    if (name) {
      return name.replace(/([A-Z])/g, " $1").replace(/_/g, " ").toLowerCase().trim();
    }
    return placeholder || "";
  }
  return "";
}
function truncateText(text, maxLength = MAX_TEXT_LENGTH) {
  if (text.length <= maxLength) return text;
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.7) {
    return truncated.substring(0, lastSpace) + "...";
  }
  return truncated + "...";
}
var MAX_TEXT_LENGTH = 50;
var TEXT_ELEMENTS = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "label", "td", "th", "li"];
var CONTAINER_ELEMENTS = [
  "div",
  "section",
  "article",
  "main",
  "aside",
  "header",
  "footer",
  "nav",
  "form",
  "fieldset",
  "table",
  "ul",
  "ol"
];
var HEADING_ELEMENTS = ["h1", "h2", "h3", "h4", "h5", "h6"];
function getVisualElementText(element) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
  const altText = (_a2 = element.getAttribute("alt")) == null ? void 0 : _a2.trim();
  const ariaLabel = (_b = element.getAttribute("aria-label")) == null ? void 0 : _b.trim();
  const title = (_c = element.getAttribute("title")) == null ? void 0 : _c.trim();
  const name = (_d = element.getAttribute("name")) == null ? void 0 : _d.trim();
  const dataName = (_e = element.getAttribute("data-name")) == null ? void 0 : _e.trim();
  const dataTestId = (_f = element.getAttribute("data-testid")) == null ? void 0 : _f.trim();
  const dataIcon = (_g = element.getAttribute("data-icon")) == null ? void 0 : _g.trim();
  const dataIconName = (_h = element.getAttribute("data-icon-name")) == null ? void 0 : _h.trim();
  const role = (_i = element.getAttribute("role")) == null ? void 0 : _i.trim();
  if (element.tagName.toLowerCase() === "svg") {
    const titleElement = element.querySelector("title");
    const titleText = (_j = titleElement == null ? void 0 : titleElement.textContent) == null ? void 0 : _j.trim();
    const descElement = element.querySelector("desc");
    const descText = (_k = descElement == null ? void 0 : descElement.textContent) == null ? void 0 : _k.trim();
    const svgText = (_l = element.textContent) == null ? void 0 : _l.trim();
    return truncateText(
      altText || ariaLabel || titleText || title || descText || name || dataName || dataTestId || dataIcon || dataIconName || role || svgText || "svg"
    );
  } else if (element.tagName.toLowerCase() === "img") {
    const src = (_m = element.getAttribute("src")) == null ? void 0 : _m.trim();
    const srcName = src ? (_n = src.split("/").pop()) == null ? void 0 : _n.split(".")[0].replace(/[-_]/g, " ") : "";
    return truncateText(altText || ariaLabel || title || name || dataName || dataTestId || role || srcName || "image");
  }
  return "";
}

// src/content/services/elementTitle.ts
function generateLocatorDescription(element) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i;
  if (element.tagName.toLowerCase() === "button") {
    const text2 = getFirstMeaningfulText(element);
    const buttonText = text2 || ((_a2 = element.value) == null ? void 0 : _a2.trim()) || "button";
    return buttonText;
  }
  if (element.tagName.toLowerCase() === "input") {
    const input = element;
    let inputTitle = getInputLabelText(input);
    if (!inputTitle && ((_b = input.placeholder) == null ? void 0 : _b.trim())) {
      inputTitle = input.placeholder.trim();
    }
    if (!inputTitle && ((_c = input.name) == null ? void 0 : _c.trim())) {
      inputTitle = input.name.trim();
    }
    if (input.type === "checkbox" || input.type === "radio") {
      return inputTitle || "checkbox";
    }
    if (input.type === "file") {
      return inputTitle ? `${inputTitle} file upload field` : "file upload field";
    }
    return inputTitle ? `${inputTitle} field` : "input field";
  }
  if (element.tagName.toLowerCase() === "select") {
    const select = element;
    let selectTitle = getInputLabelText(select);
    if (!selectTitle) {
      const selectedOption = select.options[select.selectedIndex];
      if ((_d = selectedOption == null ? void 0 : selectedOption.text) == null ? void 0 : _d.trim()) {
        selectTitle = selectedOption.text.trim();
      }
    }
    if (!selectTitle && ((_e = select.name) == null ? void 0 : _e.trim())) {
      selectTitle = select.name.trim();
    }
    return selectTitle ? `${selectTitle} dropdown` : "dropdown";
  }
  if (element.tagName.toLowerCase() === "a") {
    const text2 = getFirstMeaningfulText(element);
    const linkTitle = (_f = element.getAttribute("title")) == null ? void 0 : _f.trim();
    const displayText = text2 || linkTitle || "link";
    return displayText;
  }
  if (CONTAINER_ELEMENTS.includes(element.tagName.toLowerCase())) {
    const text2 = getFirstMeaningfulText(element);
    if (text2) {
      return text2;
    }
    return element.tagName.toLowerCase();
  }
  if (element.tagName.toLowerCase() === "img") {
    const altText = (_g = element.getAttribute("alt")) == null ? void 0 : _g.trim();
    return altText ? `${altText} image` : "image";
  }
  if (element.tagName.toLowerCase() === "svg") {
    const altText = (_h = element.getAttribute("alt")) == null ? void 0 : _h.trim();
    const titleElement = element.querySelector("title");
    const titleText = (_i = titleElement == null ? void 0 : titleElement.textContent) == null ? void 0 : _i.trim();
    return altText || titleText || "svg";
  }
  const text = getFirstMeaningfulText(element);
  if (text) {
    return text;
  }
  return element.tagName.toLowerCase();
}

// src/content/services/forAgent.ts
var _AgentLocatorGenerator = class _AgentLocatorGenerator {
  constructor() {
    __publicField(this, "injectedScript");
    this.injectedScript = new InjectedScript(window, {
      sdkLanguage: "javascript",
      testIdAttributeName: "data-testid",
      stableRafCount: 1,
      browserName: "chromium",
      inputFileRoleTextbox: false,
      customEngines: [],
      isUnderTest: false
    });
  }
  static getInstance() {
    if (!_AgentLocatorGenerator.instance) {
      _AgentLocatorGenerator.instance = new _AgentLocatorGenerator();
    }
    return _AgentLocatorGenerator.instance;
  }
  getLocatorData(element) {
    const generated = generateLocatorsForElement(element, this.injectedScript);
    if (!generated || !generated.locator) return null;
    const locatorEnglishValue = generateLocatorDescription(element);
    return {
      locator: generated.locator,
      allUniqueLocators: generated.allUniqueLocators,
      locatorEnglishValue
    };
  }
};
__publicField(_AgentLocatorGenerator, "instance");
var AgentLocatorGenerator = _AgentLocatorGenerator;
function setupAgentLocatorGenerator() {
  if (window.__agentLocatorGenerator__) return;
  window.__agentLocatorGenerator__ = AgentLocatorGenerator.getInstance();
}

  
  setupAgentLocatorGenerator();
};
