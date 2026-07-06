import { parseAsInteger, parseAsJson, parseAsString, useQueryStates } from 'nuqs';
import type { FilterValues } from '../../data/hippoSource';

/**
 * Step R3.9 — the serializable query-state object ⇄ URL: `{collection, page,
 * q, filters, entity}` live in the URL so every view — filtered, searched, or
 * drilled into a record — is shareable/bookmarkable. Grows into saved views
 * in Phase 4.
 */
function validateFilters(value: unknown): FilterValues {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) {
    throw new Error('filters must be an object');
  }
  for (const v of Object.values(value)) {
    if (typeof v !== 'string' && typeof v !== 'boolean') {
      throw new Error('filter values must be strings or booleans');
    }
  }
  return value as FilterValues;
}

const EMPTY_FILTERS: FilterValues = {};

export function useCollectionUrlState() {
  const [state, setState] = useQueryStates({
    collection: parseAsString,
    page: parseAsInteger.withDefault(1),
    q: parseAsString,
    filters: parseAsJson(validateFilters),
    entity: parseAsString,
  });

  const filters = state.filters ?? EMPTY_FILTERS;

  return {
    collection: state.collection,
    page: Math.max(1, state.page),
    search: state.q ?? '',
    filters,
    entity: state.entity,

    selectCollection: (collection: string) =>
      void setState({ collection, page: 1, q: null, filters: null, entity: null }),
    setPage: (page: number) => void setState({ page: Math.max(1, page) }),
    setSearch: (q: string) => void setState({ q: q.trim() === '' ? null : q.trim(), page: 1 }),
    /** Single-value equality per facet (flat AND semantics — R3.3); toggle clears. */
    toggleFilter: (field: string, value: string | boolean) => {
      const next: FilterValues = { ...filters };
      if (next[field] === value) delete next[field];
      else next[field] = value;
      void setState({ filters: Object.keys(next).length > 0 ? next : null, page: 1 });
    },
    clearFilters: () => void setState({ filters: null, q: null, page: 1 }),
    openEntity: (entity: string) => void setState({ entity }),
    closeEntity: () => void setState({ entity: null }),
  };
}
