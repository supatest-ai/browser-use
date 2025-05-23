
(domElement) => {
  // Utility functions
  // src/content/services/locators/locator.ts
function escapeAttribute(value, espaceDotsAndSpaces) {
  if (!espaceDotsAndSpaces) {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\f/g, "\\f");
  }
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\f/g, "\\f").replace(/\./g, "\\.").replace(/\s/g, "\\ ");
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
function isDynamicClass(className) {
  const utilityPattern = /^(w-|h-|bg-|text-|p-|m-)/;
  const hashPattern = /^[a-f0-9]{8,}$/i;
  const frameworkPatterns = [
    /\bng-\w+\b/,
    // Angular
    /\bjsx-\w+\b/,
    // React Styled-components
    /\bcss-\w+\b/
    // CSS modules
  ];
  return hashPattern.test(className) || frameworkPatterns.some((pattern) => pattern.test(className)) || utilityPattern.test(className);
}
function isDynamicAttr(name, value) {
  if (name === "id" || name.startsWith("data-")) {
    return isDynamicId(value);
  } else if (name === "class") {
    return isDynamicClass(value);
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
    const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    return result.snapshotLength === 1 && result.snapshotItem(0) === element;
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
var EXCLUDE_TEXT_SELECTOR_TAGS = ["svg", "path", "desc"];
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
function getAttributeSelector(element, attributes, includeTag = true) {
  if (!attributes) return null;
  for (const attrName of attributes) {
    const attrValue = element.getAttribute(attrName);
    if (attrValue && !isDynamicAttr(attrName, attrValue)) {
      const espaceDotsAndSpaces = attrName.startsWith("data-");
      const attrSelector = `[${attrName}="${escapeAttribute(attrValue, espaceDotsAndSpaces)}"]`;
      const selector = includeTag ? `${getElementTagName(element)}${attrSelector}` : attrSelector;
      if (isUniqueCSSSelector(element, selector)) {
        return selector;
      }
    }
  }
  return null;
}
function getElementSelector(element, options) {
  const { dataAttributes, nameAttributes, customAttrFallback } = options;
  if (element.id && !isDynamicId(element.id)) {
    const idSelector = `#${CSS.escape(element.id)}`;
    if (isUniqueCSSSelector(element, idSelector)) {
      if (options.deterministicLocatorCounter !== void 0) {
        options.deterministicLocatorCounter++;
      }
      return idSelector;
    }
  }
  const dataAttributeSelector = getAttributeSelector(element, dataAttributes);
  if (dataAttributeSelector) {
    if (options.deterministicLocatorCounter !== void 0) {
      options.deterministicLocatorCounter++;
    }
    return dataAttributeSelector;
  }
  const otherAttributes = [...nameAttributes || [], ...customAttrFallback || []];
  const otherAttributeSelector = getAttributeSelector(element, otherAttributes);
  if (otherAttributeSelector) {
    return otherAttributeSelector;
  }
  return null;
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
function getUniqueCssSelector(element, options) {
  let currentElement = element;
  let depth = 0;
  const selectors = [];
  const maxDepth = options.maxDepth || 10;
  while (currentElement && depth < maxDepth) {
    const selector = getElementSelector(currentElement, options);
    if (selector) {
      if (isUniqueCSSSelector(element, selector, options.logErrors)) {
        return selector;
      }
      selectors.unshift(selector);
    } else {
      const nthOfTypeSelector = getNthOfTypeSelector(currentElement);
      selectors.unshift(nthOfTypeSelector);
    }
    const combinedSelector = selectors.join(" > ");
    if (isUniqueCSSSelector(element, combinedSelector, options.logErrors)) {
      if (hasDeterministicStarting(combinedSelector, options)) {
        return combinedSelector;
      }
    }
    const parent = currentElement.parentElement;
    if (!parent) break;
    currentElement = parent;
    depth++;
  }
  const finalSelector = selectors.join(" > ");
  if (isUniqueCSSSelector(element, finalSelector, options.logErrors)) {
    if (hasDeterministicStarting(finalSelector, options)) {
      return finalSelector;
    }
  }
  return null;
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
  if (element.id && !isDynamicId(element.id)) {
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
    if (id && !isDynamicId(id)) {
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
function truncateText(text, maxLength = MAX_TEXT_LENGTH) {
  if (!text || text.length <= maxLength) return text || "";
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > maxLength * 0.7 ? truncated.substring(0, lastSpace) + "..." : truncated + "...";
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
function getElementContext(element) {
  var _a, _b, _c, _d, _e, _f;
  const ariaLabel = (_a = element.getAttribute("aria-label")) == null ? void 0 : _a.trim();
  if (ariaLabel) return truncateText(ariaLabel);
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labelElement = document.getElementById(labelledBy);
    if (labelElement) return truncateText(((_b = labelElement.textContent) == null ? void 0 : _b.trim()) || "");
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
    const id = element.id;
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) return truncateText(((_c = label.textContent) == null ? void 0 : _c.trim()) || "");
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
    if (legend) return truncateText(((_e = legend.textContent) == null ? void 0 : _e.trim()) || "");
  }
  const closestHeading = findClosestHeading(element);
  if (closestHeading) return truncateText(((_f = closestHeading.textContent) == null ? void 0 : _f.trim()) || "");
  return "";
}
function getFirstMeaningfulText(element) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
  if (element instanceof HTMLInputElement) {
    const value = (_a = element.value) == null ? void 0 : _a.trim();
    const placeholder = (_b = element.placeholder) == null ? void 0 : _b.trim();
    const name = (_c = element.name) == null ? void 0 : _c.trim();
    const label = getElementContext(element);
    return truncateText(value || placeholder || label || name || "");
  }
  if (element instanceof HTMLSelectElement) {
    const selectedOption = element.options[element.selectedIndex];
    const selectedText = (_d = selectedOption == null ? void 0 : selectedOption.text) == null ? void 0 : _d.trim();
    const selectedValue = (_e = selectedOption == null ? void 0 : selectedOption.value) == null ? void 0 : _e.trim();
    const label = getElementContext(element);
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
  if (TEXT_ELEMENTS.includes(element.tagName.toLowerCase())) {
    const directText = Array.from(element.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => {
      var _a2;
      return (_a2 = node.textContent) == null ? void 0 : _a2.trim();
    }).filter(Boolean).join(" ");
    if (directText) return truncateText(directText);
  }
  const fullText = (_n = element.textContent) == null ? void 0 : _n.trim();
  if (fullText) return truncateText(fullText);
  return "";
}
function getParentContext(element) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  const formParent = element.closest("form");
  if (formParent) {
    const formLabel = (_a = formParent.getAttribute("aria-label")) == null ? void 0 : _a.trim();
    const formTitle = (_b = formParent.getAttribute("title")) == null ? void 0 : _b.trim();
    const formId = (_c = formParent.id) == null ? void 0 : _c.trim();
    const formName = (_d = formParent.getAttribute("name")) == null ? void 0 : _d.trim();
    const formHeading = findClosestHeading(formParent);
    const formHeadingText = (_e = formHeading == null ? void 0 : formHeading.textContent) == null ? void 0 : _e.trim();
    let readableId = "";
    if (formId || formName) {
      readableId = (formId || formName).replace(/([A-Z])/g, " $1").replace(/_/g, " ").toLowerCase().trim();
    }
    return truncateText(formLabel || formTitle || formHeadingText || readableId || "form");
  }
  for (const containerType of CONTAINER_ELEMENTS) {
    const container = element.closest(containerType);
    if (container && container !== element) {
      const containerHeading = findClosestHeading(container);
      if (containerHeading) {
        return truncateText(((_f = containerHeading.textContent) == null ? void 0 : _f.trim()) || "");
      }
      const containerText = getFirstMeaningfulText(container);
      if (containerText) {
        return truncateText(containerText);
      }
      const containerLabel = (_g = container.getAttribute("aria-label")) == null ? void 0 : _g.trim();
      const containerTitle = (_h = container.getAttribute("title")) == null ? void 0 : _h.trim();
      if (containerLabel || containerTitle) {
        return truncateText(containerLabel || containerTitle || "");
      }
      const id = (_i = container.id) == null ? void 0 : _i.trim();
      if (id && !isDynamicId(id)) {
        const readableId = id.replace(/([A-Z])/g, " $1").replace(/_/g, " ").toLowerCase().trim();
        return truncateText(readableId);
      }
      if (containerType !== "div") {
        return containerType;
      }
    }
  }
  return "";
}
function generateLocatorDescription(element) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q;
  const parentContext = getParentContext(element);
  let description = "";
  if (element.tagName.toLowerCase() === "button") {
    const text = getFirstMeaningfulText(element);
    const buttonText = text || ((_a = element.value) == null ? void 0 : _a.trim()) || "button";
    description = buttonText;
    const type = (_b = element.getAttribute("type")) == null ? void 0 : _b.trim();
    if (type && type !== "submit") {
      description += ` (${type} button)`;
    }
  } else if (element.tagName.toLowerCase() === "input") {
    const input = element;
    let inputTitle = getElementContext(input);
    if (!inputTitle && ((_c = input.placeholder) == null ? void 0 : _c.trim())) {
      inputTitle = input.placeholder.trim();
    }
    if (!inputTitle && ((_d = input.name) == null ? void 0 : _d.trim())) {
      inputTitle = input.name.trim().replace(/([A-Z])/g, " $1").replace(/_/g, " ").toLowerCase();
    }
    if (input.type === "checkbox" || input.type === "radio") {
      description = inputTitle ? `${inputTitle} ${input.type}` : input.type;
      if (input.checked) {
        description += " (checked)";
      }
    } else if (input.type === "file") {
      description = inputTitle ? `${inputTitle} file upload` : "file upload";
    } else if (input.type === "submit" || input.type === "button") {
      description = inputTitle || ((_e = input.value) == null ? void 0 : _e.trim()) || `${input.type} button`;
    } else {
      const type = input.type === "text" ? "" : ` (${input.type})`;
      description = inputTitle ? `${inputTitle} field${type}` : `${input.type || "text"} field`;
    }
  } else if (element.tagName.toLowerCase() === "select") {
    const select = element;
    let selectTitle = getElementContext(select);
    if (!selectTitle) {
      const selectedOption = select.options[select.selectedIndex];
      if ((_f = selectedOption == null ? void 0 : selectedOption.text) == null ? void 0 : _f.trim()) {
        selectTitle = selectedOption.text.trim();
      }
    }
    if (!selectTitle && ((_g = select.name) == null ? void 0 : _g.trim())) {
      selectTitle = select.name.trim().replace(/([A-Z])/g, " $1").replace(/_/g, " ").toLowerCase();
    }
    description = selectTitle ? `${selectTitle} dropdown` : "dropdown";
  } else if (element.tagName.toLowerCase() === "a") {
    const text = getFirstMeaningfulText(element);
    const linkTitle = (_h = element.getAttribute("title")) == null ? void 0 : _h.trim();
    let href = (_i = element.getAttribute("href")) == null ? void 0 : _i.trim();
    if (href) {
      href = href.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
    }
    description = text || linkTitle || href || "link";
    if (href && text && !href.includes(text.toLowerCase())) {
      description += ` (to ${href})`;
    }
  } else if (element.tagName.toLowerCase() === "textarea") {
    let textareaTitle = getElementContext(element);
    if (!textareaTitle && ((_j = element.placeholder) == null ? void 0 : _j.trim())) {
      textareaTitle = element.placeholder.trim();
    }
    if (!textareaTitle && ((_k = element.name) == null ? void 0 : _k.trim())) {
      textareaTitle = element.name.trim().replace(/([A-Z])/g, " $1").replace(/_/g, " ").toLowerCase();
    }
    description = textareaTitle ? `${textareaTitle} text area` : "text area";
  } else if (CONTAINER_ELEMENTS.includes(element.tagName.toLowerCase())) {
    const text = getFirstMeaningfulText(element);
    if (text) {
      description = text;
      if (element.tagName.toLowerCase() !== "div") {
        description += ` (${element.tagName.toLowerCase()})`;
      }
    } else {
      description = element.tagName.toLowerCase();
    }
  } else if (element.tagName.toLowerCase() === "img") {
    const altText = (_l = element.getAttribute("alt")) == null ? void 0 : _l.trim();
    const src = (_m = element.getAttribute("src")) == null ? void 0 : _m.trim();
    if (altText) {
      description = `${altText} image`;
    } else if (src) {
      const filename = ((_n = src.split("/").pop()) == null ? void 0 : _n.split("?")[0]) || "";
      description = filename ? `image (${filename})` : "image";
    } else {
      description = "image";
    }
  } else if (element.tagName.toLowerCase() === "svg") {
    const altText = (_o = element.getAttribute("alt")) == null ? void 0 : _o.trim();
    const titleElement = element.querySelector("title");
    const titleText = (_p = titleElement == null ? void 0 : titleElement.textContent) == null ? void 0 : _p.trim();
    const ariaLabel = (_q = element.getAttribute("aria-label")) == null ? void 0 : _q.trim();
    description = altText || titleText || ariaLabel || "icon";
    if (description !== "icon" && !description.toLowerCase().includes("icon")) {
      description += " icon";
    }
  } else {
    const text = getFirstMeaningfulText(element);
    if (text) {
      description = text;
      if (!TEXT_ELEMENTS.includes(element.tagName.toLowerCase())) {
        description += ` (${element.tagName.toLowerCase()})`;
      }
    } else {
      description = element.tagName.toLowerCase();
    }
  }
  if (parentContext && !description.toLowerCase().includes(parentContext.toLowerCase())) {
    description = `${description} in ${parentContext}`;
  }
  return description;
}
function getUniqueSelector(element, options = {}) {
  if (!(element instanceof Element)) return null;
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
  const cssSelector = getUniqueCssSelector(element, {
    maxDepth,
    dataAttributes,
    nameAttributes,
    includeTag,
    logErrors,
    customAttrFallback,
    deterministicLocatorCounter
  });
  if (cssSelector) {
    return cssSelector.replace(/\\/g, "\\\\");
  }
  const tagName = element.tagName.toLowerCase();
  if (VALID_TAGS_FOR_TEXT_SELECTORS.has(tagName)) {
    const normalizedText = normalizeText(element.textContent || "");
    const textSelector = getTextSelector(element);
    if (textSelector && isUniqueTextSelector(element, normalizedText)) {
      return textSelector;
    }
  }
  const xpathSelector = getXPath(element, {
    logErrors,
    dataAttributes,
    nameAttributes,
    customAttrFallback
  });
  if (xpathSelector) {
    return `xpath=${xpathSelector}`;
  }
  return null;
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


  const locator = getUniqueSelector(domElement);
  let allUniqueLocators = [];
  if (locator) {
    allUniqueLocators = getAllUniqueSelectors(domElement);
    if (allUniqueLocators.length > 0) {
      allUniqueLocators.forEach((otherLocator) => {
        if (otherLocator.locatorValue === locator) {
          otherLocator.isSelected = true;
        }
      });
    }
  }

  // Return public API
  return {
    locator,
    allUniqueLocators,
    locatorEnglishValue: generateLocatorDescription(domElement),
  };
};
