(domElement) => {
  // Utility functions
  function escapeAttribute(value) {
    return value
      .replace(/\\/g, "\\\\") // Escape backslashes
      .replace(/"/g, '\\"') // Escape double quotes
      .replace(/'/g, "\\'") // Escape single quotes
      .replace(/\n/g, "\\n") // Escape newlines
      .replace(/\r/g, "\\r") // Escape carriage returns
      .replace(/\f/g, "\\f"); // Escape form feeds
  }

  function isDynamicId(id) {
    const dynamicIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}/i; // UUID v4
    const randomPattern = /:\w+:/; // Matches ':r4g:', ':abcd:', etc.
    const longNumbersPattern = /^\d{10,}$/; // Detect long numeric IDs

    // Additional common dynamic ID patterns
    const reactPatterns = /^(rc[-_]|r[-_]|react[-_])/i; // React-related IDs
    const commonPrefixes =
      /^(ember\d+|vue[-_]|ng[-_]|ember[-_]|ext[-_]|comp[-_])/i; // Framework-generated IDs
    const randomSuffixes = /[-_][a-z0-9]{4,}$/i; // Random suffixes like -x4f2 or _x4f2
    const timeBasedIds = /\d{13,}$/; // Timestamp-based IDs (milliseconds)
    const containsNumbers = /\d+/; // Match any ID containing numbers

    return (
      dynamicIdPattern.test(id) ||
      randomPattern.test(id) ||
      longNumbersPattern.test(id) ||
      reactPatterns.test(id) ||
      commonPrefixes.test(id) ||
      randomSuffixes.test(id) ||
      timeBasedIds.test(id) ||
      containsNumbers.test(id)
    );
  }

  function isDynamicClass(className) {
    const utilityPattern = /^(w-|h-|bg-|text-|p-|m-)/; // Tailwind utility classes
    const hashPattern = /^[a-f0-9]{8,}$/i; // Hash-like classes
    const frameworkPatterns = [
      /\bng-\w+\b/, // Angular
      /\bjsx-\w+\b/, // React Styled-components
      /\bcss-\w+\b/, // CSS modules
    ];

    // Combine hash detection, framework patterns, and utility class detection
    return (
      hashPattern.test(className) ||
      frameworkPatterns.some((pattern) => pattern.test(className)) ||
      utilityPattern.test(className)
    );
  }

  function isDynamicAttr(name, value) {
    if (name === "id") {
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

  function isUniqueXPathSelector(element, xpath, logErrors = false) {
    try {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      return result.snapshotLength === 1 && result.snapshotItem(0) === element;
    } catch (error) {
      if (logErrors) {
        console.error(`Invalid XPath: ${xpath}`, error);
      }
      return false;
    }
  }

  // Text selector utilities
  const EXCLUDE_TEXT_SELECTOR_TAGS = ["svg", "path", "desc"];

  function getElementsByText(str, tag) {
    return Array.prototype.slice
      .call(document.getElementsByTagName(tag))
      .filter((el) => el.textContent.trim() === str.trim());
  }

  function isUniqueTextContent(element, text) {
    const tagName = getElementTagName(element);
    const elements = getElementsByText(text, tagName);
    return elements.length === 1 && elements[0] === element;
  }

  // CSS selector generation
  function getElementTagName(element) {
    return element.localName.toLowerCase();
  }

  function getAttributeSelector(element, attributes, includeTag = true) {
    if (!attributes) return null;

    for (const attrName of attributes) {
      const attrValue = element.getAttribute(attrName);
      if (attrValue && !isDynamicAttr(attrName, attrValue)) {
        const attrSelector = `[${attrName}="${escapeAttribute(attrValue)}"]`;
        const selector = includeTag
          ? `${getElementTagName(element)}${attrSelector}`
          : attrSelector;
        if (isUniqueCSSSelector(element, selector)) {
          return selector;
        }
      }
    }
    return null;
  }

  function getElementSelector(element, options) {
    const { dataAttributes, nameAttributes, customAttrFallback } = options;
    // 1. Try using ID
    if (element.id && !isDynamicId(element.id)) {
      const idSelector = `#${CSS.escape(element.id)}`;
      if (isUniqueCSSSelector(element, idSelector)) {
        return idSelector;
      }
    }

    // 2. Try using a single stable data attribute
    const dataAttributeSelector = getAttributeSelector(element, dataAttributes);
    if (dataAttributeSelector) {
      return dataAttributeSelector;
    }

    // 3. Try using a single stable aria or name attribute
    const otherAttributes = [
      ...(nameAttributes || []),
      ...(customAttrFallback || []),
    ];
    const otherAttributeSelector = getAttributeSelector(
      element,
      otherAttributes
    );
    if (otherAttributeSelector) {
      return otherAttributeSelector;
    }

    // 5. Return null if no unique selector is found
    return null;
  }

  function getNthOfTypeSelector(element) {
    const parent = element.parentElement;
    if (!parent) return getElementTagName(element);

    const tagName = getElementTagName(element);
    const siblings = Array.from(parent.children);
    const sameTypeSiblings = siblings.filter(
      (child) => getElementTagName(child) === tagName
    );

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

    const maxDepth = options.maxDepth || 6;
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
        return combinedSelector;
      }

      const parent = currentElement.parentElement;
      if (!parent) break;
      currentElement = parent;
      depth++;
    }

    // If we've traversed up to the maximum depth, try the combined selector
    const finalSelector = selectors.join(" > ");
    if (isUniqueCSSSelector(element, finalSelector, options.logErrors)) {
      return finalSelector;
    }

    return null;
  }

  function getAllAttributeSelectors(element, attributes, includeTag = true) {
    if (!attributes) return [];

    const selectors = [];
    for (const attrName of attributes) {
      const attrValue = element.getAttribute(attrName);
      if (attrValue && !isDynamicAttr(attrName, attrValue)) {
        const attrSelector = `[${attrName}="${escapeAttribute(attrValue)}"]`;
        const selector = includeTag
          ? `${getElementTagName(element)}${attrSelector}`
          : attrSelector;
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
    // 1. Try using ID
    if (element.id && !isDynamicId(element.id)) {
      const idSelector = `#${CSS.escape(element.id)}`;
      if (isUniqueCSSSelector(element, idSelector)) {
        selectors.push(idSelector);
      }
    }

    // 2. Try using a single stable data attribute
    const dataAttributeSelectors = getAllAttributeSelectors(
      element,
      dataAttributes
    );
    if (dataAttributeSelectors.length > 0) {
      selectors.push(...dataAttributeSelectors);
    }

    // 3. Try using a single stable aria or name attribute
    const otherAttributes = [
      ...(nameAttributes || []),
      ...(customAttrFallback || []),
    ];
    const otherAttributeSelectors = getAllAttributeSelectors(
      element,
      otherAttributes
    );
    if (otherAttributeSelectors.length > 0) {
      selectors.push(...otherAttributeSelectors);
    }

    return selectors;
  }

  function getAllUniqueCssSelectors(element, options) {
    const allUniqueSelectors = new Set();

    const maxDepth = options.maxDepth || 6;

    // Get all possible selectors for the initial element
    const initialSelectors = getAllElementSelectors(element, options);

    // Initialize paths
    let paths = [];

    // Handle initial selectors
    if (initialSelectors.length > 0) {
      for (const selector of initialSelectors) {
        if (isUniqueCSSSelector(element, selector, options.logErrors)) {
          allUniqueSelectors.add(selector);
        }
        paths.push({
          selectors: [selector],
          currentElement: element.parentElement,
          depth: 1,
        });
      }
    } else {
      // Use nth-of-type selector if no other selectors are available
      const nthOfTypeSelector = getNthOfTypeSelector(element);
      if (isUniqueCSSSelector(element, nthOfTypeSelector, options.logErrors)) {
        allUniqueSelectors.add(nthOfTypeSelector);
      }
      paths.push({
        selectors: [nthOfTypeSelector],
        currentElement: element.parentElement,
        depth: 1,
      });
    }

    // Process paths
    while (paths.length > 0) {
      const newPaths = [];

      for (const path of paths) {
        const combinedSelector = path.selectors.join(" > ");
        if (isUniqueCSSSelector(element, combinedSelector, options.logErrors)) {
          allUniqueSelectors.add(combinedSelector);
        }

        // Stop if maximum depth is reached or no parent exists
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
              depth: path.depth + 1,
            });
          }
        } else {
          // Use nth-of-type selector for the parent if no other selectors are available
          const parentNthOfTypeSelector = getNthOfTypeSelector(parentElement);
          const newSelectors = [parentNthOfTypeSelector, ...path.selectors];
          newPaths.push({
            selectors: newSelectors,
            currentElement: parentElement.parentElement,
            depth: path.depth + 1,
          });
        }
      }

      paths = newPaths;
    }

    return Array.from(allUniqueSelectors);
  }

  function getUniqueSelector(element, options = {}) {
    if (!(element instanceof Element)) return null;

    // Configuration with default values
    const {
      maxDepth = 6, // Adjusted max depth
      dataAttributes = ["data-test-id", "data-testid", "data-test", "data-qa"],
      nameAttributes = [
        "name",
        "title",
        "placeholder",
        "alt",
        "type",
        "href",
        "role",
      ],
      includeTag = true,
      logErrors = false,
      customAttrFallback = [
        "data-pixel-component",
        "data-row-col",
        "data-name",
        "data-icon-name",
        "data-icon",
        "data-cy",
        "data-node-key",
        "data-id",
        "data-menu-xmlid",
      ],
    } = options;

    const cssSelector = getUniqueCssSelector(element, {
      maxDepth,
      dataAttributes,
      nameAttributes,
      includeTag,
      logErrors,
      customAttrFallback,
    });
    if (cssSelector) {
      return cssSelector.replace(/\\/g, "\\\\");
    }

    // Fallback to text selector if css selector is not available
    if (
      !EXCLUDE_TEXT_SELECTOR_TAGS.includes(element.tagName.toLowerCase()) &&
      !element.closest("svg")
    ) {
      const textContent = element.textContent?.trim();
      if (
        textContent &&
        textContent.length > 0 &&
        textContent.length < 100 &&
        isUniqueTextContent(element, textContent)
      ) {
        return `text=${escapeAttribute(textContent)}`;
      }
    }

    // If no unique CSS selector and/or text selector is found, use XPath generation
    const xpathSelector = getXPath(element, {
      logErrors,
      dataAttributes,
      nameAttributes,
      customAttrFallback,
    });
    if (xpathSelector) {
      return `xpath=${xpathSelector}`;
    }

    // If all methods fail, return null
    return null;
  }

  function getAllUniqueSelectors(element, options = {}) {
    if (!(element instanceof Element)) return [];

    // Configuration with default values
    const {
      maxDepth = 6, // Adjusted max depth
      dataAttributes = ["data-test-id", "data-testid", "data-test", "data-qa"],
      nameAttributes = [
        "name",
        "title",
        "placeholder",
        "alt",
        "type",
        "href",
        "role",
      ],
      includeTag = true,
      logErrors = false,
      customAttrFallback = [
        "data-pixel-component",
        "data-row-col",
        "data-name",
        "data-icon-name",
        "data-icon",
        "data-cy",
        "data-node-key",
        "data-id",
        "data-menu-xmlid",
      ],
    } = options;
    const allSelectors = [];

    const cssSelectors = getAllUniqueCssSelectors(element, {
      maxDepth,
      dataAttributes,
      nameAttributes,
      includeTag,
      logErrors,
      customAttrFallback,
    });

    if (cssSelectors.length > 0) {
      cssSelectors.forEach((cssSelector) => {
        const modifiedSelector = cssSelector.replace(/\\/g, "\\\\");
        allSelectors.push(modifiedSelector);
      });
    }

    // Fallback to text selector if css selector is not available
    if (
      !EXCLUDE_TEXT_SELECTOR_TAGS.includes(element.tagName.toLowerCase()) &&
      !element.closest("svg")
    ) {
      const textContent = element.textContent?.trim();
      if (
        textContent &&
        textContent.length > 0 &&
        textContent.length < 100 &&
        isUniqueTextContent(element, textContent)
      ) {
        allSelectors.push(`text=${escapeAttribute(textContent)}`);
      }
    }

    // If no unique CSS selector and/or text selector is found, use XPath generation
    const xpathSelector = getXPath(element, {
      logErrors,
      dataAttributes,
      nameAttributes,
      customAttrFallback,
    });
    if (xpathSelector) {
      allSelectors.push(`xpath=${xpathSelector}`);
    }

    // If all methods fail, return null
    const modifiedSelectors = allSelectors.map((selector) => ({
      locatorValue: selector,
      isSelected: false,
    }));
    return modifiedSelectors;
  }

  // XPath selector generation
  function getUniqueAttributeXPathSelector(
    element,
    allAttributes,
    logErrors = false
  ) {
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

      // Check for id attribute
      const id = currentElement.getAttribute("id");
      if (id && !isDynamicId(id)) {
        step = `*[@id="${escapeAttribute(id)}"]`;
        steps.unshift(step);
        break;
      }

      // Handle attributes
      const allAttributes = [
        ...(options.dataAttributes || []),
        ...(options.nameAttributes || []),
        ...(options.customAttrFallback || []),
      ];
      const uniqueAttributeSelector = getUniqueAttributeXPathSelector(
        currentElement,
        allAttributes,
        options.logErrors
      );
      if (uniqueAttributeSelector) {
        step += uniqueAttributeSelector;
        steps.unshift(step);
        break;
      }

      // Calculate position among siblings
      const siblings = currentElement.parentNode
        ? Array.from(currentElement.parentNode.children)
        : [];
      const similiarSiblings = siblings.filter(
        (sibling) => sibling.localName === currentElement.localName
      );

      if (similiarSiblings.length > 1) {
        const index = similiarSiblings.indexOf(currentElement) + 1;
        step += `[${index}]`;
      }

      steps.unshift(step);
      currentElement = currentElement.parentNode;
    }

    // Remove the last step if it is an SVG element to ensure the selector is clickable
    if (steps.length === 1 && steps[0].startsWith("svg")) {
      return "//" + steps[0];
    } else if (steps.length > 1 && steps[steps.length - 1].startsWith("svg")) {
      steps.pop();
    }

    return "//" + steps.join("/");
  }

  function getUniqueCssSelector(element, options) {
    let currentElement = element;
    let depth = 0;
    const selectors = [];

    const maxDepth = options.maxDepth || 6;
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
        return combinedSelector;
      }

      const parent = currentElement.parentElement;
      if (!parent) break;
      currentElement = parent;
      depth++;
    }

    // If we've traversed up to the maximum depth, try the combined selector
    const finalSelector = selectors.join(" > ");
    if (isUniqueCSSSelector(element, finalSelector, options.logErrors)) {
      return finalSelector;
    }

    return null;
  }

  function getAllUniqueCssSelectors(element, options) {
    const allUniqueSelectors = new Set();

    const maxDepth = options.maxDepth || 6;

    // Get all possible selectors for the initial element
    const initialSelectors = getAllElementSelectors(element, options);

    // Initialize paths
    let paths = [];

    // Handle initial selectors
    if (initialSelectors.length > 0) {
      for (const selector of initialSelectors) {
        if (isUniqueCSSSelector(element, selector, options.logErrors)) {
          allUniqueSelectors.add(selector);
        }
        paths.push({
          selectors: [selector],
          currentElement: element.parentElement,
          depth: 1,
        });
      }
    } else {
      // Use nth-of-type selector if no other selectors are available
      const nthOfTypeSelector = getNthOfTypeSelector(element);
      if (isUniqueCSSSelector(element, nthOfTypeSelector, options.logErrors)) {
        allUniqueSelectors.add(nthOfTypeSelector);
      }
      paths.push({
        selectors: [nthOfTypeSelector],
        currentElement: element.parentElement,
        depth: 1,
      });
    }

    // Process paths
    while (paths.length > 0) {
      const newPaths = [];

      for (const path of paths) {
        const combinedSelector = path.selectors.join(" > ");
        if (isUniqueCSSSelector(element, combinedSelector, options.logErrors)) {
          allUniqueSelectors.add(combinedSelector);
        }

        // Stop if maximum depth is reached or no parent exists
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
              depth: path.depth + 1,
            });
          }
        } else {
          // Use nth-of-type selector for the parent if no other selectors are available
          const parentNthOfTypeSelector = getNthOfTypeSelector(parentElement);
          const newSelectors = [parentNthOfTypeSelector, ...path.selectors];
          newPaths.push({
            selectors: newSelectors,
            currentElement: parentElement.parentElement,
            depth: path.depth + 1,
          });
        }
      }

      paths = newPaths;
    }

    return Array.from(allUniqueSelectors);
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
  };
};
