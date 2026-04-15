/**
 * CampaignBuilder view — create and edit campaigns.
 */
import { sendSW } from '../app.js';
import { createCampaign } from '../../shared/models.js';
import { showToast, renderView } from '../app.js';
import { DELAY_PRESETS } from '../../shared/constants.js';

export async function renderCampaignBuilder(container, existingCampaign = null) {
  const [contactListsMap, templatesMap] = await Promise.all([
    sendSW('GET_CONTACT_LISTS'),
    sendSW('GET_TEMPLATES'),
  ]);

  const lists = Object.values(contactListsMap || {});
  const templates = Object.values(templatesMap || {});
  const campaign = existingCampaign || createCampaign();
  const isEdit = !!existingCampaign;

  container.innerHTML = `
    <div class="section-header">
      <h2>${isEdit ? 'Edit Campaign' : 'New Campaign'}</h2>
      <button class="btn btn-ghost btn-sm" id="cb-back">← Back</button>
    </div>

    <div class="form-group">
      <label>Campaign Name</label>
      <input type="text" id="cb-name" value="${escHtml(campaign.name)}" placeholder="e.g. April Promo" />
    </div>

    <div class="form-group">
      <label>Contact List</label>
      ${lists.length === 0
        ? '<p class="text-muted">No contact lists yet. Import one in the Contacts tab.</p>'
        : `<select id="cb-list">
            <option value="">— Select a contact list —</option>
            ${lists.map(l => `<option value="${l.id}" ${campaign.contactListId === l.id ? 'selected' : ''}>${escHtml(l.name)} (${l.contacts.length} contacts)</option>`).join('')}
          </select>`
      }
    </div>

    <div class="form-group">
      <label>Message Templates <span class="text-muted">(select one or more for randomization)</span></label>
      ${templates.length === 0
        ? '<p class="text-muted">No templates yet. Create one in the Templates tab.</p>'
        : `<div id="cb-templates" class="flex-col gap-4">
            ${templates.map(t => `
              <label class="checkbox-row">
                <input type="checkbox" name="template" value="${t.id}"
                  ${(campaign.templateIds || []).includes(t.id) ? 'checked' : ''} />
                ${escHtml(t.name)}
              </label>`).join('')}
          </div>`
      }
    </div>

    <div class="form-group">
      <label>Media Attachments <span class="text-muted">(optional)</span></label>
      <div class="drop-zone" id="cb-drop-zone">
        <input type="file" id="cb-media-input" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.vcf" />
        <p>Drop files here or click to browse</p>
        <p class="text-sm text-muted">Images, videos, audio, PDFs, VCF cards</p>
      </div>
      <div id="cb-media-list" class="flex-col gap-4 mt-8"></div>
    </div>

    <div class="form-group">
      <label>Delay Between Messages</label>
      <select id="cb-delay-preset">
        ${Object.entries(DELAY_PRESETS).map(([key, p]) =>
          `<option value="${key}" ${campaign.settings.delayMin === p.min ? 'selected' : ''}>${p.label}</option>`
        ).join('')}
        <option value="custom">Custom...</option>
      </select>
      <div id="cb-custom-delay" class="flex gap-8 mt-8 hidden">
        <div class="form-group" style="flex:1">
          <label>Min (ms)</label>
          <input type="number" id="cb-delay-min" value="${campaign.settings.delayMin}" min="1000" step="1000" />
        </div>
        <div class="form-group" style="flex:1">
          <label>Max (ms)</label>
          <input type="number" id="cb-delay-max" value="${campaign.settings.delayMax}" min="1000" step="1000" />
        </div>
      </div>
    </div>

    <div class="form-group">
      <label>Safety Settings</label>
      <div class="flex gap-8">
        <div class="form-group" style="flex:1">
          <label>Batch size (pause after N)</label>
          <input type="number" id="cb-batch-size" value="${campaign.settings.batchSize}" min="1" max="500" />
        </div>
        <div class="form-group" style="flex:1">
          <label>Batch pause (minutes)</label>
          <input type="number" id="cb-batch-pause" value="${campaign.settings.batchPauseMs / 60000}" min="1" max="60" />
        </div>
      </div>
    </div>

    <div class="flex gap-8">
      <label class="checkbox-row">
        <input type="checkbox" id="cb-validate" ${campaign.settings.validateBeforeSend ? 'checked' : ''} />
        Validate numbers before sending
      </label>
    </div>
    <div class="flex gap-8">
      <label class="checkbox-row">
        <input type="checkbox" id="cb-typing" ${campaign.settings.simulateTyping ? 'checked' : ''} />
        Simulate typing indicator
      </label>
    </div>

    <div class="form-group">
      <label>Schedule (optional)</label>
      <input type="datetime-local" id="cb-schedule" value="${campaign.scheduledAt ? new Date(campaign.scheduledAt).toISOString().slice(0,16) : ''}" />
    </div>

    <div class="flex gap-8" id="cb-time-window-row">
      <div class="form-group" style="flex:1">
        <label>Window start</label>
        <input type="time" id="cb-window-start" value="${campaign.scheduleWindowStart || ''}" />
      </div>
      <div class="form-group" style="flex:1">
        <label>Window end</label>
        <input type="time" id="cb-window-end" value="${campaign.scheduleWindowEnd || ''}" />
      </div>
    </div>

    <div class="flex gap-8 mt-8">
      <button class="btn btn-primary w-full" id="cb-save">
        ${isEdit ? 'Save Changes' : 'Create Campaign'}
      </button>
    </div>
  `;

  // ── Media attachments state ────────────────────────────────────────────────
  const mediaAttachments = [...(campaign.mediaAttachments || [])];

  function renderMediaList() {
    const list = container.querySelector('#cb-media-list');
    list.innerHTML = mediaAttachments.map((m, i) => `
      <div class="list-item">
        <span class="flex-1 ellipsis">${escHtml(m.filename)}</span>
        <span class="text-muted text-sm">${m.type}</span>
        <button class="btn btn-ghost btn-icon" data-remove="${i}">✕</button>
      </div>
    `).join('');
    list.querySelectorAll('[data-remove]').forEach(btn => {
      btn.onclick = () => {
        mediaAttachments.splice(Number(btn.dataset.remove), 1);
        renderMediaList();
      };
    });
  }
  renderMediaList();

  // Drop zone / file input
  const dropZone = container.querySelector('#cb-drop-zone');
  const fileInput = container.querySelector('#cb-media-input');
  dropZone.onclick = () => fileInput.click();
  dropZone.ondragover = e => { e.preventDefault(); dropZone.classList.add('drag-over'); };
  dropZone.ondragleave = () => dropZone.classList.remove('drag-over');
  dropZone.ondrop = (e) => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    handleMediaFiles(e.dataTransfer.files);
  };
  fileInput.onchange = () => handleMediaFiles(fileInput.files);

  async function handleMediaFiles(files) {
    for (const file of files) {
      const dataUrl = await fileToDataUrl(file);
      mediaAttachments.push({
        type: file.type.split('/')[0] || 'document',
        dataUrl,
        filename: file.name,
        mimeType: file.type,
      });
    }
    renderMediaList();
  }

  // Delay preset toggle
  const delaySelect = container.querySelector('#cb-delay-preset');
  const customDelay = container.querySelector('#cb-custom-delay');
  delaySelect.onchange = () => {
    customDelay.classList.toggle('hidden', delaySelect.value !== 'custom');
  };

  // Back button
  container.querySelector('#cb-back').onclick = () => {
    renderView('campaigns');
  };

  // Save
  container.querySelector('#cb-save').onclick = async () => {
    const name = container.querySelector('#cb-name').value.trim();
    if (!name) { showToast('Campaign name is required', 'error'); return; }

    const listEl = container.querySelector('#cb-list');
    const contactListId = listEl ? listEl.value : campaign.contactListId;
    if (!contactListId) { showToast('Please select a contact list', 'error'); return; }

    const selectedTemplates = [...container.querySelectorAll('[name="template"]:checked')].map(cb => cb.value);

    const preset = delaySelect.value;
    let delayMin, delayMax;
    if (preset === 'custom') {
      delayMin = parseInt(container.querySelector('#cb-delay-min').value);
      delayMax = parseInt(container.querySelector('#cb-delay-max').value);
    } else {
      delayMin = DELAY_PRESETS[preset].min;
      delayMax = DELAY_PRESETS[preset].max;
    }

    const scheduleInput = container.querySelector('#cb-schedule').value;
    const scheduledAt = scheduleInput ? new Date(scheduleInput).getTime() : null;

    const updated = {
      ...campaign,
      name,
      contactListId,
      templateIds: selectedTemplates,
      mediaAttachments,
      settings: {
        delayMin,
        delayMax,
        batchSize: parseInt(container.querySelector('#cb-batch-size').value),
        batchPauseMs: parseFloat(container.querySelector('#cb-batch-pause').value) * 60000,
        validateBeforeSend: container.querySelector('#cb-validate').checked,
        simulateTyping: container.querySelector('#cb-typing').checked,
      },
      scheduledAt,
      scheduleWindowStart: container.querySelector('#cb-window-start').value || null,
      scheduleWindowEnd: container.querySelector('#cb-window-end').value || null,
    };

    await sendSW('SAVE_CAMPAIGN', { campaign: updated });

    if (scheduledAt && scheduledAt > Date.now()) {
      await sendSW('SCHEDULE_CAMPAIGN', { campaignId: updated.id, scheduledAt });
      showToast(`Campaign scheduled for ${new Date(scheduledAt).toLocaleString()}`, 'success');
    } else {
      showToast('Campaign saved', 'success');
    }

    renderView('campaigns');
  };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
