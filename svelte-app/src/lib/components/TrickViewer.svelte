<script>
  import { SUIT_SYMBOLS, SUIT_COLORS } from '$lib/bridge/constants.js';

  /**
   * TrickViewer - Interactive trick-by-trick hand viewer.
   *
   * Props:
   *   deal       — { N: {S,H,D,C}, E: ..., S: ..., W: ... } dealt hands
   *   played     — string[] of PBN play lines
   *   playStart  — seat letter of trick-1 leader ('N','E','S','W')
   *   contract   — e.g. '3NT', '4H'
   *   declarer   — seat letter of declarer ('N','E','S','W')
   */
  let { deal, played, playStart, contract, declarer, bindIndex = $bindable() } = $props();

  // Expose a jumpTo function for external callers (e.g. trick chips in analysis)
  export function jumpTo(n) {
    // n is 1-based trick number
    const idx = Math.max(0, Math.min((n - 1), (played?.length ?? 1) - 1));
    currentTrickIndex = idx;
  }

  const SEATS = ['N', 'E', 'S', 'W'];
  const SEAT_NAME = { N: 'North', E: 'East', S: 'South', W: 'West' };
  const SUITS = ['S', 'H', 'D', 'C'];
  const RANK_ORDER  = 'AKQJT98765432'; // display sort: high cards first (A=0)
  const RANK_VALUES = '23456789TJQKA'; // winner calc: higher index = higher rank (A=12)

  // ── Trump extraction ────────────────────────────────────────────
  function extractTrump(c) {
    if (!c) return null;
    const m = c.match(/\d(NT|N|S|H|D|C)/i);
    if (!m) return null;
    const s = m[1].toUpperCase();
    return (s === 'NT' || s === 'N') ? null : s;
  }

  const trump = $derived(extractTrump(contract));

  // ── Parse all tricks once ───────────────────────────────────────
  // rankValue: higher number = stronger card (used for winner comparison)
  const rankValue = r => RANK_VALUES.indexOf(r?.toUpperCase() ?? '');

  const allTricks = $derived.by(() => {
    if (!played?.length) return [];
    const firstLeader = (playStart || 'N').toUpperCase();
    const validFirst = SEATS.includes(firstLeader) ? firstLeader : 'N';
    const firstIdx = SEATS.indexOf(validFirst);
    // Column order fixed for the whole hand based on trick-1 leader
    const columnSeats = [0, 1, 2, 3].map(i => SEATS[(firstIdx + i) % 4]);
    let leader = validFirst;

    return played.map(line => {
      const tokens = line.trim().replace(/\.$/, '').split(/\s+/);
      if (tokens.length < 4) return null;

      const cards = tokens.slice(0, 4).map((token, i) => {
        const seat = columnSeats[i];
        if (!token || token === '-') return { seat, suit: null, rank: null };
        return { seat, suit: token[0].toUpperCase(), rank: token.slice(1).toUpperCase() };
      });

      // Lead suit comes from the LEADER's card, not column 0.
      // Columns are fixed for the whole hand, so after trick 1 the leader
      // is not necessarily in column 0.
      const leaderCard = cards.find(c => c.seat === leader);
      const leadSuit = leaderCard?.suit || null;
      let winner = null, bestRank = -1, bestIsTrump = false;
      for (const card of cards) {
        if (!card.suit) continue;
        const isTrump = trump && card.suit === trump;
        const rv = rankValue(card.rank);
        if (isTrump && !bestIsTrump) { winner = card.seat; bestRank = rv; bestIsTrump = true; }
        else if (isTrump && bestIsTrump && rv > bestRank) { winner = card.seat; bestRank = rv; }
        else if (!isTrump && !bestIsTrump && card.suit === leadSuit && rv > bestRank) { winner = card.seat; bestRank = rv; }
      }

      // Map cards to a seat-keyed object for easy lookup
      const bySeats = {};
      for (const c of cards) bySeats[c.seat] = c;

      const trick = { leader, cards: bySeats, winner, leadSuit };
      leader = winner || leader;
      return trick;
    }).filter(Boolean);
  });

  // ── Current trick navigation ────────────────────────────────────
  let currentTrickIndex = $state(0);

  // Keep bindIndex in sync if parent uses it
  $effect(() => { if (bindIndex !== undefined) bindIndex = currentTrickIndex; });

  const currentTrick = $derived(allTricks[currentTrickIndex] ?? null);

  function prev() { if (currentTrickIndex > 0) currentTrickIndex--; }
  function next() { if (currentTrickIndex < allTricks.length - 1) currentTrickIndex++; }

  // ── Reconstruct which cards have been played up to (not including) current trick ──
  // Cards played IN the current trick are shown in the compass center
  // Cards played in PREVIOUS tricks are grayed out in the hand display
  const playedBeforeCurrent = $derived.by(() => {
    // Set of "SUIT+RANK" strings played in tricks 0..(currentTrickIndex-1)
    const played = new Set();
    for (let i = 0; i < currentTrickIndex; i++) {
      const trick = allTricks[i];
      if (!trick) continue;
      for (const card of Object.values(trick.cards)) {
        if (card.suit && card.rank) played.add(card.suit + card.rank);
      }
    }
    return played;
  });

  const playedInCurrent = $derived.by(() => {
    if (!currentTrick) return new Set();
    const s = new Set();
    for (const card of Object.values(currentTrick.cards)) {
      if (card.suit && card.rank) s.add(card.suit + card.rank);
    }
    return s;
  });

  // ── Suit color / symbol helpers ────────────────────────────────
  function suitColor(suit) { return SUIT_COLORS[suit] || '#b0c0b0'; }
  function suitSym(suit) { return SUIT_SYMBOLS[suit] || suit || ''; }

  // ── Check if declarer / dummy ──────────────────────────────────
  const PARTNER_OF = { N: 'S', S: 'N', E: 'W', W: 'E' };
  const dummy = $derived(declarer ? PARTNER_OF[declarer] : null);

  function isDeclarerSide(seat) {
    if (!declarer) return false;
    return (declarer === 'N' || declarer === 'S')
      ? seat === 'N' || seat === 'S'
      : seat === 'E' || seat === 'W';
  }

  // ── Sort hand ranks in display order ───────────────────────────
  function sortedRanks(rankArr) {
    return [...(rankArr || [])].sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b));
  }

  // ── Card key helper ────────────────────────────────────────────
  function cardKey(suit, rank) { return suit + rank; }

  // ── Trick score counters ────────────────────────────────────────
  const trickCounts = $derived.by(() => {
    let decl = 0, def = 0;
    for (let i = 0; i <= currentTrickIndex && i < allTricks.length; i++) {
      const t = allTricks[i];
      if (!t?.winner) continue;
      if (isDeclarerSide(t.winner)) decl++;
      else def++;
    }
    return { decl, def };
  });
