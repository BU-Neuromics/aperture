import { describe, expect, it } from 'vitest';
import { demoIntrospection } from '../data/testing/fixtures';
import { deriveCollections } from '../data/schemaModel';
import { decodeColumns, encodeColumns, validateColumnsShape } from './columnView';

const collections = deriveCollections(demoIntrospection);
const of = (id: string) => collections.find((c) => c.id === id)!;

describe('cols URL parameter (aperture#73)', () => {
  it('leaves the URL clean in the default state', () => {
    expect(encodeColumns([], new Set())).toBeNull();
  });

  it('round-trips a to-many traversal with its grain', () => {
    const workflows = of('workflows');
    const { pathColumns } = decodeColumns(
      { paths: [{ path: ['inputSamples', 'accession'], mode: 'explode' }] },
      workflows,
      collections,
    );
    expect(pathColumns).toHaveLength(1);
    // Grain is query semantics: a link that lost it would hand the recipient
    // different rows than the sender saw.
    expect(pathColumns[0]!.many?.mode).toBe('explode');
    expect(encodeColumns(pathColumns, new Set())).toEqual({
      paths: [{ path: ['inputSamples', 'accession'], mode: 'explode' }],
    });
  });

  it('round-trips a to-one traversal without inventing a grain', () => {
    const { pathColumns } = decodeColumns({ paths: [{ path: ['donor', 'cohort'] }] }, of('samples'), collections);
    expect(pathColumns[0]!.many).toBeUndefined();
    expect(encodeColumns(pathColumns, new Set())).toEqual({ paths: [{ path: ['donor', 'cohort'] }] });
  });

  it('carries hidden anchor fields, dropping ones the anchor lacks', () => {
    const samples = of('samples');
    const real = samples.columns[0]!.field;
    const { hiddenFields } = decodeColumns({ hidden: [real, 'noSuchField'] }, samples, collections);
    expect([...hiddenFields]).toEqual([real]);
  });

  it('drops unresolvable paths instead of failing the link', () => {
    const { pathColumns } = decodeColumns(
      { paths: [{ path: ['gone', 'x'] }, { path: ['donor', 'nope'] }, { path: ['donor'] }] },
      of('samples'),
      collections,
    );
    expect(pathColumns).toEqual([]);
  });

  it('explodes every column through the exploded link together', () => {
    // "One row each" belongs to the LINK. Two columns through inputSamples are
    // one row per input sample, not a cross product -- the old per-column cap
    // demoted one of them, so the two columns described different samples.
    const { pathColumns } = decodeColumns(
      {
        paths: [
          { path: ['inputSamples', 'accession'], mode: 'explode' },
          { path: ['inputSamples', 'id'], mode: 'count' },
        ],
      },
      of('workflows'),
      collections,
    );
    expect(pathColumns.map((c) => c.many?.mode)).toEqual(['explode', 'explode']);
  });

  it('restores a two-hop column through a list, with its depth and export name', () => {
    const { pathColumns } = decodeColumns(
      { paths: [{ path: ['inputSamples', 'donor', 'cohort'], mode: 'explode' }] },
      of('workflows'),
      collections,
    );
    expect(pathColumns).toHaveLength(1);
    const [col] = pathColumns;
    expect(col!.many).toMatchObject({ mode: 'explode', depth: 1 });
    expect(col!.label).toBe('Sample → Donor → Cohort');
    expect(col!.exportName).toBe('Sample.Donor.cohort');
  });

  it('drops paths it cannot resolve rather than guessing', () => {
    const { pathColumns } = decodeColumns(
      {
        paths: [
          { path: ['inputSamples', 'donor', 'cohort', 'extra'] }, // three hops: over the cap
          { path: ['inputSamples', 'noSuchField'] },
          { path: ['nope', 'cohort'] },
        ],
      },
      of('workflows'),
      collections,
    );
    expect(pathColumns).toEqual([]);
  });

  it('rejects malformed shapes', () => {
    expect(() => validateColumnsShape('x')).toThrow();
    expect(() => validateColumnsShape({ paths: [{ path: [] }] })).toThrow();
    expect(() => validateColumnsShape({ paths: [{ path: ['a', 'b'], mode: 'bogus' }] })).toThrow();
    expect(() => validateColumnsShape({ hidden: [1] })).toThrow();
    expect(validateColumnsShape({})).toEqual({});
  });
});
