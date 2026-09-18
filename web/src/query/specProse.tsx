import type { CollectionModel } from '../data/schemaModel';
import { humanize, slotName } from '../data/schemaModel';
import type { Criterion, QueryOp, QuerySpec } from './querySpec';
import { deriveEdges, edgeByKey, resolveAnchor } from './querySpec';

/**
 * Reading a `QuerySpec` back as language.
 *
 * The builder is an *editor* — its clauses are `<select>`s — so there was no
 * read-only rendering of the artifact anywhere. Any surface that receives a
 * spec rather than composing one (the conversational panel today; saved-view
 * previews or a diff later) needs to show what it says, and it must say it in
 * the builder's own words or the app speaks two dialects of one artifact.
 * Hence the shared vocabulary below: `OP_LABELS` lives here and the builder
 * imports it, rather than each surface keeping its own copy.
 *
 * Derivation is separated from rendering so the wording is testable without a
 * DOM, and so an unresolvable name degrades as data (`resolved: false`) rather
 * than as a broken render — a spec from a planner that spells anchors by
 * schema type will not resolve against collection ids, and saying so plainly
 * is the point.
 */

/** Operator vocabulary shared by every surface that shows a criterion. */
export const OP_LABELS: Record<QueryOp, string> = {
  eq: 'is',
  neq: 'is not',
  in: 'is any of',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  contains: 'contains',
  is_null: 'is empty',
};

export interface ProseCondition {
  /** Field label, humanized when the schema offers no better. */
  field: string;
  op: string;
  /** Rendered operand; empty when the operator carries the whole meaning. */
  value: string;
  /** False when the slot resolved to nothing on the anchor's own columns. */
  resolved: boolean;
}

export interface ProseClause {
  kind: 'field' | 'related';
  /** Related only: "having at least one" / "having no". */
  lead?: string;
  /** Related only: the edge's label. */
  target?: string;
  /** Related only: false when the edge key resolved to nothing. */
  targetResolved?: boolean;
  conditions: ProseCondition[];
}

export interface ProseSpec {
  anchor: string;
  /** False when the anchor names nothing this endpoint exposes. */
  anchorResolved: boolean;
  combinator: 'all of' | 'any of';
  clauses: ProseClause[];
}

function renderValue(op: QueryOp, value: unknown): string {
  if (op === 'is_null') return '';
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function conditionProse(
  slot: string,
  op: QueryOp,
  value: unknown,
  on: CollectionModel | undefined,
): ProseCondition {
  const column = on?.detailColumns.find((c) => slotName(c.field) === slot || c.field === slot);
  return {
    field: column?.label ?? humanize(slot),
    op: OP_LABELS[op] ?? op,
    value: renderValue(op, value),
    resolved: column != null,
  };
}

/** The spec as structured language — no JSX, so the wording is unit-testable. */
export function specProse(spec: QuerySpec, collections: readonly CollectionModel[]): ProseSpec {
  const anchor = resolveAnchor(spec, [...collections]);
  const edges = anchor ? deriveEdges(anchor, [...collections]) : [];

  const clauses = (spec.criteria ?? []).map((criterion: Criterion): ProseClause => {
    if (criterion.kind === 'field') {
      return {
        kind: 'field',
        conditions: [conditionProse(criterion.slot, criterion.op, criterion.value, anchor)],
      };
    }
    const edge = edgeByKey(edges, criterion.edge);
    const related = edge
      ? collections.find((c) => c.id === edge.relatedCollectionId)
      : undefined;
    return {
      kind: 'related',
      lead: criterion.quantifier === 'none' ? 'having no' : 'having at least one',
      target: edge?.label ?? criterion.edge,
      targetResolved: edge != null,
      conditions: (criterion.criteria ?? []).map((c) =>
        conditionProse(c.slot, c.op, c.value, related),
      ),
    };
  });

  return {
    anchor: anchor?.label ?? spec.anchor,
    anchorResolved: anchor != null,
    combinator: spec.mode === 'OR' ? 'any of' : 'all of',
    clauses,
  };
}

/**
 * The artifact, read back. Values and unresolved names render in mono — the
 * type split carries meaning here: prose is prose, and anything that is a
 * literal from the schema or the data looks like one.
 */
export function SpecProse({
  spec,
  collections,
}: {
  spec: QuerySpec;
  collections: readonly CollectionModel[];
}) {
  const prose = specProse(spec, collections);
  return (
    <div className="prose-spec" data-testid="spec-prose">
      <p className="prose-lead">
        <span className="prose-keyword">Rows are</span>{' '}
        <span className={prose.anchorResolved ? 'prose-anchor' : 'prose-anchor prose-unresolved'}>
          {prose.anchor}
        </span>
        {prose.clauses.length > 0 && (
          <>
            {' '}
            <span className="prose-keyword">matching {prose.combinator}</span>
          </>
        )}
      </p>
      {prose.clauses.length === 0 ? (
        <p className="prose-note">No filters yet — every record of this type.</p>
      ) : (
        <ul className="prose-clauses">
          {prose.clauses.map((clause, i) => (
            <li key={i} className="prose-clause">
              {clause.kind === 'related' ? (
                <>
                  <span className="prose-keyword">{clause.lead}</span>{' '}
                  <span className={clause.targetResolved ? 'prose-edge' : 'prose-edge prose-unresolved'}>
                    {clause.target}
                  </span>
                  {clause.conditions.length > 0 && (
                    <ul className="prose-subclauses">
                      {clause.conditions.map((c, j) => (
                        <li key={j}>
                          <Condition condition={c} />
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <Condition condition={clause.conditions[0]!} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Condition({ condition }: { condition: ProseCondition }) {
  return (
    <>
      <span className={condition.resolved ? 'prose-field' : 'prose-field prose-unresolved'}>
        {condition.field}
      </span>{' '}
      <span className="prose-op">{condition.op}</span>
      {condition.value && <span className="prose-value">{condition.value}</span>}
    </>
  );
}
