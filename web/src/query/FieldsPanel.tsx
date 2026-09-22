import type { CollectionModel, ColumnModel } from '../data/schemaModel';
import { typeColorStyle } from '../data/typeColor';

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
}: {
  collection: CollectionModel;
  /** Slot/field names the current turn named — emphasis only, never a filter. */
  highlighted: ReadonlySet<string>;
  hiddenFields: ReadonlySet<string>;
  onAddFilter: (column: ColumnModel) => void;
  onToggleField: (field: string) => void;
  /** Column toggles are meaningless until there is a result table to apply them to. */
  showColumnToggles: boolean;
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
    </section>
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
