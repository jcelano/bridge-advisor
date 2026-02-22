<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { getSharedEntry } from '$lib/api.js';
  import { parsePBN } from '$lib/bridge/pbn.js';
  import { SEAT_NAME } from '$lib/bridge/constants.js';
  import HandDisplay from '$lib/components/HandDisplay.svelte';
  import AuctionDisplay from '$lib/components/AuctionDisplay.svelte';
  import MarkdownResponse from '$lib/components/MarkdownResponse.svelte';
  import PlayRecord from '$lib/components/PlayRecord.svelte';

  let entry = $state(null);
  let loading = $state(true);
  let notFound = $state(false);
  let showPlay = $state(false);

  function safeParsePbn(pbn) {
    try { return pbn ? parsePBN(pbn) : null; } catch { return null; }
  }

  onMount(async () => {
    const token = $page.params.token;
    const result = await getSharedEntry(token);
    if (!result) { notFound = true; }
    else {
      entry = { ...result, parsedPbn: safeParsePbn(result.pbn) };
    }
    loading = false;
  });
</script>

<div class="share-page">
  <header class="share-header">
    <a href="/" class="share-logo">
      <span class="logo-spade">♠</span>
      <div>
        <div class="logo-title">The Stayman Whisperer</div>
        <div class="logo-sub">Your AI bridge partner</div>
      </div>
    </a>
  </header>

  <main class="share-main">
    {#if loading}
      <div class="share-status">Loading…</div>

    {:else if notFound}
      <div class="share-status not-found">
        <div style="font-size: 32px; margin-bottom: 12px">♠</div>
        <div>This shared hand could not be found.</div>
        <div style="margin-top: 8px; font-size: 12px; color: #4a5a6a">The link may have expired or been removed.</div>
        <a href="/" class="back-link">← Open The Stayman Whisperer</a>
      </div>

    {:else if entry}
      <div class="share-card">
        <!-- Header row -->
        <div class="share-card-header">
          <div class="share-tags">
            <span class="tag type-tag" class:analyze={entry.adviceType === 'analyze'} class:bid={entry.adviceType === 'bid'}>
              {entry.adviceType}
            </span>
            {#if entry.contract}<span class="tag contract-tag">{entry.contract}</span>{/if}
            {#if entry.vulnerability && entry.vulnerability !== 'None'}<span class="tag vul-tag">Vul: {entry.vulnerability}</span>{/if}
          </div>
          <div class="share-meta">
            {#if entry.userName}<span>Shared by {entry.userName}</span>{/if}
            <span>{new Date(entry.timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
          </div>
        </div>

        <!-- Hands -->
        {#if entry.parsedPbn?.deal}
          <div class="share-hands">
            <HandDisplay hand={entry.parsedPbn.deal.N} label="North" />
            <HandDisplay hand={entry.parsedPbn.deal.E} label="East" />
            <HandDisplay hand={entry.parsedPbn.deal.S} label="South" />
            <HandDisplay hand={entry.parsedPbn.deal.W} label="West" />
          </div>
        {/if}

        <!-- Auction -->
        {#if entry.parsedPbn?.auction?.length}
          <div class="share-auction">
            <div class="section-label">Auction</div>
            <AuctionDisplay
              auction={entry.parsedPbn.auction}
              dealerSeat={SEAT_NAME[entry.parsedPbn.dealer] || entry.dealer || 'South'}
            />
          </div>
        {/if}

        <!-- Play Record -->
        {#if entry.parsedPbn?.played?.length}
          <div class="share-play">
            <button class="play-toggle" onclick={() => showPlay = !showPlay}>
              {showPlay ? '▾ Hide Play Record' : '▸ Show Play Record'}
            </button>
            {#if showPlay}
              <PlayRecord
                played={entry.parsedPbn.played}
                playStart={entry.parsedPbn.playStart}
                contract={entry.contract}
                declarer={entry.parsedPbn.declarer}
              />
            {/if}
          </div>
        {/if}

        <!-- Analysis -->
        <div class="share-analysis">
          <div class="section-label">AI Analysis</div>
          <MarkdownResponse text={entry.response} />
        </div>

        <!-- CTA -->
        <div class="share-cta">
          <a href="/" class="cta-btn">Analyze your own hands →</a>
        </div>
      </div>
    {/if}
  </main>

  <footer class="share-footer">
    © 2026 The Stayman Whisperer · <a href="https://www.trickstercards.com" target="_blank" rel="noopener noreferrer">Trickster Cards</a>
  </footer>
</div>

<style>
  .share-page {
    min-height: 100vh;
    background: #0c1219;
    display: flex;
    flex-direction: column;
    font-family: system-ui, sans-serif;
    color: #b0c0b0;
  }

  .share-header {
    background: linear-gradient(135deg, #0d2214, #0a1a10);
    border-bottom: 1px solid #1a3a2a;
    padding: 16px 24px;
  }
  .share-logo { display: flex; align-items: center; gap: 14px; text-decoration: none; }
  .logo-spade { font-size: 28px; color: #d4af37; }
  .logo-title { font-size: 18px; font-weight: 700; color: #d4af37; }
  .logo-sub { font-size: 11px; color: #4a6a4a; }

  .share-main {
    flex: 1;
    max-width: 860px;
    margin: 0 auto;
    width: 100%;
    padding: 24px 16px;
  }

  .share-status {
    text-align: center;
    padding: 60px 20px;
    color: #4a6a4a;
    font-size: 14px;
  }
  .share-status.not-found { color: #6a5a4a; }
  .back-link {
    display: inline-block;
    margin-top: 20px;
    color: #d4af37;
    text-decoration: none;
    font-size: 13px;
  }
  .back-link:hover { text-decoration: underline; }

  .share-card {
    background: #0a1510;
    border: 1px solid #1a2a1a;
    border-radius: 12px;
    overflow: hidden;
  }

  .share-card-header {
    padding: 14px 18px;
    border-bottom: 1px solid #1a2a1a;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .share-tags { display: flex; align-items: center; gap: 8px; }
  .tag {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .type-tag { background: #1a2020; color: #d4af37; }
  .type-tag.analyze { background: #1a1a2a; color: #aac; }
  .type-tag.bid { background: #1a2a1a; color: #8bdb6a; }
  .contract-tag { background: #1a1a10; color: #d4af37; font-size: 13px; font-weight: 700; text-transform: none; }
  .vul-tag { background: #2a1a1a; color: #c88; font-size: 11px; }

  .share-meta {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: #4a5a6a;
  }

  .share-hands {
    padding: 16px 18px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    border-bottom: 1px solid #1a2a1a;
  }

  .share-auction {
    padding: 14px 18px;
    border-bottom: 1px solid #1a2a1a;
  }

  .share-play {
    padding: 10px 18px 14px;
    border-bottom: 1px solid #1a2a1a;
  }
  .play-toggle {
    background: #0d1820; border: 1px solid #1a2a3a; color: #6a8aaa;
    padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;
    font-family: monospace; margin-bottom: 6px;
  }
  .play-toggle:hover { background: #112030; color: #8aaac8; }

  .share-analysis {
    padding: 16px 18px;
  }

  .section-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #4a6a4a;
    margin-bottom: 10px;
    font-weight: 600;
  }

  .share-cta {
    padding: 16px 18px;
    border-top: 1px solid #1a2a1a;
    text-align: center;
  }
  .cta-btn {
    display: inline-block;
    padding: 9px 20px;
    background: #d4af37;
    color: #0c1219;
    border-radius: 7px;
    font-weight: 700;
    font-size: 13px;
    text-decoration: none;
  }
  .cta-btn:hover { background: #e0c050; }

  .share-footer {
    text-align: center;
    color: #2a3a4a;
    font-size: 11px;
    padding: 20px 0;
  }
  .share-footer a { color: #4a6a8a; text-decoration: none; }
  .share-footer a:hover { text-decoration: underline; }
</style>
