<script>
  let { onShowSignup, onShowLogin } = $props();
</script>

<div class="landing">
  <!-- Hero -->
  <section class="hero">
    <div class="hero-logo">♠</div>
    <h1>The Stayman Whisperer</h1>
    <p class="tagline">AI-powered bridge analysis that makes you a better player</p>
    <p class="sub">Get expert bidding, opening lead, card play, and post-mortem analysis — powered by advanced AI.</p>
    <div class="hero-actions">
      <button class="btn-primary" onclick={onShowSignup}>Get Started</button>
      <button class="btn-secondary" onclick={onShowLogin}>Sign In</button>
    </div>
  </section>

  <!-- Features -->
  <section class="features">
    <h2>What You Get</h2>
    <div class="feature-grid">
      <div class="feature-card">
        <div class="feature-icon">&#x1F0A1;</div>
        <h3>Bidding Advice</h3>
        <p>Get expert recommendations on your next bid with full reasoning based on your convention system (SAYC or 2/1).</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">&#x1F3AF;</div>
        <h3>Opening Lead</h3>
        <p>Know which card to lead and why, based on the auction, your hand, and defensive strategy.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">&#x1F4A1;</div>
        <h3>Card Play</h3>
        <p>Get guidance on what to play next — counting winners, losers, and finding the best line.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">&#x1F4CA;</div>
        <h3>Post-Mortem Analysis</h3>
        <p>Full hand review with grades, key moments, and coaching advice to improve your game.</p>
      </div>
    </div>
  </section>

  <!-- How It Works -->
  <section class="how-it-works">
    <h2>How It Works</h2>
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <h3>Play Bridge</h3>
        <p>Play on Trickster Cards or enter any hand manually using PBN format.</p>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <h3>Capture the Hand</h3>
        <p>Use our Chrome extension for one-click capture, or paste PBN directly.</p>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <h3>Get Expert Analysis</h3>
        <p>AI analyzes the hand and provides detailed, actionable feedback.</p>
      </div>
    </div>
  </section>

  <!-- Pricing -->
  <section class="pricing">
    <h2>Simple Pricing</h2>
    <div class="pricing-grid">
      <div class="price-card">
        <h3>Free</h3>
        <div class="price">$0</div>
        <ul>
          <li>5 analyses per day</li>
          <li>All advice types</li>
          <li>Hand history</li>
          <li>Share your analyses</li>
          <li>Chrome extension</li>
        </ul>
        <button class="btn-primary" onclick={onShowSignup}>Get Started</button>
      </div>
      <div class="price-card pro">
        <div class="pro-badge">Pro</div>
        <h3>Pro</h3>
        <div class="price">Coming Soon</div>
        <ul>
          <li>50 analyses per day</li>
          <li>Everything in Free</li>
          <li>Priority analysis</li>
        </ul>
        <button class="btn-secondary" disabled>Coming Soon</button>
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="cta">
    <h2>Ready to improve your bridge game?</h2>
    <p>Request access or use an invite code to get started.</p>
    <button class="btn-primary" onclick={onShowSignup}>Get Started</button>
  </section>
</div>

<style>
  .landing { max-width: 860px; margin: 0 auto; padding: 0 16px; }

  /* Hero */
  .hero { text-align: center; padding: 60px 0 40px; }
  .hero-logo { font-size: 56px; color: #d4af37; margin-bottom: 12px; }
  .hero h1 { font-size: 36px; font-weight: 700; color: #d4af37; margin: 0 0 12px; }
  .tagline { font-size: 18px; color: #8aa08a; margin: 0 0 8px; }
  .sub { font-size: 14px; color: #5a7a5a; max-width: 500px; margin: 0 auto 28px; line-height: 1.5; }
  .hero-actions { display: flex; gap: 12px; justify-content: center; }

  /* Buttons */
  .btn-primary {
    padding: 12px 28px; border-radius: 8px; border: none;
    background: linear-gradient(135deg, #d4af37, #a08520);
    color: #0a0a10; font-size: 15px; font-weight: 700; cursor: pointer;
  }
  .btn-primary:hover { filter: brightness(1.1); }
  .btn-secondary {
    padding: 12px 28px; border-radius: 8px;
    border: 1px solid #2a3a2a; background: transparent;
    color: #8aa08a; font-size: 15px; font-weight: 600; cursor: pointer;
  }
  .btn-secondary:hover { border-color: #4a6a4a; color: #aac0aa; }
  .btn-secondary:disabled { opacity: 0.5; cursor: default; }

  /* Sections */
  section { margin-bottom: 48px; }
  h2 { text-align: center; font-size: 24px; color: #d4af37; margin-bottom: 24px; }

  /* Features */
  .feature-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
  .feature-card {
    background: #0c1219; border: 1px solid #1a2a1a; border-radius: 12px; padding: 24px;
  }
  .feature-icon { font-size: 28px; margin-bottom: 8px; }
  .feature-card h3 { font-size: 16px; color: #c0d8c0; margin: 0 0 8px; }
  .feature-card p { font-size: 13px; color: #6a8a6a; margin: 0; line-height: 1.5; }

  /* How It Works */
  .steps { display: flex; gap: 20px; justify-content: center; }
  .step { flex: 1; text-align: center; max-width: 220px; }
  .step-num {
    width: 40px; height: 40px; border-radius: 50%;
    background: linear-gradient(135deg, #d4af37, #a08520);
    color: #0a0a10; font-size: 18px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 12px;
  }
  .step h3 { font-size: 15px; color: #c0d8c0; margin: 0 0 6px; }
  .step p { font-size: 13px; color: #6a8a6a; line-height: 1.5; }

  /* Pricing */
  .pricing-grid { display: flex; gap: 20px; justify-content: center; }
  .price-card {
    background: #0c1219; border: 1px solid #1a2a1a; border-radius: 12px;
    padding: 28px; width: 260px; text-align: center; position: relative;
  }
  .price-card.pro { border-color: #d4af3740; }
  .pro-badge {
    position: absolute; top: -10px; right: 16px;
    background: linear-gradient(135deg, #d4af37, #a08520);
    color: #0a0a10; font-size: 11px; font-weight: 700;
    padding: 3px 10px; border-radius: 10px;
  }
  .price-card h3 { font-size: 18px; color: #c0d8c0; margin: 0 0 8px; }
  .price { font-size: 28px; font-weight: 700; color: #d4af37; margin-bottom: 16px; }
  .price-card ul { list-style: none; padding: 0; margin: 0 0 20px; }
  .price-card li { font-size: 13px; color: #6a8a6a; padding: 6px 0; border-bottom: 1px solid #1a2a1a; }

  /* CTA */
  .cta { text-align: center; padding: 40px 0; }
  .cta h2 { margin-bottom: 8px; }
  .cta p { color: #6a8a6a; font-size: 14px; margin-bottom: 20px; }

  @media (max-width: 640px) {
    .feature-grid { grid-template-columns: 1fr; }
    .steps { flex-direction: column; align-items: center; }
    .pricing-grid { flex-direction: column; align-items: center; }
    .hero h1 { font-size: 28px; }
  }
</style>
