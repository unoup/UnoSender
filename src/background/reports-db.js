/**
 * IndexedDB storage for campaign report entries.
 * Kept separate from chrome.storage.local to handle large report datasets
 * without hitting the 10MB quota.
 *
 * This module is imported by the service worker.
 * IndexedDB is available in service workers (Chromium 102+).
 */

const DB_NAME = 'unosender-reports';
const DB_VERSION = 1;
const STORE_NAME = 'entries';

let _db = null;

function openDb() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('campaignId', 'campaignId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const req = fn(store);
    if (req && req.onsuccess !== undefined) {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } else {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    }
  }));
}

export async function saveReportEntry(entry) {
  const { createReportEntry } = await import('../shared/models.js');
  const record = createReportEntry(entry);
  return tx('readwrite', store => store.put(record));
}

export async function getReportsByCampaign(campaignId) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('campaignId');
    const req = index.getAll(IDBKeyRange.only(campaignId));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export async function getAllReports() {
  return tx('readonly', store => store.getAll());
}

export async function clearReportsByCampaign(campaignId) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('campaignId');
    const req = index.openCursor(IDBKeyRange.only(campaignId));
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
      else resolve();
    };
    req.onerror = () => reject(req.error);
  }));
}

export async function clearAllReports() {
  return tx('readwrite', store => store.clear());
}
