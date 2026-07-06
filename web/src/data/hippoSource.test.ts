import {
  buildCreateMutation,
  buildDetailQuery,
  buildListQuery,
  buildUpdateMutation,
  connectHippoSource,
} from './hippoSource';
import { deriveCollections } from './schemaModel';
import { bareSchema, capableSchema, fakeClient } from './testing/fixtures';

describe('buildListQuery', () => {
  it('builds an offset page with typed variables (refs select their id field)', () => {
    const [books] = deriveCollections(capableSchema());
    const { document, variables } = buildListQuery(books, { page: 3, pageSize: 25 });
    expect(document).toBe(
      'query ApertureList($limit: Int, $offset: Int) { books(limit: $limit, offset: $offset) ' +
        '{ id title published_on page_count in_print format author { id } reviews { id } } }',
    );
    expect(variables).toEqual({ limit: 25, offset: 50 });
  });

  it('passes equality filters and search through introspected args', () => {
    const [books] = deriveCollections(capableSchema());
    const { document, variables } = buildListQuery(books, {
      page: 1,
      pageSize: 25,
      filters: { format: 'EBOOK', in_print: true },
      search: 'catalog',
    });
    expect(document).toContain('$filter: BookFilter');
    expect(document).toContain('filter: $filter');
    expect(document).toContain('search: $search');
    expect(variables).toEqual({
      limit: 25,
      offset: 0,
      filter: { format: 'EBOOK', in_print: true },
      search: 'catalog',
    });
  });

  it('omits args the endpoint does not advertise (never fakes)', () => {
    const [things] = deriveCollections(bareSchema());
    const { document, variables } = buildListQuery(things, {
      page: 1,
      pageSize: 25,
      filters: { anything: 'x' },
      search: 'y',
    });
    expect(document).toBe('query ApertureList { things { label } }');
    expect(variables).toEqual({});
  });
});

describe('buildDetailQuery', () => {
  it('prefers the singular field path and selects the full detail column set', () => {
    const [books] = deriveCollections(capableSchema());
    const built = buildDetailQuery(books, 'BK-1')!;
    expect(built.document).toBe(
      'query ApertureDetail($id: ID!) { book(id: $id) ' +
        '{ id title published_on page_count in_print format author { id } reviews { id } } }',
    );
    expect(built.variables).toEqual({ id: 'BK-1' });
  });

  it('returns null when the collection has no detail path', () => {
    const collections = deriveCollections(capableSchema());
    const authors = collections.find((c) => c.id === 'authors')!;
    expect(authors.detail).toBeUndefined();
    expect(buildDetailQuery(authors, 'AU-1')).toBeNull();
  });
});

describe('write mutations (W4.3)', () => {
  it('builds create/update documents from the derived write paths', () => {
    const [books] = deriveCollections(capableSchema());
    const create = buildCreateMutation(books, { title: 'T' })!;
    expect(create.document).toBe(
      'mutation ApertureCreate($input: BookInput!) { createBook(input: $input) { id } }',
    );
    expect(create.variables).toEqual({ input: { title: 'T' } });

    const update = buildUpdateMutation(books, 'BK-1', { page_count: 9 })!;
    expect(update.document).toBe(
      'mutation ApertureUpdate($id: ID!, $input: BookUpdateInput!) ' +
        '{ updateBook(id: $id, input: $input) { id } }',
    );
    // Partial-merge: only the provided fields travel.
    expect(update.variables).toEqual({ id: 'BK-1', input: { page_count: 9 } });
  });

  it('returns null for collections without write paths', () => {
    const collections = deriveCollections(capableSchema());
    const authors = collections.find((c) => c.id === 'authors')!;
    expect(buildCreateMutation(authors, {})).toBeNull();
    expect(buildUpdateMutation(authors, 'AU-1', {})).toBeNull();
  });

  it('createEntity returns the new id; updateEntity surfaces server rejection', async () => {
    const client = fakeClient(capableSchema(), (query) => {
      if (query.includes('ApertureCreate')) {
        return { data: { createBook: { id: 'BK-NEW' } }, error: null };
      }
      if (query.includes('ApertureUpdate')) {
        return { data: null, error: new Error('title must not be empty') };
      }
      return { data: {}, error: null };
    });
    const source = await connectHippoSource(client);
    expect(await source.createEntity('books', { title: 'T' })).toBe('BK-NEW');
    await expect(source.updateEntity('books', 'BK-1', { title: '' })).rejects.toThrow(
      /Could not update Book “BK-1”: title must not be empty/,
    );
    await expect(source.createEntity('authors', {})).rejects.toThrow(/does not support create/);
  });
});

