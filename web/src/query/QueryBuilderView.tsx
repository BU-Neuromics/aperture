import { useCallback, useEffect, useMemo, useState } from 'react';
import type { HippoSource } from '../data/hippoSource';
import type { CollectionModel } from '../data/schemaModel';
import { renderCell, isRightAligned } from '../features/collections/cells';
import { useCollectionUrlState } from '../features/collections/urlState';
import { downloadFile, toCSV, toJSONExport } from '../features/collections/export';
import type { QueryRunResult } from './planner';
import { runQuerySpec, SEMIJOIN_CAP } from './planner';
import type {
  Criterion,
  FieldCondition,
  FilterSlot,
  QueryEdge,
  QueryOp,
  QuerySpec,
  RelatedCondition,
} from './querySpec';
import {
  deriveEdges,
  emptyQuerySpec,
  filterSlots,
  opsForKind,
  filterOpMember,
  validateQuerySpec,
} from './querySpec';
import './query.css';

/**
 * The cross-class query builder (ADR-0035): anchor picker, criteria rows
 * (field / operator / value, offered per slot kind AND per the endpoint's
 * introspected FilterOp vocabulary), and Atlas-idiom relationship criteria
 * ("having at least one … where …"). The QuerySpec artifact lives in the URL;
 * Run compiles it through the planner (server-first, semijoin compensation).
 */

const OP_LABELS: Record<QueryOp, string> = {
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

const PAGE_SIZE = 25;
const EXPORT_CAP = 5000;
const EXPORT_PAGE_SIZE = 100;

function availableOps(slot: FilterSlot, advertised: readonly string[]): QueryOp[] {
  const server = new Set(advertised);
  return opsForKind(slot.kind).filter((op) => server.has(filterOpMember(op)));
}

function coerceValue(slot: FilterSlot, op: QueryOp, raw: string): unknown {
  if (op === 'is_null') return raw === 'true';
  if (op === 'in') {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '');
    return slot.kind === 'number' ? parts.map(Number) : parts;
  }
  if (slot.kind === 'number') return raw === '' ? '' : Number(raw);
  if (slot.kind === 'boolean') return raw === 'true';
  return raw;
}

function rawValue(condition: FieldCondition): string {
  if (condition.op === 'in' && Array.isArray(condition.value)) {
    return condition.value.join(', ');
  }
  return condition.value == null ? '' : String(condition.value);
}

