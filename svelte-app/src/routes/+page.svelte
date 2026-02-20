<script>
  import { onMount } from 'svelte';
  import {
    SEATS, SEAT_KEY, SEAT_NAME, PARTNER, VULNERABILITIES,
    emptyHand, getUsedCards, handHasCards
  } from '$lib/bridge/constants.js';
  import { parsePBN, generatePBN } from '$lib/bridge/pbn.js';
  import { buildPrompt } from '$lib/bridge/prompt.js';
  import { getAdvice, healthCheck } from '$lib/api.js';
  import HandEditor from '$lib/components/HandEditor.svelte';
  import HandDisplay from '$lib/components/HandDisplay.svelte';
  import BiddingBox from '$lib/components/BiddingBox.svelte';
  import AuctionDisplay from '$lib/components/AuctionDisplay.svelte';
  import BidChip from '$lib/components/BidChip.svelte';
  import MarkdownResponse from '$lib/components/MarkdownResponse.svelte';

  // ── State ─────────────────────────────────────────────
  let tab = $state('manual');
  let pbnText = $state('');
  let mySeat = $state('South');
  let dealer = $state('South');
  let vuln = $state('None');
  let conventionSystem = $state('SAYC');
  let myHand = $state(emptyHand());
  let dummyHand = $state(emptyHand());
  let showDummy = $state(false);
  let dummySeat = $state('North');
  let auction = $state([]);
  let contract = $state('');
  let tricks = $state('');
  let adviceType = $state('bid');
  let response = $state('');
  let loading = $state(false);
  let parsedPBNData = $state(null);
  let showPromptPreview = $state(false);
  let serverOk = $state(null);
  let history = $state([]);

  // ── Derived ───────────────────────────────────────────
  let usedCards = $derived(getUsedCards(myHand, dummyHand));
  let myUsedCards = $derived(
    new Set([...usedCards].filter(c => !(myHand[c[0]] || []).includes(c.slice(1))))
  );
  let dummyUsedCards = $derived(
    new Set([...usedCards].filter(c => !(dummyHand[c[0]] || []).includes(c.slice(1))))
  );
  let hasState = $derived(handHasCards(myHand) || parsedPBNData !== null);
  let otherSeats = $derived(SEATS.filter(s => s !== mySeat));

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
  function handleParsePBN() {
    try {
      const p = parsePBN(pbnText);
      parsedPBNData = p;
      if (p.dealer) dealer = SEAT_NAME[p.dealer] || 'South';
      if (p.vulnerability) vuln = p.vulnerability;
      if (p.auction?.length) auction = [...p.auction];
      if (p.contract) contract = p.contract;
      const sk = SEAT_KEY[mySeat];
      if (p.deal[sk]) myHand = { ...p.deal[sk] };
      if (p.declarer) {
        const dummyKey = PARTNER[p.declarer];
        dummySeat = SEAT_NAME[dummyKey];
        if (p.deal[dummyKey]) { dummyHand = { ...p.deal[dummyKey] }; showDummy = true; }
      }
      if (p.played?.length) tricks = p.played.join('\n');
      response = 'PBN imported successfully. Review the state below and ask for advice.';
    } catch (e) { response = 'Error parsing PBN: ' + e.message; }
  }

  // ── Reset ─────────────────────────────────────────────
  function resetAll() {
    myHand = emptyHand(); dummyHand = emptyHand(); auction = [];
    contract = ''; tricks = ''; response = ''; parsedPBNData = null;
    showDummy = false; history = []; pbnText = '';
  }

  // ── Build game state ──────────────────────────────────
  function buildGameState() {
    const gs = {
      dealer, vulnerability: vuln, conventionSystem,
      deal: { ...(parsedPBNData?.deal || {}), [SEAT_KEY[mySeat]]: myHand },
      auction, auctionStart: SEAT_KEY[dealer], contract,
      played: tricks ? tricks.split('\n').filter(t => t.trim()) : (parsedPBNData?.played || []),
      dummySeat: showDummy ? dummySeat : null,
      declarer: parsedPBNData?.declarer || '',
      result: parsedPBNData?.result || '',
    };
    if (showDummy) gs.deal[SEAT_KEY[dummySeat]] = dummyHand;
    return gs;
  }

  // ── Get Advice ────────────────────────────────────────
  async function handleGetAdvice() {
    const gs = buildGameState();
    const prompt = buildPrompt(gs, adviceType, mySeat);
    if (showPromptPreview) { response = 'PROMPT PREVIEW:\n\n' + prompt; return; }
    loading = true; response = '';
    try {
      const result = await getAdvice(prompt);
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
    <button class="tab" class:active={tab === 'history'} onclick={() => tab = 'history'}>History ({history.length})</button>
  {/if}
</div>

<!-- PBN Tab -->
{#if tab === 'pbn'}
  <section class="section">
    <h2 class="s-title">Import from Trickster Cards</h2>
    <p class="help">
      In Trickster Cards, enable <b>"Review last deal"</b> in game rules.
      After a hand: menu → <b>Current Game</b> → <b>Export Hand to PBN</b>. Paste below.
    </p>
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
    {#each history as item, i}
      <div class="history-item">
        <div class="history-label">{item.type} advice #{i + 1}</div>
        <div class="history-text"><MarkdownResponse text={item.response} /></div>
      </div>
    {/each}
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

  <!-- My Hand -->
  <section class="section">
    <h2 class="s-title">My Hand</h2>
    <HandEditor bind:hand={myHand} usedCards={myUsedCards} label="Select your cards" />
  </section>

  <!-- Dummy -->
  <section class="section">
    <div class="section-header">
      <h2 class="s-title">Dummy</h2>
      <div class="row">
        {#if showDummy}
          <select class="select" bind:value={dummySeat}>
            {#each otherSeats as s}<option>{s}</option>{/each}
          </select>
        {/if}
        <button class="btn" onclick={() => showDummy = !showDummy}>
          {showDummy ? 'Hide Dummy' : 'Show Dummy'}
        </button>
      </div>
    </div>
    {#if showDummy}
      <div style="margin-top: 10px">
        <HandEditor bind:hand={dummyHand} usedCards={dummyUsedCards} label="Select dummy's cards" />
      </div>
    {/if}
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
{#if hasState}
  <section class="section">
    <div class="section-header">
      <h2 class="s-title">Current State</h2>
      <button class="btn sm" onclick={handleExportPBN}>Export PBN</button>
    </div>
    <div class="row">
      <HandDisplay hand={myHand} label="My Hand ({mySeat})" />
      {#if showDummy}
        <HandDisplay hand={dummyHand} label="Dummy ({dummySeat})" />
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
<section class="section">
  <h2 class="s-title">Ask for Advice</h2>
  <div class="row" style="margin-bottom: 12px">
    {#each adviceTypes as [key, label]}
      <button class="advice-btn" class:active={adviceType === key}
        onclick={() => adviceType = key}>{label}</button>
    {/each}
  </div>
  <div class="row">
    <button class="btn primary lg" onclick={handleGetAdvice} disabled={loading}>
      {loading ? 'Thinking...' : 'Get Advice'}
    </button>
    <button class="btn" onclick={() => showPromptPreview = !showPromptPreview}>
      {showPromptPreview ? 'Live Mode' : 'Preview Prompt'}
    </button>
    <button class="btn" onclick={resetAll}>Reset All</button>
  </div>
  {#if showPromptPreview}
    <div class="preview-note">Preview mode: shows the prompt instead of asking The Stayman Whisperer</div>
  {/if}
</section>

<!-- Response -->
{#if response || loading}
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
  .history-text { color: #b0d0b0; font-size: 13px; line-height: 1.7; white-space: pre-wrap; }
</style>
