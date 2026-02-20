<script>
  import { SUIT_SYMBOLS, SUIT_COLORS } from '$lib/bridge/constants.js';
  let { bid } = $props();
  let lo = $derived(bid.toLowerCase());
  let isPass = $derived(lo === 'pass');
  let isDbl = $derived(lo === 'x' || lo === 'dbl');
  let isRdbl = $derived(lo === 'xx' || lo === 'rdbl');
  let isBid = $derived(!isPass && !isDbl && !isRdbl);
  let suitKey = $derived(isBid ? (bid.slice(1).toUpperCase() === 'NT' ? null : bid[1]?.toUpperCase()) : null);
  let color = $derived(suitKey ? SUIT_COLORS[suitKey] : '#d4af37');
</script>

{#if isPass}<span class="chip pass">Pass</span>
{:else if isDbl}<span class="chip dbl">Dbl</span>
{:else if isRdbl}<span class="chip rdbl">Rdbl</span>
{:else}<span class="chip bid" style="color: {color}; border-color: {color}30">{bid[0]}{suitKey ? SUIT_SYMBOLS[suitKey] : 'NT'}</span>
{/if}

<style>
  .chip { padding: 3px 9px; border-radius: 4px; font-size: 12px; font-weight: 600; display: inline-block; }
  .pass { background: #0d1f0d; color: #44aa99; }
  .dbl { background: #1f0d0d; color: #e66; }
  .rdbl { background: #1f0d1f; color: #c6c; }
  .bid { background: #101828; font-weight: 700; border: 1px solid; }
</style>
