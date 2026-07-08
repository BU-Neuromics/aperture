import type { Capabilities } from './capabilities';
import type { BatchModel, BatchOperation, BatchResult } from './batch';
import { buildBatchMutation, deriveBatchModel, normalizeBatchResult } from './batch';
import type { IntrospectionData } from './introspection';
import { INTROSPECTION_QUERY } from './introspection';
import type { ScopedDataClient } from './scopedClient';
import type { CollectionModel, ColumnModel, HistoryModel } from './schemaModel';
import { deriveCapabilities, deriveCollections, deriveHistory } from './schemaModel';

/**
 * The Layer-D source adapter (ADR-0017): introspects the active endpoint
 * once, derives the browsable collections + a negotiated `Capabilities`
 * object, and executes schema-derived queries. Generic over any conformant
 * GraphQL endpoint; Hippo enrichment upgrades it when advertised.
 */

/** Active equality filters: filter-input field → value (AND across fields, R3.3). */
export type FilterValues = Record<string, string | boolean>;

export interface ListOptions {
  page: number;
  pageSize: number;
  filters?: FilterValues;
  search?: string;
  /** Bypass the document cache (read-after-write surfaces, e.g. the control plane). */
  fresh?: boolean;
}

export interface EntityPage {
  rows: Record<string, unknown>[];
  /** True when a next page may exist (from `total` when the page envelope carries one). */
  mayHaveMore: boolean;
  /** The server-reported total for the filtered set (envelope pages only). */
  total?: number;
}

export interface HistoryEntry {
  [field: string]: unknown;
}

/** Form values keyed by input-field name; null clears a field on update. */
export type WriteValues = Record<string, string | number | boolean | null>;

export interface HippoSource {
  capabilities: Capabilities;
  collections: CollectionModel[];
  history?: HistoryModel;
  listEntities(collectionId: string, options: ListOptions): Promise<EntityPage>;
  /** Fetch one entity via the collection's detail path; null when not found. */
  getEntity(collectionId: string, id: string): Promise<Record<string, unknown> | null>;
  /** Entity change history, when the endpoint advertises it (R3.7). */
  getHistory(id: string): Promise<HistoryEntry[]>;
  /** Create via the derived write path; returns the new entity's id column value (W4.3). */
  createEntity(collectionId: string, values: WriteValues): Promise<string | null>;
  /** Partial-merge update: send only the given fields (W4.3). */
  updateEntity(collectionId: string, id: string, values: WriteValues): Promise<void>;
  /** The introspected batch unit-of-work surface, when usable (ADR-0028). */
  batch?: BatchModel;
  /** Whole-set dry-run (dryRun=true) or atomic commit of a staged set (W4.7). */
  runBatch(operations: BatchOperation[], dryRun: boolean): Promise<BatchResult>;
}

function selectionFor(column: ColumnModel): string {
  if (column.kind === 'ref' || column.kind === 'refList') {
    return `${column.field} { ${column.targetIdField} }`;
  }
  return column.field;
}

function selectionSet(columns: ColumnModel[]): string {
  return columns.map(selectionFor).join(' ');
}

export interface BuiltQuery {
  document: string;
  variables: Record<string, unknown>;
}

export interface BuiltListQuery extends BuiltQuery {
  /** The Query field the rows come back under (the search twin when searching). */
  rootField: string;
  /** True when rows arrive inside an `{ items total }` page envelope. */
  envelope: boolean;
}

class QueryBuilder {
  varDefs: string[] = [];
  argList: string[] = [];
  variables: Record<string, unknown> = {};

  add(arg: string | undefined, type: string | undefined, name: string, value: unknown) {
    if (!arg || !type || value === undefined) return;
    this.varDefs.push(`$${name}: ${type}`);
    this.argList.push(`${arg}: $${name}`);
    this.variables[name] = value;
  }

  document(rootField: string, selections: string) {
    const defs = this.varDefs.length > 0 ? `(${this.varDefs.join(', ')})` : '';
    const args = this.argList.length > 0 ? `(${this.argList.join(', ')})` : '';
    return `query ApertureList${defs} { ${rootField}${args} { ${selections} } }`;
  }
}

/**
 * Builds the list query for one collection from its derived column model,
 * passing paging/filter/search through typed variables (types come from the
 * introspected arg types, so the document always matches the endpoint).
 *
 * Envelope collections (live Hippo, #15) select `{ items { … } total }` and
 * pass filters as the generic `[{field, value}]` list (AND). An active search
 * term routes to the attached search twin instead — a bare list whose `q` the
 * server requires; search takes no filters, so it replaces them for the query
 * (mirroring the flat search-over-filters UI semantics).
 */
