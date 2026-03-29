<script>
  import { onMount, onDestroy } from 'svelte';

  let { siteKey, onverify = () => {}, onexpire = () => {} } = $props();

  let container;
  let widgetId = null;

  onMount(() => {
    if (!siteKey) return; // No site key = Turnstile disabled

    // Wait for the Turnstile script to load
    function renderWidget() {
      if (!window.turnstile || !container) return;
      widgetId = window.turnstile.render(container, {
        sitekey: siteKey,
        callback: (token) => onverify(token),
        'expired-callback': () => { onverify(''); onexpire(); },
        'error-callback': () => onverify(''),
        theme: 'dark',
        size: 'normal',
      });
    }

    if (window.turnstile) {
      renderWidget();
    } else {
      // Script not loaded yet — poll briefly
      const poll = setInterval(() => {
        if (window.turnstile) { clearInterval(poll); renderWidget(); }
      }, 200);
      setTimeout(() => clearInterval(poll), 10000);
    }
  });

  onDestroy(() => {
    if (widgetId != null && window.turnstile) {
      try { window.turnstile.remove(widgetId); } catch (_) {}
    }
  });
</script>

{#if siteKey}
  <div class="turnstile-wrapper" bind:this={container}></div>
{/if}

<style>
  .turnstile-wrapper {
    margin: 12px 0;
    display: flex;
    justify-content: center;
  }
</style>
