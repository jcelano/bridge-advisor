<div class="legal">
  <a href="/" class="back-link">← Back to The Stayman Whisperer</a>

  <h1>Privacy Policy</h1>
  <p class="updated">Last updated: March 28, 2026</p>

  <p>The Stayman Whisperer ("Service", "we", "us", "our") is committed to protecting your privacy. This Privacy Policy explains what data we collect, how we use it, and your rights regarding your information.</p>

  <h2>1. Information We Collect</h2>

  <h3>Account Information</h3>
  <ul>
    <li><strong>Email address</strong> — used for authentication, email verification, password resets, and transactional notifications.</li>
    <li><strong>Name</strong> — used for display purposes within the application.</li>
    <li><strong>Password</strong> — stored as a one-way bcrypt hash (12 rounds). We never store or log plaintext passwords.</li>
  </ul>

  <h3>Bridge Hand Data</h3>
  <ul>
    <li><strong>PBN (Portable Bridge Notation) data</strong> — hand deals, auctions, contracts, play records, and vulnerability.</li>
    <li><strong>Analysis results</strong> — AI-generated responses stored in your history.</li>
    <li><strong>Analysis metadata</strong> — advice type, model used, token counts, timestamps.</li>
  </ul>

  <h3>Usage Data</h3>
  <ul>
    <li><strong>Daily query counts</strong> — tracked for rate limiting and billing.</li>
    <li><strong>API token usage</strong> — input/output token counts per query for cost monitoring.</li>
  </ul>

  <h3>Feedback Data</h3>
  <p>When you submit feedback through the application, we collect:</p>
  <ul>
    <li>Your message and selected category.</li>
    <li>Browser information (user agent, viewport size, language, platform, screen dimensions, online status) — collected automatically to help debug reported issues.</li>
    <li>The page URL where feedback was submitted.</li>
    <li>Your email address (if logged in, or if you optionally provide it).</li>
  </ul>

  <h3>Payment Information</h3>
  <p>Payment processing is handled entirely by Stripe. We store only:</p>
  <ul>
    <li>Your Stripe customer ID and subscription ID.</li>
    <li>Subscription status (active, canceled, past due).</li>
  </ul>
  <p>We do <strong>not</strong> store credit card numbers, bank account details, or other payment credentials. See <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">Stripe's Privacy Policy</a> for how they handle your payment data.</p>

  <h2>2. How We Use Your Information</h2>
  <ul>
    <li><strong>Provide the Service</strong> — send your bridge hand data to the AI for analysis and display results.</li>
    <li><strong>Authentication</strong> — verify your identity and manage your account.</li>
    <li><strong>Rate limiting</strong> — enforce daily usage limits based on your subscription tier.</li>
    <li><strong>Transactional emails</strong> — send email verification, password reset links, and access request notifications.</li>
    <li><strong>Improve the Service</strong> — analyze usage patterns (in aggregate) to improve features and performance.</li>
    <li><strong>Customer support</strong> — respond to feedback and bug reports.</li>
  </ul>
  <p>We do <strong>not</strong> use your data for advertising, sell it to third parties, or use it to train AI models.</p>

  <h2>3. Third-Party Services</h2>
  <p>The Service relies on the following third-party providers:</p>

  <table>
    <thead>
      <tr><th>Provider</th><th>Purpose</th><th>Data Shared</th></tr>
    </thead>
    <tbody>
      <tr><td><strong>Anthropic (Claude API)</strong></td><td>AI bridge analysis</td><td>Bridge hand data, prompts (no PII)</td></tr>
      <tr><td><strong>Stripe</strong></td><td>Payment processing</td><td>Email, subscription details</td></tr>
      <tr><td><strong>Resend</strong></td><td>Transactional email</td><td>Email address, email content</td></tr>
      <tr><td><strong>Supabase / PostgreSQL</strong></td><td>Database hosting</td><td>All account and analysis data</td></tr>
      <tr><td><strong>Cloudflare Turnstile</strong></td><td>Bot protection</td><td>Browser fingerprint (anonymized)</td></tr>
      <tr><td><strong>Render</strong></td><td>Application hosting</td><td>Server logs, request metadata</td></tr>
    </tbody>
  </table>

  <h3>Data Sent to Claude AI</h3>
  <p>When you request analysis, we send to Anthropic's Claude API:</p>
  <ul>
    <li>Bridge hand data (card distributions, auction, contract, play record).</li>
    <li>Your selected convention system (SAYC or 2/1 Game Forcing).</li>
    <li>A system prompt describing the analysis format.</li>
  </ul>
  <p>We do <strong>not</strong> send your email, name, or any personal information to Claude. See <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer">Anthropic's Privacy Policy</a> for how they handle API data.</p>

  <h2>4. Data Retention</h2>
  <ul>
    <li><strong>Account data</strong> — retained until you request account deletion.</li>
    <li><strong>Analysis history</strong> — retained indefinitely unless you delete individual entries or clear your history.</li>
    <li><strong>Usage data</strong> — daily counts retained for 90 days for rate limiting and billing records.</li>
    <li><strong>Feedback</strong> — retained indefinitely for service improvement.</li>
    <li><strong>Server logs</strong> — retained for 30 days for debugging and security monitoring.</li>
  </ul>

  <h2>5. Cookies and Local Storage</h2>
  <p>We use minimal browser storage:</p>
  <ul>
    <li><strong>JWT authentication token</strong> — stored in localStorage. Used to keep you signed in. Expires after 7 days.</li>
    <li><strong>User profile data</strong> — stored in localStorage for display purposes.</li>
  </ul>
  <p>We do <strong>not</strong> use tracking cookies, analytics cookies, or advertising cookies. The Cloudflare Turnstile widget may set its own cookies for bot detection purposes.</p>

  <h2>6. Your Rights</h2>
  <p>You have the right to:</p>
  <ul>
    <li><strong>Access</strong> — view all data associated with your account through the application.</li>
    <li><strong>Correction</strong> — update your account information.</li>
    <li><strong>Deletion</strong> — request deletion of your account and all associated data.</li>
    <li><strong>Data export</strong> — download your analysis history via the application's history feature.</li>
    <li><strong>Withdrawal of consent</strong> — cancel your account at any time.</li>
  </ul>
  <p>To exercise these rights, use the Feedback form in the application or contact us via email.</p>

  <h2>7. Security Measures</h2>
  <p>We implement the following security measures:</p>
  <ul>
    <li>Passwords hashed with bcrypt (12 rounds).</li>
    <li>Security tokens (reset, verification) stored as SHA-256 hashes with expiration.</li>
    <li>HTTPS encryption for all data in transit.</li>
    <li>CORS restrictions limiting API access to authorized origins.</li>
    <li>Cloudflare Turnstile bot protection on public forms.</li>
    <li>Rate limiting to prevent abuse.</li>
    <li>JWT authentication with 7-day expiration.</li>
  </ul>

  <h2>8. Children's Privacy</h2>
  <p>The Service is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided us with personal information, please contact us so we can delete it.</p>

  <h2>9. International Data Transfers</h2>
  <p>Your data may be processed in the United States where our servers and third-party providers are located. By using the Service, you consent to this transfer.</p>

  <h2>10. Changes to This Policy</h2>
  <p>We may update this Privacy Policy from time to time. When we do:</p>
  <ul>
    <li>We will update the "Last updated" date at the top of this page.</li>
    <li>For material changes, we will notify you via email.</li>
    <li>Continued use of the Service after changes constitutes acceptance of the updated policy.</li>
  </ul>

  <h2>11. Contact</h2>
  <p>If you have questions about this Privacy Policy or wish to exercise your data rights, please use the Feedback form in the application or contact us via email.</p>
</div>

<style>
  .legal {
    max-width: 700px; margin: 0 auto; padding: 40px 20px;
    color: #b0c8b0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    line-height: 1.7; font-size: 14px;
  }
  .back-link { color: #d4af37; text-decoration: none; font-size: 13px; display: inline-block; margin-bottom: 24px; }
  .back-link:hover { text-decoration: underline; }
  h1 { font-size: 28px; color: #d4af37; margin: 0 0 8px; }
  .updated { font-size: 12px; color: #6a8a6a; margin-bottom: 28px; }
  h2 { font-size: 18px; color: #c0d8c0; margin: 28px 0 12px; border-bottom: 1px solid #1a2a1a; padding-bottom: 6px; }
  h3 { font-size: 15px; color: #a0b8a0; margin: 16px 0 8px; }
  p { margin: 0 0 12px; }
  ul { margin: 0 0 12px; padding-left: 24px; }
  li { margin-bottom: 6px; }
  a { color: #d4af37; }
  strong { color: #e0c860; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
  th { text-align: left; padding: 8px; background: #0a1a0a; color: #8aa08a; border-bottom: 1px solid #1a3a1a; }
  td { padding: 8px; border-bottom: 1px solid #0e1e0e; }
</style>
