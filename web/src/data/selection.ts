import type { CollectionModel, ColumnModel } from './schemaModel';
import { humanize } from './schemaModel';

/**
 * Path-addressed result columns and the GraphQL selection they compile to
 * (ADR-0041).
 *
 * A `ColumnSpec` in ADR-0041's sense is a path from the anchor: `['donor',
 * 'cohort']` reads the cohort of a Sample's Donor. Mosaic's references are
 * edge-only (its ADR-0005) — the raw foreign key is not a GraphQL field — so a
 * referenced value is reachable ONLY through a nested selection, which is why
 * this module exists at all rather than the table reading a flat row.
 *
 * The split ADR-0041 draws lives here: this file decides **what is fetched**
 * (traversal, and whether a to-many hop changes the grain). Which of the
 * fetched paths a reader currently sees is view state and is not this file's
 * business — hiding a column must never change the query.
 */

/** How a to-many hop resolves. `explode` is the only one that changes grain. */
export type ManyMode = 'count' | 'joinIds' | 'explode';

export interface PathColumn {
  /**
   * GraphQL field names from the anchor down to the leaf — the wire spelling
   * (`donor`, not `donor_id`), because this is a client-side projection
   * instruction that never travels as a filter. Length 1 is an anchor slot.
   */
  path: string[];
  /** The leaf column: carries kind/label/enumValues for rendering and export. */
  column: ColumnModel;
  /** Path-labelled for the header, e.g. "Donor → Cohort" (cross-class-query §8). */
  label: string;
  /**
   * Set when some hop on the path is to-many. `count` and `joinIds` keep anchor
   * grain; `explode` changes it, and ADR-0041 requires that be explicit and
   * stated on screen.
   */
  many?: { mode: ManyMode };
}

/** Depth cap: 2 hops, well inside Mosaic's `DEFAULT_MAX_QUERY_DEPTH` of 10. */
export const MAX_PATH_HOPS = 2;

interface SelectionNode {
  /** Scalar leaves selected at this level. */
  leaves: Set<string>;
  /** Nested object selections, keyed by GraphQL field name. */
  children: Map<string, SelectionNode>;
}

function emptyNode(): SelectionNode {
  return { leaves: new Set(), children: new Map() };
}

function refColumn(collection: CollectionModel, field: string): ColumnModel | undefined {
  return collection.detailColumns.find(
    (c) => c.field === field && (c.kind === 'ref' || c.kind === 'refList'),
  );
}

function targetOf(
  collection: CollectionModel,
  field: string,
  collections: CollectionModel[],
): CollectionModel | undefined {
  const ref = refColumn(collection, field);
  return ref?.targetType ? collections.find((c) => c.typeName === ref.targetType) : undefined;
}

/**
 * Merge every path into one selection tree.
 *
 * Merging is the point: two chosen donor fields must compile to
 * `donor { cohort ageAtDeath }`, not to two sibling `donor` selections, which
 * GraphQL would accept and the server would answer twice.
 */
export function buildSelectionTree(
  paths: PathColumn[],
  anchor: CollectionModel,
  collections: CollectionModel[],
): SelectionNode {
  const root = emptyNode();

  for (const { path } of paths) {
    if (path.length === 0 || path.length > MAX_PATH_HOPS + 1) continue;
    let node = root;
    let collection: CollectionModel | undefined = anchor;

    for (let i = 0; i < path.length - 1; i += 1) {
      const next: CollectionModel | undefined = collection && targetOf(collection, path[i], collections);
      // An unresolvable hop is dropped rather than guessed at: emitting a
      // nested selection for a field we cannot type would fail server-side
      // validation with a less legible error than simply not offering it.
      if (!next) { node = emptyNode(); break; }
      let child = node.children.get(path[i]);
      if (!child) {
        child = emptyNode();
        node.children.set(path[i], child);
        // Every nested object carries its own identifier. Row-click navigation,
        // `joinIds` and stable row keys all read it, and it is cheap.
        if (next.idColumn) child.leaves.add(next.idColumn);
      }
      node = child;
      collection = next;
    }

    const leaf = path[path.length - 1];
    const leafColumn = collection?.detailColumns.find((c) => c.field === leaf);
    if (leafColumn && (leafColumn.kind === 'ref' || leafColumn.kind === 'refList')) {
      // A reference chosen as a leaf (rendered as its id, or joined for
      // `joinIds`) still needs an object selection — there is no scalar to ask
      // for under edge-only emission.
      const child = node.children.get(leaf) ?? emptyNode();
      if (leafColumn.targetIdField) child.leaves.add(leafColumn.targetIdField);
      node.children.set(leaf, child);
    } else {
      node.leaves.add(leaf);
    }
  }
  return root;
}

export function renderSelection(node: SelectionNode): string {
  const parts = [...node.leaves];
  for (const [field, child] of node.children) {
    parts.push(`${field} { ${renderSelection(child)} }`);
  }
  return parts.join(' ');
}

/** The extra selection a set of paths needs beyond the anchor's own columns. */
export function selectionForPaths(
  paths: PathColumn[],
  anchor: CollectionModel,
  collections: CollectionModel[],
): string {
  return renderSelection(buildSelectionTree(paths, anchor, collections));
}

