import React from 'react';
import { SUITS, SUIT_SYMBOLS, SUIT_COLORS, countHCP } from '../bridge/constants.js';

export default function HandDisplay({ hand, label }) {
  if (!hand || !SUITS.some(s => (hand[s] || []).length > 0)) return null;

  return (
    <div style={{
      padding: '8px 12px',
      background: '#0a1018',
      borderRadius: 8,
      border: '1px solid #1a2a3a',
    }}>
      <div style={{
        fontSize: 11,
        color: '#6a7a8a',
        marginBottom: 4,
        letterSpacing: 1,
        fontWeight: 600,
      }}>
        {label} — {countHCP(hand)} HCP
      </div>
      {SUITS.map(suit => (
        <div key={suit} style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: '22px' }}>
          <span style={{ color: SUIT_COLORS[suit], fontSize: 17 }}>{SUIT_SYMBOLS[suit]}</span>
          <span style={{
            color: '#d0dae4',
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: 2,
            fontFamily: 'monospace',
          }}>
            {(hand[suit] || []).join(' ') || '—'}
          </span>
        </div>
      ))}
    </div>
  );
}
