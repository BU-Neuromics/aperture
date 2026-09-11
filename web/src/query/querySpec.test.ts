import { describe, expect, it } from 'vitest';
import type { Capabilities } from '../data/capabilities';
import { NO_CAPABILITIES } from '../data/capabilities';
import type { CollectionModel } from '../data/schemaModel';
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
    const spec = { v: 1, anchor: 'Donor', mode: 'AND', criteria: [] } as const;
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
