/**
 * Bridge Advisor Connector — Background Service Worker
 *
 * Listens for messages from the content script and updates the
 * extension badge so the user can see at a glance that a PBN was captured.
 */

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'PBN_CAPTURED' && sender.tab?.id) {
    // Green badge with spade symbol
    chrome.action.setBadgeText({ text: '♠', tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#2a6a2a', tabId: sender.tab.id });
    chrome.action.setBadgeTextColor({ color: '#c0e8c0', tabId: sender.tab.id });
  }
});

// Clear badge when the tab navigates (new page = fresh state)
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ text: '', tabId });
  }
});
