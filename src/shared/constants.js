// Message types for inter-component communication
export const MSG = {
  // UI → Service Worker
  START_CAMPAIGN: 'START_CAMPAIGN',
  PAUSE_CAMPAIGN: 'PAUSE_CAMPAIGN',
  RESUME_CAMPAIGN: 'RESUME_CAMPAIGN',
  CANCEL_CAMPAIGN: 'CANCEL_CAMPAIGN',
  GET_STATUS: 'GET_STATUS',
  VALIDATE_NUMBERS: 'VALIDATE_NUMBERS',
  EXPORT_CONTACTS: 'EXPORT_CONTACTS',
  CHECK_WA_READY: 'CHECK_WA_READY',

  // Service Worker → Content Script
  SEND_TEXT: 'SEND_TEXT',
  SEND_FILE: 'SEND_FILE',
  VALIDATE_NUMBER: 'VALIDATE_NUMBER',
  LIST_CONTACTS: 'LIST_CONTACTS',
  SEND_TYPING: 'SEND_TYPING',
  WPP_READY_CHECK: 'WPP_READY_CHECK',

  // Content ↔ wa-bridge (window.postMessage, namespaced)
  WPP_SEND_TEXT: 'WPP_SEND_TEXT',
  WPP_SEND_FILE: 'WPP_SEND_FILE',
  WPP_VALIDATE: 'WPP_VALIDATE',
  WPP_LIST_CONTACTS: 'WPP_LIST_CONTACTS',
  WPP_SEND_TYPING: 'WPP_SEND_TYPING',
  WPP_RESULT: 'WPP_RESULT',
  WPP_ERROR: 'WPP_ERROR',
  WPP_READY: 'WPP_READY',

  // Service Worker → UI (broadcasts)
  PROGRESS_UPDATE: 'PROGRESS_UPDATE',
  CAMPAIGN_COMPLETE: 'CAMPAIGN_COMPLETE',
  CAMPAIGN_ERROR: 'CAMPAIGN_ERROR',
  WA_STATUS: 'WA_STATUS',
};

// Prefix for all postMessage namespacing to avoid collisions with WhatsApp's own messages
export const WA_MSG_PREFIX = 'UNOSENDER_';

export const CAMPAIGN_STATUS = {
  DRAFT: 'draft',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  SCHEDULED: 'scheduled',
  CANCELLED: 'cancelled',
};

export const MESSAGE_STATUS = {
  SENT: 'sent',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  INVALID: 'invalid',
};

// Default delay presets (milliseconds) — ported from WASend.js index.js:41-51
export const DELAY_PRESETS = {
  low: { min: 5000, max: 10000, label: 'Low (5–10s) — established accounts only' },
  default: { min: 20000, max: 45000, label: 'Default (20–45s) — recommended' },
  high: { min: 60000, max: 120000, label: 'High (1–2 min) — new/unused numbers' },
};

export const DEFAULT_SETTINGS = {
  delayMin: DELAY_PRESETS.default.min,
  delayMax: DELAY_PRESETS.default.max,
  batchSize: 50,
  batchPauseMs: 5 * 60 * 1000, // 5 minutes
  validateBeforeSend: true,
  simulateTyping: true,
  disclaimerAccepted: false,
};

// Alarm name prefix for campaign ticks
export const CAMPAIGN_ALARM_PREFIX = 'unosender-tick-';
export const SCHEDULE_ALARM_PREFIX = 'unosender-schedule-';

export function randBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}
