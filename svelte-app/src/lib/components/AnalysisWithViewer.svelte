<script>
  import { renderMarkdown, linkifyTricks } from '$lib/markdown.js';
  import TrickViewer from '$lib/components/TrickViewer.svelte';

  /**
   * AnalysisWithViewer
   *
   * Layout:
   *   1. Full-width TrickViewer at top — navigate the whole hand
   *   2. Full-width analysis text below — "Trick N" chips are clickable
   *   3. Modal overlay — clicking a chip opens a focused TrickViewer on that trick
   *
   * Props:
   *   text      — raw markdown analysis string
   *   deal      — PBN deal object { N, E, S, W }
   *   played    — string[] PBN play lines
   *   playStart — trick-1 leader seat letter
   *   contract  — e.g. '4H'
   *   declarer  — seat letter
   */
  let { text, deal, played, playStart, contract, declarer } = $props();

  const hasPlay = $derived(!!played?.length && !!deal);

  // Rendered HTML with clickable trick chips injected
  const html = $derived(
    hasPlay ? linkifyTricks(renderMarkdown(text)) : renderMarkdown(text)
  );

  // ── Modal state ────────────────────────────────────────────────
  let modalOpen = $state(false);
  let modalTrickN = $state(1);
  let modalViewer = $state(null);

  // After modal opens and TrickViewer mounts, jump to the target trick
  $effect(() => {
    if (modalOpen && modalViewer) {
      modalViewer.jumpTo(modalTrickN);
    }
  });

  function openModal(n) {
    modalTrickN = n;
    modalOpen = true;
  }

  function closeModal() {
    modalOpen = false;
  }

  function handleKeydown(e) {
    if (modalOpen && e.key === 'Escape') closeModal();
  }

  // ── Trick chip click handler ───────────────────────────────────
  function handleAnalysisClick(e) {
    const chip = e.target.closest('.trick-chip');
    if (!chip) return;
    const n = parseInt(chip.dataset.trick, 10);
    if (!isNaN(n)) openModal(n);
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if hasPlay}
  <!-- Full-width viewer: review the whole hand -->
  <div class="top-viewer">
    <TrickViewer {deal} {played} {playStart} {contract} {declarer} />
  </div>

  <!-- Full-width analysis text -->
  <div class="analysis-section">
    <div class="analysis-hint">
      Click <span class="chip-example">Trick N</span> in the analysis to open a focused view
    </div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="md-response" role="region" aria-label="Analysis" onclick={handleAnalysisClick}>
      {@html html}
    </div>
  </div>

  <!-- Modal overlay: focused TrickViewer on the clicked trick -->
  {#if modalOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={closeModal}>
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="modal-card" onclick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <span class="modal-title">Trick {modalTrickN} — focused view</span>
          <button class="modal-close" onclick={closeModal} aria-label="Close">✕</button>
        </div>
        <TrickViewer
          bind:this={modalViewer}
          {deal}
          {played}
          {playStart}
          {contract}
          {declarer}
        />
      </div>
    </div>
  {/if}

{:else}
  <!-- No play data — plain analysis -->
  <div class="md-response">
    {@html renderMarkdown(text)}
  </div>
{/if}

<style>
  /* ── Top viewer ── */
  .top-viewer {
    margin-bottom: 16px;
  }

  /* ── Analysis section ── */
  .analysis-section {
    margin-top: 4px;
  }

  .analysis-hint {
    font-size: 11px;
    color: #4a6a5a;
    margin-bottom: 10px;
    font-style: italic;
    font-family: system-ui, sans-serif;
  }

  /* ── Trick chips ── */
  .md-response :global(.trick-chip) {
    display: inline;
    background: #0d1f14;
    border: 1px solid #2a5a3a;
    color: #6ad4a0;
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 0.9em;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    line-height: inherit;
    vertical-align: baseline;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
    white-space: nowrap;
  }
  .md-response :global(.trick-chip:hover) {
    background: #122a1c;
    border-color: #3a8a5a;
    color: #8af0c0;
  }

  .chip-example {
    display: inline;
    background: #0d1f14;
    border: 1px solid #2a5a3a;
    color: #6ad4a0;
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 10px;
    font-weight: 700;
    font-family: monospace;
  }

  /* ── Modal ── */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 5, 10, 0.82);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
    backdrop-filter: blur(2px);
  }

  .modal-card {
    background: #090f18;
    border: 1px solid #2a3a4a;
    border-radius: 12px;
    padding: 16px;
    width: min(640px, 100%);
    max-height: 92vh;
    overflow-y: auto;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7);
    animation: modalIn 0.18s ease;
  }

  @keyframes modalIn {
    from { opacity: 0; transform: scale(0.96) translateY(8px); }
    to   { opacity: 1; transform: scale(1)    translateY(0);   }
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .modal-title {
    font-size: 13px;
    font-weight: 700;
    color: #d4af37;
    font-family: system-ui, sans-serif;
    letter-spacing: 0.03em;
  }

  .modal-close {
    background: #0d1820;
    border: 1px solid #1a2a3a;
    color: #6a8aaa;
    border-radius: 5px;
    padding: 4px 10px;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    transition: background 0.15s, color 0.15s;
  }
  .modal-close:hover {
    background: #152535;
    color: #c0d8ee;
  }

  /* ── Markdown styles ── */
  .md-response :global(h1),
  .md-response :global(h2),
  .md-response :global(h3),
  .md-response :global(h4) {
    color: #d4af37;
    margin: 16px 0 8px 0;
    font-weight: 700;
  }
  .md-response :global(h1) { font-size: 18px; }
  .md-response :global(h2) { font-size: 16px; }
  .md-response :global(h3) { font-size: 14px; color: #b8d4b0; }
  .md-response :global(h4) { font-size: 13px; color: #8aaa82; }

  .md-response :global(p) {
    color: #b0d0b0;
    font-size: 14px;
    line-height: 1.8;
    margin: 0 0 10px 0;
  }
  .md-response :global(strong) { color: #d0e8c8; font-weight: 700; }
  .md-response :global(em)     { color: #a0c898; font-style: italic; }

  .md-response :global(ul),
  .md-response :global(ol) { margin: 8px 0 12px 0; padding-left: 24px; }
  .md-response :global(li) {
    color: #b0d0b0; font-size: 14px; line-height: 1.7; margin-bottom: 4px;
  }
  .md-response :global(li::marker) { color: #4a8a4a; }

  .md-response :global(code) {
    background: #0d1a0d; color: #8bdb6a;
    padding: 1px 5px; border-radius: 3px;
    font-family: 'Courier New', monospace; font-size: 13px;
  }
  .md-response :global(pre) {
    background: #060d06; border: 1px solid #1a2a1a;
    border-radius: 6px; padding: 12px; margin: 10px 0; overflow-x: auto;
  }
  .md-response :global(pre code) { background: none; padding: 0; font-size: 12px; line-height: 1.5; }
  .md-response :global(hr) { border: none; border-top: 1px solid #1a2a1a; margin: 16px 0; }

  .md-response :global(table) { border-collapse: collapse; margin: 10px 0 14px 0; font-size: 13px; width: auto; }
  .md-response :global(th) { background: #0d1f0d; color: #d4af37; font-weight: 700; padding: 6px 14px; border: 1px solid #1a3a1a; text-align: left; }
  .md-response :global(td) { color: #b0d0b0; padding: 5px 14px; border: 1px solid #1a2a1a; }
  .md-response :global(tr:nth-child(even) td) { background: #080f08; }
</style>
