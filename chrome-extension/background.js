/**
 * Bridge Advisor Connector — Background Service Worker
 *
 * Listens for messages from the content script and:
 *   - Updates the extension badge when a PBN is captured
 *   - Injects main-world.js into the page's JS context (bypasses CSP) so we
 *     can intercept URL.createObjectURL and call ExportHandToPTN() directly
 */

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'PBN_CAPTURED' && sender.tab?.id) {
    // Green badge with spade symbol
    chrome.action.setBadgeText({ text: '♠', tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#2a6a2a', tabId: sender.tab.id });
    chrome.action.setBadgeTextColor({ color: '#c0e8c0', tabId: sender.tab.id });
  }

  // Content script asks us to inject main-world.js into the page's JS context.
  // chrome.scripting.executeScript with world:'MAIN' bypasses the page's CSP
  // (it's a browser-level injection, not a <script> tag) so we can access
  // Trickster's window globals like ExportHandToPTN.
  if (message.type === 'INJECT_MAIN_WORLD' && sender.tab?.id) {
    const tabId = sender.tab.id;
    injectMainWorld(tabId, 0);
  }
});

// Retry main-world.js injection up to 3 times with backoff
function injectMainWorld(tabId, attempt) {
  chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    files: ['main-world.js'],
  }).catch(err => {
    console.warn(`[BA background] main-world inject attempt ${attempt + 1} failed:`, err);
    if (attempt < 2) {
      setTimeout(() => injectMainWorld(tabId, attempt + 1), 500 * (attempt + 1));
    }
  });
}

// Clear badge when the tab navigates (new page = fresh state)
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ text: '', tabId });
  }
});
