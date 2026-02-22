/**
 * Parse PBN (Portable Bridge Notation) text into a structured game state.
 * 
 * PBN is the standard export format used by Trickster Cards and many other
 * bridge software tools.
 * 
 * Reference: https://tistis.nl/pbn/
 */
export function parsePBN(text) {
  const state = {
    event: '',
    site: '',
    date: '',
    dealer: '',
    vulnerability: '',
    deal: {},
    auction: [],
    auctionStart: '',
    contract: '',
    declarer: '',
    played: [],
    result: '',
    scoring: '',
    playStart: '',
  };

  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(/\[(\w+)\s+"([^"]*)"\]/);
    if (!match) continue;

    const [, tag, value] = match;

    switch (tag) {
      case 'Event':
        state.event = value;
        break;
      case 'Site':
        state.site = value;
        break;
      case 'Date':
        state.date = value;
        break;
      case 'Dealer':
        state.dealer = value;
        break;
      case 'Vulnerable':
        state.vulnerability = value;
        break;
      case 'Scoring':
        state.scoring = value;
        break;
      case 'Contract':
        state.contract = value;
        break;
      case 'Declarer':
        state.declarer = value;
        break;
      case 'Result':
        state.result = value;
        break;

      case 'Deal':
        state.deal = parseDealString(value);
        break;

      case 'Auction':
        state.auctionStart = value;
        state.auction = parseSubsequentLines(lines, i + 1);
        break;

      case 'Play':
        state.playStart = value;
        state.played = parsePlayLines(lines, i + 1);
        break;
    }
  }

  // ── Derive missing fields ──────────────────────────────
  const seatOrder = ['N', 'E', 'S', 'W'];

  // If declarer is missing, infer from contract + auction.
  // The declarer is the first player on the declaring side who bid the trump suit.
  if (!state.declarer && state.contract && state.auctionStart && state.auction.length) {
    const strain = state.contract.replace(/^\d/, '').replace(/X+$/, '').toUpperCase();
    const declaringSide = inferDeclaringSide(state.auction, state.auctionStart, strain, seatOrder);
    if (declaringSide) state.declarer = declaringSide;
  }

  // If playStart is empty, the opening leader is LHO of declarer (clockwise from declarer).
  if (!state.playStart && state.declarer) {
    const idx = seatOrder.indexOf(state.declarer);
    if (idx >= 0) state.playStart = seatOrder[(idx + 1) % 4]; // LHO = one step clockwise
  }

  return state;
}

/**
 * Infer the declarer seat from the auction.
 * The declarer is the first player on the side that won the auction
 * who bid the final contract's strain.
 */
function inferDeclaringSide(auction, auctionStart, strain, seatOrder) {
  const startIdx = seatOrder.indexOf(auctionStart);
  if (startIdx < 0) return null;

  // Find the final contract bid (last non-pass, non-double, non-redouble)
  let finalBidIdx = -1;
  let finalBid = null;
  const bidRe = /^\d(NT|N|S|H|D|C)$/i;
  for (let i = 0; i < auction.length; i++) {
    if (bidRe.test(auction[i])) { finalBidIdx = i; finalBid = auction[i]; }
  }
  if (finalBidIdx < 0) return null;

  const finalStrain = finalBid.slice(1).toUpperCase();
  const winningSeat = seatOrder[(startIdx + finalBidIdx) % 4];
  const winningSide = (winningSeat === 'N' || winningSeat === 'S') ? ['N', 'S'] : ['E', 'W'];

  // Declarer = first player on winning side who bid that strain
  for (let i = 0; i < auction.length; i++) {
    const seat = seatOrder[(startIdx + i) % 4];
    if (!winningSide.includes(seat)) continue;
    const bid = auction[i];
    if (bidRe.test(bid) && bid.slice(1).toUpperCase() === finalStrain) return seat;
  }

  return winningSeat; // fallback to whoever made the final bid
}

