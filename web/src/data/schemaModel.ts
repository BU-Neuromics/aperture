import type {
  IntrospectionField,
  IntrospectionSchema,
  IntrospectionType,
} from './introspection';
import { findType, isListType, namedType } from './introspection';
import type { Capabilities } from './capabilities';

/**
 * The schema-derived binding model (the novel bet, `prior-art.md`): browsable
 * collections and their column models derive at runtime from endpoint
 * introspection — no build-time codegen, no hand-written per-type UI. Cell
 * renderers key off `SlotKind` (R3.2).
 */

export type SlotKind =
  | 'id'
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'enum'
  | 'ref'
  | 'refList';

export interface ColumnModel {
  /** GraphQL field name on the entity type. */
  field: string;
  /** Humanized header label. */
  label: string;
  kind: SlotKind;
  /** For enum columns: the advertised values (feeds Phase-1 facets). */
  enumValues?: readonly string[];
  /** For ref/refList columns: the target entity type + its id-ish field. */
  targetType?: string;
  targetIdField?: string;
}

export interface CollectionModel {
  /** The Query list field, e.g. `subjects` — doubles as the URL collection id. */
  id: string;
  /** Humanized nav/table label, e.g. "Subjects". */
  label: string;
  /** The entity type name, e.g. `Subject`. */
  typeName: string;
  columns: ColumnModel[];
  /** Introspected arg names, present only when the endpoint advertises them. */
  args: {
    limit?: string;
    offset?: string;
    filter?: string;
    search?: string;
    orderBy?: string;
  };
}

/** Table column budget for the derived default view (curation is later config). */
const MAX_COLUMNS = 8;

const DATE_SCALARS = new Set(['Date', 'DateTime', 'Datetime', 'Time', 'XSDDate', 'XSDDateTime']);
const NUMBER_SCALARS = new Set(['Int', 'Float', 'BigInt', 'Decimal', 'Double']);
const ID_FIELD_NAMES = new Set(['id', 'identifier', 'external_id', 'externalId']);

export function humanize(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function argNamed(field: IntrospectionField, ...names: string[]): string | undefined {
  const lower = new Set(names.map((n) => n.toLowerCase()));
  return field.args.find((a) => lower.has(a.name.toLowerCase()))?.name;
}

/** The field used to identify related entities in ref cells (prefer id-ish names). */
function idishField(type: IntrospectionType): string | undefined {
  const scalarFields = (type.fields ?? []).filter((f) => {
    const named = namedType(f.type);
    return named.kind === 'SCALAR' && !isListType(f.type);
  });
  const byName = scalarFields.find((f) => ID_FIELD_NAMES.has(f.name));
  const byKind = scalarFields.find((f) => namedType(f.type).name === 'ID');
  return (byName ?? byKind ?? scalarFields[0])?.name;
}

function columnFor(
  field: IntrospectionField,
  schema: IntrospectionSchema,
): ColumnModel | undefined {
  const named = namedType(field.type);
  const list = isListType(field.type);
  const base = { field: field.name, label: humanize(field.name) };

  if (named.kind === 'SCALAR') {
    if (list) return undefined; // multivalued scalars degrade to hidden for Phase 0
    const scalar = named.name ?? '';
    if (scalar === 'ID' || ID_FIELD_NAMES.has(field.name)) return { ...base, kind: 'id' };
    if (NUMBER_SCALARS.has(scalar)) return { ...base, kind: 'number' };
    if (scalar === 'Boolean') return { ...base, kind: 'boolean' };
    if (DATE_SCALARS.has(scalar)) return { ...base, kind: 'date' };
    return { ...base, kind: 'text' };
  }

  if (named.kind === 'ENUM') {
    if (list) return undefined;
    const enumType = findType(schema, named.name);
    return { ...base, kind: 'enum', enumValues: enumType?.enumValues?.map((v) => v.name) ?? [] };
  }

  if (named.kind === 'OBJECT') {
    const target = findType(schema, named.name);
    if (!target) return undefined;
    const targetIdField = idishField(target);
    if (!targetIdField) return undefined;
    return {
      ...base,
      kind: list ? 'refList' : 'ref',
      targetType: target.name,
      targetIdField,
    };
  }

  return undefined;
}

/**
 * A Query field is a browsable collection when it returns a list of OBJECTs.
 * Nav derives all of them (derive-all; config reorder/relabel/hide is later —
 * R3.1).
 */
export function deriveCollections(schema: IntrospectionSchema): CollectionModel[] {
  const queryType = findType(schema, schema.queryType.name);
  const collections: CollectionModel[] = [];

  for (const field of queryType?.fields ?? []) {
    if (!isListType(field.type)) continue;
    const named = namedType(field.type);
    if (named.kind !== 'OBJECT' || named.name == null) continue;
    const entityType = findType(schema, named.name);
    if (!entityType?.fields?.length) continue;
    // Introspection meta types are filtered by the server; skip defensively.
    if (named.name.startsWith('__')) continue;

    const columns: ColumnModel[] = [];
    for (const entityField of entityType.fields) {
      if (columns.length >= MAX_COLUMNS) break;
      const column = columnFor(entityField, schema);
      if (column) columns.push(column);
    }
    if (columns.length === 0) continue;

    collections.push({
      id: field.name,
      label: humanize(field.name),
      typeName: named.name,
      columns,
      args: {
        limit: argNamed(field, 'limit', 'first'),
        offset: argNamed(field, 'offset', 'skip'),
        filter: argNamed(field, 'filter', 'where', 'filters'),
        search: argNamed(field, 'search', 'q', 'fts', 'query'),
        orderBy: argNamed(field, 'orderBy', 'order_by', 'sort'),
      },
    });
  }

  return collections;
}

/**
 * Capability negotiation (N5.1): every flag derives from what introspection
 * actually shows. On Hippo today that yields FTS + equality facets + offset
 * pages + relationship traversal + batch write; sort/aggregation stay off
 * until Hippo X1 advertises them (ADR-0029 — never fake).
 */
export function deriveCapabilities(
  schema: IntrospectionSchema,
  collections: CollectionModel[],
): Capabilities {
  const queryType = findType(schema, schema.queryType.name);
  const hasHippoSchema = (queryType?.fields ?? []).some((f) => f.name === 'hippoSchema');
  const mutationType = findType(schema, schema.mutationType?.name ?? null);

  const some = (pick: (c: CollectionModel) => unknown) => collections.some((c) => Boolean(pick(c)));

  const relationshipTraversal = collections.some((c) =>
    c.columns.some((col) => col.kind === 'ref' || col.kind === 'refList'),
  );

  return {
    schemaIntrospection: hasHippoSchema ? 'hippo' : 'graphql',
    offsetPagination: some((c) => c.args.limit && c.args.offset),
    equalityFacets: some((c) => c.args.filter),
    fullTextSearch:
      some((c) => c.args.search) ||
      (queryType?.fields ?? []).some((f) => /^search/i.test(f.name)),
    sort: some((c) => c.args.orderBy),
    aggregation: (queryType?.fields ?? []).some((f) => /aggregate|count/i.test(f.name)),
    relationshipTraversal,
    batchWrite: (mutationType?.fields ?? []).some((f) => /batch|staged/i.test(f.name)),
  };
}
