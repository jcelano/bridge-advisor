<script>
  import { onMount } from 'svelte';
  import { resendVerification } from '$lib/api.js';
  import Turnstile from '$lib/components/Turnstile.svelte';

  let { token = null, verified = false, verifyError = null, onback, turnstileSiteKey = null } = $props();

  let status = $state(verified ? 'success' : verifyError ? 'error' : 'verifying');
  let resendEmail = $state('');
  let resendToken = $state('');
  let resendMsg = $state('');
  let resendLoading = $state(false);

  onMount(async () => {
    if (token && status === 'verifying') {
      // Call the verify endpoint via redirect (GET request)
      try {
        const res = await fetch(`/api/auth/verify-email/${token}`);
        if (res.redirected) {
          const url = new URL(res.url);
          if (url.searchParams.get('verified') === 'true') {
            status = 'success';
          } else {
            status = 'error';
          }
        } else if (res.ok) {
          status = 'success';
        } else {
          status = 'error';
        }
      } catch {
        // The GET endpoint redirects, which fetch follows automatically
        // If we end up here, try navigating directly
        window.location.href = `/api/auth/verify-email/${token}`;
      }
    }
  });

  async function handleResend() {
    if (!resendEmail) return;
    resendLoading = true; resendMsg = '';
    try {
      const result = await resendVerification(resendEmail, resendToken);
      resendMsg = result.message || 'Verification email sent!';
    } catch (err) {
      resendMsg = err.message;
    }
    resendLoading = false;
  }
</script>

<div class="page">
  <div class="card">
    <div class="hdr">
      <div class="logo">♠</div>
      <h1>The Stayman Whisperer</h1>
    </div>

    {#if status === 'verifying'}
      <div class="center">
        <p class="muted">Verifying your email...</p>
      </div>
    {:else if status === 'success'}
      <div class="center">
        <div class="success-icon">&#10003;</div>
        <p class="success-text">Email verified!</p>
        <p class="muted">You can now sign in to your account.</p>
        <button class="submit" onclick={onback}>Sign In</button>
      </div>
    {:else}
      <div class="center">
        <p class="error-text">Verification link is invalid or expired.</p>
        <p class="muted">Enter your email to receive a new verification link:</p>
      </div>

      <div class="resend-form">
        <div class="field">
          <input type="email" bind:value={resendEmail} placeholder="you@example.com" />
        </div>
        <Turnstile siteKey={turnstileSiteKey} onverify={(t) => resendToken = t} />
        {#if resendMsg}<p class="resend-msg">{resendMsg}</p>{/if}
        <button class="submit" onclick={handleResend} disabled={resendLoading}>
          {resendLoading ? 'Sending...' : 'Resend Verification Email'}
        </button>
      </div>

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
  .center { text-align: center; margin-bottom: 20px; }
  .success-icon { font-size: 48px; color: #8bdb6a; margin-bottom: 8px; }
  .success-text { font-size: 18px; color: #8bdb6a; margin: 0 0 8px; }
  .error-text { font-size: 15px; color: #e66; margin: 0 0 8px; }
  .muted { font-size: 13px; color: #6a8a6a; margin: 0 0 16px; }
  .field { margin-bottom: 12px; }
  .field input { width: 100%; padding: 10px 12px; background: #101820; color: #c0d0e0; border: 1px solid #1a2a3a; border-radius: 8px; font-size: 14px; outline: none; box-sizing: border-box; }
  .submit { width: 100%; padding: 12px; border-radius: 8px; border: none; background: linear-gradient(135deg, #d4af37, #a08520); color: #0a0a10; font-size: 15px; font-weight: 700; cursor: pointer; }
  .submit:disabled { opacity: 0.7; cursor: wait; }
  .resend-form { margin-bottom: 16px; }
  .resend-msg { font-size: 13px; color: #8bdb6a; margin-bottom: 10px; text-align: center; }
  .link-btn { background: none; border: none; color: #d4af37; cursor: pointer; font-size: 13px; text-decoration: underline; padding: 0; }
  .back-row { text-align: center; margin-top: 16px; border-top: 1px solid #1a2430; padding-top: 16px; }
</style>
