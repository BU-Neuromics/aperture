import type {
  IntrospectionField,
  IntrospectionSchema,
  IntrospectionType,
} from './introspection';
import { findType, isListType, namedType, typeRefToSDL } from './introspection';
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

/**
 * An equality facet derived from the collection's filter input type (R3.3):
 * enum → checklist, boolean → true/false, ref-id → id equality. Range facets
 * and counts are Hippo X1 and stay underived until advertised (ADR-0029).
 */
export interface FacetModel {
  /** The filter input field name (what the server filters on). */
  field: string;
  label: string;
  kind: 'enum' | 'boolean' | 'ref';
  /** For enum facets: the advertised values. */
  options?: readonly string[];
}

/** How a single entity can be fetched for the detail view (R3.7). */
export type DetailPath =
  | { kind: 'field'; field: string; argName: string; argType: string }
  | { kind: 'filter'; filterField: string };

export interface CollectionModel {
  /** The Query list field, e.g. `subjects` — doubles as the URL collection id. */
  id: string;
  /** Humanized nav/table label, e.g. "Subjects". */
  label: string;
  /** The entity type name, e.g. `Subject`. */
  typeName: string;
  /** The curated table columns (budgeted). */
  columns: ColumnModel[];
  /** The full derivable field set, for the detail view. */
  detailColumns: ColumnModel[];
  /** The field identifying an entity in links/detail (the first id-ish column). */
  idColumn?: string;
  /** Introspected arg names, present only when the endpoint advertises them. */
  args: {
    limit?: string;
    offset?: string;
    filter?: string;
    search?: string;
    orderBy?: string;
  };
  /** SDL types for the advertised args (for variable definitions). */
  argTypes: Partial<Record<'limit' | 'offset' | 'filter' | 'search', string>>;
  /** Equality facets the endpoint's filter input advertises. */
  facets: FacetModel[];
  /** How to fetch one entity, when the endpoint offers a way (else detail gates off). */
  detail?: DetailPath;
}

/** Derived from a Query `entityHistory`-style field, when advertised (R3.7). */
export interface HistoryModel {
  field: string;
  argName: string;
  argType: string;
  /** Scalar columns of the history row type. */
  columns: ColumnModel[];
}

/** Table column budget for the derived default view (curation is later config). */
const MAX_COLUMNS = 8;
/** Field budget for the detail view (all derivable fields, within reason). */
const MAX_DETAIL_COLUMNS = 50;

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

