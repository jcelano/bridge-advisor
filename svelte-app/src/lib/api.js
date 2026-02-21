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
export async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
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
