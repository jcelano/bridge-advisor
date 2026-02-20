import React, { useState } from 'react';
import { login } from '../api.js';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);
      onLogin(result.user);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#080c12',
    }}>
      <div style={{
        width: 380, background: '#0c1219', borderRadius: 16,
        border: '1px solid #1a2430', padding: 32,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, color: '#d4af37', marginBottom: 8 }}>♠</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#d4af37', margin: 0 }}>The Stayman Whisperer</h1>
          <p style={{ fontSize: 12, color: '#4a6a4a', marginTop: 4 }}>Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: '#6a7a8a', display: 'block', marginBottom: 4 }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              style={{
                width: '100%', padding: '10px 12px', background: '#101820', color: '#c0d0e0',
                border: '1px solid #1a2a3a', borderRadius: 8, fontSize: 14, outline: 'none',
                boxSizing: 'border-box',
              }}
              placeholder="you@example.com"
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: '#6a7a8a', display: 'block', marginBottom: 4 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px 12px', background: '#101820', color: '#c0d0e0',
                border: '1px solid #1a2a3a', borderRadius: 8, fontSize: 14, outline: 'none',
                boxSizing: 'border-box',
              }}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div style={{
              background: '#1f0d0d', border: '1px solid #3a1a1a', borderRadius: 8,
              padding: '8px 12px', marginBottom: 16, color: '#e66', fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '12px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #d4af37, #a08520)', color: '#0a0a10',
              fontSize: 15, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
