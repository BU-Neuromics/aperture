import type { ColumnModel } from './schemaModel';

/**
 * The one place a slot value becomes text — shared by the table, the exports
 * and the `joinIds` summary, so a value reads the same on screen and in a file.
 *
 * Mosaic emits inline value types (LinkML `STRUCTURED` slots — e.g. a quantity
 * value `{ value, unit }`) as a JSON passthrough scalar, so a value can be a
 * plain object or array. `String()` on those yields "[object Object]"; format
 * them generically instead — arrays join their items, objects render
 * `key: value` pairs — with no domain-specific field assumptions (ADR-0002).
 */
export function formatValue(value: unknown): string {
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

/**
 * A value as text for its column: a reference reads as its target's id (the
 * edge envelope `{ id }` is how Mosaic returns one, ADR-0005), a reference list
 * as those ids, anything else through `formatValue`.
 */
export function valueText(column: ColumnModel, value: unknown): string {
  if (value == null) return '';
  if (column.kind === 'ref') {
    if (typeof value !== 'object') return String(value);
    return formatValue((value as Record<string, unknown>)[column.targetIdField ?? '']);
  }
  if (column.kind === 'refList') {
    if (!Array.isArray(value)) return '';
    return value
      .map((item) => (item as Record<string, unknown> | null)?.[column.targetIdField ?? ''])
      .filter((id) => id != null)
      .map(formatValue)
      .join('; ');
  }
  return formatValue(value);
}
