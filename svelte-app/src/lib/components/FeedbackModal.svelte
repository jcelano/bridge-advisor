<script>
  import { submitFeedback } from '$lib/api.js';
  import Turnstile from '$lib/components/Turnstile.svelte';

  let { onclose, turnstileSiteKey = null, user = null, appVersion = '' } = $props();

  let category = $state('feedback');
  let message = $state('');
  let email = $state(user?.email || '');
  let turnstileToken = $state('');
  let error = $state('');
  let success = $state(false);
  let loading = $state(false);

  function collectBrowserInfo() {
    return {
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      language: navigator.language,
      platform: navigator.platform || 'unknown',
      timestamp: new Date().toISOString(),
      appVersion,
      userTier: user?.tier || null,
      screenSize: `${screen.width}x${screen.height}`,
      colorDepth: screen.colorDepth,
      online: navigator.onLine,
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!message.trim()) { error = 'Please enter a message'; return; }
    error = ''; loading = true;

    try {
      await submitFeedback({
        category,
        message: message.trim(),
        browserInfo: collectBrowserInfo(),
        pageUrl: window.location.href,
        turnstileToken,
        email: user ? undefined : email || undefined,
      });
      success = true;
      setTimeout(() => onclose(), 2500);
    } catch (err) {
      error = err.message;
    }
    loading = false;
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onclose();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="overlay" onclick={handleBackdrop}>
  <div class="modal">
    <div class="modal-header">
      <h2>Send Feedback</h2>
      <button class="close-btn" onclick={onclose}>&times;</button>
    </div>

    {#if success}
      <div class="success-msg">
        <div class="success-icon">&#10003;</div>
        <p>Thank you for your feedback!</p>
      </div>
    {:else}
      <form onsubmit={handleSubmit}>
        <div class="field">
          <label for="fb-category">Category</label>
          <select id="fb-category" bind:value={category}>
            <option value="feedback">General Feedback</option>
            <option value="bug">Bug Report</option>
            <option value="question">Question</option>
            <option value="feature">Feature Request</option>
          </select>
        </div>

        <div class="field">
          <label for="fb-message">Message</label>
          <textarea
            id="fb-message"
            bind:value={message}
            required
            maxlength="2000"
            rows="5"
            placeholder={category === 'bug'
              ? 'Describe what happened, what you expected, and steps to reproduce...'
              : 'Your feedback, question, or suggestion...'}
          ></textarea>
          <span class="char-count">{message.length}/2000</span>
        </div>

        {#if !user}
          <div class="field">
            <label for="fb-email">Email (optional)</label>
            <input id="fb-email" type="email" bind:value={email} placeholder="For follow-up (optional)" />
          </div>
        {/if}

        <Turnstile siteKey={turnstileSiteKey} onverify={(t) => turnstileToken = t} />

        {#if error}<div class="error">{error}</div>{/if}

        <button type="submit" class="submit-btn" disabled={loading}>
          {loading ? 'Sending...' : 'Send Feedback'}
        </button>
      </form>
    {/if}

    {#if category === 'bug'}
      <p class="auto-note">Browser and environment details will be included automatically to help us debug.</p>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed; inset: 0; z-index: 100000;
    background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
  }
  .modal {
    background: #0c1219; border: 1px solid #1a2a1a; border-radius: 16px;
    width: 420px; max-width: 100%; max-height: 90vh; overflow-y: auto;
    padding: 24px;
  }
  .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  h2 { font-size: 18px; color: #d4af37; margin: 0; }
  .close-btn { background: none; border: none; color: #6a8a6a; font-size: 24px; cursor: pointer; padding: 0 4px; }
  .close-btn:hover { color: #e66; }

  .field { margin-bottom: 14px; }
  .field label { font-size: 12px; color: #6a7a8a; display: block; margin-bottom: 4px; }
  .field select, .field input, .field textarea {
    width: 100%; padding: 10px 12px; background: #101820; color: #c0d0e0;
    border: 1px solid #1a2a3a; border-radius: 8px; font-size: 14px;
    outline: none; box-sizing: border-box; font-family: inherit;
  }
  .field select { cursor: pointer; }
  .field textarea { resize: vertical; min-height: 100px; line-height: 1.5; }
  .field select:focus, .field input:focus, .field textarea:focus { border-color: #d4af3760; }
  .char-count { font-size: 10px; color: #4a6a4a; float: right; margin-top: 2px; }

  .error { background: #1f0d0d; border: 1px solid #3a1a1a; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; color: #e66; font-size: 13px; }
  .submit-btn {
    width: 100%; padding: 12px; border-radius: 8px; border: none;
    background: linear-gradient(135deg, #d4af37, #a08520);
    color: #0a0a10; font-size: 15px; font-weight: 700; cursor: pointer;
  }
  .submit-btn:disabled { opacity: 0.7; cursor: wait; }

  .success-msg { text-align: center; padding: 32px 0; }
  .success-icon { font-size: 48px; color: #8bdb6a; margin-bottom: 12px; }
  .success-msg p { color: #8bdb6a; font-size: 16px; }

  .auto-note { font-size: 11px; color: #4a6a4a; margin-top: 12px; text-align: center; }
</style>
