/**
 * Offline support via IndexedDB.
 * Caches game state and queues actions when offline.
 */

const DB_NAME = 'tire-empire';
const DB_VERSION = 2; // bumped to wipe stale cache (bad factory state)
const STATE_STORE = 'gameState';
const QUEUE_STORE = 'actionQueue';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STATE_STORE)) {
        db.createObjectStore(STATE_STORE);
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheGameState(state) {
  try {
    const db = await openDB();
    const tx = db.transaction(STATE_STORE, 'readwrite');
    tx.objectStore(STATE_STORE).put(state, 'current');
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
  } catch {}
}

export async function getCachedGameState() {
  try {
    const db = await openDB();
    const tx = db.transaction(STATE_STORE, 'readonly');
    const req = tx.objectStore(STATE_STORE).get('current');
    return new Promise((res) => {
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}

export async function queueAction(action, params) {
  try {
    const db = await openDB();
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).add({ action, params, ts: Date.now() });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
  } catch {}
}

export async function getPendingActions() {
  try {
    const db = await openDB();
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const req = tx.objectStore(QUEUE_STORE).getAll();
    return new Promise((res) => {
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => res([]);
    });
  } catch {
    return [];
  }
}

export async function clearPendingActions() {
  try {
    const db = await openDB();
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).clear();
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
  } catch {}
}
