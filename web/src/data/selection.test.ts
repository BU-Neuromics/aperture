import { describe, expect, it } from 'vitest';
import { deriveCollections } from './schemaModel';
import { demoIntrospection } from './testing/fixtures';
import { flattenRows, pathLabel, selectionForPaths, valueAtPath } from './selection';
import type { ManyMode, PathColumn } from './selection';

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

describe('flattenRows', () => {
  const cohort = (mode?: ManyMode): PathColumn => ({
    path: ['inputSamples', 'accession'],
    column: col('samples', 'accession'),
    label: 'Sample → Accession',
    many: mode ? { mode } : undefined,
  });
  const status: PathColumn = { path: ['status'], column: col('workflows', 'status'), label: 'Status' };

  const rows = [
    { id: 'w1', status: 'done', inputSamples: [{ id: 's1', accession: 'A1' }, { id: 's2', accession: 'A2' }] },
    { id: 'w2', status: 'failed', inputSamples: [] },
  ];

  it('keeps anchor grain for count, and reports no grain change', () => {
    const out = flattenRows(rows, [status, cohort('count')], 'id');
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0].values['inputSamples.accession']).toBe(2);
    expect(out.rows[1].values['inputSamples.accession']).toBe(0);
    expect(out.grain).toBeUndefined();
  });

  it('joins member values without changing the row count', () => {
    const out = flattenRows(rows, [status, cohort('joinIds')], 'id');
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0].values['inputSamples.accession']).toBe('A1; A2');
  });

  it('explodes to one row per member and repeats the anchor values', () => {
    const out = flattenRows(rows, [status, cohort('explode')], 'id');
    // The repetition is the feature: w1 appears twice, once per sample.
    expect(out.rows.map((r) => r.values['status'])).toEqual(['done', 'done', 'failed']);
    expect(out.rows.map((r) => r.values['inputSamples.accession'])).toEqual(['A1', 'A2', undefined]);
  });

  it('keeps an anchor with no members when exploding', () => {
    const out = flattenRows(rows, [status, cohort('explode')], 'id');
    // Dropping w2 would turn an explode into a filter — the table would stop
    // agreeing with the result total for a reason nothing on screen explains.
    expect(out.rows.filter((r) => r.anchorId === 'w2')).toHaveLength(1);
  });

  it('states the grain change with both counts', () => {
    const out = flattenRows(rows, [status, cohort('explode')], 'id');
    // "3 rows from 2 workflows" — ADR-0041 requires this wherever the rows are.
    expect(out.grain).toMatchObject({ anchorCount: 2, rowCount: 3 });
  });

  it('gives exploded siblings distinct keys', () => {
    const out = flattenRows(rows, [status, cohort('explode')], 'id');
    // The anchor id alone collides, and React would reuse a row across members.
    expect(new Set(out.rows.map((r) => r.key)).size).toBe(out.rows.length);
    expect(out.rows.every((r) => r.anchorId === 'w1' || r.anchorId === 'w2')).toBe(true);
  });

  it('ignores a second explode rather than multiplying rows', () => {
    const second: PathColumn = {
      path: ['runConfigurations', 'name'],
      column: col('workflows', 'name'),
      label: 'x',
      many: { mode: 'explode' },
    };
    const out = flattenRows(rows, [status, cohort('explode'), second], 'id');
    // A cartesian product has no user model behind it (v1 cap, ADR-0041).
    expect(out.rows).toHaveLength(3);
  });
});
