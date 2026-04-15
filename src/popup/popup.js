/**
 * Popup script — quick stats and actions.
 */
import './popup.css';
import { MSG, CAMPAIGN_STATUS } from '../shared/constants.js';

function sendSW(type, extra = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...extra }, (res) => resolve(res));
  });
}

async function init() {
  // Load stats
  const [campaigns, contactLists, templates] = await Promise.all([
    sendSW('GET_CAMPAIGNS'),
    sendSW('GET_CONTACT_LISTS'),
    sendSW('GET_TEMPLATES'),
  ]);

  const campaignArr = Object.values(campaigns || {});
  document.querySelector('#stat-campaigns').textContent = campaignArr.length;
  document.querySelector('#stat-lists').textContent = Object.keys(contactLists || {}).length;
  document.querySelector('#stat-templates').textContent = Object.keys(templates || {}).length;

  // Active campaign
  const running = campaignArr.find(c => c.status === CAMPAIGN_STATUS.RUNNING || c.status === CAMPAIGN_STATUS.PAUSED);
  if (running) {
    const bar = document.querySelector('#active-campaign-bar');
    bar.classList.remove('hidden');
    document.querySelector('#active-campaign-name').textContent =
      `${running.status === CAMPAIGN_STATUS.PAUSED ? '⏸ ' : '▶ '}${running.name}`;
  }

  // WA status
  const status = await sendSW(MSG.CHECK_WA_READY);
  const dot = document.querySelector('#status-dot');
  const text = document.querySelector('#status-text');
  if (status && status.ready) {
    dot.className = 'dot ready';
    text.textContent = 'WhatsApp Connected';
  } else {
    dot.className = 'dot offline';
    text.textContent = status?.reason === 'no_tab' ? 'Open WhatsApp Web first' : 'WhatsApp not ready';
  }
}

// Open side panel
document.querySelector('#btn-open').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (chrome.sidePanel) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } else {
    // Fallback: open as tab
    chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel/index.html') });
  }
  window.close();
};

// Open WhatsApp Web
document.querySelector('#btn-open-wa').onclick = async () => {
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  if (tabs.length > 0) {
    chrome.tabs.update(tabs[0].id, { active: true });
    chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    chrome.tabs.create({ url: 'https://web.whatsapp.com/' });
  }
  window.close();
};

// Options
document.querySelector('#btn-options').onclick = () => {
  chrome.runtime.openOptionsPage();
  window.close();
};

init();
