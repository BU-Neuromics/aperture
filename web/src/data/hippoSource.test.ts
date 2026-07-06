import { buildListQuery, connectHippoSource } from './hippoSource';
import { deriveCollections } from './schemaModel';
import { bareSchema, capableSchema, fakeClient } from './testing/fixtures';

describe('buildListQuery', () => {
  it('builds an offset page over the derived columns (refs select their id field)', () => {
    const [books] = deriveCollections(capableSchema());
    const query = buildListQuery(books, 3, 25);
    expect(query).toBe(
      'query ApertureList { books(limit: 25, offset: 50) ' +
        '{ id title published_on page_count in_print format author { id } reviews { id } } }',
    );
  });

  it('omits pagination args when the endpoint does not advertise them (never fakes)', () => {
    const [things] = deriveCollections(bareSchema());
    expect(buildListQuery(things, 1, 25)).toBe('query ApertureList { things { label } }');
  });
});

describe('connectHippoSource', () => {
  it('introspects, then serves schema-derived pages', async () => {
    const rows = [{ id: 'b1' }, { id: 'b2' }];
    const client = fakeClient(capableSchema(), () => ({ data: { books: rows }, error: null }));
    const source = await connectHippoSource(client);

    expect(source.collections.map((c) => c.id)).toEqual(['books', 'authors']);
    expect(source.capabilities.offsetPagination).toBe(true);

    const page = await source.listEntities('books', 1, 2);
    expect(page.rows).toEqual(rows);
    expect(page.mayHaveMore).toBe(true); // full page — next page may exist

    const short = await connectHippoSource(client).then((s) => s.listEntities('books', 1, 10));
    expect(short.mayHaveMore).toBe(false); // 2 rows < pageSize 10
  });

  it('surfaces introspection failure as an error (honest, not a blank UI)', async () => {
    const failing = {
      async query() {
        return { data: null, error: new Error('boom') };
      },
    };
    await expect(connectHippoSource(failing)).rejects.toThrow(/Could not introspect.*boom/);
  });

  it('rejects unknown collections and invalid paging', async () => {
    const source = await connectHippoSource(fakeClient(capableSchema()));
    await expect(source.listEntities('nope', 1, 25)).rejects.toThrow(/Unknown collection/);
    await expect(source.listEntities('books', 0, 25)).rejects.toThrow(/Invalid page/);
    await expect(source.listEntities('books', 1, 10_000)).rejects.toThrow(/Invalid page size/);
  });

  it('surfaces list-query errors with the collection named', async () => {
    const client = fakeClient(capableSchema(), () => ({
      data: null,
      error: new Error('timeout'),
    }));
    const source = await connectHippoSource(client);
    await expect(source.listEntities('books', 1, 25)).rejects.toThrow(
      /Could not list Books: timeout/,
    );
  });
});
