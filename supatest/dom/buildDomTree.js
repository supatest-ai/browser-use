// Import original buildDomTree functionality
const originalBuildDomTree = require("../../browser_use/dom/buildDomTree");

// Add custom supatest locator functionality
function generateSupatestLocatorId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function setSupatestLocatorId(element) {
  const existingId = element.getAttribute("supatest_locator_id");
  if (existingId) {
    return existingId;
  }

  const id = `${generateSupatestLocatorId()}`;
  element.setAttribute("supatest_locator_id", id);
  return id;
}

// Extend the original buildDomTree function
module.exports = (args = {}) => {
  // Get the original function
  const originalFunction = originalBuildDomTree(args);

  // Create a wrapper around the original buildDomTree that processes the node data
  const processNodeData = (nodeData, node) => {
    if (node && node.nodeType === Node.ELEMENT_NODE) {
      // Only set supatest_locator_id for interactive, visible, and top elements
      if (
        nodeData.isInteractive &&
        nodeData.isVisible &&
        nodeData.isTopElement
      ) {
        const locatorId = setSupatestLocatorId(node);
        // Add the locator ID directly to the node data
        nodeData.supatest_locator_id = locatorId;
      }
    }
    return nodeData;
  };

  // Create the enhanced buildDomTree function
  const enhancedBuildDomTree = (node, parentIframe = null) => {
    // Call original buildDomTree function to get the base result
    const result = originalFunction(node, parentIframe);

    // Process each node in the map to add supatest_locator_id where needed
    if (result && result.map) {
      for (const [id, nodeData] of Object.entries(result.map)) {
        // Find the corresponding DOM node using xpath
        let element = null;
        if (nodeData.xpath) {
          try {
            const xpathResult = document.evaluate(
              nodeData.xpath,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null
            );
            element = xpathResult.singleNodeValue;
          } catch (e) {
            console.warn(
              `Error finding element for xpath ${nodeData.xpath}:`,
              e
            );
          }
        }

        if (element) {
          result.map[id] = processNodeData(nodeData, element);
        }
      }
    }

    return result;
  };

  return enhancedBuildDomTree;
};
