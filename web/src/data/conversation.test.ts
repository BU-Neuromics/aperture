import { describe, expect, it } from 'vitest';
import type { IntrospectionSchema, IntrospectionType, TypeRef } from './introspection';
import {
  buildConverseMutation,
  currentQuerySpec,
  deriveConversationModel,
  normalizeConverseResult,
} from './conversation';
import type { ConversationTurn } from './conversation';

const scalar = (name: string): TypeRef => ({ kind: 'SCALAR', name });
const object = (name: string): TypeRef => ({ kind: 'OBJECT', name });
const nonNull = (of: TypeRef): TypeRef => ({ kind: 'NON_NULL', name: null, ofType: of });
const list = (of: TypeRef): TypeRef => ({ kind: 'LIST', name: null, ofType: of });

const TURN_TYPE: IntrospectionType = {
  kind: 'OBJECT',
  name: 'ConversationTurn',
  fields: [
    { name: 'id', args: [], type: nonNull(scalar('ID')) },
    { name: 'utterance', args: [], type: nonNull(scalar('String')) },
    { name: 'status', args: [], type: nonNull(scalar('String')) },
    { name: 'message', args: [], type: nonNull(scalar('String')) },
    { name: 'query_spec', args: [], type: scalar('JSON') },
  ],
};

const PAYLOAD_TYPE: IntrospectionType = {
  kind: 'OBJECT',
  name: 'ConverseResult',
  fields: [
    { name: 'turn', args: [], type: nonNull(object('ConversationTurn')) },
    { name: 'turns', args: [], type: list(object('ConversationTurn')) },
    { name: 'suspended_turn_ids', args: [], type: list(scalar('ID')) },
  ],
};

/** The shape Mosaic's mutation is contracted to expose. */
function conversationalSchema(overrides: Partial<{
  fieldName: string;
  args: { name: string; type: TypeRef }[];
  turnType: IntrospectionType;
  payloadType: IntrospectionType;
}> = {}): IntrospectionSchema {
  const {
    fieldName = 'converseQuerySpec',
    args = [
      { name: 'utterance', type: nonNull(scalar('String')) },
      { name: 'query_spec', type: scalar('JSON') },
      { name: 'turns', type: list(scalar('JSON')) },
      { name: 'edit_turn_id', type: scalar('ID') },
    ],
    turnType = TURN_TYPE,
    payloadType = PAYLOAD_TYPE,
  } = overrides;
  return {
    queryType: { name: 'Query' },
    mutationType: { name: 'Mutation' },
    types: [
      { kind: 'OBJECT', name: 'Query', fields: [] },
      {
        kind: 'OBJECT',
        name: 'Mutation',
        fields: [{ name: fieldName, args, type: nonNull(object(payloadType.name)) }],
      },
      turnType,
      payloadType,
    ],
  };
}

