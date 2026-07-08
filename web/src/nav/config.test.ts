import type { CollectionModel } from '../data/schemaModel';
import { activeCollection, buildNavView, parseNavConfig, resolveNavConfig } from './config';

const collection = (id: string, label: string): CollectionModel =>
  ({ id, label, typeName: label } as CollectionModel);

const books = collection('books', 'Books');
const authors = collection('authors', 'Authors');
const docs = collection('apertureDocuments', 'Aperture documents');

describe('parseNavConfig', () => {
  it('accepts a full config', () => {
    expect(
      parseNavConfig({
        order: ['authors', 'books'],
        labels: { books: 'Library' },
        hide: ['authors'],
        defaultCollection: 'books',
      }),
    ).toEqual({
      order: ['authors', 'books'],
      labels: { books: 'Library' },
      hide: ['authors'],
      defaultCollection: 'books',
    });
  });

  it('accepts an empty object (pure derive-all)', () => {
    expect(parseNavConfig({})).toEqual({});
  });

  it.each([
    ['an array', ['books']],
    ['a string', 'books'],
    ['null', null],
  ])('rejects %s at the top level', (_what, raw) => {
    expect(() => parseNavConfig(raw)).toThrow(/must be a JSON object/);
  });

  it('rejects non-string order entries', () => {
    expect(() => parseNavConfig({ order: ['books', 7] })).toThrow(/order\[1\]/);
  });

  it('rejects duplicate order ids', () => {
    expect(() => parseNavConfig({ order: ['books', 'books'] })).toThrow(/duplicate/);
  });

  it('rejects non-string labels', () => {
    expect(() => parseNavConfig({ labels: { books: 7 } })).toThrow(/labels\.books/);
  });

  it('rejects an empty defaultCollection', () => {
    expect(() => parseNavConfig({ defaultCollection: '' })).toThrow(/defaultCollection/);
  });
});

describe('resolveNavConfig', () => {
  it('defaults to derive-all when VITE_NAV is unset', () => {
    expect(resolveNavConfig({})).toEqual({ config: {} });
  });

  it('parses VITE_NAV', () => {
    expect(resolveNavConfig({ VITE_NAV: '{"hide":["books"]}' })).toEqual({
      config: { hide: ['books'] },
    });
  });

  it('surfaces a bad VITE_NAV and falls back (ADR-0029)', () => {
    const resolved = resolveNavConfig({ VITE_NAV: 'not-json' });
    expect(resolved.config).toEqual({});
    expect(resolved.error).toMatch(/VITE_NAV is invalid/);
  });
});

describe('buildNavView', () => {
  it('without config: derive-all, minus the document collection', () => {
    const view = buildNavView([books, authors, docs], {}, 'apertureDocuments');
    expect(view.visible.map((c) => c.id)).toEqual(['books', 'authors']);
    expect(view.all.map((c) => c.id)).toEqual(['books', 'authors', 'apertureDocuments']);
    expect(view.defaultId).toBe('books');
    expect(view.error).toBeUndefined();
  });

  it('orders listed collections first, the rest in derived order', () => {
    const view = buildNavView([books, authors, docs], { order: ['authors'] }, 'apertureDocuments');
    expect(view.visible.map((c) => c.id)).toEqual(['authors', 'books']);
  });

  it('listing the document collection in order is the opt-in that shows it', () => {
    const view = buildNavView(
      [books, authors, docs],
      { order: ['apertureDocuments'] },
      'apertureDocuments',
    );
    expect(view.visible.map((c) => c.id)).toEqual(['apertureDocuments', 'books', 'authors']);
  });

  it('relabels everywhere — visible and all', () => {
    const view = buildNavView([books, authors], { labels: { books: 'Library' } });
    expect(view.visible.find((c) => c.id === 'books')?.label).toBe('Library');
    expect(view.all.find((c) => c.id === 'books')?.label).toBe('Library');
  });

  it('hides collections but keeps them in all (hidden ≠ inaccessible)', () => {
    const view = buildNavView([books, authors], { hide: ['authors'] });
    expect(view.visible.map((c) => c.id)).toEqual(['books']);
    expect(view.all.map((c) => c.id)).toEqual(['books', 'authors']);
  });

  it('honors defaultCollection, even a hidden one', () => {
    expect(buildNavView([books, authors], { defaultCollection: 'authors' }).defaultId).toBe(
      'authors',
    );
    expect(
      buildNavView([books, authors], { defaultCollection: 'authors', hide: ['authors'] }).defaultId,
    ).toBe('authors');
  });

  it('surfaces unknown ids and ignores those entries (ADR-0029)', () => {
    const view = buildNavView([books, authors], {
      order: ['ghosts', 'authors'],
      labels: { phantom: 'Boo' },
      hide: ['spectre'],
      defaultCollection: 'wraith',
    });
    expect(view.visible.map((c) => c.id)).toEqual(['authors', 'books']);
    expect(view.defaultId).toBe('authors');
    expect(view.error).toMatch(/unknown collections/);
    for (const id of ['ghosts', 'phantom', 'spectre', 'wraith']) {
      expect(view.error).toContain(id);
    }
  });

  it('carries an upstream config error through', () => {
    const view = buildNavView([books], {}, undefined, 'env config is broken');
    expect(view.error).toBe('env config is broken');
  });
});

describe('activeCollection', () => {
  const view = buildNavView([books, authors, docs], { hide: ['authors'] }, 'apertureDocuments');

  it('resolves the URL collection, including hidden ones (deep links)', () => {
    expect(activeCollection(view, 'books')?.id).toBe('books');
    expect(activeCollection(view, 'authors')?.id).toBe('authors');
    expect(activeCollection(view, 'apertureDocuments')?.id).toBe('apertureDocuments');
  });

  it('falls back to the default for no or unknown ids', () => {
    expect(activeCollection(view, null)?.id).toBe('books');
    expect(activeCollection(view, 'nope')?.id).toBe('books');
  });

  it('returns undefined only when nothing is derivable', () => {
    expect(activeCollection(buildNavView([], {}), null)).toBeUndefined();
  });
});
