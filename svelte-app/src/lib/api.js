/**
 * API client for Bridge Advisor with authentication.
 */

const API_BASE = '/api';

// ── Token Management ──────────────────────────────────────────
const TOKEN_KEY = 'bridge_advisor_token';
const USER_KEY = 'bridge_advisor_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Auth API ──────────────────────────────────────────────────
export async function login(email, password, turnstileToken) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, turnstileToken }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Login failed');
  }

  const data = await res.json();
  setAuth(data.token, data.user);
  return data;
}

export function logout() {
  clearAuth();
}

export async function verifySession() {
  const token = getToken();
  if (!token) return { valid: false };

  try {
    const res = await fetch(`${API_BASE}/auth/verify`, {
      headers: authHeaders(),
    });
    return res.ok ? await res.json() : { valid: false };
  } catch {
    return { valid: false };
  }
}

export async function getAuthStatus() {
  try {
    const res = await fetch(`${API_BASE}/auth/status`);
    return res.ok ? await res.json() : { authEnabled: true };
  } catch {
    return { authEnabled: true };
  }
}

// ── Registration API ─────────────────────────────────────────
export async function register(email, password, name, inviteCode, turnstileToken) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, inviteCode: inviteCode || undefined, turnstileToken }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Registration failed');

  // If invite code was used, auto-login happened
  if (data.token) {
    setAuth(data.token, data.user);
  }
  return data;
}

// ── Password Reset API ───────────────────────────────────────
export async function requestPasswordReset(email, turnstileToken) {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, turnstileToken }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function confirmPasswordReset(token, password, turnstileToken) {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password, turnstileToken }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Reset failed');
  return data;
}

// ── Usage API ────────────────────────────────────────────────
export async function getUsage() {
  try {
    const res = await fetch(`${API_BASE}/usage`, { headers: authHeaders() });
    if (res.status === 401) { clearAuth(); return null; }
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// ── Admin API ────────────────────────────────────────────────
export async function getPendingUsers() {
  const res = await fetch(`${API_BASE}/admin/pending`, { headers: authHeaders() });
  return res.ok ? (await res.json()).users : [];
}

export async function approveUser(email, opts = {}) {
  const res = await fetch(`${API_BASE}/admin/approve/${encodeURIComponent(email)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(opts),
  });
  return res.ok;
}

export async function createInviteCode(opts = {}) {
  const res = await fetch(`${API_BASE}/admin/invite-codes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(opts),
  });
  return res.ok ? res.json() : null;
}

export async function getInviteCodes() {
  const res = await fetch(`${API_BASE}/admin/invite-codes`, { headers: authHeaders() });
  return res.ok ? (await res.json()).codes : [];
}

export async function getAdminUsage() {
  const res = await fetch(`${API_BASE}/admin/usage`, { headers: authHeaders() });
  return res.ok ? res.json() : null;
}

// ── Feedback API ─────────────────────────────────────────────
export async function submitFeedback({ category, message, browserInfo, pageUrl, turnstileToken, email }) {
  const res = await fetch(`${API_BASE}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ category, message, browserInfo, pageUrl, turnstileToken, email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to submit feedback');
  return data;
}

export async function getAdminFeedback(limit = 50, offset = 0) {
  const res = await fetch(`${API_BASE}/admin/feedback?limit=${limit}&offset=${offset}`, { headers: authHeaders() });
  return res.ok ? res.json() : { entries: [], total: 0 };
}

// ── Bridge API ────────────────────────────────────────────────
export async function getAdvice(prompt, { maxTokens = 1500, handContext = {} } = {}) {
  const res = await fetch(`${API_BASE}/advice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ prompt, maxTokens, handContext }),
  });

  if (res.status === 401) {
    clearAuth();
    throw new Error('Session expired. Please log in again.');
  }

  if (res.status === 429) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Daily analysis limit reached. Try again tomorrow.');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Server error: ${res.status}`);
  }

  return res.json();
}

// ── History API ───────────────────────────────────────────────
export async function getHistory({ limit = 50, offset = 0, type, scope } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', limit);
  if (offset) params.set('offset', offset);
  if (type) params.set('type', type);
  if (scope) params.set('scope', scope);

  const res = await fetch(`${API_BASE}/history?${params}`, {
    headers: authHeaders(),
  });

  if (res.status === 401) {
    clearAuth();
    throw new Error('Session expired. Please log in again.');
  }

  return res.ok ? res.json() : { entries: [], total: 0, hasMore: false };
}

export async function getHistoryEntry(id) {
  const res = await fetch(`${API_BASE}/history/${id}`, {
    headers: authHeaders(),
  });
  return res.ok ? res.json() : null;
}

export async function deleteHistoryEntry(id) {
  const res = await fetch(`${API_BASE}/history/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return res.ok;
}

export async function unshareHistoryEntry(id) {
  const res = await fetch(`${API_BASE}/history/${id}/share`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return res.ok;
}

export async function shareHistoryEntry(id) {
  const res = await fetch(`${API_BASE}/history/${id}/share`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return res.ok ? res.json() : null;
}

export async function getSharedEntry(token) {
  const res = await fetch(`${API_BASE}/share/${token}`);
  return res.ok ? res.json() : null;
}

export async function clearAllHistory() {
  const res = await fetch(`${API_BASE}/history`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return res.ok;
}

export async function healthCheck() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