describe('deriveConversationModel (ADR-0039 capability gate)', () => {
  it('derives the surface from the contracted shape', () => {
    const model = deriveConversationModel(conversationalSchema());
    expect(model?.field).toBe('converseQuerySpec');
    expect(model?.args.utterance).toBe('utterance');
    expect(model?.args.querySpec).toBe('query_spec');
    expect(model?.args.editTurnId).toBe('edit_turn_id');
    expect(model?.result.turns).toBe('turns');
    expect(model?.result.suspendedTurnIds).toBe('suspended_turn_ids');
    expect(model?.turnFields.querySpec).toBe('query_spec');
  });

  it('accepts the camelCase spelling of the same contract', () => {
    const model = deriveConversationModel(
      conversationalSchema({
        args: [
          { name: 'utterance', type: nonNull(scalar('String')) },
          { name: 'querySpec', type: scalar('JSON') },
          { name: 'editTurnId', type: scalar('ID') },
        ],
        payloadType: {
          ...PAYLOAD_TYPE,
          fields: [
            { name: 'turn', args: [], type: nonNull(object('ConversationTurn')) },
            { name: 'suspendedTurnIds', args: [], type: list(scalar('ID')) },
          ],
        },
        turnType: {
          ...TURN_TYPE,
          fields: [
            { name: 'id', args: [], type: nonNull(scalar('ID')) },
            { name: 'utterance', args: [], type: nonNull(scalar('String')) },
            { name: 'status', args: [], type: nonNull(scalar('String')) },
            { name: 'message', args: [], type: nonNull(scalar('String')) },
            { name: 'querySpec', args: [], type: scalar('JSON') },
          ],
        },
      }),
    );
    expect(model?.args.querySpec).toBe('querySpec');
    expect(model?.args.editTurnId).toBe('editTurnId');
    expect(model?.result.suspendedTurnIds).toBe('suspendedTurnIds');
    expect(model?.turnFields.querySpec).toBe('querySpec');
  });

  it('gates off when the endpoint advertises no mutation at all', () => {
    expect(
      deriveConversationModel({ queryType: { name: 'Query' }, types: [] }),
    ).toBeUndefined();
  });

  // A name match alone is not a capability (ADR-0029) — these all carry a
  // plausible name and are still rejected.
  it('gates off when the mutation takes no utterance', () => {
    const schema = conversationalSchema({ args: [{ name: 'text', type: scalar('String') }] });
    expect(deriveConversationModel(schema)).toBeUndefined();
  });

  it('gates off when the payload carries no turn', () => {
    const schema = conversationalSchema({
      payloadType: {
        kind: 'OBJECT',
        name: 'ConverseResult',
        fields: [{ name: 'ok', args: [], type: scalar('Boolean') }],
      },
    });
    expect(deriveConversationModel(schema)).toBeUndefined();
  });

  it('gates off when the turn type is missing contracted fields', () => {
    const schema = conversationalSchema({
      turnType: {
        kind: 'OBJECT',
        name: 'ConversationTurn',
        fields: [{ name: 'id', args: [], type: scalar('ID') }],
      },
    });
    expect(deriveConversationModel(schema)).toBeUndefined();
  });
});

describe('buildConverseMutation', () => {
  const model = deriveConversationModel(conversationalSchema())!;

  it('sends only the arguments it has values for', () => {
    const built = buildConverseMutation(model, { utterance: 'hello', turns: [] });
    expect(built.variables).toEqual({ utterance: 'hello', turns: [] });
    expect(built.document).toContain('utterance: $utterance');
    expect(built.document).not.toContain('edit_turn_id:');
  });

  it('carries the draft spec and the edited turn id when present', () => {
    const built = buildConverseMutation(model, {
      utterance: 'only tissue',
      querySpec: { v: 1, anchor: 'Sample' },
      turns: [],
      editTurnId: 't1',
    });
    expect(built.variables['querySpec']).toEqual({ v: 1, anchor: 'Sample' });
    expect(built.variables['editTurnId']).toBe('t1');
    expect(built.document).toContain('edit_turn_id: $editTurnId');
  });

  it('spells outgoing turns with the contract field names', () => {
    const turn: ConversationTurn = {
      id: 't1',
      editable: true,
      utterance: 'samples',
      status: 'proposal',
      message: 'All samples.',
      querySpec: { v: 1, anchor: 'Sample' },
    };
    const built = buildConverseMutation(model, { utterance: 'narrow it', turns: [turn] });
    expect(built.variables['turns']).toEqual([
      {
        id: 't1',
        utterance: 'samples',
        status: 'proposal',
        message: 'All samples.',
        query_spec: { v: 1, anchor: 'Sample' },
      },
    ]);
  });
});

