/**
 * Joined (traversal) columns in exported files.
 *
 * The screen labels a traversal with arrows ("Sample → Donor → Age at death");
 * a file goes to R or pandas, so its headers use the dotted convention
 * (`Sample.Donor.age_at_death`) and anchor fields use their slot name. The rows
 * are exactly the screen's rows: an exploded table exports one line per member.
 */
import { describe, expect, it } from 'vitest';
import type { ColumnModel } from '../../data/schemaModel';
import type { PathColumn } from '../../data/selection';
import { flattenRows } from '../../data/selection';
import { exportHeaders, toCSVPaths, toJSONExportPaths } from './export';

const column = (field: string, kind: ColumnModel['kind'] = 'text'): ColumnModel =>
  ({ field, label: field, kind }) as ColumnModel;

const name: PathColumn = { path: ['name'], column: column('name'), label: 'Name', exportName: 'name' };
const age: PathColumn = {
  path: ['inputSamples', 'donor', 'ageAtDeath'],
  column: column('ageAtDeath', 'number'),
  label: 'Sample → Donor → Age at death',
  exportName: 'Sample.Donor.age_at_death',
  many: { mode: 'explode', depth: 1 },
};
const accession: PathColumn = {
  path: ['inputSamples', 'accession'],
  column: column('accession'),
  label: 'Sample → Accession',
  exportName: 'Sample.accession',
  many: { mode: 'explode', depth: 1 },
};

const rows = [
  {
    id: 'w1',
    name: 'rna-1',
    inputSamples: [
      { id: 's1', accession: 'A1', donor: { id: 'd1', ageAtDeath: 71 } },
      { id: 's2', accession: 'A2', donor: { id: 'd2', ageAtDeath: 64 } },
    ],
  },
  { id: 'w2', name: 'rna-2', inputSamples: [] },
];

describe('export of joined columns', () => {
  it('uses dotted names in the CSV header and one line per exploded member', () => {
    const cols = [name, accession, age];
    const csv = toCSVPaths(cols, flattenRows(rows, cols, 'id').rows).trim().split(/\r?\n/);
    expect(csv[0]).toBe('name,Sample.accession,Sample.Donor.age_at_death');
    expect(csv.slice(1)).toEqual(['rna-1,A1,71', 'rna-1,A2,64', 'rna-2,,']);
  });

  it('uses the same names as JSON keys', () => {
    const cols = [name, age];
    const json = JSON.parse(toJSONExportPaths(cols, flattenRows(rows, cols, 'id').rows));
    expect(json[0]).toEqual({ name: 'rna-1', 'Sample.Donor.age_at_death': 71 });
    expect(json[2]).toEqual({ name: 'rna-2', 'Sample.Donor.age_at_death': null });
  });

  it('falls back to the path when two columns would share a name', () => {
    const viaOutputs: PathColumn = { ...accession, path: ['outputSamples', 'accession'] };
    expect(exportHeaders([accession, viaOutputs])).toEqual(['inputSamples.accession', 'outputSamples.accession']);
  });

  it('falls back to the screen label when no export name is set', () => {
    expect(exportHeaders([{ ...name, exportName: undefined }])).toEqual(['Name']);
  });
});

/**
 * Structured values and references must read as text everywhere the table's
 * values become text, not only on screen. Mosaic passes STRUCTURED slots (a
 * quantity `{ value, unit }`) through as JSON objects and references as
 * `{ id }` envelopes: `String()` turns either into "[object Object]", and the
 * `joinIds` summary used to drop them, leaving a blank cell.
 */
describe('structured and reference values in joined columns', () => {
  const ref = (field: string): ColumnModel =>
    ({ field, label: field, kind: 'ref', targetIdField: 'id' }) as ColumnModel;
  const volume = (mode: 'explode' | 'joinIds'): PathColumn => ({
    path: ['inputSamples', 'volume'],
    column: column('volume'),
    label: 'Sample → Volume',
    exportName: 'Sample.volume',
    many: { mode, depth: 1 },
  });
  const donor = (mode: 'explode' | 'joinIds'): PathColumn => ({
    path: ['inputSamples', 'donor'],
    column: ref('donor'),
    label: 'Sample → Donor',
    exportName: 'Sample.donor',
    many: { mode, depth: 1 },
  });
  const quantity: PathColumn = { path: ['yield'], column: column('yield'), label: 'Yield', exportName: 'yield' };
  const structured = [
    {
      id: 'w1',
      name: 'rna-1',
      yield: { value: 12, unit: 'ng' },
      inputSamples: [
        { id: 's1', volume: { value: 5, unit: 'uL' }, donor: { id: 'd1' } },
        { id: 's2', volume: { value: 7, unit: 'uL' }, donor: { id: 'd2' } },
      ],
    },
  ];

  it('exports an anchor structured value as text, not [object Object]', () => {
    const csv = toCSVPaths([quantity], flattenRows(structured, [quantity], 'id').rows);
    expect(csv).not.toContain('[object Object]');
    expect(csv.split('\r\n')[1]).toBe('value: 12 · unit: ng');
  });

  it('exports an exploded reference as its id, not [object Object]', () => {
    const cols = [name, donor('explode')];
    const csv = toCSVPaths(cols, flattenRows(structured, cols, 'id').rows);
    expect(csv.split('\r\n').slice(1, 3)).toEqual(['rna-1,d1', 'rna-1,d2']);
  });

  it('lists structured members in a joinIds summary instead of a blank', () => {
    const out = flattenRows(structured, [volume('joinIds')], 'id');
    expect(out.rows[0].values['inputSamples.volume']).toBe('value: 5 · unit: uL; value: 7 · unit: uL');
  });

  it('lists referenced members by id in a joinIds summary instead of a blank', () => {
    const out = flattenRows(structured, [donor('joinIds')], 'id');
    expect(out.rows[0].values['inputSamples.donor']).toBe('d1; d2');
  });
});
