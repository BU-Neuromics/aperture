import { useEffect, useState } from 'react';
import { useCapabilities, useDataSource } from '../../data/DataSourceContext';
import type { FacetModel } from '../../data/schemaModel';
import { activeCollection } from '../../nav/config';
import { useNavView } from '../../nav/NavConfigContext';
import { useCollectionUrlState } from './urlState';
import './collections.css';

/** Per-value counts for one facet field, keyed by the option's string form. */
type FacetCounts = Record<string, number>;

/**
 * The filters panel (design-export inspector; R3.3): FTS box + equality
 * facets derived from the endpoint's filter surface. Capability-gated
 * (ADR-0029): renders nothing when the collection advertises neither facets
 * nor search (the layout collapses the empty inspector column). One value per
 * facet, AND across facets — the flat-equality semantics every conformant
 * filter input supports. Per-value counts (issue #20) appear once the
 * endpoint advertises a genuine `facetCounts` field (Hippo X1) — each
 * facet's own current selection is excluded from its own counts so its other
 * options stay visible, while every other active filter still narrows them.
 */
export function FacetPanel() {
  const state = useDataSource();
  const view = useNavView();
  const capabilities = useCapabilities();
  const urlState = useCollectionUrlState();
  const { collection, filters, search, toggleFilter, setSearch, clearFilters } = urlState;

  const active =
    state.status === 'ready' && view != null ? activeCollection(view, collection) : undefined;
  const facets = active && capabilities.equalityFacets ? active.facets : [];
  const countableFields = capabilities.aggregation && active?.facetCounts
    ? facets.filter((f) => f.kind !== 'ref').map((f) => f.field)
    : [];

  const [counts, setCounts] = useState<Record<string, FacetCounts>>({});
  useEffect(() => {
    if (state.status !== 'ready' || !active || countableFields.length === 0) {
      setCounts({});
      return;
    }
    let cancelled = false;
    state.source
      .getFacetCounts(active.id, countableFields, filters)
      .then((byField) => {
        if (cancelled) return;
        const next: Record<string, FacetCounts> = {};
        for (const [field, buckets] of Object.entries(byField)) {
          next[field] = Object.fromEntries(buckets.map((b) => [String(b.value), b.count]));
        }
        setCounts(next);
      })
      .catch(() => {
        if (!cancelled) setCounts({});
      });
    return () => {
      cancelled = true;
    };
    // countableFields is a derived array (new identity each render); its
    // content is exactly `active.id` + capability gates, already tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, active?.id, JSON.stringify(filters), countableFields.join(',')]);

  if (state.status !== 'ready' || view == null) return null;
  // The builder/graph views own the URL's filter semantics — hide the panel.
  if (urlState.view != null) return null;
  if (!active) return null;

  // Progressive disclosure into the cross-class builder (ADR-0035): the
  // current facet state carries over as the degenerate QuerySpec.
  const openAdvanced = () =>
    urlState.openQueryBuilder({
      v: 1,
      anchor: active.id,
      mode: 'AND',
      criteria: Object.entries(filters).map(([slot, value]) => ({
        kind: 'field',
        slot,
        op: 'eq',
        value,
      })),
    });

  const searchable = capabilities.fullTextSearch && Boolean(active.args.search || active.search);
  if (!searchable && facets.length === 0) return null;

  const activeCount = Object.keys(filters).length + (search ? 1 : 0);

  return (
    // data-testid attributes here and on the options below are the stable
    // certification contract (datahelix golden-path suite; #15) — keep them.
    <div className="facet-panel" data-testid="facet-panel">
      <div className="facet-panel-header">
        <div className="facet-panel-title-row">
          <span className="facet-panel-title">Filters</span>
          {activeCount > 0 && <span className="facet-active-count">{activeCount}</span>}
        </div>
        {activeCount > 0 && (
          <button type="button" className="facet-clear-all" onClick={clearFilters}>
            Clear all
          </button>
        )}
        <button
          type="button"
          className="facet-clear-all"
          data-testid="facet-advanced"
          title="Cross-class criteria query (ADR-0035)"
          onClick={openAdvanced}
        >
          Advanced…
        </button>
      </div>
      <div className="facet-panel-body">
        {searchable && <SearchBox value={search} onApply={setSearch} />}
        {facets.map((facet) => (
          <FacetGroup
            key={facet.field}
            facet={facet}
            value={filters[facet.field]}
            counts={counts[facet.field]}
            onToggle={(value) => toggleFilter(facet.field, value)}
          />
        ))}
        <div className="facet-footnote">
          Facets derive from the endpoint’s filter surface: one value per facet, combined with
          AND.{' '}
          {countableFields.length > 0
            ? 'Counts reflect the other active filters.'
            : 'Counts arrive with backend aggregation support.'}
        </div>
      </div>
    </div>
  );
}

function SearchBox({ value, onApply }: { value: string; onApply: (q: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <div className="facet-group">
      <div className="facet-group-label">Search</div>
      <input
        type="search"
        className="facet-search-input"
        placeholder="Full-text search…"
        aria-label="Full-text search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onApply(draft);
        }}
        onBlur={() => {
          if (draft !== value) onApply(draft);
        }}
      />
    </div>
  );
}

function FacetGroup({
  facet,
  value,
  counts,
  onToggle,
}: {
  facet: FacetModel;
  value: string | boolean | undefined;
  /** Per-value counts (issue #20), keyed by the option's string form. */
  counts?: FacetCounts;
  onToggle: (value: string | boolean) => void;
}) {
  if (facet.kind === 'ref') {
    return <RefFacet facet={facet} value={typeof value === 'string' ? value : ''} onToggle={onToggle} />;
  }

  const options: { label: string; value: string | boolean }[] =
    facet.kind === 'boolean'
      ? [
          { label: 'true', value: true },
          { label: 'false', value: false },
        ]
      : (facet.options ?? []).map((v) => ({ label: v, value: v }));

  return (
    <div className="facet-group">
      <div className="facet-group-label">{facet.label}</div>
      <div className="facet-options">
        {options.map((option) => {
          const selected = value === option.value;
          const count = counts?.[String(option.value)];
          return (
            <button
              key={String(option.value)}
              type="button"
              className="facet-option"
              // Keyed by the filter FIELD identifier (the LinkML slot name the
              // server filters on) + the option value, e.g. facet-option-in_print-false.
              data-testid={`facet-option-${facet.field}-${String(option.value)}`}
              aria-pressed={selected}
              onClick={() => onToggle(option.value)}
            >
              <span className={selected ? 'facet-box facet-box-on' : 'facet-box'} aria-hidden="true">
                {selected ? '✓' : ''}
              </span>
              <span className="facet-option-label">{option.label}</span>
              {count != null && (
                <span className="facet-option-count" data-testid={`facet-count-${facet.field}-${String(option.value)}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RefFacet({
  facet,
  value,
  onToggle,
}: {
  facet: FacetModel;
  value: string;
  onToggle: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const apply = () => {
    const trimmed = draft.trim();
    if (trimmed === value) return;
    // toggleFilter clears on same-value; setting '' clears via toggle of old value.
    if (trimmed === '') {
      if (value) onToggle(value);
    } else {
      onToggle(trimmed);
    }
  };

  return (
    <div className="facet-group">
      <div className="facet-group-label">{facet.label}</div>
      <input
        type="text"
        className="facet-search-input"
        placeholder="Filter by id…"
        data-testid={`facet-option-${facet.field}`}
        aria-label={`Filter by ${facet.label}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply();
        }}
        onBlur={apply}
      />
    </div>
  );
}
