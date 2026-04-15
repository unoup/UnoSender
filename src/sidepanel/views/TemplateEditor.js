/**
 * TemplateEditor view — create and manage message templates.
 */
import { sendSW, showToast, renderView } from '../app.js';
import { createTemplate, extractVariables } from '../../shared/models.js';

export async function renderTemplateEditor(container, existingTemplate = null) {
  const template = existingTemplate || createTemplate();
  const isEdit = !!existingTemplate;

  container.innerHTML = `
    <div class="section-header">
      <h2>${isEdit ? 'Edit Template' : 'New Template'}</h2>
      <button class="btn btn-ghost btn-sm" id="te-back">← Back</button>
    </div>

    <div class="form-group">
      <label>Template Name</label>
      <input type="text" id="te-name" value="${escHtml(template.name)}" placeholder="e.g. Order Confirmation" />
    </div>

    <div class="form-group">
      <label>Message Body</label>
      <p class="text-muted">Use {ColumnName} for personalization. e.g. Hi {Name}, your order {OrderID} is ready!</p>
      <textarea id="te-body" rows="6" placeholder="Type your message...">${escHtml(template.body)}</textarea>
    </div>

    <div class="form-group">
      <label>Detected Variables</label>
      <div id="te-vars" class="flex gap-4 flex-wrap"></div>
    </div>

    <div class="form-group">
      <label>Preview</label>
      <div id="te-preview" class="template-preview"></div>
    </div>

    <div class="flex gap-8 mt-8">
      <button class="btn btn-primary w-full" id="te-save">
        ${isEdit ? 'Save Changes' : 'Create Template'}
      </button>
    </div>
  `;

  const bodyEl = container.querySelector('#te-body');
  const varsEl = container.querySelector('#te-vars');
  const previewEl = container.querySelector('#te-preview');

  function updatePreview() {
    const body = bodyEl.value;
    const vars = extractVariables(body);

    varsEl.innerHTML = vars.length
      ? vars.map(v => `<span class="badge badge-blue">{${escHtml(v)}}</span>`).join('')
      : '<span class="text-muted">None detected</span>';

    // Show preview with example values
    const sampleContact = { columns: {}, name: 'Alice' };
    vars.forEach(v => { sampleContact.columns[v] = `[${v}]`; });
    const preview = body.replace(/\{(\w+)\}/g, (match, key) => {
      if (key === 'Name') return '<em>Alice</em>';
      return `<em>[${key}]</em>`;
    });
    previewEl.innerHTML = preview.replace(/\n/g, '<br>') || '<span class="text-muted">Empty template</span>';
  }

  bodyEl.addEventListener('input', updatePreview);
  updatePreview();

  container.querySelector('#te-back').onclick = () => renderView('templates');

  container.querySelector('#te-save').onclick = async () => {
    const name = container.querySelector('#te-name').value.trim();
    const body = bodyEl.value.trim();

    if (!name) { showToast('Template name is required', 'error'); return; }
    if (!body) { showToast('Message body is required', 'error'); return; }

    const updated = {
      ...template,
      name,
      body,
      variables: extractVariables(body),
    };

    await sendSW('SAVE_TEMPLATE', { template: updated });
    showToast('Template saved', 'success');
    renderView('templates');
  };
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
