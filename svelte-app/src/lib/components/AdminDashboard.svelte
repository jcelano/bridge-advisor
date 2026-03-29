<script>
  import { onMount } from 'svelte';
  import { getPendingUsers, approveUser, createInviteCode, getInviteCodes, getAdminUsage, getAdminFeedback } from '$lib/api.js';

  let pending = $state([]);
  let inviteCodes = $state([]);
  let usageStats = $state(null);
  let feedbackData = $state({ entries: [], total: 0 });
  let loading = $state(true);
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
  }

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
