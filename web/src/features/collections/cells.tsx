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

export function renderCell(column: ColumnModel, value: unknown): ReactNode {
  if (value == null) return EMPTY;

  switch (column.kind) {
    case 'id':
      return <span className="cell-id">{String(value)}</span>;
    case 'ref': {
      const target = (value as Record<string, unknown>)[column.targetIdField ?? ''];
      return target == null ? EMPTY : <span className="cell-ref">{String(target)}</span>;
    }
    case 'refList': {
      const count = Array.isArray(value) ? value.length : 0;
      return (
        <span className={count === 0 ? 'cell-count cell-count-zero' : 'cell-count'}>{count}</span>
      );
    }
    case 'enum':
      return <span className="cell-enum">{String(value)}</span>;
    case 'number':
      return (
        <span className="cell-number">
          {typeof value === 'number' ? value.toLocaleString('en-US') : String(value)}
        </span>
      );
    case 'boolean':
      return <span className="cell-text">{value ? 'true' : 'false'}</span>;
    case 'date':
    case 'text':
      return <span className="cell-text">{String(value)}</span>;
  }
}
