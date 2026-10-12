// Storage layer. Every save (slots, settings, best runs) is a JSON-serialisable blob
// read and written through here, never through localStorage directly. The browser
// build uses localStorage. A desktop (Electron) build can call setStorageBackend()
// with a backend that writes one JSON file per key into a fixed AppData folder,
// which Steam Auto-Cloud can then sync (pattern *.json).
const local = {
  get: k => localStorage.getItem(k),
  set: (k, v) => localStorage.setItem(k, v),
  remove: k => localStorage.removeItem(k),
  keys: () => Object.keys(localStorage),
};
let backend = local;

/** Swap the backend: { get(key) → string|null, set(key, string), remove(key), keys() → string[] }. Sync calls. */
export function setStorageBackend(b) { backend = b || local; }

export const storage = {
  get(k) { try { return backend.get(k); } catch (_) { return null; } },
  set(k, v) { try { backend.set(k, v); } catch (_) { /* storage full or blocked */ } },
  remove(k) { try { backend.remove(k); } catch (_) { /* storage blocked */ } },
  keys() { try { return backend.keys(); } catch (_) { return []; } },
};
