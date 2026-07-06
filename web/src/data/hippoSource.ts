import type { Capabilities } from './capabilities';
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
}

export interface EntityPage {
  rows: Record<string, unknown>[];
  /** True when the page is full — a next page may exist (no totalCount until X1). */
  mayHaveMore: boolean;
}

export interface HistoryEntry {
  [field: string]: unknown;
}

export interface HippoSource {
  capabilities: Capabilities;
  collections: CollectionModel[];
  history?: HistoryModel;
  listEntities(collectionId: string, options: ListOptions): Promise<EntityPage>;
  /** Fetch one entity via the collection's detail path; null when not found. */
  getEntity(collectionId: string, id: string): Promise<Record<string, unknown> | null>;
  /** Entity change history, when the endpoint advertises it (R3.7). */
  getHistory(id: string): Promise<HistoryEntry[]>;
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

/**
 * Builds the list query for one collection from its derived column model,
 * passing paging/filter/search through typed variables (types come from the
 * introspected arg types, so the document always matches the endpoint).
 */
export function buildListQuery(collection: CollectionModel, options: ListOptions): BuiltQuery {
  const varDefs: string[] = [];
  const argList: string[] = [];
  const variables: Record<string, unknown> = {};

  const addArg = (arg: string | undefined, type: string | undefined, name: string, value: unknown) => {
    if (!arg || !type || value === undefined) return;
    varDefs.push(`$${name}: ${type}`);
    argList.push(`${arg}: $${name}`);
    variables[name] = value;
  };

  addArg(collection.args.limit, collection.argTypes.limit, 'limit', options.pageSize);
  addArg(
    collection.args.offset,
    collection.argTypes.offset,
    'offset',
    (options.page - 1) * options.pageSize,
  );
  addArg(
    collection.args.filter,
    collection.argTypes.filter,
    'filter',
    options.filters && Object.keys(options.filters).length > 0 ? options.filters : undefined,
  );
  addArg(collection.args.search, collection.argTypes.search, 'search', options.search || undefined);

  const defs = varDefs.length > 0 ? `(${varDefs.join(', ')})` : '';
  const args = argList.length > 0 ? `(${argList.join(', ')})` : '';
  return {
    document: `query ApertureList${defs} { ${collection.id}${args} { ${selectionSet(collection.columns)} } }`,
    variables,
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

  const collectionFor = (collectionId: string): CollectionModel => {
    const collection = collections.find((c) => c.id === collectionId);
    if (!collection) throw new Error(`Unknown collection “${collectionId}”`);
    return collection;
  };

  return {
    capabilities,
    collections,
    history,

    async listEntities(collectionId, options) {
      const collection = collectionFor(collectionId);
      const { page, pageSize } = options;
      if (!Number.isInteger(page) || page < 1) throw new Error(`Invalid page ${page}`);
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
        throw new Error(`Invalid page size ${pageSize}`);
      }

      const { document, variables } = buildListQuery(collection, options);
      const listResult = await client.query<Record<string, unknown>>(document, variables);
      if (listResult.error || listResult.data == null) {
        throw new Error(
          `Could not list ${collection.label}: ${listResult.error?.message ?? 'empty response'}`,
        );
      }
      const rows = (listResult.data[collection.id] ?? []) as Record<string, unknown>[];
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
