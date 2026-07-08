import type { IntrospectionSchema, IntrospectionType, TypeRef } from './introspection';
import { findType, isListType, namedType, typeRefToSDL } from './introspection';

/**
 * The batch unit-of-work surface (ADR-0028; Hippo #84): whole-set dry-run
 * validation + one atomic multi-entity commit. Like every other surface, the
 * shape derives from mutation introspection and the capability gates off when
 * it doesn't fit.
 *
 * Real transport contract (confirmed against a live `hippo serve` v0.10.3 —
 * issue #15; capture in `testing/realIntrospection.json`):
 *
 *   mutation ($entities: [BatchEntityInput!]!, $dryRun: Boolean!) {
 *     ingestBatch(entities: $entities, dryRun: $dryRun) {
 *       committed dryRun
 *       validation { passed results { entityId passed failures { tier rule message field } } }
 *       entities relationships   # JSON echoes: { id, entity_type, operation }
 *     }
 *   }
 *
 * where `BatchEntityInput { entityType: String!, data: JSON!, operation }`
 * (data keys are LinkML slot names; `operation` defaults to "insert") and an
 * optional `relationships: [BatchRelationshipInput!]` arg carries explicit
 * `{ sourceId, targetId, relationshipType, metadata }` edges. A read-only
 * `validateBatch(entities)` twin returns just the validation payload.
 *
 * There are NO server-side ref tokens: intra-batch references work by
 * PRE-ASSIGNING client ids — a client-supplied `data.id` becomes the entity's
 * committed id, so a staged entity's reference slots are written directly
 * with the ids assigned to its siblings (`buildIngestBatch` does the wiring).
 *
 * Observed semantics (live, v0.10.3): commits are atomic — any constraint
 * violation (FK, NOT NULL) rolls the whole batch back and surfaces as a
 * top-level GraphQL error, not a validation failure. `validateBatch` and
 * `ingestBatch(dryRun: true)` are PERMISSIVE: they echo the plan and pass
 * structural validation even for unknown entity types, missing required
 * slots, and dangling references — constraint checks run only at commit.
 * The result parsing below still honors `validation.results[].failures`
 * for when Hippo's validation tiers start reporting through it.
 */

export interface BatchModel {
  /** The atomic ingest mutation (dryRun=true is the whole-set validate). */
  field: string;
  entitiesArgName: string;
  entitiesArgType: string;
  relationshipsArgName?: string;
  relationshipsArgType?: string;
  dryRunArgName?: string;
  dryRunArgType?: string;
  /** The read-only validation twin, when advertised (informational — the
   * runner validates via `dryRun: true`, which exercises the commit path). */
  validateField?: string;
  /** Introspected names of the entity input's fields. */
  entity: { entityType: string; data: string };
  /** Scalar selection for the result (introspected, nested). */
  resultSelection: string;
}

export interface BatchOperation {
  /** Local handle other operations' data values may reference. */
  ref: string;
  /** Entity type name (e.g. `Book`). */
  type: string;
  data: Record<string, unknown>;
}

/** An explicit edge; sourceId/targetId may be op refs (rewired to client ids). */
export interface BatchRelationship {
  sourceId: string;
  targetId: string;
  relationshipType: string;
  metadata?: Record<string, unknown>;
}

export interface BatchOpError {
  ref?: string;
  field?: string;
  message: string;
}

export interface BatchResult {
  ok: boolean;
  /** ref → committed id (the pre-assigned client id; empty on dry-run/failure). */
  ids: Record<string, string>;
  errors: BatchOpError[];
}

const ENTITY_TYPE_FIELD_NAMES = ['entityType', 'entity_type', 'type', 'typeName', 'className'];
const DATA_FIELD_NAMES = ['data', 'payload', 'entity', 'attributes', 'values'];
const DRY_RUN_ARG_NAMES = ['dryRun', 'dry_run', 'validateOnly', 'validate_only'];
const RELATIONSHIP_FIELD_NAMES = ['sourceId', 'source_id'];

function fieldNamed(type: IntrospectionType, names: string[]): string | undefined {
  const lower = new Set(names.map((n) => n.toLowerCase()));
  return (type.inputFields ?? []).find((f) => lower.has(f.name.toLowerCase()))?.name;
}

/** True when the ref is a list of the named input object kind. */
function isInputObjectList(ref: TypeRef): boolean {
  return isListType(ref) && namedType(ref).kind === 'INPUT_OBJECT';
}

