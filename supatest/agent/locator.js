// Constants
const MAX_TEXT_LENGTH = 50;
const TEXT_ELEMENTS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'label', 'td', 'th', 'li'];
const CONTAINER_ELEMENTS = [
  'div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'nav', 'form', 'fieldset', 'table', 'ul', 'ol'
];
const HEADING_ELEMENTS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

// Utility functions
function truncateText(text, maxLength = MAX_TEXT_LENGTH) {
  if (!text || text.length <= maxLength) return text || '';
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > maxLength * 0.7 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
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
  return element.closest(HEADING_ELEMENTS.join(','));
}

function getElementContext(element) {
  const ariaLabel = element.getAttribute('aria-label')?.trim();
  if (ariaLabel) return truncateText(ariaLabel);

  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelElement = document.getElementById(labelledBy);
    if (labelElement) return truncateText(labelElement.textContent?.trim() || '');
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
    const id = element.id;
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) return truncateText(label.textContent?.trim() || '');
    }

    const parentLabel = element.closest('label');
    if (parentLabel) {
      const labelText = parentLabel.textContent?.trim() || '';
      return truncateText(labelText.replace(element.value || '', '').trim());
    }
  }

  const fieldset = element.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    if (legend) return truncateText(legend.textContent?.trim() || '');
  }

  const closestHeading = findClosestHeading(element);
  if (closestHeading) return truncateText(closestHeading.textContent?.trim() || '');

  return '';
}

function getFirstMeaningfulText(element) {
  if (element instanceof HTMLInputElement) {
    const value = element.value?.trim();
    const placeholder = element.placeholder?.trim();
    const name = element.name?.trim();
    const label = getElementContext(element);
    return truncateText(value || placeholder || label || name || '');
  }

  if (element instanceof HTMLSelectElement) {
    const selectedOption = element.options[element.selectedIndex];
    const selectedText = selectedOption?.text?.trim();
    const selectedValue = selectedOption?.value?.trim();
    const label = getElementContext(element);
    return truncateText(selectedText || selectedValue || label || element.name || '');
  }

  if (element instanceof HTMLButtonElement) {
    const buttonText = element.textContent?.trim();
    const ariaLabel = element.getAttribute('aria-label')?.trim();
    const title = element.title?.trim();
    const value = element.value?.trim();
    return truncateText(buttonText || ariaLabel || title || value || '');
  }

  if (element instanceof HTMLAnchorElement) {
    const text = element.textContent?.trim();
    const ariaLabel = element.getAttribute('aria-label')?.trim();
    const title = element.title?.trim();
    let href = element.getAttribute('href')?.trim();
    if (href) {
      href = href.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    }
    return truncateText(text || ariaLabel || title || href || '');
  }

  if (TEXT_ELEMENTS.includes(element.tagName.toLowerCase())) {
    const directText = Array.from(element.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent?.trim())
      .filter(Boolean)
      .join(' ');
    if (directText) return truncateText(directText);
  }

  const fullText = element.textContent?.trim();
  if (fullText) return truncateText(fullText);

  return '';
}

function getParentContext(element) {
  // First check for form context
  const formParent = element.closest('form');
  if (formParent) {
    const formLabel = formParent.getAttribute('aria-label')?.trim();
    const formTitle = formParent.getAttribute('title')?.trim();
    const formId = formParent.id?.trim();
    const formName = formParent.getAttribute('name')?.trim();
    const formHeading = findClosestHeading(formParent);
    const formHeadingText = formHeading?.textContent?.trim();

    // Convert camelCase/snake_case to readable text if using ID/name
    let readableId = '';
    if (formId || formName) {
      readableId = (formId || formName)
        .replace(/([A-Z])/g, ' $1') // camelCase to spaces
        .replace(/_/g, ' ') // snake_case to spaces
        .toLowerCase()
        .trim();
    }

    return truncateText(formLabel || formTitle || formHeadingText || readableId || 'form');
  }

  // Then check for other meaningful containers
  for (const containerType of CONTAINER_ELEMENTS) {
    const container = element.closest(containerType);
    if (container && container !== element) {
      // Try to find a heading within this container first
      const containerHeading = findClosestHeading(container);
      if (containerHeading) {
        return truncateText(containerHeading.textContent?.trim() || '');
      }

      // Then try other identifying attributes
      const containerText = getFirstMeaningfulText(container);
      if (containerText) {
        return truncateText(containerText);
      }

      const containerLabel = container.getAttribute('aria-label')?.trim();
      const containerTitle = container.getAttribute('title')?.trim();
      if (containerLabel || containerTitle) {
        return truncateText(containerLabel || containerTitle || '');
      }

      // If no other context found, try to use a meaningful ID
      const id = container.id?.trim();
      if (id && !isDynamicId(id)) {
        // Convert camelCase or snake_case IDs to readable text
        const readableId = id
          .replace(/([A-Z])/g, ' $1') // camelCase to spaces
          .replace(/_/g, ' ') // snake_case to spaces
          .toLowerCase()
          .trim();
        return truncateText(readableId);
      }

      // If it's a special container type (not div), use that
      if (containerType !== 'div') {
        return containerType;
      }
    }
  }

  return '';
}

