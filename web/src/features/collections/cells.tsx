import type { ReactNode } from 'react';
import type { ColumnModel } from '../../data/schemaModel';

/**
 * Cell renderers keyed by LinkML-ish slot kind (R3.2), translated from the
 * design-export: id → mono accent, ref → mono secondary, enum → neutral chip,
 * number → tabular right, relationship list → count badge. Deliberately
 * generic — no value-keyed semantic colors (those would be domain config).
 */
export function isRightAligned(column: ColumnModel): boolean {
  return column.kind === 'number' || column.kind === 'refList';
}

const EMPTY = <span className="cell-empty">—</span>;

/**
 * Render a possibly-structured scalar value as legible text. Mosaic emits
 * inline value types (LinkML `STRUCTURED` slots — e.g. a quantity value
 * `{ value, unit }`) as a JSON passthrough scalar, so a cell value can be a
 * plain object or array. `String()` on those yields "[object Object]"; format
 * them generically instead — arrays join their items, objects render
 * `key: value` pairs — with no domain-specific field assumptions (ADR-0002).
 */
function formatValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) {
    return value
      .map(formatValue)
      .filter((s) => s !== '')
      .join(', ');
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v != null);
  if (entries.length === 0) return '';
  return entries
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}

export function renderCell(column: ColumnModel, value: unknown): ReactNode {
  if (value == null) return EMPTY;

  switch (column.kind) {
    case 'id':
      return <span className="cell-id">{formatValue(value)}</span>;
    case 'ref': {
      const target = (value as Record<string, unknown>)[column.targetIdField ?? ''];
      return target == null ? EMPTY : <span className="cell-ref">{formatValue(target)}</span>;
    }
    case 'refList': {
      const count = Array.isArray(value) ? value.length : 0;
      return (
        <span className={count === 0 ? 'cell-count cell-count-zero' : 'cell-count'}>{count}</span>
      );
    }
    case 'enum':
      return <span className="cell-enum">{formatValue(value)}</span>;
    case 'number':
      return (
        <span className="cell-number">
          {typeof value === 'number' ? value.toLocaleString('en-US') : formatValue(value)}
        </span>
      );
    case 'boolean':
      return <span className="cell-text">{value ? 'true' : 'false'}</span>;
    case 'date':
    case 'text':
      return <span className="cell-text">{formatValue(value)}</span>;
  }
}
