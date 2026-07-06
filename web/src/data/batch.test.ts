import { buildBatchMutation, deriveBatchModel, normalizeBatchResult } from './batch';
import { connectHippoSource } from './hippoSource';
import { bareSchema, capableSchema, fakeClient } from './testing/fixtures';

describe('deriveBatchModel (ADR-0028 / Hippo #84)', () => {
  it('derives the batch surface when the shape is usable', () => {
    const model = deriveBatchModel(capableSchema())!;
    expect(model).toEqual({
      field: 'batchPut',
      operationsArgName: 'operations',
      operationsArgType: '[BatchOperationInput!]!',
      dryRunArgName: 'dryRun',
      op: { ref: 'ref', type: 'type', data: 'data' },
      resultSelection: 'ok results { ref id } errors { ref field message }',
    });
  });

  it('is absent on a bare endpoint — capability off, never a name-match guess', () => {
    expect(deriveBatchModel(bareSchema())).toBeUndefined();
    const caps = capableSchema();
    // A /batch/i mutation whose input lacks the op shape does not qualify.
    const bare = bareSchema();
    bare.mutationType = { name: 'Mutation' };
    bare.types.push({
      kind: 'OBJECT',
      name: 'Mutation',
      fields: [
        {
          name: 'batchThing',
          args: [{ name: 'payload', type: { kind: 'SCALAR', name: 'String', ofType: null } }],
          type: { kind: 'SCALAR', name: 'Boolean', ofType: null },
        },
      ],
    });
    expect(deriveBatchModel(bare)).toBeUndefined();
    expect(deriveBatchModel(caps)).toBeDefined();
  });
});

describe('buildBatchMutation', () => {
  it('builds the ops list with introspected field names and the dry-run flag', () => {
    const model = deriveBatchModel(capableSchema())!;
    const { document, variables } = buildBatchMutation(
      model,
      [
        { ref: 'op-1', type: 'Author', data: { name: 'A' } },
        { ref: 'op-2', type: 'Book', data: { title: 'T', author: 'op-1' } },
      ],
      true,
    );
    expect(document).toBe(
      'mutation ApertureBatch($operations: [BatchOperationInput!]!, $dryRun: Boolean) ' +
        '{ batchPut(operations: $operations, dryRun: $dryRun) ' +
        '{ ok results { ref id } errors { ref field message } } }',
    );
    expect(variables).toEqual({
      operations: [
        { ref: 'op-1', type: 'Author', data: { name: 'A' } },
        { ref: 'op-2', type: 'Book', data: { title: 'T', author: 'op-1' } },
      ],
      dryRun: true,
    });
  });
});

describe('normalizeBatchResult', () => {
  it('maps ok/results/errors tolerantly', () => {
    expect(
      normalizeBatchResult({
        ok: false,
        results: [{ ref: 'op-1', id: 'AU-9' }],
        errors: [{ ref: 'op-2', field: 'title', message: 'must not be empty' }],
      }),
    ).toEqual({
      ok: false,
      ids: { 'op-1': 'AU-9' },
      errors: [{ ref: 'op-2', field: 'title', message: 'must not be empty' }],
    });
    expect(normalizeBatchResult(null)).toEqual({ ok: false, ids: {}, errors: [] });
  });
});

describe('source.runBatch', () => {
  it('runs dry-run and commit through the derived surface', async () => {
    const client = fakeClient(capableSchema(), (query, variables) => {
      const dryRun = variables['dryRun'] === true;
      const ops = variables['operations'] as { ref: string }[];
      void query;
      return {
        data: {
          batchPut: {
            ok: true,
            results: dryRun ? [] : ops.map((op, i) => ({ ref: op.ref, id: `ID-${i}` })),
            errors: [],
          },
        },
        error: null,
      };
    });
    const source = await connectHippoSource(client);
    expect(source.capabilities.batchWrite).toBe(true);

    const ops = [{ ref: 'op-1', type: 'Book', data: { title: 'T' } }];
    const dry = await source.runBatch(ops, true);
    expect(dry).toEqual({ ok: true, ids: {}, errors: [] });
    const commit = await source.runBatch(ops, false);
    expect(commit.ids).toEqual({ 'op-1': 'ID-0' });
  });

  it('refuses when the endpoint has no batch surface, and on an empty set', async () => {
    const bare = await connectHippoSource(
      fakeClient(bareSchema(), () => ({ data: {}, error: null })),
    );
    expect(bare.capabilities.batchWrite).toBe(false);
    await expect(bare.runBatch([{ ref: 'x', type: 'T', data: {} }], true)).rejects.toThrow(
      /does not advertise a batch/,
    );
    const capable = await connectHippoSource(fakeClient(capableSchema()));
    await expect(capable.runBatch([], true)).rejects.toThrow(/Nothing staged/);
  });
});