function generateLocatorDescription(element) {
  // Get parent context for better descriptions
  const parentContext = getParentContext(element);
  let description = '';

  if (element.tagName.toLowerCase() === 'button') {
    const text = getFirstMeaningfulText(element);
    const buttonText = text || element.value?.trim() || 'button';
    description = buttonText;
    // Add button type if available
    const type = element.getAttribute('type')?.trim();
    if (type && type !== 'submit') {
      description += ` (${type} button)`;
    }
  }

  else if (element.tagName.toLowerCase() === 'input') {
    const input = element;
    let inputTitle = getElementContext(input);

    if (!inputTitle && input.placeholder?.trim()) {
      inputTitle = input.placeholder.trim();
    }

    if (!inputTitle && input.name?.trim()) {
      inputTitle = input.name.trim()
        .replace(/([A-Z])/g, ' $1') // camelCase to spaces
        .replace(/_/g, ' ') // snake_case to spaces
        .toLowerCase();
    }

    if (input.type === 'checkbox' || input.type === 'radio') {
      description = inputTitle ? `${inputTitle} ${input.type}` : input.type;
      if (input.checked) {
        description += ' (checked)';
      }
    }
    else if (input.type === 'file') {
      description = inputTitle ? `${inputTitle} file upload` : 'file upload';
    }
    else if (input.type === 'submit' || input.type === 'button') {
      description = inputTitle || input.value?.trim() || `${input.type} button`;
    }
    else {
      const type = input.type === 'text' ? '' : ` (${input.type})`;
      description = inputTitle ? `${inputTitle} field${type}` : `${input.type || 'text'} field`;
    }
  }

  else if (element.tagName.toLowerCase() === 'select') {
    const select = element;
    let selectTitle = getElementContext(select);

    if (!selectTitle) {
      const selectedOption = select.options[select.selectedIndex];
      if (selectedOption?.text?.trim()) {
        selectTitle = selectedOption.text.trim();
      }
    }

    if (!selectTitle && select.name?.trim()) {
      selectTitle = select.name.trim()
        .replace(/([A-Z])/g, ' $1') // camelCase to spaces
        .replace(/_/g, ' ') // snake_case to spaces
        .toLowerCase();
    }

    description = selectTitle ? `${selectTitle} dropdown` : 'dropdown';
  }

  else if (element.tagName.toLowerCase() === 'a') {
    const text = getFirstMeaningfulText(element);
    const linkTitle = element.getAttribute('title')?.trim();
    let href = element.getAttribute('href')?.trim();
    if (href) {
      href = href.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    }
    description = text || linkTitle || href || 'link';
    // Add link destination if different from text
    if (href && text && !href.includes(text.toLowerCase())) {
      description += ` (to ${href})`;
    }
  }

  else if (element.tagName.toLowerCase() === 'textarea') {
    let textareaTitle = getElementContext(element);
    if (!textareaTitle && element.placeholder?.trim()) {
      textareaTitle = element.placeholder.trim();
    }
    if (!textareaTitle && element.name?.trim()) {
      textareaTitle = element.name.trim()
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .toLowerCase();
    }
    description = textareaTitle ? `${textareaTitle} text area` : 'text area';
  }

  else if (CONTAINER_ELEMENTS.includes(element.tagName.toLowerCase())) {
    const text = getFirstMeaningfulText(element);
    if (text) {
      description = text;
      // Add element type for clarity if it's not a div
      if (element.tagName.toLowerCase() !== 'div') {
        description += ` (${element.tagName.toLowerCase()})`;
      }
    } else {
      description = element.tagName.toLowerCase();
    }
  }

  else if (element.tagName.toLowerCase() === 'img') {
    const altText = element.getAttribute('alt')?.trim();
    const src = element.getAttribute('src')?.trim();
    if (altText) {
      description = `${altText} image`;
    } else if (src) {
      // Extract filename from src
      const filename = src.split('/').pop()?.split('?')[0] || '';
      description = filename ? `image (${filename})` : 'image';
    } else {
      description = 'image';
    }
  }

  else if (element.tagName.toLowerCase() === 'svg') {
    const altText = element.getAttribute('alt')?.trim();
    const titleElement = element.querySelector('title');
    const titleText = titleElement?.textContent?.trim();
    const ariaLabel = element.getAttribute('aria-label')?.trim();
    description = altText || titleText || ariaLabel || 'icon';
    if (description !== 'icon' && !description.toLowerCase().includes('icon')) {
      description += ' icon';
    }
  }

  else {
    const text = getFirstMeaningfulText(element);
    if (text) {
      description = text;
      // Add element type for non-standard elements
      if (!TEXT_ELEMENTS.includes(element.tagName.toLowerCase())) {
        description += ` (${element.tagName.toLowerCase()})`;
      }
    } else {
      description = element.tagName.toLowerCase();
    }
  }

  // Add parent context if available and relevant
  if (parentContext && !description.toLowerCase().includes(parentContext.toLowerCase())) {
    description = `${description} in ${parentContext}`;
  }

  return description;
}

