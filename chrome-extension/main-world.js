/**
 * Bridge Advisor Connector — Main-World Script
 *
 * Injected into the PAGE'S JavaScript context (world: 'MAIN') by the background
 * service worker via chrome.scripting.executeScript.  Running here means we can:
 *   1. Access Trickster's own globals (ExportHandToPTN, etc.)
 *   2. Intercept URL.createObjectURL to sniff the PBN blob before it's downloaded
 *   3. Intercept HTMLAnchorElement.prototype.click to catch off-DOM download links
 *      (Trickster may use data: URIs and never append the <a> to the document)
 *
 * Communication with the content script (which lives in the isolated world) is
 * done via window.postMessage — both worlds share the same window object.
 */
(function () {
  'use strict';

  // Guard: don't set up twice if the script is somehow injected more than once
  if (window.__BA_MAIN_WORLD_READY__) return;
  window.__BA_MAIN_WORLD_READY__ = true;

  // ── Helper: test whether text looks like PBN ──────────────────────────────
  function isPBN(text) {
    return typeof text === 'string' && text.length > 30 &&
           text.includes('[Deal ') && text.includes('[Contract ');
  }

  // ── Helper: send PBN to isolated-world content script ────────────────────
  function sendPBN(pbn, source) {
    console.log('[BA main] PBN captured via', source, '— length', pbn.length);
    window.postMessage({ type: '__BA_PBN__', pbn }, '*');
  }

  // ── Interceptor 1: URL.createObjectURL ───────────────────────────────────
  // Catches blob-based downloads.  Also logs ALL blobs so we can debug.
  const _createObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (obj) {
    const url = _createObjectURL(obj);
    if (obj instanceof Blob) {
      console.log('[BA main] URL.createObjectURL — size:', obj.size, 'type:', obj.type || '(none)');
      obj.text().then(text => {
        console.log('[BA main] blob preview:', JSON.stringify(text.substring(0, 80)));
        if (isPBN(text)) sendPBN(text, 'URL.createObjectURL');
      }).catch(e => console.warn('[BA main] blob.text() error:', e));
    }
    return url;
  };

  // ── Interceptor 2: HTMLAnchorElement.prototype.click ─────────────────────
  // Catches downloads triggered by calling .click() on an <a> that was never
  // appended to the document (common pattern for data: URI downloads).
  const _anchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    const dl   = this.hasAttribute('download');
    const href = this.href || this.getAttribute('href') || '';
    if (dl || href.startsWith('blob:') || href.startsWith('data:')) {
      console.log('[BA main] a.click() — download:', dl,
                  'href prefix:', href.substring(0, 50));
      if (href.startsWith('blob:')) {
        fetch(href).then(r => r.text()).then(text => {
          console.log('[BA main] blob-href preview:', JSON.stringify(text.substring(0, 80)));
          if (isPBN(text)) sendPBN(text, 'a.click blob');
        }).catch(e => console.warn('[BA main] blob a.click fetch error:', e));
      } else if (href.startsWith('data:')) {
        try {
          const comma  = href.indexOf(',');
          const meta   = href.substring(0, comma);
          const isB64  = meta.includes('base64');
          const raw    = href.substring(comma + 1);
          const text   = isB64 ? atob(raw) : decodeURIComponent(raw);
          console.log('[BA main] data-href preview:', JSON.stringify(text.substring(0, 80)));
          if (isPBN(text)) sendPBN(text, 'a.click data-uri');
        } catch (e) { console.warn('[BA main] data URI parse error:', e); }
      }
    }
    return _anchorClick.call(this);
  };

  // ── Listen for export trigger from content script ─────────────────────────
  // Content script sends { type: '__BA_EXPORT__' } via postMessage.
  // We try every known way to call Trickster's export function.
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (e.data?.type !== '__BA_EXPORT__') return;

    // Try direct window.ExportHandToPTN first
    if (typeof ExportHandToPTN === 'function') {
      console.log('[BA main] Calling window.ExportHandToPTN()');
      try { ExportHandToPTN(); return; }
      catch (err) { console.warn('[BA main] ExportHandToPTN() threw:', err); }
    }

    // Search common namespaces that Trickster might use
    const namespaces = ['App', 'Bridge', 'Game', 'Trickster', 'TricksterBridge'];
    for (const ns of namespaces) {
      if (typeof window[ns]?.ExportHandToPTN === 'function') {
        console.log('[BA main] Calling', ns + '.ExportHandToPTN()');
        try { window[ns].ExportHandToPTN(); return; }
        catch (err) { console.warn('[BA main]', ns + '.ExportHandToPTN() threw:', err); }
      }
    }

    // Last resort: scan all window properties for a matching function name
    try {
      const key = Object.keys(window).find(
        k => k.toLowerCase() === 'exporthandtoptn' && typeof window[k] === 'function'
      );
      if (key) {
        console.log('[BA main] Found export fn via scan:', key);
        window[key]();
        return;
      }
    } catch (_) {}

    console.warn('[BA main] ExportHandToPTN not found in page context');
    window.postMessage({ type: '__BA_EXPORT_FAIL__' }, '*');
  });

  console.log('[BA main] main-world.js ready — interceptors active');
})();
