import { useDataSource } from '../../data/DataSourceContext';
import type { CollectionModel } from '../../data/schemaModel';
import { useCollectionUrlState } from './urlState';

/** Two-letter chip initial derived from the label (design-export nav). */
function initialFor(label: string): string {
  const words = label.split(/\s+/).filter(Boolean);
  const raw =
    words.length >= 2 ? `${words[0][0]}${words[1][0]}` : label.slice(0, 2).padEnd(2, label[0]);
  return raw.charAt(0).toUpperCase() + raw.charAt(1).toLowerCase();
}

/**
 * Step 0.5 — the collections nav, derived from endpoint introspection
 * (derive-all; config reorder/relabel/hide is later — R3.1). Bound into the
 * layout's `primaryNav` slot.
 */
export function CollectionsNav() {
  const state = useDataSource();
  const { collection, selectCollection } = useCollectionUrlState();

  if (state.status !== 'ready') {
    return (
      <>
        <div className="nav-section-label">Collections</div>
        <div className="nav-status">
          {state.status === 'connecting' ? 'Negotiating with endpoint…' : 'No endpoint connected.'}
        </div>
      </>
    );
  }

  const collections = state.source.collections;
  const active = collection ?? collections[0]?.id;

  return (
    <>
      <div className="nav-section-label">Collections</div>
      <div className="nav-list">
        {collections.map((c: CollectionModel) => (
          <button
            key={c.id}
            type="button"
            className="nav-item"
            title={`${c.label} → type: ${c.typeName}`}
            aria-current={c.id === active}
            onClick={() => selectCollection(c.id)}
          >
            <span className="nav-item-chip">{initialFor(c.label)}</span>
            <span className="nav-item-label">{c.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}
