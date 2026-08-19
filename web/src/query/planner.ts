import type { Capabilities } from '../data/capabilities';
import type { FilterCondition, HippoSource } from '../data/hippoSource';
import type { CollectionModel } from '../data/schemaModel';
import { slotName } from '../data/schemaModel';
import type { FieldCondition, QuerySpec } from './querySpec';
import { deriveEdges, edgeByKey, filterOpMember } from './querySpec';

/**
 * The QuerySpec planner (ADR-0035): server-first execution with one declared
 * compensation tier. Field conditions compile to the flat typed `filters:`
 * list; RelatedConditions compile to a **server-assisted semijoin** — query
 * the related collection with the sub-criteria, collect the linking ids, and
 * filter the anchor with one native `in` — until the endpoint advertises
 * relationship predicates (Mosaic ADR-0006 M5), at which point only this
 * planner changes, never the artifact. Every cap is visible (ADR-0029).
 */

/** Semijoin id budget — one capped related-side page (ADR-0035, visible cap). */
export const SEMIJOIN_CAP = 500;

export interface QueryRunResult {
  rows: Record<string, unknown>[];
  total?: number;
  mayHaveMore: boolean;
  /** Honesty notes: caps hit, compensation tier, empty semijoins. */
  notes: string[];
  /** 'compensated' when any RelatedCondition ran as a client-planned semijoin. */
  relationshipTier: 'server' | 'compensated' | null;
  /** The compiled anchor conditions (for export page-through re-use). */
  anchorConditions: FilterCondition[];
  filterMode: 'AND' | 'OR';
}

function toFilterCondition(c: FieldCondition): FilterCondition {
  return {
    field: c.slot,
    value: c.value,
    op: c.op === 'eq' ? undefined : filterOpMember(c.op),
  };
}

export async function runQuerySpec(
  source: HippoSource,
  collections: CollectionModel[],
  capabilities: Capabilities,
  spec: QuerySpec,
  page: number,
  pageSize: number,
): Promise<QueryRunResult> {
  const anchor = collections.find((c) => c.id === spec.anchor);
  if (!anchor) throw new Error(`Unknown anchor collection “${spec.anchor}”`);
  const edges = deriveEdges(anchor, collections);
  const notes: string[] = [];
  let relationshipTier: QueryRunResult['relationshipTier'] = null;

  const anchorConditions: FilterCondition[] = [];
  for (const criterion of spec.criteria) {
    if (criterion.kind === 'field') {
      anchorConditions.push(toFilterCondition(criterion));
      continue;
    }

    // Compensated semijoin tier (ADR-0035): related-side query → id set →
    // one `in` condition on the anchor.
    const edge = edgeByKey(edges, criterion.edge);
    if (!edge) throw new Error(`Unknown relationship “${criterion.edge}”`);
    relationshipTier = 'compensated';
    const related = collections.find((c) => c.id === edge.relatedCollectionId);
    // Reverse edges extract linking ids from the related side's reference
    // column, which the curated table selection may not include — request it.
    const refColumn =
      edge.direction === 'reverse'
        ? related?.detailColumns.find((col) => col.field === edge.refField)
        : undefined;
    const relatedPage = await source.listEntities(edge.relatedCollectionId, {
      page: 1,
      pageSize: SEMIJOIN_CAP,
      conditions: criterion.criteria.map(toFilterCondition),
      filterMode: 'AND',
      extraColumns: refColumn ? [refColumn] : undefined,
    });

    const ids = new Set<string>();
    for (const row of relatedPage.rows) {
      const value =
        edge.direction === 'forward'
          ? // Anchor's reference points at the related row: link by its id.
            row[related?.idColumn ?? 'id']
          : // The related row's reference points back at the anchor.
            (row[edge.refField] as Record<string, unknown> | null)?.[edge.refTargetIdField];
      if (value != null) ids.add(String(value));
    }
    if (relatedPage.mayHaveMore) {
      notes.push(
        `Relationship criterion on ${edge.label} matched ≥${SEMIJOIN_CAP} related ` +
          `records — results may be incomplete (semijoin cap; server-side ` +
          `relationship predicates lift this).`,
      );
    }
    if (ids.size === 0) {
      notes.push(`Relationship criterion on ${edge.label} matched no related records.`);
    }
    anchorConditions.push({
      field: edge.direction === 'forward' ? slotName(edge.refField) : 'id',
      value: [...ids],
      op: 'IN',
    });
  }

  const result = await source.listEntities(anchor.id, {
    page,
    pageSize,
    conditions: anchorConditions,
    filterMode: spec.mode,
  });

  if (relationshipTier === 'compensated') {
    notes.push(
      'Relationship criteria ran as a client-planned semijoin (compensated tier) — ' +
        'exact but capped; the server does not advertise relationship predicates yet.',
    );
  }
  void capabilities;

  return {
    rows: result.rows,
    total: result.total,
    mayHaveMore: result.mayHaveMore,
    notes,
    relationshipTier,
    anchorConditions,
    filterMode: spec.mode,
  };
}
