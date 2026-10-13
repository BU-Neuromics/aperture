import type { ReactNode } from 'react';
import type { ColumnModel } from '../../data/schemaModel';
import type { PathColumn } from '../../data/selection';
import { formatValue } from '../../data/valueText';

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

/**
 * Render a path-addressed cell (ADR-0041).
 *
 * The value arrives already read through every hop, so this only has to decide
 * *how* to draw it — and for a to-many path that depends on the mode, not on
 * the leaf column's kind. A `count` is a number however the leaf was typed; a
 * `joinIds` is joined text. Only `explode` and to-one paths render as the leaf.
 */
export function renderPathCell(column: PathColumn, value: unknown): ReactNode {
  const mode = column.many?.mode;
  if (mode === 'count') {
    const count = typeof value === 'number' ? value : 0;
    return <span className={count === 0 ? 'cell-count cell-count-zero' : 'cell-count'}>{count}</span>;
  }
  if (mode === 'joinIds') {
    return value == null || value === '' ? EMPTY : <span className="cell-ref">{String(value)}</span>;
  }
  return renderCell(column.column, value);
}

export function isPathRightAligned(column: PathColumn): boolean {
  if (column.many?.mode === 'count') return true;
  if (column.many?.mode === 'joinIds') return false;
  return isRightAligned(column.column);
}