/**
 * Nested scalar selection for a result object, introspected: scalars/enums
 * (and lists of them — e.g. the JSON entity echoes) select by name, object
 * fields recurse to `depth`. Cycle-guarded; '__typename' when nothing fits.
 */
function resultSelectionFor(
  schema: IntrospectionSchema,
  resultTypeName: string | null,
  depth = 4,
  seen: Set<string> = new Set(),
): string {
  const resultType = findType(schema, resultTypeName);
  if (resultType?.kind !== 'OBJECT' || seen.has(resultType.name)) return '__typename';
  const nextSeen = new Set(seen).add(resultType.name);
  const parts: string[] = [];
  for (const field of resultType.fields ?? []) {
    const named = namedType(field.type);
    if (named.kind === 'SCALAR' || named.kind === 'ENUM') {
      parts.push(field.name);
    } else if (named.kind === 'OBJECT' && depth > 0) {
      const sub = resultSelectionFor(schema, named.name, depth - 1, nextSeen);
      if (sub !== '__typename') parts.push(`${field.name} { ${sub} }`);
    }
  }
  return parts.length > 0 ? parts.join(' ') : '__typename';
}

/**
 * A usable batch surface is a mutation taking a list of entity inputs shaped
 * {entityType, data} plus a dry-run flag (the ingest path), optionally with a
 * relationships list and a validate-only twin over the same entity input.
 * Anything else → undefined → the workflow UI gates off rather than guessing
 * (ADR-0029).
 */
export function deriveBatchModel(schema: IntrospectionSchema): BatchModel | undefined {
  const mutationType = findType(schema, schema.mutationType?.name ?? null);
  const fields = mutationType?.fields ?? [];

  const entityShape = (field: (typeof fields)[number]) => {
    const entitiesArg = field.args.find((a) => isInputObjectList(a.type));
    if (!entitiesArg) return undefined;
    const input = findType(schema, namedType(entitiesArg.type).name);
    if (!input) return undefined;
    const entityType = fieldNamed(input, ENTITY_TYPE_FIELD_NAMES);
    const data = fieldNamed(input, DATA_FIELD_NAMES);
    if (!entityType || !data) return undefined;
    return { entitiesArg, inputName: input.name, entity: { entityType, data } };
  };

  for (const field of fields) {
    const shape = entityShape(field);
    if (!shape) continue;
    const dryRunArg = field.args.find(
      (a) =>
        DRY_RUN_ARG_NAMES.some((n) => n.toLowerCase() === a.name.toLowerCase()) &&
        namedType(a.type).name === 'Boolean',
    );
    // The ingest path is the one that can both validate (dryRun) and commit.
    if (!dryRunArg) continue;

    const relationshipsArg = field.args.find((a) => {
      if (a === shape.entitiesArg || !isInputObjectList(a.type)) return false;
      const relInput = findType(schema, namedType(a.type).name);
      return relInput != null && fieldNamed(relInput, RELATIONSHIP_FIELD_NAMES) != null;
    });
    const validateField = fields.find(
      (f) =>
        f !== field &&
        /validate/i.test(f.name) &&
        entityShape(f)?.inputName === shape.inputName,
    );

    return {
      field: field.name,
      entitiesArgName: shape.entitiesArg.name,
      entitiesArgType: typeRefToSDL(shape.entitiesArg.type),
      relationshipsArgName: relationshipsArg?.name,
      relationshipsArgType: relationshipsArg ? typeRefToSDL(relationshipsArg.type) : undefined,
      dryRunArgName: dryRunArg.name,
      dryRunArgType: typeRefToSDL(dryRunArg.type),
      validateField: validateField?.name,
      entity: shape.entity,
      resultSelection: resultSelectionFor(schema, namedType(field.type).name),
    };
  }
  return undefined;
}

