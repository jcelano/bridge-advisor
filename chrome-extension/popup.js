/**
 * Bridge Advisor Connector — Popup Script
 */

document.addEventListener('DOMContentLoaded', () => {

  // ── Load saved state ────────────────────────────────────────────────────
  chrome.storage.local.get(['lastPBN', 'capturedAt', 'bridgeAdvisorUrl'], (data) => {

    // Restore saved URL (or show placeholder)
    const urlInput = document.getElementById('advisor-url');
    urlInput.value = data.bridgeAdvisorUrl || '';
    urlInput.placeholder = 'http://localhost:5174';

    if (data.lastPBN) {
      showCaptured(data.lastPBN, data.capturedAt);
    }
  });

  // ── Show a captured PBN ─────────────────────────────────────────────────
  function showCaptured(pbn, capturedAt) {
    document.getElementById('status-none').style.display = 'none';
    document.getElementById('status-captured').style.display = 'block';

    // Format timestamp
    const ago = capturedAt ? formatAgo(capturedAt) : 'just now';
    document.getElementById('captured-time').textContent = `Captured ${ago}`;

    // Show first few lines of PBN as preview
    const preview = pbn.split('\n').slice(0, 5).join('\n');
    document.getElementById('pbn-preview').textContent = preview;

    // Enable action buttons
    const openBtn = document.getElementById('btn-open');
    const copyBtn = document.getElementById('btn-copy');
    openBtn.disabled = false;
    copyBtn.disabled = false;

    openBtn.addEventListener('click', () => {
      chrome.storage.local.get(['bridgeAdvisorUrl'], (data) => {
        const base = (data.bridgeAdvisorUrl || 'http://localhost:5174').replace(/\/$/, '');
        const url = `${base}?pbn=${encodeURIComponent(pbn)}`;
        chrome.tabs.create({ url });
        window.close();
      });
    });

    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(pbn).then(() => {
        copyBtn.textContent = '✓ Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy PBN to clipboard'; }, 1800);
      });
    });
  }

  // ── Save URL setting ────────────────────────────────────────────────────
  document.getElementById('btn-save').addEventListener('click', () => {
    const url = document.getElementById('advisor-url').value.trim();
    chrome.storage.local.set({ bridgeAdvisorUrl: url || null }, () => {
      const msg = document.getElementById('saved-msg');
      msg.textContent = '✓ Saved';
      setTimeout(() => { msg.textContent = ''; }, 2000);
    });
  });

  // Also save on Enter key in the URL field
  document.getElementById('advisor-url').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-save').click();
  });

  // ── Debug logging toggle ──────────────────────────────────────────────
  const debugToggle = document.getElementById('debug-toggle');
  chrome.storage.local.get(['debugLogging'], (data) => {
    debugToggle.checked = !!data.debugLogging;
  });
  debugToggle.addEventListener('change', () => {
    chrome.storage.local.set({ debugLogging: debugToggle.checked });
  });

  // ── Helpers ─────────────────────────────────────────────────────────────
  function formatAgo(ts) {
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 60)   return 'just now';
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return new Date(ts).toLocaleDateString();
  }
});
