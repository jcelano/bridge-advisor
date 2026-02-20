import { SUIT_SYMBOLS, SUITS, SEAT_KEY, countHCP, totalCards } from './constants.js';

/**
 * Build a structured prompt for Claude to analyze a bridge situation.
 */
export function buildPrompt(gameState, adviceType, mySeat) {
  const sections = [];

  // Header
  sections.push('Analyze the following bridge situation and provide clear, actionable advice.');
  sections.push('');

  // Game context
  sections.push(`My Seat: ${mySeat}`);
  sections.push(`Dealer: ${gameState.dealer || 'Unknown'}`);
  sections.push(`Vulnerability: ${gameState.vulnerability || 'None'}`);
  if (gameState.conventionSystem) {
    sections.push(`Convention System: ${gameState.conventionSystem}`);
  }
  sections.push('');

  // My hand
  const myKey = SEAT_KEY[mySeat] || mySeat[0];
  const myHand = gameState.deal?.[myKey];
  if (myHand && SUITS.some(s => (myHand[s] || []).length > 0)) {
    sections.push('My Hand:');
    SUITS.forEach(s => {
      sections.push(`  ${SUIT_SYMBOLS[s]} ${(myHand[s] || []).join('') || 'void'}`);
    });
    const hcp = countHCP(myHand);
    const cards = totalCards(myHand);
    const distribution = SUITS.map(s => (myHand[s] || []).length).join('-');
    sections.push(`  (${hcp} HCP, ${cards} cards, ${distribution} distribution)`);
    sections.push('');
  }

  // Dummy hand
  if (gameState.dummySeat) {
    const dummyKey = SEAT_KEY[gameState.dummySeat] || gameState.dummySeat[0];
    const dummyHand = gameState.deal?.[dummyKey];
    if (dummyHand && SUITS.some(s => (dummyHand[s] || []).length > 0)) {
      sections.push(`Dummy (${gameState.dummySeat}):`);
      SUITS.forEach(s => {
        sections.push(`  ${SUIT_SYMBOLS[s]} ${(dummyHand[s] || []).join('') || 'void'}`);
      });
      const hcp = countHCP(dummyHand);
      const distribution = SUITS.map(s => (dummyHand[s] || []).length).join('-');
      sections.push(`  (${hcp} HCP, ${distribution} distribution)`);
      sections.push('');
    }
  }

  // Bidding sequence
  if (gameState.auction?.length) {
    sections.push(`Bidding Sequence (starting with ${gameState.auctionStart || gameState.dealer || 'dealer'}):`);
    
    // Display as a formatted table
    const order = ['N', 'E', 'S', 'W'];
    const dealerIdx = order.indexOf((gameState.auctionStart || gameState.dealer || 'S')[0]);
    const headerLine = '  ' + order.map((_, i) => order[(dealerIdx + i) % 4].padEnd(10)).join('');
    sections.push(headerLine);
    
    for (let i = 0; i < gameState.auction.length; i += 4) {
      const row = gameState.auction.slice(i, i + 4).map(b => b.padEnd(10)).join('');
      sections.push('  ' + row);
    }
    sections.push('');
  }

  // Contract
  if (gameState.contract) {
    let contractLine = `Contract: ${gameState.contract}`;
    if (gameState.declarer) contractLine += ` by ${gameState.declarer}`;
    sections.push(contractLine);
    sections.push('');
  }

  // Tricks played
  if (gameState.played?.length) {
    sections.push('Tricks played so far:');
    gameState.played.forEach((trick, i) => {
      sections.push(`  Trick ${i + 1}: ${trick}`);
    });
    sections.push('');
  }

  // The question
  sections.push(`Question: ${getQuestion(adviceType)}`);

  return sections.join('\n');
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

Cover:
- Was the bidding reasonable? What would you have bid differently?
- Evaluate the opening lead
- Assess the declarer play — was the right line chosen?
- Assess the defense — were there missed opportunities?
- What was the optimal result on this hand?

Be specific and constructive.`,
  };

  return questions[adviceType] || questions.bid;
}
