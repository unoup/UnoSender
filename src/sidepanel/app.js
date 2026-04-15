/**
 * UnoSender Side Panel — main SPA entry point.
 */
import './app.css';
import { MSG, CAMPAIGN_STATUS } from '../shared/constants.js';
import { renderCampaignBuilder } from './views/CampaignBuilder.js';
import { renderContactImporter } from './views/ContactImporter.js';
import { renderTemplateEditor } from './views/TemplateEditor.js';
import { renderProgressDashboard } from './views/ProgressDashboard.js';
import { renderReportsView } from './views/ReportsView.js';

// ─── SW Messaging ─────────────────────────────────────────────────────────────

export function sendSW(type, extraData = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...extraData }, (response) => {
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

// ─── Toast Notifications ──────────────────────────────────────────────────────

let toastContainer;

export function showToast(message, type = 'info') {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ─── View Router ──────────────────────────────────────────────────────────────

let currentView = 'campaigns';
let viewStack = []; // for sub-views (builder, importer, etc.)

export function renderView(viewName, data = null) {
  // Clean up previous sub-view if any
  if (viewStack.length > 0) {
    const prev = viewStack[viewStack.length - 1];
    if (prev._cleanup) prev._cleanup();
    viewStack = [];
  }

  // Deactivate all tab buttons and views
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === viewName));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${viewName}`));

  currentView = viewName;
  const container = document.querySelector(`#view-${viewName}`);
  if (!container) return;

  switch (viewName) {
    case 'campaigns': renderCampaignsView(container, data); break;
    case 'contacts': renderContactsView(container, data); break;
    case 'templates': renderTemplatesView(container, data); break;
    case 'reports': renderReportsView(container); break;
  }
}

// ─── Campaigns View ───────────────────────────────────────────────────────────

