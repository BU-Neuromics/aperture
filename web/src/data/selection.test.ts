import { describe, expect, it } from 'vitest';
import { deriveCollections } from './schemaModel';
import { demoIntrospection } from './testing/fixtures';
import { pathLabel, selectionForPaths, valueAtPath } from './selection';
import type { PathColumn } from './selection';

const demo = deriveCollections(demoIntrospection);
const find = (id: string) => demo.find((c) => c.id === id)!;
const col = (collectionId: string, field: string) =>
  find(collectionId).detailColumns.find((c) => c.field === field)!;

const at = (path: string[], collectionId: string, field: string): PathColumn => ({
  path,
  column: col(collectionId, field),
  label: field,
});

describe('selectionForPaths', () => {
  it('merges sibling fields into one nested selection', () => {
    const sel = selectionForPaths(
      [at(['donor', 'cohort'], 'donors', 'cohort'), at(['donor', 'ageAtDeath'], 'donors', 'ageAtDeath')],
      find('samples'),
      demo,
    );
    // Two `donor` selections would be legal GraphQL and answered twice. The
    // merge is the reason this is a tree rather than a string join.
    expect(sel.match(/donor \{/g)).toHaveLength(1);
    expect(sel).toContain('cohort');
    expect(sel).toContain('ageAtDeath');
  });

  it('carries the target id into every nested selection', () => {
    const sel = selectionForPaths([at(['donor', 'cohort'], 'donors', 'cohort')], find('samples'), demo);
    // Row-click navigation and stable row keys read it, and under edge-only
    // emission (Mosaic ADR-0005) there is no `donorId` scalar to fall back to.
    expect(sel).toMatch(/donor \{[^}]*\bid\b/);
  });

  it('selects an object for a reference chosen as a leaf', () => {
    const sel = selectionForPaths([at(['donor'], 'samples', 'donor')], find('samples'), demo);
    // There is no scalar to ask for: a bare `donor` is not a valid selection.
    expect(sel).toMatch(/^donor \{ .*id.* \}$/);
  });

  it('traverses a to-many reference', () => {
    const sel = selectionForPaths(
      [at(['inputSamples', 'accession'], 'samples', 'accession')],
      find('workflows'),
      demo,
    );
    expect(sel).toMatch(/inputSamples \{[^}]*accession/);
  });

  it('drops a hop it cannot resolve instead of guessing', () => {
    const sel = selectionForPaths(
      [{ path: ['notAnEdge', 'cohort'], column: col('donors', 'cohort'), label: 'x' }],
      find('samples'),
      demo,
    );
    // Emitting an untypable nested selection would fail server-side with a
    // worse error than simply not offering the column.
    expect(sel).toBe('');
  });

  it('refuses a path deeper than the hop cap', () => {
    const deep = { path: ['a', 'b', 'c', 'd'], column: col('donors', 'cohort'), label: 'x' };
    expect(selectionForPaths([deep], find('samples'), demo)).toBe('');
  });
});

describe('valueAtPath', () => {
  it('reads through nested objects and tolerates an absent hop', () => {
    const row = { donor: { cohort: 'CTE' } };
    expect(valueAtPath(row, ['donor', 'cohort'])).toBe('CTE');
    // An unset reference and a masked field look the same here, and both render
    // as "—" rather than throwing (ADR-0029).
    expect(valueAtPath({ donor: null }, ['donor', 'cohort'])).toBeUndefined();
    expect(valueAtPath({}, ['donor', 'cohort'])).toBeUndefined();
  });
});

describe('pathLabel', () => {
  it('labels a traversal by its path', () => {
    expect(pathLabel(['donor', 'cohort'], find('samples'), demo)).toBe('Donor → Cohort');
    expect(pathLabel(['accession'], find('samples'), demo)).toBe('Accession');
  });
});
