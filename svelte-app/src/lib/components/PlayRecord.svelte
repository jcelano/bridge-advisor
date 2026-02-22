<script>
  import { SUIT_SYMBOLS, SUIT_COLORS } from '$lib/bridge/constants.js';

  let { played, playStart, contract, declarer } = $props();

  const SEATS = ['N', 'E', 'S', 'W'];
  const SEAT_NAME = { N: 'North', E: 'East', S: 'South', W: 'West' };

  const rankOrder = '23456789TJQKA';
  const rankValue = r => rankOrder.indexOf(r?.toUpperCase() ?? '');

  function extractTrump(c) {
    if (!c) return null;
    const m = c.match(/\d(NT|N|S|H|D|C)/i);
    if (!m) return null;
    const s = m[1].toUpperCase();
    return (s === 'NT' || s === 'N') ? null : s;
  }

  function isDeclarerSide(seat) {
    if (!declarer) return false;
    return (declarer === 'N' || declarer === 'S')
      ? seat === 'N' || seat === 'S'
      : seat === 'E' || seat === 'W';
  }

  // Parse played lines into trick objects.
  // PBN STANDARD: column 0 = leader, columns 1/2/3 continue clockwise.
  // token[i] belongs to SEATS[(leaderIdx + i) % 4].
  // We re-sort into fixed N/E/S/W order for the table display.
  let tricks = $derived.by(() => {
    if (!played?.length) return [];
    const trump = extractTrump(contract);
    const firstLeader = (playStart || 'N').toUpperCase();
    const validFirstLeader = SEATS.includes(firstLeader) ? firstLeader : 'N';
    // Column order is fixed for the entire hand based on who leads trick 1.
    const firstLeaderIdx = SEATS.indexOf(validFirstLeader);
    const columnSeats = [0, 1, 2, 3].map(i => SEATS[(firstLeaderIdx + i) % 4]);

    let leader = validFirstLeader;

    return played.map(line => {
      const tokens = line.trim().replace(/\.$/, '').split(/\s+/);
      if (tokens.length < 4) return null;

      // Columns fixed for whole hand — token[i] always belongs to columnSeats[i]
      const rawCards = tokens.slice(0, 4).map((token, i) => {
        const seat = columnSeats[i];
        if (!token || token === '-') return { seat, suit: null, rank: null, raw: '-' };
        return { seat, suit: token[0].toUpperCase(), rank: token.slice(1).toUpperCase(), raw: token };
      });

      // Lead suit = column 0 (leader's card)
      const leadSuit = rawCards[0].suit;

      let winner = null, bestRank = -1, bestIsTrump = false;
      for (const card of rawCards) {
        if (!card.suit) continue;
        const isTrump = trump && card.suit === trump;
        const rv = rankValue(card.rank);
        if (isTrump && !bestIsTrump) { winner = card.seat; bestRank = rv; bestIsTrump = true; }
        else if (isTrump && bestIsTrump && rv > bestRank) { winner = card.seat; bestRank = rv; }
        else if (!isTrump && !bestIsTrump && card.suit === leadSuit && rv > bestRank) { winner = card.seat; bestRank = rv; }
      }

      // Sort into fixed N/E/S/W order for the display table
      const cards = [...rawCards].sort((a, b) => SEATS.indexOf(a.seat) - SEATS.indexOf(b.seat));

      const trick = { leader, cards, winner, leadSuit };
      leader = winner || leader;
      return trick;
    }).filter(Boolean);
  });

  function suitColor(suit) {
    return SUIT_COLORS[suit] || '#b0c0b0';
  }

  function suitSymbol(suit) {
    return SUIT_SYMBOLS[suit] || suit || '';
  }

  function cardDisplay(card) {
    if (!card.suit) return '—';
    return `${suitSymbol(card.suit)}${card.rank}`;
  }
</script>

{#if tricks.length > 0}
  <div class="play-record">
    <table class="play-table">
      <thead>
        <tr>
          <th class="trick-col">#</th>
          {#each SEATS as seat}
            <th class:declarer-col={isDeclarerSide(seat)}>{SEAT_NAME[seat]}</th>
          {/each}
          <th class="won-col">Won by</th>
        </tr>
      </thead>
      <tbody>
        {#each tricks as trick, i}
          <tr class:declarer-wins={trick.winner && isDeclarerSide(trick.winner)}>
            <td class="trick-num">{i + 1}</td>
            {#each trick.cards as card}
              <td
                class="card-cell"
                class:led={card.seat === trick.leader}
                class:winner-cell={card.seat === trick.winner}
                style="color: {card.suit ? suitColor(card.suit) : '#4a5a6a'}"
              >
                {cardDisplay(card)}
                {#if card.seat === trick.leader}<span class="led-dot" title="Led">·</span>{/if}
              </td>
            {/each}
            <td class="won-cell" class:declarer-won={trick.winner && isDeclarerSide(trick.winner)}>
              {trick.winner ? SEAT_NAME[trick.winner] : '?'}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    <div class="play-legend">· = led this trick</div>
  </div>
{/if}

<style>
  .play-record {
    margin-top: 10px;
    overflow-x: auto;
  }

  .play-table {
    border-collapse: collapse;
    font-size: 12px;
    width: 100%;
    font-family: 'Courier New', monospace;
  }

  .play-table th {
    background: #0d1f0d;
    color: #6a8a6a;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 5px 10px;
    border: 1px solid #1a2a1a;
    font-weight: 700;
    text-align: center;
  }

  .play-table th.declarer-col {
    color: #d4af37;
    background: #151a0d;
  }

  .trick-col { width: 28px; }
  .won-col { font-family: system-ui, sans-serif; }

  .play-table td {
    padding: 4px 10px;
    border: 1px solid #141e14;
    text-align: center;
    font-size: 13px;
    font-weight: 600;
  }

  .trick-num {
    color: #3a4a3a;
    font-size: 10px;
    font-family: system-ui, sans-serif;
    font-weight: normal;
  }

  .card-cell { position: relative; }

  .led-dot {
    font-size: 18px;
    line-height: 0;
    vertical-align: middle;
    color: #4a6a4a;
    margin-left: 1px;
  }

  .winner-cell {
    background: #0d1a0d;
  }

  .led {
    font-style: italic;
  }

  tr:nth-child(even) td { background-color: #080e08; }
  tr:nth-child(even) td.winner-cell { background-color: #0d1a0d; }

  .declarer-wins td { }

  .won-cell {
    font-size: 11px;
    color: #5a7a5a;
    font-family: system-ui, sans-serif;
    font-weight: normal;
  }

  .won-cell.declarer-won {
    color: #d4af37;
    font-weight: 700;
  }

  .play-legend {
    font-size: 10px;
    color: #3a4a3a;
    margin-top: 4px;
    font-style: italic;
  }
</style>
