import { connectHippoSource } from '../data/hippoSource';
import { capableSchema, fakeClient, realIntrospection } from '../data/testing/fixtures';
import {
  createHippoStore,
  createLocalStore,
  findDocumentCollection,
  isLiveDocument,
  openPayload,
  sealPayload,
} from './store';

/** An in-memory Hippo document backend behind the fake client. */
function documentBackend() {
  const docs: { id: string; kind: string; name: string; payload: string }[] = [];
  const client = fakeClient(capableSchema({ documents: true }), (query, variables) => {
    if (query.includes('apertureDocuments')) {
      const filter = (variables['filter'] ?? {}) as Record<string, string>;
      const limit = (variables['limit'] as number) ?? 100;
      const offset = (variables['offset'] as number) ?? 0;
      const matching = docs.filter(
        (d) =>
          (filter['kind'] == null || d.kind === filter['kind']) &&
          (filter['name'] == null || d.name === filter['name']),
      );
      return { data: { apertureDocuments: matching.slice(offset, offset + limit) }, error: null };
    }
    if (query.includes('createApertureDocument')) {
      const input = variables['input'] as Record<string, string>;
      const doc = { id: `DOC-${docs.length + 1}`, ...input } as (typeof docs)[number];
      docs.push(doc);
      return { data: { createApertureDocument: doc }, error: null };
    }
    if (query.includes('updateApertureDocument')) {
      const doc = docs.find((d) => d.id === variables['id']);
      if (doc) Object.assign(doc, variables['input']);
      return { data: { updateApertureDocument: doc ?? null }, error: null };
    }
    return { data: { books: [], authors: [] }, error: null };
  });
  return { client, docs };
}

describe('payload envelopes (versioned + validated — ADR-0003/0004)', () => {
  it('seals and opens with version + structural validation', () => {
    const payload = sealPayload(1, { a: 1 });
    const isObj = (d: unknown): d is { a: number } =>
      typeof d === 'object' && d != null && typeof (d as { a?: unknown }).a === 'number';
    expect(openPayload(payload, 1, isObj)).toEqual({ a: 1 });
    expect(openPayload(payload, 2, isObj)).toBeNull(); // version mismatch
    expect(openPayload('{"v":1,"data":{"a":"x"}}', 1, isObj)).toBeNull(); // invalid shape
    expect(openPayload('not-json', 1, isObj)).toBeNull();
  });
});

describe('findDocumentCollection (structural recognition)', () => {
  it('finds the document collection when the schema advertises one', async () => {
    const source = await connectHippoSource(fakeClient(capableSchema({ documents: true })));
    expect(findDocumentCollection(source)?.id).toBe('apertureDocuments');
  });

  it('is absent otherwise — the store falls back honestly', async () => {
    const source = await connectHippoSource(fakeClient(capableSchema()));
    expect(findDocumentCollection(source)).toBeUndefined();
  });
});

describe('HippoControlPlaneStore (LinkML-on-Hippo reference impl)', () => {
  it('puts (create then update on collision), gets, lists, and retires documents', async () => {
    const { client, docs } = documentBackend();
    const source = await connectHippoSource(client);
    const store = createHippoStore(source, findDocumentCollection(source)!);
    expect(store.backend).toBe('hippo');

    await store.put({ kind: 'savedView', name: 'my view', payload: sealPayload(1, { x: 1 }) });
    expect(docs).toHaveLength(1);

    // Same (kind, name) → update, not a duplicate.
    await store.put({ kind: 'savedView', name: 'my view', payload: sealPayload(1, { x: 2 }) });
    expect(docs).toHaveLength(1);
    expect((await store.get('savedView', 'my view'))?.payload).toBe(sealPayload(1, { x: 2 }));

    await store.put({ kind: 'workflowDraft', name: 'wf', payload: sealPayload(1, {}) });
    expect(await store.list('savedView')).toHaveLength(1);

    // No hard delete (W4.4): remove retires by clearing the payload.
    await store.remove('savedView', 'my view');
    expect(docs).toHaveLength(2); // still there…
    const retired = docs.find((d) => d.kind === 'savedView')!;
    expect(retired.payload).toBe('');
    expect(isLiveDocument(retired)).toBe(false);
  });
});

