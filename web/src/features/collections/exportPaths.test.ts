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
