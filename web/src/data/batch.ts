import type { IntrospectionSchema, IntrospectionType } from './introspection';
import { findType, isListType, namedType, typeRefToSDL } from './introspection';

/**
 * The batch unit-of-work surface (ADR-0028; Hippo #84): whole-set dry-run
 * validation + one atomic multi-entity commit with intra-batch reference
 * resolution. Like every other surface, the shape derives from mutation
 * introspection and the capability gates off when it doesn't fit.
 *
 * Assumed transport contract (to confirm against a live `hippo serve` — the
 * same confirm-early bucket as the hippoSchema enrichment and filter SDL):
 *
 *   mutation ($operations: [<OpInput>!]!, $dryRun: Boolean) {
 *     batchPut(operations: $operations, dryRun: $dryRun) { ...result }
 *   }
 *
 * where <OpInput> has a local-handle field (`ref`), an entity-type
 * discriminator (`type`), and a payload (`data`, JSON-ish). A `data` value
 * equal to another operation's ref token resolves server-side to that
 * entity's id (intra-batch reference resolution). The result type carries
 * ok/ids/errors, introspected rather than assumed where possible.
 */

export interface BatchModel {
  /** The commit mutation (dryRun=true is the whole-set validate). */
  field: string;
  operationsArgName: string;
  operationsArgType: string;
  dryRunArgName?: string;
  /** Introspected names of the operation input's fields. */
  op: { ref: string; type: string; data: string };
  /** Scalar selection for the result (introspected). */
  resultSelection: string;
}

export interface BatchOperation {
  /** Local handle other operations' data values may reference. */
  ref: string;
  /** Entity type name (e.g. `Book`). */
  type: string;
  data: Record<string, unknown>;
}

export interface BatchOpError {
  ref?: string;
  field?: string;
  message: string;
}

export interface BatchResult {
  ok: boolean;
  /** ref → committed id (empty on dry-run or failure). */
  ids: Record<string, string>;
  errors: BatchOpError[];
}

const REF_FIELD_NAMES = ['ref', 'localId', 'local_id', 'tempId', 'key'];
const TYPE_FIELD_NAMES = ['type', 'entityType', 'entity_type', 'typeName', 'className'];
const DATA_FIELD_NAMES = ['data', 'payload', 'entity', 'attributes', 'values'];
const DRY_RUN_ARG_NAMES = ['dryRun', 'dry_run', 'validateOnly', 'validate_only'];

function fieldNamed(type: IntrospectionType, names: string[]): string | undefined {
  const lower = new Set(names.map((n) => n.toLowerCase()));
  return (type.inputFields ?? []).find((f) => lower.has(f.name.toLowerCase()))?.name;
}

function resultSelectionFor(schema: IntrospectionSchema, resultTypeName: string | null): string {
  const resultType = findType(schema, resultTypeName);
  if (resultType?.kind !== 'OBJECT') return '__typename';
  const parts: string[] = [];
  for (const field of resultType.fields ?? []) {
    const named = namedType(field.type);
    if (named.kind === 'SCALAR' || named.kind === 'ENUM') {
      parts.push(field.name);
    } else if (named.kind === 'OBJECT') {
      const sub = findType(schema, named.name);
      const scalars = (sub?.fields ?? [])
        .filter((f) => {
          const t = namedType(f.type);
          return t.kind === 'SCALAR' || t.kind === 'ENUM';
        })
        .map((f) => f.name);
      if (scalars.length > 0) parts.push(`${field.name} { ${scalars.join(' ')} }`);
    }
  }
  return parts.length > 0 ? parts.join(' ') : '__typename';
}

/**
 * A usable batch surface is a /batch/i mutation taking a list of operation
 * inputs shaped {ref, type, data}. Anything else → undefined → the workflow
 * UI gates off rather than guessing (ADR-0029).
 */
export function deriveBatchModel(schema: IntrospectionSchema): BatchModel | undefined {
  const mutationType = findType(schema, schema.mutationType?.name ?? null);
  for (const field of mutationType?.fields ?? []) {
    if (!/batch/i.test(field.name)) continue;
    const opsArg = field.args.find(
      (a) => isListType(a.type) && namedType(a.type).kind === 'INPUT_OBJECT',
    );
    if (!opsArg) continue;
    const opInput = findType(schema, namedType(opsArg.type).name);
    if (!opInput) continue;
    const ref = fieldNamed(opInput, REF_FIELD_NAMES);
    const type = fieldNamed(opInput, TYPE_FIELD_NAMES);
    const data = fieldNamed(opInput, DATA_FIELD_NAMES);
    if (!ref || !type || !data) continue;
    const dryRunArg = field.args.find((a) =>
      DRY_RUN_ARG_NAMES.some((n) => n.toLowerCase() === a.name.toLowerCase()),
    );
    return {
      field: field.name,
      operationsArgName: opsArg.name,
      operationsArgType: typeRefToSDL(opsArg.type),
      dryRunArgName: dryRunArg?.name,
      op: { ref, type, data },
      resultSelection: resultSelectionFor(schema, namedType(field.type).name),
    };
  }
  return undefined;
}

export function buildBatchMutation(
  model: BatchModel,
  operations: BatchOperation[],
  dryRun: boolean,
): { document: string; variables: Record<string, unknown> } {
  const varDefs = [`$operations: ${model.operationsArgType}`];
  const args = [`${model.operationsArgName}: $operations`];
  const variables: Record<string, unknown> = {
    operations: operations.map((op) => ({
      [model.op.ref]: op.ref,
      [model.op.type]: op.type,
      [model.op.data]: op.data,
    })),
  };
  if (model.dryRunArgName) {
    varDefs.push(`$dryRun: Boolean`);
    args.push(`${model.dryRunArgName}: $dryRun`);
    variables['dryRun'] = dryRun;
  }
  return {
    document: `mutation ApertureBatch(${varDefs.join(', ')}) { ${model.field}(${args.join(', ')}) { ${model.resultSelection} } }`,
    variables,
  };
}

/** Normalizes whatever the endpoint returned into a BatchResult (tolerant). */
export function normalizeBatchResult(raw: unknown): BatchResult {
  const result: BatchResult = { ok: false, ids: {}, errors: [] };
  if (typeof raw !== 'object' || raw == null) return result;
  const record = raw as Record<string, unknown>;
  result.ok = record['ok'] === true || record['success'] === true;

  const errors = record['errors'];
  if (Array.isArray(errors)) {
    for (const entry of errors) {
      if (typeof entry === 'object' && entry != null) {
        const e = entry as Record<string, unknown>;
        result.errors.push({
          ref: typeof e['ref'] === 'string' ? e['ref'] : undefined,
          field: typeof e['field'] === 'string' ? e['field'] : undefined,
          message: String(e['message'] ?? 'validation failed'),
        });
      }
    }
  }

  const results = record['results'] ?? record['ids'];
  if (Array.isArray(results)) {
    for (const entry of results) {
      if (typeof entry === 'object' && entry != null) {
        const r = entry as Record<string, unknown>;
        if (typeof r['ref'] === 'string' && r['id'] != null) {
          result.ids[r['ref']] = String(r['id']);
        }
      }
    }
  }
  return result;
}
