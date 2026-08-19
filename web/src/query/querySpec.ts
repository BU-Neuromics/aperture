import type { Capabilities } from '../data/capabilities';
import type { CollectionModel } from '../data/schemaModel';
import { humanize, slotName } from '../data/schemaModel';

/**
 * The QuerySpec noun (ADR-0035): a typed, serializable, introspection-
 * validated cross-class query artifact. This MVP carries the anchor, one
 * criteria group (AND/OR) of field conditions and quantified relationship
 * conditions, and rides the URL (`qs`). Nested criteria groups arrive with
 * the typed `where:` planner tier (Mosaic ADR-0006 inc. 2+); columns/sort
 * arrive with server aggregation (Mosaic ADR-0007). The artifact never
 * changes shape when the server upgrades — only the planner does.
 */

/** Operator vocabulary (slot names, matching Mosaic's SDK ops). */
export type QueryOp =
  | 'eq'
  | 'neq'
  | 'in'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'is_null';

/** SDK op → the endpoint's FilterOp enum member name. */
export function filterOpMember(op: QueryOp): string {
  return op.toUpperCase();
}

export interface FieldCondition {
  kind: 'field';
  /** LinkML slot name — never the camelCase rename (ADR-0035). */
  slot: string;
  op: QueryOp;
  value: unknown;
}

export interface RelatedCondition {
  kind: 'related';
  /** A derived edge key (see QueryEdge.key). */
  edge: string;
  /** "having ≥1" / "having exactly 0" related records (ADR-0035). */
  quantifier: 'some' | 'none';
  /** Conditions holding on the SAME related record (AND, flat in the MVP). */
  criteria: FieldCondition[];
}

export type Criterion = FieldCondition | RelatedCondition;

export interface QuerySpec {
  v: 1;
  /** The anchor collection id (list field) — a result row IS one of these. */
  anchor: string;
  /** Combinator across the top-level criteria. */
  mode: 'AND' | 'OR';
  criteria: Criterion[];
}

export function emptyQuerySpec(anchor: string): QuerySpec {
  return { v: 1, anchor, mode: 'AND', criteria: [] };
}

/** Shape guard for the `qs` URL parameter (nuqs parseAsJson validator). */
export function validateQuerySpecShape(value: unknown): QuerySpec {
  const spec = value as QuerySpec;
  if (
    typeof spec !== 'object' ||
    spec == null ||
    spec.v !== 1 ||
    typeof spec.anchor !== 'string' ||
    (spec.mode !== 'AND' && spec.mode !== 'OR') ||
    !Array.isArray(spec.criteria)
  ) {
    throw new Error('not a QuerySpec');
  }
  return spec;
}

/**
 * A relationship edge the anchor can traverse for a RelatedCondition,
 * derived entirely from the introspected collections (ADR-0002):
 *
 * - forward: the anchor has a resolved reference column pointing at the
 *   related type ("Sample → its Donor");
 * - reverse: another collection has a resolved reference column pointing at
 *   the anchor's type ("Donors having Samples where …").
 */
export interface QueryEdge {
  key: string;
  label: string;
  direction: 'forward' | 'reverse';
  /** The collection queried for the semijoin (the related side). */
  relatedCollectionId: string;
  /** The reference column field name on whichever side holds the reference. */
  refField: string;
  refTargetIdField: string;
}

export function deriveEdges(
  anchor: CollectionModel,
  collections: CollectionModel[],
): QueryEdge[] {
  const edges: QueryEdge[] = [];
  const byType = (typeName: string) => collections.find((c) => c.typeName === typeName);

  // Scan the FULL derivable field set (detailColumns): resolved reference
  // edges sit after the computed fields in Mosaic's generated types, so the
  // curated table budget (columns) routinely truncates them away.
  for (const column of anchor.detailColumns) {
    if (column.kind !== 'ref' || !column.targetType || !column.targetIdField) continue;
    const related = byType(column.targetType);
    if (!related) continue;
    edges.push({
      key: `fwd:${column.field}`,
      label: `${humanize(column.targetType)} (its ${column.label.toLowerCase()})`,
      direction: 'forward',
      relatedCollectionId: related.id,
      refField: column.field,
      refTargetIdField: column.targetIdField,
    });
  }

  for (const other of collections) {
    if (other.id === anchor.id) continue;
    for (const column of other.detailColumns) {
      if (column.kind !== 'ref' || column.targetType !== anchor.typeName) continue;
      if (!column.targetIdField) continue;
      edges.push({
        key: `rev:${other.id}.${column.field}`,
        label: `${other.label} (their ${column.label.toLowerCase()})`,
        direction: 'reverse',
        relatedCollectionId: other.id,
        refField: column.field,
        refTargetIdField: column.targetIdField,
      });
    }
  }
  return edges;
}

export function edgeByKey(edges: QueryEdge[], key: string): QueryEdge | undefined {
  return edges.find((e) => e.key === key);
}

