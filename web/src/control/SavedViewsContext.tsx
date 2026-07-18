import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { SavedView } from './savedViews';
import { openSavedView, sealSavedView } from './savedViews';
import { useControlPlane } from './ControlPlaneContext';

/** Saved views, shared between the nav list and the save affordance. */
export interface SavedViewsState {
  status: 'loading' | 'ready' | 'error';
  views: SavedView[];
  /** Upsert by name (same name overwrites — the store's collision rule). */
  save(view: SavedView): Promise<void>;
  /** Retire the named view (W4.4 — clears the payload, never a hard delete). */
  remove(name: string): Promise<void>;
}

const SavedViewsContext = createContext<SavedViewsState>({
  status: 'loading',
  views: [],
  save: async () => {},
  remove: async () => {},
});

export function SavedViewsProvider({ children }: { children: ReactNode }) {
  const { status: storeStatus, store } = useControlPlane();
  const [status, setStatus] = useState<SavedViewsState['status']>('loading');
  const [views, setViews] = useState<SavedView[]>([]);

  const refresh = useCallback(async () => {
    const documents = await store.list('savedView');
    // Invalid payloads are skipped (structural validation on read).
    setViews(documents.map(openSavedView).filter((v): v is SavedView => v != null));
  }, [store]);

  useEffect(() => {
    if (storeStatus !== 'ready') return;
    let cancelled = false;
    setStatus('loading');
    refresh()
      .then(() => {
        if (!cancelled) setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [storeStatus, refresh]);

  const save = useCallback(
    async (view: SavedView) => {
      await store.put(sealSavedView(view));
      await refresh();
    },
    [store, refresh],
  );

  const remove = useCallback(
    async (name: string) => {
      await store.remove('savedView', name);
      await refresh();
    },
    [store, refresh],
  );

  return (
    <SavedViewsContext.Provider value={{ status, views, save, remove }}>
      {children}
    </SavedViewsContext.Provider>
  );
}

export function useSavedViews(): SavedViewsState {
  return useContext(SavedViewsContext);
}
