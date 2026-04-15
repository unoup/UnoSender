/**
 * Unified chrome.storage.local abstraction.
 * All data is keyed under top-level namespaces.
 */
import { DEFAULT_SETTINGS } from '../shared/constants.js';

// ─── Generic helpers ──────────────────────────────────────────────────────────

export async function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

export async function storageSet(data) {
  return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings() {
  const { settings } = await storageGet({ settings: DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function saveSettings(partial) {
  const current = await getSettings();
  await storageSet({ settings: { ...current, ...partial } });
}

// ─── Contact Lists ────────────────────────────────────────────────────────────

export async function getContactLists() {
  const { contactLists } = await storageGet({ contactLists: {} });
  return contactLists;
}

export async function getContactList(id) {
  const lists = await getContactLists();
  return lists[id] || null;
}

export async function saveContactList(list) {
  const lists = await getContactLists();
  lists[list.id] = list;
  await storageSet({ contactLists: lists });
  return list;
}

export async function deleteContactList(id) {
  const lists = await getContactLists();
  delete lists[id];
  await storageSet({ contactLists: lists });
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function getTemplates() {
  const { templates } = await storageGet({ templates: {} });
  return templates;
}

export async function getTemplate(id) {
  const templates = await getTemplates();
  return templates[id] || null;
}

export async function saveTemplate(template) {
  const templates = await getTemplates();
  templates[template.id] = template;
  await storageSet({ templates });
  return template;
}

export async function deleteTemplate(id) {
  const templates = await getTemplates();
  delete templates[id];
  await storageSet({ templates });
}

// ─── Campaigns ────────────────────────────────────────────────────────────────

export async function getCampaigns() {
  const { campaigns } = await storageGet({ campaigns: {} });
  return campaigns;
}

export async function getCampaign(id) {
  const campaigns = await getCampaigns();
  return campaigns[id] || null;
}

export async function saveCampaign(campaign) {
  const campaigns = await getCampaigns();
  campaign.updatedAt = Date.now();
  campaigns[campaign.id] = campaign;
  await storageSet({ campaigns });
  return campaign;
}

export async function deleteCampaign(id) {
  const campaigns = await getCampaigns();
  delete campaigns[id];
  await storageSet({ campaigns });
}

export async function updateCampaignProgress(id, progressPatch) {
  const campaign = await getCampaign(id);
  if (!campaign) return;
  campaign.progress = { ...campaign.progress, ...progressPatch };
  campaign.updatedAt = Date.now();
  await saveCampaign(campaign);
  return campaign;
}

export async function updateCampaignStatus(id, status) {
  const campaign = await getCampaign(id);
  if (!campaign) return;
  campaign.status = status;
  if (status === 'running' && !campaign.progress.startedAt) {
    campaign.progress.startedAt = Date.now();
  }
  if (status === 'completed') {
    campaign.progress.completedAt = Date.now();
  }
  return saveCampaign(campaign);
}

// ─── Active Campaign Tracking ─────────────────────────────────────────────────

export async function getActiveCampaignId() {
  const { activeCampaignId } = await storageGet({ activeCampaignId: null });
  return activeCampaignId;
}

export async function setActiveCampaignId(id) {
  await storageSet({ activeCampaignId: id });
}

// ─── Auto-Reply Rules ─────────────────────────────────────────────────────────

export async function getAutoReplyRules() {
  const { autoReplyRules } = await storageGet({ autoReplyRules: {} });
  return autoReplyRules;
}

export async function saveAutoReplyRule(rule) {
  const rules = await getAutoReplyRules();
  rules[rule.id] = rule;
  await storageSet({ autoReplyRules: rules });
  return rule;
}

export async function deleteAutoReplyRule(id) {
  const rules = await getAutoReplyRules();
  delete rules[id];
  await storageSet({ autoReplyRules: rules });
}
