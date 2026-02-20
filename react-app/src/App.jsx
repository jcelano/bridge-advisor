import React, { useState, useEffect } from 'react';
import { SEATS, SEAT_KEY, SEAT_NAME, PARTNER, VULNERABILITIES, emptyHand, totalCards, getUsedCards, handHasCards } from './bridge/constants.js';
import { parsePBN, generatePBN } from './bridge/pbn.js';
import { buildPrompt } from './bridge/prompt.js';
import { getAdvice, healthCheck, verifySession, getAuthStatus, logout, getUser } from './api.js';
import HandEditor from './components/HandEditor.jsx';
import HandDisplay from './components/HandDisplay.jsx';
import { BiddingBox, AuctionDisplay, BidChip } from './components/Bidding.jsx';
import Login from './components/Login.jsx';
import MarkdownResponse from './components/MarkdownResponse.jsx';

export default function App() {
  // ── Auth State ──────────────────────────────────────────
  const [authChecked, setAuthChecked] = useState(false);
  const [authRequired, setAuthRequired] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    (async () => {
      const status = await getAuthStatus();
      setAuthRequired(status.authEnabled);
      if (status.authEnabled) {
        const session = await verifySession();
        if (session.valid) setUser(session.user);
      } else {
        setUser({ email: 'dev@local', name: 'Dev Mode' });
      }
      setAuthChecked(true);
    })();
  }, []);

  const handleLogout = () => { logout(); setUser(null); };

  if (!authChecked) {
    return <div style={{ minHeight: '100vh', background: '#080c12', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a6a4a' }}>Loading...</div>;
  }

  if (authRequired && !user) {
    return <Login onLogin={setUser} />;
  }

  return <BridgeAdvisor user={user} onLogout={handleLogout} />;
}

function BridgeAdvisor({ user, onLogout }) {
  // ── State ─────────────────────────────────────────────
  const [tab, setTab] = useState('manual');
  const [pbnText, setPbnText] = useState('');
  const [mySeat, setMySeat] = useState('South');
  const [dealer, setDealer] = useState('South');
  const [vuln, setVuln] = useState('None');
  const [conventionSystem, setConventionSystem] = useState('SAYC');
  const [myHand, setMyHand] = useState(emptyHand());
  const [dummyHand, setDummyHand] = useState(emptyHand());
  const [showDummy, setShowDummy] = useState(false);
  const [dummySeat, setDummySeat] = useState('North');
  const [auction, setAuction] = useState([]);
  const [contract, setContract] = useState('');
  const [tricks, setTricks] = useState('');
  const [adviceType, setAdviceType] = useState('bid');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [parsedPBN, setParsedPBN] = useState(null);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [serverOk, setServerOk] = useState(null);
  const [history, setHistory] = useState([]); // conversation history for this hand

  // ── Server health check on mount ──────────────────────
  useEffect(() => {
    healthCheck().then(ok => setServerOk(ok));
  }, []);

  // ── Computed ──────────────────────────────────────────
  const usedCards = getUsedCards(myHand, dummyHand);

  // ── PBN Import ────────────────────────────────────────
  const handleParsePBN = () => {
    try {
      const p = parsePBN(pbnText);
      setParsedPBN(p);
      if (p.dealer) setDealer(SEAT_NAME[p.dealer] || 'South');
      if (p.vulnerability) setVuln(p.vulnerability);
      if (p.auction?.length) setAuction(p.auction);
      if (p.contract) setContract(p.contract);

      const sk = SEAT_KEY[mySeat];
      if (p.deal[sk]) setMyHand(p.deal[sk]);

      if (p.declarer) {
        const dummyKey = PARTNER[p.declarer];
        setDummySeat(SEAT_NAME[dummyKey]);
        if (p.deal[dummyKey]) {
          setDummyHand(p.deal[dummyKey]);
          setShowDummy(true);
        }
      }

      if (p.played?.length) setTricks(p.played.join('\n'));

      setResponse('PBN imported successfully. Review the state below and ask for advice.');
    } catch (e) {
      setResponse('Error parsing PBN: ' + e.message);
    }
  };

  // ── Reset ─────────────────────────────────────────────
  const resetAll = () => {
    setMyHand(emptyHand());
    setDummyHand(emptyHand());
    setAuction([]);
    setContract('');
    setTricks('');
    setResponse('');
    setParsedPBN(null);
    setShowDummy(false);
    setHistory([]);
    setPbnText('');
  };

  // ── Build game state ──────────────────────────────────
  const buildGameState = () => ({
    dealer,
    vulnerability: vuln,
    conventionSystem,
    deal: {
      ...(parsedPBN?.deal || {}),
      [SEAT_KEY[mySeat]]: myHand,
      ...(showDummy ? { [SEAT_KEY[dummySeat]]: dummyHand } : {}),
    },
    auction,
    auctionStart: SEAT_KEY[dealer],
    contract,
    played: tricks ? tricks.split('\n').filter(t => t.trim()) : (parsedPBN?.played || []),
    dummySeat: showDummy ? dummySeat : null,
    declarer: parsedPBN?.declarer || '',
    result: parsedPBN?.result || '',
  });

  // ── Get Advice ────────────────────────────────────────
  const handleGetAdvice = async () => {
    const gs = buildGameState();
    const prompt = buildPrompt(gs, adviceType, mySeat);

    if (showPromptPreview) {
      setResponse('PROMPT PREVIEW:\n\n' + prompt);
      return;
    }

    setLoading(true);
    setResponse('');

    try {
      const result = await getAdvice(prompt);
      setResponse(result.text);
      setHistory(prev => [...prev, { type: adviceType, response: result.text }]);
    } catch (err) {
      setResponse('Error: ' + err.message);
    }

    setLoading(false);
  };

  // ── Export current state as PBN ───────────────────────
  const handleExportPBN = () => {
    const gs = buildGameState();
    const pbn = generatePBN({
      dealer: SEAT_KEY[gs.dealer] || gs.dealer,
      vulnerability: gs.vulnerability,
      deal: gs.deal,
      auction: gs.auction,
      auctionStart: gs.auctionStart,
      contract: gs.contract,
      played: gs.played,
    });
    navigator.clipboard.writeText(pbn).then(() => {
      setResponse('PBN copied to clipboard!');
    }).catch(() => {
      setResponse('PBN generated:\n\n' + pbn);
    });
  };

  // ── Styles ────────────────────────────────────────────
  const S = {
    section: {
      background: '#0c1219',
      borderRadius: 10,
      border: '1px solid #1a2430',
      padding: 16,
      marginBottom: 14,
    },
    sTitle: {
      fontSize: 11, color: '#5a6a7a', letterSpacing: 1.5,
      textTransform: 'uppercase', fontWeight: 700, marginBottom: 10,
    },
    select: {
      background: '#101820', color: '#c0d0e0', border: '1px solid #1a2a3a',
      borderRadius: 6, padding: '7px 10px', fontSize: 13, outline: 'none',
    },
    textarea: {
      width: '100%', background: '#060a10', color: '#8bdb6a',
      border: '1px solid #1a2a1a', borderRadius: 8, padding: 12,
      fontSize: 12, fontFamily: "'Courier New', monospace",
      minHeight: 100, resize: 'vertical', outline: 'none', boxSizing: 'border-box',
    },
    btn: (variant) => ({
      padding: variant === 'lg' ? '12px 28px' : '8px 16px',
      borderRadius: 7, border: 'none', fontWeight: 700,
      fontSize: variant === 'lg' ? 15 : 13, cursor: 'pointer',
      ...(variant === 'primary' || variant === 'lg'
        ? { background: 'linear-gradient(135deg, #d4af37, #a08520)', color: '#0a0a10' }
        : { background: '#101820', color: '#8a9aaa', border: '1px solid #1a2a3a' }),
    }),
    tab: (active) => ({
      padding: '9px 20px', background: active ? '#101820' : 'transparent',
      color: active ? '#d4af37' : '#4a5a6a', border: 'none',
      borderBottom: active ? '2px solid #d4af37' : '2px solid transparent',
      cursor: 'pointer', fontSize: 13, fontWeight: 600,
    }),
  };

  // ── Render ────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0d2214 0%, #0a1a10 100%)',
        borderBottom: '1px solid #1a3a2a',
        padding: '16px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 28, color: '#d4af37' }}>♠</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#d4af37' }}>The Stayman Whisperer</div>
            <div style={{ fontSize: 11, color: '#4a6a4a' }}>Your AI bridge partner</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {user && (
            <span style={{ fontSize: 12, color: '#6a8a6a' }}>
              {user.name}
              {' · '}
              <button onClick={onLogout} style={{
                background: 'none', border: 'none', color: '#8a6a6a',
                cursor: 'pointer', fontSize: 12, textDecoration: 'underline',
              }}>Sign out</button>
            </span>
          )}
          <div style={{ fontSize: 11 }}>
          {serverOk === true && <span style={{ color: '#4a9' }}>● Server connected</span>}
          {serverOk === false && <span style={{ color: '#e66' }}>● Server offline — start with <code>npm run dev</code></span>}
          {serverOk === null && <span style={{ color: '#666' }}>● Checking server...</span>}
        </div>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '16px 12px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 14, borderBottom: '1px solid #1a2430' }}>
          <button style={S.tab(tab === 'manual')} onClick={() => setTab('manual')}>Manual Input</button>
          <button style={S.tab(tab === 'pbn')} onClick={() => setTab('pbn')}>Paste PBN</button>
          {history.length > 0 && (
            <button style={S.tab(tab === 'history')} onClick={() => setTab('history')}>
              History ({history.length})
            </button>
          )}
        </div>

        {/* ── PBN Tab ─────────────────────────────────── */}
        {tab === 'pbn' && (
          <div style={S.section}>
            <div style={S.sTitle}>Import from Trickster Cards</div>
            <p style={{ fontSize: 12, color: '#5a6a7a', marginBottom: 10, lineHeight: 1.6 }}>
              In Trickster Cards, enable <b>"Review last deal"</b> in game rules.
              After finishing a hand, open the menu → <b>Current Game</b> → <b>Export Hand to PBN</b>.
              Paste the result below.
            </p>
            <textarea
              style={S.textarea}
              value={pbnText}
              onChange={e => setPbnText(e.target.value)}
              placeholder={'[Event "..."]\n[Dealer "S"]\n[Vulnerable "None"]\n[Deal "N:AKQ2.J93.T87.A65 ..."]\n[Auction "S"]\n1NT Pass 3NT Pass Pass Pass'}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13, color: '#8a9aaa' }}>My seat:
                <select style={{ ...S.select, marginLeft: 6 }} value={mySeat} onChange={e => setMySeat(e.target.value)}>
                  {SEATS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <button style={S.btn('primary')} onClick={handleParsePBN}>Import PBN</button>
            </div>
          </div>
        )}

        {/* ── History Tab ─────────────────────────────── */}
        {tab === 'history' && (
          <div style={S.section}>
            <div style={S.sTitle}>Advice History (This Hand)</div>
            {history.map((item, i) => (
              <div key={i} style={{
                background: '#0a120a', borderRadius: 8, border: '1px solid #1a2a1a',
                padding: 12, marginBottom: 10,
              }}>
                <div style={{ fontSize: 11, color: '#6a8a6a', marginBottom: 6, textTransform: 'uppercase', fontWeight: 600 }}>
                  {item.type} advice #{i + 1}
                </div>
                <div style={{ color: '#b0d0b0', fontSize: 13, lineHeight: 1.7 }}>
                  <MarkdownResponse text={item.response} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Manual Tab ──────────────────────────────── */}
        {tab === 'manual' && (
          <>
            {/* Game Settings */}
            <div style={S.section}>
              <div style={S.sTitle}>Game Settings</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                {[
                  ['My Seat', mySeat, setMySeat, SEATS],
                  ['Dealer', dealer, setDealer, SEATS],
                  ['Vulnerability', vuln, setVuln, VULNERABILITIES],
                  ['Convention', conventionSystem, setConventionSystem, ['SAYC', '2/1 Game Forcing']],
                ].map(([label, value, setter, options]) => (
                  <label key={label} style={{ fontSize: 13, color: '#6a7a8a' }}>
                    {label}
                    <select style={{ ...S.select, marginLeft: 6 }} value={value} onChange={e => setter(e.target.value)}>
                      {options.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>

            {/* My Hand */}
            <div style={S.section}>
              <div style={S.sTitle}>My Hand</div>
              <HandEditor
                hand={myHand}
                setHand={setMyHand}
                usedCards={new Set([...usedCards].filter(c => !(myHand[c[0]] || []).includes(c.slice(1))))}
                label="Select your cards"
              />
            </div>

            {/* Dummy */}
            <div style={S.section}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showDummy ? 10 : 0 }}>
                <div style={S.sTitle}>Dummy</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {showDummy && (
                    <select style={S.select} value={dummySeat} onChange={e => setDummySeat(e.target.value)}>
                      {SEATS.filter(s => s !== mySeat).map(s => <option key={s}>{s}</option>)}
                    </select>
                  )}
                  <button style={S.btn()} onClick={() => setShowDummy(!showDummy)}>
                    {showDummy ? 'Hide Dummy' : 'Show Dummy'}
                  </button>
                </div>
              </div>
              {showDummy && (
                <HandEditor
                  hand={dummyHand}
                  setHand={setDummyHand}
                  usedCards={new Set([...usedCards].filter(c => !(dummyHand[c[0]] || []).includes(c.slice(1))))}
                  label="Select dummy's cards"
                />
              )}
            </div>

            {/* Bidding */}
            <div style={S.section}>
              <div style={S.sTitle}>Auction</div>
              <div style={{ marginBottom: 12 }}>
                <AuctionDisplay auction={auction} dealerSeat={dealer} />
              </div>
              <BiddingBox onBid={b => setAuction(prev => [...prev, b])} auction={auction} />
              {auction.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={() => setAuction(prev => prev.slice(0, -1))} style={{ ...S.btn(), fontSize: 12 }}>
                    Undo Last Bid
                  </button>
                  <button onClick={() => setAuction([])} style={{ ...S.btn(), fontSize: 12 }}>
                    Clear Auction
                  </button>
                </div>
              )}
            </div>

            {/* Play Phase */}
            <div style={S.section}>
              <div style={S.sTitle}>Play Phase (Optional)</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                <label style={{ fontSize: 13, color: '#6a7a8a' }}>
                  Contract
                  <input
                    style={{ ...S.select, marginLeft: 6, width: 90 }}
                    value={contract}
                    onChange={e => setContract(e.target.value)}
                    placeholder="e.g. 3NT"
                  />
                </label>
              </div>
              <label style={{ fontSize: 13, color: '#6a7a8a', display: 'block', marginBottom: 4 }}>
                Tricks played (one per line, e.g. "H4 HA H3 H7")
              </label>
              <textarea
                style={{ ...S.textarea, minHeight: 60 }}
                value={tricks}
                onChange={e => setTricks(e.target.value)}
                placeholder={'S4 SA S3 S7\nHK H2 H5 HQ'}
              />
            </div>
          </>
        )}

        {/* ── State Summary ───────────────────────────── */}
        {(handHasCards(myHand) || parsedPBN) && (
          <div style={S.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={S.sTitle}>Current State</div>
              <button style={{ ...S.btn(), fontSize: 11 }} onClick={handleExportPBN}>Export PBN</button>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <HandDisplay hand={myHand} label={`My Hand (${mySeat})`} />
              {showDummy && <HandDisplay hand={dummyHand} label={`Dummy (${dummySeat})`} />}
            </div>
            {auction.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: '#5a6a7a', marginBottom: 4 }}>Auction:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {auction.map((b, i) => <BidChip key={i} bid={b} />)}
                </div>
              </div>
            )}
            {contract && (
              <div style={{ marginTop: 8, fontSize: 13, color: '#aab' }}>
                Contract: <b style={{ color: '#d4af37' }}>{contract}</b>
              </div>
            )}
          </div>
        )}

        {/* ── Advice Request ──────────────────────────── */}
        <div style={S.section}>
          <div style={S.sTitle}>Ask for Advice</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {[
              ['bid', 'Bidding'],
              ['lead', 'Opening Lead'],
              ['play', 'Card Play'],
              ['analyze', 'Full Analysis'],
            ].map(([key, label]) => (
              <button key={key} onClick={() => setAdviceType(key)} style={{
                padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: adviceType === key ? '#1a2a1a' : '#101820',
                color: adviceType === key ? '#8bdb6a' : '#5a6a7a',
                border: adviceType === key ? '1px solid #2a4a2a' : '1px solid #1a2430',
              }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={S.btn('lg')} onClick={handleGetAdvice} disabled={loading}>
              {loading ? 'Thinking...' : 'Get Advice'}
            </button>
            <button style={S.btn()} onClick={() => setShowPromptPreview(!showPromptPreview)}>
              {showPromptPreview ? 'Live Mode' : 'Preview Prompt'}
            </button>
            <button style={S.btn()} onClick={resetAll}>Reset All</button>
          </div>
          {showPromptPreview && (
            <div style={{ fontSize: 11, color: '#6a7a4a', marginTop: 6 }}>
              Preview mode: shows the prompt instead of asking The Stayman Whisperer
            </div>
          )}
        </div>

        {/* ── Response ────────────────────────────────── */}
        {(response || loading) && (
          <div style={{
            background: '#0a120a', borderRadius: 10, border: '1px solid #1a2a1a',
            padding: 20, marginBottom: 20, animation: 'fadeIn 0.3s ease',
          }}>
            <div style={{
              fontSize: 11, color: '#4a6a4a', letterSpacing: 1.5,
              textTransform: 'uppercase', fontWeight: 700, marginBottom: 10,
            }}>
              {loading ? 'Analyzing...' : "The Stayman Whisperer"}
            </div>
            {loading ? (
              <div style={{ color: '#6a8a6a', fontSize: 14 }}>
                <span style={{ animation: 'pulse 1.5s infinite', display: 'inline-block' }}>♠</span>
                {' '}Thinking through the hand...
              </div>
            ) : (
              <MarkdownResponse text={response} />
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', color: '#2a3a4a', fontSize: 11, padding: '20px 0' }}>
          The Stayman Whisperer — Works with Trickster Cards PBN Export
        </div>
      </div>
    </div>
  );
}