/** A fresh client-assigned entity id (the intra-batch linking currency). */
function newClientId(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  // Non-secure fallback (a client handle, not a credential).
  return `aperture-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface BuiltBatch {
  document: string;
  variables: Record<string, unknown>;
  /** op ref → pre-assigned client id (== the committed entity id). */
  clientIds: Record<string, string>;
}

/**
 * Builds the ingest document with client-id staging: every operation gets a
 * pre-assigned `data.id` (an existing string `data.id` is honored), and any
 * data value equal to another operation's ref is rewritten to that
 * operation's client id — the real intra-batch reference mechanism (no
 * server-side ref tokens exist).
 */
export function buildIngestBatch(
  model: BatchModel,
  operations: BatchOperation[],
  dryRun: boolean,
  relationships: BatchRelationship[] = [],
): BuiltBatch {
  const clientIds: Record<string, string> = {};
  for (const op of operations) {
    const supplied = op.data['id'];
    clientIds[op.ref] =
      typeof supplied === 'string' && supplied.length > 0 ? supplied : newClientId();
  }
  const resolve = (value: unknown): unknown =>
    typeof value === 'string' && value in clientIds ? clientIds[value] : value;

  const varDefs = [`$entities: ${model.entitiesArgType}`];
  const args = [`${model.entitiesArgName}: $entities`];
  const variables: Record<string, unknown> = {
    entities: operations.map((op) => {
      const data: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(op.data)) data[key] = resolve(value);
      data['id'] = clientIds[op.ref];
      return { [model.entity.entityType]: op.type, [model.entity.data]: data };
    }),
  };
  if (relationships.length > 0) {
    if (!model.relationshipsArgName || !model.relationshipsArgType) {
      throw new Error('The endpoint does not accept batch relationships');
    }
    varDefs.push(`$relationships: ${model.relationshipsArgType}`);
    args.push(`${model.relationshipsArgName}: $relationships`);
    variables['relationships'] = relationships.map((rel) => ({
      ...rel,
      sourceId: resolve(rel.sourceId),
      targetId: resolve(rel.targetId),
    }));
  }
  if (model.dryRunArgName && model.dryRunArgType) {
    varDefs.push(`$dryRun: ${model.dryRunArgType}`);
    args.push(`${model.dryRunArgName}: $dryRun`);
    variables['dryRun'] = dryRun;
  }
  return {
    document: `mutation ApertureBatch(${varDefs.join(', ')}) { ${model.field}(${args.join(', ')}) { ${model.resultSelection} } }`,
    variables,
    clientIds,
  };
}

/**
 * Normalizes a BatchWriteGraphQLResult into a BatchResult (tolerant), mapping
 * `validation.results[].entityId` / committed entity ids back to op refs via
 * the pre-assigned client ids.
 */
export function normalizeBatchResult(
  raw: unknown,
  clientIds: Record<string, string> = {},
): BatchResult {
  const result: BatchResult = { ok: false, ids: {}, errors: [] };
  if (typeof raw !== 'object' || raw == null) return result;
  const record = raw as Record<string, unknown>;
  const refById = new Map(Object.entries(clientIds).map(([ref, id]) => [id, ref]));

  // Tolerates both the ingest result ({committed, dryRun, validation}) and a
  // bare validation payload ({passed, results}).
  const committed = record['committed'] === true;
  const validation = (
    typeof record['validation'] === 'object' && record['validation'] != null
      ? record['validation']
      : record
  ) as Record<string, unknown>;
  const passed = validation['passed'] === true;
  result.ok = committed || (record['committed'] !== true && passed);

  for (const entry of Array.isArray(validation['results']) ? validation['results'] : []) {
    if (typeof entry !== 'object' || entry == null) continue;
    const r = entry as Record<string, unknown>;
    if (r['passed'] === true) continue;
    const ref = refById.get(String(r['entityId'] ?? ''));
    const failures = Array.isArray(r['failures']) ? r['failures'] : [];
    if (failures.length === 0) {
      result.errors.push({ ref, message: 'validation failed' });
    }
    for (const failure of failures) {
      if (typeof failure !== 'object' || failure == null) continue;
      const f = failure as Record<string, unknown>;
      result.errors.push({
        ref,
        field: typeof f['field'] === 'string' ? f['field'] : undefined,
        message: String(f['message'] ?? 'validation failed'),
      });
    }
  }
  if (result.errors.length > 0) result.ok = false;

  if (committed && result.ok) {
    // Committed entity echoes are JSON blobs shaped { id, entity_type, operation }.
    for (const entry of Array.isArray(record['entities']) ? record['entities'] : []) {
      if (typeof entry !== 'object' || entry == null) continue;
      const id = (entry as Record<string, unknown>)['id'];
      const ref = id != null ? refById.get(String(id)) : undefined;
      if (ref != null && id != null) result.ids[ref] = String(id);
    }
  }
  return result;
}
