import type { CollectionModel, WhereField } from '../data/schemaModel';
import { slotName } from '../data/schemaModel';
import type { Criterion, FieldCondition, QuerySpec, QueryOp } from './querySpec';

/**
 * Compile a `QuerySpec` into Mosaic's typed `where:` input (its ADR-0006).
 *
 * The planner has been compiling to the flat `[FilterInput!]` list and running
 * every `RelatedCondition` through a capped client-side semijoin, while the
 * certified endpoint has advertised the full typed contract — per-slot
 * operator objects, `and`/`or`/`not`, and relationship quantifiers — since
 * v0.13.0. This is the compiler that uses it.
 *
 * Nothing here decides *whether* to use it: that is the planner's, keyed on
 * whether the collection advertises a `where` argument at all (ADR-0029 —
 * capabilities are schema features, never assumptions).
 */

export type WhereInput = Record<string, unknown>;

/** SDK op → the operator member name on a `<Scalar>FilterOps` input. */
const OP_MEMBERS: Record<QueryOp, string> = {
  eq: 'eq',
  neq: 'neq',
  in: 'in',
  gt: 'gt',
  gte: 'gte',
  lt: 'lt',
  lte: 'lte',
  contains: 'contains',
  is_null: 'isNull',
};

export interface CompileResult {
  where: WhereInput | null;
  /**
   * Criteria this endpoint's typed input cannot express, left for the caller to
   * compensate or gate. Empty on a fully-compiled spec.
   */
  uncompiled: Criterion[];
}

/** Find the filter-input field for a LinkML slot name, tolerating the rename. */
function whereFieldFor(
  collection: CollectionModel,
  slot: string,
): WhereField | undefined {
  const fields = collection.whereFields;
  if (!fields) return undefined;
  const direct = fields[slot];
  if (direct) return direct;
  // The QuerySpec speaks LinkML slot names; the input's fields are the
  // camelCase renames. Match by normalizing the input side, never by
  // camelizing the slot — `history_of_rhi` and `historyOfRHI` would not agree.
  return Object.values(fields).find((f) => slotName(f.field) === slot);
}

function compileField(
  condition: FieldCondition,
  collection: CollectionModel,
): WhereInput | null {
  const field = whereFieldFor(collection, condition.slot);
  if (!field || field.kind !== 'ops') return null;
  const member = OP_MEMBERS[condition.op];
  // Offered operators are read off the input type, so an endpoint that does not
  // advertise `contains` for a slot simply cannot be asked for it.
  if (!field.ops?.includes(member)) return null;
  return { [field.field]: { [member]: condition.value } };
}

function compileCriterion(
  criterion: Criterion,
  collection: CollectionModel,
  collections: CollectionModel[],
): WhereInput | null {
  if (criterion.kind === 'field') return compileField(criterion, collection);

  const field = whereFieldFor(collection, criterion.edge);
  if (!field) return null;

  const relatedTypeName = field.inputType.replace(/(EdgeQuantifiers|Filter)$/, '');
  const related = collections.find((c) => c.typeName === relatedTypeName);
  if (!related) return null;

  const subs = criterion.criteria
    .map((sub) => compileField(sub, related))
    .filter((w): w is WhereInput => w != null);
  if (subs.length !== criterion.criteria.length) return null;
  const inner: WhereInput = subs.length === 1 ? subs[0] : { and: subs };

  if (field.kind === 'quantifiers') {
    return { [field.field]: { [criterion.quantifier]: inner } };
  }
  if (field.kind === 'nested' && criterion.quantifier === 'some') {
    // A to-one reference takes the target's filter directly — `some` over a
    // single target IS the nested filter. `none` has no such reading here
    // (it would mean "the reference is unset or fails", which the input cannot
    // say), so it is left uncompiled rather than approximated.
    return { [field.field]: inner };
  }
  return null;
}

/**
 * Compile the whole spec. Returns `where: null` when nothing compiled, so the
 * caller can fall through to the flat list rather than send an empty object.
 */
export function compileWhere(
  spec: QuerySpec,
  anchor: CollectionModel,
  collections: CollectionModel[],
): CompileResult {
  if (!anchor.whereFields) return { where: null, uncompiled: [...spec.criteria] };

  const compiled: WhereInput[] = [];
  const uncompiled: Criterion[] = [];
  for (const criterion of spec.criteria) {
    const one = compileCriterion(criterion, anchor, collections);
    if (one) compiled.push(one);
    else uncompiled.push(criterion);
  }

  if (compiled.length === 0) return { where: null, uncompiled };
  if (compiled.length === 1 && spec.mode === 'AND') return { where: compiled[0], uncompiled };
  return { where: { [spec.mode.toLowerCase()]: compiled }, uncompiled };
}

/** Whether a relationship criterion can ride the server for this anchor. */
export function supportsRelationship(
  anchor: CollectionModel,
  edge: string,
  quantifier: 'some' | 'none',
): boolean {
  const field = whereFieldFor(anchor, edge);
  if (!field) return false;
  if (field.kind === 'quantifiers') return true;
  return field.kind === 'nested' && quantifier === 'some';
}
