import type { Capabilities } from './capabilities';
import type { IntrospectionData } from './introspection';
import { INTROSPECTION_QUERY } from './introspection';
import type { ScopedDataClient } from './scopedClient';
import type { CollectionModel, ColumnModel } from './schemaModel';
import { deriveCapabilities, deriveCollections } from './schemaModel';

/**
 * The Layer-D source adapter (step 0.3; ADR-0017): introspects the active
 * endpoint once, derives the browsable collections + a negotiated
 * `Capabilities` object, and executes schema-derived list queries. Generic
 * over any conformant GraphQL endpoint; Hippo enrichment upgrades it when
 * advertised.
 */
export interface EntityPage {
  rows: Record<string, unknown>[];
  /** True when the page is full — a next page may exist (no totalCount until X1). */
  mayHaveMore: boolean;
}

export interface HippoSource {
  capabilities: Capabilities;
  collections: CollectionModel[];
  listEntities(collectionId: string, page: number, pageSize: number): Promise<EntityPage>;
}

function selectionFor(column: ColumnModel): string {
  if (column.kind === 'ref' || column.kind === 'refList') {
    return `${column.field} { ${column.targetIdField} }`;
  }
  return column.field;
}

/** Builds the list query for one collection from its derived column model. */
export function buildListQuery(
  collection: CollectionModel,
  page: number,
  pageSize: number,
): string {
  const args: string[] = [];
  // Page-size literals are validated integers; inlining avoids coupling to the
  // endpoint's exact variable types.
  if (collection.args.limit && collection.args.offset) {
    args.push(`${collection.args.limit}: ${pageSize}`);
    args.push(`${collection.args.offset}: ${(page - 1) * pageSize}`);
  }
  const argList = args.length > 0 ? `(${args.join(', ')})` : '';
  const selections = collection.columns.map(selectionFor).join(' ');
  return `query ApertureList { ${collection.id}${argList} { ${selections} } }`;
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

  return {
    capabilities,
    collections,
    async listEntities(collectionId, page, pageSize) {
      const collection = collections.find((c) => c.id === collectionId);
      if (!collection) throw new Error(`Unknown collection “${collectionId}”`);
      if (!Number.isInteger(page) || page < 1) throw new Error(`Invalid page ${page}`);
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
        throw new Error(`Invalid page size ${pageSize}`);
      }

      const query = buildListQuery(collection, page, pageSize);
      const listResult = await client.query<Record<string, unknown>>(query);
      if (listResult.error || listResult.data == null) {
        throw new Error(
          `Could not list ${collection.label}: ${listResult.error?.message ?? 'empty response'}`,
        );
      }
      const rows = (listResult.data[collection.id] ?? []) as Record<string, unknown>[];
      return { rows, mayHaveMore: rows.length === pageSize };
    },
  };
}
