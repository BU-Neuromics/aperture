import { useState } from 'react';
import type { CollectionModel, ColumnModel } from '../data/schemaModel';
import { typeColorStyle } from '../data/typeColor';
import type { ManyMode, PathColumn } from '../data/selection';
import { pathKey } from '../data/selection';
import type { QueryEdge } from './querySpec';
import { deriveEdges } from './querySpec';

/**
 * What the query surface shows when it has no results: the schema.
 *
 * This replaces an empty-state placeholder that drew a schematic of a query and said
 * "Nothing run yet". That was never true — the page always knows the schema, and a user
 * who has run nothing is exactly the user who most needs to see what can be asked. The
 * placeholder occupied most of the screen to say the page had nothing to offer, while
 * holding everything below.
 *
 * It also gives a conversational answer somewhere to land. A turn that names fields and
 * produces no query used to leave prose in a 400px column beside an empty grid.
 *
 * **Not the schema-as-data approach that was retired.** That ingested the schema as rows
 * and made the user run a query to see them, so it could drift from the schema it
 * described and needed a drift check to say so. This reads live introspection the client
 * already holds: nothing is stored, nothing can go stale, and seeing it is not a query.
 */
export function FieldsPanel({
  collection,
  highlighted,
  hiddenFields,
  onAddFilter,
  onToggleField,
  showColumnToggles,
  asideFromAnchor,
  onAdoptAnchor,
  traversal,
}: {
  collection: CollectionModel;
  /** Slot/field names the current turn named — emphasis only, never a filter. */
  highlighted: ReadonlySet<string>;
  hiddenFields: ReadonlySet<string>;
  onAddFilter: (column: ColumnModel) => void;
  onToggleField: (field: string) => void;
  /** Column toggles are meaningless until there is a result table to apply them to. */
  showColumnToggles: boolean;
  /** This is what the last answer was about, and it is NOT the query's anchor. */
  asideFromAnchor?: boolean;
  /** Make the shown collection the anchor. Absent when it already is. */
  onAdoptAnchor?: () => void;
  /**
   * Columns reached through a reference (ADR-0041). Absent → the panel behaves
   * exactly as it did before, which is what the pre-run and aside cases want.
   */
  traversal?: TraversalProps;
}) {
  const isNamed = (c: ColumnModel) =>
    highlighted.has(c.slot ?? '') || highlighted.has(c.field);

  // Named first, then filterable, then the rest — each group keeping its schema order, so
  // the list does not reshuffle under the reader between turns.
  const ranked = [...collection.detailColumns].sort((a, b) => {
    const named = Number(isNamed(b)) - Number(isNamed(a));
    if (named !== 0) return named;
    return Number(canFilter(collection, b)) - Number(canFilter(collection, a));
  });

  const namedCount = ranked.filter(isNamed).length;

  return (
    <section className="fields-panel" data-testid="fields-panel" aria-label="Fields">
      <header className="fields-panel-head">
        <div>
          <span className="chat-eyebrow">Fields</span>
          <h2 className="fields-panel-title" style={typeColorStyle(collection.typeName)}>
            {collection.label}
          </h2>
        </div>
        {namedCount > 0 && (
          <span className="fields-panel-count" role="status">
            {namedCount} relevant to your question
          </span>
        )}
      </header>

      {/* Say why the panel moved. Without this the reader sees fields they did not ask
          for and has no way to tell an answer from a bug -- which is exactly how the
          old behaviour read, only with the fields being wrong instead of right. */}
      {asideFromAnchor && (
        <p className="fields-panel-aside" data-testid="fields-panel-aside">
          <span>This is what the answer was about. Your query still returns other rows.</span>
          {onAdoptAnchor && (
            <button type="button" className="action-button" onClick={onAdoptAnchor}>
              Return rows of {collection.label}
            </button>
          )}
        </p>
      )}

      {collection.description && <p className="fields-panel-lead">{collection.description}</p>}

      <ul className="fields-list">
        {ranked.map((column) => (
          <li
            key={column.field}
            className="fields-row"
            data-named={isNamed(column) || undefined}
            data-testid="fields-row"
          >
            <div className="fields-row-head">
              <span className="fields-row-name">{column.label}</span>
              <code className="fields-row-slot">{column.slot ?? column.field}</code>
              <span className="fields-row-type">{typeLabel(column)}</span>
              {column.required && <span className="fields-row-req">required</span>}
            </div>

            {column.description && <p className="fields-row-desc">{column.description}</p>}

            {column.enumValues && column.enumValues.length > 0 && (
              <ul className="fields-row-values">
                {column.enumValues.map((v) => (
                  <li key={v}>
                    <code>{v}</code>
                  </li>
                ))}
              </ul>
            )}

            {column.targetType && (
              <p className="fields-row-ref">
                links to <strong>{column.targetType}</strong>
              </p>
            )}

            <div className="fields-row-actions">
              {canFilter(collection, column) && (
                <button
                  type="button"
                  className="fields-action"
                  onClick={() => onAddFilter(column)}
                  title={`Add a condition on ${column.label} to the query being built`}
                >
                  + filter
                </button>
              )}
              {showColumnToggles && (
                <label className="fields-action fields-action-toggle">
                  <input
                    type="checkbox"
                    checked={!hiddenFields.has(column.field)}
                    onChange={() => onToggleField(column.field)}
                  />
                  in results
                </label>
              )}
            </div>
          </li>
        ))}
      </ul>

      {showColumnToggles && traversal && (
        <RelatedColumns collection={collection} {...traversal} />
      )}
    </section>
  );
}

