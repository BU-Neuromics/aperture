import { DEFAULT_LAYOUT } from './registry';

/**
 * Which layout serves which portal context (ADR-0031).
 *
 * The shell is still *selected, never composed*: this is a table of layout
 * **names**, resolved through the registry exactly as the single hard-coded
 * name was before. What changes is that the portal may pick a different noun
 * from the catalog per context — browsing a collection and composing a
 * cross-class query are genuinely different screen shapes, which is the case
 * ADR-0031 was written for. Adding a context stays a code change, not script.
 */
export type ShellContext = 'default' | 'query';

export const SHELL_LAYOUTS: Record<ShellContext, string> = {
  default: DEFAULT_LAYOUT,
  query: 'queryWorkbench',
};

/**
 * The context the current query-state puts the portal in. Total and tiny by
 * design: it maps URL state to a context *name*, and the name selects a
 * layout. Nothing here chooses components.
 */
export function shellContextFor(view: string | null | undefined): ShellContext {
  return view === 'query' ? 'query' : 'default';
}
