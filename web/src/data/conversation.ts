import type { IntrospectionInputValue, IntrospectionSchema, IntrospectionType } from './introspection';
import { findType, namedType, typeRefToSDL } from './introspection';

/**
 * The conversational query surface (ADR-0039): a server-side capability that
 * turns an utterance plus the conversation so far into a `QuerySpec` proposal.
 * Aperture hosts no agent loop and holds no provider key — this module is the
 * wire adapter for a capability the *endpoint* advertises, derived from
 * introspection like every other surface, and gated off when it doesn't fit
 * (ADR-0029).
 *
 * Wire contract (Mosaic `converse_query_spec`, shipped as an MCP tool in
 * mosaic PR #199; the GraphQL mutation twin is tracked in `mosaic-demo-small`'s
 * `add-aperture-chat-panel` Phase 1):
 *
 *   request   { utterance, query_spec, turns, edit_turn_id }
 *   response  { turn, turns, suspended_turn_ids }
 *   turn      { id, utterance, status, message, query_spec }
 *   status    "proposal" | "clarification" | "suspended"
 *
 * `turns` in the RESPONSE is authoritative and replaces the client's list
 * wholesale: editing an earlier turn recomputes every later one server-side, so
 * a client that merged instead of replaced would keep a stale spec and run the
 * wrong query.
 *
 * Field *names* above are the contract's; their **casing is not assumed**. The
 * shipped MCP tool spells them snake_case and a generated GraphQL schema may
 * camelCase them, so each name is resolved by role against both spellings
 * rather than hard-coded — the same derive-don't-assume posture `batch.ts`
 * takes with its own arg names.
 */

/**
 * `error` is the boundary's own status for a turn it could not fulfil — the
 * planning service unreachable, or a candidate spec that failed re-validation.
 * It carries a human-readable reason and no spec. It must NOT fall through to
 * the unrecognized-status fallback: a failure shown as "needs an answer" asks
 * the user to reply to something that never asked them anything.
 */
export type TurnStatus = 'proposal' | 'clarification' | 'suspended' | 'error';

export interface ConversationTurn {
  /**
   * Server-assigned where there is one. An `error` turn may carry none — the
   * boundary returns `id: null` when it never got far enough to mint one — so
   * this can be a locally synthesized key. `editable` says which it is.
   */
  id: string;
  utterance: string;
  status: TurnStatus;
  message: string;
  /** Present on `proposal` turns; the full spec, never a diff. */
  querySpec: unknown | null;
  /**
   * False when the server assigned no id: rewind-and-edit addresses a turn by
   * `editTurnId`, so a turn the server never named cannot be edited, and
   * offering the affordance would send a key it has never seen.
   */
  editable: boolean;
}

export interface ConverseRequest {
  utterance: string;
  /** The draft the conversation has built up to this point, if any. */
  querySpec?: unknown | null;
  turns: ConversationTurn[];
  /** Rewind-and-edit: redo this turn with new wording (ADR-0025). */
  editTurnId?: string | null;
}

export interface ConverseResponse {
  /** The turn this call was about. */
  turn: ConversationTurn;
  /**
   * The FULL conversation after this call — replace your list with it.
   *
   * `null` when the response carried no list at all: either the endpoint does
   * not advertise one, or it returned a bare error turn. Append in that case;
   * never treat it as "the conversation is now empty".
   */
  turns: ConversationTurn[] | null;
  /** Turns an edit invalidated: flagged for re-prompting, never dropped. */
  suspendedTurnIds: string[];
}

export interface ConversationModel {
  /** The mutation field (e.g. `converseQuerySpec`). */
  field: string;
  /** Introspected argument names, by role. */
  args: {
    utterance: string;
    utteranceType: string;
    querySpec?: string;
    querySpecType?: string;
    turns?: string;
    turnsType?: string;
    editTurnId?: string;
    editTurnIdType?: string;
  };
  /** Introspected field names on the response payload type, by role. */
  result: { turn: string; turns?: string; suspendedTurnIds?: string };
  /** Introspected field names on the Turn type, by role. */
  turnFields: {
    id: string;
    utterance: string;
    status: string;
    message: string;
    querySpec?: string;
  };
  /**
   * Field names to use when sending turns back. Equal to `turnFields` when the
   * argument takes a typed input object; when it takes a JSON scalar the
   * contract's own snake_case spelling is used, since there is no input type to
   * introspect and the server parses the payload itself.
   */
  turnInputFields: {
    id: string;
    utterance: string;
    status: string;
    message: string;
    querySpec: string;
  };
}

