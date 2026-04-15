/**
 * Options / Settings page script.
 */
import './options.css';
import { DEFAULT_SETTINGS, DELAY_PRESETS } from '../shared/constants.js';

function sendSW(type, extra = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...extra }, (res) => resolve(res));
  });
}

async function init() {
  const settings = await sendSW('GET_SETTINGS') || DEFAULT_SETTINGS;

  // Delay preset
  const presetSelect = document.querySelector('#delay-preset');
  const customRow = document.querySelector('#custom-delay-row');

  // Detect which preset matches current settings
  let activePreset = 'custom';
  for (const [key, preset] of Object.entries(DELAY_PRESETS)) {
    if (settings.delayMin === preset.min && settings.delayMax === preset.max) {
      activePreset = key;
      break;
    }
  }
  presetSelect.value = activePreset;
  document.querySelector('#delay-min').value = settings.delayMin;
  document.querySelector('#delay-max').value = settings.delayMax;
  customRow.classList.toggle('hidden', activePreset !== 'custom');

  presetSelect.onchange = () => {
    const v = presetSelect.value;
    customRow.classList.toggle('hidden', v !== 'custom');
    if (v !== 'custom') {
      document.querySelector('#delay-min').value = DELAY_PRESETS[v].min;
      document.querySelector('#delay-max').value = DELAY_PRESETS[v].max;
    }
  };

  // Other fields
  document.querySelector('#batch-size').value = settings.batchSize;
  document.querySelector('#batch-pause').value = Math.round(settings.batchPauseMs / 60000);
  document.querySelector('#validate-before-send').checked = settings.validateBeforeSend;
  document.querySelector('#simulate-typing').checked = settings.simulateTyping;
  document.querySelector('#privacy-mode').checked = settings.privacyMode || false;

  // Storage usage
  chrome.storage.local.getBytesInUse(null, (bytes) => {
    const kb = (bytes / 1024).toFixed(1);
    const mb = (bytes / 1048576).toFixed(2);
    document.querySelector('#storage-usage').textContent =
      bytes > 1048576 ? `${mb} MB` : `${kb} KB`;
  });

  // Save
  document.querySelector('#save-btn').onclick = async () => {
    const preset = presetSelect.value;
    const delayMin = preset === 'custom'
      ? parseInt(document.querySelector('#delay-min').value)
      : DELAY_PRESETS[preset].min;
    const delayMax = preset === 'custom'
      ? parseInt(document.querySelector('#delay-max').value)
      : DELAY_PRESETS[preset].max;

    const newSettings = {
      delayMin,
      delayMax,
      batchSize: parseInt(document.querySelector('#batch-size').value),
      batchPauseMs: parseFloat(document.querySelector('#batch-pause').value) * 60000,
      validateBeforeSend: document.querySelector('#validate-before-send').checked,
      simulateTyping: document.querySelector('#simulate-typing').checked,
      privacyMode: document.querySelector('#privacy-mode').checked,
    };

    await sendSW('SAVE_SETTINGS', { settings: newSettings });

    // Toggle privacy mode CSS in WhatsApp tab
    togglePrivacyMode(newSettings.privacyMode);

    const statusEl = document.querySelector('#save-status');
    statusEl.textContent = '✓ Saved';
    setTimeout(() => { statusEl.textContent = ''; }, 2500);
  };

  // Clear reports
  document.querySelector('#clear-reports').onclick = async () => {
    if (!confirm('Clear ALL report data? This cannot be undone.')) return;
    await sendSW('CLEAR_REPORTS');
    alert('All reports cleared.');
  };

  // Reset disclaimer
  document.querySelector('#reset-disclaimer').onclick = async () => {
    await sendSW('SAVE_SETTINGS', { settings: { disclaimerAccepted: false } });
    alert('Disclaimer reset. It will show again next time you open the panel.');
  };

  // Privacy mode: apply immediately if enabled on load
  if (settings.privacyMode) togglePrivacyMode(true);
}

function togglePrivacyMode(enable) {
  chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }, (tabs) => {
    for (const tab of tabs) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (enabled) => {
          const PRIVACY_ID = 'unosender-privacy-style';
          let el = document.getElementById(PRIVACY_ID);
          if (enabled) {
            if (!el) {
              el = document.createElement('style');
              el.id = PRIVACY_ID;
              document.head.appendChild(el);
            }
            el.textContent = `
              [data-testid="cell-frame-title"],
              [data-testid="cell-frame-secondary"],
              ._3Whw5, .copyable-text, span[dir="auto"],
              [data-testid="msg-container"] .copyable-text,
              img[src*="pps.whatsapp.net"],
              [data-testid="avatar-photo"]
              { filter: blur(6px) !important; user-select: none; }
            `;
          } else {
            el && el.remove();
          }
        },
        args: [enable],
        world: 'MAIN',
      }).catch(() => {});
    }
  });
}

init();
