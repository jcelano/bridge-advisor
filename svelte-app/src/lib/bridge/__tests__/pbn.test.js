/**
 * Unit tests for parsePBN().
 *
 * Uses the same two Trickster hands as tricks.test.js to verify that the
 * parser extracts all fields correctly from real PBN text.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { parsePBN } from '$lib/bridge/pbn.js';

// ─── PBN text fixtures ───────────────────────────────────────────────────────

const PBN12_TEXT = `[Event "Trickster Cards: Practice Bridge - Chicago scoring using SAYC with partscore bonus, review last deal, no undo"]
[UTCDate "2026.02.22"]
[UTCTime "12:40:34"]
[West "Tana"]
[North "Rickey"]
[East "Lucy"]
[South "Joe Celano"]
[Dealer "N"]
[Vulnerable "NS"]
[Deal "N:863.K753.Q92.T97 Q4.8642.AKJT53.4 AKT92.AQT.7.K853 J75.J9.864.AQJ62"]
[Declarer "S"]
[Contract "2S"]
[Auction "N"]
Pass 1D 1S 1NT
Pass Pass 2S Pass
Pass Pass - -
[Play "W"]
H9 H3 H2 HA
HJ HK H4 HT
S5 S8 S4 SA
S7 S3 SQ SK
SJ S6 D3 ST
CA C7 C4 C3
CQ C9 D5 CK
C2 H5 H6 HQ
C6 CT DT C5
CJ H7 H8 S2
D4 D2 DJ C8
D6 D9 DK S9
D8 DQ DA D7
`;

const PBN13_TEXT = `[Event "Trickster Cards: Practice Bridge - Chicago scoring using SAYC with partscore bonus, review last deal, no undo"]
[UTCDate "2026.02.22"]
[UTCTime "12:40:34"]
[West "Tana"]
[North "Rickey"]
[East "Lucy"]
[South "Joe Celano"]
[Dealer "E"]
[Vulnerable "All"]
[Deal "E:K8643.63.Q32.AJ9 AQ.QJ5.KJ94.Q876 JT752.K982.87.T3 9.AT74.AT65.K542"]
[Declarer "S"]
[Contract "3NT"]
[Auction "E"]
Pass 1NT Pass 2C
Pass 2NT Pass 3NT
Pass Pass Pass -
[Play "W"]
S5 S9 SK SA
HK HA H3 HQ
H2 H4 H6 HJ
H8 HT C9 H5
H9 H7 CJ C6
S2 C2 S8 SQ
D7 DA D2 DJ
D8 DT DQ DK
C3 D5 D3 D9
CT D6 S3 D4
S7 C4 CA C7
ST C5 S6 C8
SJ CK S4 CQ
`;

// ─── PBN-12 parsing ──────────────────────────────────────────────────────────
describe('parsePBN — PBN-12 (2S by South)', () => {
  let state;
  beforeAll(() => { state = parsePBN(PBN12_TEXT); });

  it('parses dealer = N', () => expect(state.dealer).toBe('N'));
  it('parses vulnerability = NS', () => expect(state.vulnerability).toBe('NS'));
  it('parses contract = 2S', () => expect(state.contract).toBe('2S'));
  it('parses declarer = S', () => expect(state.declarer).toBe('S'));
  it('parses playStart = W', () => expect(state.playStart).toBe('W'));
  it('parses 13 play lines', () => expect(state.played).toHaveLength(13));

  describe('deal parsing', () => {
    it('North holds ♠ 8 6 3', () => {
      expect(state.deal.N.S).toEqual(['8', '6', '3']);
    });
    it('North holds ♥ K 7 5 3', () => {
      expect(state.deal.N.H).toEqual(['K', '7', '5', '3']);
    });
    it('East holds ♠ Q 4 (deal starts at N, East gets 2nd hand)', () => {
      // "N:863... Q4.8642.AKJT53.4 AKT92..."
      //           ^East's hand
      expect(state.deal.E.S).toEqual(['Q', '4']);
    });
    it('South holds ♠ A K T 9 2 (the 5-card spade suit, 3rd hand)', () => {
      expect(state.deal.S.S).toEqual(['A', 'K', 'T', '9', '2']);
    });
    it('East holds ♦ A K J T 5 3 (long diamond suit)', () => {
      expect(state.deal.E.D).toEqual(['A', 'K', 'J', 'T', '5', '3']);
    });
    it('West holds ♣ A Q J 6 2 (4th hand)', () => {
      expect(state.deal.W.C).toEqual(['A', 'Q', 'J', '6', '2']);
    });
    it('every hand has exactly 13 cards', () => {
      for (const seat of ['N', 'E', 'S', 'W']) {
        const total = ['S', 'H', 'D', 'C'].reduce(
          (sum, s) => sum + (state.deal[seat][s]?.length ?? 0), 0
        );
        expect(total, `seat ${seat}`).toBe(13);
      }
    });
  });

  describe('auction parsing', () => {
    it('auctionStart = N', () => expect(state.auctionStart).toBe('N'));
    it('auction contains the final 2S bid', () => {
      expect(state.auction).toContain('2S');
    });
    it('auction starts with Pass (North passes as dealer)', () => {
      expect(state.auction[0]).toBe('Pass');
    });
    it('auction contains 1D (East opens)', () => {
      expect(state.auction).toContain('1D');
    });
  });
});

// ─── PBN-13 parsing ──────────────────────────────────────────────────────────
describe('parsePBN — PBN-13 (3NT by South)', () => {
  let state;
  beforeAll(() => { state = parsePBN(PBN13_TEXT); });

  it('parses dealer = E', () => expect(state.dealer).toBe('E'));
  it('parses vulnerability = All', () => expect(state.vulnerability).toBe('All'));
  it('parses contract = 3NT', () => expect(state.contract).toBe('3NT'));
  it('parses declarer = S', () => expect(state.declarer).toBe('S'));
  it('parses playStart = W', () => expect(state.playStart).toBe('W'));
  it('parses 13 play lines', () => expect(state.played).toHaveLength(13));

  describe('deal parsing', () => {
    // Deal "E:K8643.63.Q32.AJ9 AQ.QJ5.KJ94.Q876 JT752.K982.87.T3 9.AT74.AT65.K542"
    // Order starting at E: East, South, West, North
    it('East holds ♠ K 8 6 4 3', () => {
      expect(state.deal.E.S).toEqual(['K', '8', '6', '4', '3']);
    });
    it('South holds ♠ A Q (2nd hand in E-start deal)', () => {
      // "E:K8643... AQ.QJ5.KJ94.Q876 JT752..."
      //             ^South's hand
      expect(state.deal.S.S).toEqual(['A', 'Q']);
    });
    it('West holds ♠ J T 7 5 2 (3rd hand)', () => {
      expect(state.deal.W.S).toEqual(['J', 'T', '7', '5', '2']);
    });
    it('North holds ♠ 9 (singleton, 4th hand)', () => {
      expect(state.deal.N.S).toEqual(['9']);
    });
    it('every hand has exactly 13 cards', () => {
      for (const seat of ['N', 'E', 'S', 'W']) {
        const total = ['S', 'H', 'D', 'C'].reduce(
          (sum, s) => sum + (state.deal[seat][s]?.length ?? 0), 0
        );
        expect(total, `seat ${seat}`).toBe(13);
      }
    });
  });

  describe('auction parsing', () => {
    it('auctionStart = E', () => expect(state.auctionStart).toBe('E'));
    it('auction starts with Pass (East passes)', () => {
      expect(state.auction[0]).toBe('Pass');
    });
    it('auction contains 3NT', () => {
      expect(state.auction).toContain('3NT');
    });
    it('auction contains 2C (Stayman)', () => {
      expect(state.auction).toContain('2C');
    });
  });

  describe('play lines', () => {
    it('first play line is "S5 S9 SK SA"', () => {
      expect(state.played[0]).toBe('S5 S9 SK SA');
    });
    it('last play line is "SJ CK S4 CQ"', () => {
      expect(state.played[12]).toBe('SJ CK S4 CQ');
    });
  });
});
