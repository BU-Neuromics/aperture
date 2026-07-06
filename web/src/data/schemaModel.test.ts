import { deriveCollections, deriveCapabilities, humanize } from './schemaModel';
import { bareSchema, capableSchema } from './testing/fixtures';

describe('humanize', () => {
  it('turns snake_case and camelCase field names into labels', () => {
    expect(humanize('published_on')).toBe('Published on');
    expect(humanize('pageCount')).toBe('Page count');
    expect(humanize('books')).toBe('Books');
  });
});

describe('deriveCollections', () => {
  it('derives a collection per Query list field, with a typed column model', () => {
    const collections = deriveCollections(capableSchema());
    expect(collections.map((c) => c.id)).toEqual(['books', 'authors']);

    const books = collections[0];
    expect(books.label).toBe('Books');
    expect(books.typeName).toBe('Book');
    expect(books.columns).toEqual([
      { field: 'id', label: 'Id', kind: 'id' },
      { field: 'title', label: 'Title', kind: 'text' },
      { field: 'published_on', label: 'Published on', kind: 'date' },
      { field: 'page_count', label: 'Page count', kind: 'number' },
      { field: 'in_print', label: 'In print', kind: 'boolean' },
      {
        field: 'format',
        label: 'Format',
        kind: 'enum',
        enumValues: ['HARDCOVER', 'PAPERBACK', 'EBOOK'],
      },
      { field: 'author', label: 'Author', kind: 'ref', targetType: 'Author', targetIdField: 'id' },
      {
        field: 'reviews',
        label: 'Reviews',
        kind: 'refList',
        targetType: 'Review',
        targetIdField: 'id',
      },
    ]);
  });

  it('records the pagination/filter/search arg names the endpoint advertises', () => {
    const [books, authors] = deriveCollections(capableSchema());
    expect(books.args).toEqual({
      limit: 'limit',
      offset: 'offset',
      filter: 'filter',
      search: 'search',
      orderBy: undefined,
    });
    expect(authors.args.filter).toBeUndefined();
    expect(authors.args.limit).toBe('limit');
  });

  it('skips non-list and introspection fields', () => {
    const collections = deriveCollections(capableSchema({ hippoSchema: true }));
    expect(collections.map((c) => c.id)).toEqual(['books', 'authors']);
  });
});

describe('deriveCapabilities (negotiated, never faked — ADR-0029)', () => {
  it('detects the full Hippo-like surface', () => {
    const schema = capableSchema({ hippoSchema: true });
    const caps = deriveCapabilities(schema, deriveCollections(schema));
    expect(caps).toEqual({
      schemaIntrospection: 'hippo',
      offsetPagination: true,
      equalityFacets: true,
      fullTextSearch: true,
      sort: false, // Hippo X1 not landed — stays off
      aggregation: false, // Hippo X1 not landed — stays off
      relationshipTraversal: true,
      batchWrite: true,
    });
  });

  it('reports standard introspection when hippoSchema is not advertised', () => {
    const schema = capableSchema();
    const caps = deriveCapabilities(schema, deriveCollections(schema));
    expect(caps.schemaIntrospection).toBe('graphql');
  });

  it('gates everything off for a bare endpoint', () => {
    const schema = bareSchema();
    const caps = deriveCapabilities(schema, deriveCollections(schema));
    expect(caps).toEqual({
      schemaIntrospection: 'graphql',
      offsetPagination: false,
      equalityFacets: false,
      fullTextSearch: false,
      sort: false,
      aggregation: false,
      relationshipTraversal: false,
      batchWrite: false,
    });
  });
});
