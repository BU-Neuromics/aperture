import { describe, expect, it } from 'vitest';
import { deriveCollections } from '../data/schemaModel';
import { certIntrospection, demoIntrospection } from '../data/testing/fixtures';
import { compileWhere, supportsRelationship } from './whereCompiler';
import type { QuerySpec } from './querySpec';

const demo = deriveCollections(demoIntrospection);
const cert = deriveCollections(certIntrospection);
const of = (list: typeof demo, id: string) => list.find((c) => c.id === id)!;

const spec = (anchor: string, criteria: QuerySpec['criteria'], mode: 'AND' | 'OR' = 'AND'): QuerySpec => ({
  v: 1,
  anchor,
  mode,
  criteria,
});

describe('compileWhere', () => {
  it('compiles a field condition to its advertised operator member', () => {
    const { where, uncompiled } = compileWhere(
      spec('Donor', [{ kind: 'field', slot: 'age_at_death', op: 'gte', value: 60 }]),
      of(demo, 'donors'),
      demo,
    );
    expect(where).toEqual({ ageAtDeath: { gte: 60 } });
    expect(uncompiled).toEqual([]);
  });

  it('combines under the spec mode', () => {
    const criteria = [
      { kind: 'field' as const, slot: 'cohort', op: 'eq' as const, value: 'CTE' },
      { kind: 'field' as const, slot: 'age_at_death', op: 'lt' as const, value: 50 },
    ];
    expect(compileWhere(spec('Donor', criteria, 'OR'), of(demo, 'donors'), demo).where).toEqual({
      or: [{ cohort: { eq: 'CTE' } }, { ageAtDeath: { lt: 50 } }],
    });
    // A single AND criterion needs no wrapper — the flatter document is the
    // same query and easier to read in an error message.
    expect(compileWhere(spec('Donor', [criteria[0]]), of(demo, 'donors'), demo).where).toEqual({
      cohort: { eq: 'CTE' },
    });
  });

  it('refuses an operator the endpoint does not advertise for that slot', () => {
    // `cohort` is enum-backed: CohortEnumFilterOps carries no `contains`.
    const { where, uncompiled } = compileWhere(
      spec('Donor', [{ kind: 'field', slot: 'cohort', op: 'contains', value: 'CT' }]),
      of(demo, 'donors'),
      demo,
    );
    expect(where).toBeNull();
    expect(uncompiled).toHaveLength(1);
  });

  it('compiles a to-one relationship as a nested filter', () => {
    const { where } = compileWhere(
      spec('Sample', [
        { kind: 'related', edge: 'donor', quantifier: 'some', criteria: [
          { kind: 'field', slot: 'cohort', op: 'eq', value: 'CTE' },
        ] },
      ]),
      of(demo, 'samples'),
      demo,
    );
    // SampleFilter.donor takes a DonorFilter directly — `some` over a single
    // target IS the nested filter.
    expect(where).toEqual({ donor: { cohort: { eq: 'CTE' } } });
  });

  it('compiles a to-many relationship as a quantifier, including none', () => {
    const base = (q: 'some' | 'none') =>
      compileWhere(
        spec('Workflow', [
          { kind: 'related', edge: 'input_samples', quantifier: q, criteria: [
            { kind: 'field', slot: 'sample_type', op: 'eq', value: 'tissue' },
          ] },
        ]),
        of(demo, 'workflows'),
        demo,
      ).where;
    expect(base('some')).toEqual({ inputSamples: { some: { sampleType: { eq: 'tissue' } } } });
    // `none` is the anti-join the validator used to hard-error on; the server
    // has advertised it since v0.13.0.
    expect(base('none')).toEqual({ inputSamples: { none: { sampleType: { eq: 'tissue' } } } });
  });

  it('leaves `none` on a to-one reference uncompiled rather than approximating', () => {
    const { where, uncompiled } = compileWhere(
      spec('Sample', [
        { kind: 'related', edge: 'donor', quantifier: 'none', criteria: [
          { kind: 'field', slot: 'cohort', op: 'eq', value: 'CTE' },
        ] },
      ]),
      of(demo, 'samples'),
      demo,
    );
    // A nested filter cannot say "the reference is unset or fails".
    expect(where).toBeNull();
    expect(uncompiled).toHaveLength(1);
  });

  it('compiles a reverse edge where the schema declares one', () => {
    const { where } = compileWhere(
      spec('Author', [
        { kind: 'related', edge: 'books', quantifier: 'some', criteria: [
          { kind: 'field', slot: 'title', op: 'contains', value: 'Dune' },
        ] },
      ]),
      of(cert, 'authors'),
      cert,
    );
    // `inverse: author` gives AuthorFilter.books quantifiers. Nothing in the
    // client knows this is a "reverse" edge — it compiles like any other.
    expect(where).toEqual({ books: { some: { title: { contains: 'Dune' } } } });
  });

  it('reports no support when nothing declares the edge', () => {
    // The demo schema declares no inverse slots, so Donor has no `samples`.
    expect(supportsRelationship(of(demo, 'donors'), 'rev:samples.donor', 'some')).toBe(false);
    expect(supportsRelationship(of(cert, 'authors'), 'books', 'none')).toBe(true);
  });
});