(domElement) => {
  // Utility functions
  function escapeAttribute(str) {
    return str.replace(/"/g, '\\"');
  }

  function getElementTagName(element) {
    return element.localName.toLowerCase();
  }

  // Dynamic ID/attribute detection
  function isDynamicId(id) {
    const dynamicPatterns = [
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i, // UUID
      /^[a-f0-9]{24}$/i, // MongoDB ObjectId
      /^[a-f0-9]{32}$/i, // MD5
      /^[0-9]+$/, // Pure numbers
      /^[a-f0-9]{8,}$/i, // Long hex strings
      /^[a-z0-9]{8,}$/i, // Long alphanumeric strings
      /^[a-z0-9]+[-_][a-z0-9]+[-_][a-z0-9]+/i, // Multiple segments with random parts
    ];
    return dynamicPatterns.some((pattern) => pattern.test(id));
  }

  function isDynamicAttr(attrName, attrValue) {
    return isDynamicId(attrValue);
  }

  // Selector uniqueness checking
  function isUniqueCSSSelector(element, selector, logErrors = false) {
    try {
      const matches = document.querySelectorAll(selector);
      return matches.length === 1 && matches[0] === element;
    } catch (error) {
      if (logErrors) {
        console.error(`Invalid selector: ${selector}`, error);
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

    // Try using ID
    if (element.id && !isDynamicId(element.id)) {
      const idSelector = `#${CSS.escape(element.id)}`;
      if (isUniqueCSSSelector(element, idSelector)) {
        return idSelector;
      }
    }

    // Try using a single stable data attribute
    const dataAttributeSelector = getAttributeSelector(element, dataAttributes);
    if (dataAttributeSelector) {
      return dataAttributeSelector;
    }

    // Try using a single stable aria or name attribute
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

  // Main selector functions
  function getUniqueSelector(element, options = {}) {
    if (!(element instanceof Element)) return null;

    const defaultOptions = {
      maxDepth: 6,
      dataAttributes: ["data-test-id", "data-testid", "data-test", "data-qa"],
      nameAttributes: [
        "name",
        "title",
        "placeholder",
        "alt",
        "type",
        "href",
        "value",
        "role",
      ],
      includeTag: true,
      logErrors: false,
      customAttrFallback: [
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
    };

    options = { ...defaultOptions, ...options };
    let currentElement = element;
    let depth = 0;
    const selectors = [];

    // Try CSS selectors first
    while (currentElement && depth < options.maxDepth) {
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

    // Try text selector if CSS selector fails
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

    // Try XPath as last resort
    const xpathSelector = getXPath(element, options);
    if (xpathSelector) {
      return `xpath=${xpathSelector}`;
    }

    return null;
  }

  function getAllUniqueSelectors(element, options = {}) {
    if (!(element instanceof Element)) return [];

    const defaultOptions = {
      maxDepth: 6,
      dataAttributes: ["data-test-id", "data-testid", "data-test", "data-qa"],
      nameAttributes: [
        "name",
        "title",
        "placeholder",
        "alt",
        "type",
        "href",
        "value",
        "role",
      ],
      includeTag: true,
      logErrors: false,
      customAttrFallback: [
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
    };

    options = { ...defaultOptions, ...options };
    const allSelectors = new Set();

    // Get CSS selectors
    let currentElement = element;
    let depth = 0;
    const selectorPaths = [[]];

    while (currentElement && depth < options.maxDepth) {
      const newPaths = [];

      for (const path of selectorPaths) {
        const selector = getElementSelector(currentElement, options);
        if (selector) {
          const newPath = [selector, ...path];
          const combinedSelector = newPath.join(" > ");
          if (
            isUniqueCSSSelector(element, combinedSelector, options.logErrors)
          ) {
            allSelectors.add(combinedSelector);
          }
          newPaths.push(newPath);
        }

        const nthTypeSelector = getNthOfTypeSelector(currentElement);
        const nthTypePath = [nthTypeSelector, ...path];
        const nthTypeCombined = nthTypePath.join(" > ");
        if (isUniqueCSSSelector(element, nthTypeCombined, options.logErrors)) {
          allSelectors.add(nthTypeCombined);
        }
        newPaths.push(nthTypePath);
      }

      selectorPaths.push(...newPaths);
      const parent = currentElement.parentElement;
      if (!parent) break;
      currentElement = parent;
      depth++;
    }

    // Add text selector if applicable
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
        allSelectors.add(`text=${escapeAttribute(textContent)}`);
      }
    }

    // Add XPath selector
    const xpathSelector = getXPath(element, options);
    if (xpathSelector) {
      allSelectors.add(`xpath=${xpathSelector}`);
    }

    return Array.from(allSelectors).map((selector) => ({
      locatorValue: selector,
      isSelected: false,
    }));
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
    locatorEnglishValue: generateLocatorDescription(domElement)
  };
};