/**
 * Read a path out of a row, following nested objects. `undefined` when any hop
 * is absent — which a masked field or an unset reference both produce, and
 * which the caller renders as "—" rather than an error (ADR-0029).
 */
export function valueAtPath(row: Record<string, unknown>, path: string[]): unknown {
  let value: unknown = row;
  for (const segment of path) {
    if (value == null || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

/** "Donor → Cohort": the path made legible, per cross-class-query.md §8. */
export function pathLabel(
  path: string[],
  anchor: CollectionModel,
  collections: CollectionModel[],
): string {
  const parts: string[] = [];
  let collection: CollectionModel | undefined = anchor;
  for (let i = 0; i < path.length - 1; i += 1) {
    const ref = collection && refColumn(collection, path[i]);
    parts.push(ref?.targetType ? humanize(ref.targetType) : humanize(path[i]));
    collection = collection && targetOf(collection, path[i], collections);
  }
  const leaf = collection?.detailColumns.find((c) => c.field === path[path.length - 1]);
  parts.push(leaf?.label ?? humanize(path[path.length - 1]));
  return parts.join(' → ');
}

/**
 * One row of the rendered table. `values` is keyed by `pathKey`, already read
 * through every hop, so the renderer does no traversal of its own.
 */
export interface DisplayRow {
  key: string;
  values: Record<string, unknown>;
  /** The anchor entity's id — row-click navigation always targets the anchor. */
  anchorId?: string;
}

export interface FlattenResult {
  rows: DisplayRow[];
  /**
   * Set only when a path exploded. ADR-0041 requires the grain change be
   * stated wherever the rows are: a total that counts anchors sitting above a
   * table that counts pairs is a lie about what the reader is looking at.
   */
  grain?: { anchorCount: number; rowCount: number; edgeLabel: string };
}

export function pathKey(path: string[]): string {
  return path.join('.');
}

/**
 * Anchor rows → display rows, applying each to-many path's declared mode.
 *
 * `count` and `joinIds` keep anchor grain. `explode` does not: one display row
 * per member of the exploded path, with the anchor's own values repeated down
 * the block — the repetition the feature exists to produce.
 *
 * **At most one path may explode** (v1 cap, ADR-0041). Two exploded to-many
 * paths is a cartesian product with no user model behind it, so a second one
 * is ignored rather than silently multiplying the row count.
 */
export function flattenRows(
  rows: Record<string, unknown>[],
  columns: PathColumn[],
  anchorIdField?: string,
): FlattenResult {
  const exploded = columns.find((c) => c.many?.mode === 'explode');
  const explodePath = exploded ? exploded.path.slice(0, -1) : null;

  const read = (row: Record<string, unknown>, column: PathColumn): unknown => {
    const value = valueAtPath(row, column.path);
    if (!column.many || column.many.mode === 'explode') return value;
    // A to-many path kept at anchor grain resolves to a scalar summary. The
    // members are already in hand, so neither mode costs a round trip.
    const members = valueAtPath(row, column.path.slice(0, -1));
    const list = Array.isArray(members) ? members : [];
    if (column.many.mode === 'count') return list.length;
    const leaf = column.path[column.path.length - 1];
    return list
      .map((m) => (m as Record<string, unknown>)?.[leaf])
      .filter((v) => v != null)
      .join('; ');
  };

  const out: DisplayRow[] = [];
  for (const [i, row] of rows.entries()) {
    const anchorId = anchorIdField ? row[anchorIdField] : undefined;
    const baseKey = anchorId != null ? String(anchorId) : `row-${i}`;

    if (!explodePath) {
      out.push({
        key: baseKey,
        anchorId: anchorId == null ? undefined : String(anchorId),
        values: Object.fromEntries(columns.map((c) => [pathKey(c.path), read(row, c)])),
      });
      continue;
    }

    const members = valueAtPath(row, explodePath);
    const list = Array.isArray(members) ? members : [];
    // An anchor with no members still gets one row. Dropping it would silently
    // turn an explode into a filter — the table would stop agreeing with the
    // result total for a reason nothing on screen explains.
    const slots = list.length > 0 ? list : [null];

    slots.forEach((member, m) => {
      const values: Record<string, unknown> = {};
      for (const column of columns) {
        const onExplodedPath =
          column.many?.mode === 'explode' &&
          pathKey(column.path.slice(0, -1)) === pathKey(explodePath);
        if (onExplodedPath) {
          const rest = column.path.slice(explodePath.length);
          values[pathKey(column.path)] =
            member == null ? undefined : valueAtPath(member as Record<string, unknown>, rest);
        } else {
          values[pathKey(column.path)] = read(row, column);
        }
      }
      // Composite key: the anchor id alone collides across exploded siblings.
      out.push({ key: `${baseKey}#${m}`, anchorId: anchorId == null ? undefined : String(anchorId), values });
    });
  }

  if (!exploded) return { rows: out };
  return {
    rows: out,
    grain: { anchorCount: rows.length, rowCount: out.length, edgeLabel: exploded.label },
  };
}
