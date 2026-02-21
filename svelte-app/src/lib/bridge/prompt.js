import { SUIT_SYMBOLS, SUITS, SEAT_KEY, SEAT_NAME, countHCP, totalCards } from './constants.js';

/**
 * Build a structured prompt for Claude to analyze a bridge situation.
 */
export function buildPrompt(gameState, adviceType, mySeat) {
  const sections = [];

  sections.push('You are analyzing a bridge hand. The player asking for advice is sitting ' + mySeat + '.');
  sections.push('Use standard bridge terminology and be specific about cards and tricks.');
  sections.push('');

  // Game context
  sections.push('--- GAME CONTEXT ---');
  sections.push(`Requesting player's seat: ${mySeat}`);
  sections.push(`Dealer: ${gameState.dealer || 'Unknown'}`);
  sections.push(`Vulnerability: ${gameState.vulnerability || 'None'}`);
  if (gameState.conventionSystem) {
    sections.push(`Bidding system: ${gameState.conventionSystem}`);
  }
  sections.push('');

  // ── Hands ─────────────────────────────────────────────
  const myKey = SEAT_KEY[mySeat] || mySeat[0];
  const allSeats = ['N', 'E', 'S', 'W'];
  const deal = gameState.deal || {};
  const hasFourHands = allSeats.every(s => deal[s] && SUITS.some(su => (deal[s][su] || []).length > 0));

  // For full analysis of completed hands, show all four hands
  if (adviceType === 'analyze' && hasFourHands) {
    sections.push('--- ALL FOUR HANDS ---');
    allSeats.forEach(seat => {
      const hand = deal[seat];
      const name = SEAT_NAME[seat] || seat;
      const hcp = countHCP(hand);
      const dist = SUITS.map(s => (hand[s] || []).length).join('-');
      const isMe = seat === myKey ? ' ← requesting player' : '';
      sections.push(`${name}${isMe} (${hcp} HCP, ${dist} shape):`);
      SUITS.forEach(s => {
        sections.push(`  ${SUIT_SYMBOLS[s]} ${(hand[s] || []).join(' ') || '—'}`);
      });
      sections.push('');
    });
  } else {
    sections.push('--- HANDS ---');
    // Show my hand
    const myHand = deal[myKey];
    if (myHand && SUITS.some(s => (myHand[s] || []).length > 0)) {
      const hcp = countHCP(myHand);
      const cards = totalCards(myHand);
      const distribution = SUITS.map(s => (myHand[s] || []).length).join('-');
      sections.push(`${mySeat}'s hand (${hcp} HCP, ${cards} cards, ${distribution} shape):`);
      SUITS.forEach(s => {
        sections.push(`  ${SUIT_SYMBOLS[s]} ${(myHand[s] || []).join(' ') || '—'}`);
      });
      sections.push('');
    }

    // Show dummy if visible
    if (gameState.dummySeat) {
      const dummyKey = SEAT_KEY[gameState.dummySeat] || gameState.dummySeat[0];
      const dummyHand = deal[dummyKey];
      if (dummyHand && SUITS.some(s => (dummyHand[s] || []).length > 0)) {
        const hcp = countHCP(dummyHand);
        const distribution = SUITS.map(s => (dummyHand[s] || []).length).join('-');
        sections.push(`Dummy — ${gameState.dummySeat} (${hcp} HCP, ${distribution} shape):`);
        SUITS.forEach(s => {
          sections.push(`  ${SUIT_SYMBOLS[s]} ${(dummyHand[s] || []).join(' ') || '—'}`);
        });
        sections.push('');
      }
    }
  }

  // ── Bidding ───────────────────────────────────────────
  if (gameState.auction?.length) {
    const order = ['N', 'E', 'S', 'W'];
    const seatFullName = { N: 'North', E: 'East', S: 'South', W: 'West' };
    const dealerKey = (gameState.auctionStart || gameState.dealer || 'S')[0].toUpperCase();
    const dealerIdx = order.indexOf(dealerKey);
    const rotated = order.map((_, i) => order[(dealerIdx + i) % 4]);
    sections.push(`--- AUCTION (dealer: ${seatFullName[dealerKey] || dealerKey}) ---`);
    const colWidth = 10;
    const headerLine = rotated.map(s => seatFullName[s].padEnd(colWidth)).join('');
    sections.push(headerLine);
    // Pad the first row so bids align under the correct seat column
    const padBids = new Array(dealerIdx).fill('').concat(gameState.auction);
    for (let i = 0; i < padBids.length; i += 4) {
      const row = padBids.slice(i, i + 4).map(b => (b || '').padEnd(colWidth)).join('');
      if (row.trim()) sections.push(row);
    }
    sections.push('');
  }

  // ── Contract ──────────────────────────────────────────
  if (gameState.contract) {
    sections.push('--- CONTRACT ---');
    let contractLine = `${gameState.contract}`;
    if (gameState.declarer) contractLine += ` by ${SEAT_NAME[gameState.declarer] || gameState.declarer}`;
    sections.push(contractLine);
    sections.push('');
  }

  // ── Play & Trick Analysis ─────────────────────────────
  if (gameState.played?.length) {
    const trumpSuit = extractTrumpSuit(gameState.contract);
    const declarer = gameState.declarer;
    const playStartSeat = gameState.playStart; // seat that leads to trick 1

    const analysis = analyzeTricks(gameState.played, trumpSuit, declarer, playStartSeat);

    sections.push('--- PLAY RECORD ---');
    analysis.tricks.forEach((trick, i) => {
      const cardDesc = trick.seatCards
        ? trick.seatCards.map(sc => `${SEAT_NAME[sc.seat] || sc.seat}:${sc.raw}`).join('  ')
        : trick.cards.join('  ');
      const wonBy = trick.winner ? ` → won by ${SEAT_NAME[trick.winner] || trick.winner}` : '';
      sections.push(`  Trick ${i + 1}: ${cardDesc}${wonBy}`);
    });
    sections.push('');

    if (declarer) {
      const declarerSide = declarer === 'N' || declarer === 'S' ? 'N-S' : 'E-W';
      const needed = extractTricksNeeded(gameState.contract);
      sections.push(`Result: Declarer (${declarerSide}) won ${analysis.declarerTricks} of 13 tricks.`);
      if (needed > 0) {
        const diff = analysis.declarerTricks - needed;
        if (diff >= 0) {
          sections.push(`Contract ${gameState.contract} was MADE${diff > 0 ? ` with ${diff} overtrick${diff > 1 ? 's' : ''}` : ''}.`);
        } else {
          sections.push(`Contract ${gameState.contract} was SET by ${Math.abs(diff)} trick${Math.abs(diff) > 1 ? 's' : ''} (down ${Math.abs(diff)}).`);
        }
      }
    }

    // If we have an explicit result from PBN, include it as well
    if (gameState.result) {
      sections.push(`PBN Result tag: ${gameState.result} tricks won by declarer.`);
    }
    sections.push('');
  } else if (gameState.result) {
    // No play record but we have a result
    const needed = extractTricksNeeded(gameState.contract);
    const result = parseInt(gameState.result);
    if (!isNaN(result) && needed > 0) {
      const diff = result - needed;
      if (diff >= 0) {
        sections.push(`Result: Made ${gameState.contract}${diff > 0 ? ` +${diff}` : ''} (${result} tricks).`);
      } else {
        sections.push(`Result: Down ${Math.abs(diff)} in ${gameState.contract} (${result} tricks).`);
      }
      sections.push('');
    }
  }

  // ── Question ──────────────────────────────────────────
  sections.push(`Question: ${getQuestion(adviceType)}`);

  return sections.join('\n');
}

