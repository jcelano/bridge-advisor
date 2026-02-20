<script>
  import { SEAT_KEY } from '$lib/bridge/constants.js';
  import BidChip from './BidChip.svelte';
  let { auction, dealerSeat } = $props();
  const order = ['N', 'E', 'S', 'W'];
  let dealerIdx = $derived(order.indexOf(SEAT_KEY[dealerSeat] || 'S'));
  let headers = $derived(Array.from({ length: 4 }, (_, i) => order[(dealerIdx + i) % 4]));
</script>

{#if auction.length === 0}
  <div class="empty">No bids yet</div>
{:else}
  <div class="grid">
    {#each headers as h}<div class="header">{h}</div>{/each}
    {#each auction as bid}<div class="cell"><BidChip {bid} /></div>{/each}
  </div>
{/if}

<style>
  .empty { color: #445; font-size: 13px; font-style: italic; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; max-width: 280px; }
  .header { font-size: 11px; color: #6a7a8a; font-weight: 700; text-align: center; padding-bottom: 4px; border-bottom: 1px solid #1a2a3a; }
  .cell { text-align: center; padding: 3px 0; }
</style>