describe('normalizeConverseResult', () => {
  const model = deriveConversationModel(conversationalSchema())!;
  const wireTurn = (over: Record<string, unknown> = {}) => ({
    id: 't1',
    utterance: 'samples',
    status: 'proposal',
    message: 'All samples.',
    query_spec: { v: 1, anchor: 'Sample' },
    ...over,
  });

  it('reads the authoritative turn list', () => {
    const result = normalizeConverseResult(model, {
      turn: wireTurn({ id: 't2' }),
      turns: [wireTurn(), wireTurn({ id: 't2' })],
      suspended_turn_ids: ['t1'],
    });
    expect(result.turns?.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(result.suspendedTurnIds).toEqual(['t1']);
    expect(result.turn.id).toBe('t2');
  });

  // `null`, not `[turn]`. Mosaic's boundary returns a bare error turn with no
  // `turns` key when a candidate spec fails re-validation, so "no list came
  // back" must not be readable as "the conversation is now just this turn" —
  // that would discard the transcript on a server-side rejection (ADR-0025).
  // The caller appends; see ChatPanel.
  it('reports an absent turn list as absent rather than as a one-turn conversation', () => {
    const result = normalizeConverseResult(model, { turn: wireTurn() });
    expect(result.turns).toBeNull();
    expect(result.turn.id).toBe('t1');
    expect(result.suspendedTurnIds).toEqual([]);
  });

  it('reads an empty list as absent too, rather than as an erased conversation', () => {
    const result = normalizeConverseResult(model, { turn: wireTurn(), turns: [] });
    expect(result.turns).toBeNull();
  });

  /**
   * Mosaic's boundary returns `id: null` on an error turn — it never got far
   * enough to mint one. Dropping the turn would replace a plain explanation the
   * user needs ("could not reach the planning service") with silence or a
   * complaint about our own parsing. Found driving a real endpoint; the stub
   * always set an id, which is exactly why it hid.
   */
  it('keeps a turn the server assigned no id, and marks it non-editable', () => {
    const result = normalizeConverseResult(model, {
      turn: wireTurn({ id: null, status: 'error', message: 'Could not reach the planner.' }),
    });
    expect(result.turn.message).toBe('Could not reach the planner.');
    expect(result.turn.status).toBe('error');
    // Rewind addresses a turn by server id, so one without an id cannot be redone.
    expect(result.turn.editable).toBe(false);
    expect(result.turn.id).toBeTruthy();
  });

  // `error` is the boundary's own status; showing it as "needs an answer" would
  // ask the user to reply to something that never asked them anything.
  it('keeps error a first-class status rather than folding it into clarification', () => {
    const result = normalizeConverseResult(model, {
      turn: wireTurn({ id: 'e1', status: 'error', message: 'Validation failed.' }),
    });
    expect(result.turn.status).toBe('error');
    expect(result.turn.editable).toBe(true);
  });

  // A proposal is the only status that changes the draft, so an unreadable one
  // must never be guessed into one.
  it('treats an unrecognized status as a clarification', () => {
    const result = normalizeConverseResult(model, { turn: wireTurn({ status: 'weird' }) });
    expect(result.turn.status).toBe('clarification');
  });

  it('throws when the turn is unreadable rather than inventing one', () => {
    expect(() => normalizeConverseResult(model, { turn: { id: 5 } })).toThrow(/could not read/);
    expect(() => normalizeConverseResult(model, null)).toThrow(/empty/);
  });
});

describe('currentQuerySpec', () => {
  const turn = (over: Partial<ConversationTurn>): ConversationTurn => ({
    id: 't',
    editable: true,
    utterance: 'u',
    status: 'proposal',
    message: 'm',
    querySpec: null,
    ...over,
  });

  it('takes the newest proposal that carries a spec', () => {
    expect(
      currentQuerySpec([
        turn({ id: 't1', querySpec: { v: 1, anchor: 'Donor' } }),
        turn({ id: 't2', querySpec: { v: 1, anchor: 'Sample' } }),
      ]),
    ).toEqual({ v: 1, anchor: 'Sample' });
  });

  it('reads past a trailing clarification to the last real draft', () => {
    expect(
      currentQuerySpec([
        turn({ id: 't1', querySpec: { v: 1, anchor: 'Donor' } }),
        turn({ id: 't2', status: 'clarification' }),
      ]),
    ).toEqual({ v: 1, anchor: 'Donor' });
  });

  it('is null before any proposal', () => {
    expect(currentQuerySpec([turn({ status: 'clarification' })])).toBeNull();
  });
});
