<script>
  import { SUITS, RANKS, SUIT_SYMBOLS, SUIT_COLORS, countHCP, totalCards } from '$lib/bridge/constants.js';

  let { hand = $bindable(), usedCards, label } = $props();

  function toggle(suit, rank) {
    const cur = hand[suit] || [];
    if (cur.includes(rank)) {
      hand = { ...hand, [suit]: cur.filter(r => r !== rank) };
    } else {
      const next = [...cur, rank].sort((a, b) => RANKS.indexOf(a) - RANKS.indexOf(b));
      hand = { ...hand, [suit]: next };
    }
  }

  let hcp = $derived(countHCP(hand));
  let cards = $derived(totalCards(hand));
</script>

<div class="editor">
  <div class="label">{label} — {hcp} HCP, {cards} cards</div>
  {#each SUITS as suit}
    <div class="suit-row">
      <span class="suit-icon" style="color: {SUIT_COLORS[suit]}">{SUIT_SYMBOLS[suit]}</span>
      <div class="cards">
        {#each RANKS as rank}
          {@const selected = (hand[suit] || []).includes(rank)}
          {@const used = !selected && usedCards.has(suit + rank)}
          <button
            class="card" class:selected class:used
            style={selected ? `border-color: ${SUIT_COLORS[suit]}; color: ${SUIT_COLORS[suit]}` : ''}
            disabled={used}
            onclick={() => !used && toggle(suit, rank)}
          >{rank}</button>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .label { font-size: 12px; color: #7a8a9a; margin-bottom: 6px; font-weight: 600; letter-spacing: 0.5px; }
  .suit-row { display: flex; align-items: center; margin-bottom: 3px; gap: 2px; }
  .suit-icon { font-size: 20px; width: 24px; text-align: center; flex-shrink: 0; }
  .cards { display: flex; flex-wrap: wrap; gap: 2px; }
  .card {
    width: 34px; height: 38px; border-radius: 5px; font-size: 13px; font-weight: 700;
    cursor: pointer; border: 1px solid #2a3040; background: #0f1520; color: #556; transition: all 0.12s;
  }
  .card:hover:not(.used) { border-color: #4a5a6a; background: #1a2530; }
  .card.selected { background: #1a2a3a; border-width: 2px; }
  .card.used { opacity: 0.25; cursor: not-allowed; background: #0a0a10; color: #222; }
</style>
