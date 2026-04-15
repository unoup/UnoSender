# UnoSender — WhatsApp Bulk Sender Chrome Extension

A fully local Chrome extension that replicates Wasender's paid features. No external API. No subscription. Everything runs in your browser using your existing WhatsApp Web session.

> **Warning:** Bulk messaging violates WhatsApp's Terms of Service and may result in account bans. Use responsibly and only message contacts who have consented.

---

## Features

- **Bulk messaging** — send personalized messages to hundreds of contacts
- **CSV / Excel / VCF import** — import contacts from any spreadsheet
- **Variable placeholders** — `{Name}`, `{OrderID}`, any column from your spreadsheet
- **Multi-template randomization** — rotate between templates to vary message content
- **Media support** — images, videos, documents, audio, VCF cards
- **Anti-ban safety** — configurable delays (5 s – 2 min), batch pauses, number validation
- **Scheduling** — schedule campaigns with optional time windows (e.g. 9 AM–5 PM only)
- **Resume** — campaigns survive Chrome restarts and WhatsApp tab reloads
- **Reports** — downloadable CSV reports per campaign
- **Contact export** — export all WhatsApp contacts to VCF/CSV
- **Privacy mode** — blur contacts, names, and messages for screen sharing
- **Auto-reply** — keyword-based auto-responses to incoming messages

---

## Installation (Development / Unpacked)

### 1. Build wa-js (one-time setup)

The extension uses [wa-js](https://github.com/wppconnect-team/wa-js) by WPPConnect to hook into WhatsApp Web's internal APIs. Build it once:

```bash
git clone https://github.com/wppconnect-team/wa-js.git
cd wa-js
npm install
npm run build
cp dist/wppconnect-wa.js ../vendors/wa.js
cd ..
```

### 2. Install dependencies and build

```bash
npm install
npm run build        # Production build → dist/
# or
npm run dev          # Development build with watch mode
```

### 3. Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` folder

### 4. Use it

1. Open **WhatsApp Web** (`web.whatsapp.com`) and log in
2. Click the UnoSender icon in the Chrome toolbar
3. Click **Open UnoSender Panel**
4. Accept the disclaimer and start sending

---

## Architecture

```
manifest.json           MV3 extension config
src/
  background/           Service worker — campaign engine, alarms, storage
  content/              Content scripts — bridge between SW and WhatsApp Web
    content.js          Isolated world: routes messages
    wa-bridge.js        Main world: calls window.WPP.* APIs
    injector.js         Injects wa.js + wa-bridge.js as <script> tags
  sidepanel/            Main UI (Chrome Side Panel)
  popup/                Toolbar popup (quick stats)
  options/              Settings page
  shared/               Shared utilities (models, constants, CSV, phone parser)
vendors/
  wa.js                 Pre-built wa-js bundle (local copy, not CDN)
```

**Message flow:**
`Side Panel` → `chrome.runtime.sendMessage` → `Service Worker` → `chrome.tabs.sendMessage` → `Content Script` → `window.postMessage` → `wa-bridge.js` → `window.WPP.*` → WhatsApp Web

---

## Building for distribution

```bash
npm run zip    # Creates unosender.zip ready for Chrome Web Store or manual install
```

---

## Disclaimer

This project is not affiliated, associated, authorized, endorsed by, or in any way officially connected with WhatsApp or any of its subsidiaries or affiliates. The official WhatsApp website can be found at https://whatsapp.com. "WhatsApp" as well as related names, marks, emblems and images are registered trademarks of their respective owners.

Using automated messaging tools may violate WhatsApp's Terms of Service. The author is not responsible for any account bans caused by use of this software.