async function renderCampaignsView(container, data) {
  if (data && data.view === 'builder') {
    container.innerHTML = '';
    await renderCampaignBuilder(container, data.campaign || null);
    viewStack.push(container);
    return;
  }
  if (data && data.view === 'progress') {
    container.innerHTML = '';
    renderProgressDashboard(container, data.campaign);
    viewStack.push(container);
    return;
  }

  const campaigns = await sendSW('GET_CAMPAIGNS').catch(() => ({}));
  const contactLists = await sendSW('GET_CONTACT_LISTS').catch(() => ({}));
  const list = Object.values(campaigns || {}).sort((a, b) => b.updatedAt - a.updatedAt);

  container.innerHTML = `
    <div class="section-header">
      <h2>Campaigns</h2>
      <button class="btn btn-primary btn-sm" id="cmp-new">+ New</button>
    </div>
    <div id="cmp-list" class="flex-col gap-8"></div>
  `;

  container.querySelector('#cmp-new').onclick = () => renderView('campaigns', { view: 'builder' });

  const listEl = container.querySelector('#cmp-list');
  if (list.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📣</div>
        <p>No campaigns yet.</p>
        <button class="btn btn-primary" id="cmp-new-empty">Create your first campaign</button>
      </div>`;
    listEl.querySelector('#cmp-new-empty').onclick = () => renderView('campaigns', { view: 'builder' });
    return;
  }

  listEl.innerHTML = list.map(c => {
    const clObj = contactLists[c.contactListId];
    const contactCount = clObj ? clObj.contacts.length : 0;
    return `
      <div class="campaign-card" data-id="${c.id}">
        <div class="flex justify-between items-center">
          <div class="campaign-name">${escHtml(c.name)}</div>
          <span class="badge ${statusBadgeClass(c.status)}">${c.status}</span>
        </div>
        <div class="campaign-meta">
          <span class="text-muted text-sm">${contactCount} contacts</span>
          ${c.scheduledAt ? `<span class="text-muted text-sm">📅 ${new Date(c.scheduledAt).toLocaleDateString()}</span>` : ''}
          <span class="text-muted text-sm">
            ${c.progress.sent > 0 ? `✓${c.progress.sent} ` : ''}
            ${c.progress.failed > 0 ? `✗${c.progress.failed}` : ''}
          </span>
        </div>
        <div class="campaign-actions">
          ${c.status === CAMPAIGN_STATUS.DRAFT || c.status === CAMPAIGN_STATUS.CANCELLED
            ? `<button class="btn btn-primary btn-sm cmp-start" data-id="${c.id}">▶ Start</button>`
            : ''}
          ${c.status === CAMPAIGN_STATUS.RUNNING
            ? `<button class="btn btn-secondary btn-sm cmp-view" data-id="${c.id}">View Progress</button>`
            : ''}
          ${c.status === CAMPAIGN_STATUS.PAUSED
            ? `<button class="btn btn-primary btn-sm cmp-resume" data-id="${c.id}">▶ Resume</button>`
            : ''}
          <button class="btn btn-ghost btn-sm cmp-edit" data-id="${c.id}">Edit</button>
          <button class="btn btn-ghost btn-sm text-red cmp-delete" data-id="${c.id}">Delete</button>
        </div>
      </div>`;
  }).join('');

  listEl.querySelectorAll('.cmp-start').forEach(btn => {
    btn.onclick = async () => {
      const campaign = campaigns[btn.dataset.id];
      if (!campaign) return;
      if (!campaign.contactListId) { showToast('No contact list selected', 'error'); return; }
      const cl = contactLists[campaign.contactListId];
      campaign._contactCount = cl ? cl.contacts.length : 0;
      await sendSW(MSG.START_CAMPAIGN, { campaignId: campaign.id });
      showToast('Campaign started!', 'success');
      renderView('campaigns', { view: 'progress', campaign });
    };
  });

  listEl.querySelectorAll('.cmp-view').forEach(btn => {
    btn.onclick = async () => {
      const campaign = campaigns[btn.dataset.id];
      const cl = campaign && contactLists[campaign.contactListId];
      if (campaign) {
        campaign._contactCount = cl ? cl.contacts.length : 0;
        renderView('campaigns', { view: 'progress', campaign });
      }
    };
  });

  listEl.querySelectorAll('.cmp-resume').forEach(btn => {
    btn.onclick = async () => {
      const campaign = campaigns[btn.dataset.id];
      const cl = campaign && contactLists[campaign.contactListId];
      if (campaign) {
        await sendSW(MSG.RESUME_CAMPAIGN, { campaignId: campaign.id });
        campaign._contactCount = cl ? cl.contacts.length : 0;
        renderView('campaigns', { view: 'progress', campaign });
      }
    };
  });

  listEl.querySelectorAll('.cmp-edit').forEach(btn => {
    btn.onclick = () => renderView('campaigns', { view: 'builder', campaign: campaigns[btn.dataset.id] });
  });

  listEl.querySelectorAll('.cmp-delete').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this campaign?')) return;
      await sendSW('DELETE_CAMPAIGN', { id: btn.dataset.id });
      renderCampaignsView(container);
    };
  });
}

// ─── Contacts View ────────────────────────────────────────────────────────────

async function renderContactsView(container, data) {
  if (data && data.view === 'import') {
    container.innerHTML = '';
    await renderContactImporter(container);
    viewStack.push(container);
    return;
  }

  const lists = await sendSW('GET_CONTACT_LISTS').catch(() => ({}));
  const listArr = Object.values(lists || {}).sort((a, b) => b.importedAt - a.importedAt);

  container.innerHTML = `
    <div class="section-header">
      <h2>Contact Lists</h2>
      <div class="flex gap-8">
        <button class="btn btn-secondary btn-sm" id="ct-export">Export from WA</button>
        <button class="btn btn-primary btn-sm" id="ct-import">+ Import</button>
      </div>
    </div>
    <div id="ct-list" class="flex-col gap-8"></div>
  `;

  container.querySelector('#ct-import').onclick = () => renderView('contacts', { view: 'import' });

  container.querySelector('#ct-export').onclick = async () => {
    try {
      showToast('Exporting contacts from WhatsApp...', 'info');
      const result = await sendSW(MSG.EXPORT_CONTACTS);
      if (result && result.contacts) {
        const { downloadTextFile, contactsToVcf } = await import('../shared/csv-utils.js');
        downloadTextFile(contactsToVcf(result.contacts), 'whatsapp-contacts.vcf', 'text/vcard');
        showToast(`Exported ${result.contacts.length} contacts`, 'success');
      }
    } catch (err) {
      showToast('Export failed: ' + err.message, 'error');
    }
  };

  const listEl = container.querySelector('#ct-list');
  if (listArr.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👥</div>
        <p>No contact lists yet.</p>
        <button class="btn btn-primary" id="ct-import-empty">Import from CSV/Excel</button>
      </div>`;
    listEl.querySelector('#ct-import-empty').onclick = () => renderView('contacts', { view: 'import' });
    return;
  }

  listEl.innerHTML = listArr.map(l => `
    <div class="list-item">
      <div class="list-item-info">
        <div class="ellipsis font-weight-600">${escHtml(l.name)}</div>
        <div class="text-muted text-sm">${l.contacts.length} contacts · Imported ${new Date(l.importedAt).toLocaleDateString()}</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-ghost btn-icon text-red ct-delete" data-id="${l.id}" title="Delete">✕</button>
      </div>
    </div>`).join('');

  listEl.querySelectorAll('.ct-delete').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this contact list?')) return;
      await sendSW('DELETE_CONTACT_LIST', { id: btn.dataset.id });
      renderContactsView(container);
    };
  });
}