function argNamed(field: IntrospectionField, ...names: string[]) {
  const lower = new Set(names.map((n) => n.toLowerCase()));
  return field.args.find((a) => lower.has(a.name.toLowerCase()));
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

/** Combinator/meta input fields that are not equality facets. */
const COMBINATOR_FIELDS = new Set(['and', 'or', 'not', 'AND', 'OR', 'NOT']);

/**
 * Equality facets derive from the filter input type's own fields (R3.3):
 * whatever the endpoint's filter advertises is facetable — nothing else.
 */
function deriveFacets(
  schema: IntrospectionSchema,
  filterTypeName: string | null,
  columns: ColumnModel[],
): FacetModel[] {
  const filterType = findType(schema, filterTypeName);
  if (filterType?.kind !== 'INPUT_OBJECT') return [];
  const refColumns = new Set(
    columns.filter((c) => c.kind === 'ref' || c.kind === 'id').map((c) => c.field),
  );

  const facets: FacetModel[] = [];
  for (const input of filterType.inputFields ?? []) {
    if (COMBINATOR_FIELDS.has(input.name)) continue;
    const named = namedType(input.type);
    if (named.kind === 'ENUM') {
      const enumType = findType(schema, named.name);
      facets.push({
        field: input.name,
        label: humanize(input.name),
        kind: 'enum',
        options: enumType?.enumValues?.map((v) => v.name) ?? [],
      });
    } else if (named.name === 'Boolean') {
      facets.push({ field: input.name, label: humanize(input.name), kind: 'boolean' });
    } else if (
      (named.name === 'ID' || named.name === 'String') &&
      (refColumns.has(input.name) || /_id$|Id$/.test(input.name))
    ) {
      facets.push({ field: input.name, label: humanize(input.name), kind: 'ref' });
    }
    // Plain text/number inputs are not equality facets (range = Hippo X1).
  }
  return facets;
}

/**
 * A single-entity fetch path (R3.7): prefer a singular Query field returning
 * the entity type with one scalar arg (e.g. `book(id: ID!)`); fall back to an
 * id-equality filter on the list field. Neither advertised → no detail path,
 * detail UI gates off (ADR-0029).
 */
function deriveDetailPath(
  queryFields: IntrospectionField[],
  typeName: string,
  filterType: IntrospectionType | undefined,
  idColumn: string | undefined,
): DetailPath | undefined {
  for (const field of queryFields) {
    if (isListType(field.type)) continue;
    const named = namedType(field.type);
    if (named.kind !== 'OBJECT' || named.name !== typeName) continue;
    const scalarArg = field.args.find((a) => {
      const argNamedType = namedType(a.type);
      return argNamedType.name === 'ID' || argNamedType.name === 'String';
    });
    if (scalarArg) {
      return {
        kind: 'field',
        field: field.name,
        argName: scalarArg.name,
        argType: typeRefToSDL(scalarArg.type),
      };
    }
  }
  if (idColumn && filterType?.kind === 'INPUT_OBJECT') {
    const idInput = (filterType.inputFields ?? []).find((f) => f.name === idColumn);
    if (idInput) return { kind: 'filter', filterField: idInput.name };
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
  const queryFields = queryType?.fields ?? [];
  const collections: CollectionModel[] = [];

  for (const field of queryFields) {
    if (!isListType(field.type)) continue;
    // History is a per-entity query surface (R3.7), not a browsable collection.
    if (/^entityHistory$/i.test(field.name)) continue;
    const named = namedType(field.type);
    if (named.kind !== 'OBJECT' || named.name == null) continue;
    const entityType = findType(schema, named.name);
    if (!entityType?.fields?.length) continue;
    // Introspection meta types are filtered by the server; skip defensively.
    if (named.name.startsWith('__')) continue;

    const detailColumns: ColumnModel[] = [];
    for (const entityField of entityType.fields) {
      if (detailColumns.length >= MAX_DETAIL_COLUMNS) break;
      const column = columnFor(entityField, schema);
      if (column) detailColumns.push(column);
    }
    if (detailColumns.length === 0) continue;
    const columns = detailColumns.slice(0, MAX_COLUMNS);
    const idColumn = (columns.find((c) => c.kind === 'id') ?? columns[0]).field;

    const args = {
      limit: argNamed(field, 'limit', 'first'),
      offset: argNamed(field, 'offset', 'skip'),
      filter: argNamed(field, 'filter', 'where', 'filters'),
      search: argNamed(field, 'search', 'q', 'fts', 'query'),
      orderBy: argNamed(field, 'orderBy', 'order_by', 'sort'),
    };
    const filterTypeName = args.filter ? namedType(args.filter.type).name : null;
    const filterType = findType(schema, filterTypeName);

    collections.push({
      id: field.name,
      label: humanize(field.name),
      typeName: named.name,
      columns,
      detailColumns,
      idColumn,
      args: {
        limit: args.limit?.name,
        offset: args.offset?.name,
        filter: args.filter?.name,
        search: args.search?.name,
        orderBy: args.orderBy?.name,
      },
      argTypes: {
        limit: args.limit && typeRefToSDL(args.limit.type),
        offset: args.offset && typeRefToSDL(args.offset.type),
        filter: args.filter && typeRefToSDL(args.filter.type),
        search: args.search && typeRefToSDL(args.search.type),
      },
      facets: deriveFacets(schema, filterTypeName, detailColumns),
      detail: deriveDetailPath(queryFields, named.name, filterType, idColumn),
    });
  }

  return collections;
}

/**
 * An `entityHistory`-style Query field (R3.7), when advertised: one scalar
 * arg, returns a list of objects with derivable scalar columns.
 */
export function deriveHistory(schema: IntrospectionSchema): HistoryModel | undefined {
  const queryType = findType(schema, schema.queryType.name);
  const field = (queryType?.fields ?? []).find((f) => /^entityHistory$/i.test(f.name));
  if (!field || !isListType(field.type)) return undefined;
  const named = namedType(field.type);
  const rowType = findType(schema, named.name);
  if (rowType?.kind !== 'OBJECT') return undefined;
  const scalarArg = field.args.find((a) => {
    const t = namedType(a.type);
    return t.name === 'ID' || t.name === 'String';
  });
  if (!scalarArg) return undefined;
  const columns = (rowType.fields ?? [])
    .map((f) => columnFor(f, schema))
    .filter((c): c is ColumnModel => c != null && c.kind !== 'ref' && c.kind !== 'refList')
    .slice(0, MAX_COLUMNS);
  if (columns.length === 0) return undefined;
  return {
    field: field.name,
    argName: scalarArg.name,
    argType: typeRefToSDL(scalarArg.type),
    columns,
  };
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
    entityHistory: deriveHistory(schema) != null,
    batchWrite: (mutationType?.fields ?? []).some((f) => /batch|staged/i.test(f.name)),
  };
}
