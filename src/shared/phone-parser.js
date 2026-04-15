/**
 * Phone number normalization utilities.
 * Ported from bulk-whatsappweb-sender/WASend.js:parseNumber (lines 179–187)
 * Uses libphonenumber-js browser build.
 */
import { parsePhoneNumber, parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Normalize a phone number to E.164 format (digits only, no +).
 * Returns null if the number is invalid.
 *
 * @param {string} rawNumber - Raw phone number from user input or CSV
 * @param {string} [defaultCountry] - ISO 3166-1 alpha-2 country code fallback (e.g. 'US')
 * @returns {string|null} Digits-only E.164 number, or null
 */
export function normalizePhone(rawNumber, defaultCountry = null) {
  if (!rawNumber) return null;
  const cleaned = String(rawNumber).trim();
  if (!cleaned) return null;

  try {
    let parsed;
    // Try with + prefix first (most reliable)
    const withPlus = cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
    try {
      parsed = parsePhoneNumber(withPlus);
    } catch {
      // Fall back to country-aware parsing
      if (defaultCountry) {
        parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
      }
    }

    if (parsed && parsed.isValid()) {
      // Return digits only (no + sign), compatible with WhatsApp chat IDs
      return parsed.number.replace(/\D/g, '');
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Convert a normalized phone number (digits only) to a WhatsApp chat ID.
 * @param {string} digits - E.164 digits without +
 * @returns {string} e.g. "15551234567@c.us"
 */
export function toWaChatId(digits) {
  return `${digits}@c.us`;
}

/**
 * Check if a string looks like it could be a phone number (loose check for UI hints).
 */
export function looksLikePhone(value) {
  const stripped = value.replace(/[\s\-().+]/g, '');
  return /^\d{7,15}$/.test(stripped);
}

/**
 * Parse a list of phone numbers from a plain-text string (comma or newline separated).
 * Ported from WASend.js:extractNumbersFromText (lines 110–113)
 */
export function parseNumbersFromText(content) {
  return content
    .split(/,|\r?\n/)
    .map(n => String(n).trim())
    .filter(Boolean);
}

/**
 * Parse phone numbers from a VCF (vCard) string.
 * Ported from WASend.js:extractNumbersFromVcf (lines 115–136)
 */
export function parseNumbersFromVcf(vcfContent) {
  // Unfold RFC6350 folded lines: CRLF + (space/tab) indicates continuation
  const unfolded = vcfContent.replace(/\r?\n[\t ]/g, '');
  const lines = unfolded.split(/\r?\n/);
  const numbers = [];

  for (const line of lines) {
    const match = /^TEL[^:]*:(.*)$/i.exec(line);
    if (!match) continue;

    let value = (match[1] ?? '').trim();
    if (!value) continue;

    // Handle common URI forms: tel:+123..., TEL;VALUE=uri:tel:+123...
    value = value.replace(/^tel:/i, '');
    value = value.replace(/^uri:tel:/i, '');

    numbers.push(value);
  }
  return numbers;
}
