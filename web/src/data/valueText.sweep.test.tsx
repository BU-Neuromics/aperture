/**
 * Every column the picker can build, every mode, every place its value becomes
 * text — swept against the schema fixtures rather than listed by hand.
 *
 * "[object Object]" and silently blank cells came from each sink (the table,
 * the CSV writers, the `joinIds` summary) stringifying values on its own, and
 * each fix covered the one column someone happened to report. A slot value is
 * not always a scalar: a reference arrives as an edge envelope `{ id }`, a
 * STRUCTURED slot as a JSON object, a multivalued slot as an array. This test
 * gives every reachable leaf the object-shaped value its kind can carry and
 * requires each sink to show something legible for it.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderPathCell } from '../features/collections/cells';
import { toCSV, toCSVPaths } from '../features/collections/export';
import { deriveEdges } from '../query/querySpec';
import { resolvePath, toPathColumn } from '../query/columnView';
import type { CollectionModel, ColumnModel } from './schemaModel';
import { deriveCollections } from './schemaModel';
import type { ManyMode, PathColumn } from './selection';
import { flattenRows, pathKey } from './selection';
import { certIntrospection, demoIntrospection, realIntrospection } from './testing/fixtures';

const FIXTURES = { demo: demoIntrospection, cert: certIntrospection, real: realIntrospection };

/** The least scalar value a column of this kind can legitimately hold. */
function sampleValue(column: ColumnModel): unknown {
  const id = column.targetIdField ?? 'id';
  switch (column.kind) {
    case 'ref':
      return { [id]: 'R1' };
    case 'refList':
      return [{ [id]: 'R1' }, { [id]: 'R2' }];
    case 'text':
      // A STRUCTURED slot is typed as a JSON passthrough scalar → `text`.
      return { value: 5, unit: 'uL' };
    case 'number':
      return 3;
    case 'boolean':
      return true;
    case 'enum':
      return column.enumValues?.[0] ?? 'A';
    case 'date':
      return '2026-01-01';
    case 'id':
      return 'X1';
  }
}

/** Build the nested row the selection would return for this path. */
function rowFor(column: PathColumn, hopsToMany: boolean[]): Record<string, unknown> {
  const build = (i: number): unknown => {
    if (i === column.path.length - 1) return sampleValue(column.column);
    const child = (): Record<string, unknown> => ({
      id: `m${i}`,
      [column.path[i + 1]]: build(i + 1),
    });
    return hopsToMany[i] ? [child(), child()] : child();
  };
  return { id: 'a1', [column.path[0]]: build(0) };
}

/** Every path the Fields panel can offer: anchor slots, then one and two hops. */
function reachablePaths(anchor: CollectionModel, collections: CollectionModel[]): string[][] {
  const paths: string[][] = anchor.detailColumns.map((c) => [c.field]);
  const walk = (from: CollectionModel, prefix: string[]) => {
    for (const edge of deriveEdges(from, collections)) {
      if (!edge.selectField) continue;
      const next = collections.find((c) => c.id === edge.relatedCollectionId);
      if (!next) continue;
      const base = [...prefix, edge.selectField];
      for (const leaf of next.detailColumns) paths.push([...base, leaf.field]);
      if (base.length < 2) walk(next, base);
    }
  };
  walk(anchor, []);
  return paths;
}

const LEAKS = /\[object Object\]/;

for (const [name, introspection] of Object.entries(FIXTURES)) {
  describe(`value text sweep — ${name} fixture`, () => {
    const collections = deriveCollections(introspection);

    it('renders and exports every anchor slot as legible text', () => {
      for (const anchor of collections) {
        const row = Object.fromEntries(anchor.columns.map((c) => [c.field, sampleValue(c)]));
        const csv = toCSV(anchor.columns, [row]);
        expect(csv, `${anchor.id} CSV`).not.toMatch(LEAKS);
      }
    });

    it('renders and exports every reachable path, in every mode, as legible text', () => {
      let checked = 0;
      for (const anchor of collections) {
        for (const path of reachablePaths(anchor, collections)) {
          const resolved = resolvePath(path, anchor, collections);
          if (!resolved) continue;
          const toMany = path.slice(0, -1).map((_, i) => resolved.edges[i]?.toMany ?? false);
          const modes: (ManyMode | undefined)[] =
            resolved.manyAt == null ? [undefined] : ['count', 'joinIds', 'explode'];
          for (const mode of modes) {
            const column = toPathColumn(resolved, mode);
            const where = `${anchor.id}.${pathKey(path)} (${mode ?? 'to-one'})`;
            const { rows } = flattenRows([rowFor(column, toMany)], [column], 'id');
            for (const r of rows) {
              const value = r.values[pathKey(path)];
              const html = renderToStaticMarkup(<>{renderPathCell(column, value)}</>);
              expect(html, `${where} screen`).not.toMatch(LEAKS);
              // A value was supplied, so the cell must not read as empty.
              expect(html, `${where} screen is blank`).not.toContain('cell-empty');
            }
            const csvRows = toCSVPaths([column], rows).trim().split(/\r?\n/).slice(1);
            for (const line of csvRows) {
              expect(line, `${where} CSV`).not.toMatch(LEAKS);
              expect(line, `${where} CSV is blank`).not.toBe('');
            }
            checked += 1;
          }
        }
      }
      expect(checked).toBeGreaterThan(0);
    });
  });
}