export function buildListQuery(collection: CollectionModel, options: ListOptions): BuiltListQuery {
  const builder = new QueryBuilder();
  const offset = (options.page - 1) * options.pageSize;

  if (collection.pageShape === 'envelope' && options.search && collection.search) {
    const twin = collection.search;
    builder.add(twin.argName, twin.argType, 'q', options.search);
    builder.add(twin.limitArg, twin.limitArgType, 'limit', options.pageSize);
    builder.add(twin.offsetArg, twin.offsetArgType, 'offset', offset);
    return {
      document: builder.document(twin.field, selectionSet(collection.columns)),
      variables: builder.variables,
      rootField: twin.field,
      envelope: false,
    };
  }

  builder.add(collection.args.limit, collection.argTypes.limit, 'limit', options.pageSize);
  builder.add(collection.args.offset, collection.argTypes.offset, 'offset', offset);

  const hasFilters = options.filters && Object.keys(options.filters).length > 0;
  if (collection.filterShape === 'filterList') {
    builder.add(
      collection.args.filter,
      collection.argTypes.filter,
      'filters',
      hasFilters
        ? Object.entries(options.filters!).map(([field, value]) => ({ field, value }))
        : undefined,
    );
    builder.add(
      collection.filterModeArg?.name,
      collection.filterModeArg?.type,
      'filterMode',
      hasFilters ? 'AND' : undefined,
    );
  } else {
    builder.add(
      collection.args.filter,
      collection.argTypes.filter,
      'filter',
      hasFilters ? options.filters : undefined,
    );
  }
  builder.add(collection.args.search, collection.argTypes.search, 'search', options.search || undefined);

  const envelope = collection.pageShape === 'envelope';
  const selections = envelope
    ? `items { ${selectionSet(collection.columns)} } total`
    : selectionSet(collection.columns);
  return {
    document: builder.document(collection.id, selections),
    variables: builder.variables,
    rootField: collection.id,
    envelope,
  };
}

/** Builds the single-entity query along the collection's detail path. */
export function buildDetailQuery(collection: CollectionModel, id: string): BuiltQuery | null {
  const detail = collection.detail;
  if (!detail) return null;
  const selections = selectionSet(collection.detailColumns);
  if (detail.kind === 'field') {
    return {
      document: `query ApertureDetail($id: ${detail.argType}) { ${detail.field}(${detail.argName}: $id) { ${selections} } }`,
      variables: { id },
    };
  }
  // Filter fallback: id-equality on the list field, first row wins.
  const varDefs = [`$filter: ${collection.argTypes.filter}`];
  const args = [`${collection.args.filter}: $filter`];
  const variables: Record<string, unknown> = { filter: { [detail.filterField]: id } };
  if (collection.args.limit && collection.argTypes.limit) {
    varDefs.push(`$limit: ${collection.argTypes.limit}`);
    args.push(`${collection.args.limit}: $limit`);
    variables['limit'] = 1;
  }
  return {
    document: `query ApertureDetail(${varDefs.join(', ')}) { ${collection.id}(${args.join(', ')}) { ${selections} } }`,
    variables,
  };
}

/** Builds the create mutation for a collection's derived write path. */
export function buildCreateMutation(
  collection: CollectionModel,
  values: Record<string, unknown>,
): BuiltQuery | null {
  const create = collection.write.create;
  if (!create) return null;
  const idSelection = collection.idColumn ?? collection.columns[0].field;
  return {
    document: `mutation ApertureCreate($input: ${create.inputArgType}) { ${create.field}(${create.inputArgName}: $input) { ${idSelection} } }`,
    variables: { input: values },
  };
}

/** Builds the partial-merge update mutation (only the provided fields travel). */
export function buildUpdateMutation(
  collection: CollectionModel,
  id: string,
  values: Record<string, unknown>,
): BuiltQuery | null {
  const update = collection.write.update;
  if (!update) return null;
  const idSelection = collection.idColumn ?? collection.columns[0].field;
  return {
    document:
      `mutation ApertureUpdate($id: ${update.idArgType}, $input: ${update.inputArgType}) ` +
      `{ ${update.field}(${update.idArgName}: $id, ${update.inputArgName}: $input) { ${idSelection} } }`,
    variables: { id, input: values },
  };
}

