<script>
  import { onMount } from 'svelte';
  import { getPendingUsers, approveUser, createInviteCode, getInviteCodes, getAdminUsage, getAdminFeedback, getAdminUsers } from '$lib/api.js';

  let pending = $state([]);
  let inviteCodes = $state([]);
  let usageStats = $state(null);
  let feedbackData = $state({ entries: [], total: 0 });
  let loading = $state(true);

  // Users list state
  let usersData = $state({ users: [], total: 0, hasMore: false });
  let usersPage = $state(0);
  let usersSearch = $state('');
  let usersLoading = $state(false);
  let searchTimeout = null;
  const PAGE_SIZE = 25;
  let newCodeTier = $state('free');
  let newCodeUses = $state(1);
  let generatedCode = $state('');
  let approveMsg = $state('');

  onMount(async () => {
    await refresh();
    loading = false;
  });

  async function refresh() {
    [pending, inviteCodes, usageStats, feedbackData] = await Promise.all([
      getPendingUsers(),
      getInviteCodes(),
      getAdminUsage(),
      getAdminFeedback(),
    ]);
    await loadUsers();
  }

  async function loadUsers() {
    usersLoading = true;
    usersData = await getAdminUsers({ limit: PAGE_SIZE, offset: usersPage * PAGE_SIZE, search: usersSearch });
    usersLoading = false;
  }

  function handleSearchInput(e) {
    usersSearch = e.target.value;
    usersPage = 0;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadUsers(), 300);
  }

  function usersNextPage() { usersPage++; loadUsers(); }
  function usersPrevPage() { if (usersPage > 0) { usersPage--; loadUsers(); } }

  async function handleApprove(email) {
    await approveUser(email, { tier: 'free' });
    approveMsg = `Approved ${email}`;
    pending = pending.filter(u => u.email !== email);
    setTimeout(() => approveMsg = '', 3000);
  }

  async function handleGenerate() {
    const code = await createInviteCode({ tier: newCodeTier, uses: newCodeUses });
    if (code) {
      generatedCode = code.code;
      inviteCodes = [code, ...inviteCodes];
    }
  }
</script>

