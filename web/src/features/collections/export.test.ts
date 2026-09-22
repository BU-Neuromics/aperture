/**
 * Exports must match what the user chose to see.
 *
 * The goal this surface serves ends in "the specific data elements they wish to
 * include" — and a QuerySpec cannot say that, so the projection happens here
 * (the remedy `COLUMNS_NOT_SUPPORTED` itself prescribes: "request full
 * envelopes and project client-side"). A file carrying fields the user hid
 * would quietly contradict the screen it came from.
 */
import { describe, it, expect } from 'vitest';
import type { ColumnModel } from '../../data/schemaModel';
import { toCSV, toJSONExport } from './export';

const col = (field: string, label: string): ColumnModel =>
  ({ field, label, kind: 'scalar' }) as unknown as ColumnModel;

const ROWS = [
  { id: 'D1', ageAtDeath: 78, notes: 'keep' },
  { id: 'D2', ageAtDeath: 61, notes: 'also keep' },
];

describe('toJSONExport', () => {
  it('exports whole rows when no columns are given', () => {
    // Every existing caller relies on this; projecting is opt-in.
    const out = JSON.parse(toJSONExport(ROWS));
    expect(Object.keys(out[0])).toEqual(['id', 'ageAtDeath', 'notes']);
  });

  it('projects to the chosen columns, in their order', () => {
    const out = JSON.parse(toJSONExport(ROWS, [col('id', 'ID'), col('notes', 'Notes')]));
    expect(Object.keys(out[0])).toEqual(['id', 'notes']);
    expect(out[1]).toEqual({ id: 'D2', notes: 'also keep' });
  });

  it('omits a chosen column the rows do not carry, rather than emitting undefined', () => {
    const out = JSON.parse(toJSONExport(ROWS, [col('id', 'ID'), col('absent', 'Absent')]));
    expect(out[0]).toEqual({ id: 'D1' });
  });

  it('projects every row, not just the first', () => {
    const out = JSON.parse(toJSONExport(ROWS, [col('ageAtDeath', 'Age')]));
    expect(out).toEqual([{ ageAtDeath: 78 }, { ageAtDeath: 61 }]);
  });
});

describe('toCSV', () => {
  it('writes only the chosen columns', () => {
    const csv = toCSV([col('id', 'ID'), col('notes', 'Notes')], ROWS);
    // CRLF: existing behaviour, for spreadsheet software that expects it.
    const [header] = csv.split('\r\n');
    expect(header).toBe('ID,Notes');
    expect(csv).not.toContain('78');
  });
});
