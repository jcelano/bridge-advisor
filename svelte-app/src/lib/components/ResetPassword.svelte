<script>
  import { confirmPasswordReset } from '$lib/api.js';
  import Turnstile from '$lib/components/Turnstile.svelte';

  let { token, onback, turnstileSiteKey = null } = $props();

  let password = $state('');
  let confirmPw = $state('');
  let turnstileToken = $state('');
  let error = $state('');
  let success = $state(false);
  let loading = $state(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirmPw) { error = 'Passwords do not match'; return; }
    if (password.length < 8) { error = 'Password must be at least 8 characters'; return; }

    error = ''; loading = true;
    try {
      await confirmPasswordReset(token, password, turnstileToken);
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
      <p>Set a new password</p>
    </div>

    {#if success}
      <div class="success">
        <div class="success-icon">&#10003;</div>
        <p>Your password has been reset!</p>
        <button class="submit" onclick={onback}>Sign In</button>
      </div>
    {:else}
      <form onsubmit={handleSubmit}>
        <div class="field">
          <label for="password">New Password</label>
          <input id="password" type="password" bind:value={password} required minlength="8" placeholder="At least 8 characters" />
        </div>
        <div class="field">
          <label for="confirm">Confirm Password</label>
          <input id="confirm" type="password" bind:value={confirmPw} required placeholder="Type it again" />
        </div>

        <Turnstile siteKey={turnstileSiteKey} onverify={(t) => turnstileToken = t} />

        {#if error}<div class="error">{error}</div>{/if}

        <button type="submit" class="submit" disabled={loading}>
          {loading ? 'Resetting...' : 'Reset Password'}
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
  .field { margin-bottom: 16px; }
  .field label { font-size: 12px; color: #6a7a8a; display: block; margin-bottom: 4px; }
  .field input { width: 100%; padding: 10px 12px; background: #101820; color: #c0d0e0; border: 1px solid #1a2a3a; border-radius: 8px; font-size: 14px; outline: none; box-sizing: border-box; }
  .field input:focus { border-color: #d4af3760; }
  .error { background: #1f0d0d; border: 1px solid #3a1a1a; border-radius: 8px; padding: 8px 12px; margin-bottom: 16px; color: #e66; font-size: 13px; }
  .success { text-align: center; padding: 16px 0; }
  .success-icon { font-size: 48px; color: #8bdb6a; margin-bottom: 12px; }
  .success p { color: #8bdb6a; font-size: 16px; margin: 0 0 20px; }
  .submit { width: 100%; padding: 12px; border-radius: 8px; border: none; background: linear-gradient(135deg, #d4af37, #a08520); color: #0a0a10; font-size: 15px; font-weight: 700; cursor: pointer; }
  .submit:disabled { opacity: 0.7; cursor: wait; }
  .link-btn { background: none; border: none; color: #d4af37; cursor: pointer; font-size: 13px; text-decoration: underline; padding: 0; }
  .back-row { text-align: center; margin-top: 20px; font-size: 13px; color: #4a6a4a; border-top: 1px solid #1a2430; padding-top: 16px; }
</style>
