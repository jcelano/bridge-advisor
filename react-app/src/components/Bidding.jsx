import React from 'react';
import { BID_LEVELS, BID_STRAINS, SUIT_SYMBOLS, SUIT_COLORS, SEAT_KEY } from '../bridge/constants.js';

/* ── Bid Chip (display a single bid) ──────────────────────── */
export function BidChip({ bid }) {
  const lo = bid.toLowerCase();

  if (lo === 'pass') {
    return <span className="bid-chip bid-pass">Pass</span>;
  }
  if (lo === 'x' || lo === 'dbl') {
    return <span className="bid-chip bid-dbl">Dbl</span>;
  }
  if (lo === 'xx' || lo === 'rdbl') {
    return <span className="bid-chip bid-rdbl">Rdbl</span>;
  }

  const level = bid[0];
  const strain = bid.slice(1).toUpperCase();
  const suitKey = strain === 'NT' ? null : strain[0];
  const color = suitKey ? SUIT_COLORS[suitKey] : '#d4af37';

  return (
    <span className="bid-chip" style={{
      background: '#101828',
      color: color,
      border: `1px solid ${color}30`,
    }}>
      {level}{suitKey ? SUIT_SYMBOLS[suitKey] : 'NT'}
    </span>
  );
}

/* ── Auction Display Grid ─────────────────────────────────── */
export function AuctionDisplay({ auction, dealerSeat }) {
  if (!auction.length) {
    return <div style={{ color: '#445', fontSize: 13, fontStyle: 'italic' }}>No bids yet</div>;
  }

  const order = ['N', 'E', 'S', 'W'];
  const dealerIdx = order.indexOf(SEAT_KEY[dealerSeat] || 'S');
  const headers = Array.from({ length: 4 }, (_, i) => order[(dealerIdx + i) % 4]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, maxWidth: 280 }}>
      {headers.map(h => (
        <div key={h} style={{
          fontSize: 11, color: '#6a7a8a', fontWeight: 700,
          textAlign: 'center', paddingBottom: 4, borderBottom: '1px solid #1a2a3a',
        }}>
          {h}
        </div>
      ))}
      {auction.map((bid, i) => (
        <div key={i} style={{ textAlign: 'center', padding: '3px 0' }}>
          <BidChip bid={bid} />
        </div>
      ))}
    </div>
  );
}

/* ── Bidding Box (input) ──────────────────────────────────── */
export function BiddingBox({ onBid, auction }) {
  // Find highest bid index
  let highestIdx = -1;
  auction.forEach(b => {
    const lo = b.toLowerCase();
    if (['pass', 'x', 'dbl', 'xx', 'rdbl'].includes(lo)) return;
    const lvl = parseInt(b[0]);
    const strain = b.slice(1).toUpperCase();
    const si = BID_STRAINS.indexOf(strain);
    if (si < 0) return;
    const idx = (lvl - 1) * 5 + si;
    if (idx > highestIdx) highestIdx = idx;
  });

  // Determine if double/redouble are legal
  const lastNonPass = [...auction].reverse().find(b => b.toLowerCase() !== 'pass');
  const canDouble = lastNonPass
    && !['x', 'dbl', 'xx', 'rdbl', 'pass'].includes((lastNonPass || '').toLowerCase())
    && highestIdx >= 0;
  const canRedouble = lastNonPass
    && ['x', 'dbl'].includes((lastNonPass || '').toLowerCase());

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 }}>
        {BID_LEVELS.map(level =>
          BID_STRAINS.map(strain => {
            const idx = (parseInt(level) - 1) * 5 + BID_STRAINS.indexOf(strain);
            const disabled = idx <= highestIdx;
            const suitKey = strain === 'NT' ? null : strain[0];
            const color = suitKey ? SUIT_COLORS[suitKey] : '#d4af37';

            return (
              <button
                key={level + strain}
                onClick={() => !disabled && onBid(level + strain)}
                disabled={disabled}
                style={{
                  width: 46, height: 34, borderRadius: 5, fontSize: 12, fontWeight: 700,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  background: disabled ? '#0a0a10' : '#101828',
                  border: `1px solid ${disabled ? '#1a1a24' : color + '40'}`,
                  color: disabled ? '#2a2a34' : color,
                  transition: 'all 0.12s',
                }}
              >
                {level}{suitKey ? SUIT_SYMBOLS[suitKey] : 'NT'}
              </button>
            );
          })
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => onBid('Pass')} style={actionBtnStyle('#0d1f0d', '#4a9', '#1a3a2a', true)}>
          Pass
        </button>
        <button
          onClick={() => canDouble && onBid('X')}
          disabled={!canDouble}
          style={actionBtnStyle('#1f0d0d', canDouble ? '#e66' : '#333', '#2a1a1a', canDouble)}
        >
          Dbl
        </button>
        <button
          onClick={() => canRedouble && onBid('XX')}
          disabled={!canRedouble}
          style={actionBtnStyle('#1f0d1f', canRedouble ? '#c6c' : '#333', '#2a1a2a', canRedouble)}
        >
          Rdbl
        </button>
      </div>
    </div>
  );
}

function actionBtnStyle(bg, color, borderColor, enabled) {
  return {
    padding: '6px 16px',
    borderRadius: 5,
    background: enabled ? bg : '#0a0a10',
    color,
    border: `1px solid ${borderColor}`,
    fontSize: 13,
    fontWeight: 600,
    cursor: enabled ? 'pointer' : 'not-allowed',
  };
}
