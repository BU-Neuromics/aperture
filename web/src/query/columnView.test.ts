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

  it('keeps at most one explode', () => {
    const { pathColumns } = decodeColumns(
      {
        paths: [
          { path: ['inputSamples', 'accession'], mode: 'explode' },
          { path: ['inputSamples', 'id'], mode: 'explode' },
        ],
      },
      of('workflows'),
      collections,
    );
    expect(pathColumns.filter((c) => c.many?.mode === 'explode')).toHaveLength(1);
  });

  it('rejects malformed shapes', () => {
    expect(() => validateColumnsShape('x')).toThrow();
    expect(() => validateColumnsShape({ paths: [{ path: [] }] })).toThrow();
    expect(() => validateColumnsShape({ paths: [{ path: ['a', 'b'], mode: 'bogus' }] })).toThrow();
    expect(() => validateColumnsShape({ hidden: [1] })).toThrow();
    expect(validateColumnsShape({})).toEqual({});
  });
});
