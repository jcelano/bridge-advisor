<script>
  import { requestPasswordReset } from '$lib/api.js';
  import Turnstile from '$lib/components/Turnstile.svelte';

  let { onback, turnstileSiteKey = null } = $props();

  let email = $state('');
  let turnstileToken = $state('');
  let error = $state('');
  let success = $state(false);
  let loading = $state(false);

  async function handleSubmit(e) {
    e.preventDefault();
    error = ''; loading = true;
    try {
      await requestPasswordReset(email, turnstileToken);
      success = true;
    } catch (err) {
      error = err.message;
    }
    loading = false;
  }
</script>

<div class="page">
  <div class="card">
    <div class="hdr">
      <div class="logo">♠</div>
      <h1>The Stayman Whisperer</h1>
      <p>Reset your password</p>
    </div>

    {#if success}
      <div class="success">
        <p>If an account with that email exists, we've sent a reset link.</p>
        <p class="hint">Check your email and click the link to set a new password. The link expires in 15 minutes.</p>
        <button class="link-btn" onclick={onback}>Back to sign in</button>
      </div>
    {:else}
      <form onsubmit={handleSubmit}>
        <p class="intro">Enter your email address and we'll send you a link to reset your password.</p>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" type="email" bind:value={email} required placeholder="you@example.com" />
        </div>

        <Turnstile siteKey={turnstileSiteKey} onverify={(t) => turnstileToken = t} />

        {#if error}<div class="error">{error}</div>{/if}

        <button type="submit" class="submit" disabled={loading}>
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>

      <div class="back-row">
        <button class="link-btn" onclick={onback}>Back to sign in</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #080c12; }
  .card { width: 380px; background: #0c1219; border-radius: 16px; border: 1px solid #1a2430; padding: 32px; }
  .hdr { text-align: center; margin-bottom: 28px; }
  .logo { font-size: 36px; color: #d4af37; margin-bottom: 8px; }
  h1 { font-size: 22px; font-weight: 700; color: #d4af37; margin: 0; }
  .hdr p { font-size: 12px; color: #4a6a4a; margin-top: 4px; }
  .intro { font-size: 13px; color: #6a8a6a; margin-bottom: 16px; line-height: 1.5; }
  .field { margin-bottom: 16px; }
  .field label { font-size: 12px; color: #6a7a8a; display: block; margin-bottom: 4px; }
  .field input { width: 100%; padding: 10px 12px; background: #101820; color: #c0d0e0; border: 1px solid #1a2a3a; border-radius: 8px; font-size: 14px; outline: none; box-sizing: border-box; }
  .field input:focus { border-color: #d4af3760; }
  .error { background: #1f0d0d; border: 1px solid #3a1a1a; border-radius: 8px; padding: 8px 12px; margin-bottom: 16px; color: #e66; font-size: 13px; }
  .success { text-align: center; }
  .success p { color: #8bdb6a; font-size: 14px; margin: 0 0 8px; line-height: 1.5; }
  .success .hint { color: #6a8a6a; font-size: 12px; margin-bottom: 16px; }
  .submit { width: 100%; padding: 12px; border-radius: 8px; border: none; background: linear-gradient(135deg, #d4af37, #a08520); color: #0a0a10; font-size: 15px; font-weight: 700; cursor: pointer; }
  .submit:disabled { opacity: 0.7; cursor: wait; }
  .link-btn { background: none; border: none; color: #d4af37; cursor: pointer; font-size: 13px; text-decoration: underline; padding: 0; }
  .back-row { text-align: center; margin-top: 20px; font-size: 13px; color: #4a6a4a; border-top: 1px solid #1a2430; padding-top: 16px; }
</style>
