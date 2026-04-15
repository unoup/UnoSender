/**
 * ReportsView — campaign history and report download.
 */
import { sendSW, showToast } from '../app.js';
import { reportsToCsv, downloadTextFile } from '../../shared/csv-utils.js';

export async function renderReportsView(container) {
  const [campaigns, reports] = await Promise.all([
    sendSW('GET_CAMPAIGNS'),
    sendSW('GET_REPORTS'),
  ]);

  const campaignMap = campaigns || {};
  const allReports = Array.isArray(reports) ? reports : [];

  // Group by campaignId
  const grouped = {};
  for (const entry of allReports) {
    if (!grouped[entry.campaignId]) grouped[entry.campaignId] = [];
    grouped[entry.campaignId].push(entry);
  }

  const completedCampaigns = Object.values(campaignMap).filter(c =>
    c.status === 'completed' || grouped[c.id]
  );

  container.innerHTML = `
    <div class="section-header">
      <h2>Reports</h2>
      <button class="btn btn-secondary btn-sm" id="rv-download-all">Download All</button>
    </div>

    ${completedCampaigns.length === 0
      ? `<div class="empty-state">
          <div class="empty-icon">📊</div>
          <p>No campaign reports yet.</p>
          <p class="text-muted">Completed campaigns will appear here.</p>
        </div>`
      : completedCampaigns.map(c => {
          const entries = grouped[c.id] || [];
          const sent = entries.filter(e => e.status === 'sent').length;
          const failed = entries.filter(e => e.status === 'failed').length;
          const skipped = entries.filter(e => e.status !== 'sent' && e.status !== 'failed').length;
          return `
            <div class="card" data-campaign-id="${c.id}">
              <div class="flex justify-between items-center">
                <div class="campaign-name">${escHtml(c.name)}</div>
                <button class="btn btn-secondary btn-sm rv-download-btn" data-campaign-id="${c.id}">CSV</button>
              </div>
              <div class="flex gap-8 mt-8">
                <span class="badge badge-green">✓ ${sent} sent</span>
                <span class="badge badge-red">✗ ${failed} failed</span>
                ${skipped > 0 ? `<span class="badge badge-yellow">⚠ ${skipped} skipped</span>` : ''}
              </div>
              ${c.progress?.completedAt ? `<div class="text-muted text-sm mt-4">Completed ${new Date(c.progress.completedAt).toLocaleString()}</div>` : ''}
              <div class="flex gap-8 mt-8">
                <button class="btn btn-ghost btn-sm rv-view-btn" data-campaign-id="${c.id}">View details</button>
                <button class="btn btn-ghost btn-sm rv-clear-btn text-red" data-campaign-id="${c.id}">Clear report</button>
              </div>
            </div>`;
        }).join('')
    }

    <div id="rv-detail-panel" class="hidden">
      <div class="section-header">
        <h2 id="rv-detail-title"></h2>
        <button class="btn btn-ghost btn-sm" id="rv-detail-back">← Back</button>
      </div>
      <div style="overflow-x:auto; max-height:400px; overflow-y:auto;">
        <table class="reports-table">
          <thead><tr>
            <th>Phone</th><th>Name</th><th>Status</th><th>Error</th><th>Time</th>
          </tr></thead>
          <tbody id="rv-detail-body"></tbody>
        </table>
      </div>
    </div>
  `;

  // Download all reports
  container.querySelector('#rv-download-all')?.addEventListener('click', () => {
    if (allReports.length === 0) { showToast('No reports to download', 'info'); return; }
    downloadTextFile(reportsToCsv(allReports), 'unosender-all-reports.csv', 'text/csv');
  });

  // Per-campaign download
  container.querySelectorAll('.rv-download-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const cid = btn.dataset.campaignId;
      const entries = await sendSW('GET_REPORTS', { campaignId: cid });
      if (!entries || entries.length === 0) { showToast('No data', 'info'); return; }
      const campaign = campaignMap[cid];
      downloadTextFile(reportsToCsv(entries), `report-${(campaign?.name || cid).replace(/\s+/g,'-')}.csv`, 'text/csv');
    };
  });

  // View details
  container.querySelectorAll('.rv-view-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const cid = btn.dataset.campaignId;
      const entries = await sendSW('GET_REPORTS', { campaignId: cid });
      showDetailPanel(cid, entries || []);
    };
  });

  // Clear report
  container.querySelectorAll('.rv-clear-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('Clear this campaign\'s report data?')) return;
      await sendSW('CLEAR_REPORTS', { campaignId: btn.dataset.campaignId });
      showToast('Report cleared', 'success');
      renderReportsView(container);
    };
  });

  function showDetailPanel(campaignId, entries) {
    const campaign = campaignMap[campaignId];
    const mainContent = container.querySelectorAll('.card, .section-header, .empty-state');
    mainContent.forEach(el => el.classList.add('hidden'));

    const detail = container.querySelector('#rv-detail-panel');
    container.querySelector('#rv-detail-title').textContent = campaign?.name || campaignId;
    detail.classList.remove('hidden');

    const tbody = container.querySelector('#rv-detail-body');
    tbody.innerHTML = entries.map(e => `
      <tr>
        <td>${escHtml(e.phone)}</td>
        <td>${escHtml(e.name || '—')}</td>
        <td><span class="badge badge-${e.status === 'sent' ? 'green' : e.status === 'failed' ? 'red' : 'yellow'}">${e.status}</span></td>
        <td class="text-muted">${escHtml(e.errorMessage || '')}</td>
        <td class="text-muted">${new Date(e.timestamp).toLocaleTimeString()}</td>
      </tr>`).join('');

    container.querySelector('#rv-detail-back').onclick = () => {
      renderReportsView(container);
    };
  }
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