/** The contract's name for a role, in the two casings it could ship as. */
function spellings(snake: string): string[] {
  const camel = snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  return camel === snake ? [snake] : [snake, camel];
}

function pick<T extends { name: string }>(items: readonly T[], role: string): T | undefined {
  const candidates = spellings(role);
  return items.find((i) => candidates.some((c) => c.toLowerCase() === i.name.toLowerCase()));
}

/**
 * The conversational surface, or `undefined` when the endpoint doesn't offer a
 * usable one. A name match alone is never a capability (ADR-0029): the mutation
 * must take an utterance and return a payload carrying a turn whose own shape
 * resolves, or the panel stays off.
 */
export function deriveConversationModel(schema: IntrospectionSchema): ConversationModel | undefined {
  const mutationType = findType(schema, schema.mutationType?.name ?? null);
  for (const field of mutationType?.fields ?? []) {
    const utterance = pick(field.args, 'utterance');
    if (!utterance) continue;
    if (namedType(utterance.type).kind !== 'SCALAR') continue;

    const payload = findType(schema, namedType(field.type).name);
    const payloadFields = payload?.fields ?? [];
    const turn = pick(payloadFields, 'turn');
    if (!turn) continue;

    const turnType = findType(schema, namedType(turn.type).name);
    const turnFieldDefs = turnType?.fields ?? [];
    const id = pick(turnFieldDefs, 'id');
    const turnUtterance = pick(turnFieldDefs, 'utterance');
    const status = pick(turnFieldDefs, 'status');
    const message = pick(turnFieldDefs, 'message');
    if (!id || !turnUtterance || !status || !message) continue;

    const turnsArg = pick(field.args, 'turns');
    const turnsInput = turnsArg ? findType(schema, namedType(turnsArg.type).name) : undefined;
    const turnQuerySpec = pick(turnFieldDefs, 'query_spec');

    return {
      field: field.name,
      args: {
        utterance: utterance.name,
        utteranceType: typeRefToSDL(utterance.type),
        ...argRole(field.args, 'query_spec', 'querySpec'),
        ...argRole(field.args, 'turns', 'turns'),
        ...argRole(field.args, 'edit_turn_id', 'editTurnId'),
      },
      result: {
        turn: turn.name,
        turns: pick(payloadFields, 'turns')?.name,
        suspendedTurnIds: pick(payloadFields, 'suspended_turn_ids')?.name,
      },
      turnFields: {
        id: id.name,
        utterance: turnUtterance.name,
        status: status.name,
        message: message.name,
        querySpec: turnQuerySpec?.name,
      },
      turnInputFields: turnInputNames(turnsInput),
    };
  }
  return undefined;
}

function argRole(
  args: readonly IntrospectionInputValue[],
  role: string,
  key: 'querySpec' | 'turns' | 'editTurnId',
): Record<string, string> {
  const arg = pick(args, role);
  if (!arg) return {};
  return { [key]: arg.name, [`${key}Type`]: typeRefToSDL(arg.type) };
}

/**
 * How to spell a turn we send back. A typed input object tells us directly; a
 * JSON scalar (or an absent arg) leaves the contract's own spelling, which is
 * what the handler parses.
 */
function turnInputNames(input: IntrospectionType | undefined): ConversationModel['turnInputFields'] {
  const contract = {
    id: 'id',
    utterance: 'utterance',
    status: 'status',
    message: 'message',
    querySpec: 'query_spec',
  };
  if (!input || input.kind !== 'INPUT_OBJECT') return contract;
  const fields = input.inputFields ?? [];
  const named = (role: string, fallback: string) => pick(fields, role)?.name ?? fallback;
  return {
    id: named('id', contract.id),
    utterance: named('utterance', contract.utterance),
    status: named('status', contract.status),
    message: named('message', contract.message),
    querySpec: named('query_spec', contract.querySpec),
  };
}

export interface BuiltConverse {
  document: string;
  variables: Record<string, unknown>;
}

