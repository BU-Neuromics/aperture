import { describe, expect, it } from 'vitest';
import type { Capabilities } from '../data/capabilities';
import { NO_CAPABILITIES } from '../data/capabilities';
import type { CollectionModel } from '../data/schemaModel';
import { deriveCollections } from '../data/schemaModel';
import { certIntrospection, demoIntrospection } from '../data/testing/fixtures';
import type { QuerySpec } from './querySpec';
import {
  deriveEdges,
  emptyQuerySpec,
  filterSlots,
  validateQuerySpec,
  validateQuerySpecShape,
  canonicalizeQuerySpec,
} from './querySpec';

const donors: CollectionModel = {
  id: 'donors',
  label: 'Donors',
  typeName: 'Donor',
  columns: [
    { field: 'id', label: 'Id', kind: 'id' },
    { field: 'name', label: 'Name', kind: 'text' },
    { field: 'ageAtDeath', label: 'Age At Death', kind: 'number' },
  ],
  detailColumns: [
    { field: 'id', label: 'Id', kind: 'id' },
    { field: 'name', label: 'Name', kind: 'text' },
    { field: 'ageAtDeath', label: 'Age At Death', kind: 'number' },
  ],
  idColumn: 'id',
  pageShape: 'envelope',
  filterShape: 'filterList',
  filterModeArg: { name: 'filterMode', type: 'FilterMode' },
  args: { limit: 'limit', offset: 'offset', filter: 'filters' },
  argTypes: { limit: 'Int!', offset: 'Int!', filter: '[FilterInput!]' },
  facets: [],
  filterFields: ['id', 'name', 'age_at_death'],
  write: {},
  lifecycle: {},
};

const samples: CollectionModel = {
  ...donors,
  id: 'samples',
  label: 'Samples',
  typeName: 'Sample',
  columns: [
    { field: 'id', label: 'Id', kind: 'id' },
    { field: 'tissue', label: 'Tissue', kind: 'enum', enumValues: ['brain', 'liver'] },
    { field: 'donor', label: 'Donor', kind: 'ref', targetType: 'Donor', targetIdField: 'id' },
  ],
  detailColumns: [
    { field: 'id', label: 'Id', kind: 'id' },
    { field: 'tissue', label: 'Tissue', kind: 'enum', enumValues: ['brain', 'liver'] },
    { field: 'donor', label: 'Donor', kind: 'ref', targetType: 'Donor', targetIdField: 'id' },
  ],
  filterFields: ['id', 'tissue', 'donor'],
};

const collections = [donors, samples];

const caps: Capabilities = {
  ...NO_CAPABILITIES,
  equalityFacets: true,
  filterOps: ['EQ', 'IN', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'CONTAINS', 'IS_NULL'],
};