// ── Helpers ───────────────────────────────────────────────

/**
 * Extract trump suit from contract string like "4H", "3NT", "6S"
 * Returns null for notrump.
 */
function extractTrumpSuit(contract) {
  if (!contract) return null;
  const match = contract.match(/\d(NT|N|S|H|D|C)/i);
  if (!match) return null;
  const strain = match[1].toUpperCase();
  if (strain === 'NT' || strain === 'N') return null;
  return strain;
}

/**
 * Extract the number of tricks needed to make the contract.
 * Level + 6. e.g., 4H = 10 tricks needed.
 */
function extractTricksNeeded(contract) {
  if (!contract) return 0;
  const match = contract.match(/(\d)/);
  return match ? parseInt(match[1]) + 6 : 0;
}

/**
 * PBN Play format: each line is a trick with 4 cards.
 * Card format: suit letter + rank, e.g., "C3 CK C4 C8"
 * The Play tag specifies the opening leader.
 *
 * Analyze who won each trick and count declarer tricks.
 */
function analyzeTricks(playLines, trumpSuit, declarer, playStartSeat) {
  // PBN play lines: the first card in each trick is led by the leader
  // Column order is always N E S W (PBN standard)
  const seatOrder = ['N', 'E', 'S', 'W'];
  const tricks = [];
  let declarerTricks = 0;
  let defenseTricks = 0;

  const isDeclarerSide = (seat) => {
    if (!declarer) return false;
    if (declarer === 'N' || declarer === 'S') return seat === 'N' || seat === 'S';
    return seat === 'E' || seat === 'W';
  };

  // Rank ordering for comparison
  const rankOrder = '23456789TJQKA';
  const rankValue = (r) => rankOrder.indexOf(r.toUpperCase());

  let leader = (playStartSeat || 'N').toUpperCase();
  if (!seatOrder.includes(leader)) leader = 'N';

  for (const line of playLines) {
    // Parse 4 cards from the line (format: "C3 CK C4 C8")
    const cardTokens = line.trim().replace(/\.$/, '').split(/\s+/);
    if (cardTokens.length < 4) continue;

    const startIdx = seatOrder.indexOf(leader);
    const trickOrder = [
      seatOrder[startIdx],
      seatOrder[(startIdx + 1) % 4],
      seatOrder[(startIdx + 2) % 4],
      seatOrder[(startIdx + 3) % 4],
    ];

    const cards = [];
    for (let i = 0; i < 4; i++) {
      const token = cardTokens[i];
      if (!token || token === '-') {
        cards.push({ seat: trickOrder[i], suit: null, rank: null, raw: '-' });
      } else {
        cards.push({
          seat: trickOrder[i],
          suit: token[0].toUpperCase(),
          rank: token.slice(1).toUpperCase(),
          raw: token,
        });
      }
    }

    // Determine the lead suit (first non-null card's suit)
    const leadCard = cards.find(c => c.suit);
    const leadSuit = leadCard ? leadCard.suit : null;

    // Determine winner
    let winner = null;
    let bestRank = -1;
    let bestIsTrump = false;

    for (const card of cards) {
      if (!card.suit) continue;
      const isTrump = trumpSuit && card.suit === trumpSuit;
      const rv = rankValue(card.rank);

      if (isTrump && !bestIsTrump) {
        // Trump beats non-trump
        winner = card.seat;
        bestRank = rv;
        bestIsTrump = true;
      } else if (isTrump && bestIsTrump && rv > bestRank) {
        // Higher trump
        winner = card.seat;
        bestRank = rv;
      } else if (!isTrump && !bestIsTrump && card.suit === leadSuit && rv > bestRank) {
        // Higher card in lead suit (no trump played yet)
        winner = card.seat;
        bestRank = rv;
      }
      // Off-suit non-trump: doesn't win
    }

    if (winner && isDeclarerSide(winner)) {
      declarerTricks++;
    } else if (winner) {
      defenseTricks++;
    }

    tricks.push({
      cards: cards.map(c => c.raw),
      seatCards: cards.map(c => ({ seat: c.seat, raw: c.raw })),
      winner,
      leadSuit,
    });

    if (winner) leader = winner;
  }

  return { tricks, declarerTricks, defenseTricks };
}