export function buildConverseMutation(
  model: ConversationModel,
  request: ConverseRequest,
): BuiltConverse {
  const varDefs = [`$utterance: ${model.args.utteranceType}`];
  const args = [`${model.args.utterance}: $utterance`];
  const variables: Record<string, unknown> = { utterance: request.utterance };

  if (model.args.querySpec && request.querySpec != null) {
    varDefs.push(`$querySpec: ${model.args.querySpecType}`);
    args.push(`${model.args.querySpec}: $querySpec`);
    variables['querySpec'] = request.querySpec;
  }
  if (model.args.turns) {
    varDefs.push(`$turns: ${model.args.turnsType}`);
    args.push(`${model.args.turns}: $turns`);
    variables['turns'] = request.turns.map((t) => ({
      [model.turnInputFields.id]: t.id,
      [model.turnInputFields.utterance]: t.utterance,
      [model.turnInputFields.status]: t.status,
      [model.turnInputFields.message]: t.message,
      [model.turnInputFields.querySpec]: t.querySpec ?? null,
    }));
  }
  if (model.args.editTurnId && request.editTurnId) {
    varDefs.push(`$editTurnId: ${model.args.editTurnIdType}`);
    args.push(`${model.args.editTurnId}: $editTurnId`);
    variables['editTurnId'] = request.editTurnId;
  }

  const turnSelection = [
    model.turnFields.id,
    model.turnFields.utterance,
    model.turnFields.status,
    model.turnFields.message,
    model.turnFields.querySpec,
  ]
    .filter(Boolean)
    .join(' ');

  const resultSelection = [
    `${model.result.turn} { ${turnSelection} }`,
    model.result.turns ? `${model.result.turns} { ${turnSelection} }` : '',
    model.result.suspendedTurnIds ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    document: `mutation ApertureConverse(${varDefs.join(', ')}) {
      ${model.field}(${args.join(', ')}) { ${resultSelection} }
    }`,
    variables,
  };
}

const STATUSES: readonly string[] = ['proposal', 'clarification', 'suspended', 'error'];

function normalizeTurn(model: ConversationModel, raw: unknown): ConversationTurn | null {
  if (raw == null || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = row[model.turnFields.id];
  const message = row[model.turnFields.message];
  const status = row[model.turnFields.status];
  // Only the message is load-bearing. An id is NOT required: Mosaic's error
  // turns carry `id: null` (it never got far enough to mint one), and dropping
  // those would replace a plain explanation the user needs — "could not reach
  // the planning service" — with silence or a shape complaint about our own
  // parsing. Found driving a real endpoint; the stub always set an id.
  if (typeof message !== 'string') return null;
  const editable = typeof id === 'string' && id !== '';
  const normalized = typeof status === 'string' ? status.toLowerCase() : '';
  return {
    id: editable ? (id as string) : `local:${normalized || 'turn'}:${message.slice(0, 24)}`,
    editable,
    utterance: String(row[model.turnFields.utterance] ?? ''),
    // An unrecognized status is surfaced as a clarification rather than
    // guessed into a proposal — a proposal is the only status that changes
    // the draft, so an unknown one must never silently do that.
    status: (STATUSES.includes(normalized) ? normalized : 'clarification') as TurnStatus,
    message,
    querySpec: model.turnFields.querySpec ? (row[model.turnFields.querySpec] ?? null) : null,
  };
}

export function normalizeConverseResult(
  model: ConversationModel,
  payload: unknown,
): ConverseResponse {
  if (payload == null || typeof payload !== 'object') {
    throw new Error('The endpoint returned an empty conversational response');
  }
  const row = payload as Record<string, unknown>;
  const turn = normalizeTurn(model, row[model.result.turn]);
  if (!turn) throw new Error('The endpoint returned a turn Aperture could not read');

  const rawTurns = model.result.turns ? row[model.result.turns] : null;
  const turns = Array.isArray(rawTurns)
    ? rawTurns.map((t) => normalizeTurn(model, t)).filter((t): t is ConversationTurn => t != null)
    : [];

  const rawSuspended = model.result.suspendedTurnIds ? row[model.result.suspendedTurnIds] : null;
  return {
    turn,
    // `null` means "this response carried no authoritative list" — NOT "the
    // conversation is now just this turn". The distinction is load-bearing:
    // Mosaic's boundary returns a bare error turn with no `turns` key when a
    // candidate spec fails re-validation (mcp/server.py — the ADR-0010 relay
    // re-validates the proposed turn *and* every recomputed one). Collapsing
    // to `[turn]` there would discard the whole transcript on a server-side
    // validation error, which is exactly what suspend-don't-discard forbids
    // (ADR-0025, now Reel ADR-0004). The caller appends instead.
    turns: turns.length > 0 ? turns : null,
    suspendedTurnIds: Array.isArray(rawSuspended) ? rawSuspended.map(String) : [],
  };
}

/** The draft the conversation has built: the newest proposal's spec. */
export function currentQuerySpec(turns: readonly ConversationTurn[]): unknown | null {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (turn.status === 'proposal' && turn.querySpec != null) return turn.querySpec;
  }
  return null;
}