describe('connectHippoSource', () => {
  it('introspects, then serves schema-derived pages', async () => {
    const rows = [{ id: 'b1' }, { id: 'b2' }];
    const client = fakeClient(capableSchema(), () => ({ data: { books: rows }, error: null }));
    const source = await connectHippoSource(client);

    expect(source.collections.map((c) => c.id)).toEqual(['books', 'authors']);
    expect(source.capabilities.offsetPagination).toBe(true);

    const page = await source.listEntities('books', { page: 1, pageSize: 2 });
    expect(page.rows).toEqual(rows);
    expect(page.mayHaveMore).toBe(true); // full page — next page may exist

    const short = await source.listEntities('books', { page: 1, pageSize: 10 });
    expect(short.mayHaveMore).toBe(false); // 2 rows < pageSize 10
  });

  it('fetches a single entity along the detail path', async () => {
    const entity = { id: 'BK-1', title: 'A Book' };
    const client = fakeClient(capableSchema(), (query) =>
      query.includes('ApertureDetail')
        ? { data: { book: entity }, error: null }
        : { data: {}, error: null },
    );
    const source = await connectHippoSource(client);
    expect(await source.getEntity('books', 'BK-1')).toEqual(entity);
  });

  it('fetches entity history when advertised', async () => {
    const entries = [{ timestamp: 't1', action: 'created', actor: 'a' }];
    const client = fakeClient(capableSchema(), (query) =>
      query.includes('ApertureHistory')
        ? { data: { entityHistory: entries }, error: null }
        : { data: {}, error: null },
    );
    const source = await connectHippoSource(client);
    expect(source.capabilities.entityHistory).toBe(true);
    expect(await source.getHistory('BK-1')).toEqual(entries);
    expect(
      client.queries.some((q) => q.includes('entityHistory(entityId: $id)')),
    ).toBe(true);
  });

  it('returns empty history when the endpoint does not advertise it', async () => {
    const source = await connectHippoSource(fakeClient(bareSchema()));
    expect(source.capabilities.entityHistory).toBe(false);
    expect(await source.getHistory('X')).toEqual([]);
  });

  it('surfaces introspection failure as an error (honest, not a blank UI)', async () => {
    const boom = async () => ({ data: null, error: new Error('boom') });
    const failing = { query: boom, mutate: boom };
    await expect(connectHippoSource(failing)).rejects.toThrow(/Could not introspect.*boom/);
  });

  it('rejects unknown collections and invalid paging', async () => {
    const source = await connectHippoSource(fakeClient(capableSchema()));
    await expect(source.listEntities('nope', { page: 1, pageSize: 25 })).rejects.toThrow(
      /Unknown collection/,
    );
    await expect(source.listEntities('books', { page: 0, pageSize: 25 })).rejects.toThrow(
      /Invalid page/,
    );
    await expect(source.listEntities('books', { page: 1, pageSize: 10_000 })).rejects.toThrow(
      /Invalid page size/,
    );
  });

  it('surfaces list-query errors with the collection named', async () => {
    const client = fakeClient(capableSchema(), () => ({
      data: null,
      error: new Error('timeout'),
    }));
    const source = await connectHippoSource(client);
    await expect(source.listEntities('books', { page: 1, pageSize: 25 })).rejects.toThrow(
      /Could not list Books: timeout/,
    );
  });
});
