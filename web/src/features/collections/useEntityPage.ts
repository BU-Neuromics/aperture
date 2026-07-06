import { useCallback, useEffect, useState } from 'react';
import type { EntityPage, HippoSource } from '../../data/hippoSource';

export type EntityPageState =
  | { status: 'loading' }
  | { status: 'ready'; page: EntityPage }
  | { status: 'error'; message: string };

/** Fetches one offset page for the active collection; refetches on change. */
export function useEntityPage(
  source: HippoSource,
  collectionId: string,
  page: number,
  pageSize: number,
): EntityPageState & { retry: () => void } {
  const [state, setState] = useState<EntityPageState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    source
      .listEntities(collectionId, page, pageSize)
      .then((result) => {
        if (!cancelled) setState({ status: 'ready', page: result });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source, collectionId, page, pageSize, attempt]);

  return { ...state, retry };
}