export async function connectHippoSource(client: ScopedDataClient): Promise<HippoSource> {
  const result = await client.query<IntrospectionData>(INTROSPECTION_QUERY);
  if (result.error || !result.data?.__schema) {
    throw new Error(
      `Could not introspect the endpoint: ${result.error?.message ?? 'no __schema in response'}`,
    );
  }

  const schema = result.data.__schema;
  const collections = deriveCollections(schema);
  const capabilities = deriveCapabilities(schema, collections);
  const history = deriveHistory(schema);
  const batch = deriveBatchModel(schema);

  const collectionFor = (collectionId: string): CollectionModel => {
    const collection = collections.find((c) => c.id === collectionId);
    if (!collection) throw new Error(`Unknown collection “${collectionId}”`);
    return collection;
  };

  return {
    capabilities,
    collections,
    history,
    batch,

    async runBatch(operations, dryRun) {
      if (!batch) throw new Error('The endpoint does not advertise a batch unit-of-work');
      if (operations.length === 0) throw new Error('Nothing staged to submit');
      const built = buildBatchMutation(batch, operations, dryRun);
      const batchResult = await client.mutate<Record<string, unknown>>(
        built.document,
        built.variables,
      );
      if (batchResult.error || batchResult.data == null) {
        throw new Error(
          `Batch ${dryRun ? 'validation' : 'commit'} failed: ${batchResult.error?.message ?? 'empty response'}`,
        );
      }
      return normalizeBatchResult(batchResult.data[batch.field]);
    },

    async listEntities(collectionId, options) {
      const collection = collectionFor(collectionId);
      const { page, pageSize } = options;
      if (!Number.isInteger(page) || page < 1) throw new Error(`Invalid page ${page}`);
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
        throw new Error(`Invalid page size ${pageSize}`);
      }

      const { document, variables, rootField, envelope } = buildListQuery(collection, options);
      const listResult = await client.query<Record<string, unknown>>(document, variables, {
        fresh: options.fresh,
      });
      if (listResult.error || listResult.data == null) {
        throw new Error(
          `Could not list ${collection.label}: ${listResult.error?.message ?? 'empty response'}`,
        );
      }
      if (envelope) {
        const envelopePage = (listResult.data[rootField] ?? {}) as {
          items?: Record<string, unknown>[];
          total?: number;
        };
        const rows = envelopePage.items ?? [];
        const total = envelopePage.total;
        return {
          rows,
          total,
          mayHaveMore:
            total != null
              ? (page - 1) * pageSize + rows.length < total
              : rows.length === pageSize,
        };
      }
      // Bare lists carry no total — a full page means a next page may exist.
      const rows = (listResult.data[rootField] ?? []) as Record<string, unknown>[];
      return { rows, mayHaveMore: rows.length === pageSize };
    },

    async getEntity(collectionId, id) {
      const collection = collectionFor(collectionId);
      const built = buildDetailQuery(collection, id);
      if (!built) {
        throw new Error(`${collection.label} does not support single-entity fetch`);
      }
      const detailResult = await client.query<Record<string, unknown>>(
        built.document,
        built.variables,
      );
      if (detailResult.error || detailResult.data == null) {
        throw new Error(
          `Could not load ${collection.typeName} “${id}”: ${detailResult.error?.message ?? 'empty response'}`,
        );
      }
      const detail = collection.detail!;
      if (detail.kind === 'field') {
        return (detailResult.data[detail.field] ?? null) as Record<string, unknown> | null;
      }
      const rows = (detailResult.data[collection.id] ?? []) as Record<string, unknown>[];
      return rows[0] ?? null;
    },

    async createEntity(collectionId, values) {
      const collection = collectionFor(collectionId);
      const built = buildCreateMutation(collection, values);
      if (!built) throw new Error(`${collection.label} does not support create`);
      const createResult = await client.mutate<Record<string, unknown>>(
        built.document,
        built.variables,
      );
      if (createResult.error || createResult.data == null) {
        throw new Error(
          `Could not create ${collection.typeName}: ${createResult.error?.message ?? 'empty response'}`,
        );
      }
      const entity = createResult.data[collection.write.create!.field] as
        | Record<string, unknown>
        | null;
      const id = entity?.[collection.idColumn ?? ''];
      return id == null ? null : String(id);
    },

    async updateEntity(collectionId, id, values) {
      const collection = collectionFor(collectionId);
      const built = buildUpdateMutation(collection, id, values);
      if (!built) throw new Error(`${collection.label} does not support update`);
      const updateResult = await client.mutate<Record<string, unknown>>(
        built.document,
        built.variables,
      );
      if (updateResult.error) {
        throw new Error(
          `Could not update ${collection.typeName} “${id}”: ${updateResult.error.message}`,
        );
      }
    },

    async getHistory(id) {
      if (!history) return [];
      const document = `query ApertureHistory($id: ${history.argType}) { ${history.field}(${history.argName}: $id) { ${selectionSet(history.columns)} } }`;
      const historyResult = await client.query<Record<string, unknown>>(document, { id });
      if (historyResult.error || historyResult.data == null) {
        throw new Error(`Could not load history: ${historyResult.error?.message ?? 'empty response'}`);
      }
      return (historyResult.data[history.field] ?? []) as HistoryEntry[];
    },
  };
}
