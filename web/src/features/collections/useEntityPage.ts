import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EntityPage, FilterValues, HippoSource } from '../../data/hippoSource';

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
  filters?: FilterValues,
  search?: string,
): EntityPageState & { retry: () => void } {
  const [state, setState] = useState<EntityPageState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const filtersKey = JSON.stringify(filters ?? {});
  const stableFilters = useMemo(
    () => (filters && Object.keys(filters).length > 0 ? filters : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by content, not identity
    [filtersKey],
  );

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    source
      .listEntities(collectionId, { page, pageSize, filters: stableFilters, search })
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
  }, [source, collectionId, page, pageSize, stableFilters, search, attempt]);

  return { ...state, retry };
}
