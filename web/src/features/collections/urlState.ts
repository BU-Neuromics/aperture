import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';

/**
 * Step 0.6 — query state ⇄ URL (R3.9 precursor): `{collection, page}` live in
 * the URL so every view is shareable/bookmarkable. Grows into the full
 * serializable query-state object (filters/sort) in Phase 1.
 */
export function useCollectionUrlState() {
  const [state, setState] = useQueryStates({
    collection: parseAsString,
    page: parseAsInteger.withDefault(1),
  });

  return {
    collection: state.collection,
    page: Math.max(1, state.page),
    selectCollection: (collection: string) => void setState({ collection, page: 1 }),
    setPage: (page: number) => void setState({ page: Math.max(1, page) }),
  };
}
