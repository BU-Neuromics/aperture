import { deriveCollections, deriveCapabilities, deriveHistory, humanize } from './schemaModel';
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

  it('records the pagination/filter/search arg names + types the endpoint advertises', () => {
    const [books, authors] = deriveCollections(capableSchema());
    expect(books.args).toEqual({
      limit: 'limit',
      offset: 'offset',
      filter: 'filter',
      search: 'search',
      orderBy: undefined,
    });
    expect(books.argTypes).toEqual({
      limit: 'Int',
      offset: 'Int',
      filter: 'BookFilter',
      search: 'String',
    });
    expect(books.idColumn).toBe('id');
    expect(authors.args.filter).toBeUndefined();
    expect(authors.args.limit).toBe('limit');
  });

  it('skips non-list, singular-detail, history, and introspection fields', () => {
    const collections = deriveCollections(capableSchema({ hippoSchema: true }));
    expect(collections.map((c) => c.id)).toEqual(['books', 'authors']);
  });

  it('derives equality facets from the filter input type only (R3.3)', () => {
    const [books, authors] = deriveCollections(capableSchema());
    expect(books.facets).toEqual([
      { field: 'format', label: 'Format', kind: 'enum', options: ['HARDCOVER', 'PAPERBACK', 'EBOOK'] },
      { field: 'in_print', label: 'In print', kind: 'boolean' },
      { field: 'author', label: 'Author', kind: 'ref' },
      // 'title' (plain String) and 'or' (combinator) are not equality facets.
    ]);
    expect(authors.facets).toEqual([]); // no filter arg → no facets, gated off
  });

  it('derives the detail path: singular field preferred, absent when unavailable', () => {
    const [books, authors] = deriveCollections(capableSchema());
    expect(books.detail).toEqual({ kind: 'field', field: 'book', argName: 'id', argType: 'ID!' });
    expect(authors.detail).toBeUndefined();
  });
});

describe('deriveWriteModel (W4.1/W4.3)', () => {
  it('derives create/update paths + a serializable form model from the mutation surface', () => {
    const [books] = deriveCollections(capableSchema());
    expect(books.write.create).toEqual({
      field: 'createBook',
      inputArgName: 'input',
      inputArgType: 'BookInput!',
      form: {
        inputTypeName: 'BookInput',
        fields: [
          { name: 'title', label: 'Title', widget: 'text', required: true },
          { name: 'published_on', label: 'Published on', widget: 'date', required: false },
          { name: 'page_count', label: 'Page count', widget: 'number', required: false },
          { name: 'in_print', label: 'In print', widget: 'checkbox', required: false },
          {
            name: 'format',
            label: 'Format',
            widget: 'select',
            required: false,
            options: ['HARDCOVER', 'PAPERBACK', 'EBOOK'],
          },
          {
            name: 'author',
            label: 'Author',
            widget: 'ref',
            required: false,
            targetType: 'Author',
          },
          // multivalued 'tags' has no Tier-0 widget → omitted, never offered
        ],
      },
    });
    expect(books.write.update?.field).toBe('updateBook');
    expect(books.write.update?.idArgName).toBe('id');
    expect(books.write.update?.form.fields.find((f) => f.name === 'title')?.required).toBe(false);
  });

  it('is empty when no mutations target the type (write UI gates off)', () => {
    const collections = deriveCollections(capableSchema());
    const authors = collections.find((c) => c.id === 'authors')!;
    expect(authors.write).toEqual({});
    const [things] = deriveCollections(bareSchema());
    expect(things.write).toEqual({});
  });

  it('form model is plain serializable data (config-as-data seed)', () => {
    const [books] = deriveCollections(capableSchema());
    const form = books.write.create!.form;
    expect(JSON.parse(JSON.stringify(form))).toEqual(form);
  });
});

describe('deriveHistory (R3.7)', () => {
  it('derives the entityHistory surface when advertised', () => {
    expect(deriveHistory(capableSchema())).toEqual({
      field: 'entityHistory',
      argName: 'entityId',
      argType: 'ID!',
      columns: [
        { field: 'timestamp', label: 'Timestamp', kind: 'text' },
        { field: 'action', label: 'Action', kind: 'text' },
        { field: 'actor', label: 'Actor', kind: 'text' },
      ],
    });
  });

  it('is absent on a bare endpoint', () => {
    expect(deriveHistory(bareSchema())).toBeUndefined();
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
      entityHistory: true,
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
      entityHistory: false,
      batchWrite: false,
    });
  });
});
