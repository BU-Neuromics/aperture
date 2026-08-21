import { describe, expect, it } from 'vitest';
import { readGraphTheme } from './graphTheme';

/**
 * The graph canvas regressed to a hardcoded dark palette once already
 * (`var(--surface-2, #232323)`), so pin the contract: colors come off the
 * element's tokens, and an unstyled element degrades instead of throwing.
 */
describe('readGraphTheme (canvas ↔ design-token bridge)', () => {
  it('resolves the --graph-* aliases declared on the canvas element', () => {
    const el = document.createElement('div');
    el.style.setProperty('--graph-label', '#5a626d');
    el.style.setProperty('--graph-edge', '#d3d8e0');
    el.style.setProperty('--graph-selected', '#2f6df6');
    el.style.setProperty('--graph-node-ring', '#ffffff');
    document.body.append(el);

    expect(readGraphTheme(el)).toEqual({
      label: '#5a626d',
      edge: '#d3d8e0',
      selected: '#2f6df6',
      'node-ring': '#ffffff',
    });
    el.remove();
  });

  it('falls back per-token rather than throwing when a token is absent', () => {
    const el = document.createElement('div');
    el.style.setProperty('--graph-label', '#123456');
    document.body.append(el);

    const theme = readGraphTheme(el);
    expect(theme.label).toBe('#123456');
    // Unset tokens keep a legible neutral instead of an empty string, which
    // Cytoscape would reject.
    expect(theme.edge).not.toBe('');
    el.remove();
  });

  it('degrades on a null element (pre-mount render)', () => {
    expect(() => readGraphTheme(null)).not.toThrow();
    expect(readGraphTheme(null).label).not.toBe('');
  });
});
