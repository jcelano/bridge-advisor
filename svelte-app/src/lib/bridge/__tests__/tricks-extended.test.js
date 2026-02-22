/**
 * Extended trick-analysis tests covering scenarios not in tricks.test.js.
 *
 * Together with tricks.test.js, these four suites cover:
 *   • Every [Play "X"] column start  (W, E, S, N — all four)
 *   • Every declarer seat            (N, E, S, W — all four)
 *   • Every trump suit               (S, H, D, C, NT)
 *   • Made +1/+2 and down -1/-2 outcomes
 *   • E-W as the declaring side (suites 3 & 4)
 *
 * ─── Overview ───────────────────────────────────────────────────────────────
 *  Suite 1 — 2h-up1     2H by North   [Play "E"]  N-S declaring  made+1
 *  Suite 2 — 6s-down2   6S by South   [Play "W"]  N-S declaring  down-2  (slam)
 *  Suite 3 — trickster6 3C by East    [Play "S"]  E-W declaring  down-2
 *  Suite 4 — trickster5 3HX by West   [Play "N"]  E-W declaring  down-1
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { analyzeTricks, extractTrumpSuit } from '$lib/bridge/prompt.js';

// ─── Suite 1: 2H by North, [Play "E"]  (columns E / S / W / N) ──────────────
// Deal "W:KQ943.A73.J84.J4 T76.QJT652.Q.QT3 82.K9.K653.A9865 AJ5.84.AT972.K72"
// Contract 2H, Declarer N, PlayStart E — East leads trick 1.
// The declaring side is N-S; West leads is NOT the start here.
describe('analyzeTricks — 2H by North, [Play "E"]', () => {
  const PLAY = [
    'S2 S5 SQ S6',   // trick  1 — columns E / S / W / N
    'S8 SJ S4 S7',   // trick  2
    'HK H4 H3 HQ',   // trick  3
    'D3 D2 D8 DQ',   // trick  4
    'H9 H8 HA HJ',   // trick  5
    'D5 SA S3 ST',   // trick  6
    'D6 DA D4 C3',   // trick  7
    'DK D7 DJ H2',   // trick  8
    'C5 D9 H7 HT',   // trick  9
    'C6 DT C4 H6',   // trick 10
    'CA C2 CJ CQ',   // trick 11
    'C8 C7 S9 CT',   // trick 12
    'C9 CK SK H5',   // trick 13
  ];

  let result;
  beforeAll(() => {
    result = analyzeTricks(PLAY, 'H', 'N', 'E');
  });

  it('produces 13 tricks', () => expect(result.tricks).toHaveLength(13));

  it('declarerTricks = 9 (2H made+1)', () => {
    // North (dec) + South (partner) win 9 tricks in a 2H (needs 8).
    expect(result.declarerTricks).toBe(9);
  });

  it('defenseTricks = 4', () => expect(result.defenseTricks).toBe(4));

  it('dec + def = 13', () => {
    expect(result.declarerTricks + result.defenseTricks).toBe(13);
  });

  it('trick 1: East leads ♠, West wins — [Play "E"] means East is column 0', () => {
    const t = result.tricks[0];
    expect(t.leader).toBe('E');
    expect(t.leadSuit).toBe('S');
    expect(t.winner).toBe('W');
  });

  it('trick 3: South leads ♥ (not East/column-0) — rotation after S wins T2', () => {
    // South won T2 so South leads T3. Column 0 is East — if code wrongly uses
    // cards[0].suit it would see East's ♥K as lead, but East's ♥K IS hearts
    // here so the lead suit happens to match. The winner test is what catches
    // the real rotation: East's ♥K should win over South's ♥4.
    const t = result.tricks[2];
    expect(t.leader).toBe('S');
    expect(t.leadSuit).toBe('H');
    expect(t.winner).toBe('E');   // East wins with ♥K (defense)
  });

  it('trick 5: North leads ♥, West wins with ♥A', () => {
    // North won T4. [Play "E"] columns are E/S/W/N, so North is column 3.
    // leadSuit must come from North's card (♥J), not column 0 (East's ♥9).
    const t = result.tricks[4];
    expect(t.leader).toBe('N');
    expect(t.leadSuit).toBe('H');
    expect(t.winner).toBe('W');   // West wins with ♥A (defense)
  });
});

// ─── Suite 2: 6S by South, [Play "W"]  — slam that went down 2 ──────────────
// Deal "W:7.QT9654.Q72.872 Q832.A7.AT96.A54 T964.3.KJ83.KT93 AKJ5.KJ82.54.QJ6"
// Contract 6S, Declarer S, PlayStart W — columns W / N / E / S.
// Needs 12 tricks; won only 10 → down 2.
describe('analyzeTricks — 6S by South, [Play "W"], down-2 (slam)', () => {
  const PLAY = [
    'HT H7 H3 HJ',   // trick  1
    'C2 C4 CK CQ',   // trick  2
    'C7 CA CT C6',   // trick  3
    'S7 S2 S4 SA',   // trick  4
    'H4 S3 S6 SK',   // trick  5
    'H5 HA S9 H2',   // trick  6
    'C8 C5 C3 CJ',   // trick  7
    'H6 S8 ST SJ',   // trick  8
    'H9 D6 D3 HK',   // trick  9
    'HQ SQ C9 H8',   // trick 10
    'D2 DA D8 D4',   // trick 11
    'D7 D9 DJ D5',   // trick 12
    'DQ DT DK S5',   // trick 13
  ];

  let result;
  beforeAll(() => {
    result = analyzeTricks(PLAY, 'S', 'S', 'W');
  });

  it('produces 13 tricks', () => expect(result.tricks).toHaveLength(13));

  it('declarerTricks = 10 (slam went down 2, needed 12)', () => {
    expect(result.declarerTricks).toBe(10);
  });

  it('defenseTricks = 3', () => expect(result.defenseTricks).toBe(3));

  it('dec + def = 13', () => {
    expect(result.declarerTricks + result.defenseTricks).toBe(13);
  });

  it('trick 1: West leads ♥, South wins with ♥J', () => {
    // T1: W:HT, N:H7, E:H3, S:HJ. No trump (this is a heart trick). Leader=W.
    const t = result.tricks[0];
    expect(t.leader).toBe('W');
    expect(t.leadSuit).toBe('H');
    expect(t.winner).toBe('S');
  });

  it('trick 10: South leads ♥, North ruffs with ♠Q to win', () => {
    // T10 play: "HQ SQ C9 H8" → W:HQ, N:SQ, E:C9, S:H8.
    // South leads ♥8 (leader=S, not column-0=West). Lead suit = H.
    // North plays ♠Q (trump) — overruffs everything. North (dec side) wins.
    const t = result.tricks[9];
    expect(t.leader).toBe('S');
    expect(t.leadSuit).toBe('H');
    expect(t.winner).toBe('N');
  });

  it('trick 12: North leads ♦, East wins with ♦J (defense takes another)', () => {
    // T12 play: "D7 D9 DJ D5" → W:D7, N:D9, E:DJ, S:D5.
    const t = result.tricks[11];
    expect(t.winner).toBe('E');
  });
});

// ─── Suite 3: 3C by East, [Play "S"]  (columns S / W / N / E) ───────────────
// Deal "E:4.AJ9652.A986.94 T982.73.KJT543.K KQ63.T8.2.QJ8652 AJ75.KQ4.Q7.AT73"
// Contract 3C, Declarer E, PlayStart S — South leads trick 1.
// Declaring side is E-W. Trump = C (clubs). Down 2 (needed 9, won 7).
describe('analyzeTricks — 3C by East, [Play "S"], E-W declaring, down-2', () => {
  const PLAY = [
    'HK H7 H9 HA',   // trick  1 — columns S / W / N / E
    'CK C2 C4 CA',   // trick  2
    'D3 CQ C5 C3',   // trick  3
    'D6 C6 CT C8',   // trick  4
    'D9 C7 CJ S4',   // trick  5
    'H2 C9 HT H4',   // trick  6
    'S5 SA S8 S7',   // trick  7
    'S6 S2 SQ ST',   // trick  8
    'H3 D5 DA DT',   // trick  9
    'H5 D7 DJ DK',   // trick 10
    'SK S3 D2 SJ',   // trick 11
    'HQ S9 D4 H8',   // trick 12
    'H6 DQ D8 HJ',   // trick 13
  ];

  let result;
  beforeAll(() => {
    result = analyzeTricks(PLAY, 'C', 'E', 'S');
  });

  it('produces 13 tricks', () => expect(result.tricks).toHaveLength(13));

  it('declarerTricks = 7 (E-W side: East + West wins, contract down-2)', () => {
    // E-W is the declaring side. East won 4, West won 3 = 7 total.
    expect(result.declarerTricks).toBe(7);
  });

  it('defenseTricks = 6 (N-S wins 6)', () => expect(result.defenseTricks).toBe(6));

  it('dec + def = 13', () => {
    expect(result.declarerTricks + result.defenseTricks).toBe(13);
  });

  it('trick 1: South leads ♥ (columns start at S), East wins with ♥A', () => {
    // [Play "S"] → columns S/W/N/E. South is both column 0 AND trick-1 leader.
    const t = result.tricks[0];
    expect(t.leader).toBe('S');
    expect(t.leadSuit).toBe('H');
    expect(t.winner).toBe('E');   // East (declaring side) wins
  });

  it('trick 3: East leads ♣ (after E wins T2), West wins with ♣Q (dec side)', () => {
    // T3 play: "D3 CQ C5 C3" → S:D3, W:CQ, N:C5, E:C3.
    // East won T2 so leads T3. East's card is column 3 (seat E) = C3. leadSuit=C.
    // Clubs: W:CQ(10), N:C5(3), E:C3(1). S:D3 is diamond (no follow). West wins.
    // West is E-W declaring side → declarerTricks++.
    const t = result.tricks[2];
    expect(t.leader).toBe('E');
    expect(t.leadSuit).toBe('C');
    expect(t.winner).toBe('W');
  });

  it('trick 8: North wins with ♠Q (defense takes over)', () => {
    // T8: S:S6, W:S2, N:SQ, E:ST. Leader=W (W won T7). leadSuit=S.
    // No trump in spades (trump=clubs). Highest spade: SQ (N). Defense wins.
    const t = result.tricks[7];
    expect(t.winner).toBe('N');
  });
});

// ─── Suite 4: 3HX by West, [Play "N"]  (columns N / E / S / W) ──────────────
// Deal "E:4.AJ9652.A986.94 T982.73.KJT543.K KQ63.T8.2.QJ8652 AJ75.KQ4.Q7.AT73"
// Wait — this is a different deal. Let me use the correct one:
// [Deal] from trickster (5) — declarer W, contract 3HX, PlayStart N.
// Declaring side is E-W. Trump = H (hearts). Down 1 (needed 9, won 8).
describe('analyzeTricks — 3HX by West, [Play "N"], E-W declaring, down-1', () => {
  const PLAY = [
    'CQ CK C4 D3',   // trick  1 — columns N / E / S / W
    'SJ HJ H2 H4',   // trick  2
    'D4 D2 H3 DA',   // trick  3
    'C6 C2 C7 H6',   // trick  4
    'D7 SA S3 S2',   // trick  5
    'C8 CA CT S4',   // trick  6
    'C9 C3 S6 H7',   // trick  7
    'D8 S9 ST S5',   // trick  8
    'D9 C5 HA H9',   // trick  9
    'CJ SQ HT HQ',   // trick 10
    'DJ D5 SK S7',   // trick 11
    'DQ D6 H5 HK',   // trick 12
    'DK DT H8 S8',   // trick 13
  ];

  let result;
  beforeAll(() => {
    result = analyzeTricks(PLAY, 'H', 'W', 'N');
  });

  it('produces 13 tricks', () => expect(result.tricks).toHaveLength(13));

  it('declarerTricks = 8 (E-W side, 3HX needs 9, down-1)', () => {
    // West (declarer) + East (partner) win 8 tricks total.
    expect(result.declarerTricks).toBe(8);
  });

  it('defenseTricks = 5', () => expect(result.defenseTricks).toBe(5));

  it('dec + def = 13', () => {
    expect(result.declarerTricks + result.defenseTricks).toBe(13);
  });

  it('trick 1: North leads ♣ (columns start at N), East wins with ♣K', () => {
    // [Play "N"] → columns N/E/S/W. North leads trick 1.
    // T1: N:CQ, E:CK, S:C4, W:D3.
    // leadSuit=C (from North's CQ). Clubs: N:CQ(10), E:CK(11), S:C4(2). W:D3 skip.
    // East wins with ♣K (declaring side, E-W).
    const t = result.tricks[0];
    expect(t.leader).toBe('N');
    expect(t.leadSuit).toBe('C');
    expect(t.winner).toBe('E');
  });

  it('trick 4: South leads ♣, West ruffs with ♥6 (trump) to win', () => {
    // South won T3. T4: N:C6, E:C2, S:C7, W:H6.
    // leadSuit=C (South's C7). West has ♥6 (trump) — ruffs. E-W declaring side wins.
    const t = result.tricks[3];
    expect(t.leader).toBe('S');
    expect(t.leadSuit).toBe('C');
    expect(t.winner).toBe('W');
  });

  it('trick 9: South leads ♥A (over-ruff) to win for defense', () => {
    // T9: N:D9, E:C5, S:HA, W:H9. Leader=S (S won T8).
    // leadSuit=H (South's HA). HA is trump, highest possible. Defense wins.
    const t = result.tricks[8];
    expect(t.leader).toBe('S');
    expect(t.leadSuit).toBe('H');
    expect(t.winner).toBe('S');
  });
});
