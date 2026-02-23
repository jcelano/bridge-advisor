/**
 * Bridge Advisor Connector — Content Script
 *
 * Runs on trickstercards.com and:
 *   1. Detects when a bridge hand ends → shows "Analyze this hand?" prompt
 *   2. When confirmed, auto-clicks Trickster's export menu to trigger PBN capture
 *   3. Once PBN is captured, shows "Open in Bridge Advisor →" button
 *
 * PBN capture strategies:
 *   A. Intercept window.fetch() responses
 *   B. Intercept XMLHttpRequest
 *   C. Intercept WebSocket messages  ← new
 *   D. Intercept <a download> blob clicks
 *   E. MutationObserver on the DOM
 *
 * Hand-end detection strategies (new):
 *   A. Export menu item becomes visible (contains "Export" + "PBN")
 *   B. Score/result element appears (matches made/down/±N patterns)
 */
(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────

  let lastPBN          = null;
  let handEndPromptShown = false;  // prevents double-prompt per hand
  let lastHandEndAt    = 0;        // debounce: ignore signals fired < 3 s apart

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Returns true if a string looks like a PBN hand */
  function isPBN(text) {
    if (!text || typeof text !== 'string' || text.length < 30) return false;
    return text.includes('[Deal ') && text.includes('[Contract ');
  }

  /**
   * Finds the first *visible* element whose textContent contains `text`.
   * Uses getComputedStyle so position:fixed elements (e.g. Trickster menus)
   * are not wrongly excluded (offsetParent is null for fixed elements).
   */
  function findByText(text) {
    const lc = text.toLowerCase();
    return [...document.querySelectorAll('*')].find(el => {
      if (!el.textContent.toLowerCase().includes(lc)) return false;
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden';
    }) || null;
  }

  /**
   * Like findByText but ignores CSS visibility — finds elements even when
   * hidden (e.g. a submenu that is in the DOM but not yet shown).
   */
  function findByTextHidden(text) {
    const lc = text.toLowerCase();
    return [...document.querySelectorAll('*')].find(el =>
      el.textContent.toLowerCase().includes(lc)
    ) || null;
  }

  /**
   * Dispatches a full mouse-event sequence on an element so that both
   * JS-listener menus AND CSS :hover dropdowns are triggered.
   */
  function dispatchHover(el) {
    for (const type of ['mouseenter', 'mouseover', 'mousemove', 'mousedown', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
  }

  // ── PBN capture ──────────────────────────────────────────────────────────

  function onPBNDetected(rawPBN) {
    const pbn = rawPBN.trim();
    if (!pbn || pbn === lastPBN) return;
    lastPBN = pbn;

    chrome.storage.local.set({ lastPBN: pbn, capturedAt: Date.now() });
    chrome.runtime.sendMessage({ type: 'PBN_CAPTURED' });
    showFloatingButton(pbn);

    // Allow hand-end prompt to fire again for the next hand
    setTimeout(() => { handEndPromptShown = false; }, 10_000);
  }

  // ── Strategy A: Intercept fetch() ────────────────────────────────────────

  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await _fetch.apply(this, args);
    try {
      const ct = response.headers.get('content-type') || '';
      if (ct.match(/text|octet-stream|pbn|plain/i)) {
        response.clone().text().then(text => {
          if (isPBN(text)) onPBNDetected(text);
        }).catch(() => {});
      }
    } catch (_) {}
    return response;
  };

  // ── Strategy B: Intercept XMLHttpRequest ─────────────────────────────────

  const _xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._baUrl = url;
    return _xhrOpen.apply(this, [method, url, ...rest]);
  };

  const _xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      try {
        if (isPBN(this.responseText)) onPBNDetected(this.responseText);
      } catch (_) {}
    });
    return _xhrSend.apply(this, args);
  };

  // ── Strategy C: Intercept WebSocket messages ─────────────────────────────
  // Many real-time card games send PBN (or JSON containing PBN) over a
  // WebSocket. This intercepts all messages so we can capture PBN without
  // the user having to navigate any export menu.

  const _WS = window.WebSocket;
  window.WebSocket = class extends _WS {
    constructor(url, protocols) {
      super(...arguments);
      this.addEventListener('message', (evt) => {
        try {
          const raw = typeof evt.data === 'string' ? evt.data : null;
          if (!raw) return;
          // Direct PBN string
          if (isPBN(raw)) { onPBNDetected(raw); return; }
          // JSON payload — check common field paths
          const obj = JSON.parse(raw);
          const candidates = [
            obj?.pbn,
            obj?.hand?.pbn,
            obj?.data?.pbn,
            obj?.result?.pbn,
            obj?.game?.pbn,
            typeof obj?.data === 'string' ? obj.data : null,
          ];
          for (const c of candidates) {
            if (c && isPBN(c)) { onPBNDetected(c); return; }
          }
        } catch (_) {}
      });
    }
  };

  // ── Strategy D: Intercept <a download> blob clicks ───────────────────────

  document.addEventListener('click', async (e) => {
    const link = e.target.closest('a[download], a[href*=".pbn"]');
    if (!link) return;

    const href = link.getAttribute('href') || '';
    const dl   = link.getAttribute('download') || '';

    if (dl.endsWith('.pbn') || href.endsWith('.pbn') || href.startsWith('blob:')) {
      try {
        const resp = await fetch(href);
        const text = await resp.text();
        if (isPBN(text)) onPBNDetected(text);
      } catch (_) {}
    }
  }, true /* capture phase — runs before Trickster's handler */);

  // ── Strategy E: DOM MutationObserver ─────────────────────────────────────
  // Scans for:
  //   (1) PBN text in textarea/pre/code elements  →  triggers onPBNDetected
  //   (2) Hand-end signals in the DOM             →  triggers showHandEndPrompt

  function scanDOM(mutations) {
    // ── (1) PBN text scan ──────────────────────────────────────────────────
    const candidates = document.querySelectorAll(
      'textarea, pre, code, [class*="pbn"], [class*="export"], [class*="clipboard"]'
    );
    for (const el of candidates) {
      const text = el.value ?? el.textContent ?? '';
      if (isPBN(text)) { onPBNDetected(text); return; }
    }

    // ── (2) Hand-end detection ─────────────────────────────────────────────
    if (handEndPromptShown) return;
    if (Date.now() - lastHandEndAt < 3000) return;

    // Signal A: Trickster's export menu item is now visible
    const hasExportText = findByText('export hand to pbn') ||
                          (findByText('export') && findByText('pbn'));

    // Signal B: A short element containing a bridge score result appeared
    // Only check in newly added nodes to avoid false positives from existing text
    let hasResultText = false;
    if (mutations) {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const walk = [node, ...node.querySelectorAll('*')];
          for (const el of walk) {
            if (el.childElementCount === 0 &&
                el.offsetParent !== null &&
                el.textContent.length < 80 &&
                /(made|down|\+\d|-\d)/i.test(el.textContent)) {
              hasResultText = true;
              break;
            }
          }
          if (hasResultText) break;
        }
        if (hasResultText) break;
      }
    }

    if (hasExportText || hasResultText) {
      lastHandEndAt    = Date.now();
      handEndPromptShown = true;
      showHandEndPrompt();
    }
  }

  const domObserver = new MutationObserver(scanDOM);
  if (document.body) {
    domObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      domObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
  }

  // ── Auto-export: programmatically trigger Trickster's export menu ────────

  /**
   * Tries to auto-navigate Trickster's "Current Game → Export Hand to PBN"
   * menu programmatically.
   *
   * Improvements over the naive .click() approach:
   *   • dispatchHover() fires mouseenter/mouseover/click so CSS :hover
   *     dropdowns open correctly (plain .click() won't reveal them)
   *   • Polls every 100 ms for up to 2 s instead of a single 350 ms guess
   *   • Falls back to searching hidden elements in case the item is in the
   *     DOM but not yet CSS-visible
   *
   * @param {Function} onFail  Called if the menu items can't be located.
   */
  function tryAutoExport(onFail) {
    const menuEl = findByText('current game') || findByTextHidden('current game');
    console.log('[BA] tryAutoExport — "current game" element:',
      menuEl ? `${menuEl.tagName} "${menuEl.textContent.trim()}"` : 'NOT FOUND');

    if (!menuEl) {
      console.log('[BA] FAIL: "current game" menu item not found in DOM');
      onFail();
      return;
    }

    // Open the submenu with a full hover sequence (handles CSS :hover dropdowns)
    dispatchHover(menuEl);

    // Poll for the export item to appear (up to 2 000 ms)
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;

      const exportEl =
        findByText('export hand to pbn') ||
        findByText('export hand')        ||
        findByText('export to pbn')      ||
        findByTextHidden('export hand to pbn') ||   // try even if CSS-hidden
        findByTextHidden('export hand');

      if (exportEl) {
        clearInterval(poll);
        console.log('[BA] Found export element:', `${exportEl.tagName} "${exportEl.textContent.trim()}"`);
        dispatchHover(exportEl);
      } else if (attempts >= 20) {   // 20 × 100 ms = 2 s
        clearInterval(poll);
        // Log all short visible text so the user can identify the real menu label
        const visibleText = [...document.querySelectorAll('*')]
          .filter(e => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden'; })
          .map(e => e.textContent.trim())
          .filter(t => t.length > 1 && t.length < 60);
        console.log('[BA] FAIL: export item not found after 2 s. Visible text on page:', visibleText);
        onFail();
      }
    }, 100);
  }

  // ── Hand-end prompt ───────────────────────────────────────────────────────
  // Shown when we detect the hand has just finished. The user clicks
  // "Analyze this hand →" to trigger the export flow; or "not now" to dismiss.

  function showHandEndPrompt() {
    document.getElementById('ba-connector-root')?.remove();

    const root = document.createElement('div');
    root.id = 'ba-connector-root';
    root.style.cssText = [
      'position: fixed',
      'bottom: 24px',
      'right: 24px',
      'z-index: 2147483647',
      'display: flex',
      'flex-direction: column',
      'align-items: flex-end',
      'gap: 8px',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    ].join(';');

    root.innerHTML = `
      <div style="
        background: #1a2e1a;
        border: 1px solid #3a6a3a;
        border-radius: 10px;
        padding: 7px 13px;
        color: #90c090;
        font-size: 12px;
        font-weight: 500;
        box-shadow: 0 4px 18px rgba(0,0,0,0.45);
        letter-spacing: 0.2px;
      ">♠ Hand ended</div>

      <button id="ba-analyze-btn" style="
        background: linear-gradient(135deg, #2d5a2d, #1a3a1a);
        border: 1.5px solid #4a8a4a;
        border-radius: 10px;
        padding: 11px 18px;
        color: #c0e8c0;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 18px rgba(0,0,0,0.5);
        white-space: nowrap;
        transition: background 0.15s, transform 0.1s;
        outline: none;
      ">Analyze this hand →</button>

      <div id="ba-analyze-hint" style="
        font-size: 11px;
        color: #6a9a6a;
        text-align: right;
        display: none;
        max-width: 220px;
        line-height: 1.4;
      "></div>

      <button id="ba-dismiss-btn" style="
        background: transparent;
        border: none;
        color: #567856;
        font-size: 11px;
        cursor: pointer;
        padding: 2px 4px;
      ">not now</button>
    `;

    document.body.appendChild(root);

    const analyzeBtn = document.getElementById('ba-analyze-btn');
    const hint       = document.getElementById('ba-analyze-hint');

    analyzeBtn.addEventListener('mouseenter', () => {
      analyzeBtn.style.background = 'linear-gradient(135deg, #3a6a3a, #2a4a2a)';
      analyzeBtn.style.transform = 'translateY(-1px)';
    });
    analyzeBtn.addEventListener('mouseleave', () => {
      analyzeBtn.style.background = 'linear-gradient(135deg, #2d5a2d, #1a3a1a)';
      analyzeBtn.style.transform = '';
    });

    analyzeBtn.addEventListener('click', () => {
      analyzeBtn.disabled = true;
      analyzeBtn.textContent = 'Finding export…';
      analyzeBtn.style.opacity = '0.7';

      tryAutoExport(() => {
        // Auto-export failed — prompt user to do it manually
        analyzeBtn.textContent = 'Export not found';
        hint.textContent = 'Please use menu → Current Game → Export Hand to PBN';
        hint.style.display = 'block';
      });
    });

    document.getElementById('ba-dismiss-btn').addEventListener('click', () => root.remove());
  }

  // ── PBN-captured floating button ─────────────────────────────────────────
  // Shown once the PBN has actually been captured (by any strategy above).

  function showFloatingButton(pbn) {
    // Replace whatever is currently showing (hand-end prompt or previous button)
    document.getElementById('ba-connector-root')?.remove();

    const root = document.createElement('div');
    root.id = 'ba-connector-root';
    root.style.cssText = [
      'position: fixed',
      'bottom: 24px',
      'right: 24px',
      'z-index: 2147483647',
      'display: flex',
      'flex-direction: column',
      'align-items: flex-end',
      'gap: 8px',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    ].join(';');

    root.innerHTML = `
      <div style="
        background: #1a2e1a;
        border: 1px solid #3a6a3a;
        border-radius: 10px;
        padding: 7px 13px;
        color: #90c090;
        font-size: 12px;
        font-weight: 500;
        box-shadow: 0 4px 18px rgba(0,0,0,0.45);
        letter-spacing: 0.2px;
      ">♠ Hand ready — open in Bridge Advisor?</div>

      <button id="ba-open-btn" style="
        background: linear-gradient(135deg, #2d5a2d, #1a3a1a);
        border: 1.5px solid #4a8a4a;
        border-radius: 10px;
        padding: 11px 18px;
        color: #c0e8c0;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 18px rgba(0,0,0,0.5);
        white-space: nowrap;
        transition: background 0.15s, transform 0.1s;
        outline: none;
      ">Open in Bridge Advisor →</button>

      <button id="ba-copy-btn" style="
        background: #1a2e1a;
        border: 1px solid #3a5a3a;
        border-radius: 7px;
        padding: 5px 11px;
        color: #7ab07a;
        font-size: 12px;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      ">Copy PBN</button>

      <button id="ba-dismiss-btn" style="
        background: transparent;
        border: none;
        color: #567856;
        font-size: 11px;
        cursor: pointer;
        padding: 2px 4px;
      ">dismiss</button>
    `;

    document.body.appendChild(root);

    const openBtn = document.getElementById('ba-open-btn');
    openBtn.addEventListener('mouseenter', () => {
      openBtn.style.background = 'linear-gradient(135deg, #3a6a3a, #2a4a2a)';
      openBtn.style.transform = 'translateY(-1px)';
    });
    openBtn.addEventListener('mouseleave', () => {
      openBtn.style.background = 'linear-gradient(135deg, #2d5a2d, #1a3a1a)';
      openBtn.style.transform = '';
    });

    openBtn.addEventListener('click', () => {
      chrome.storage.local.get(['bridgeAdvisorUrl'], (data) => {
        const base = (data.bridgeAdvisorUrl || 'http://localhost:5174').replace(/\/$/, '');
        window.open(`${base}?pbn=${encodeURIComponent(pbn)}`, '_blank');
      });
    });

    document.getElementById('ba-copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(pbn).then(() => {
        const copyBtn = document.getElementById('ba-copy-btn');
        if (copyBtn) { copyBtn.textContent = 'Copied!'; setTimeout(() => { copyBtn.textContent = 'Copy PBN'; }, 1500); }
      });
    });

    document.getElementById('ba-dismiss-btn').addEventListener('click', () => root.remove());
  }
})();