function ConditionEditor({
  condition,
  slots,
  advertisedOps,
  onChange,
  onRemove,
}: {
  condition: FieldCondition;
  slots: FilterSlot[];
  advertisedOps: readonly string[];
  onChange: (next: FieldCondition) => void;
  onRemove: () => void;
}) {
  const slot = slots.find((s) => s.slot === condition.slot) ?? slots[0];
  const ops = slot ? availableOps(slot, advertisedOps) : [];

  const setSlot = (name: string) => {
    const next = slots.find((s) => s.slot === name);
    if (!next) return;
    const nextOps = availableOps(next, advertisedOps);
    const op = nextOps.includes(condition.op) ? condition.op : (nextOps[0] ?? 'eq');
    onChange({ ...condition, slot: name, op, value: op === 'is_null' ? true : '' });
  };
  const setOp = (op: QueryOp) =>
    onChange({ ...condition, op, value: op === 'is_null' ? true : condition.value });

  return (
    <div className="query-condition" data-testid="query-condition">
      <select
        aria-label="Field"
        className="query-select"
        value={condition.slot}
        onChange={(e) => setSlot(e.target.value)}
      >
        {slots.map((s) => (
          <option key={s.slot} value={s.slot}>
            {s.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Operator"
        className="query-select"
        value={condition.op}
        onChange={(e) => setOp(e.target.value as QueryOp)}
      >
        {ops.map((op) => (
          <option key={op} value={op}>
            {OP_LABELS[op]}
          </option>
        ))}
      </select>
      {condition.op === 'is_null' || slot?.kind === 'boolean' ? (
        <select
          aria-label="Value"
          className="query-select"
          value={String(condition.value)}
          onChange={(e) =>
            onChange({ ...condition, value: coerceValue(slot!, condition.op, e.target.value) })
          }
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : slot?.kind === 'enum' && condition.op !== 'in' ? (
        <select
          aria-label="Value"
          className="query-select"
          value={String(condition.value)}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
        >
          <option value="">…</option>
          {(slot.enumValues ?? []).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      ) : (
        <input
          aria-label="Value"
          className="query-input"
          placeholder={condition.op === 'in' ? 'value, value, …' : 'value'}
          value={rawValue(condition)}
          onChange={(e) =>
            onChange({ ...condition, value: coerceValue(slot!, condition.op, e.target.value) })
          }
        />
      )}
      <button type="button" className="query-remove" aria-label="Remove criterion" onClick={onRemove}>
        ×
      </button>
    </div>
  );
}

function RelatedEditor({
  condition,
  edges,
  collections,
  advertisedOps,
  onChange,
  onRemove,
}: {
  condition: RelatedCondition;
  edges: QueryEdge[];
  collections: CollectionModel[];
  advertisedOps: readonly string[];
  onChange: (next: RelatedCondition) => void;
  onRemove: () => void;
}) {
  const edge = edges.find((e) => e.key === condition.edge);
  const related = edge && collections.find((c) => c.id === edge.relatedCollectionId);
  const relatedSlots = related ? filterSlots(related) : [];

  return (
    <div className="query-related" data-testid="query-related">
      <div className="query-condition">
        <span className="query-keyword">having</span>
        <select
          aria-label="Quantifier"
          className="query-select"
          value={condition.quantifier}
          onChange={(e) =>
            onChange({ ...condition, quantifier: e.target.value as 'some' | 'none' })
          }
        >
          <option value="some">at least one</option>
          <option value="none" disabled title="Needs server-side relationship predicates (Mosaic ADR-0006 M5)">
            exactly zero (gated)
          </option>
        </select>
        <select
          aria-label="Relationship"
          className="query-select"
          value={condition.edge}
          onChange={(e) => onChange({ ...condition, edge: e.target.value, criteria: [] })}
        >
          {edges.map((e) => (
            <option key={e.key} value={e.key}>
              {e.label}
            </option>
          ))}
        </select>
        <span className="query-keyword">where</span>
        <button type="button" className="query-remove" aria-label="Remove criterion" onClick={onRemove}>
          ×
        </button>
      </div>
      <div className="query-subgroup">
        {condition.criteria.map((sub, i) => (
          <ConditionEditor
            key={i}
            condition={sub}
            slots={relatedSlots}
            advertisedOps={advertisedOps}
            onChange={(next) =>
              onChange({
                ...condition,
                criteria: condition.criteria.map((c, j) => (j === i ? next : c)),
              })
            }
            onRemove={() =>
              onChange({ ...condition, criteria: condition.criteria.filter((_, j) => j !== i) })
            }
          />
        ))}
        <button
          type="button"
          className="query-add"
          disabled={relatedSlots.length === 0}
          onClick={() =>
            onChange({
              ...condition,
              criteria: [
                ...condition.criteria,
                { kind: 'field', slot: relatedSlots[0]!.slot, op: 'eq', value: '' },
              ],
            })
          }
        >
          + condition on the related record
        </button>
      </div>
    </div>
  );
}

export function QueryBuilderView({ source }: { source: HippoSource }) {
  const { collections, capabilities } = source;
  const urlState = useCollectionUrlState();
  const anchored = collections.filter((c) => c.args.filter);
  const initial =
    urlState.querySpec ??
    emptyQuerySpec(
      (urlState.collection && anchored.find((c) => c.id === urlState.collection)?.id) ||
        anchored[0]?.id ||
        '',
    );

  const [draft, setDraft] = useState<QuerySpec>(initial);
  const [run, setRun] = useState<QueryRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);

  const anchor = collections.find((c) => c.id === draft.anchor);
  const slots = useMemo(() => (anchor ? filterSlots(anchor) : []), [anchor]);
  const edges = useMemo(
    () => (anchor ? deriveEdges(anchor, collections) : []),
    [anchor, collections],
  );
  const validation = useMemo(
    () => validateQuerySpec(draft, collections, capabilities),
    [draft, collections, capabilities],
  );

  const executed = urlState.querySpec;
  const page = urlState.page;
  const execute = useCallback(
    async (spec: QuerySpec, pageNo: number) => {
      setRunning(true);
      setError(null);
      try {
        setRun(await runQuerySpec(source, collections, capabilities, spec, pageNo, PAGE_SIZE));
      } catch (e) {
        setRun(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRunning(false);
      }
    },
    [source, collections, capabilities],
  );

  useEffect(() => {
    if (executed) void execute(executed, page);
  }, [executed, page, execute]);

  if (!anchor) {
    return (
      <div className="main-panel" role="status">
        <h1 className="main-panel-title">No filterable collections</h1>
        <p className="main-panel-detail">The endpoint advertises no filter arguments to build on.</p>
      </div>
    );
  }

  const setCriterion = (i: number, next: Criterion) =>
    setDraft({ ...draft, criteria: draft.criteria.map((c, j) => (j === i ? next : c)) });
  const removeCriterion = (i: number) =>
    setDraft({ ...draft, criteria: draft.criteria.filter((_, j) => j !== i) });

  const exportRows = async (format: 'csv' | 'json') => {
    if (!run) return;
    setExportNote(null);
    const rows: Record<string, unknown>[] = [];
    let pageNo = 1;
    let truncated = false;
    for (;;) {
      const result = await source.listEntities(anchor.id, {
        page: pageNo,
        pageSize: EXPORT_PAGE_SIZE,
        conditions: run.anchorConditions,
        filterMode: run.filterMode,
      });
      rows.push(...result.rows);
      if (rows.length >= EXPORT_CAP) {
        truncated = result.mayHaveMore || rows.length > EXPORT_CAP;
        rows.length = EXPORT_CAP;
        break;
      }
      if (!result.mayHaveMore) break;
      pageNo += 1;
    }
    const content = format === 'csv' ? toCSV(anchor.columns, rows) : toJSONExport(rows);
    downloadFile(
      `query-${anchor.id}.${format}`,
      format === 'csv' ? 'text/csv' : 'application/json',
      content,
    );
    setExportNote(
      truncated
        ? `Exported the first ${rows.length.toLocaleString('en-US')} rows — the set is larger (cap).`
        : `Exported ${rows.length.toLocaleString('en-US')} rows.`,
    );
  };

  return (
    <div className="main-panel query-view" data-testid="query-builder">
      <div className="query-header">
        <h1 className="main-panel-title">Query</h1>
        <button type="button" className="detail-link" onClick={urlState.closeQueryViews}>
          Back to collections
        </button>
      </div>

      <div className="query-frame">
        <div className="query-condition">
          <span className="query-keyword">Rows are</span>
          <select
            aria-label="Anchor"
            className="query-select"
            data-testid="query-anchor"
            value={draft.anchor}
            onChange={(e) => setDraft(emptyQuerySpec(e.target.value))}
          >
            {anchored.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <span className="query-keyword">matching</span>
          <select
            aria-label="Combine mode"
            className="query-select"
            value={draft.mode}
            disabled={!anchor.filterModeArg}
            title={anchor.filterModeArg ? undefined : 'The endpoint advertises no OR combinator'}
            onChange={(e) => setDraft({ ...draft, mode: e.target.value as 'AND' | 'OR' })}
          >
            <option value="AND">all of</option>
            <option value="OR">any of</option>
          </select>
        </div>

        {draft.criteria.map((criterion, i) =>
          criterion.kind === 'field' ? (
            <ConditionEditor
              key={i}
              condition={criterion}
              slots={slots}
              advertisedOps={capabilities.filterOps}
              onChange={(next) => setCriterion(i, next)}
              onRemove={() => removeCriterion(i)}
            />
          ) : (
            <RelatedEditor
              key={i}
              condition={criterion}
              edges={edges}
              collections={collections}
              advertisedOps={capabilities.filterOps}
              onChange={(next) => setCriterion(i, next)}
              onRemove={() => removeCriterion(i)}
            />
          ),
        )}

        <div className="query-actions">
          <button
            type="button"
            className="query-add"
            disabled={slots.length === 0}
            onClick={() =>
              setDraft({
                ...draft,
                criteria: [
                  ...draft.criteria,
                  { kind: 'field', slot: slots[0]!.slot, op: 'eq', value: '' },
                ],
              })
            }
          >
            + field condition
          </button>
          <button
            type="button"
            className="query-add"
            disabled={edges.length === 0}
            title={edges.length === 0 ? 'No relationship edges derive from this anchor' : undefined}
            onClick={() =>
              setDraft({
                ...draft,
                criteria: [
                  ...draft.criteria,
                  { kind: 'related', edge: edges[0]!.key, quantifier: 'some', criteria: [] },
                ],
              })
            }
          >
            + relationship condition
          </button>
          <button
            type="button"
            className="action-button"
            data-testid="query-run"
            disabled={validation.errors.length > 0 || running}
            onClick={() => urlState.openQueryBuilder(draft)}
          >
            {running ? 'Running…' : 'Run'}
          </button>
        </div>

        {validation.errors.length > 0 && draft.criteria.length > 0 && (
          <ul className="query-problems" role="alert">
            {validation.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <div className="query-notes" role="alert">
          {error}
        </div>
      )}
      {run && run.notes.length > 0 && (
        <ul className="query-notes" role="status" data-testid="query-notes">
          {run.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}

      {run && (
        <div className="query-results" data-testid="query-results">
          <div className="query-results-bar">
            <span className="query-total" role="status">
              {run.total != null
                ? `${run.total.toLocaleString('en-US')} matching ${anchor.label.toLowerCase()}`
                : `page ${page}${run.mayHaveMore ? ' (more available)' : ''}`}
              {run.relationshipTier === 'compensated' && (
                <span
                  className="query-tier"
                  title={`Relationship criteria ran client-planned over a native "in" (cap ${SEMIJOIN_CAP})`}
                >
                  {' '}
                  · semijoin tier
                </span>
              )}
            </span>
            <div className="collection-actions">
              <button type="button" className="action-button" onClick={() => urlState.openGraphView()}>
                Explore as graph
              </button>
              <button type="button" className="action-button" onClick={() => void exportRows('csv')}>
                Export CSV
              </button>
              <button type="button" className="action-button" onClick={() => void exportRows('json')}>
                Export JSON
              </button>
            </div>
          </div>
          {exportNote && (
            <span className="export-note" role="status">
              {exportNote}
            </span>
          )}
          <table className="collection-table">
            <thead>
              <tr>
                {anchor.columns.map((c) => (
                  <th key={c.field} className={isRightAligned(c) ? 'cell-right' : undefined}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {run.rows.map((row, i) => (
                <tr
                  key={String(row[anchor.idColumn ?? ''] ?? i)}
                  className="query-row"
                  onClick={() => {
                    const id = row[anchor.idColumn ?? ''];
                    if (id != null) urlState.openIn(anchor.id, String(id));
                  }}
                >
                  {anchor.columns.map((c) => (
                    <td key={c.field} className={isRightAligned(c) ? 'cell-right' : undefined}>
                      {renderCell(c, row[c.field])}
                    </td>
                  ))}
                </tr>
              ))}
              {run.rows.length === 0 && (
                <tr>
                  <td colSpan={anchor.columns.length} className="query-empty">
                    No matches.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="query-pager">
            <button
              type="button"
              className="action-button"
              disabled={page <= 1 || running}
              onClick={() => urlState.setQueryPage(page - 1)}
            >
              Previous
            </button>
            <span>page {page}</span>
            <button
              type="button"
              className="action-button"
              disabled={!run.mayHaveMore || running}
              onClick={() => urlState.setQueryPage(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
