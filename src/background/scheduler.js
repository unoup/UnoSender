/**
 * Chrome alarms wrapper for scheduling campaigns.
 */
import { CAMPAIGN_ALARM_PREFIX, SCHEDULE_ALARM_PREFIX } from '../shared/constants.js';

/**
 * Schedule a campaign tick alarm.
 * @param {string} campaignId
 * @param {number} delayMs - Delay before the tick fires (milliseconds)
 */
export function scheduleCampaignTick(campaignId, delayMs) {
  const alarmName = `${CAMPAIGN_ALARM_PREFIX}${campaignId}`;
  // chrome.alarms minimum is 0 minutes; we use delayInMinutes as float
  const delayInMinutes = Math.max(delayMs / 60000, 0.017); // min ~1 second
  chrome.alarms.create(alarmName, { delayInMinutes });
}

/**
 * Cancel a pending campaign tick alarm.
 */
export function cancelCampaignTick(campaignId) {
  chrome.alarms.clear(`${CAMPAIGN_ALARM_PREFIX}${campaignId}`);
}

/**
 * Schedule a campaign to start at a specific timestamp.
 * @param {string} campaignId
 * @param {number} scheduledAtMs - Unix timestamp in milliseconds
 */
export function scheduleCampaign(campaignId, scheduledAtMs) {
  const alarmName = `${SCHEDULE_ALARM_PREFIX}${campaignId}`;
  chrome.alarms.create(alarmName, { when: scheduledAtMs });
}

/**
 * Cancel a scheduled campaign start.
 */
export function cancelScheduledCampaign(campaignId) {
  chrome.alarms.clear(`${SCHEDULE_ALARM_PREFIX}${campaignId}`);
}

/**
 * Determine from an alarm name what it is for.
 * @returns {{ type: 'tick'|'schedule', campaignId: string } | null}
 */
export function parseAlarmName(alarmName) {
  if (alarmName.startsWith(CAMPAIGN_ALARM_PREFIX)) {
    return { type: 'tick', campaignId: alarmName.slice(CAMPAIGN_ALARM_PREFIX.length) };
  }
  if (alarmName.startsWith(SCHEDULE_ALARM_PREFIX)) {
    return { type: 'schedule', campaignId: alarmName.slice(SCHEDULE_ALARM_PREFIX.length) };
  }
  return null;
}

/**
 * Check if the current time falls within the allowed schedule window.
 * @param {string|null} windowStart - "HH:MM" or null (no restriction)
 * @param {string|null} windowEnd   - "HH:MM" or null
 * @returns {boolean}
 */
export function isWithinTimeWindow(windowStart, windowEnd) {
  if (!windowStart || !windowEnd) return true;

  const now = new Date();
  const [startH, startM] = windowStart.split(':').map(Number);
  const [endH, endM] = windowEnd.split(':').map(Number);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  }
  // Overnight window (e.g. 22:00–06:00)
  return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
}

/**
 * Calculate milliseconds until the next window opening.
 * Used to pause campaigns outside their time window.
 */
export function msUntilWindowOpens(windowStart) {
  if (!windowStart) return 0;
  const [startH, startM] = windowStart.split(':').map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(startH, startM, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target - now;
}
