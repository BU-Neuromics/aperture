import { useEffect, useState } from 'react';

/**
 * Theme bridge for the graph canvas.
 *
 * Cytoscape paints nodes, edges and labels into a `<canvas>`, so it cannot
 * resolve `var(--token)` the way the rest of the UI does — it needs concrete
 * color strings. Rather than hardcoding a palette here (which is how the graph
 * ended up dark on a light theme), query.css declares the graph's colors as
 * `--graph-*` aliases on `.query-graph-canvas`, pointing at the ordinary design
 * tokens. This module reads those computed values back off the element and
 * re-reads them whenever the theme changes, so the canvas tracks whatever
 * light/dark theming lands in styles/tokens.css.
 */

const GRAPH_TOKENS = ['label', 'edge', 'selected', 'node-ring'] as const;

export type GraphTheme = Record<(typeof GRAPH_TOKENS)[number], string>;

/**
 * Only reached when tokens.css has not been applied to the element — jsdom in
 * unit tests, or a render before styles load. Deliberately neutral mid-tones
 * that stay legible either way; the real values come from the tokens.
 */
const UNSTYLED: GraphTheme = {
  label: '#767b84',
  edge: '#9aa0a8',
  selected: '#2f6df6',
  'node-ring': 'transparent',
};

export function readGraphTheme(el: Element | null): GraphTheme {
  if (!el || typeof getComputedStyle !== 'function') return UNSTYLED;
  const computed = getComputedStyle(el);
  const out = { ...UNSTYLED };
  for (const name of GRAPH_TOKENS) {
    const value = computed.getPropertyValue(`--graph-${name}`).trim();
    if (value) out[name] = value;
  }
  return out;
}

function themeKey(theme: GraphTheme): string {
  return GRAPH_TOKENS.map((n) => theme[n]).join('|');
}

/**
 * The resolved graph palette for `el`, refreshed when the document's theme
 * changes — either an explicit `data-theme` on <html> or the OS preference
 * behind a `prefers-color-scheme` block.
 */
export function useGraphTheme(el: Element | null): GraphTheme {
  const [theme, setTheme] = useState<GraphTheme>(UNSTYLED);

  useEffect(() => {
    if (!el) return;
    const refresh = () =>
      setTheme((prev) => {
        const next = readGraphTheme(el);
        return themeKey(next) === themeKey(prev) ? prev : next;
      });
    refresh();

    const observer =
      typeof MutationObserver === 'function'
        ? new MutationObserver(refresh)
        : null;
    observer?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    });

    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener?.('change', refresh);

    return () => {
      observer?.disconnect();
      media?.removeEventListener?.('change', refresh);
    };
  }, [el]);

  return theme;
}
