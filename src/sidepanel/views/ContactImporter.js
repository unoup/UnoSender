/**
 * ContactImporter view — import contacts from CSV/Excel/VCF.
 */
import { sendSW, showToast, renderView } from '../app.js';
import { parseContactFile } from '../../shared/csv-utils.js';
import { createContactList } from '../../shared/models.js';
import { normalizePhone, toWaChatId } from '../../shared/phone-parser.js';
import { createContact } from '../../shared/models.js';

export async function renderContactImporter(container) {
  container.innerHTML = `
    <div class="section-header">
      <h2>Import Contacts</h2>
      <button class="btn btn-ghost btn-sm" id="ci-back">← Back</button>
    </div>

    <div class="form-group">
      <label>Upload File</label>
      <div class="drop-zone" id="ci-drop-zone">
        <input type="file" id="ci-file-input" accept=".csv,.xlsx,.xls,.ods,.vcf,.txt" />
        <div class="drop-icon">📁</div>
        <p>Drop your file here or click to browse</p>
        <p class="text-sm text-muted">Supports CSV, Excel (.xlsx/.xls), VCF</p>
      </div>
    </div>

    <div id="ci-mapping-section" class="hidden flex-col gap-12">
      <div class="form-group">
        <label>List Name</label>
        <input type="text" id="ci-list-name" placeholder="e.g. April Customers" />
      </div>

      <div class="form-group">
        <label>Column Mapping</label>
        <p class="text-muted">Map your spreadsheet columns to contact fields.</p>
        <table class="mapping-table mt-8" id="ci-mapping-table">
          <thead>
            <tr><th>Field</th><th>Your Column</th></tr>
          </thead>
          <tbody id="ci-mapping-body"></tbody>
        </table>
      </div>

      <div id="ci-preview" class="form-group">
        <label>Preview <span id="ci-preview-count" class="text-muted"></span></label>
        <div id="ci-preview-list" class="flex-col gap-4"></div>
      </div>

      <div class="flex gap-8">
        <button class="btn btn-primary w-full" id="ci-import-btn">Import Contacts</button>
      </div>
    </div>
  `;

  let parsedRows = [];
  let parsedHeaders = [];

  container.querySelector('#ci-back').onclick = () => renderView('contacts');

  // File input
  const dropZone = container.querySelector('#ci-drop-zone');
  const fileInput = container.querySelector('#ci-file-input');

  dropZone.onclick = () => fileInput.click();
  dropZone.ondragover = e => { e.preventDefault(); dropZone.classList.add('drag-over'); };
  dropZone.ondragleave = () => dropZone.classList.remove('drag-over');
  dropZone.ondrop = async (e) => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) await handleFile(e.dataTransfer.files[0]);
  };
  fileInput.onchange = async () => {
    if (fileInput.files[0]) await handleFile(fileInput.files[0]);
  };

  async function handleFile(file) {
    try {
      const { rows, headers } = await parseContactFile(file);
      parsedRows = rows;
      parsedHeaders = headers;

      // Set default list name to filename
      container.querySelector('#ci-list-name').value =
        file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');

      renderMappingTable(headers);
      renderPreview();
      container.querySelector('#ci-mapping-section').classList.remove('hidden');
      showToast(`Loaded ${rows.length} rows`, 'success');
    } catch (err) {
      showToast(`Error reading file: ${err.message}`, 'error');
    }
  }

  function renderMappingTable(headers) {
    const tbody = container.querySelector('#ci-mapping-body');
    const noneOpt = '<option value="">— None —</option>';
    const headerOpts = headers.map(h => `<option value="${escHtml(h)}">${escHtml(h)}</option>`).join('');

    // Auto-detect phone and name columns
    const phoneGuess = headers.find(h => /phone|mobile|cell|whatsapp|number|tel/i.test(h)) || headers[0] || '';
    const nameGuess = headers.find(h => /name|contact|person/i.test(h)) || '';

    tbody.innerHTML = `
      <tr>
        <td><strong>Phone</strong> <span class="text-red">*</span></td>
        <td>
          <select id="ci-phone-col">
            ${noneOpt}${headerOpts}
          </select>
        </td>
      </tr>
      <tr>
        <td>Name</td>
        <td>
          <select id="ci-name-col">
            ${noneOpt}${headerOpts}
          </select>
        </td>
      </tr>
    `;

    // Set auto-detected values
    const phoneSelect = container.querySelector('#ci-phone-col');
    const nameSelect = container.querySelector('#ci-name-col');
    if (phoneGuess) phoneSelect.value = phoneGuess;
    if (nameGuess) nameSelect.value = nameGuess;

    phoneSelect.onchange = renderPreview;
    nameSelect.onchange = renderPreview;
  }

  function renderPreview() {
    const phoneCol = container.querySelector('#ci-phone-col')?.value;
    if (!phoneCol) return;

    const nameCol = container.querySelector('#ci-name-col')?.value;
    const preview = parsedRows.slice(0, 5);
    const previewList = container.querySelector('#ci-preview-list');
    const countEl = container.querySelector('#ci-preview-count');

    countEl.textContent = `(${parsedRows.length} total)`;
    previewList.innerHTML = preview.map(row => {
      const rawPhone = row[phoneCol] || '';
      const name = (nameCol && row[nameCol]) || '';
      const normalized = rawPhone ? normalizePhone(String(rawPhone)) : null;
      return `
        <div class="list-item">
          <div class="list-item-info">
            <div class="ellipsis">${escHtml(name || rawPhone)}</div>
            <div class="text-muted text-sm">${normalized ? '+' + normalized : '<span class="text-red">Invalid</span>'}</div>
          </div>
        </div>`;
    }).join('');
  }

  container.querySelector('#ci-import-btn')?.addEventListener('click', async () => {
    const phoneCol = container.querySelector('#ci-phone-col')?.value;
    const nameCol = container.querySelector('#ci-name-col')?.value;
    const listName = container.querySelector('#ci-list-name').value.trim() || 'Imported List';

    if (!phoneCol) { showToast('Please select the phone column', 'error'); return; }

    const contacts = [];
    let skipped = 0;

    for (const row of parsedRows) {
      const rawPhone = String(row[phoneCol] || '').trim();
      if (!rawPhone) { skipped++; continue; }

      const digits = normalizePhone(rawPhone);
      if (!digits) { skipped++; continue; }

      const name = nameCol ? (row[nameCol] || '') : '';
      const columns = {};
      for (const [key, val] of Object.entries(row)) {
        if (key !== phoneCol) columns[key] = String(val ?? '');
      }
      if (name) columns['Name'] = name;

      contacts.push(createContact({
        phone: `+${digits}`,
        chatId: toWaChatId(digits),
        name,
        columns,
      }));
    }

    if (contacts.length === 0) {
      showToast('No valid contacts found. Check your phone column.', 'error');
      return;
    }

    const list = createContactList({ name: listName, contacts, columnHeaders: parsedHeaders, phoneColumn: phoneCol });
    await sendSW('SAVE_CONTACT_LIST', { list });

    showToast(`Imported ${contacts.length} contacts${skipped > 0 ? ` (${skipped} skipped)` : ''}`, 'success');
    renderView('contacts');
  });
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