describe('deriveEdges', () => {
  it('derives forward and reverse edges from reference columns', () => {
    const donorEdges = deriveEdges(donors, collections);
    expect(donorEdges).toEqual([
      expect.objectContaining({
        key: 'rev:samples.donor',
        direction: 'reverse',
        relatedCollectionId: 'samples',
        refField: 'donor',
      }),
    ]);

    const sampleEdges = deriveEdges(samples, collections);
    expect(sampleEdges).toEqual([
      expect.objectContaining({
        key: 'donor',
        direction: 'forward',
        relatedCollectionId: 'donors',
      }),
    ]);
  });

  /**
   * ADR-0041. These run against the v0.13.0 capture of the fifteen-collection
   * demo schema rather than the hand-built models above, because the point is
   * what a real generated schema offers.
   */
  describe('against the demo schema (mosaic v0.13.0)', () => {
    const demo = deriveCollections(demoIntrospection);
    const find = (id: string) => demo.find((c) => c.id === id)!;

    it('offers a forward to-many reference, which was skipped entirely before', () => {
      const edges = deriveEdges(find('workflows'), demo);
      const samplesEdge = edges.find((e) => e.key === 'input_samples');
      // `Workflow.inputSamples` is a resolved list with a free `inputSamplesCount`
      // companion. deriveEdges used to test `kind !== 'ref'` on both branches, so
      // this edge existed in the schema and nowhere in the builder.
      expect(samplesEdge).toMatchObject({
        direction: 'forward',
        toMany: true,
        relatedCollectionId: 'samples',
        selectField: 'inputSamples',
      });
    });

    it('marks a to-one reference as selectable and single', () => {
      const donorEdge = deriveEdges(find('samples'), demo).find((e) => e.key === 'donor');
      // No grain decision to make: one Sample has one Donor.
      expect(donorEdge).toMatchObject({ direction: 'forward', toMany: false, selectField: 'donor' });
    });

    it('infers a reverse edge but leaves it unselectable', () => {
      const edges = deriveEdges(find('donors'), demo);
      const reverse = edges.find((e) => e.key === 'rev:samples.donor')!;
      // Nothing on Donor names its samples at v0.13.0 — `Donor.samples` needs a
      // declared `inverse:` slot (Mosaic ADR-0011). So the edge is recoverable
      // for filtering (the semijoin) but has no field to select through, which
      // is what gates reverse display columns honestly rather than silently.
      expect(reverse).toMatchObject({ direction: 'reverse', toMany: true });
      expect(reverse.selectField).toBeUndefined();
    });

    it('gates reverse display columns off when nothing declares the edge', () => {
      const reverse = deriveEdges(find('donors'), demo).find((e) => e.key === 'rev:samples.donor')!;
      // `mosaic-demo-small`'s schema declares no `inverse:` slot, so nothing on
      // Donor names its samples. The edge is still recoverable for filtering,
      // but there is no field to select through — the honest gate (ADR-0029).
      expect(reverse.selectField).toBeUndefined();
    });
  });

  /**
   * The certification fixture (1.1.0) declares `Author.books` with
   * `inverse: author`, so this exercises the post-Wave-1 world against a real
   * generated schema rather than a hand-built model.
   */
  describe('against the certification schema (fixture 1.1.0, mosaic v0.14.0)', () => {
    const cert = deriveCollections(certIntrospection);
    const find = (id: string) => cert.find((c) => c.id === id)!;

    it('prefers the declared reverse edge and drops the inferred duplicate', () => {
      const edges = deriveEdges(find('authors'), cert);
      // Author reaches Book two ways: the declared `books` refList, and an
      // inference from `Book.author` pointing back. Offering both would show
      // one relationship twice under two names.
      expect(edges.filter((e) => e.relatedCollectionId === 'books')).toEqual([
        expect.objectContaining({ key: 'books', direction: 'forward', toMany: true }),
      ]);
      expect(edges.some((e) => e.key.startsWith('rev:books.'))).toBe(false);
    });

    it('makes a declared reverse edge selectable, unlike an inferred one', () => {
      const books = deriveEdges(find('authors'), cert).find((e) => e.key === 'books')!;
      // This is the whole payoff of declaring `inverse:`: the anchor now holds
      // a field, so the edge can carry display columns and not just criteria.
      // No Aperture change made that true — the schema did.
      expect(books.selectField).toBe('books');
    });

    it('offers a stored forward multivalued reference too', () => {
      const coAuthors = deriveEdges(find('books'), cert).find((e) => e.key === 'co_authors');
      expect(coAuthors).toMatchObject({ direction: 'forward', toMany: true, selectField: 'coAuthors' });
    });
  });
});

describe('filterSlots', () => {
  it('resolves slot kinds through the camelCase rename', () => {
    const slots = filterSlots(donors);
    expect(slots.find((s) => s.slot === 'age_at_death')).toMatchObject({
      kind: 'number',
      label: 'Age At Death',
    });
  });
});

describe('validateQuerySpec', () => {
  it('accepts a clean cross-class spec', () => {
    const result = validateQuerySpec(
      {
        v: 1,
        anchor: 'Donor',
        mode: 'AND',
        criteria: [
          { kind: 'field', slot: 'age_at_death', op: 'gt', value: 60 },
          {
            kind: 'related',
            edge: 'rev:samples.donor',
            quantifier: 'some',
            criteria: [{ kind: 'field', slot: 'tissue', op: 'eq', value: 'brain' }],
          },
        ],
      },
      collections,
      caps,
    );
    expect(result.errors).toEqual([]);
  });

  it('rejects operators the endpoint does not advertise', () => {
    const result = validateQuerySpec(
      {
        v: 1,
        anchor: 'Donor',
        mode: 'AND',
        criteria: [{ kind: 'field', slot: 'age_at_death', op: 'gt', value: 60 }],
      },
      collections,
      { ...caps, filterOps: ['EQ', 'IN'] },
    );
    expect(result.errors.some((e) => e.includes('“gt” is not available'))).toBe(true);
  });

  it('rejects operators the slot kind does not support', () => {
    const result = validateQuerySpec(
      {
        v: 1,
        anchor: 'Donor',
        mode: 'AND',
        criteria: [{ kind: 'field', slot: 'name', op: 'gt', value: 'x' }],
      },
      collections,
      caps,
    );
    expect(result.errors.some((e) => e.includes('does not support “gt”'))).toBe(true);
  });

  it('gates the none quantifier off until server relationship predicates', () => {
    const result = validateQuerySpec(
      {
        v: 1,
        anchor: 'Donor',
        mode: 'AND',
        criteria: [
          { kind: 'related', edge: 'rev:samples.donor', quantifier: 'none', criteria: [] },
        ],
      },
      collections,
      caps,
    );
    expect(result.errors.some((e) => e.includes('relationship predicates'))).toBe(true);
  });

  it('rejects unknown anchors, slots, and edges', () => {
    expect(
      validateQuerySpec(emptyQuerySpec('Nope'), collections, caps).errors[0],
    ).toContain('exposes no type');
    expect(
      validateQuerySpec(
        {
          v: 1,
          anchor: 'Donor',
          mode: 'AND',
          criteria: [{ kind: 'field', slot: 'ghost', op: 'eq', value: 1 }],
        },
        collections,
        caps,
      ).errors[0],
    ).toContain('not filterable');
    expect(
      validateQuerySpec(
        {
          v: 1,
          anchor: 'Donor',
          mode: 'AND',
          criteria: [{ kind: 'related', edge: 'ghost', quantifier: 'some', criteria: [] }],
        },
        collections,
        caps,
      ).errors[0],
    ).toContain('unknown relationship');
  });

  it('rejects OR mode without a FilterMode combinator', () => {
    const noMode = { ...donors, filterModeArg: undefined };
    const result = validateQuerySpec(
      { v: 1, anchor: 'Donor', mode: 'OR', criteria: [] },
      [noMode, samples],
      caps,
    );
    expect(result.errors.some((e) => e.includes('OR groups'))).toBe(true);
  });
});

