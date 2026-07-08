import type { ComponentType, ReactNode } from 'react';

/**
 * The typed named-slot contract shared by every layout (ADR-0031). The slot
 * vocabulary is deliberately small and stable — portability of config across
 * layouts rests on it. Grow it only when a layout needs a new slot.
 */
export const SLOT_NAMES = [
  'header',
  'primaryNav',
  'main',
  'footer',
  'inspector',
  'aside',
] as const;

export type SlotName = (typeof SLOT_NAMES)[number];

/** Content bound to slots by name (config binds content; layouts render it). */
export type SlotBindings = Partial<Record<SlotName, ReactNode>>;

export interface LayoutProps {
  /** Only bindings for slots the layout supports are passed in. */
  slots: SlotBindings;
}

/**
 * A layout template: a hard-coded, tested component that declares which slots
 * it supports. Adding a layout is a code change — a new template + a registry
 * entry — never user script (ADR-0004/0031).
 */
export interface LayoutDefinition {
  name: string;
  /** Slots this layout renders; bindings for any other slot degrade honestly. */
  supports: readonly SlotName[];
  Component: ComponentType<LayoutProps>;
}

export function isSlotName(value: string): value is SlotName {
  return (SLOT_NAMES as readonly string[]).includes(value);
}
