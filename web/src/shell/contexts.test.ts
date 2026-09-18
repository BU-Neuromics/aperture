import { describe, expect, it } from 'vitest';
import { getLayout } from './registry';
import { SHELL_LAYOUTS, shellContextFor } from './contexts';

describe('shell contexts (ADR-0031 selection, not composition)', () => {
  it('puts the query view in the workbench and everything else in the browse shell', () => {
    expect(shellContextFor('query')).toBe('query');
    expect(shellContextFor(null)).toBe('default');
    expect(shellContextFor(undefined)).toBe('default');
    // The graph view is its own cross-class surface but has no composer, so it
    // stays on the browse shell rather than inheriting an empty aside.
    expect(shellContextFor('graph')).toBe('default');
  });

  it('names only layouts the registry actually holds', () => {
    for (const name of Object.values(SHELL_LAYOUTS)) {
      expect(getLayout(name), `layout "${name}" is not registered`).toBeDefined();
    }
  });

  it('gives the workbench a composer column the browse shell does not have', () => {
    expect(getLayout(SHELL_LAYOUTS.query)?.supports).toContain('aside');
    expect(getLayout(SHELL_LAYOUTS.default)?.supports).not.toContain('aside');
  });
});