/** The operator set a slot kind supports (mirrors Mosaic ADR-0006). */
export function opsForKind(kind: string): QueryOp[] {
  switch (kind) {
    case 'number':
      return ['eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte', 'is_null'];
    case 'date':
      return ['eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte', 'is_null'];
    case 'boolean':
      return ['eq', 'neq', 'is_null'];
    case 'enum':
      return ['eq', 'neq', 'in', 'is_null'];
    case 'ref':
    case 'id':
      return ['eq', 'neq', 'in', 'is_null'];
    default:
      return ['eq', 'neq', 'in', 'contains', 'is_null'];
  }
}

/** A filterable slot on a collection: slot name + display metadata. */
export interface FilterSlot {
  slot: string;
  label: string;
  kind: string;
  enumValues?: readonly string[];
}

/**
 * Mosaic's read-time computed fields (provenance-derived, sec9 §9.7) plus its
 * envelope fields: exposed on entity types but never filterable — the server
 * rejects them with a coded UNFILTERABLE_FIELD (mosaic#149), so the builder
 * never offers them. Temporal queries go through `asOf`, not filters.
 */
const COMPUTED_UNFILTERABLE = new Set([
  'version',
  'created_at',
  'updated_at',
  'schema_version',
  'created_by',
  'updated_by',
  'superseded_by',
]);

/**
 * The filterable slots of a collection, with kinds resolved by matching the
 * filter-input slot names back to the entity columns (slot → camelCase).
 */
export function filterSlots(collection: CollectionModel): FilterSlot[] {
  const byName = new Map(collection.detailColumns.map((c) => [slotName(c.field), c]));
  return collection.filterFields
    .filter((slot) => !COMPUTED_UNFILTERABLE.has(slot))
    .map((slot) => {
      const column = byName.get(slot) ?? byName.get(slot.replace(/_id$/, ''));
      return {
        slot,
        label: column?.label ?? humanize(slot),
        kind: column?.kind ?? 'text',
        enumValues: column?.enumValues,
      };
    });
}

export interface ValidationResult {
  errors: string[];
  /** Honest capability notes (features gated off) — not failures. */
  warnings: string[];
}

/**
 * Total, introspection-driven validation (ADR-0035): every anchor, slot, op,
 * and edge is checked against what the endpoint actually advertises. A spec
 * that validates cleanly compiles to queries the endpoint accepts.
 */
export function validateQuerySpec(
  spec: QuerySpec,
  collections: CollectionModel[],
  capabilities: Capabilities,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const anchor = collections.find((c) => c.id === spec.anchor);
  if (!anchor) {
    return { errors: [`Unknown anchor collection “${spec.anchor}”.`], warnings };
  }
  if (!anchor.args.filter) {
    errors.push(`${anchor.label} advertises no filter argument.`);
  }
  if (spec.mode === 'OR' && !anchor.filterModeArg) {
    errors.push('OR groups need the FilterMode combinator, which this endpoint does not advertise.');
  }
  const ops = new Set(capabilities.filterOps);
  const edges = deriveEdges(anchor, collections);

  const checkField = (c: FieldCondition, on: CollectionModel, where: string) => {
    const slots = filterSlots(on);
    const slot = slots.find((s) => s.slot === c.slot);
    if (!slot) {
      errors.push(`${where}: “${c.slot}” is not filterable on ${on.label}.`);
      return;
    }
    if (!opsForKind(slot.kind).includes(c.op)) {
      errors.push(`${where}: ${slot.label} (${slot.kind}) does not support “${c.op}”.`);
    }
    if (!ops.has(filterOpMember(c.op))) {
      warnings.push(
        `${where}: the endpoint does not advertise the “${c.op}” operator yet — gated off.`,
      );
      errors.push(`${where}: operator “${c.op}” is not available on this endpoint.`);
    }
    if (c.op === 'in' && !Array.isArray(c.value)) {
      errors.push(`${where}: “in” takes a list of values.`);
    } else if (c.op === 'is_null' && typeof c.value !== 'boolean') {
      errors.push(`${where}: “is_null” takes true/false.`);
    } else if (c.op !== 'is_null' && (c.value == null || c.value === '')) {
      errors.push(`${where}: missing a value.`);
    }
  };

  spec.criteria.forEach((criterion, i) => {
    const where = `Criterion ${i + 1}`;
    if (criterion.kind === 'field') {
      checkField(criterion, anchor, where);
      return;
    }
    const edge = edgeByKey(edges, criterion.edge);
    if (!edge) {
      errors.push(`${where}: unknown relationship “${criterion.edge}”.`);
      return;
    }
    if (criterion.quantifier === 'none') {
      errors.push(
        `${where}: “having none” needs server-side relationship predicates ` +
          `(Mosaic ADR-0006 M5) — not yet advertised by this endpoint.`,
      );
    }
    if (!ops.has('IN')) {
      errors.push(
        `${where}: relationship criteria compensate through the “in” operator, ` +
          `which this endpoint does not advertise.`,
      );
    }
    const related = collections.find((c) => c.id === edge.relatedCollectionId);
    if (!related) {
      errors.push(`${where}: related collection “${edge.relatedCollectionId}” is gone.`);
      return;
    }
    criterion.criteria.forEach((sub) => checkField(sub, related, `${where} → ${related.label}`));
  });

  return { errors, warnings };
}
