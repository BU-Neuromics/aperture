import '@testing-library/jest-dom/vitest';

/**
 * Node 25 and 26 define a global `localStorage` getter that shadows jsdom's own
 * implementation, and it resolves to nothing unless the process was started with
 * `--localstorage-file`. The result is a `window.localStorage` that exists as a
 * name but has no methods, so every storage-backed test dies on its first line
 * (`.clear()` is not a function / of undefined) while the app itself is fine —
 * browsers are unaffected, and `createLocalStore` takes its storage by injection.
 *
 * Install a spec-shaped in-memory Storage only when the environment failed to
 * provide a working one, so the suite behaves identically on Node 22, 24 and 26
 * and this becomes inert the day the upstream interaction is fixed.
 */
function installStorageFallback(name: 'localStorage' | 'sessionStorage'): void {
  const existing = (globalThis as unknown as Record<string, Storage | undefined>)[name];
  if (existing && typeof existing.clear === 'function') return;

  const entries = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => {
      const k = String(key);
      return entries.has(k) ? entries.get(k)! : null;
    },
    key: (index) => Array.from(entries.keys())[index] ?? null,
    removeItem: (key) => {
      entries.delete(String(key));
    },
    setItem: (key, value) => {
      entries.set(String(key), String(value));
    },
  };

  Object.defineProperty(globalThis, name, { value: storage, configurable: true });
}

installStorageFallback('localStorage');
installStorageFallback('sessionStorage');
