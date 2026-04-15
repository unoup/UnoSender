/**
 * UnoSender Service Worker (MV3)
 *
 * Responsibilities:
 * - Route messages from popup/sidepanel to campaign engine
 * - Handle chrome.alarms for tick loop and scheduling
 * - Rehydrate active campaign on service worker restart
 */
import { MSG, CAMPAIGN_STATUS } from '../shared/constants.js';
import {
  startCampaign, pauseCampaign, resumeCampaign,
  cancelCampaign, processTick, rehydrateActiveCampaign,
} from './campaign-engine.js';
import { parseAlarmName, scheduleCampaign } from './scheduler.js';
import {
  getCampaign, getCampaigns, getSettings, saveSettings,
  getContactLists, getContactList, saveContactList, deleteContactList,
  getTemplates, getTemplate, saveTemplate, deleteTemplate,
  saveCampaign, deleteCampaign, updateCampaignStatus,
  getAutoReplyRules, saveAutoReplyRule, deleteAutoReplyRule,
} from './storage.js';
import { getReportsByCampaign, getAllReports, clearReportsByCampaign, clearAllReports } from './reports-db.js';

// ─── Side Panel: open on toolbar icon click ───────────────────────────────────
chrome.sidePanel
  ? chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
  : null;

// ─── Message Router ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender)
    .then(sendResponse)
    .catch(err => sendResponse({ error: err.message }));
  return true; // keep channel open for async response
});

async function handleMessage(msg, sender) {
  switch (msg.type) {
    // ── Campaign Actions ─────────────────────────────────────────────────────
    case MSG.START_CAMPAIGN:
      await startCampaign(msg.campaignId);
      return { ok: true };

    case MSG.PAUSE_CAMPAIGN:
      await pauseCampaign(msg.campaignId);
      return { ok: true };

    case MSG.RESUME_CAMPAIGN:
      await resumeCampaign(msg.campaignId);
      return { ok: true };

    case MSG.CANCEL_CAMPAIGN:
      await cancelCampaign(msg.campaignId);
      return { ok: true };

    // ── Data CRUD ────────────────────────────────────────────────────────────
    case 'GET_CAMPAIGNS': return getCampaigns();
    case 'GET_CAMPAIGN': return getCampaign(msg.id);
    case 'SAVE_CAMPAIGN': return saveCampaign(msg.campaign);
    case 'DELETE_CAMPAIGN':
      await deleteCampaign(msg.id);
      return { ok: true };
    case 'SCHEDULE_CAMPAIGN': {
      const c = await getCampaign(msg.campaignId);
      if (c) {
        c.status = CAMPAIGN_STATUS.SCHEDULED;
        c.scheduledAt = msg.scheduledAt;
        await saveCampaign(c);
        scheduleCampaign(msg.campaignId, msg.scheduledAt);
      }
      return { ok: true };
    }

    case 'GET_CONTACT_LISTS': return getContactLists();
    case 'GET_CONTACT_LIST': return getContactList(msg.id);
    case 'SAVE_CONTACT_LIST': return saveContactList(msg.list);
    case 'DELETE_CONTACT_LIST':
      await deleteContactList(msg.id);
      return { ok: true };

    case 'GET_TEMPLATES': return getTemplates();
    case 'GET_TEMPLATE': return getTemplate(msg.id);
    case 'SAVE_TEMPLATE': return saveTemplate(msg.template);
    case 'DELETE_TEMPLATE':
      await deleteTemplate(msg.id);
      return { ok: true };

    case 'GET_SETTINGS': return getSettings();
    case 'SAVE_SETTINGS':
      await saveSettings(msg.settings);
      return { ok: true };

    // ── Reports ──────────────────────────────────────────────────────────────
    case 'GET_REPORTS': return msg.campaignId
      ? getReportsByCampaign(msg.campaignId)
      : getAllReports();
    case 'CLEAR_REPORTS':
      if (msg.campaignId) await clearReportsByCampaign(msg.campaignId);
      else await clearAllReports();
      return { ok: true };

    // ── Auto-Reply ────────────────────────────────────────────────────────────
    case 'GET_AUTO_REPLY_RULES': return getAutoReplyRules();
    case 'SAVE_AUTO_REPLY_RULE': return saveAutoReplyRule(msg.rule);
    case 'DELETE_AUTO_REPLY_RULE':
      await deleteAutoReplyRule(msg.id);
      return { ok: true };

    // ── Contact Export from WhatsApp ──────────────────────────────────────────
    case MSG.EXPORT_CONTACTS: {
      const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
      const tab = tabs.find(t => t.status === 'complete');
      if (!tab) throw new Error('WhatsApp Web tab not found. Please open web.whatsapp.com.');
      const res = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, { type: MSG.LIST_CONTACTS }, (r) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(r);
        });
      });
      return { contacts: (res && res.data) || [] };
    }

    // ── WA Status Check ───────────────────────────────────────────────────────
    case MSG.CHECK_WA_READY: {
      const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
      const tab = tabs.find(t => t.status === 'complete');
      if (!tab) return { ready: false, reason: 'no_tab' };
      try {
        const res = await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tab.id, { type: MSG.WPP_READY_CHECK }, (r) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(r);
          });
        });
        return { ready: res && res.ready, tabId: tab.id };
      } catch {
        return { ready: false, reason: 'content_not_ready' };
      }
    }

    // ── Incoming message (auto-reply) ─────────────────────────────────────────
    case 'INCOMING_MESSAGE': {
      const rulesMap = await getAutoReplyRules();
      const rules = Object.values(rulesMap).filter(r => r.enabled)
        .sort((a, b) => a.priority - b.priority);
      const { matchesAutoReplyRule } = await import('../shared/models.js');
      for (const rule of rules) {
        if (matchesAutoReplyRule(rule, msg.payload.body)) {
          const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
          const tab = tabs.find(t => t.status === 'complete');
          if (tab) {
            chrome.tabs.sendMessage(tab.id, {
              type: MSG.SEND_TEXT,
              payload: { chatId: msg.payload.from, text: rule.response },
            });
          }
          break; // only fire first matching rule
        }
      }
      return { ok: true };
    }

    default:
      return { error: `Unknown message type: ${msg.type}` };
  }
}

// ─── Alarm Handler ────────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  const parsed = parseAlarmName(alarm.name);
  if (!parsed) return;

  if (parsed.type === 'tick') {
    await processTick(parsed.campaignId).catch(console.error);
  } else if (parsed.type === 'schedule') {
    const campaign = await getCampaign(parsed.campaignId);
    if (campaign && campaign.status === CAMPAIGN_STATUS.SCHEDULED) {
      await startCampaign(parsed.campaignId).catch(console.error);
    }
  }
});

// ─── Tab tracking for WhatsApp Web ───────────────────────────────────────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || !tab.url.startsWith('https://web.whatsapp.com')) return;
  // Rehydrate if a campaign was running when WhatsApp tab reloaded
  await rehydrateActiveCampaign().catch(console.error);
});

// ─── Rehydrate on service worker restart ─────────────────────────────────────
self.addEventListener('activate', () => {
  rehydrateActiveCampaign().catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  rehydrateActiveCampaign().catch(console.error);
});
