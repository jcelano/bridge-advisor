<script>
  import { onMount } from 'svelte';
  import {
    SEATS, SEAT_KEY, SEAT_NAME, PARTNER, VULNERABILITIES,
    SUITS, RANKS, emptyHand, getUsedCards, handHasCards, totalCards
  } from '$lib/bridge/constants.js';
  import { parsePBN, generatePBN } from '$lib/bridge/pbn.js';
  import { buildPrompt } from '$lib/bridge/prompt.js';
  import { getAdvice, healthCheck, getHistory, shareHistoryEntry, unshareHistoryEntry } from '$lib/api.js';
  import HandEditor from '$lib/components/HandEditor.svelte';
  import HandDisplay from '$lib/components/HandDisplay.svelte';
  import BiddingBox from '$lib/components/BiddingBox.svelte';
  import AuctionDisplay from '$lib/components/AuctionDisplay.svelte';
  import BidChip from '$lib/components/BidChip.svelte';
  import MarkdownResponse from '$lib/components/MarkdownResponse.svelte';

  // ── State ─────────────────────────────────────────────
  let tab = $state('pbn');
  let pbnText = $state('');
  let mySeat = $state('South');
  let dealer = $state('South');
  let vuln = $state('None');
  let conventionSystem = $state('SAYC');
  let northHand = $state(emptyHand());
  let eastHand = $state(emptyHand());
  let southHand = $state(emptyHand());
  let westHand = $state(emptyHand());
  let showDummy = $state(false);
  let dummySeat = $state('North');
  let auction = $state([]);
  let contract = $state('');
  let tricks = $state('');
  let adviceType = $state('analyze');
  let response = $state('');
  let loading = $state(false);
  let parsedPBNData = $state(null);
  let showPromptPreview = $state(false);
  let serverOk = $state(null);
  let history = $state([]);
  let currentState = $derived(buildGameState());

  // ── Derived ───────────────────────────────────────────
  let usedCards = $derived(getUsedCards(northHand, eastHand, southHand, westHand));
  let hasState = $derived(
    handHasCards(northHand) || handHasCards(eastHand) || handHasCards(southHand) || handHasCards(westHand)
    || parsedPBNData !== null
  );
  let totalSelected = $derived(
    totalCards(northHand) + totalCards(eastHand) + totalCards(southHand) + totalCards(westHand)
  );
  let canGetAdvice = $derived(parsedPBNData !== null || totalSelected === 52);

  // Saved history (persisted on server)
  let savedHistory = $state(null);
  let savedLoading = $state(false);
  let savedExpanded = $state(null);
  let shareStatus = $state({});   // { [entryId]: 'copying' | 'copied' | 'error' | 'revoking' | 'revoked' }
  let sharedTokens = $state({});  // { [entryId]: token } — tracks which entries have an active share link

  async function handleShare(entryId) {
    shareStatus = { ...shareStatus, [entryId]: 'copying' };
    try {
      const result = await shareHistoryEntry(entryId);
      if (!result?.token) throw new Error('no token');
      sharedTokens = { ...sharedTokens, [entryId]: result.token };
      const url = `${window.location.origin}/share/${result.token}`;
      await navigator.clipboard.writeText(url);
      shareStatus = { ...shareStatus, [entryId]: 'copied' };
      setTimeout(() => { shareStatus = { ...shareStatus, [entryId]: null }; }, 2500);
    } catch {
      shareStatus = { ...shareStatus, [entryId]: 'error' };
      setTimeout(() => { shareStatus = { ...shareStatus, [entryId]: null }; }, 2500);
    }
  }

  async function handleUnshare(entryId) {
    shareStatus = { ...shareStatus, [entryId]: 'revoking' };
    try {
      await unshareHistoryEntry(entryId);
      const { [entryId]: _, ...rest } = sharedTokens;
      sharedTokens = rest;
      shareStatus = { ...shareStatus, [entryId]: 'revoked' };
      setTimeout(() => { shareStatus = { ...shareStatus, [entryId]: null }; }, 2500);
    } catch {
      shareStatus = { ...shareStatus, [entryId]: 'error' };
      setTimeout(() => { shareStatus = { ...shareStatus, [entryId]: null }; }, 2500);
    }
  }

  function seedSharedTokens(entries) {
    const tokens = {};
    for (const e of entries) {
      if (e.shareToken) tokens[e.id] = e.shareToken;
    }
    sharedTokens = { ...sharedTokens, ...tokens };
  }

  async function loadSavedHistory() {
    savedLoading = true;
    try {
      const data = await getHistory({ limit: 50, scope: 'all' });
      if (data?.entries) {
        data.entries = data.entries.map(e => ({
          ...e,
          parsedPbn: e.pbn ? safeParsePbn(e.pbn) : null,
        }));
        seedSharedTokens(data.entries);
      }
      savedHistory = data;
    } catch {
      savedHistory = { entries: [], total: 0 };
    }
    savedLoading = false;
  }

  const adviceTypes = [
    ['bid', 'Bidding'],
    ['lead', 'Opening Lead'],
    ['play', 'Card Play'],
    ['analyze', 'Full Analysis'],
  ];

  // ── Health check ──────────────────────────────────────
  onMount(async () => {
    serverOk = await healthCheck();
  });

  // ── PBN Import ────────────────────────────────────────
  function handleParsePBN(text) {
    try {
      const p = parsePBN(text ?? pbnText);
      parsedPBNData = p;
      northHand = emptyHand(); eastHand = emptyHand(); southHand = emptyHand(); westHand = emptyHand();
      if (p.dealer) dealer = SEAT_NAME[p.dealer] || 'South';
      if (p.vulnerability) vuln = p.vulnerability;
      if (p.auction?.length) auction = [...p.auction];
      if (p.contract) contract = p.contract;
      if (p.deal?.N) northHand = { ...p.deal.N };
      if (p.deal?.E) eastHand = { ...p.deal.E };
      if (p.deal?.S) southHand = { ...p.deal.S };
      if (p.deal?.W) westHand = { ...p.deal.W };
      if (p.declarer) {
        const dummyKey = PARTNER[p.declarer];
        dummySeat = SEAT_NAME[dummyKey];
        showDummy = true;
      }
      if (p.played?.length) tricks = p.played.join('\n');
      response = 'PBN imported successfully. Review the state below and ask for advice.';
    } catch (e) { response = 'Error parsing PBN: ' + e.message; }
  }

  function handleLoadPBNFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      pbnText = ev.target.result;
      handleParsePBN(ev.target.result);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ── Reset ─────────────────────────────────────────────
  function resetAll() {
    northHand = emptyHand(); eastHand = emptyHand(); southHand = emptyHand(); westHand = emptyHand(); auction = [];
    contract = ''; tricks = ''; response = ''; parsedPBNData = null;
    showDummy = false; history = []; pbnText = '';
  }

  // ── Build game state ──────────────────────────────────
  function buildGameState() {
    const deal = { ...(parsedPBNData?.deal || {}) };
    if (handHasCards(northHand)) deal.N = northHand;
    if (handHasCards(eastHand)) deal.E = eastHand;
    if (handHasCards(southHand)) deal.S = southHand;
    if (handHasCards(westHand)) deal.W = westHand;
    let playStart = parsedPBNData?.playStart || '';
    if (!playStart && parsedPBNData?.declarer) {
      const order = ['N', 'E', 'S', 'W'];
      const idx = order.indexOf(parsedPBNData.declarer);
      if (idx >= 0) playStart = order[(idx + 3) % 4]; // LHO leads
    }
    const gs = {
      dealer, vulnerability: vuln, conventionSystem,
      deal,
      auction, auctionStart: SEAT_KEY[dealer], contract,
      played: tricks ? tricks.split('\n').filter(t => t.trim()) : (parsedPBNData?.played || []),
      playStart,
      dummySeat: showDummy ? dummySeat : null,
      declarer: parsedPBNData?.declarer || '',
      result: parsedPBNData?.result || '',
    };
    return gs;
  }

  function cardInHand(hand, card) {
    const suit = card[0];
    const rank = card.slice(1);
    return (hand[suit] || []).includes(rank);
  }

  function usedCardsExcluding(hand) {
    return new Set([...usedCards].filter(c => !cardInHand(hand, c)));
  }

  function handForSeat(seat) {
    switch (seat) {
      case 'North': return northHand;
      case 'East': return eastHand;
      case 'South': return southHand;
      case 'West': return westHand;
      default: return southHand;
    }
  }

  function setHandForSeat(seat, hand) {
    switch (seat) {
      case 'North': northHand = hand; break;
      case 'East': eastHand = hand; break;
      case 'South': southHand = hand; break;
      case 'West': westHand = hand; break;
      default: break;
    }
  }

  function seatLabel(seat) {
    return seat === mySeat ? `${seat} (My Seat)` : seat;
  }

  function safeParsePbn(pbn) {
    try {
      return parsePBN(pbn);
    } catch {
      return null;
    }
  }

  let autoFillBlockedSeat = $state(null);

  function remainingHandExcluding(seat) {
    const hands = {
      North: northHand,
      East: eastHand,
      South: southHand,
      West: westHand,
    };
    const usedOther = getUsedCards(
      ...Object.entries(hands)
        .filter(([s]) => s !== seat)
        .map(([, h]) => h)
    );
    const remaining = { S: [], H: [], D: [], C: [] };
    SUITS.forEach(suit => {
      remaining[suit] = RANKS.filter(rank => !usedOther.has(suit + rank));
    });
    return remaining;
  }

  $effect(() => {
    const counts = {
      North: totalCards(northHand),
      East: totalCards(eastHand),
      South: totalCards(southHand),
      West: totalCards(westHand),
    };
    const seats = ['North', 'East', 'South', 'West'];
    const fullSeats = seats.filter(s => counts[s] >= 13);
    const remainingSeats = seats.filter(s => counts[s] < 13);

    if (fullSeats.length === 3 && remainingSeats.length === 1) {
      const target = remainingSeats[0];
      if (autoFillBlockedSeat === target) return;
      const filled = remainingHandExcluding(target);
      if (totalCards(filled) !== counts[target]) {
        setHandForSeat(target, filled);
      }
    } else if (autoFillBlockedSeat) {
      autoFillBlockedSeat = null;
    }
  });

  // ── Build short summary for history ─────────────────
  function buildHandSummary(gs) {
    const parts = [];
    if (gs.contract) parts.push(gs.contract);
    if (gs.declarer) parts.push(`by ${gs.declarer}`);
    if (gs.vulnerability && gs.vulnerability !== 'None') parts.push(`Vul: ${gs.vulnerability}`);
    const myKey = SEAT_KEY[mySeat] || mySeat[0];
    const myHand = gs.deal?.[myKey];
    if (myHand) {
      const suits = ['S', 'H', 'D', 'C'].map(s => (myHand[s] || []).join('')).join('.');
      parts.push(suits);
    }
    return parts.join(' | ');
  }

  // ── Get Advice ────────────────────────────────────────
  async function handleGetAdvice() {
    const gs = buildGameState();
    const prompt = buildPrompt(gs, adviceType, mySeat);
    if (showPromptPreview) { response = 'PROMPT PREVIEW:\n\n' + prompt; return; }
    loading = true; response = '';
    try {
      const handContext = {
        adviceType, contract: gs.contract || '', dealer: gs.dealer || '',
        vulnerability: gs.vulnerability || '', mySeat, declarer: gs.declarer || '',
        handSummary: buildHandSummary(gs),
      };
      const pbn = generatePBN({
        dealer: SEAT_KEY[gs.dealer] || gs.dealer,
        vulnerability: gs.vulnerability,
        deal: gs.deal,
        auction: gs.auction,
        auctionStart: gs.auctionStart,
        contract: gs.contract,
        played: gs.played,
      });
      handContext.pbn = pbn;
      const result = await getAdvice(prompt, { handContext });
      response = result.text;
      history = [...history, { type: adviceType, response: result.text }];
    } catch (err) { response = 'Error: ' + err.message; }
    loading = false;
  }

  // ── Export PBN ────────────────────────────────────────
  function handleExportPBN() {
    const gs = buildGameState();
    const pbn = generatePBN({
      dealer: SEAT_KEY[gs.dealer] || gs.dealer, vulnerability: gs.vulnerability,
      deal: gs.deal, auction: gs.auction, auctionStart: gs.auctionStart,
      contract: gs.contract, played: gs.played,
    });
    navigator.clipboard.writeText(pbn)
      .then(() => { response = 'PBN copied to clipboard!'; })
      .catch(() => { response = 'PBN generated:\n\n' + pbn; });
  }
