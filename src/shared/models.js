import { v4 as uuidv4 } from 'uuid';

// ─── Contact ─────────────────────────────────────────────────────────────────

export function createContact({ phone, name = '', columns = {}, chatId = null } = {}) {
  return {
    id: uuidv4(),
    phone,
    chatId: chatId || phoneToWaChatId(phone),
    name,
    columns, // arbitrary fields from imported spreadsheet
    valid: null, // null = not yet validated, true/false after validation
    validatedAt: null,
  };
}

export function phoneToWaChatId(phone) {
  // Strip all non-digit characters, append @c.us
  const digits = phone.replace(/\D/g, '');
  return digits ? `${digits}@c.us` : null;
}

// ─── ContactList ─────────────────────────────────────────────────────────────

export function createContactList({ name = 'Imported List', contacts = [], columnHeaders = [], phoneColumn = 'Phone' } = {}) {
  return {
    id: uuidv4(),
    name,
    contacts,
    columnHeaders,
    phoneColumn,
    importedAt: Date.now(),
  };
}

// ─── Template ────────────────────────────────────────────────────────────────

export function createTemplate({ name = 'New Template', body = '' } = {}) {
  return {
    id: uuidv4(),
    name,
    body,
    variables: extractVariables(body),
    createdAt: Date.now(),
  };
}

export function extractVariables(templateBody) {
  const matches = templateBody.matchAll(/\{(\w+)\}/g);
  return [...new Set([...matches].map(m => m[1]))];
}

/**
 * Substitute {Variable} placeholders in a template body with contact data.
 * Falls back to the raw placeholder if the key is not found.
 */
export function renderTemplate(templateBody, contact) {
  return templateBody.replace(/\{(\w+)\}/g, (match, key) => {
    // Check contact.columns first (spreadsheet columns), then top-level contact fields
    if (contact.columns && Object.prototype.hasOwnProperty.call(contact.columns, key)) {
      return contact.columns[key] ?? match;
    }
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'name' && contact.name) return contact.name;
    if (lowerKey === 'phone' && contact.phone) return contact.phone;
    return match; // keep placeholder if not found
  });
}

/**
 * Pick a template from the list (random if multiple, for message variation).
 */
export function pickTemplate(templates) {
  if (!templates || templates.length === 0) return null;
  if (templates.length === 1) return templates[0];
  return templates[Math.floor(Math.random() * templates.length)];
}

// ─── Campaign ────────────────────────────────────────────────────────────────

export function createCampaign({
  name = 'New Campaign',
  contactListId = null,
  templateIds = [],
  mediaAttachments = [],
  settings = {},
  scheduledAt = null,
  scheduleWindowStart = null,
  scheduleWindowEnd = null,
} = {}) {
  return {
    id: uuidv4(),
    name,
    status: 'draft',
    contactListId,
    templateIds,
    mediaAttachments, // [{ type, dataUrl, filename, mimeType }]
    settings: {
      delayMin: settings.delayMin ?? 20000,
      delayMax: settings.delayMax ?? 45000,
      batchSize: settings.batchSize ?? 50,
      batchPauseMs: settings.batchPauseMs ?? 300000,
      validateBeforeSend: settings.validateBeforeSend ?? true,
      simulateTyping: settings.simulateTyping ?? true,
    },
    scheduledAt,
    scheduleWindowStart, // e.g. "09:00"
    scheduleWindowEnd,   // e.g. "21:00"
    progress: {
      cursor: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      startedAt: null,
      completedAt: null,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ─── Report Entry ─────────────────────────────────────────────────────────────

export function createReportEntry({ campaignId, campaignName, contactId, phone, name, status, errorMessage = null } = {}) {
  return {
    id: uuidv4(),
    campaignId,
    campaignName,
    contactId,
    phone,
    name,
    status, // 'sent' | 'failed' | 'skipped' | 'invalid'
    errorMessage,
    timestamp: Date.now(),
  };
}

// ─── Auto-Reply Rule ──────────────────────────────────────────────────────────

export function createAutoReplyRule({ keyword = '', matchType = 'contains', caseSensitive = false, response = '', enabled = true } = {}) {
  return {
    id: uuidv4(),
    keyword,
    matchType, // 'exact' | 'contains' | 'startsWith' | 'regex'
    caseSensitive,
    response,
    enabled,
    priority: Date.now(),
  };
}

export function matchesAutoReplyRule(rule, messageText) {
  if (!rule.enabled) return false;
  const text = rule.caseSensitive ? messageText : messageText.toLowerCase();
  const kw = rule.caseSensitive ? rule.keyword : rule.keyword.toLowerCase();
  switch (rule.matchType) {
    case 'exact': return text === kw;
    case 'contains': return text.includes(kw);
    case 'startsWith': return text.startsWith(kw);
    case 'regex': {
      try {
        const flags = rule.caseSensitive ? '' : 'i';
        return new RegExp(rule.keyword, flags).test(messageText);
      } catch { return false; }
    }
    default: return false;
  }
}
