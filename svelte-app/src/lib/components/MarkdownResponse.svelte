<script>
  import { renderMarkdown } from '$lib/markdown.js';
  let { text } = $props();
  let html = $derived(renderMarkdown(text));
</script>

<div class="md-response">{@html html}</div>

<style>
  .md-response :global(h1),
  .md-response :global(h2),
  .md-response :global(h3),
  .md-response :global(h4) {
    color: #d4af37;
    margin: 16px 0 8px 0;
    font-weight: 700;
  }
  .md-response :global(h1) { font-size: 18px; }
  .md-response :global(h2) { font-size: 16px; }
  .md-response :global(h3) { font-size: 14px; color: #b8d4b0; }
  .md-response :global(h4) { font-size: 13px; color: #8aaa82; }

  .md-response :global(p) {
    color: #b0d0b0;
    font-size: 14px;
    line-height: 1.8;
    margin: 0 0 10px 0;
  }

  .md-response :global(strong) { color: #d0e8c8; font-weight: 700; }
  .md-response :global(em) { color: #a0c898; font-style: italic; }

  .md-response :global(ul),
  .md-response :global(ol) {
    margin: 8px 0 12px 0;
    padding-left: 24px;
  }

  .md-response :global(li) {
    color: #b0d0b0;
    font-size: 14px;
    line-height: 1.7;
    margin-bottom: 4px;
  }

  .md-response :global(li::marker) { color: #4a8a4a; }

  .md-response :global(code) {
    background: #0d1a0d;
    color: #8bdb6a;
    padding: 1px 5px;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
    font-size: 13px;
  }

  .md-response :global(pre) {
    background: #060d06;
    border: 1px solid #1a2a1a;
    border-radius: 6px;
    padding: 12px;
    margin: 10px 0;
    overflow-x: auto;
  }

  .md-response :global(pre code) {
    background: none;
    padding: 0;
    font-size: 12px;
    line-height: 1.5;
  }

  .md-response :global(hr) {
    border: none;
    border-top: 1px solid #1a2a1a;
    margin: 16px 0;
  }

  .md-response :global(table) {
    border-collapse: collapse;
    margin: 10px 0 14px 0;
    font-size: 13px;
    width: auto;
  }
  .md-response :global(th) {
    background: #0d1f0d;
    color: #d4af37;
    font-weight: 700;
    padding: 6px 14px;
    border: 1px solid #1a3a1a;
    text-align: left;
  }
  .md-response :global(td) {
    color: #b0d0b0;
    padding: 5px 14px;
    border: 1px solid #1a2a1a;
  }
  .md-response :global(tr:nth-child(even) td) {
    background: #080f08;
  }
</style>
