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

  function onPBNDetected(rawPBN) {
    const pbn = rawPBN.trim();
    if (!pbn || pbn === lastPBN) return;
    lastPBN = pbn;

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
      console.log('[BA] Received PBN from main world via postMessage');
      onPBNDetected(e.data.pbn);
    }
  });

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
          if (isPBN(raw)) { onPBNDetected(raw); return; }

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

    // ── (2) Hand-end detection — using Trickster's actual DOM IDs ────────────
    // Confirmed from Trickster's console output:
    //   #scorecard         → shown immediately when a hand ends
    //   #review-deal-message → shown during the review/export phase
    if (handEndPromptShown) return;
    if (Date.now() - lastHandEndAt < 3000) return;

    function isVisible(el) {
      if (!el) return false;
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden';
    }

    const hasScorecard  = isVisible(document.getElementById('scorecard'));
    const hasReviewMsg  = isVisible(document.getElementById('review-deal-message'));

    if (hasScorecard || hasReviewMsg) {
      lastHandEndAt      = Date.now();
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
  function tryAutoExport(onFail) {
    const pbnBefore = lastPBN;

    // ── Tier 1: ask main-world.js to call ExportHandToPTN() ──────────────────
    // main-world.js (injected at page start by the background service worker)
    // runs in the page's JS context and has access to ExportHandToPTN.
    // postMessage bridges isolated world ↔ main world safely.
    console.log('[BA] Tier 1: postMessage __BA_EXPORT__ → main world');
    window.postMessage({ type: '__BA_EXPORT__' }, '*');

    // Wait 800 ms — if a new PBN was captured by any strategy, we're done.
    setTimeout(() => {
      if (lastPBN !== pbnBefore) { console.log('[BA] Tier 1 succeeded'); return; }
      console.log('[BA] Tier 1 no result, trying Tier 2...');

      // ── Tier 2: force-show menu hierarchy then click export TRIGGER ────────
      // #export-hand has TWO children:
      //   1. <a> WITHOUT download attr  →  the export trigger; its click
      //      listener calls ExportHandToPTN() (Trickster's closure function)
      //   2. <a download>               →  the download link; initially empty
      //                                    data:text/plain;charset=utf-8,
      //                                    ExportHandToPTN populates it and
      //                                    then calls .click() on it to download
      //
      // We MUST click #1 (the trigger), NOT #2 or the "Download" button.
      // The old `querySelector('a, button, [onclick]')` was finding the
      // "Download" BUTTON which called .click() on the still-empty download link.
      const exportById = document.getElementById('export-hand');
      if (exportById) {
        console.log('[BA] Tier 2: force-showing #menu → #current-game → #export-hand');
        ['menu', 'current-game', 'export-hand'].forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            el.style.setProperty('display', 'block', 'important');
            el.style.setProperty('visibility', 'visible', 'important');
            el.style.setProperty('opacity', '1', 'important');
            el.style.setProperty('pointer-events', 'auto', 'important');
          }
        });

        // Target the export trigger <a> (no download attr) — NOT the download button
        const triggerLink = exportById.querySelector('a:not([download])');
        const clickTarget  = triggerLink || exportById;
        console.log('[BA] Tier 2 click target:', clickTarget.tagName,
                    '| download=', clickTarget.getAttribute('download'),
                    '|', clickTarget.textContent?.trim().substring(0, 40));
        dispatchHover(clickTarget);

        // Poll up to 1.5 s for a result.
        // Happy path: ExportHandToPTN auto-calls downloadLink.click() in the
        //   main world → main-world.js interceptor fires → lastPBN changes.
        // Fallback: ExportHandToPTN only sets the href without auto-clicking →
        //   we read the populated href directly from the DOM.
        let tier2Poll = 0;
        const tier2Timer = setInterval(() => {
          tier2Poll++;

          if (lastPBN !== pbnBefore) {
            clearInterval(tier2Timer);
            console.log('[BA] Tier 2 succeeded (interceptor caught it)');
            return;
          }

          // Fallback: check if download link href was populated
          const dlLink = exportById.querySelector('a[download]');
          if (dlLink) {
            const href  = dlLink.getAttribute('href') || '';
            const comma = href.indexOf(',');
            if (comma >= 0) {
              const raw     = href.substring(comma + 1);
              const decoded = (raw.includes('%5B') || raw.includes('%5b') || raw.includes('%5D'))
                ? decodeURIComponent(raw) : raw;
              if (decoded.length > 30 && decoded.includes('[Deal ')) {
                clearInterval(tier2Timer);
                console.log('[BA] Tier 2 succeeded (href fallback, len=' + decoded.length + ')');
                onPBNDetected(decoded);
                return;
              }
            }
          }

          if (tier2Poll >= 15) {
            clearInterval(tier2Timer);
            console.log('[BA] Tier 2 no result after 1.5 s, trying Tier 3...');
            runTier3();
          }
        }, 100);
        return;
      }

      console.log('[BA] #export-hand not found in DOM, trying Tier 3...');
      runTier3();
    }, 800);

    // ── Tier 3: text-search + hover fallback ──────────────────────────────────
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
          dispatchHover(exportEl);
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
