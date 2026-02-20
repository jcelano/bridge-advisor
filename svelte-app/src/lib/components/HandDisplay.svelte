<script>
  import { SUITS, SUIT_SYMBOLS, SUIT_COLORS, countHCP } from '$lib/bridge/constants.js';
  let { hand, label } = $props();
  let hasCards = $derived(hand && SUITS.some(s => (hand[s] || []).length > 0));
  let hcp = $derived(hand ? countHCP(hand) : 0);
</script>

{#if hasCards}
  <div class="hand-display">
    <div class="hand-label">{label} — {hcp} HCP</div>
    {#each SUITS as suit}
      <div class="suit-line">
        <span style="color: {SUIT_COLORS[suit]}; font-size: 17px">{SUIT_SYMBOLS[suit]}</span>
        <span class="cards">{(hand[suit] || []).join(' ') || '—'}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .hand-display { padding: 8px 12px; background: #0a1018; border-radius: 8px; border: 1px solid #1a2a3a; }
  .hand-label { font-size: 11px; color: #6a7a8a; margin-bottom: 4px; letter-spacing: 1px; font-weight: 600; }
  .suit-line { display: flex; align-items: center; gap: 6px; line-height: 22px; }
  .cards { color: #d0dae4; font-size: 14px; font-weight: 600; letter-spacing: 2px; font-family: monospace; }
</style>
