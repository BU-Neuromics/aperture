/**
 * A stable colour per entity type.
 *
 * The graph has painted its nodes this way since ADR-0037, but the palette
 * lived inside `GraphView` and stopped at the canvas edge — so a type was
 * coloured in the graph and anonymous everywhere else. Promoting it makes the
 * colour *mean* something across the app: the hue a type wears in the nav is
 * the hue it wears in a chip, in a proposed query, and as a node.
 *
 * One hash, one palette, one module — two of either would drift, and a type
 * showing up in different colours on different surfaces is worse than no
 * colour at all.
 *
 * Hues are mid-luminance on purpose: they must stay legible as a solid fill
 * behind white text (chips on the dark nav rail), as a hairline accent on
 * light content surfaces, and as a node against the graph canvas.
 */

import type { CSSProperties } from 'react';

const PALETTE = [
  '#3b6ea5',
  '#b0703a',
  '#2f8f6b',
  '#a8497a',
  '#6a4fa8',
  '#6f9440',
  '#a08a35',
  '#3a8f96',
] as const;

/**
 * Deterministic and order-independent: a type keeps its colour when
 * collections are reordered, hidden, or added, because the hash is of the
 * name alone. Collisions past eight types are acceptable — the colour is an
 * aid to recognition, never the only signal for anything.
 */
export function typeColor(typeName: string): string {
  let hash = 0;
  for (const ch of typeName) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

/**
 * The colour as an inline custom property, so stylesheets can tint, mix and
 * ring with it (`color-mix(... var(--type-color) ...)`) instead of every
 * consumer hard-coding a second set of derived colours in JS.
 *
 * Cast because React's `CSSProperties` has no index signature for custom
 * properties — the standard escape hatch, not a type hole.
 */
export function typeColorStyle(typeName: string): CSSProperties {
  return { '--type-color': typeColor(typeName) } as CSSProperties;
}
