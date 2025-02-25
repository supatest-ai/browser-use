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
  if (element.getAttribute("supatest_locator_id")) {
    return;
  }

  const id = `${generateSupatestLocatorId()}`;
  element.setAttribute("supatest_locator_id", id);
}

// Extend the original buildDomTree function
module.exports = (args = {}) => {
  // Extend the original function by adding supatest locator functionality
  const originalFunction = originalBuildDomTree(args);

  // Modify the buildDomTree function to add supatest locator IDs
  const enhancedBuildDomTree = (node, parentIframe = null) => {
    // Add supatest locator ID to element nodes
    if (node && node.nodeType === Node.ELEMENT_NODE) {
      setSupatestLocatorId(node);
    }

    // Call original buildDomTree function
    return originalFunction(node, parentIframe);
  };

  return enhancedBuildDomTree;
};
