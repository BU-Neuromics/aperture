import type { CollectionModel } from '../data/schemaModel';
import type { ManyMode, PathColumn } from '../data/selection';
import { pathLabel } from '../data/selection';
import { deriveEdges } from './querySpec';

/**
 * The `cols` URL parameter (ADR-0041 sub-question, aperture#73).
 *
 * Both halves of the column control ride one parameter, because a shared link
 * has to reproduce both: the *query* half (which traversals, and each one's
 * grain) and the *view* half (which anchor fields are hidden). They stay
 * separate keys here so each can graduate to its own artifact without a
 * migration -- ADR-0041's 2026-09-25 correction: the two separate when either
 * half first needs to persist.
 *
 * Schema-unaware on purpose, like the `qs` validator: nuqs calls it with no app
 * context. Resolution against the schema happens in `decodeColumns`.
 */
export interface ColumnsParam {
  /** Chosen traversals: GraphQL field path from the anchor, plus grain for to-many. */
  paths?: { path: string[]; mode?: ManyMode }[];
  /**
   * Anchor fields the reader hid. A HIDE set, not a show set: an anchor field
   * added to the schema later must still show by default.
   */
  hidden?: string[];
}

const MODES: readonly string[] = ['count', 'joinIds', 'explode'];

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

export function validateColumnsShape(value: unknown): ColumnsParam {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) {
    throw new Error('not a columns spec');
  }
  const { paths, hidden } = value as Record<string, unknown>;
  if (hidden !== undefined && !isStringArray(hidden)) throw new Error('hidden must be strings');
  if (paths !== undefined) {
    if (!Array.isArray(paths)) throw new Error('paths must be a list');
    for (const p of paths) {
      const entry = p as { path?: unknown; mode?: unknown };
      if (typeof p !== 'object' || p == null || !isStringArray(entry.path) || entry.path.length === 0) {
        throw new Error('bad path entry');
      }
      if (entry.mode !== undefined && !MODES.includes(entry.mode as string)) {
        throw new Error('bad mode');
      }
    }
  }
  return value as ColumnsParam;
}

/** `null` when there is nothing to carry, so the default state leaves the URL clean. */
export function encodeColumns(
  pathColumns: PathColumn[],
  hiddenFields: ReadonlySet<string>,
): ColumnsParam | null {
  const out: ColumnsParam = {};
  if (pathColumns.length > 0) {
    out.paths = pathColumns.map((c) => (c.many ? { path: c.path, mode: c.many.mode } : { path: c.path }));
  }
  if (hiddenFields.size > 0) out.hidden = [...hiddenFields].sort();
  return out.paths || out.hidden ? out : null;
}

/**
 * Resolve a decoded parameter against the live schema.
 *
 * Anything that no longer resolves -- a renamed field, a gated reverse edge, a
 * hidden field the anchor lost -- is dropped rather than guessed at, so a stale
 * link degrades to fewer columns and not to a failed query (ADR-0029). Only
 * single-hop traversals are produced, which is all the picker offers.
 */
export function decodeColumns(
  param: ColumnsParam | null | undefined,
  anchor: CollectionModel | undefined,
  collections: CollectionModel[],
): { pathColumns: PathColumn[]; hiddenFields: Set<string> } {
  const empty = { pathColumns: [] as PathColumn[], hiddenFields: new Set<string>() };
  if (!param || !anchor) return empty;

  const hiddenFields = new Set((param.hidden ?? []).filter((f) => anchor.columns.some((c) => c.field === f)));
  const edges = deriveEdges(anchor, collections);
  const pathColumns: PathColumn[] = [];
  const seen = new Set<string>();
  let exploded = false;

  for (const { path, mode } of param.paths ?? []) {
    if (path.length !== 2 || seen.has(path.join('.'))) continue;
    const edge = edges.find((e) => e.selectField === path[0]);
    const related = edge && collections.find((c) => c.id === edge.relatedCollectionId);
    const column = related?.detailColumns.find((c) => c.field === path[1]);
    if (!edge || !column) continue;
    seen.add(path.join('.'));

    // A to-one edge has no grain choice; a to-many one defaults to `count`
    // (never `explode`), and at most one path may explode (ADR-0041 v1 cap).
    let many: PathColumn['many'];
    if (edge.toMany) {
      let m: ManyMode = mode ?? 'count';
      if (m === 'explode') {
        if (exploded) m = 'count';
        exploded = true;
      }
      many = { mode: m, edgeLabel: edge.label };
    }
    pathColumns.push({ path, column, label: pathLabel(path, anchor, collections), many });
  }
  return { pathColumns, hiddenFields };
}