</script>

{#if allTricks.length > 0 && deal}
<div class="trick-viewer">

  <!-- ── Nav Bar ────────────────────────────────────────────── -->
  <div class="tv-nav">
    <button class="nav-btn" onclick={prev} disabled={currentTrickIndex === 0}>◀</button>
    <div class="tv-trick-label">
      Trick {currentTrickIndex + 1} <span class="tv-of">of {allTricks.length}</span>
    </div>
    <button class="nav-btn" onclick={next} disabled={currentTrickIndex === allTricks.length - 1}>▶</button>
    <div class="tv-score">
      {#if declarer}
        <span class="score-decl" title="Declarer tricks">Decl {trickCounts.decl}</span>
        <span class="score-sep">/</span>
        <span class="score-def" title="Defense tricks">Def {trickCounts.def}</span>
      {/if}
    </div>
  </div>

  <!-- ── Main grid: compass layout ─────────────────────────── -->
  <div class="tv-body">

    <!-- NORTH hand (top) -->
    <div class="tv-hand tv-north" class:declarer-hand={isDeclarerSide('N')}>
      <div class="hand-label">
        {SEAT_NAME.N}
        {#if declarer === 'N'}<span class="role-tag">Declarer</span>{/if}
        {#if dummy === 'N'}<span class="role-tag dummy">Dummy</span>{/if}
      </div>
      <div class="hand-suits">
        {#each SUITS as suit}
          {@const ranks = sortedRanks(deal.N?.[suit])}
          {#if ranks.length > 0}
            <div class="suit-row">
              <span class="suit-sym" style="color:{suitColor(suit)}">{suitSym(suit)}</span>
              {#each ranks as rank}
                {@const key = cardKey(suit, rank)}
                {@const inCurrent = playedInCurrent.has(key)}
                {@const played = playedBeforeCurrent.has(key)}
                <span
                  class="hand-card"
                  class:card-played={played}
                  class:card-current={inCurrent}
                  style="color: {played ? '#2a3a2a' : inCurrent ? '#fff' : suitColor(suit)}"
                >{rank}</span>
              {/each}
            </div>
          {:else}
            <div class="suit-row void-row">
              <span class="suit-sym" style="color:{suitColor(suit)}">{suitSym(suit)}</span>
              <span class="void-label">—</span>
            </div>
          {/if}
        {/each}
      </div>
    </div>

    <!-- Middle row: W hand | compass | E hand -->
    <div class="tv-middle">

      <!-- WEST hand -->
      <div class="tv-hand tv-west" class:declarer-hand={isDeclarerSide('W')}>
        <div class="hand-label">
          {SEAT_NAME.W}
          {#if declarer === 'W'}<span class="role-tag">Declarer</span>{/if}
          {#if dummy === 'W'}<span class="role-tag dummy">Dummy</span>{/if}
        </div>
        <div class="hand-suits">
          {#each SUITS as suit}
            {@const ranks = sortedRanks(deal.W?.[suit])}
            {#if ranks.length > 0}
              <div class="suit-row">
                <span class="suit-sym" style="color:{suitColor(suit)}">{suitSym(suit)}</span>
                {#each ranks as rank}
                  {@const key = cardKey(suit, rank)}
                  {@const inCurrent = playedInCurrent.has(key)}
                  {@const wasPlayed = playedBeforeCurrent.has(key)}
                  <span
                    class="hand-card"
                    class:card-played={wasPlayed}
                    class:card-current={inCurrent}
                    style="color: {wasPlayed ? '#2a3a2a' : inCurrent ? '#fff' : suitColor(suit)}"
                  >{rank}</span>
                {/each}
              </div>
            {:else}
              <div class="suit-row void-row">
                <span class="suit-sym" style="color:{suitColor(suit)}">{suitSym(suit)}</span>
                <span class="void-label">—</span>
              </div>
            {/if}
          {/each}
        </div>
      </div>

      <!-- COMPASS CENTER -->
      <div class="tv-compass">
        <!-- N slot -->
        <div class="compass-slot compass-n">
          {#if currentTrick?.cards?.N?.suit}
            {@const c = currentTrick.cards.N}
            <div class="played-card"
              class:winner-card={currentTrick.winner === 'N'}
              class:leader-card={currentTrick.leader === 'N'}
              style="color:{suitColor(c.suit)}">
              {suitSym(c.suit)}{c.rank}
              {#if currentTrick.winner === 'N'}<div class="win-star">★</div>{/if}
            </div>
          {:else}
            <div class="empty-slot">–</div>
          {/if}
        </div>
        <!-- W slot -->
        <div class="compass-slot compass-w">
          {#if currentTrick?.cards?.W?.suit}
            {@const c = currentTrick.cards.W}
            <div class="played-card"
              class:winner-card={currentTrick.winner === 'W'}
              class:leader-card={currentTrick.leader === 'W'}
              style="color:{suitColor(c.suit)}">
              {suitSym(c.suit)}{c.rank}
              {#if currentTrick.winner === 'W'}<div class="win-star">★</div>{/if}
            </div>
          {:else}
            <div class="empty-slot">–</div>
          {/if}
        </div>
        <!-- center label -->
        <div class="compass-center-label">
          {#if currentTrick?.winner}
            <div class="winner-label">Won by<br/><b>{SEAT_NAME[currentTrick.winner]}</b></div>
          {:else}
            <div class="winner-label dim">In play</div>
          {/if}
        </div>
        <!-- E slot -->
        <div class="compass-slot compass-e">
          {#if currentTrick?.cards?.E?.suit}
            {@const c = currentTrick.cards.E}
            <div class="played-card"
              class:winner-card={currentTrick.winner === 'E'}
              class:leader-card={currentTrick.leader === 'E'}
              style="color:{suitColor(c.suit)}">
              {suitSym(c.suit)}{c.rank}
              {#if currentTrick.winner === 'E'}<div class="win-star">★</div>{/if}
            </div>
          {:else}
            <div class="empty-slot">–</div>
          {/if}
        </div>
        <!-- S slot -->
        <div class="compass-slot compass-s">
          {#if currentTrick?.cards?.S?.suit}
            {@const c = currentTrick.cards.S}
            <div class="played-card"
              class:winner-card={currentTrick.winner === 'S'}
              class:leader-card={currentTrick.leader === 'S'}
              style="color:{suitColor(c.suit)}">
              {suitSym(c.suit)}{c.rank}
              {#if currentTrick.winner === 'S'}<div class="win-star">★</div>{/if}
            </div>
          {:else}
            <div class="empty-slot">–</div>
          {/if}
        </div>
      </div>

      <!-- EAST hand -->
      <div class="tv-hand tv-east" class:declarer-hand={isDeclarerSide('E')}>
        <div class="hand-label">
          {SEAT_NAME.E}
          {#if declarer === 'E'}<span class="role-tag">Declarer</span>{/if}
          {#if dummy === 'E'}<span class="role-tag dummy">Dummy</span>{/if}
        </div>
        <div class="hand-suits">
          {#each SUITS as suit}
            {@const ranks = sortedRanks(deal.E?.[suit])}
            {#if ranks.length > 0}
              <div class="suit-row">
                <span class="suit-sym" style="color:{suitColor(suit)}">{suitSym(suit)}</span>
                {#each ranks as rank}
                  {@const key = cardKey(suit, rank)}
                  {@const inCurrent = playedInCurrent.has(key)}
                  {@const wasPlayed = playedBeforeCurrent.has(key)}
                  <span
                    class="hand-card"
                    class:card-played={wasPlayed}
                    class:card-current={inCurrent}
                    style="color: {wasPlayed ? '#2a3a2a' : inCurrent ? '#fff' : suitColor(suit)}"
                  >{rank}</span>
                {/each}
              </div>
            {:else}
              <div class="suit-row void-row">
                <span class="suit-sym" style="color:{suitColor(suit)}">{suitSym(suit)}</span>
                <span class="void-label">—</span>
              </div>
            {/if}
          {/each}
        </div>
      </div>

    </div><!-- end tv-middle -->

    <!-- SOUTH hand (bottom) -->
    <div class="tv-hand tv-south" class:declarer-hand={isDeclarerSide('S')}>
      <div class="hand-label">
        {SEAT_NAME.S}
        {#if declarer === 'S'}<span class="role-tag">Declarer</span>{/if}
        {#if dummy === 'S'}<span class="role-tag dummy">Dummy</span>{/if}
      </div>
      <div class="hand-suits">
        {#each SUITS as suit}
          {@const ranks = sortedRanks(deal.S?.[suit])}
          {#if ranks.length > 0}
            <div class="suit-row">
              <span class="suit-sym" style="color:{suitColor(suit)}">{suitSym(suit)}</span>
              {#each ranks as rank}
                {@const key = cardKey(suit, rank)}
                {@const inCurrent = playedInCurrent.has(key)}
                {@const wasPlayed = playedBeforeCurrent.has(key)}
                <span
                  class="hand-card"
                  class:card-played={wasPlayed}
                  class:card-current={inCurrent}
                  style="color: {wasPlayed ? '#2a3a2a' : inCurrent ? '#fff' : suitColor(suit)}"
                >{rank}</span>
              {/each}
            </div>
          {:else}
            <div class="suit-row void-row">
              <span class="suit-sym" style="color:{suitColor(suit)}">{suitSym(suit)}</span>
              <span class="void-label">—</span>
            </div>
          {/if}
        {/each}
      </div>
    </div>

  </div><!-- end tv-body -->

  <!-- ── Legend ────────────────────────────────────────────── -->
  <div class="tv-legend">
    <span class="legend-item"><span class="legend-swatch current-swatch"></span> This trick</span>
    <span class="legend-item"><span class="legend-swatch played-swatch"></span> Already played</span>
    <span class="legend-item"><span class="win-star-sm">★</span> Trick winner</span>
    {#if trump}<span class="legend-item">Trump: <span style="color:{suitColor(trump)}">{suitSym(trump)}</span></span>{:else}<span class="legend-item">No trump</span>{/if}
  </div>

  <!-- ── Trick dots progress bar ───────────────────────────── -->
  <div class="tv-dots">
    {#each allTricks as _, i}
      <button
        class="trick-dot"
        class:dot-active={i === currentTrickIndex}
        class:dot-decl={allTricks[i]?.winner && isDeclarerSide(allTricks[i].winner)}
        class:dot-def={allTricks[i]?.winner && !isDeclarerSide(allTricks[i].winner)}
        onclick={() => currentTrickIndex = i}
        title="Trick {i + 1}"
      ></button>
    {/each}
  </div>

</div>
{/if}

<style>
  .trick-viewer {
    background: #080e14;
    border: 1px solid #1a2a3a;
    border-radius: 10px;
    padding: 14px;
    font-family: 'Courier New', monospace;
    user-select: none;
  }

  /* ── Nav bar ── */
  .tv-nav {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
  }
  .nav-btn {
    background: #0d1820;
    border: 1px solid #1a2a3a;
    color: #6a8aaa;
    border-radius: 6px;
    padding: 5px 13px;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .nav-btn:hover:not(:disabled) { background: #152535; color: #aaccee; }
  .nav-btn:disabled { opacity: 0.3; cursor: default; }
  .tv-trick-label {
    font-size: 14px;
    font-weight: 700;
    color: #d4af37;
    letter-spacing: 0.03em;
  }
  .tv-of { color: #4a6a8a; font-weight: 400; }
  .tv-score {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
  }
  .score-decl { color: #d4af37; font-weight: 700; }
  .score-sep { color: #4a5a6a; }
  .score-def { color: #7a9aaa; }

  /* ── Body layout ── */
  .tv-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .tv-middle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    justify-content: center;
  }

  /* ── Hand panels ── */
  .tv-hand {
    background: #0a1219;
    border: 1px solid #1a2a3a;
    border-radius: 8px;
    padding: 8px 12px;
    min-width: 130px;
    max-width: 200px;
  }
  .tv-north, .tv-south {
    width: 100%;
    max-width: 340px;
  }
  .tv-west, .tv-east {
    flex: 0 0 auto;
    min-width: 120px;
  }
  .tv-hand.declarer-hand {
    border-color: #2a3a1a;
    background: #091209;
  }

  .hand-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #4a6a5a;
    font-weight: 700;
    margin-bottom: 6px;
    font-family: system-ui, sans-serif;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .role-tag {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 3px;
    background: #1a2a1a;
    color: #d4af37;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .role-tag.dummy {
    background: #1a1a2a;
    color: #aac;
  }

  .hand-suits { display: flex; flex-direction: column; gap: 2px; }

  .suit-row {
    display: flex;
    align-items: baseline;
    gap: 3px;
    flex-wrap: wrap;
  }
  .void-row { opacity: 0.35; }
  .suit-sym { font-size: 13px; min-width: 14px; }
  .void-label { font-size: 11px; color: #2a3a3a; }

  .hand-card {
    font-size: 12px;
    font-weight: 600;
    transition: color 0.15s, text-decoration 0.15s;
    cursor: default;
  }
  .hand-card.card-played {
    color: #2a3a2a !important;
    text-decoration: line-through;
  }
  .hand-card.card-current {
    color: #fff !important;
    font-weight: 800;
    text-shadow: 0 0 6px rgba(212, 175, 55, 0.6);
  }

  /* ── Compass ── */
  .tv-compass {
    display: grid;
    grid-template-columns: 64px 80px 64px;
    grid-template-rows: 64px 64px 64px;
    gap: 2px;
    flex: 0 0 auto;
  }
  .compass-slot {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .compass-n { grid-column: 2; grid-row: 1; }
  .compass-w { grid-column: 1; grid-row: 2; }
  .compass-center-label { grid-column: 2; grid-row: 2; display: flex; align-items: center; justify-content: center; }
  .compass-e { grid-column: 3; grid-row: 2; }
  .compass-s { grid-column: 2; grid-row: 3; }

  .played-card {
    font-size: 18px;
    font-weight: 800;
    text-align: center;
    position: relative;
    background: #0d1a0d;
    border: 1px solid #2a4a2a;
    border-radius: 6px;
    padding: 6px 8px;
    min-width: 46px;
    line-height: 1;
  }
  .played-card.winner-card {
    background: #0f200f;
    border-color: #4a8a4a;
    box-shadow: 0 0 8px rgba(74, 138, 74, 0.4);
  }
  .played-card.leader-card {
    border-style: dashed;
  }
  .win-star {
    position: absolute;
    top: -8px;
    right: -8px;
    font-size: 11px;
    color: #d4af37;
    line-height: 1;
  }
  .win-star-sm { color: #d4af37; font-size: 11px; }

  .empty-slot {
    color: #1a2a2a;
    font-size: 20px;
  }

  .winner-label {
    text-align: center;
    font-size: 10px;
    color: #4a6a5a;
    line-height: 1.4;
    font-family: system-ui, sans-serif;
  }
  .winner-label b { color: #8bdb6a; font-size: 11px; }
  .winner-label.dim { color: #2a3a3a; }

  /* ── Legend ── */
  .tv-legend {
    display: flex;
    gap: 16px;
    margin-top: 12px;
    flex-wrap: wrap;
    font-size: 10px;
    color: #4a6a5a;
    font-family: system-ui, sans-serif;
    align-items: center;
  }
  .legend-item { display: flex; align-items: center; gap: 4px; }
  .legend-swatch {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }
  .current-swatch { background: #fff; box-shadow: 0 0 4px rgba(212,175,55,0.5); }
  .played-swatch { background: #2a3a2a; }

  /* ── Trick dots ── */
  .tv-dots {
    display: flex;
    gap: 5px;
    margin-top: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .trick-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid #1a2a3a;
    background: #0d1820;
    cursor: pointer;
    padding: 0;
    transition: background 0.15s, border-color 0.15s;
  }
  .trick-dot:hover { border-color: #4a6a8a; }
  .trick-dot.dot-active { border-color: #d4af37; background: #2a1f00; }
  .trick-dot.dot-decl { background: #1a2a0a; border-color: #3a5a2a; }
  .trick-dot.dot-def { background: #0d1820; border-color: #1a3a5a; }
  .trick-dot.dot-active.dot-decl { background: #2a3a0a; border-color: #d4af37; }
  .trick-dot.dot-active.dot-def { background: #0a1a2a; border-color: #d4af37; }

  @media (max-width: 600px) {
    .tv-west, .tv-east { min-width: 90px; }
    .hand-card { font-size: 11px; }
    .played-card { font-size: 15px; min-width: 38px; }
    .tv-compass {
      grid-template-columns: 50px 70px 50px;
      grid-template-rows: 56px 56px 56px;
    }
  }
</style>
