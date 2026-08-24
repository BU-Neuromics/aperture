import {
  parseAsInteger,
  parseAsJson,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from 'nuqs';
import type { FilterValues } from '../../data/hippoSource';
import type { QuerySpec } from '../../query/querySpec';
import { validateQuerySpecShape } from '../../query/querySpec';

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

/** `<column field>:<asc|desc>` — the column field, not the orderBy enum member (issue #20). */
export interface SortState {
  field: string;
  dir: 'asc' | 'desc';
}

function parseSort(value: string): SortState | null {
  const [field, dir] = value.split(':');
  if (!field || (dir !== 'asc' && dir !== 'desc')) return null;
  return { field, dir };
}

export function formatSort(sort: SortState): string {
  return `${sort.field}:${sort.dir}`;
}

export function useCollectionUrlState() {
  const [state, setState] = useQueryStates({
    collection: parseAsString,
    page: parseAsInteger.withDefault(1),
    q: parseAsString,
    filters: parseAsJson(validateFilters),
    entity: parseAsString,
    form: parseAsStringLiteral(['new', 'edit'] as const),
    workflow: parseAsString,
    /** Cross-class query surfaces (ADR-0035/0037): the builder and graph views. */
    view: parseAsStringLiteral(['query', 'graph'] as const),
    /** The QuerySpec artifact rides the URL — shareable/bookmarkable (ADR-0035). */
    qs: parseAsJson(validateQuerySpecShape),
    /** Server-side sort (issue #20): `<column field>:<asc|desc>`. */
    sort: parseAsString,
  });

  const filters = state.filters ?? EMPTY_FILTERS;
  const sort = state.sort ? parseSort(state.sort) : null;

  return {
    collection: state.collection,
    page: Math.max(1, state.page),
    search: state.q ?? '',
    filters,
    entity: state.entity,
    form: state.form,
    workflow: state.workflow,
    view: state.view,
    querySpec: state.qs,
    sort,

    selectCollection: (collection: string) =>
      void setState({
        collection,
        page: 1,
        q: null,
        filters: null,
        entity: null,
        form: null,
        workflow: null,
        view: null,
        qs: null,
        sort: null,
      }),
    /** Open the cross-class query builder (ADR-0035), optionally pre-anchored. */
    openQueryBuilder: (spec?: QuerySpec) =>
      void setState({
        view: 'query',
        qs: spec ?? null,
        entity: null,
        form: null,
        workflow: null,
        page: 1,
      }),
    setQuerySpec: (spec: QuerySpec) => void setState({ qs: spec, page: 1 }),
    setQueryPage: (page: number) => void setState({ page: Math.max(1, page) }),
    /** Open the graph exploration view (ADR-0037) over the current QuerySpec. */
    openGraphView: () => void setState({ view: 'graph', entity: null, form: null }),
    closeQueryViews: () => void setState({ view: null, qs: null, page: 1 }),
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
    openEntity: (entity: string) => void setState({ entity, form: null }),
    closeEntity: () => void setState({ entity: null, form: null }),
    /** Cross-link: open another collection's entity detail (R3.8). */
    openIn: (collection: string, entity: string) =>
      void setState({
        collection,
        entity,
        page: 1,
        q: null,
        filters: null,
        form: null,
        workflow: null,
        sort: null,
      }),
    /** Relationship pivot: jump to a related collection filtered by this entity (R3.8). */
    pivotTo: (collection: string, field: string, value: string) =>
      void setState({
        collection,
        filters: { [field]: value },
        page: 1,
        q: null,
        entity: null,
        form: null,
        workflow: null,
        sort: null,
      }),
    /**
     * Sort toggle (issue #20): unsorted → asc → desc → unsorted on repeated
     * clicks of the same column; a different column always starts at asc.
     */
    toggleSort: (field: string) => {
      let next: SortState | null;
      if (sort?.field !== field) next = { field, dir: 'asc' };
      else if (sort.dir === 'asc') next = { field, dir: 'desc' };
      else next = null;
      void setState({ sort: next ? formatSort(next) : null, page: 1 });
    },
    /** Write loop (W4): open the generated create/edit form. */
    openCreateForm: () => void setState({ form: 'new', entity: null }),
    openEditForm: () => void setState({ form: 'edit' }),
    closeForm: () => void setState({ form: null }),
    /** Tier-1 workflow (W4.6): open/close the guided runner. */
    openWorkflow: (workflow: string) => void setState({ workflow, entity: null, form: null }),
    closeWorkflow: () => void setState({ workflow: null }),
    /** Saved views (Phase 4): apply a persisted query-state wholesale. */
    applyView: (view: {
      collection: string;
      page: number;
      q?: string;
      filters?: FilterValues;
      sort?: string;
    }) =>
      void setState({
        collection: view.collection,
        page: Math.max(1, view.page),
        q: view.q ?? null,
        filters: view.filters && Object.keys(view.filters).length > 0 ? view.filters : null,
        entity: null,
        form: null,
        workflow: null,
        sort: view.sort ?? null,
      }),
  };
}
