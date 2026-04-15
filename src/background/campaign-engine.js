/**
 * Campaign execution engine.
 *
 * Uses a chrome.alarms tick loop so the service worker can be terminated
 * between sends and safely resume from chrome.storage.local on re-wake.
 *
 * Flow per tick:
 *   1. Load campaign from storage
 *   2. Get current contact at progress.cursor
 *   3. Send message via content script → wa-bridge
 *   4. Record result, advance cursor
 *   5. Schedule next tick with delay (or complete)
 */
import {
  getCampaign, getContactList, getTemplate,
  updateCampaignProgress, updateCampaignStatus,
  saveCampaign, getActiveCampaignId, setActiveCampaignId,
} from './storage.js';
import {
  scheduleCampaignTick, cancelCampaignTick,
  isWithinTimeWindow, msUntilWindowOpens,
} from './scheduler.js';
import { MSG, CAMPAIGN_STATUS, MESSAGE_STATUS, randBetween } from '../shared/constants.js';
import { renderTemplate, pickTemplate } from '../shared/models.js';
import { saveReportEntry } from './reports-db.js';

/**
 * Find the active WhatsApp Web tab.
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
async function findWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  return tabs.find(t => t.status === 'complete') || null;
}

/**
 * Send a command to the content script in the WhatsApp tab.
 * Returns the response or throws.
 */
async function sendToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response && response.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Broadcast a status update to all extension pages.
 */
function broadcast(type, data) {
  chrome.runtime.sendMessage({ type, ...data }).catch(() => {
    // No listeners — fine, sidepanel may be closed
  });
}

/**
 * Start a campaign: validate, set status to running, schedule first tick.
 */
export async function startCampaign(campaignId) {
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  // Reset progress if starting fresh (not resuming)
  if (campaign.status === 'draft' || campaign.status === 'cancelled') {
    campaign.progress = { cursor: 0, sent: 0, failed: 0, skipped: 0, startedAt: null, completedAt: null };
  }

  await updateCampaignStatus(campaignId, CAMPAIGN_STATUS.RUNNING);
  await setActiveCampaignId(campaignId);

  // Fire first tick immediately
  scheduleCampaignTick(campaignId, 500);
}

/**
 * Pause the running campaign.
 */
export async function pauseCampaign(campaignId) {
  cancelCampaignTick(campaignId);
  await updateCampaignStatus(campaignId, CAMPAIGN_STATUS.PAUSED);
  broadcast(MSG.PROGRESS_UPDATE, { campaignId, status: CAMPAIGN_STATUS.PAUSED });
}

/**
 * Resume a paused campaign.
 */
export async function resumeCampaign(campaignId) {
  await updateCampaignStatus(campaignId, CAMPAIGN_STATUS.RUNNING);
  scheduleCampaignTick(campaignId, 1000);
}

/**
 * Cancel a campaign, resetting its cursor.
 */
export async function cancelCampaign(campaignId) {
  cancelCampaignTick(campaignId);
  const campaign = await getCampaign(campaignId);
  if (campaign) {
    campaign.status = CAMPAIGN_STATUS.CANCELLED;
    campaign.progress.cursor = 0;
    await saveCampaign(campaign);
  }
  const active = await getActiveCampaignId();
  if (active === campaignId) await setActiveCampaignId(null);
  broadcast(MSG.PROGRESS_UPDATE, { campaignId, status: CAMPAIGN_STATUS.CANCELLED });
}

/**
 * Main tick handler — called by service worker when alarm fires.
 */