function getQuestion(adviceType) {
  const questions = {
    bid: `What should I bid next and why?

Consider:
- My point count (HCP + distribution) and hand shape
- The bidding system in use (SAYC or 2/1 Game Forcing)
- What the auction has revealed about all four hands
- Fit with partner's shown suit(s)
- Vulnerability and scoring implications
- Whether we should be in game, slam, or partscore

Provide step-by-step reasoning, then give your recommended bid.`,

    lead: `What should I lead and why?

Consider:
- What the auction has told us about declarer's and dummy's hands
- Standard opening lead conventions (4th best, top of sequence, etc.)
- My hand shape and honor holdings
- Whether to lead partner's suit if they bid
- Passive vs. aggressive leads given the auction
- What information my lead will convey to partner

Recommend a specific card and explain your reasoning.`,

    play: `What card should I play next and why?

Consider:
- The contract and how many tricks declarer/defense needs
- Cards visible in dummy (if shown)
- Cards already played and what they reveal
- Counting tricks and establishing winners
- Timing of entries and transportation
- Defensive signals if I'm defending

Recommend a specific card and explain the line of play.`,

    analyze: `Give a complete post-mortem analysis of this hand.

Structure your response as follows:

**Bidding** — Was the auction reasonable given the system in use? What would expert bidding look like?
**Opening Lead** — Was the lead correct? What was the best lead and why?
**Declarer Play** — Was the right line chosen? Identify any errors or missed opportunities.
**Defense** — Did the defenders find the best play throughout? Any missed shots?
**Result** — What was the actual result vs. the double-dummy optimal result?
**Lessons** — One or two key takeaways from this hand.

**Grades**
End your analysis with a "Grades" section using letter grades (A through F):
- Bidding (North-South): [grade] — one-sentence justification
- Bidding (East-West): [grade] — one-sentence justification
- Declarer Play: [grade] — one-sentence justification
- Defense: [grade] — one-sentence justification

Be specific and constructive. Reference exact cards and trick numbers.`,
  };

  return questions[adviceType] || questions.bid;
}
