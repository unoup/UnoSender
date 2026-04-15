/**
 * UnoSender Content Script — runs in ISOLATED world on web.whatsapp.com
 *
 * Acts as a bridge between the Service Worker (chrome.runtime) and
 * the wa-bridge.js (MAIN world).
 *
 * Communication:
 *   Service Worker → content.js : chrome.tabs.sendMessage
 *   content.js → wa-bridge.js   : window.postMessage (to MAIN world)
 *   wa-bridge.js → content.js   : window.postMessage (back to ISOLATED)
 *   content.js → Service Worker : chrome.runtime.sendMessage
 */

import { injectWaBridge } from './injector.js';
import { MSG } from '../shared/constants.js';

const PREFIX = 'UNOSENDER_';
const pendingRequests = new Map(); // requestId → { resolve, reject, timeout }

// ─── Inject wa-bridge into MAIN world ────────────────────────────────────────
injectWaBridge().then(() => {
  console.log('[UnoSender] Content script ready');
}).catch(err => {
  console.error('[UnoSender] Injection error:', err);
});

// ─── Listen for results from MAIN world (wa-bridge) ──────────────────────────
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || !data[PREFIX + 'dir'] || data[PREFIX + 'dir'] !== 'from-main') return;

  const { requestId, success, result, error } = data;
  const pending = pendingRequests.get(requestId);
  if (!pending) return;

  clearTimeout(pending.timeout);
  pendingRequests.delete(requestId);

  if (success) {
    pending.resolve(result);
  } else {
    pending.reject(new Error(error || 'Unknown wa-bridge error'));
  }
});

// ─── Listen for WPP_READY signal from MAIN world ─────────────────────────────
let wppReady = false;
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data && event.data[PREFIX + 'type'] === 'WPP_READY') {
    wppReady = true;
  }
});

// ─── Send a command to wa-bridge and await the response ──────────────────────
function sendToMainWorld(type, payload, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const requestId = generateId();
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`wa-bridge timeout for ${type}`));
    }, timeoutMs);

    pendingRequests.set(requestId, { resolve, reject, timeout });

    window.postMessage({
      [PREFIX + 'dir']: 'to-main',
      [PREFIX + 'type']: type,
      requestId,
      payload,
    }, '*');
  });
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Listen for commands from Service Worker ──────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleCommand(msg)
    .then(result => sendResponse({ ok: true, ...result }))
    .catch(err => sendResponse({ ok: false, error: err.message }));
  return true;
});

async function handleCommand(msg) {
  switch (msg.type) {
    case MSG.SEND_TEXT:
      return sendToMainWorld('SEND_TEXT', msg.payload);

    case MSG.SEND_FILE:
      return sendToMainWorld('SEND_FILE', msg.payload, 30000);

    case MSG.VALIDATE_NUMBER:
      return sendToMainWorld('VALIDATE', msg.payload);

    case MSG.LIST_CONTACTS:
      return sendToMainWorld('LIST_CONTACTS', msg.payload, 60000);

    case MSG.SEND_TYPING:
      return sendToMainWorld('SEND_TYPING', msg.payload, 5000);

    case MSG.WPP_READY_CHECK:
      return { ready: wppReady };

    default:
      throw new Error(`Unknown command type: ${msg.type}`);
  }
}

// ─── Auto-reply: listen for incoming messages via wa-bridge event ─────────────
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data[PREFIX + 'type'] !== 'INCOMING_MESSAGE') return;

  const { from, body } = event.data.payload || {};
  if (!from || !body) return;

  // Forward to service worker to check auto-reply rules
  chrome.runtime.sendMessage({
    type: 'INCOMING_MESSAGE',
    payload: { from, body },
  }).catch(() => {});
});