<div class="admin">
  <h2>Admin Dashboard</h2>

  {#if loading}
    <p class="muted">Loading...</p>
  {:else}
    <!-- Usage Stats -->
    {#if usageStats?.today}
      <section class="section">
        <h3>Today's Usage</h3>
        <div class="stat-row">
          <div class="stat"><span class="stat-val">{usageStats.today.total_queries}</span><span class="stat-label">Queries</span></div>
          <div class="stat"><span class="stat-val">{usageStats.today.active_users}</span><span class="stat-label">Active Users</span></div>
          <div class="stat"><span class="stat-val">{Math.round(usageStats.today.total_tokens / 1000)}k</span><span class="stat-label">Tokens</span></div>
        </div>
      </section>
    {/if}

    <!-- Users -->
    <section class="section">
      <h3>All Users ({usersData.total})</h3>
      <div class="search-row">
        <input type="text" class="search-input" placeholder="Search by name or email..." value={usersSearch} oninput={handleSearchInput} />
      </div>
      {#if usersLoading}
        <p class="muted">Loading...</p>
      {:else if usersData.users.length === 0}
        <p class="muted">{usersSearch ? 'No users found' : 'No users yet'}</p>
      {:else}
        <div class="users-table">
          <div class="users-header">
            <span class="col-name">User</span>
            <span class="col-tier">Tier</span>
            <span class="col-status">Status</span>
            <span class="col-usage">Today</span>
            <span class="col-usage">All Time</span>
            <span class="col-date">Joined</span>
          </div>
          {#each usersData.users as u}
            <div class="users-row">
              <span class="col-name">
                <span class="name">{u.name}</span>
                <span class="email">{u.email}</span>
              </span>
              <span class="col-tier">
                <span class="tier-tag" class:pro={u.tier === 'pro'} class:admin={u.tier === 'admin'}>{u.tier}</span>
                <span class="muted limit">{u.dailyLimit}/day</span>
              </span>
              <span class="col-status">
                {#if !u.emailVerified}<span class="status-dot unverified" title="Email not verified">&#9679;</span>
                {:else if !u.approved}<span class="status-dot pending" title="Pending approval">&#9679;</span>
                {:else}<span class="status-dot active" title="Active">&#9679;</span>{/if}
              </span>
              <span class="col-usage">{u.queriesToday}</span>
              <span class="col-usage">{u.queriesAllTime}</span>
              <span class="col-date">{new Date(u.createdAt).toLocaleDateString()}</span>
            </div>
          {/each}
        </div>
        <div class="paging-row">
          <button class="page-btn" onclick={usersPrevPage} disabled={usersPage === 0}>Prev</button>
          <span class="paging-info">
            {usersPage * PAGE_SIZE + 1}–{Math.min((usersPage + 1) * PAGE_SIZE, usersData.total)} of {usersData.total}
          </span>
          <button class="page-btn" onclick={usersNextPage} disabled={!usersData.hasMore}>Next</button>
        </div>
      {/if}
    </section>

    <!-- Pending Approvals -->
    <section class="section">
      <h3>Pending Access Requests ({pending.length})</h3>
      {#if approveMsg}<div class="success-msg">{approveMsg}</div>{/if}
      {#if pending.length === 0}
        <p class="muted">No pending requests</p>
      {:else}
        {#each pending as user}
          <div class="pending-row">
            <div>
              <span class="name">{user.name}</span>
              <span class="email">{user.email}</span>
              <span class="date">{new Date(user.created_at).toLocaleDateString()}</span>
            </div>
            <button class="approve-btn" onclick={() => handleApprove(user.email)}>Approve</button>
          </div>
        {/each}
      {/if}
    </section>

    <!-- Invite Codes -->
    <section class="section">
      <h3>Invite Codes</h3>
      <div class="gen-row">
        <select bind:value={newCodeTier}>
          <option value="free">Free tier</option>
          <option value="pro">Pro tier</option>
        </select>
        <input type="number" min="1" max="100" bind:value={newCodeUses} style="width:60px" />
        <span class="muted">uses</span>
        <button class="gen-btn" onclick={handleGenerate}>Generate</button>
      </div>
      {#if generatedCode}
        <div class="generated">
          New code: <code>{generatedCode}</code>
          <button class="copy-btn" onclick={() => { navigator.clipboard.writeText(generatedCode); }}>Copy</button>
        </div>
      {/if}
      {#if inviteCodes.length > 0}
        <div class="code-list">
          {#each inviteCodes as c}
            <div class="code-row">
              <code>{c.code}</code>
              <span class="tier-tag">{c.tier}</span>
              <span class="muted">{c.uses_remaining} uses left</span>
              {#if c.used_by}<span class="muted">used by {c.used_by}</span>{/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Feedback -->
    <section class="section">
      <h3>User Feedback ({feedbackData.total})</h3>
      {#if feedbackData.entries.length === 0}
        <p class="muted">No feedback yet</p>
      {:else}
        <div class="feedback-list">
          {#each feedbackData.entries as fb}
            <div class="feedback-row">
              <div class="feedback-header">
                <span class="category-tag" class:bug={fb.category === 'bug'} class:feature={fb.category === 'feature'} class:question={fb.category === 'question'}>{fb.category}</span>
                <span class="muted">{fb.user_email || 'anonymous'}</span>
                <span class="date">{new Date(fb.created_at).toLocaleDateString()}</span>
              </div>
              <p class="feedback-msg">{fb.message}</p>
              {#if fb.browser_info}
                <details class="browser-details">
                  <summary>Browser info</summary>
                  <pre>{JSON.stringify(typeof fb.browser_info === 'string' ? JSON.parse(fb.browser_info) : fb.browser_info, null, 2)}</pre>
                </details>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .admin { padding: 8px 0; }
  h2 { font-size: 20px; color: #d4af37; margin: 0 0 20px; }
  h3 { font-size: 15px; color: #8aa08a; margin: 0 0 12px; }
  .section { margin-bottom: 28px; padding: 16px; background: #0c1219; border: 1px solid #1a2a1a; border-radius: 12px; }
  .muted { color: #4a6a4a; font-size: 13px; }

  /* Stats */
  .stat-row { display: flex; gap: 20px; }
  .stat { text-align: center; flex: 1; }
  .stat-val { font-size: 24px; font-weight: 700; color: #d4af37; display: block; }
  .stat-label { font-size: 11px; color: #6a8a6a; }

  /* Pending */
  .pending-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #1a2a1a; }
  .name { font-size: 14px; color: #c0d8c0; margin-right: 8px; }
  .email { font-size: 12px; color: #6a8a6a; margin-right: 8px; }
  .date { font-size: 11px; color: #4a6a4a; }
  .approve-btn { padding: 4px 12px; border-radius: 6px; border: 1px solid #2a5a2a; background: #1a3a1a; color: #8bdb6a; cursor: pointer; font-size: 12px; }
  .success-msg { background: #0d1f0d; border: 1px solid #1a3a1a; border-radius: 6px; padding: 6px 10px; color: #8bdb6a; font-size: 12px; margin-bottom: 10px; }

  /* Invite Codes */
  .gen-row { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
  .gen-row select, .gen-row input { padding: 6px 8px; background: #101820; color: #c0d0e0; border: 1px solid #1a2a3a; border-radius: 6px; font-size: 13px; }
  .gen-btn { padding: 6px 14px; border-radius: 6px; border: none; background: linear-gradient(135deg, #d4af37, #a08520); color: #0a0a10; font-size: 12px; font-weight: 700; cursor: pointer; }
  .generated { background: #0d1f0d; border: 1px solid #1a3a1a; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; font-size: 14px; color: #8bdb6a; }
  .generated code { font-size: 16px; font-weight: 700; letter-spacing: 1px; }
  .copy-btn { margin-left: 8px; padding: 2px 8px; border-radius: 4px; border: 1px solid #2a5a2a; background: transparent; color: #6a8a6a; cursor: pointer; font-size: 11px; }
  .code-list { max-height: 200px; overflow-y: auto; }
  .code-row { display: flex; gap: 10px; align-items: center; padding: 6px 0; border-bottom: 1px solid #0a1a0a; font-size: 12px; }
  .code-row code { color: #c0d8c0; font-size: 13px; }
  .tier-tag { padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; background: #1a3a2a; color: #6a8a6a; }
  .tier-tag.pro { background: #3a7a3a30; color: #8bdb6a; }
  .tier-tag.admin { background: #d4af3730; color: #d4af37; }

  /* Users table */
  .search-row { margin-bottom: 12px; }
  .search-input { width: 100%; padding: 8px 12px; background: #101820; color: #c0d0e0; border: 1px solid #1a2a3a; border-radius: 6px; font-size: 13px; outline: none; box-sizing: border-box; }
  .search-input:focus { border-color: #d4af3760; }
  .users-table { overflow-x: auto; }
  .users-header, .users-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 12px; }
  .users-header { color: #5a8a5a; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; border-bottom: 1px solid #1a3a1a; padding-bottom: 8px; margin-bottom: 4px; }
  .users-row { border-bottom: 1px solid #0e1e0e; }
  .col-name { flex: 2; min-width: 0; overflow: hidden; }
  .col-name .name { display: block; color: #c0d8c0; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .col-name .email { display: block; color: #4a6a4a; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .col-tier { flex: 0.8; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
  .col-tier .limit { font-size: 10px; }
  .col-status { flex: 0.4; text-align: center; }
  .col-usage { flex: 0.5; text-align: center; color: #8aa08a; font-size: 13px; }
  .col-date { flex: 0.8; color: #4a6a4a; font-size: 11px; }
  .status-dot { font-size: 10px; }
  .status-dot.active { color: #8bdb6a; }
  .status-dot.pending { color: #d4af37; }
  .status-dot.unverified { color: #e66; }
  .paging-row { display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 12px; }
  .page-btn { padding: 4px 12px; border-radius: 6px; border: 1px solid #2a3a2a; background: transparent; color: #6a8a6a; cursor: pointer; font-size: 12px; }
  .page-btn:disabled { opacity: 0.3; cursor: default; }
  .page-btn:not(:disabled):hover { background: #1a3a1a; }
  .paging-info { font-size: 12px; color: #4a6a4a; }

  /* Feedback */
  .feedback-list { max-height: 400px; overflow-y: auto; }
  .feedback-row { padding: 10px 0; border-bottom: 1px solid #1a2a1a; }
  .feedback-header { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
  .category-tag { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; background: #1a2a3a; color: #6a8aaa; }
  .category-tag.bug { background: #3a1a1a; color: #e88; }
  .category-tag.feature { background: #1a3a2a; color: #8bdb6a; }
  .category-tag.question { background: #2a2a1a; color: #d4af37; }
  .feedback-msg { font-size: 13px; color: #b0c8b0; margin: 0; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .browser-details { margin-top: 6px; }
  .browser-details summary { font-size: 11px; color: #4a6a4a; cursor: pointer; }
  .browser-details pre { font-size: 10px; color: #6a8a6a; background: #0a1a0a; padding: 8px; border-radius: 6px; overflow-x: auto; margin-top: 4px; }
</style>
