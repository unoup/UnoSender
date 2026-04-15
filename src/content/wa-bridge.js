/**
 * wa-bridge.js — runs in the page's MAIN WORLD.
 *
 * Injected via <script> tag by injector.js (ISOLATED world).
 * Has direct access to window.WPP (set up by wa.js / WPPConnect wa-js bundle).
 *
 * Receives postMessage commands from content.js (ISOLATED world),
 * executes WPP.* calls, and posts results back.
 *
 * Falls back to DOM manipulation if WPP is not available.
 */

(function () {
  'use strict';

  const PREFIX = 'UNOSENDER_';
  const READY_POLL_INTERVAL = 500;
  const READY_TIMEOUT = 60000;

  // ─── Wait for WPP to be ready ───────────────────────────────────────────────
  function waitForWPP() {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = setInterval(() => {
        if (typeof window.WPP !== 'undefined' && window.WPP.isReady) {
          clearInterval(check);
          resolve(window.WPP);
        } else if (Date.now() - start > READY_TIMEOUT) {
          clearInterval(check);
          // Resolve anyway — we'll use DOM fallback
          resolve(null);
        }
      }, READY_POLL_INTERVAL);
    });
  }

  // Signal to content script that we are loaded
  waitForWPP().then((wpp) => {
    window.postMessage({
      [PREFIX + 'type']: 'WPP_READY',
      [PREFIX + 'dir']: 'from-main',
      wppAvailable: !!wpp,
    }, '*');
  });

  // ─── Listen for commands from content.js ─────────────────────────────────────
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data[PREFIX + 'dir'] !== 'to-main') return;

    const { [PREFIX + 'type']: type, requestId, payload } = data;

    try {
      const result = await handleCommand(type, payload);
      window.postMessage({
        [PREFIX + 'dir']: 'from-main',
        requestId,
        success: true,
        result,
      }, '*');
    } catch (err) {
      window.postMessage({
        [PREFIX + 'dir']: 'from-main',
        requestId,
        success: false,
        error: err.message,
      }, '*');
    }
  });

  // ─── Command Handlers ─────────────────────────────────────────────────────────
  async function handleCommand(type, payload) {
    const wpp = window.WPP;

    switch (type) {
      case 'SEND_TEXT':
        return sendText(wpp, payload);

      case 'SEND_FILE':
        return sendFile(wpp, payload);

      case 'VALIDATE':
        return validateNumber(wpp, payload);

      case 'SEND_TYPING':
        return sendTyping(wpp, payload);

      case 'LIST_CONTACTS':
        return listContacts(wpp);

      default:
        throw new Error(`Unknown wa-bridge command: ${type}`);
    }
  }

  // ─── Send Text Message ────────────────────────────────────────────────────────
  async function sendText(wpp, { chatId, text }) {
    if (wpp && wpp.chat) {
      return wpp.chat.sendTextMessage(chatId, text, { waitForAck: true });
    }
    return domSendText(chatId, text);
  }

  // ─── Send File / Media ────────────────────────────────────────────────────────
  async function sendFile(wpp, { chatId, dataUrl, filename, mimeType, caption }) {
    if (wpp && wpp.chat) {
      return wpp.chat.sendFileMessage(chatId, dataUrl, {
        type: 'auto',
        caption: caption || '',
        filename: filename || 'attachment',
        mimetype: mimeType || 'application/octet-stream',
      });
    }
    // DOM fallback for media is limited — just send caption as text if present
    if (caption) return domSendText(chatId, caption);
    throw new Error('Media sending requires wa-js. DOM fallback not available for media.');
  }

  // ─── Validate Number ──────────────────────────────────────────────────────────
  async function validateNumber(wpp, { chatId }) {
    if (wpp && wpp.contact) {
      // queryExists returns contact info if on WhatsApp, null/false otherwise
      const result = await wpp.contact.queryExists(chatId);
      return { exists: !!result };
    }
    // Without WPP, assume valid (skip validation)
    return { exists: true };
  }

  // ─── Typing Indicator ─────────────────────────────────────────────────────────
  async function sendTyping(wpp, { chatId }) {
    if (wpp && wpp.chat) {
      await wpp.chat.sendStateTyping(chatId);
      // Stop typing after a natural delay
      await sleep(randBetween(1000, 3000));
      await wpp.chat.sendStateStop(chatId);
      return { ok: true };
    }
    return { ok: false };
  }

  // ─── List WhatsApp Contacts ────────────────────────────────────────────────────
  async function listContacts(wpp) {
    if (wpp && wpp.contact) {
      const contacts = await wpp.contact.list();
      return contacts
        .filter(c => c.id && c.id._serialized && !c.isGroup)
        .map(c => ({
          chatId: c.id._serialized,
          phone: c.id.user,
          name: c.name || c.pushname || c.verifiedName || '',
        }));
    }
    return [];
  }

  // ─── DOM Fallback: Send Text via WhatsApp Web DOM ─────────────────────────────
  async function domSendText(chatId, text) {
    // Open the chat by phone number search
    const phone = chatId.replace('@c.us', '');
    const searchInput = await waitForElement('[data-testid="chat-list-search"], [title="Search input textbox"]', 5000);
    if (!searchInput) throw new Error('WhatsApp search box not found');

    setReactValue(searchInput, phone);
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await sleep(1500);

    // Find the message compose box
    const composeBox = await waitForElement(
      '[data-testid="conversation-compose-box-input"], footer [contenteditable="true"]',
      5000
    );
    if (!composeBox) throw new Error('WhatsApp message compose box not found');

    composeBox.focus();
    insertTextIntoContentEditable(composeBox, text);
    await sleep(300);

    // Click send button
    const sendBtn = await waitForElement('[data-testid="send"], [data-testid="compose-btn-send"]', 3000);
    if (!sendBtn) {
      // Fallback: press Enter
      composeBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    } else {
      sendBtn.click();
    }

    await sleep(500);
    return { ok: true, method: 'dom' };
  }

  function insertTextIntoContentEditable(el, text) {
    // Handles React's synthetic events on contenteditable divs
    el.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
    // Trigger React's onChange
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function setReactValue(input, value) {
    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(input), 'value'
    );
    if (nativeValueSetter && nativeValueSetter.set) {
      nativeValueSetter.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function waitForElement(selector, timeout = 5000) {
    return new Promise(resolve => {
      const el = document.querySelector(selector);
      if (el) { resolve(el); return; }

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) { observer.disconnect(); resolve(found); }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
    });
  }

  // ─── Auto-reply: Listen for incoming messages ─────────────────────────────────
  function setupAutoReplyListener(wpp) {
    if (!wpp || !wpp.ev) return;
    wpp.ev.on('onmessage', (message) => {
      if (!message.isGroupMsg && !message.fromMe) {
        window.postMessage({
          [PREFIX + 'type']: 'INCOMING_MESSAGE',
          [PREFIX + 'dir']: 'from-main',
          payload: {
            from: message.from,
            body: message.body || '',
          },
        }, '*');
      }
    });
  }

  // Set up listener once WPP is available
  waitForWPP().then(wpp => {
    if (wpp) setupAutoReplyListener(wpp);
  });

  // ─── Utilities ────────────────────────────────────────────────────────────────
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function randBetween(min, max) { return Math.floor(Math.random() * (max - min + 1) + min); }

})();
