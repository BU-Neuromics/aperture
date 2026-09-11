import { describe, expect, it } from 'vitest';
import { deriveCollections } from '../data/schemaModel';
import { capableSchema } from '../data/testing/fixtures';
import type { QuerySpec } from './querySpec';
import { specProse } from './specProse';

const collections = deriveCollections(capableSchema());
const books = collections.find((c) => c.id === 'books')!;

const spec = (over: Partial<QuerySpec> = {}): QuerySpec => ({
  v: 1,
  anchor: books.id,
  mode: 'AND',
  criteria: [],
  ...over,
});

describe('specProse (the artifact read back as language)', () => {
  it('leads with the anchor and combinator the builder uses', () => {
    const prose = specProse(spec(), collections);
    expect(prose.anchor).toBe(books.label);
    expect(prose.anchorResolved).toBe(true);
    expect(prose.combinator).toBe('all of');
    expect(prose.clauses).toEqual([]);
  });

  it('says "any of" for an OR spec', () => {
    expect(specProse(spec({ mode: 'OR' }), collections).combinator).toBe('any of');
  });

  it('renders a field condition with the shared operator wording', () => {
    const prose = specProse(
      spec({ criteria: [{ kind: 'field', slot: 'title', op: 'contains', value: 'moby' }] }),
      collections,
    );
    expect(prose.clauses[0]?.conditions[0]).toMatchObject({
      op: 'contains',
      value: 'moby',
      resolved: true,
    });
  });

  it('joins an `in` list and drops the operand `is empty` does not need', () => {
    const prose = specProse(
      spec({
        criteria: [
          { kind: 'field', slot: 'title', op: 'in', value: ['a', 'b'] },
          { kind: 'field', slot: 'title', op: 'is_null', value: true },
        ],
      }),
      collections,
    );
    expect(prose.clauses[0]?.conditions[0]?.value).toBe('a, b');
    expect(prose.clauses[1]?.conditions[0]).toMatchObject({ op: 'is empty', value: '' });
  });

  it('quantifies a relationship clause', () => {
    const prose = specProse(
      spec({
        criteria: [
          { kind: 'related', edge: 'fwd:author', quantifier: 'none', criteria: [] },
        ],
      }),
      collections,
    );
    expect(prose.clauses[0]).toMatchObject({ kind: 'related', lead: 'having no' });
  });

  // The planner spells anchors by schema type; this builder addresses
  // collections by id. Saying so is the whole point — never guess a match.
  it('marks an anchor that resolves to nothing rather than inventing one', () => {
    const prose = specProse(spec({ anchor: 'Book' }), collections);
    expect(prose.anchor).toBe('Book');
    expect(prose.anchorResolved).toBe(false);
  });

  it('marks an unresolvable slot and edge without throwing', () => {
    const prose = specProse(
      spec({
        criteria: [
          { kind: 'field', slot: 'not_a_slot', op: 'eq', value: 'x' },
          { kind: 'related', edge: 'rev:nope.nope', quantifier: 'some', criteria: [] },
        ],
      }),
      collections,
    );
    expect(prose.clauses[0]?.conditions[0]?.resolved).toBe(false);
    expect(prose.clauses[1]?.targetResolved).toBe(false);
  });
});
