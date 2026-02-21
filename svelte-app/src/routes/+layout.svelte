<script>
  import { onMount } from 'svelte';
  import { verifySession, getAuthStatus, logout as doLogout } from '$lib/api.js';
  import Login from '$lib/components/Login.svelte';
  import '../app.css';

  let { children } = $props();

  let authChecked = $state(false);
  let authRequired = $state(true);
  let user = $state(null);

  onMount(async () => {
    const status = await getAuthStatus();
    authRequired = status.authEnabled;
    if (status.authEnabled) {
      const session = await verifySession();
      if (session.valid) user = session.user;
    } else {
      user = { email: 'dev@local', name: 'Dev Mode' };
    }
    authChecked = true;
  });

  function handleLogin(u) { user = u; }
  function handleLogout() { doLogout(); user = null; }
</script>

{#if !authChecked}
  <div class="loading">Loading...</div>
{:else if authRequired && !user}
  <Login onlogin={handleLogin} />
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
        <span class="user-info">{user.name} · <button class="logout-btn" onclick={handleLogout}>Sign out</button></span>
      {/if}
    </div>
  </header>

  <main class="container">
    {@render children()}
  </main>

  <footer class="footer">
    © 2026 The Stayman Whisperer
  </footer>
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
  .container { max-width: 860px; margin: 0 auto; padding: 16px 12px; }
  .footer { text-align: center; color: #2a3a4a; font-size: 11px; padding: 20px 0; }
</style>
