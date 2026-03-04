/**
 * Capacitor-safe localStorage wrappers (Section 13d).
 * Some Capacitor WebView environments throw on localStorage access.
 */
export function safeSetItem(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

export function safeGetItem(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
