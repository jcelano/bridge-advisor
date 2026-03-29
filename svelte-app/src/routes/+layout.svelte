<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { verifySession, getAuthStatus, getUsage, createCheckoutSession, createPortalSession, logout as doLogout } from '$lib/api.js';
  import Login from '$lib/components/Login.svelte';
  import Signup from '$lib/components/Signup.svelte';
  import Landing from '$lib/components/Landing.svelte';
  import ForgotPassword from '$lib/components/ForgotPassword.svelte';
  import ResetPassword from '$lib/components/ResetPassword.svelte';
  import VerifyEmail from '$lib/components/VerifyEmail.svelte';
  import FeedbackModal from '$lib/components/FeedbackModal.svelte';
  import '../app.css';
  import pkg from '../../../package.json';

  let { children } = $props();
  const appVersion = pkg?.version || 'dev';

  let authChecked = $state(false);
  let authRequired = $state(true);
  let user = $state(null);
  let usage = $state(null);
  let authView = $state('landing'); // 'landing' | 'login' | 'signup' | 'forgot' | 'reset' | 'verify'
  let resetToken = $state(null);
  let verifyToken = $state(null);
  let emailVerified = $state(false);
  let verifyError = $state(null);
  let turnstileSiteKey = $state(null);
  let showFeedback = $state(false);

  // Public pages — skip auth entirely
  let isPublicPage = $derived(
    $page.url.pathname.startsWith('/share/') ||
    $page.url.pathname === '/terms' ||
    $page.url.pathname === '/privacy'
  );

  onMount(async () => {
    if (isPublicPage) { authChecked = true; return; }

    // Check for tokens in URL
    const urlParams = new URLSearchParams(window.location.search);
    const rt = urlParams.get('reset');
    const vt = urlParams.get('verify');
    const vd = urlParams.get('verified');
    const ve = urlParams.get('verify_error');
    const sid = urlParams.get('session_id'); // Stripe checkout return

    if (rt) {
      resetToken = rt;
      authView = 'reset';
    } else if (vt) {
      verifyToken = vt;
      authView = 'verify';
    } else if (vd === 'true') {
      emailVerified = true;
      authView = 'verify';
    } else if (ve) {
      verifyError = ve;
      authView = 'verify';
    }

    // Clean URL params without reloading
    if (rt || vt || vd || ve || sid) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    const status = await getAuthStatus();
    authRequired = status.authEnabled;
    turnstileSiteKey = status.turnstileSiteKey || null;
    if (status.authEnabled) {
      const session = await verifySession();
      if (session.valid) {
        user = session.user;
        usage = await getUsage();
      }
    } else {
      user = { email: 'dev@local', name: 'Dev Mode' };
    }
    authChecked = true;
  });

  async function handleLogin(u) { user = u; usage = await getUsage(); }
  function handleLogout() { doLogout(); user = null; usage = null; authView = 'landing'; }

  async function handleUpgrade() {
    try {
      const { url } = await createCheckoutSession();
      if (url) window.location.href = url;
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleManageSubscription() {
    try {
      const { url } = await createPortalSession();
      if (url) window.location.href = url;
    } catch (err) {
      alert(err.message);
    }
  }

  // Refresh usage when child pages signal a change
  onMount(() => {
    const handler = async () => { if (user) usage = await getUsage(); };
    window.addEventListener('usage-changed', handler);
    return () => window.removeEventListener('usage-changed', handler);
  });
</script>

{#if isPublicPage}
  {@render children()}
{:else if !authChecked}
  <div class="loading">Loading...</div>
{:else if authRequired && !user}
  {#if authView === 'verify'}
    <VerifyEmail token={verifyToken} verified={emailVerified} verifyError={verifyError} onback={() => { verifyToken = null; emailVerified = false; verifyError = null; authView = 'login'; }} {turnstileSiteKey} />
  {:else if authView === 'reset' && resetToken}
    <ResetPassword token={resetToken} onback={() => { resetToken = null; authView = 'login'; }} {turnstileSiteKey} />
  {:else if authView === 'forgot'}
    <ForgotPassword onback={() => authView = 'login'} {turnstileSiteKey} />
  {:else if authView === 'signup'}
    <Signup onlogin={handleLogin} onback={() => authView = 'login'} {turnstileSiteKey} />
  {:else if authView === 'login'}
    <Login onlogin={handleLogin} onsignup={() => authView = 'signup'} onforgot={() => authView = 'forgot'} {turnstileSiteKey} />
  {:else}
    <Landing onShowSignup={() => authView = 'signup'} onShowLogin={() => authView = 'login'} />
  {/if}
{:else}
  <header class="header">
    <div class="header-left">
      <a href="/" class="logo-link">
        <span class="logo">♠</span>
        <div>
          <div class="title">The Stayman Whisperer</div>
          <div class="subtitle">Your AI bridge partner</div>
        </div>
      </a>
    </div>
    <div class="header-right">
      {#if user}
        {#if usage}
          <span class="usage-badge" class:usage-warn={usage.usedToday / usage.dailyLimit > 0.8} class:usage-full={usage.remainingToday === 0}>
            {usage.usedToday}/{usage.dailyLimit} today
          </span>
        {/if}
        <!-- Stripe upgrade/manage buttons (uncomment when Stripe is configured)
        {#if user.tier === 'free' && user.tier !== 'admin'}
          <button class="upgrade-btn" onclick={handleUpgrade}>Upgrade to Pro</button>
        {:else if user.tier === 'pro'}
          <button class="manage-btn" onclick={handleManageSubscription}>Manage</button>
        {/if}
        -->
        <span class="user-info">{user.name}{#if user.tier === 'admin'} <span class="tier-badge admin">admin</span>{:else if user.tier === 'pro'} <span class="tier-badge pro">pro</span>{/if} · <button class="logout-btn" onclick={handleLogout}>Sign out</button></span>
      {/if}
    </div>
  </header>

  <main class="container">
    {@render children()}
  </main>

  <footer class="footer">
    © 2026 The Stayman Whisperer · v{appVersion} · <a class="footer-link" href="/terms">Terms</a> · <a class="footer-link" href="/privacy">Privacy</a> · <button class="footer-link feedback-btn" onclick={() => showFeedback = true}>Feedback</button> · <a class="footer-link" href="https://www.trickstercards.com" target="_blank" rel="noopener noreferrer">Trickster Cards</a>
  </footer>
{/if}

{#if showFeedback}
  <FeedbackModal
    onclose={() => showFeedback = false}
    {turnstileSiteKey}
    user={user}
    appVersion={appVersion}
  />
{/if}

<style>
  .loading { min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #4a6a4a; }
  .header {
    background: linear-gradient(135deg, #0d2214, #0a1a10);
    border-bottom: 1px solid #1a3a2a;
    padding: 16px 20px; display: flex; align-items: center; justify-content: space-between;
  }
  .header-left { display: flex; align-items: center; }
  .logo-link { display: flex; align-items: center; gap: 14px; text-decoration: none; }
  .logo { font-size: 28px; color: #d4af37; }
  .title { font-size: 20px; font-weight: 700; color: #d4af37; }
  .subtitle { font-size: 11px; color: #4a6a4a; }
  .header-right { display: flex; align-items: center; gap: 12px; }
  .user-info { font-size: 12px; color: #6a8a6a; }
  .logout-btn { background: none; border: none; color: #8a6a6a; cursor: pointer; font-size: 12px; text-decoration: underline; }
  .usage-badge { font-size: 11px; padding: 3px 8px; border-radius: 10px; background: #0d1f0d; border: 1px solid #1a3a1a; color: #6a8a6a; }
  .usage-badge.usage-warn { background: #1f1f0d; border-color: #3a3a1a; color: #c0a030; }
  .usage-badge.usage-full { background: #1f0d0d; border-color: #3a1a1a; color: #e66; }
  .tier-badge { font-size: 10px; padding: 1px 6px; border-radius: 6px; font-weight: 600; }
  .tier-badge.admin { background: #d4af3730; color: #d4af37; }
  .tier-badge.pro { background: #3a7a3a30; color: #8bdb6a; }
  .upgrade-btn { font-size: 11px; padding: 4px 10px; border-radius: 6px; border: 1px solid #d4af3760; background: transparent; color: #d4af37; cursor: pointer; font-weight: 600; }
  .upgrade-btn:hover { background: #d4af3715; }
  .manage-btn { font-size: 11px; padding: 4px 10px; border-radius: 6px; border: 1px solid #2a4a2a; background: transparent; color: #6a8a6a; cursor: pointer; }
  .manage-btn:hover { background: #1a3a1a; }
  .container { max-width: 860px; margin: 0 auto; padding: 16px 12px; }
  .footer { text-align: center; color: #2a3a4a; font-size: 11px; padding: 20px 0; }
  .footer-link { color: #4a6a8a; text-decoration: none; }
  .footer-link:hover { text-decoration: underline; }
  .feedback-btn { background: none; border: none; cursor: pointer; font-size: 11px; padding: 0; }
</style>
