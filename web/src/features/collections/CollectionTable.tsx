import { useMemo } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useCapabilities } from '../../data/DataSourceContext';
import type { HippoSource } from '../../data/hippoSource';
import type { CollectionModel } from '../../data/schemaModel';
import { isRightAligned, renderCell } from './cells';
import { ExportButtons } from './ExportButtons';
import { useCollectionUrlState } from './urlState';
import { useEntityPage } from './useEntityPage';
import './collections.css';

export const PAGE_SIZE = 25;
const SKELETON_ROWS = 8;

type Row = Record<string, unknown>;
const columnHelper = createColumnHelper<Row>();

/**
 * Step 0.5 — the schema-derived collection table (R3.2), bound into the
 * `main` slot: TanStack Table over one offset page, columns from the derived
 * column model, cells keyed by slot kind, with loading/empty/error states
 * from the design-export. Pagination controls are capability-gated
 * (ADR-0029): no offset pagination advertised → no pager, no fake counts.
 */
export function CollectionTable({
  source,
  collection,
}: {
  source: HippoSource;
  collection: CollectionModel;
}) {
  const capabilities = useCapabilities();
  const { page, setPage, filters, search, clearFilters, openEntity, openCreateForm } =
    useCollectionUrlState();
  const result = useEntityPage(source, collection.id, page, PAGE_SIZE, filters, search);
  const isFiltered = Object.keys(filters).length > 0 || search !== '';

  const columns = useMemo(
    () =>
      collection.columns.map((model) =>
        columnHelper.accessor((row: Row) => row[model.field], {
          id: model.field,
          header: model.label,
          cell: (info) => {
            const value = info.getValue();
            // The id column links to the detail view when a detail path exists (R3.7).
            if (model.field === collection.idColumn && collection.detail && value != null) {
              return (
                <button
                  type="button"
                  className="cell-id cell-id-link"
                  onClick={() => openEntity(String(value))}
                >
                  {String(value)}
                </button>
              );
            }
            return renderCell(model, value);
          },
          meta: { align: isRightAligned(model) ? 'right' : 'left' },
        }),
      ),
    [collection, openEntity],
  );

  const table = useReactTable({
    data: result.status === 'ready' ? result.page.rows : [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const showPager = capabilities.offsetPagination && result.status === 'ready';

  return (
    <div className="collection-view">
      <div className="collection-view-header">
        <div>
          <div className="collection-title-row">
            <h1 className="collection-title">{collection.label}</h1>
            <span className="collection-type-chip">type: {collection.typeName}</span>
          </div>
          <div className="collection-count">
            {/* No aggregation capability yet (Hippo X1) — page-scoped honesty only. */}
            {result.status === 'ready'
              ? `Page ${page} · ${result.page.rows.length}${result.page.mayHaveMore ? '+' : ''} rows${isFiltered ? ' · filtered' : ''}`
              : ' '}
          </div>
        </div>
        <div className="collection-actions">
          {/* Gated on the derived create path — never offered unadvertised (W4.3). */}
          {collection.write.create && (
            <button type="button" className="action-button action-primary" onClick={openCreateForm}>
              New {collection.typeName}
            </button>
          )}
          <ExportButtons
            source={source}
            collection={collection}
            filters={filters}
            search={search}
            disabled={result.status !== 'ready'}
          />
        </div>
      </div>

      <div className="collection-card">
        <div className="collection-scroll">
          <table className="collection-table">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className={
                        (header.column.columnDef.meta as { align?: string } | undefined)?.align ===
                        'right'
                          ? 'align-right'
                          : undefined
                      }
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {result.status === 'loading' &&
                Array.from({ length: SKELETON_ROWS }, (_, i) => (
                  <tr key={i} data-testid="skeleton-row">
                    {collection.columns.map((c) => (
                      <td key={c.field}>
                        <div
                          className="skeleton-bar"
                          style={{ width: `${45 + ((i * 17 + c.field.length * 7) % 40)}%` }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              {result.status === 'ready' &&
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={
                          (cell.column.columnDef.meta as { align?: string } | undefined)?.align ===
                          'right'
                            ? 'align-right'
                            : undefined
                        }
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {result.status === 'ready' && result.page.rows.length === 0 && (
          <div className="collection-state" role="status">
            <div className="state-icon state-icon-empty" aria-hidden="true" />
            <div className="state-title">
              No {isFiltered ? 'matching ' : ''}
              {collection.label.toLowerCase()}
              {!isFiltered && page > 1 ? ' on this page' : ''}
            </div>
            <div className="state-detail">
              {isFiltered
                ? 'No records match the current filters. Try clearing filters or switching collections.'
                : page > 1
                  ? 'This page is past the end of the collection.'
                  : 'The endpoint returned no records for this collection.'}
            </div>
            {isFiltered && (
              <button type="button" className="state-button" onClick={clearFilters}>
                Clear filters
              </button>
            )}
            {!isFiltered && page > 1 && (
              <button type="button" className="state-button" onClick={() => setPage(1)}>
                Back to first page
              </button>
            )}
          </div>
        )}

        {result.status === 'error' && (
          <div className="collection-state" role="alert">
            <div className="state-icon state-icon-error" aria-hidden="true">
              !
            </div>
            <div className="state-title">Couldn’t load {collection.label.toLowerCase()}</div>
            <div className="state-detail">{result.message}</div>
            <button type="button" className="state-button state-button-primary" onClick={result.retry}>
              Retry
            </button>
          </div>
        )}

        {showPager && (
          <div className="collection-pager">
            <span className="pager-range">
              Page {page} · up to {PAGE_SIZE} per page
            </span>
            <div className="pager-buttons">
              <button
                type="button"
                className="pager-button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Prev
              </button>
              <button
                type="button"
                className="pager-button"
                disabled={result.status === 'ready' && !result.page.mayHaveMore}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
