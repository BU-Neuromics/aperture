import type { LayoutDefinition } from './slots';
import { headerNavMain } from './layouts/HeaderNavMain';

/**
 * The layout registry: a closed, growable library of hard-coded layout
 * templates (ADR-0031). Portal config selects one by name; it never composes
 * arbitrary chrome. New layouts (masterDetail, dashboard, …) are added here.
 */
const layouts = new Map<string, LayoutDefinition>([[headerNavMain.name, headerNavMain]]);

export const DEFAULT_LAYOUT = headerNavMain.name;

export function getLayout(name: string): LayoutDefinition | undefined {
  return layouts.get(name);
}

export function listLayouts(): readonly LayoutDefinition[] {
  return [...layouts.values()];
}