describe('validateQuerySpecShape', () => {
  it('round-trips a valid spec and rejects junk', () => {
    const spec = emptyQuerySpec('donors');
    expect(validateQuerySpecShape(spec)).toEqual(spec);
    expect(() => validateQuerySpecShape({ v: 1 })).toThrow();
    expect(() => validateQuerySpecShape('nope')).toThrow();
  });
});

/**
 * Both dialects carry `v: 1` — the platform wire version, which Mosaic's parser
 * hard-requires and Aperture does not get to bump. The legacy Aperture dialect
 * addressed the anchor by collection id and prefixed forward edges with the
 * GraphQL field name; the platform spelling is LinkML throughout. A bookmarked
 * legacy URL still has to open, and content is the only discriminator.
 */
describe('canonicalizeQuerySpec (legacy dialect → platform spelling)', () => {
  it('rewrites a legacy anchor from collection id to LinkML class name', () => {
    const upgraded = canonicalizeQuerySpec(
      { v: 1, anchor: 'donors', mode: 'AND', criteria: [] },
      collections,
    );
    expect(upgraded).toEqual({ v: 1, anchor: 'Donor', mode: 'AND', criteria: [] });
  });

  it('renames a forward edge through the camelCase → slot translation', () => {
    // `fwd:sampleType` is the GraphQL spelling; v2 carries the LinkML slot.
    const upgraded = canonicalizeQuerySpec(
      {
        v: 1,
        anchor: 'samples',
        mode: 'AND',
        criteria: [{ kind: 'related', edge: 'fwd:sampleType', quantifier: 'some', criteria: [] }],
      },
      collections,
    );
    expect(upgraded?.criteria[0]).toMatchObject({ edge: 'sample_type' });
  });

  // Reverse edges have no LinkML name until the schema declares the inverting
  // slot (Mosaic ADR-0011 / mosaic#204). Stripping `rev:samples.donor` to
  // `donor` would name a slot on Sample, not on the Donor anchor — and collide
  // with the forward edge of the same name.
  it('passes a reverse edge through untouched', () => {
    const upgraded = canonicalizeQuerySpec(
      {
        v: 1,
        anchor: 'donors',
        mode: 'AND',
        criteria: [
          { kind: 'related', edge: 'rev:samples.donor', quantifier: 'some', criteria: [] },
        ],
      },
      collections,
    );
    expect(upgraded?.criteria[0]).toMatchObject({ edge: 'rev:samples.donor' });
  });

  it('leaves an already-canonical spec untouched, by identity', () => {
    const spec: QuerySpec = { v: 1, anchor: 'Donor', mode: 'AND', criteria: [] };
    expect(canonicalizeQuerySpec(spec, collections)).toBe(spec);
  });

  // The version cannot discriminate, so the anchor is read as a type name
  // first. Mosaic generates lowercase-plural ids and PascalCase classes, so
  // this precedence is belt-and-braces — but it is stated, not incidental.
  it('prefers a typeName match over a collection-id match', () => {
    const odd = [{ ...donors, id: 'Sample' }, samples];
    expect(canonicalizeQuerySpec(
      { v: 1, anchor: 'Sample', mode: 'AND', criteria: [] }, odd,
    )).toMatchObject({ anchor: 'Sample' });
  });

  // The canonical version IS 1 — bumping it would be rejected on the wire.
  it('never emits a version other than 1', () => {
    const out = canonicalizeQuerySpec(
      { v: 1, anchor: 'donors', mode: 'AND', criteria: [] }, collections,
    );
    expect(out?.v).toBe(1);
  });

  // Honest degradation (ADR-0029): a half-translated spec would run a query
  // other than the one the user saved.
  it('returns null when the anchor matches neither a type nor a collection', () => {
    expect(
      canonicalizeQuerySpec({ v: 1, anchor: 'gone', mode: 'AND', criteria: [] }, collections),
    ).toBeNull();
  });
});