export async function processTick(campaignId) {
  const campaign = await getCampaign(campaignId);
  if (!campaign || campaign.status !== CAMPAIGN_STATUS.RUNNING) return;

  // Enforce time window
  if (!isWithinTimeWindow(campaign.scheduleWindowStart, campaign.scheduleWindowEnd)) {
    const waitMs = msUntilWindowOpens(campaign.scheduleWindowStart);
    scheduleCampaignTick(campaignId, waitMs);
    broadcast(MSG.PROGRESS_UPDATE, {
      campaignId,
      status: 'waiting_window',
      message: `Outside time window. Resuming at ${campaign.scheduleWindowStart}`,
    });
    return;
  }

  const contactList = await getContactList(campaign.contactListId);
  if (!contactList || !contactList.contacts.length) {
    await completeCampaign(campaignId, campaign);
    return;
  }

  const contacts = contactList.contacts;
  const cursor = campaign.progress.cursor;

  if (cursor >= contacts.length) {
    await completeCampaign(campaignId, campaign);
    return;
  }

  // Check batch pause boundary
  const { batchSize, batchPauseMs, delayMin, delayMax } = campaign.settings;
  if (batchSize > 0 && cursor > 0 && cursor % batchSize === 0) {
    broadcast(MSG.PROGRESS_UPDATE, {
      campaignId,
      status: 'batch_pause',
      progress: campaign.progress,
      message: `Batch pause: ${Math.round(batchPauseMs / 60000)} min`,
    });
    scheduleCampaignTick(campaignId, batchPauseMs);
    return;
  }

  const contact = contacts[cursor];

  // Find WhatsApp tab
  const tab = await findWhatsAppTab();
  if (!tab) {
    broadcast(MSG.CAMPAIGN_ERROR, { campaignId, error: 'WhatsApp Web tab not found. Please open web.whatsapp.com.' });
    await pauseCampaign(campaignId);
    return;
  }

  // Build message text from template
  const templates = await loadTemplates(campaign.templateIds);
  const template = pickTemplate(templates);
  const messageText = template ? renderTemplate(template.body, contact) : '';
  const media = campaign.mediaAttachments || [];

  let status = MESSAGE_STATUS.FAILED;
  let errorMessage = null;

  try {
    // Optionally validate number first
    if (campaign.settings.validateBeforeSend) {
      const validResult = await sendToTab(tab.id, {
        type: MSG.VALIDATE_NUMBER,
        payload: { chatId: contact.chatId },
      });
      if (!validResult || !validResult.exists) {
        status = MESSAGE_STATUS.INVALID;
        errorMessage = 'Not on WhatsApp';
        throw new Error(errorMessage);
      }
    }

    // Send typing indicator
    if (campaign.settings.simulateTyping) {
      await sendToTab(tab.id, {
        type: MSG.SEND_TYPING,
        payload: { chatId: contact.chatId },
      }).catch(() => {}); // non-fatal
    }

    if (media.length > 0) {
      // Send each media file (first gets caption if text exists)
      for (let i = 0; i < media.length; i++) {
        const m = media[i];
        await sendToTab(tab.id, {
          type: MSG.SEND_FILE,
          payload: {
            chatId: contact.chatId,
            dataUrl: m.dataUrl,
            filename: m.filename,
            mimeType: m.mimeType,
            caption: (i === 0 && messageText) ? messageText : '',
          },
        });
      }
    } else if (messageText) {
      await sendToTab(tab.id, {
        type: MSG.SEND_TEXT,
        payload: { chatId: contact.chatId, text: messageText },
      });
    } else {
      status = MESSAGE_STATUS.SKIPPED;
      errorMessage = 'No message or media to send';
      throw new Error(errorMessage);
    }

    status = MESSAGE_STATUS.SENT;
  } catch (err) {
    if (status === MESSAGE_STATUS.FAILED) errorMessage = err.message;
  }

  // Record report entry
  await saveReportEntry({
    campaignId: campaign.id,
    campaignName: campaign.name,
    contactId: contact.id,
    phone: contact.phone,
    name: contact.name,
    status,
    errorMessage,
  });

  // Update progress
  const newProgress = {
    cursor: cursor + 1,
    sent: campaign.progress.sent + (status === MESSAGE_STATUS.SENT ? 1 : 0),
    failed: campaign.progress.failed + (status === MESSAGE_STATUS.FAILED ? 1 : 0),
    skipped: campaign.progress.skipped + (status === MESSAGE_STATUS.SKIPPED || status === MESSAGE_STATUS.INVALID ? 1 : 0),
  };
  const updated = await updateCampaignProgress(campaignId, newProgress);

  broadcast(MSG.PROGRESS_UPDATE, {
    campaignId,
    progress: updated.progress,
    status: CAMPAIGN_STATUS.RUNNING,
    lastContact: { phone: contact.phone, name: contact.name, status },
  });

  // Check if done
  if (newProgress.cursor >= contacts.length) {
    await completeCampaign(campaignId, updated);
    return;
  }

  // Schedule next tick
  const delay = randBetween(delayMin, delayMax);
  scheduleCampaignTick(campaignId, delay);
}

async function loadTemplates(templateIds) {
  if (!templateIds || templateIds.length === 0) return [];
  const all = [];
  for (const id of templateIds) {
    const t = await getTemplate(id);
    if (t) all.push(t);
  }
  return all;
}

async function completeCampaign(campaignId, campaign) {
  cancelCampaignTick(campaignId);
  await updateCampaignStatus(campaignId, CAMPAIGN_STATUS.COMPLETED);
  await setActiveCampaignId(null);
  broadcast(MSG.CAMPAIGN_COMPLETE, {
    campaignId,
    progress: campaign ? campaign.progress : null,
  });
}

/**
 * Rehydrate: on service worker restart, check if a campaign was mid-flight
 * and re-enqueue the next tick if needed.
 */
export async function rehydrateActiveCampaign() {
  const activeCampaignId = await getActiveCampaignId();
  if (!activeCampaignId) return;

  const campaign = await getCampaign(activeCampaignId);
  if (!campaign) { await setActiveCampaignId(null); return; }

  if (campaign.status === CAMPAIGN_STATUS.RUNNING) {
    // Re-schedule immediately — the tick will re-check everything
    scheduleCampaignTick(activeCampaignId, 2000);
  }
}
