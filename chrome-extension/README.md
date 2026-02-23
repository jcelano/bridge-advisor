# Bridge Advisor Connector — Chrome Extension

Automatically captures PBN hands exported from [Trickster Cards](https://www.trickstercards.com) and sends them to Bridge Advisor with one click.

## Setup (one time)

### 1. Generate the icons
```bash
cd bridge-advisor/chrome-extension
node create-icons.js
```

### 2. Load into Chrome
1. Open **chrome://extensions**
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked**
4. Select the `chrome-extension/` folder
5. The ♠ icon appears in your toolbar

### 3. Set your Bridge Advisor URL
Click the ♠ icon → enter your Bridge Advisor URL → **Save**

| Where you run it | URL to enter |
|------------------|-------------|
| Local dev        | `http://localhost:5174` (default) |
| Hosted on Render | `https://your-app.onrender.com` |
| Hosted on Vercel | `https://your-app.vercel.app` |

---

## Using it

1. Play a hand on Trickster Cards
2. Enable **"Review last deal"** in your game rules so the export option appears
3. In the post-hand review, go to **menu → Current Game → Export Hand to PBN**
4. The extension automatically detects the PBN — a floating button appears:

   ```
   ♠ PBN hand captured
   [ Open in Bridge Advisor → ]
   ```

5. Click **Open in Bridge Advisor** — the hand is imported automatically, no copy-paste needed

You can also click the ♠ toolbar icon at any time to re-open the last captured hand or copy the raw PBN.

---

## How it works

The content script (`content.js`) runs on `trickstercards.com` and uses four detection strategies in parallel:

| Strategy | What it catches |
|----------|----------------|
| `fetch()` interceptor | API responses containing PBN text |
| `XMLHttpRequest` interceptor | Older-style AJAX calls |
| `<a download>` click interceptor | Blob-URL file downloads |
| DOM `MutationObserver` | PBN text rendered into a textarea or `<pre>` block |

Whichever strategy fires first wins. The PBN is saved to `chrome.storage.local` so the popup can access it even after you navigate away.

---

## Files

```
chrome-extension/
├── manifest.json      Chrome extension config (Manifest V3)
├── content.js         Runs on trickstercards.com — detects PBN
├── background.js      Service worker — manages toolbar badge
├── popup.html         Extension icon popup UI
├── popup.js           Popup logic
├── create-icons.js    Run once to generate PNG icons (no npm needed)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Updating

After any code change, go to **chrome://extensions** and click the **↺ refresh** button on the extension card.

## Publishing (optional)

To share with others via the Chrome Web Store:
1. Zip the `chrome-extension/` folder (excluding `create-icons.js` and `README.md`)
2. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Pay the one-time $5 developer fee
4. Upload the zip and submit for review (~1–3 days)