// ─── Templates View ───────────────────────────────────────────────────────────

async function renderTemplatesView(container, data) {
  if (data && data.view === 'editor') {
    container.innerHTML = '';
    await renderTemplateEditor(container, data.template || null);
    viewStack.push(container);
    return;
  }

  const templates = await sendSW('GET_TEMPLATES').catch(() => ({}));
  const tArr = Object.values(templates || {}).sort((a, b) => b.createdAt - a.createdAt);

  container.innerHTML = `
    <div class="section-header">
      <h2>Templates</h2>
      <button class="btn btn-primary btn-sm" id="tp-new">+ New</button>
    </div>
    <div id="tp-list" class="flex-col gap-8"></div>
  `;

  container.querySelector('#tp-new').onclick = () => renderView('templates', { view: 'editor' });

  const listEl = container.querySelector('#tp-list');
  if (tArr.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💬</div>
        <p>No templates yet.</p>
        <button class="btn btn-primary" id="tp-new-empty">Create your first template</button>
      </div>`;
    listEl.querySelector('#tp-new-empty').onclick = () => renderView('templates', { view: 'editor' });
    return;
  }

  listEl.innerHTML = tArr.map(t => `
    <div class="list-item">
      <div class="list-item-info">
        <div class="ellipsis">${escHtml(t.name)}</div>
        <div class="text-muted text-sm ellipsis">${escHtml(t.body.substring(0, 80))}${t.body.length > 80 ? '…' : ''}</div>
        ${t.variables.length > 0
          ? `<div class="flex gap-4 mt-4">${t.variables.map(v => `<span class="badge badge-blue">{${escHtml(v)}}</span>`).join('')}</div>`
          : ''}
      </div>
      <div class="list-item-actions">
        <button class="btn btn-ghost btn-sm tp-edit" data-id="${t.id}">Edit</button>
        <button class="btn btn-ghost btn-icon text-red tp-delete" data-id="${t.id}">✕</button>
      </div>
    </div>`).join('');

  listEl.querySelectorAll('.tp-edit').forEach(btn => {
    btn.onclick = () => renderView('templates', { view: 'editor', template: templates[btn.dataset.id] });
  });

  listEl.querySelectorAll('.tp-delete').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this template?')) return;
      await sendSW('DELETE_TEMPLATE', { id: btn.dataset.id });
      renderTemplatesView(container);
    };
  });
}

// ─── Status badge helper ──────────────────────────────────────────────────────

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

// ─── WhatsApp Status Polling ──────────────────────────────────────────────────

async function checkWaStatus() {
  const dot = document.querySelector('#wa-status-dot');
  const text = document.querySelector('#wa-status-text');
  if (!dot || !text) return;

  try {
    const res = await sendSW(MSG.CHECK_WA_READY);
    if (res && res.ready) {
      dot.className = 'status-dot ready';
      text.textContent = 'Connected';
    } else {
      dot.className = 'status-dot offline';
      text.textContent = res?.reason === 'no_tab' ? 'Open WhatsApp Web' : 'Not ready';
    }
  } catch {
    dot.className = 'status-dot offline';
    text.textContent = 'Offline';
  }
}

// ─── Disclaimer ───────────────────────────────────────────────────────────────

async function initDisclaimer() {
  const settings = await sendSW('GET_SETTINGS').catch(() => ({}));

  if (settings && settings.disclaimerAccepted) {
    showApp();
    return;
  }

  const overlay = document.querySelector('#disclaimer-overlay');
  const check = document.querySelector('#disclaimer-check');
  const acceptBtn = document.querySelector('#disclaimer-accept');

  overlay.classList.remove('hidden');
  check.onchange = () => { acceptBtn.disabled = !check.checked; };
  acceptBtn.onclick = async () => {
    await sendSW('SAVE_SETTINGS', { settings: { disclaimerAccepted: true } });
    overlay.classList.add('hidden');
    showApp();
  };
}

function showApp() {
  document.querySelector('#app').classList.remove('hidden');
  renderView('campaigns');
  checkWaStatus();
  setInterval(checkWaStatus, 10000);
}

// ─── Navigation ───────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.onclick = () => renderView(btn.dataset.view);
});

// ─── Init ─────────────────────────────────────────────────────────────────────

initDisclaimer();
