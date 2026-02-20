<script>
  import { BID_LEVELS, BID_STRAINS, SUIT_SYMBOLS, SUIT_COLORS } from '$lib/bridge/constants.js';
  let { onbid, auction } = $props();

  let highestIdx = $derived.by(() => {
    let h = -1;
    for (const b of auction) {
      const lo = b.toLowerCase();
      if (['pass','x','dbl','xx','rdbl'].includes(lo)) continue;
      const si = BID_STRAINS.indexOf(b.slice(1).toUpperCase());
      if (si >= 0) { const idx = (parseInt(b[0]) - 1) * 5 + si; if (idx > h) h = idx; }
    }
    return h;
  });

  let lastNonPass = $derived([...auction].reverse().find(b => b.toLowerCase() !== 'pass'));
  let canDouble = $derived(lastNonPass && !['x','dbl','xx','rdbl','pass'].includes((lastNonPass||'').toLowerCase()) && highestIdx >= 0);
  let canRedouble = $derived(lastNonPass && ['x','dbl'].includes((lastNonPass||'').toLowerCase()));

  function sk(strain) { return strain === 'NT' ? null : strain[0]; }
  function col(strain) { const s = sk(strain); return s ? SUIT_COLORS[s] : '#d4af37'; }
  function display(level, strain) { const s = sk(strain); return `${level}${s ? SUIT_SYMBOLS[s] : 'NT'}`; }
</script>

<div>
  <div class="grid">
    {#each BID_LEVELS as level}
      {#each BID_STRAINS as strain}
        {@const idx = (parseInt(level) - 1) * 5 + BID_STRAINS.indexOf(strain)}
        {@const disabled = idx <= highestIdx}
        <button class="bid-btn" class:disabled {disabled}
          style={disabled ? '' : `color: ${col(strain)}; border-color: ${col(strain)}40`}
          onclick={() => onbid(level + strain)}>{display(level, strain)}</button>
      {/each}
    {/each}
  </div>
  <div class="actions">
    <button class="act pass" onclick={() => onbid('Pass')}>Pass</button>
    <button class="act dbl" class:enabled={canDouble} disabled={!canDouble} onclick={() => canDouble && onbid('X')}>Dbl</button>
    <button class="act rdbl" class:enabled={canRedouble} disabled={!canRedouble} onclick={() => canRedouble && onbid('XX')}>Rdbl</button>
  </div>
</div>

<style>
  .grid { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 8px; }
  .bid-btn { width: 46px; height: 34px; border-radius: 5px; font-size: 12px; font-weight: 700; cursor: pointer; background: #101828; border: 1px solid transparent; transition: all 0.12s; }
  .bid-btn.disabled { background: #0a0a10; border-color: #1a1a24; color: #2a2a34; cursor: not-allowed; }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .act { padding: 6px 16px; border-radius: 5px; font-size: 13px; font-weight: 600; cursor: not-allowed; border: 1px solid; }
  .act.pass { background: #0d1f0d; color: #44aa99; border-color: #1a3a2a; cursor: pointer; }
  .act.dbl { background: #0a0a10; color: #333; border-color: #2a1a1a; }
  .act.dbl.enabled { background: #1f0d0d; color: #e66; cursor: pointer; }
  .act.rdbl { background: #0a0a10; color: #333; border-color: #2a1a2a; }
  .act.rdbl.enabled { background: #1f0d1f; color: #c6c; cursor: pointer; }
</style>
