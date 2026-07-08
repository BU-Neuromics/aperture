import { useEffect, useState } from 'react';
import { useCapabilities, useDataSource } from '../../data/DataSourceContext';
import type { FacetModel } from '../../data/schemaModel';
import { activeCollection } from '../../nav/config';
import { useNavView } from '../../nav/NavConfigContext';
import { useCollectionUrlState } from './urlState';
import './collections.css';

/**
 * The filters panel (design-export inspector; R3.3): FTS box + equality
 * facets derived from the endpoint's filter surface. Capability-gated
 * (ADR-0029): renders nothing when the collection advertises neither facets
 * nor search (the layout collapses the empty inspector column). One value per
 * facet, AND across facets — the flat-equality semantics every conformant
 * filter input supports; facet counts stay absent until Hippo X1.
 */
export function FacetPanel() {
  const state = useDataSource();
  const view = useNavView();
  const capabilities = useCapabilities();
  const { collection, filters, search, toggleFilter, setSearch, clearFilters } =
    useCollectionUrlState();

  if (state.status !== 'ready' || view == null) return null;
  const active = activeCollection(view, collection);
  if (!active) return null;

  const searchable = capabilities.fullTextSearch && Boolean(active.args.search || active.search);
  const facets = capabilities.equalityFacets ? active.facets : [];
  if (!searchable && facets.length === 0) return null;

  const activeCount = Object.keys(filters).length + (search ? 1 : 0);

  return (
    <div className="facet-panel">
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
      </div>
      <div className="facet-panel-body">
        {searchable && <SearchBox value={search} onApply={setSearch} />}
        {facets.map((facet) => (
          <FacetGroup
            key={facet.field}
            facet={facet}
            value={filters[facet.field]}
            onToggle={(value) => toggleFilter(facet.field, value)}
          />
        ))}
        <div className="facet-footnote">
          Facets derive from the endpoint’s filter surface: one value per facet, combined with
          AND. Counts arrive with backend aggregation support.
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
  onToggle,
}: {
  facet: FacetModel;
  value: string | boolean | undefined;
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
          return (
            <button
              key={String(option.value)}
              type="button"
              className="facet-option"
              aria-pressed={selected}
              onClick={() => onToggle(option.value)}
            >
              <span className={selected ? 'facet-box facet-box-on' : 'facet-box'} aria-hidden="true">
                {selected ? '✓' : ''}
              </span>
              <span className="facet-option-label">{option.label}</span>
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