export interface TraversalProps {
  edges: QueryEdge[];
  collections: CollectionModel[];
  selected: PathColumn[];
  /** Add or remove the column at this GraphQL path (one or two hops from the anchor). */
  onTogglePath: (path: string[]) => void;
  onSetMode: (path: string[], mode: ManyMode) => void;
}

const MODE_LABELS: Record<ManyMode, string> = {
  count: 'how many',
  joinIds: 'list them',
  explode: 'one row each',
};

/**
 * Result columns reached through a reference.
 *
 * Grouped under the edge rather than mixed in with the anchor's own fields,
 * because "Name" on its own stops meaning anything once three classes have
 * one — the grouping IS the disambiguation, and it matches the column headers
 * ("Donor → Cohort").
 *
 * Everything offered comes from `deriveEdges`, so the panel enumerates nothing
 * (ADR-0002): a schema that gains a reference gains a group here with no code
 * change.
 */
function RelatedColumns({
  collection,
  edges,
  collections,
  selected,
  onTogglePath,
  onSetMode,
}: TraversalProps & { collection: CollectionModel }) {
  const [open, setOpen] = useState<string | null>(null);
  const [openInner, setOpenInner] = useState<string | null>(null);
  const chosen = new Map(selected.map((c) => [pathKey(c.path), c]));

  /** One field row: the include checkbox, plus the grain choice once it is a list. */
  const fieldRow = (path: string[], column: ColumnModel) => {
    const pick = chosen.get(pathKey(path));
    return (
      <li key={column.field} className="fields-related-row">
        <label className="fields-action fields-action-toggle">
          <input type="checkbox" checked={pick != null} onChange={() => onTogglePath(path)} />
          {column.label}
        </label>

        {/* A column read through a list cannot be added without answering
            what a row means, so the choice is inline and a grain change is
            never the silent default. "one row each" applies to the whole
            link: every column through it explodes together. */}
        {pick?.many && (
          <span className="fields-related-mode">
            {(['count', 'joinIds', 'explode'] as ManyMode[]).map((mode) => (
              <label key={mode} className="fields-related-mode-option">
                <input
                  type="radio"
                  name={`mode-${pathKey(path)}`}
                  checked={pick.many?.mode === mode}
                  onChange={() => onSetMode(path, mode)}
                />
                {MODE_LABELS[mode]}
              </label>
            ))}
            {pick.many.mode === 'explode' && (
              <em className="fields-related-grain">changes what a row is</em>
            )}
          </span>
        )}
      </li>
    );
  };

  return (
    <div className="fields-related" data-testid="fields-related">
      <h3 className="fields-related-title">Through a reference</h3>
      {edges.length === 0 && (
        <p className="fields-related-empty">{collection.label} references nothing.</p>
      )}

      {edges.map((edge) => {
        const target = collections.find((c) => c.id === edge.relatedCollectionId);
        if (!target) return null;

        // An edge nothing on the anchor names has no field to select through.
        // It still filters, so it is shown and disabled with the reason rather
        // than hidden — an absent row would read as "this data does not exist".
        // It becomes selectable on its own once the schema declares the
        // inverting slot (Mosaic ADR-0011); nothing here changes.
        if (!edge.selectField) {
          return (
            <div
              key={edge.key}
              className="fields-related-edge fields-related-gated"
              data-testid="fields-related-gated"
            >
              <span className="fields-related-name">{edge.label}</span>
              <span className="fields-related-gate">
                available as a filter only — this endpoint exposes no reverse edge from{' '}
                {collection.label.toLowerCase()}, so these fields cannot be read into the table
              </span>
            </div>
          );
        }

        // The second hop (MAX_PATH_HOPS = 2): the related class's own links.
        // Only links with a selectable field, and never a second list after a
        // list -- a list of lists has no single meaning for "one row each" or
        // for a joined summary (see resolvePath).
        const innerAll = deriveEdges(target, collections).filter((e) => e.selectField);
        const inner = innerAll.filter((e) => !(edge.toMany && e.toMany));
        const skippedLists = innerAll.length - inner.length;

        const isOpen = open === edge.key;
        return (
          <div key={edge.key} className="fields-related-edge" data-testid="fields-related-edge">
            <button
              type="button"
              className="fields-related-toggle"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : edge.key)}
            >
              <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span> {edge.label}
              <span className="fields-related-type" style={typeColorStyle(target.typeName)}>
                {target.label}
              </span>
            </button>

            {isOpen && (
              <>
                <ul className="fields-related-list">
                  {target.detailColumns.map((column) => fieldRow([edge.selectField!, column.field], column))}
                </ul>

                {inner.length > 0 && (
                  <div className="fields-related-inner" data-testid="fields-related-inner">
                    <h4 className="fields-related-inner-title">Then through {target.label.toLowerCase()}&apos;s references</h4>
                    {inner.map((sub) => {
                      const subTarget = collections.find((c) => c.id === sub.relatedCollectionId);
                      if (!subTarget) return null;
                      const innerKey = `${edge.key}>${sub.key}`;
                      const innerOpen = openInner === innerKey;
                      return (
                        <div key={innerKey} className="fields-related-edge fields-related-edge-inner">
                          <button
                            type="button"
                            className="fields-related-toggle"
                            aria-expanded={innerOpen}
                            onClick={() => setOpenInner(innerOpen ? null : innerKey)}
                          >
                            <span aria-hidden="true">{innerOpen ? '▾' : '▸'}</span> {sub.label}
                            <span className="fields-related-type" style={typeColorStyle(subTarget.typeName)}>
                              {subTarget.label}
                            </span>
                          </button>
                          {innerOpen && (
                            <ul className="fields-related-list">
                              {subTarget.detailColumns.map((column) =>
                                fieldRow([edge.selectField!, sub.selectField!, column.field], column),
                              )}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                    {skippedLists > 0 && (
                      <p className="fields-related-note">
                        {skippedLists} further list{skippedLists === 1 ? '' : 's'} not offered: a list inside a list has
                        no single row meaning.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The truest type name available.
 *
 * `range` is the LinkML range the schema actually declares (`integer`, `CohortEnum`);
 * `kind` is the coarse bucket derivation collapses everything to. Prefer the former when
 * the endpoint advertises it — telling a user a field is "number" when the schema says
 * `integer` throws away the more useful fact.
 */
function typeLabel(column: ColumnModel): string {
  if (column.range) return column.range;
  return column.kind;
}

/** Whether the endpoint advertises an equality filter for this column. */
function canFilter(collection: CollectionModel, column: ColumnModel): boolean {
  const slot = column.slot ?? column.field;
  return collection.filterFields.some((f) => f === slot || f === column.field);
}
