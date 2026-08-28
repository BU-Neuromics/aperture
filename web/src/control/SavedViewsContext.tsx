import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { SavedView } from './savedViews';
import { openSavedView, sealSavedView } from './savedViews';
import { useControlPlane } from './ControlPlaneContext';

/** Saved views, shared between the nav list and the save affordance. */
export interface SavedViewsState {
  status: 'loading' | 'ready' | 'error';
  /** The viewer's own views plus every shared one (ADR-0032 amendment). */
  views: SavedView[];
  /** Upsert by name within the viewer's namespace. */
  save(view: SavedView): Promise<void>;
  /** Retire the named view (W4.4 — clears the payload, never a hard delete). */
  remove(name: string): Promise<void>;
  /**
   * Whether the viewer may modify this view. False for a shared view owned by
   * someone else: the fork path is to apply it and save under a new name.
   * This gates the affordance only — it is not enforcement (ADR-0008/0016).
   */
  canWrite(view: SavedView): boolean;
}

const SavedViewsContext = createContext<SavedViewsState>({
  status: 'loading',
  views: [],
  save: async () => {},
  remove: async () => {},
  canWrite: () => true,
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

  const canWrite = useCallback(
    (view: SavedView) => store.canWrite({ kind: 'savedView', owner: view.owner ?? null }),
    [store],
  );

  return (
    <SavedViewsContext.Provider value={{ status, views, save, remove, canWrite }}>
      {children}
    </SavedViewsContext.Provider>
  );
}

export function useSavedViews(): SavedViewsState {
  return useContext(SavedViewsContext);
}
