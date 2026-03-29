<script>
  import { register } from '$lib/api.js';
  import Turnstile from '$lib/components/Turnstile.svelte';

  let { onlogin, onback, turnstileSiteKey = null } = $props();

  let email = $state('');
  let password = $state('');
  let name = $state('');
  let inviteCode = $state('');
  let turnstileToken = $state('');
  let showInvite = $state(false);
  let agreedToTerms = $state(false);
  let error = $state('');
  let success = $state('');
  let loading = $state(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!agreedToTerms) { error = 'You must agree to the Terms of Service and Privacy Policy'; return; }
    error = ''; success = ''; loading = true;

    try {
      const result = await register(email, password, name, inviteCode, turnstileToken);
      success = result.message || 'Account created! Check your email to verify your address.';
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
      <p>Create your account</p>
    </div>

    {#if success}
      <div class="success">
        <p>{success}</p>
        <button class="link-btn" onclick={onback}>Back to sign in</button>
      </div>
    {:else}
      <form onsubmit={handleSubmit}>
        <div class="field">
          <label for="name">Name</label>
          <input id="name" type="text" bind:value={name} placeholder="Your name" />
        </div>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" type="email" bind:value={email} required placeholder="you@example.com" />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" type="password" bind:value={password} required minlength="8" placeholder="At least 8 characters" />
        </div>

        {#if showInvite}
          <div class="field">
            <label for="invite">Invite Code</label>
            <input id="invite" type="text" bind:value={inviteCode} placeholder="Enter your invite code" />
          </div>
        {:else}
          <button type="button" class="link-btn invite-toggle" onclick={() => showInvite = true}>
            Have an invite code?
          </button>
        {/if}

        <label class="terms-check">
          <input type="checkbox" bind:checked={agreedToTerms} />
          <span>I agree to the <a href="/terms" target="_blank">Terms of Service</a> and <a href="/privacy" target="_blank">Privacy Policy</a></span>
        </label>

        <Turnstile siteKey={turnstileSiteKey} onverify={(t) => turnstileToken = t} />

        {#if error}<div class="error">{error}</div>{/if}

        <button type="submit" class="submit" disabled={loading}>
          {loading ? 'Creating account...' : (inviteCode ? 'Sign Up with Invite' : 'Request Access')}
        </button>

        <p class="note">
          {#if inviteCode}
            Your account will be activated immediately.
          {:else}
            Your request will be reviewed. You'll receive access once approved.
          {/if}
        </p>
      </form>

      <div class="back-row">
        Already have an account? <button class="link-btn" onclick={onback}>Sign in</button>
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
  .success { background: #0d1f0d; border: 1px solid #1a3a1a; border-radius: 8px; padding: 16px; text-align: center; }
  .success p { color: #8bdb6a; font-size: 14px; margin: 0 0 12px; line-height: 1.5; }
  .submit { width: 100%; padding: 12px; border-radius: 8px; border: none; background: linear-gradient(135deg, #d4af37, #a08520); color: #0a0a10; font-size: 15px; font-weight: 700; cursor: pointer; }
  .submit:disabled { opacity: 0.7; cursor: wait; }
  .link-btn { background: none; border: none; color: #d4af37; cursor: pointer; font-size: 13px; text-decoration: underline; padding: 0; }
  .invite-toggle { margin-bottom: 16px; }
  .terms-check { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: #6a8a6a; margin-bottom: 12px; cursor: pointer; }
  .terms-check input { margin-top: 2px; accent-color: #d4af37; }
  .terms-check a { color: #d4af37; }
  .note { font-size: 11px; color: #4a6a4a; text-align: center; margin-top: 12px; }
  .back-row { text-align: center; margin-top: 20px; font-size: 13px; color: #4a6a4a; border-top: 1px solid #1a2430; padding-top: 16px; }
</style>