/**
 * Parse the Deal tag value.
 * Format: "N:AKQ2.J93.T87.A65 KJ4.AKT2.Q93.KJ8 T98.876.6542.QT3 765.Q54.AKJ.9742"
 * First character is the starting seat, followed by hands in clockwise order.
 * Suits are separated by dots in order: Spades.Hearts.Diamonds.Clubs
 */
function parseDealString(dealStr) {
  const deal = {};
  const parts = dealStr.split(/[: ]/);
  const startSeat = parts[0];
  const seatOrder = ['N', 'E', 'S', 'W'];
  const startIdx = seatOrder.indexOf(startSeat);

  for (let j = 1; j <= 4 && j < parts.length; j++) {
    const suits = (parts[j] || '').split('.');
    const seat = seatOrder[(startIdx + j - 1) % 4];
    deal[seat] = {
      S: suits[0] ? suits[0].split('') : [],
      H: suits[1] ? suits[1].split('') : [],
      D: suits[2] ? suits[2].split('') : [],
      C: suits[3] ? suits[3].split('') : [],
    };
  }

  return deal;
}

/**
 * Parse auction lines (bids) following the [Auction] tag.
 * Bids are space-separated, one or more per line, until a blank line or new tag.
 * Filters out annotation markers like "*".
 */
function parseSubsequentLines(lines, startIdx) {
  const bids = [];
  for (let j = startIdx; j < lines.length; j++) {
    const line = lines[j].trim();
    if (!line || line.startsWith('[')) break;
    line.split(/\s+/).forEach(bid => {
      if (bid && bid !== '*' && bid !== '-') {
        bids.push(bid);
      }
    });
  }
  return bids;
}

/**
 * Parse play lines following the [Play] tag.
 * Each line typically represents one trick with four cards.
 */
function parsePlayLines(lines, startIdx) {
  const plays = [];
  for (let j = startIdx; j < lines.length; j++) {
    const line = lines[j].trim();
    if (!line || line.startsWith('[')) break;
    if (line !== '*') {
      plays.push(line);
    }
  }
  return plays;
}

/**
 * Generate PBN text from a game state object.
 * Useful for exporting/sharing hands.
 */
export function generatePBN(state) {
  let pbn = '';
  
  if (state.event) pbn += `[Event "${state.event}"]\n`;
  pbn += `[Dealer "${state.dealer || 'S'}"]\n`;
  pbn += `[Vulnerable "${state.vulnerability || 'None'}"]\n`;
  
  // Build deal string
  if (state.deal && Object.keys(state.deal).length > 0) {
    const seatOrder = ['N', 'E', 'S', 'W'];
    const hands = seatOrder.map(seat => {
      const h = state.deal[seat] || { S: [], H: [], D: [], C: [] };
      return ['S', 'H', 'D', 'C'].map(s => (h[s] || []).join('')).join('.');
    });
    pbn += `[Deal "N:${hands.join(' ')}"]\n`;
  }
  
  if (state.contract) pbn += `[Contract "${state.contract}"]\n`;
  if (state.declarer) pbn += `[Declarer "${state.declarer}"]\n`;
  if (state.result) pbn += `[Result "${state.result}"]\n`;
  
  if (state.auction?.length) {
    pbn += `[Auction "${state.auctionStart || state.dealer || 'S'}"]\n`;
    for (let i = 0; i < state.auction.length; i += 4) {
      pbn += state.auction.slice(i, i + 4).join(' ') + '\n';
    }
  }
  
  if (state.played?.length) {
    const seatOrder = ['N', 'E', 'S', 'W'];
    let playStart = state.playStart;
    if (!playStart && state.declarer) {
      const idx = seatOrder.indexOf(state.declarer);
      if (idx >= 0) playStart = seatOrder[(idx + 1) % 4];
    }
    pbn += `[Play "${playStart || ''}"]\n`;
    state.played.forEach(trick => {
      pbn += trick + '\n';
    });
  }
  
  return pbn;
}