</script>

<svelte:head>
  <title>The Stayman Whisperer</title>
</svelte:head>

<!-- Server status -->
<div class="status-bar">
  {#if serverOk === true}<span class="status-ok">● Server connected</span>
  {:else if serverOk === false}<span class="status-err">● Server offline — start with <code>npm run dev</code></span>
  {:else}<span class="status-wait">● Checking server...</span>
  {/if}
</div>

<!-- Tabs -->
<div class="tabs">
  <button class="tab" class:active={tab === 'manual'} onclick={() => tab = 'manual'}>Manual Input</button>
  <button class="tab" class:active={tab === 'pbn'} onclick={() => tab = 'pbn'}>Paste PBN</button>
  {#if history.length > 0}
    <button class="tab" class:active={tab === 'history'} onclick={() => tab = 'history'}>This Hand ({history.length})</button>
  {/if}
  <button class="tab" class:active={tab === 'saved'} onclick={() => { tab = 'saved'; if (!savedHistory) loadSavedHistory(); }}>Explore Hand History</button>
</div>

<!-- PBN Tab -->
{#if tab === 'pbn'}
  <section class="section">
    <h2 class="s-title">Import from Trickster Cards</h2>
    <p class="help">
      In Trickster Cards, enable <b>"Review last deal"</b> in game rules.
      After a hand: menu → <b>Current Game</b> → <b>Export Hand to PBN</b>. Paste below or load a .pbn file.
    </p>
    <div class="pbn-load-row">
      <label class="btn secondary file-btn">
        Load PBN File
        <input type="file" accept=".pbn,.txt" style="display:none" onchange={handleLoadPBNFile} />
      </label>
      <span class="pbn-or">or paste below</span>
    </div>
    <textarea class="textarea" bind:value={pbnText}
      placeholder={'[Event "..."]\n[Dealer "S"]\n[Vulnerable "None"]\n[Deal "N:AKQ2.J93.T87.A65 ..."]\n[Auction "S"]\n1NT Pass 3NT Pass Pass Pass'}
    ></textarea>
    <div class="row" style="margin-top: 10px">
      <label class="field-label">My seat:
        <select class="select" bind:value={mySeat}>
          {#each SEATS as s}<option value={s}>{s}</option>{/each}
        </select>
      </label>
      <button class="btn primary" onclick={handleParsePBN}>Import PBN</button>
    </div>
  </section>
{/if}

<!-- History Tab -->
{#if tab === 'history'}
  <section class="section">
    <h2 class="s-title">Advice History (This Hand)</h2>
    {#if currentState?.deal}
      <div class="row" style="margin-bottom: 10px">
        <HandDisplay hand={currentState.deal?.N} label="North" />
        <HandDisplay hand={currentState.deal?.E} label="East" />
        <HandDisplay hand={currentState.deal?.S} label="South" />
        <HandDisplay hand={currentState.deal?.W} label="West" />
      </div>
    {/if}
    {#if currentState?.auction?.length}
      <div style="margin-bottom: 10px">
        <div class="mini-label">Auction:</div>
        <AuctionDisplay auction={currentState.auction} dealerSeat={currentState.dealer || 'South'} />
      </div>
    {/if}
    {#each history as item, i}
      <div class="history-item">
        <div class="history-label">{item.type} advice #{i + 1}</div>
        <div class="history-text"><MarkdownResponse text={item.response} /></div>
      </div>
    {/each}
  </section>
{/if}

<!-- Explore Hand History Tab (formerly Past Sessions) -->
{#if tab === 'saved'}
  <section class="section">
    <div class="section-header" style="margin-bottom: 12px">
      <h2 class="s-title">Explore Hand History</h2>
      <div class="row">
        <button class="btn sm" onclick={loadSavedHistory}>Refresh</button>
      </div>
    </div>
    <div style="color: #4a5a6a; font-size: 12px; margin-bottom: 8px;">
      Showing sessions from all users.
    </div>

    {#if savedLoading}
      <div style="color: #6a8a6a; font-size: 13px">Loading...</div>
    {/if}

    {#if savedHistory && !savedLoading && savedHistory.entries?.length === 0}
      <div style="color: #445; font-size: 13px; font-style: italic">
        No saved sessions yet. Advice you request will be automatically saved here.
      </div>
    {/if}

    {#if savedHistory?.entries}
      {#each savedHistory.entries as entry (entry.id)}
        <div class="saved-entry">
          <div class="saved-summary-row">
            <button class="saved-summary" onclick={() => savedExpanded = savedExpanded === entry.id ? null : entry.id}>
              <div class="saved-left">
                <span class="saved-type" class:analyze={entry.adviceType === 'analyze'}
                  class:bid={entry.adviceType === 'bid'}>{entry.adviceType}</span>
                {#if entry.contract}<span class="saved-contract">{entry.contract}</span>{/if}
                {#if entry.handSummary}<span class="saved-hand">{entry.handSummary.split('|').pop()?.trim()}</span>{/if}
              </div>
              <div class="saved-right">
                <span class="saved-date">
                  {new Date(entry.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  {' '}
                  {new Date(entry.timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </span>
                <span class="saved-arrow">{savedExpanded === entry.id ? '▾' : '▸'}</span>
              </div>
            </button>
            {#if sharedTokens[entry.id]}
              <button
                class="share-btn unshare"
                class:revoked={shareStatus[entry.id] === 'revoked'}
                class:error={shareStatus[entry.id] === 'error'}
                onclick={(e) => { e.stopPropagation(); handleUnshare(entry.id); }}
                title="Revoke shared link"
              >
                {#if shareStatus[entry.id] === 'revoking'}⏳
                {:else if shareStatus[entry.id] === 'revoked'}✓ Unshared
                {:else if shareStatus[entry.id] === 'error'}✗ Error
                {:else}✕ Unshare{/if}
              </button>
            {:else}
              <button
                class="share-btn"
                class:copied={shareStatus[entry.id] === 'copied'}
                class:error={shareStatus[entry.id] === 'error'}
                onclick={(e) => { e.stopPropagation(); handleShare(entry.id); }}
                title="Copy shareable link"
              >
                {#if shareStatus[entry.id] === 'copying'}⏳
                {:else if shareStatus[entry.id] === 'copied'}✓ Copied!
                {:else if shareStatus[entry.id] === 'error'}✗ Error
                {:else}🔗 Share{/if}
              </button>
            {/if}
          </div>

          {#if savedExpanded === entry.id}
            <div class="saved-details">
              {#if entry.parsedPbn}
                <div class="saved-pbn">
                  <div class="row">
                    <HandDisplay hand={entry.parsedPbn.deal?.N} label="North" />
                    <HandDisplay hand={entry.parsedPbn.deal?.E} label="East" />
                    <HandDisplay hand={entry.parsedPbn.deal?.S} label="South" />
                    <HandDisplay hand={entry.parsedPbn.deal?.W} label="West" />
                  </div>
                  {#if entry.parsedPbn.auction?.length}
                    <div style="margin-top: 10px">
                      <div class="mini-label">Auction:</div>
                      <AuctionDisplay auction={entry.parsedPbn.auction} dealerSeat={SEAT_NAME[entry.parsedPbn.dealer] || 'South'} />
                    </div>
                  {/if}
                </div>
              {/if}
              <div class="saved-meta">
                {#if entry.userName || entry.userEmail}
                  <span>User: {entry.userName || entry.userEmail}</span>
                {/if}
                {#if entry.mySeat}<span>Seat: {entry.mySeat}</span>{/if}
                {#if entry.vulnerability}<span>Vul: {entry.vulnerability}</span>{/if}
                {#if entry.declarer}<span>Declarer: {entry.declarer}</span>{/if}
                {#if entry.model}<span>Model: {entry.model}</span>{/if}
              </div>
              <MarkdownResponse text={entry.response} />
            </div>
          {/if}
        </div>
      {/each}
    {/if}

    {#if savedHistory?.hasMore}
      <button class="btn" style="width: 100%; text-align: center" onclick={async () => {
        const more = await getHistory({ limit: 50, offset: savedHistory.entries.length, scope: 'all' });
        if (more?.entries) {
          more.entries = more.entries.map(e => ({
            ...e,
            parsedPbn: e.pbn ? safeParsePbn(e.pbn) : null,
          }));
          seedSharedTokens(more.entries);
        }
        savedHistory = {
          ...savedHistory,
          entries: [...savedHistory.entries, ...more.entries],
          hasMore: more.hasMore,
        };
      }}>Load More</button>
    {/if}
  </section>
{/if}

<!-- Manual Tab -->
{#if tab === 'manual'}
  <!-- Game Settings -->
  <section class="section">
    <h2 class="s-title">Game Settings</h2>
    <div class="row">
      <label class="field-label">My Seat
        <select class="select" bind:value={mySeat}>{#each SEATS as s}<option>{s}</option>{/each}</select>
      </label>
      <label class="field-label">Dealer
        <select class="select" bind:value={dealer}>{#each SEATS as s}<option>{s}</option>{/each}</select>
      </label>
      <label class="field-label">Vulnerability
        <select class="select" bind:value={vuln}>{#each VULNERABILITIES as v}<option>{v}</option>{/each}</select>
      </label>
      <label class="field-label">Convention
        <select class="select" bind:value={conventionSystem}><option>SAYC</option><option>2/1 Game Forcing</option></select>
      </label>
    </div>
  </section>

  <!-- Hands -->
  <section class="section">
    <div class="section-header">
      <h2 class="s-title">Hands</h2>
      <div class="row">
        <label class="field-label">Dummy
          <select class="select" bind:value={dummySeat}>
            {#each SEATS as s}<option value={s}>{s}</option>{/each}
          </select>
        </label>
        <button class="btn" onclick={() => showDummy = !showDummy}>
          {showDummy ? 'Hide Dummy' : 'Show Dummy'}
        </button>
      </div>
    </div>
    <div style="color: #6a8a6a; font-size: 12px; margin-bottom: 8px;">
      Cards already selected in another hand are disabled.
    </div>
    <div class="hand-grid">
      <HandEditor bind:hand={northHand} usedCards={usedCardsExcluding(northHand)} label={seatLabel('North')}
        onChange={() => { autoFillBlockedSeat = 'North'; }} />
      <HandEditor bind:hand={eastHand} usedCards={usedCardsExcluding(eastHand)} label={seatLabel('East')}
        onChange={() => { autoFillBlockedSeat = 'East'; }} />
      <HandEditor bind:hand={southHand} usedCards={usedCardsExcluding(southHand)} label={seatLabel('South')}
        onChange={() => { autoFillBlockedSeat = 'South'; }} />
      <HandEditor bind:hand={westHand} usedCards={usedCardsExcluding(westHand)} label={seatLabel('West')}
        onChange={() => { autoFillBlockedSeat = 'West'; }} />
    </div>
  </section>

  <!-- Auction -->
  <section class="section">
    <h2 class="s-title">Auction</h2>
    <div style="margin-bottom: 12px">
      <AuctionDisplay {auction} dealerSeat={dealer} />
    </div>
    <BiddingBox onbid={b => { auction = [...auction, b]; }} {auction} />
    {#if auction.length > 0}
      <div class="row" style="margin-top: 8px">
        <button class="btn sm" onclick={() => { auction = auction.slice(0, -1); }}>Undo Last Bid</button>
        <button class="btn sm" onclick={() => { auction = []; }}>Clear Auction</button>
      </div>
    {/if}
  </section>

  <!-- Play Phase -->
  <section class="section">
    <h2 class="s-title">Play Phase (Optional)</h2>
    <div class="row" style="margin-bottom: 10px">
      <label class="field-label">Contract
        <input class="select" style="width: 90px" bind:value={contract} placeholder="e.g. 3NT" />
      </label>
    </div>
    <label class="field-label" style="display: block; margin-bottom: 4px">Tricks played (one per line, e.g. "H4 HA H3 H7")</label>
    <textarea class="textarea short" bind:value={tricks} placeholder={'S4 SA S3 S7\nHK H2 H5 HQ'}></textarea>
  </section>
{/if}

<!-- State Summary -->
{#if hasState && tab !== 'saved'}
  <section class="section">
    <div class="section-header">
      <h2 class="s-title">Current State</h2>
      <button class="btn sm" onclick={handleExportPBN}>Export PBN</button>
    </div>
    <div class="row">
      <HandDisplay hand={handForSeat(mySeat)} label="My Hand ({mySeat})" />
      {#if showDummy}
        <HandDisplay hand={handForSeat(dummySeat)} label="Dummy ({dummySeat})" />
      {/if}
    </div>
    {#if auction.length > 0}
      <div style="margin-top: 10px">
        <div class="mini-label">Auction:</div>
        <div class="row" style="gap: 4px">
          {#each auction as bid}<BidChip {bid} />{/each}
        </div>
      </div>
    {/if}
    {#if contract}
      <div class="contract-line">Contract: <b>{contract}</b></div>
    {/if}
  </section>
{/if}

<!-- Advice Request -->
{#if tab !== 'saved'}
  <section class="section">
    <h2 class="s-title">Ask for Advice</h2>
    <div class="row" style="margin-bottom: 12px">
      {#each adviceTypes as [key, label]}
        <button class="advice-btn" class:active={adviceType === key}
          onclick={() => adviceType = key}>{label}</button>
      {/each}
    </div>
    <div class="row">
      <button class="btn primary lg" onclick={handleGetAdvice} disabled={loading || !canGetAdvice}>
        {loading ? 'Thinking...' : 'Get Advice'}
      </button>
      <button class="btn" onclick={() => showPromptPreview = !showPromptPreview}>
        {showPromptPreview ? 'Live Mode' : 'Preview Prompt'}
      </button>
      <button class="btn" onclick={resetAll}>Reset All</button>
    </div>
    {#if !canGetAdvice}
      <div class="preview-note">Import a PBN or complete all four hands (52 cards) to request advice.</div>
    {/if}
    {#if showPromptPreview}
      <div class="preview-note">Preview mode: shows the prompt instead of asking The Stayman Whisperer</div>
    {/if}
  </section>
{/if}

<!-- Response -->
{#if (response || loading) && tab !== 'saved'}
  <div class="response-box">
    <div class="response-label">{loading ? 'Analyzing...' : "The Stayman Whisperer"}</div>
    {#if loading}
      <div class="loading-text"><span class="pulse">♠</span> Thinking through the hand...</div>
    {:else}
      <MarkdownResponse text={response} />
    {/if}
  </div>
{/if}

<style>
  .status-bar { text-align: right; font-size: 11px; margin-bottom: 8px; }
  .status-ok { color: #44aa99; }
  .status-err { color: #e66; }
  .status-wait { color: #666; }

  .tabs { display: flex; gap: 0; margin-bottom: 14px; border-bottom: 1px solid #1a2430; }
  .tab {
    padding: 9px 20px; background: transparent; color: #4a5a6a; border: none;
    border-bottom: 2px solid transparent; cursor: pointer; font-size: 13px; font-weight: 600;
  }
  .tab.active { background: #101820; color: #d4af37; border-bottom-color: #d4af37; }

  .section {
    background: #0c1219; border-radius: 10px; border: 1px solid #1a2430;
    padding: 16px; margin-bottom: 14px;
  }
  .section-header { display: flex; justify-content: space-between; align-items: center; }
  .s-title {
    font-size: 11px; color: #5a6a7a; letter-spacing: 1.5px;
    text-transform: uppercase; font-weight: 700; margin-bottom: 10px;
  }

  .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }

  .select {
    background: #101820; color: #c0d0e0; border: 1px solid #1a2a3a;
    border-radius: 6px; padding: 7px 10px; font-size: 13px; outline: none;
  }
  .textarea {
    width: 100%; background: #060a10; color: #8bdb6a; border: 1px solid #1a2a1a;
    border-radius: 8px; padding: 12px; font-size: 12px; font-family: 'Courier New', monospace;
    min-height: 100px; resize: vertical; outline: none;
  }
  .textarea.short { min-height: 60px; }
  .pbn-load-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .pbn-or { font-size: 12px; color: #4a5a6a; }
  .file-btn { cursor: pointer; }

  .field-label { font-size: 13px; color: #6a7a8a; display: flex; align-items: center; gap: 6px; }
  .mini-label { font-size: 11px; color: #5a6a7a; margin-bottom: 4px; }
  .help { font-size: 12px; color: #5a6a7a; margin-bottom: 10px; line-height: 1.6; }

  .btn {
    padding: 8px 16px; border-radius: 7px; border: 1px solid #1a2a3a;
    font-weight: 700; font-size: 13px; cursor: pointer; background: #101820; color: #8a9aaa;
  }
  .btn.primary { background: linear-gradient(135deg, #d4af37, #a08520); color: #0a0a10; border: none; }
  .btn.lg { padding: 12px 28px; font-size: 15px; }
  .btn.sm { font-size: 12px; padding: 6px 12px; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .advice-btn {
    padding: 8px 16px; border-radius: 7px; font-size: 13px; font-weight: 600;
    cursor: pointer; background: #101820; color: #5a6a7a; border: 1px solid #1a2430;
  }
  .advice-btn.active { background: #1a2a1a; color: #8bdb6a; border-color: #2a4a2a; }

  .preview-note { font-size: 11px; color: #6a7a4a; margin-top: 6px; }
  .contract-line { margin-top: 8px; font-size: 13px; color: #aab; }
  .contract-line b { color: #d4af37; }

  .response-box {
    background: #0a120a; border-radius: 10px; border: 1px solid #1a2a1a;
    padding: 20px; margin-bottom: 20px; animation: fadeIn 0.3s ease;
  }
  .response-label {
    font-size: 11px; color: #4a6a4a; letter-spacing: 1.5px;
    text-transform: uppercase; font-weight: 700; margin-bottom: 10px;
  }
  .loading-text { color: #6a8a6a; font-size: 14px; }
  .pulse { animation: pulse 1.5s infinite; display: inline-block; }
  .response-text { color: #b0d0b0; font-size: 14px; line-height: 1.8; white-space: pre-wrap; }

  .history-item {
    background: #0a120a; border-radius: 8px; border: 1px solid #1a2a1a;
    padding: 12px; margin-bottom: 10px;
  }
  .history-label { font-size: 11px; color: #6a8a6a; margin-bottom: 6px; text-transform: uppercase; font-weight: 600; }
  .history-text { color: #b0d0b0; font-size: 13px; line-height: 1.7; }

  .saved-entry { background: #0a120a; border-radius: 8px; border: 1px solid #1a2a1a; margin-bottom: 8px; overflow: hidden; }
  .saved-summary-row { display: flex; align-items: center; }
  .saved-summary {
    flex: 1; padding: 10px 14px; cursor: pointer; display: flex;
    justify-content: space-between; align-items: center;
    background: transparent; border: none; color: inherit; text-align: left;
  }
  .share-btn {
    flex-shrink: 0; margin: 6px 10px 6px 0;
    padding: 4px 10px; font-size: 11px; border-radius: 5px; cursor: pointer;
    background: #0d1a1a; border: 1px solid #1a3a3a; color: #6a9aaa;
    white-space: nowrap; transition: background 0.15s, color 0.15s;
  }
  .share-btn:hover { background: #112525; color: #8abccc; }
  .share-btn.copied { background: #0d1f0d; border-color: #1a3a1a; color: #8bdb6a; }
  .share-btn.error { background: #1f0d0d; border-color: #3a1a1a; color: #e66; }
  .share-btn.unshare { background: #1a1010; border-color: #3a2020; color: #a87a6a; }
  .share-btn.unshare:hover { background: #251515; color: #c89a8a; }
  .share-btn.unshare.revoked { background: #0d1f0d; border-color: #1a3a1a; color: #8bdb6a; }
  .saved-left { display: flex; align-items: center; gap: 8px; }
  .saved-type {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    background: #1a2020; color: #d4af37;
  }
  .saved-type.analyze { background: #1a1a2a; color: #aac; }
  .saved-type.bid { background: #1a2a1a; color: #8bdb6a; }
  .saved-contract { color: #d4af37; font-weight: 700; }
  .saved-hand { color: #6a7a8a; font-size: 12px; font-family: monospace; }
  .saved-right { display: flex; align-items: center; gap: 10px; }
  .saved-date { color: #4a5a6a; font-size: 11px; }
  .saved-arrow { color: #4a5a6a; font-size: 14px; }
  .saved-details { padding: 0 14px 14px; border-top: 1px solid #1a2a1a; }
  .saved-meta { display: flex; gap: 12px; flex-wrap: wrap; margin: 10px 0; font-size: 12px; color: #5a6a7a; }
  .btn.danger { color: #e66; border-color: #3a1a1a; }
  .hand-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
  .saved-pbn { margin: 6px 0 10px; }
</style>
