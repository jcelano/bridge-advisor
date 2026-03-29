<script>
  import { login, resendVerification } from '$lib/api.js';
  import Turnstile from '$lib/components/Turnstile.svelte';
  let { onlogin, onsignup, onforgot, turnstileSiteKey = null } = $props();
  let email = $state('');
  let password = $state('');
  let turnstileToken = $state('');
  let error = $state('');
  let needsVerification = $state(false);
  let resendMsg = $state('');
  let loading = $state(false);

  async function handleSubmit(e) {
    e.preventDefault();
    error = ''; needsVerification = false; resendMsg = ''; loading = true;
    try { const result = await login(email, password, turnstileToken); onlogin(result.user); }
    catch (err) {
      error = err.message;
      if (err.message.toLowerCase().includes('verify your email')) needsVerification = true;
    }
    loading = false;
  }

  async function handleResend() {
    resendMsg = '';
    try {
      const result = await resendVerification(email, turnstileToken);
      resendMsg = 'Verification email sent! Check your inbox.';
    } catch (err) {
      resendMsg = err.message;
    }
  }
</script>

<div class="page">
  <div class="card">
    <div class="hdr">
      <div class="logo">♠</div>
      <h1>The Stayman Whisperer</h1>
      <p>Sign in to continue</p>
    </div>
    <form onsubmit={handleSubmit}>
      <div class="field">
        <label for="email">Email</label>
        <input id="email" type="email" bind:value={email} required placeholder="you@example.com" />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" type="password" bind:value={password} required placeholder="••••••••" />
        {#if onforgot}<div class="forgot-row"><button type="button" class="link-btn" onclick={onforgot}>Forgot password?</button></div>{/if}
      </div>
      <Turnstile siteKey={turnstileSiteKey} onverify={(t) => turnstileToken = t} />
      {#if error}
        <div class="error">
          {error}
          {#if needsVerification}
            <button type="button" class="resend-link" onclick={handleResend}>Resend verification email</button>
          {/if}
        </div>
      {/if}
      {#if resendMsg}<div class="info">{resendMsg}</div>{/if}
      <button type="submit" class="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
    </form>
    {#if onsignup}
      <div class="signup-row">
        Don't have an account? <button class="link-btn" onclick={onsignup}>Create one</button>
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
  .forgot-row { text-align: right; margin-top: 4px; }
  .error { background: #1f0d0d; border: 1px solid #3a1a1a; border-radius: 8px; padding: 8px 12px; margin-bottom: 16px; color: #e66; font-size: 13px; }
  .resend-link { background: none; border: none; color: #d4af37; cursor: pointer; font-size: 12px; text-decoration: underline; padding: 0; display: block; margin-top: 6px; }
  .info { background: #0d1f0d; border: 1px solid #1a3a1a; border-radius: 8px; padding: 8px 12px; margin-bottom: 16px; color: #8bdb6a; font-size: 13px; }
  .submit { width: 100%; padding: 12px; border-radius: 8px; border: none; background: linear-gradient(135deg, #d4af37, #a08520); color: #0a0a10; font-size: 15px; font-weight: 700; cursor: pointer; }
  .submit:disabled { opacity: 0.7; cursor: wait; }
  .signup-row { text-align: center; margin-top: 20px; font-size: 13px; color: #4a6a4a; border-top: 1px solid #1a2430; padding-top: 16px; }
  .link-btn { background: none; border: none; color: #d4af37; cursor: pointer; font-size: 13px; text-decoration: underline; padding: 0; }
</style>
