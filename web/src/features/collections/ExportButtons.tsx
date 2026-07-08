import { useState } from 'react';
import type { FilterValues, HippoSource } from '../../data/hippoSource';
import type { CollectionModel } from '../../data/schemaModel';
import { collectAllRows, downloadFile, toCSV, toJSONExport } from './export';

/**
 * Export actions (R3.10): page through the current filtered set client-side
 * and download it. The status line reports row count and truncation — an
 * export never silently drops rows (ADR-0029).
 */
export function ExportButtons({
  source,
  collection,
  filters,
  search,
  disabled,
}: {
  source: HippoSource;
  collection: CollectionModel;
  filters: FilterValues;
  search: string;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const run = async (format: 'csv' | 'json') => {
    setBusy(true);
    setNote(null);
    try {
      const { rows, truncated } = await collectAllRows(source, collection, filters, search);
      const content = format === 'csv' ? toCSV(collection.columns, rows) : toJSONExport(rows);
      downloadFile(
        `${collection.id}.${format}`,
        format === 'csv' ? 'text/csv' : 'application/json',
        content,
      );
      setNote(
        truncated
          ? `Exported the first ${rows.length.toLocaleString('en-US')} rows — the set is larger (cap).`
          : `Exported ${rows.length.toLocaleString('en-US')} rows.`,
      );
    } catch (error) {
      setNote(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="collection-actions">
      {note && (
        <span className="export-note" role="status">
          {note}
        </span>
      )}
      <button
        type="button"
        className="action-button"
        disabled={disabled || busy}
        onClick={() => void run('csv')}
      >
        {busy ? 'Exporting…' : 'Export CSV'}
      </button>
      <button
        type="button"
        className="action-button"
        disabled={disabled || busy}
        onClick={() => void run('json')}
      >
        Export JSON
      </button>
    </div>
  );
}
