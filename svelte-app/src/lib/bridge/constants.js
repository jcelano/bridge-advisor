// ── Suit & Card Constants ──────────────────────────────────────
export const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_COLORS = { S: '#c8d6e5', H: '#e74c3c', D: '#f39c12', C: '#2ecc71' };
export const SUITS = ['S', 'H', 'D', 'C'];
export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// ── Seats & Game Constants ────────────────────────────────────
export const SEATS = ['North', 'East', 'South', 'West'];
export const SEAT_KEY = { North: 'N', East: 'E', South: 'S', West: 'W' };
export const SEAT_NAME = { N: 'North', E: 'East', S: 'South', W: 'West' };
export const PARTNER = { N: 'S', E: 'W', S: 'N', W: 'E' };
export const VULNERABILITIES = ['None', 'N-S', 'E-W', 'Both'];
export const BID_LEVELS = ['1', '2', '3', '4', '5', '6', '7'];
export const BID_STRAINS = ['C', 'D', 'H', 'S', 'NT'];

// ── Hand Utilities ────────────────────────────────────────────
export function countHCP(hand) {
  const values = { A: 4, K: 3, Q: 2, J: 1 };
  let hcp = 0;
  SUITS.forEach(s => (hand[s] || []).forEach(c => { hcp += values[c] || 0; }));
  return hcp;
}

export function totalCards(hand) {
  return SUITS.reduce((n, s) => n + (hand[s] || []).length, 0);
}

export function emptyHand() {
  return { S: [], H: [], D: [], C: [] };
}

export function handHasCards(hand) {
  return hand && SUITS.some(s => (hand[s] || []).length > 0);
}

// Distribution points (for suit contracts)
export function countDistPoints(hand) {
  let pts = 0;
  SUITS.forEach(s => {
    const len = (hand[s] || []).length;
    if (len === 0) pts += 3;      // void
    else if (len === 1) pts += 2;  // singleton
    else if (len === 2) pts += 1;  // doubleton
  });
  return pts;
}

// Collect all used cards across multiple hands into a Set
export function getUsedCards(...hands) {
  const used = new Set();
  hands.forEach(hand => {
    if (!hand) return;
    SUITS.forEach(suit => {
      (hand[suit] || []).forEach(r => used.add(suit + r));
    });
  });
  return used;
}
