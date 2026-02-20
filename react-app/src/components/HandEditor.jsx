import React from 'react';
import { SUITS, RANKS, SUIT_SYMBOLS, SUIT_COLORS, countHCP, totalCards } from '../bridge/constants.js';
import styles from './HandEditor.module.css';

export default function HandEditor({ hand, setHand, usedCards, label }) {
  const toggle = (suit, rank) => {
    setHand(prev => {
      const cur = prev[suit] || [];
      if (cur.includes(rank)) {
        return { ...prev, [suit]: cur.filter(r => r !== rank) };
      }
      const next = [...cur, rank].sort((a, b) => RANKS.indexOf(a) - RANKS.indexOf(b));
      return { ...prev, [suit]: next };
    });
  };

  return (
    <div className={styles.editor}>
      <div className={styles.label}>
        {label} — {countHCP(hand)} HCP, {totalCards(hand)} cards
      </div>
      {SUITS.map(suit => (
        <div key={suit} className={styles.suitRow}>
          <span className={styles.suitIcon} style={{ color: SUIT_COLORS[suit] }}>
            {SUIT_SYMBOLS[suit]}
          </span>
          <div className={styles.cards}>
            {RANKS.map(rank => {
              const selected = (hand[suit] || []).includes(rank);
              const used = !selected && usedCards.has(suit + rank);
              return (
                <button
                  key={rank}
                  onClick={() => !used && toggle(suit, rank)}
                  className={`${styles.card} ${selected ? styles.selected : ''} ${used ? styles.used : ''}`}
                  style={selected ? { borderColor: SUIT_COLORS[suit], color: SUIT_COLORS[suit] } : {}}
                  disabled={used}
                >
                  {rank}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
