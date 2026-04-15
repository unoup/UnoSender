/**
 * ProgressDashboard — live progress view for an active campaign.
 */
import { sendSW, showToast, renderView } from '../app.js';
import { MSG, CAMPAIGN_STATUS } from '../../shared/constants.js';

export function renderProgressDashboard(container, campaign) {
  const p = campaign.progress;
  const total = campaign._contactCount || 0;
  const pct = total > 0 ? Math.round(((p.sent + p.failed + p.skipped) / total) * 100) : 0;

  container.innerHTML = `
    <div class="section-header">
      <h2>${escHtml(campaign.name)}</h2>
      <span class="badge ${statusBadgeClass(campaign.status)}">${campaign.status}</span>
    </div>

    <div class="progress-stats">
      <div class="stat-box stat-sent">
        <div class="stat-value" id="pd-sent">${p.sent}</div>
        <div class="stat-label">Sent</div>
      </div>
      <div class="stat-box stat-failed">
        <div class="stat-value" id="pd-failed">${p.failed}</div>
        <div class="stat-label">Failed</div>
      </div>
      <div class="stat-box stat-skipped">
        <div class="stat-value" id="pd-skipped">${p.skipped}</div>
        <div class="stat-label">Skipped</div>
      </div>
    </div>

    <div class="card">
      <div class="flex justify-between mb-4">
        <span class="text-sm" id="pd-progress-text">${p.cursor} / ${total}</span>
        <span class="text-sm" id="pd-pct">${pct}%</span>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" id="pd-bar" style="width:${pct}%"></div>
      </div>
    </div>

    <div id="pd-status-msg" class="text-muted text-sm"></div>

    <div id="pd-last" class="hidden card">
      <div class="text-muted text-sm">Last sent:</div>
      <div id="pd-last-contact"></div>
    </div>

    <div class="flex gap-8">
      <button class="btn btn-secondary flex-1" id="pd-pause-btn"
        ${campaign.status === CAMPAIGN_STATUS.PAUSED ? 'style="display:none"' : ''}>
        ⏸ Pause
      </button>
      <button class="btn btn-primary flex-1" id="pd-resume-btn"
        ${campaign.status === CAMPAIGN_STATUS.RUNNING ? 'style="display:none"' : ''}>
        ▶ Resume
      </button>
      <button class="btn btn-danger flex-1" id="pd-cancel-btn">✕ Cancel</button>
    </div>

    <button class="btn btn-ghost btn-sm" id="pd-back">← Back to Campaigns</button>
  `;

  container.querySelector('#pd-pause-btn').onclick = async () => {
    await sendSW(MSG.PAUSE_CAMPAIGN, { campaignId: campaign.id });
    container.querySelector('#pd-pause-btn').style.display = 'none';
    container.querySelector('#pd-resume-btn').style.display = '';
  };

  container.querySelector('#pd-resume-btn').onclick = async () => {
    await sendSW(MSG.RESUME_CAMPAIGN, { campaignId: campaign.id });
    container.querySelector('#pd-resume-btn').style.display = 'none';
    container.querySelector('#pd-pause-btn').style.display = '';
  };

  container.querySelector('#pd-cancel-btn').onclick = async () => {
    if (!confirm('Cancel this campaign? Progress will be reset.')) return;
    await sendSW(MSG.CANCEL_CAMPAIGN, { campaignId: campaign.id });
    showToast('Campaign cancelled', 'info');
    renderView('campaigns');
  };

  container.querySelector('#pd-back').onclick = () => renderView('campaigns');

  // Listen for progress updates from service worker
  function progressHandler(msg) {
    if (!msg || msg.campaignId !== campaign.id) return;

    const progressUpdate = msg.progress || {};
    const newTotal = total;
    const done = (progressUpdate.sent || 0) + (progressUpdate.failed || 0) + (progressUpdate.skipped || 0);
    const newPct = newTotal > 0 ? Math.round((done / newTotal) * 100) : 0;

    const sentEl = container.querySelector('#pd-sent');
    const failedEl = container.querySelector('#pd-failed');
    const skippedEl = container.querySelector('#pd-skipped');
    const barEl = container.querySelector('#pd-bar');
    const pctEl = container.querySelector('#pd-pct');
    const progressTextEl = container.querySelector('#pd-progress-text');
    const statusEl = container.querySelector('#pd-status-msg');
    const lastEl = container.querySelector('#pd-last');
    const lastContact = container.querySelector('#pd-last-contact');

    if (sentEl) sentEl.textContent = progressUpdate.sent || 0;
    if (failedEl) failedEl.textContent = progressUpdate.failed || 0;
    if (skippedEl) skippedEl.textContent = progressUpdate.skipped || 0;
    if (barEl) barEl.style.width = `${newPct}%`;
    if (pctEl) pctEl.textContent = `${newPct}%`;
    if (progressTextEl) progressTextEl.textContent = `${progressUpdate.cursor || 0} / ${newTotal}`;

    if (msg.message && statusEl) statusEl.textContent = msg.message;

    if (msg.lastContact && lastEl && lastContact) {
      lastEl.classList.remove('hidden');
      const lc = msg.lastContact;
      lastContact.innerHTML = `
        <span class="ellipsis">${escHtml(lc.name || lc.phone)}</span>
        <span class="badge badge-${lc.status === 'sent' ? 'green' : 'red'} ml-4">${lc.status}</span>`;
    }

    if (msg.type === MSG.CAMPAIGN_COMPLETE) {
      showToast('Campaign completed!', 'success');
      renderView('campaigns');
    }
  }

  // Register listener on the message event from SW
  chrome.runtime.onMessage.addListener(progressHandler);

  // Clean up listener when view changes
  container._cleanup = () => chrome.runtime.onMessage.removeListener(progressHandler);
}

function statusBadgeClass(status) {
  const map = {
    running: 'badge-green', paused: 'badge-yellow',
    completed: 'badge-blue', draft: 'badge-gray',
    scheduled: 'badge-blue', cancelled: 'badge-red',
  };
  return map[status] || 'badge-gray';
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
