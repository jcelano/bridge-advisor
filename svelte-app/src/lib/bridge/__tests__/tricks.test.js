/**
 * Unit tests for analyzeTricks() and extractTrumpSuit().
 *
 * Test cases use real PBN play records from two Trickster hands:
 *
 *   PBN-12  2S by South   [Play "W"]   → N-S makes +2 overtricks (10 declarerTricks)
 *   PBN-13  3NT by South  [Play "W"]   → N-S makes exactly  (9 declarerTricks)
 *
 * The bugs we are guarding against:
 *   1. Lead-suit taken from column 0 instead of the actual leader's card.
 *      After trick 1 the leader rotates but PBN columns stay fixed, so
 *      cards[0] is not always the leader.  (Caused trick 8 to show ♣2 winning.)
 *
 *   2. Rank comparison using AKQJT… order (A = 0) instead of 23456789TJQKA
 *      (A = 12), making twos beat aces.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { analyzeTricks, extractTrumpSuit, extractTricksNeeded } from '$lib/bridge/prompt.js';

// ─── PBN-12 raw data ─────────────────────────────────────────────────────────
// [Deal "N:863.K753.Q92.T97 Q4.8642.AKJT53.4 AKT92.AQT.7.K853 J75.J9.864.AQJ62"]
// [Contract "2S"] [Declarer "S"] [Play "W"]
const PBN12_PLAY = [
  'H9 H3 H2 HA',    // trick  1
  'HJ HK H4 HT',   // trick  2
  'S5 S8 S4 SA',   // trick  3
  'S7 S3 SQ SK',   // trick  4
  'SJ S6 D3 ST',   // trick  5
  'CA C7 C4 C3',   // trick  6
  'CQ C9 D5 CK',   // trick  7
  'C2 H5 H6 HQ',   // trick  8  ← was wrong: showed ♣2 winning
  'C6 CT DT C5',   // trick  9
  'CJ H7 H8 S2',   // trick 10
  'D4 D2 DJ C8',   // trick 11
  'D6 D9 DK S9',   // trick 12
  'D8 DQ DA D7',   // trick 13
];

// ─── PBN-13 raw data ─────────────────────────────────────────────────────────
// [Deal "E:K8643.63.Q32.AJ9 AQ.QJ5.KJ94.Q876 JT752.K982.87.T3 9.AT74.AT65.K542"]
// [Contract "3NT"] [Declarer "S"] [Play "W"]
const PBN13_PLAY = [
  'S5 S9 SK SA',   // trick  1
  'HK HA H3 HQ',  // trick  2
  'H2 H4 H6 HJ',  // trick  3
  'H8 HT C9 H5',  // trick  4
  'H9 H7 CJ C6',  // trick  5
  'S2 C2 S8 SQ',  // trick  6
  'D7 DA D2 DJ',  // trick  7
  'D8 DT DQ DK',  // trick  8
  'C3 D5 D3 D9',  // trick  9
  'CT D6 S3 D4',  // trick 10
  'S7 C4 CA C7',  // trick 11
  'ST C5 S6 C8',  // trick 12
  'SJ CK S4 CQ',  // trick 13
];

// ─── extractTrumpSuit ────────────────────────────────────────────────────────
describe('extractTrumpSuit', () => {
  it('returns S for 2S', () => expect(extractTrumpSuit('2S')).toBe('S'));
  it('returns H for 4H', () => expect(extractTrumpSuit('4H')).toBe('H'));
  it('returns D for 3D', () => expect(extractTrumpSuit('3D')).toBe('D'));
  it('returns C for 5C', () => expect(extractTrumpSuit('5C')).toBe('C'));
  it('returns null for 3NT', () => expect(extractTrumpSuit('3NT')).toBeNull());
  it('returns null for falsy', () => expect(extractTrumpSuit(null)).toBeNull());
});

// ─── extractTricksNeeded ─────────────────────────────────────────────────────
describe('extractTricksNeeded', () => {
  it('returns 8 for 2S (level 2 + 6)', () => expect(extractTricksNeeded('2S')).toBe(8));
  it('returns 9 for 3NT (level 3 + 6)', () => expect(extractTricksNeeded('3NT')).toBe(9));
  it('returns 10 for 4H', () => expect(extractTricksNeeded('4H')).toBe(10));
  it('returns 12 for 6S', () => expect(extractTricksNeeded('6S')).toBe(12));
  it('returns 0 for null', () => expect(extractTricksNeeded(null)).toBe(0));
});

// ─── analyzeTricks — PBN-12 (2S by South, play starts West) ─────────────────
describe('analyzeTricks — PBN-12: 2S by South', () => {
  const trumpSuit = 'S';
  const declarer  = 'S';
  const playStart = 'W';   // [Play "W"] — West leads trick 1, columns W/N/E/S

  let result;
  beforeAll(() => {
    result = analyzeTricks(PBN12_PLAY, trumpSuit, declarer, playStart);
  });

  it('produces 13 tricks', () => {
    expect(result.tricks).toHaveLength(13);
  });

  it('declarerTricks = 10 (N-S made 2S+2: North is declarer partner, their wins count too)', () => {
    // North wins tricks 2 and 9 — both count for the declaring side (N-S).
    // Total N-S tricks: 1,2,3,4,7,8,9,10,11,12 = 10.
    expect(result.declarerTricks).toBe(10);
  });

  it('defenseTricks = 3 (E-W wins tricks 5, 6, 13)', () => {
    expect(result.defenseTricks).toBe(3);
  });

  it('trick 1: South wins with ♥A (not West with ♥9)', () => {
    const t = result.tricks[0];
    expect(t.winner).toBe('S');
    expect(t.leadSuit).toBe('H');
  });

  it('trick 2: North wins with ♥K', () => {
    const t = result.tricks[1];
    expect(t.winner).toBe('N');
    expect(t.leadSuit).toBe('H');
  });

  it('trick 5: West wins with ♠J (ruff)', () => {
    // South leads ♠T, but West has ♠J — highest spade
    const t = result.tricks[4];
    expect(t.winner).toBe('W');
    expect(t.leadSuit).toBe('S');
  });

  it('trick 8: South wins with ♥Q — NOT West with ♣2 (regression)', () => {
    // Regression: old bug used column-0 (West's ♣2) as lead suit,
    // making it a club trick that West's ♣2 "won".
    // Fixed: South is the leader, so lead suit is ♥ from South's ♥Q.
    const t = result.tricks[7];
    expect(t.winner).toBe('S');
    expect(t.leadSuit).toBe('H');
    expect(t.leader).toBe('S');
  });

  it('trick 10: South ruffs with ♠2 to win', () => {
    // North leads ♥7; West has ♣J, East has ♥8, South ruffs with ♠2
    const t = result.tricks[9];
    expect(t.winner).toBe('S');
    expect(t.leadSuit).toBe('H');
  });

  it('trick 13: East wins with ♦A (last trick to defense)', () => {
    const t = result.tricks[12];
    expect(t.winner).toBe('E');
  });

  it('all 13 tricks are accounted for (dec + def = 13)', () => {
    expect(result.declarerTricks + result.defenseTricks).toBe(13);
  });
});

// ─── analyzeTricks — PBN-13 (3NT by South, play starts West) ────────────────
describe('analyzeTricks — PBN-13: 3NT by South', () => {
  const trumpSuit = null;   // no trump
  const declarer  = 'S';
  const playStart = 'W';

  let result;
  beforeAll(() => {
    result = analyzeTricks(PBN13_PLAY, trumpSuit, declarer, playStart);
  });

  it('produces 13 tricks', () => {
    expect(result.tricks).toHaveLength(13);
  });

  it('declarerTricks = 9 (3NT made)', () => {
    expect(result.declarerTricks).toBe(9);
  });

  it('defenseTricks = 4', () => {
    expect(result.defenseTricks).toBe(4);
  });

  it('trick 1: South wins with ♠A', () => {
    const t = result.tricks[0];
    expect(t.winner).toBe('S');
    expect(t.leadSuit).toBe('S');
  });

  it('trick 2: North wins with ♥A (South leads ♥Q)', () => {
    // South won trick 1 and leads ♥Q; North has ♥A
    const t = result.tricks[1];
    expect(t.winner).toBe('N');
    expect(t.leadSuit).toBe('H');
    expect(t.leader).toBe('S');
  });

  it('trick 7: North wins with ♦A (South leads ♦J)', () => {
    const t = result.tricks[6];
    expect(t.winner).toBe('N');
    expect(t.leadSuit).toBe('D');
  });

  it('trick 11: East wins with ♣A (third defense trick)', () => {
    const t = result.tricks[10];
    expect(t.winner).toBe('E');
  });

  it('all 13 tricks are accounted for (dec + def = 13)', () => {
    expect(result.declarerTricks + result.defenseTricks).toBe(13);
  });

  it('ranks are compared correctly (Ace beats King, King beats Queen, etc.)', () => {
    // Trick 2: ♥K (W), ♥A (N), ♥3 (E), ♥Q (S) — North's ♥A must win
    const t = result.tricks[1];
    expect(t.winner).toBe('N');
  });
});