/**
 * The same backend against the live Hippo shapes (#15): an
 * `{ items total }` page envelope and the generic `[{field, value}]` filter
 * list instead of a per-type filter input.
 */
function envelopeDocumentBackend() {
  const docs: { id: string; kind: string; name: string; payload: string }[] = [];
  const client = fakeClient(realIntrospection, (query, variables) => {
    if (query.includes('apertureDocuments')) {
      const filters = (variables['filters'] ?? []) as { field: string; value: string }[];
      const limit = (variables['limit'] as number) ?? 50;
      const offset = (variables['offset'] as number) ?? 0;
      const matching = docs.filter((d) =>
        filters.every((f) => d[f.field as 'kind' | 'name'] === f.value),
      );
      return {
        data: {
          apertureDocuments: {
            items: matching.slice(offset, offset + limit),
            total: matching.length,
          },
        },
        error: null,
      };
    }
    if (query.includes('createApertureDocument')) {
      const input = variables['input'] as Record<string, string>;
      const doc = { id: `DOC-${docs.length + 1}`, ...input } as (typeof docs)[number];
      docs.push(doc);
      return { data: { createApertureDocument: doc }, error: null };
    }
    if (query.includes('updateApertureDocument')) {
      const doc = docs.find((d) => d.id === variables['id']);
      if (doc) Object.assign(doc, variables['input']);
      return { data: { updateApertureDocument: doc ?? null }, error: null };
    }
    return { data: {}, error: null };
  });
  return { client, docs };
}

describe('HippoControlPlaneStore (live Hippo shapes — #15)', () => {
  it('recognizes the envelope-derived document collection structurally', async () => {
    const source = await connectHippoSource(fakeClient(realIntrospection));
    const collection = findDocumentCollection(source);
    expect(collection?.id).toBe('apertureDocuments');
    expect(collection?.pageShape).toBe('envelope');
  });

  it('round-trips documents through envelope pages and the filter list', async () => {
    const { client, docs } = envelopeDocumentBackend();
    const source = await connectHippoSource(client);
    const store = createHippoStore(source, findDocumentCollection(source)!);

    await store.put({ kind: 'savedView', name: 'my view', payload: sealPayload(1, { x: 1 }) });
    await store.put({ kind: 'savedView', name: 'my view', payload: sealPayload(1, { x: 2 }) });
    expect(docs).toHaveLength(1); // same (kind, name) → update, not a duplicate
    expect((await store.get('savedView', 'my view'))?.payload).toBe(sealPayload(1, { x: 2 }));
    expect(await store.list('savedView')).toHaveLength(1);

    await store.remove('savedView', 'my view');
    expect(docs[0].payload).toBe('');
    expect(await store.get('savedView', 'my view')).toBeNull();

    // The (kind, name) lookup travels as the generic AND-combined filter list.
    const lookup = client.recorded.find((r) =>
      Array.isArray(r.variables['filters']) && (r.variables['filters'] as unknown[]).length === 2,
    );
    expect(lookup?.variables['filters']).toEqual([
      { field: 'kind', value: 'savedView' },
      { field: 'name', value: 'my view' },
    ]);
    expect(lookup?.variables['filterMode']).toBe('AND');
  });
});

describe('LocalControlPlaneStore (fallback)', () => {
  it('round-trips documents in localStorage', async () => {
    window.localStorage.clear();
    const store = createLocalStore();
    expect(store.backend).toBe('local');
    await store.put({ kind: 'savedView', name: 'v1', payload: sealPayload(1, { q: 'x' }) });
    await store.put({ kind: 'config', name: 'workflows', payload: sealPayload(1, []) });
    expect(await store.list('savedView')).toHaveLength(1);
    expect((await store.get('savedView', 'v1'))?.payload).toBe(sealPayload(1, { q: 'x' }));
    await store.remove('savedView', 'v1');
    expect(await store.get('savedView', 'v1')).toBeNull();
  });
});
