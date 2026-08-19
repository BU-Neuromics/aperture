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
        key: 'fwd:donor',
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
        anchor: 'donors',
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
        anchor: 'donors',
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
        anchor: 'donors',
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
        anchor: 'donors',
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
      validateQuerySpec(emptyQuerySpec('nope'), collections, caps).errors[0],
    ).toContain('Unknown anchor');
    expect(
      validateQuerySpec(
        {
          v: 1,
          anchor: 'donors',
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
          anchor: 'donors',
          mode: 'AND',
          criteria: [{ kind: 'related', edge: 'fwd:ghost', quantifier: 'some', criteria: [] }],
        },
        collections,
        caps,
      ).errors[0],
    ).toContain('unknown relationship');
  });

  it('rejects OR mode without a FilterMode combinator', () => {
    const noMode = { ...donors, filterModeArg: undefined };
    const result = validateQuerySpec(
      { v: 1, anchor: 'donors', mode: 'OR', criteria: [] },
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
    expect(() => validateQuerySpecShape({ v: 2 })).toThrow();
    expect(() => validateQuerySpecShape('nope')).toThrow();
  });
});
