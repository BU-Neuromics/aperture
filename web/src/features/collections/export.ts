import type { FilterValues, HippoSource } from '../../data/hippoSource';
import type { CollectionModel, ColumnModel } from '../../data/schemaModel';

/**
 * Export (R3.10, L8): client-side page-through of the current filtered set →
 * CSV or JSON over the derived columns. No server dependency (server bulk
 * export is Hippo X2, deferred). The page-through is capped and the cap is
 * reported — a truncated export always says so (ADR-0029).
 */
export const EXPORT_CAP = 5000;
const EXPORT_PAGE_SIZE = 100;

export interface CollectedRows {
  rows: Record<string, unknown>[];
  /** True when the cap cut the set short — surfaced to the user, never silent. */
  truncated: boolean;
}

export async function collectAllRows(
  source: HippoSource,
  collection: CollectionModel,
  filters: FilterValues,
  search: string,
  cap: number = EXPORT_CAP,
): Promise<CollectedRows> {
  // Without offset pagination the first fetch is all the endpoint offers.
  if (!source.capabilities.offsetPagination) {
    const page = await source.listEntities(collection.id, {
      page: 1,
      pageSize: EXPORT_PAGE_SIZE,
      filters,
      search,
    });
    return { rows: page.rows.slice(0, cap), truncated: page.rows.length > cap };
  }

  const rows: Record<string, unknown>[] = [];
  let page = 1;
  for (;;) {
    const result = await source.listEntities(collection.id, {
      page,
      pageSize: EXPORT_PAGE_SIZE,
      filters,
      search,
    });
    rows.push(...result.rows);
    if (rows.length >= cap) return { rows: rows.slice(0, cap), truncated: result.mayHaveMore || rows.length > cap };
    if (!result.mayHaveMore) return { rows, truncated: false };
    page += 1;
  }
}

function cellValue(column: ColumnModel, value: unknown): string {
  if (value == null) return '';
  if (column.kind === 'ref') {
    const id = (value as Record<string, unknown>)[column.targetIdField ?? ''];
    return id == null ? '' : String(id);
  }
  if (column.kind === 'refList') {
    if (!Array.isArray(value)) return '';
    return value
      .map((item) => (item as Record<string, unknown>)[column.targetIdField ?? ''])
      .filter((id) => id != null)
      .join('; ');
  }
  return String(value);
}

function csvEscape(field: string): string {
  return /[",\n\r]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field;
}

export function toCSV(columns: ColumnModel[], rows: Record<string, unknown>[]): string {
  const header = columns.map((c) => csvEscape(c.label)).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => csvEscape(cellValue(c, row[c.field]))).join(','),
  );
  return [header, ...lines].join('\r\n') + '\r\n';
}

export function toJSONExport(rows: Record<string, unknown>[]): string {
  return JSON.stringify(rows, null, 2);
}

export function downloadFile(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
