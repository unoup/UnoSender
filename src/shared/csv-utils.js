/**
 * CSV/Excel/VCF import utilities.
 * Uses PapaParse for CSV, SheetJS (xlsx) for Excel.
 */
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { parseNumbersFromVcf, normalizePhone, toWaChatId } from './phone-parser.js';
import { createContact, createContactList } from './models.js';

/**
 * Parse a File object into an array of row objects.
 * Supports: .csv, .xlsx, .xls, .ods, .vcf, .txt
 *
 * @param {File} file
 * @returns {Promise<{ rows: object[], headers: string[] }>}
 */
export async function parseContactFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'csv' || ext === 'txt') {
    return parseCsv(file);
  }

  if (['xlsx', 'xls', 'ods'].includes(ext)) {
    return parseExcel(file);
  }

  if (ext === 'vcf') {
    return parseVcf(file);
  }

  // Fallback: try CSV
  return parseCsv(file);
}

function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        resolve({ rows: results.data, headers });
      },
      error: (err) => reject(new Error(`CSV parse error: ${err.message}`)),
    });
  });
}

function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary' });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        resolve({ rows, headers });
      } catch (err) {
        reject(new Error(`Excel parse error: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsBinaryString(file);
  });
}

async function parseVcf(file) {
  const text = await file.text();
  const numbers = parseNumbersFromVcf(text);
  // VCF parsed as simple number list with no extra columns
  const rows = numbers.map(phone => ({ Phone: phone }));
  return { rows, headers: ['Phone'] };
}

/**
 * Convert parsed rows into contacts using a column mapping.
 * @param {object[]} rows - Array of row objects from parseContactFile
 * @param {string} phoneColumn - Column name that contains phone numbers
 * @param {string} [nameColumn] - Column name for contact name (optional)
 * @param {string} [defaultCountry] - Country code for phone normalization
 * @returns {{ contacts: object[], skipped: number }}
 */
export function rowsToContacts(rows, phoneColumn, nameColumn = null, defaultCountry = null) {
  let skipped = 0;
  const contacts = [];

  for (const row of rows) {
    const rawPhone = row[phoneColumn];
    if (!rawPhone) { skipped++; continue; }

    const digits = normalizePhone(String(rawPhone), defaultCountry);
    if (!digits) { skipped++; continue; }

    const name = nameColumn ? (row[nameColumn] || '') : '';

    // Build columns map: all columns except the phone column itself
    const columns = {};
    for (const [key, val] of Object.entries(row)) {
      if (key !== phoneColumn) {
        columns[key] = String(val ?? '');
      }
    }
    // Make Name available under "Name" key for template convenience
    if (name) columns['Name'] = name;

    contacts.push(createContact({
      phone: `+${digits}`,
      chatId: toWaChatId(digits),
      name,
      columns,
    }));
  }

  return { contacts, skipped };
}

/**
 * Export report entries to CSV string for download.
 * @param {object[]} entries - Array of report entry objects
 * @returns {string} CSV string
 */
export function reportsToCsv(entries) {
  if (entries.length === 0) return '';
  return Papa.unparse(entries.map(e => ({
    Phone: e.phone,
    Name: e.name,
    Status: e.status,
    Error: e.errorMessage || '',
    Timestamp: new Date(e.timestamp).toISOString(),
    Campaign: e.campaignName,
  })));
}

/**
 * Convert contacts to VCF format.
 * Ported from exportContacts.js:toVCard (lines 21–32)
 */
export function contactsToVcf(contacts) {
  return contacts.map(contact => {
    const displayName = contact.name || contact.phone;
    return [
      'BEGIN:VCARD',
      'VERSION:4.0',
      `FN:${displayName}`,
      `TEL;TYPE=CELL:${contact.phone}`,
      'PRODID:-//UnoSender//WhatsApp Contacts Export//EN',
      'END:VCARD',
    ].join('\n');
  }).join('\n');
}

/**
 * Download a string as a file using an anchor element.
 * Works in extension side panel / popup contexts.
 */
export function downloadTextFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
