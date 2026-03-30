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

  // ── Inject main-world.js into the page's JS context ──────────────────────
  // Content scripts run in an isolated world; Trickster's globals (like
  // ExportHandToPTN) live in the main world.  We ask the background service
  // worker to inject main-world.js via chrome.scripting (which bypasses CSP).
  // .catch() suppresses "no listener" rejections when the service worker is idle.
  chrome.runtime.sendMessage({ type: 'INJECT_MAIN_WORLD' }).catch(() => {});

  // ── State ─────────────────────────────────────────────────────────────────

  let lastPBN          = null;
  let handEndPromptShown = false;  // prevents double-prompt per hand
  let lastHandEndAt    = 0;        // debounce: ignore signals fired < 3 s apart
  let debugLogging     = false;

  // Load debug preference
  try { chrome.storage?.local?.get(['debugLogging'], (d) => { debugLogging = !!d?.debugLogging; }); } catch (_) {}

  function debugLog(...args) {
    if (debugLogging) console.log('[BA]', ...args);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Returns true if a string looks like a PBN hand */
  function isPBN(text) {
    if (!text || typeof text !== 'string' || text.length < 30) return false;
    return text.includes('[Deal ') && text.includes('[Contract ');
  }

  /**
   * Finds the *deepest* visible element whose textContent contains `text`.
   * Iterates in reverse DOM order so the most-specific child is returned
   * rather than broad containers like <html> or <body>.
   * Uses getComputedStyle so position:fixed elements (e.g. Trickster menus)
   * are not wrongly excluded (offsetParent is null for fixed elements).
   */
  function findByText(text) {
    const lc = text.toLowerCase();
    const matches = [...document.querySelectorAll('*')].filter(el => {
      if (!el.textContent.toLowerCase().includes(lc)) return false;
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden';
    });
    // Return deepest match whose own text is short (avoids <html>/<body>)
    for (let i = matches.length - 1; i >= 0; i--) {
      if (matches[i].textContent.trim().length < 200) return matches[i];
    }
    return matches[matches.length - 1] || null;
  }

  /**
   * Like findByText but ignores CSS visibility — finds elements even when
   * hidden (e.g. a submenu that is in the DOM but not yet shown).
   * Returns the deepest (most-specific) match.
   */
  function findByTextHidden(text) {
    const lc = text.toLowerCase();
    const matches = [...document.querySelectorAll('*')].filter(el =>
      el.textContent.toLowerCase().includes(lc)
    );
    for (let i = matches.length - 1; i >= 0; i--) {
      if (matches[i].textContent.trim().length < 200) return matches[i];
    }
    return matches[matches.length - 1] || null;
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

  function onPBNDetected(rawPBN, source = 'unknown') {
    const pbn = rawPBN.trim();
    if (!pbn || pbn === lastPBN) return;
    lastPBN = pbn;
    debugLog(`PBN captured via ${source} (${pbn.length} chars)`);

    // Guard: chrome.storage can be undefined if the extension was reloaded
    // while this content script was still running (context invalidated).
    try { chrome.storage?.local?.set({ lastPBN: pbn, capturedAt: Date.now() }); } catch (_) {}
    try { chrome.runtime.sendMessage({ type: 'PBN_CAPTURED' }).catch(() => {}); } catch (_) {}
    showFloatingButton(pbn);

    // Allow hand-end prompt to fire again for the next hand
    setTimeout(() => { handEndPromptShown = false; }, 10_000);
  }

  // ── Strategy F: Listen for PBN from main-world.js via postMessage ────────
  // main-world.js intercepts URL.createObjectURL in the page's JS context and
  // posts the blob text back here.  This catches downloads that never touch the
  // DOM (Trickster creates the <a> link, calls .click() without appending it).
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (e.data?.type === '__BA_PBN__' && e.data.pbn) {
      onPBNDetected(e.data.pbn, 'main-world postMessage');
    }
  });

  // ── Strategy A: Intercept fetch() ────────────────────────────────────────

  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await _fetch.apply(this, args);
    try {
      const ct = response.headers.get('content-type') || '';
      if (ct.match(/text|octet-stream|pbn|plain|json/i)) {
        response.clone().text().then(text => {
          if (isPBN(text)) { onPBNDetected(text, 'fetch interceptor'); return; }
          // Check JSON responses for nested PBN strings
          if (ct.includes('json')) {
            try {
              const obj = JSON.parse(text);
              const pbn = findPBNInObject(obj);
              if (pbn) onPBNDetected(pbn, 'fetch JSON payload');
            } catch (_) {}
          }
        }).catch(() => {});
      }
    } catch (_) {}
    return response;
  };

  /** Recursively search an object for a string value that looks like PBN */
  function findPBNInObject(obj, depth = 0) {
    if (depth > 5) return null;
    if (typeof obj === 'string') return isPBN(obj) ? obj : null;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = findPBNInObject(item, depth + 1);
        if (found) return found;
      }
    } else if (obj && typeof obj === 'object') {
      for (const val of Object.values(obj)) {
        const found = findPBNInObject(val, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

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
        if (isPBN(this.responseText)) onPBNDetected(this.responseText, 'XHR interceptor');
      } catch (_) {}
    });
    return _xhrSend.apply(this, args);
  };

  // ── Strategy C: Intercept WebSocket / SignalR messages ───────────────────
  // Trickster uses SignalR (which wraps WebSocket). We intercept two things:
  //   1. The SignalR "handEnded" hub method → trigger hand-end prompt early
  //   2. Any message containing raw PBN text → onPBNDetected (belt-and-suspenders)

  const _WS = window.WebSocket;
  window.WebSocket = class extends _WS {
    constructor(url, protocols) {
      super(...arguments);
      this.addEventListener('message', (evt) => {
        try {
          const raw = typeof evt.data === 'string' ? evt.data : null;
          if (!raw) return;

          // Direct PBN string (e.g. blob text)
          if (isPBN(raw)) { onPBNDetected(raw, 'WebSocket raw'); return; }

          // JSON payload — parse once and check multiple things
          const obj = JSON.parse(raw);

          // ── SignalR "handEnded" hub method (modern SignalR JSON protocol) ──
          // Format: { "type": 1, "target": "handEnded", "arguments": [tricks, score] }
          // Older SignalR format: { "M": [{ "M": "handEnded", ... }] }
          const isHandEnded = obj?.target === 'handEnded' ||
                              (Array.isArray(obj?.M) && obj.M.some(m => m?.M === 'handEnded'));
          if (isHandEnded) {
            console.log('[BA] SignalR handEnded detected');
            if (!handEndPromptShown && Date.now() - lastHandEndAt >= 3000) {
              lastHandEndAt      = Date.now();
              handEndPromptShown = true;
              // Wait ~7 s for Trickster's scorecard/reconnect sequence to finish,
              // then show our prompt in the review-deal phase when export is available.
              setTimeout(showHandEndPrompt, 7000);
            }
            return;
          }

          // ── PBN in JSON fields (unlikely but kept as extra coverage) ──
          const candidates = [
            obj?.pbn, obj?.hand?.pbn, obj?.data?.pbn,
            obj?.result?.pbn, obj?.game?.pbn,
            typeof obj?.data === 'string' ? obj.data : null,
          ];
          for (const c of candidates) {
            if (c && isPBN(c)) { onPBNDetected(c, 'WebSocket JSON field'); return; }
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
        if (isPBN(text)) onPBNDetected(text, 'blob click interceptor');
      } catch (_) {}
    }
  }, true /* capture phase — runs before Trickster's handler */);

  // ── Strategy E: DOM MutationObserver ─────────────────────────────────────
  // Scans for:
  //   (1) PBN text in textarea/pre/code elements  →  triggers onPBNDetected
  //   (2) Hand-end signals in the DOM             →  triggers showHandEndPrompt

  function isVisible(el) {
    if (!el) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  }

  // Debounced dismiss: when hand-end indicators vanish for 5+ continuous
  // seconds, remove any lingering floating buttons (next hand has started).
  let dismissTimer = null;

  function scheduleDismissIfNeeded(handEndNow) {
    const root = document.getElementById('ba-connector-root');
    if (!root) { clearTimeout(dismissTimer); dismissTimer = null; return; }

    if (handEndNow) {
      // Hand-end UI is still showing — cancel any pending dismiss
      clearTimeout(dismissTimer);
      dismissTimer = null;
    } else if (!dismissTimer && lastHandEndAt > 0) {
      // Hand-end UI just disappeared — start a 5 s countdown
      dismissTimer = setTimeout(() => {
        dismissTimer = null;
        const r = document.getElementById('ba-connector-root');
        if (r) {
          console.log('[BA] New hand started — dismissing buttons');
          r.remove();
        }
      }, 5000);
    }
  }

  function scanDOM(mutations) {
    // ── (1) PBN text scan ──────────────────────────────────────────────────
    const candidates = document.querySelectorAll(
      'textarea, pre, code, [class*="pbn"], [class*="export"], [class*="clipboard"]'
    );
    for (const el of candidates) {
      const text = el.value ?? el.textContent ?? '';
      if (isPBN(text)) { onPBNDetected(text, 'DOM MutationObserver'); return; }
    }

    // ── (2) Hand-end detection — using Trickster's actual DOM IDs ────────────
    const hasScorecard  = isVisible(document.getElementById('scorecard'));
    const hasReviewMsg  = isVisible(document.getElementById('review-deal-message'));
    const handEndNow    = hasScorecard || hasReviewMsg;

    // ── (2a) Auto-dismiss buttons after hand-end UI disappears ──────────────
    scheduleDismissIfNeeded(handEndNow);

    // ── (2b) Show hand-end prompt if not already shown ──────────────────────
    if (handEndPromptShown) return;
    if (Date.now() - lastHandEndAt < 3000) return;

    // Fallback: check for text patterns that indicate hand completion
    let hasTextSignal = false;
    if (!handEndNow) {
      const body = document.body.textContent || '';
      hasTextSignal = /\b(hand complete|final score|review deal|export hand to pbn)\b/i.test(body);
    }

    if (handEndNow || hasTextSignal) {
      lastHandEndAt      = Date.now();
      handEndPromptShown = true;
      showHandEndPrompt();
    }
  }

  // Throttle MutationObserver to at most once per animation frame
  let scanScheduled = false;
  function throttledScanDOM(mutations) {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      scanDOM(mutations);
    });
  }

  const domObserver = new MutationObserver(throttledScanDOM);
  if (document.body) {
    domObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      domObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
  }

  // ── Auto-export: trigger Trickster's PBN export ──────────────────────────

  /**
   * Three-tier approach, most reliable first:
   *
   *   Tier 1 — Call window.ExportHandToPTN() directly.
   *            Confirmed from Trickster's own console: this is the function
   *            that runs when the user clicks "Export Hand to PBN".
   *
   *   Tier 2 — Click document.getElementById('export-hand').
   *            Trickster's export button has id="export-hand".
   *
   *   Tier 3 — Fallback text-search + hover (kept as last resort).
   *
   * @param {Function} onFail  Called only if all three tiers fail.
   */
  /**
   * Helper: check #export-hand for PBN content in DOM.
   * Looks in <pre class="pbn-text">, .content text, and <a download> href.
   * Returns the PBN string or null.
   */
  function readPBNFromExportPanel() {
    const panel = document.getElementById('export-hand');
    if (!panel) return null;

    // Check <pre class="pbn-text"> (current Trickster DOM)
    const pre = panel.querySelector('.pbn-text, pre');
    if (pre) {
      const text = pre.textContent?.trim();
      if (text && text.length > 30 && text.includes('[Deal ')) return text;
    }

    // Check .content div for any PBN text
    const contentDiv = panel.querySelector('.content');
    if (contentDiv && !contentDiv.hidden) {
      const text = contentDiv.textContent?.trim();
      if (text && text.length > 30 && text.includes('[Deal ')) return text;
    }

    // Legacy fallback: <a download> href populated with data URI
    const dlLink = panel.querySelector('a[download]');
    if (dlLink) {
      const href  = dlLink.getAttribute('href') || '';
      const comma = href.indexOf(',');
      if (comma >= 0) {
        const raw     = href.substring(comma + 1);
        const decoded = (raw.includes('%5B') || raw.includes('%5b') || raw.includes('%5D'))
          ? decodeURIComponent(raw) : raw;
        if (decoded.length > 30 && decoded.includes('[Deal ')) return decoded;
      }
    }

    return null;
  }

  function tryAutoExport(onFail) {
    const pbnBefore = lastPBN;

    // ── Tier 1: ask main-world.js to call ExportHandToPTN() ──────────────────
    console.log('[BA] Tier 1: postMessage __BA_EXPORT__ → main world');
    window.postMessage({ type: '__BA_EXPORT__' }, '*');

    // Wait 800 ms — if a new PBN was captured by any strategy, we're done.
    setTimeout(() => {
      if (lastPBN !== pbnBefore) { console.log('[BA] Tier 1 succeeded'); return; }
      console.log('[BA] Tier 1 no result, trying Tier 2...');
      runTier2();
    }, 800);

    // ── Tier 2: navigate Trickster's menu to open #export-hand ──────────────
    // Trickster's current DOM uses:
    //   <button data-href="#export-hand" data-target="menu"> in #current-game
    // to navigate to the export panel, which contains:
    //   <button class="download-button"> and <pre class="pbn-text">
    function runTier2() {
      console.log('[BA] Tier 2: force-showing menu hierarchy + clicking export nav');

      // Force-show the menu panels so clicks register
      ['menu', 'current-game', 'export-hand'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.style.setProperty('display', 'block', 'important');
          el.style.setProperty('visibility', 'visible', 'important');
          el.style.setProperty('opacity', '1', 'important');
          el.style.setProperty('pointer-events', 'auto', 'important');
        }
      });

      // Click the navigation button that opens the export-hand panel
      const navBtn = document.querySelector('button[data-href="#export-hand"]') ||
                     document.querySelector('[data-href="#export-hand"]');
      if (navBtn) {
        console.log('[BA] Tier 2: clicking nav button:', navBtn.tagName, navBtn.textContent?.trim().substring(0, 40));
        dispatchHover(navBtn);
      }

      // Also try clicking the download button inside #export-hand after a short delay
      // to trigger the export generation
      const exportPanel = document.getElementById('export-hand');
      setTimeout(() => {
        if (lastPBN !== pbnBefore) return; // already captured
        const dlBtn = exportPanel?.querySelector('.download-button, button.download-button');
        if (dlBtn) {
          console.log('[BA] Tier 2: clicking download button');
          dispatchHover(dlBtn);
        }
        // Also try any <a> trigger (legacy DOM structure)
        const triggerLink = exportPanel?.querySelector('a:not([download])');
        if (triggerLink) {
          console.log('[BA] Tier 2: clicking legacy trigger link');
          dispatchHover(triggerLink);
        }
      }, 300);

      // Poll for PBN to appear (via interceptors or DOM content)
      let tier2Poll = 0;
      const tier2Timer = setInterval(() => {
        tier2Poll++;

        // Check if interceptors caught it
        if (lastPBN !== pbnBefore) {
          clearInterval(tier2Timer);
          console.log('[BA] Tier 2 succeeded (interceptor caught it)');
          return;
        }

        // Check DOM directly for PBN content
        const pbn = readPBNFromExportPanel();
        if (pbn) {
          clearInterval(tier2Timer);
          console.log('[BA] Tier 2 succeeded (DOM content, len=' + pbn.length + ')');
          onPBNDetected(pbn, 'tier2-dom');
          return;
        }

        if (tier2Poll >= 20) {
          clearInterval(tier2Timer);
          console.log('[BA] Tier 2 no result after 2 s, trying Tier 3...');
          runTier3();
        }
      }, 100);
    }

    // ── Tier 3: text-search + click fallback ────────────────────────────────
    function runTier3() {
      const menuEl = findByText('current game') || findByTextHidden('current game');
      console.log('[BA] Tier 3 text-search "current game":', menuEl?.tagName, menuEl?.textContent?.trim());
      if (!menuEl) { console.log('[BA] FAIL: nothing found'); onFail(); return; }

      dispatchHover(menuEl);
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        const exportEl =
          findByText('export hand to pbn') || findByText('export hand') ||
          findByTextHidden('export hand to pbn') || findByTextHidden('export hand');
        if (exportEl) {
          clearInterval(poll);
          console.log('[BA] Tier 3 found export element:', exportEl.tagName, exportEl.textContent?.trim());
          dispatchHover(exportEl); // click it, not just hover

          // Now poll for PBN content in the export panel
          let t3Poll = 0;
          const t3Timer = setInterval(() => {
            t3Poll++;
            if (lastPBN !== pbnBefore) {
              clearInterval(t3Timer);
              console.log('[BA] Tier 3 succeeded (interceptor)');
              return;
            }
            const pbn = readPBNFromExportPanel();
            if (pbn) {
              clearInterval(t3Timer);
              console.log('[BA] Tier 3 succeeded (DOM content, len=' + pbn.length + ')');
              onPBNDetected(pbn, 'tier3-dom');
              return;
            }
            if (t3Poll >= 20) {
              clearInterval(t3Timer);
              console.log('[BA] FAIL: no PBN after Tier 3 click');
              onFail();
            }
          }, 100);
        } else if (attempts >= 20) {
          clearInterval(poll);
          console.log('[BA] FAIL: export item not found after 2 s');
          onFail();
        }
      }, 100);
    }
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
