import type { LayoutDefinition, LayoutProps } from '../slots';

/**
 * queryWorkbench — the layout for composing a query (ADR-0031's library
 * growing its second entry, as that ADR anticipated: "one screen can't serve
 * master-detail browse, a dashboard landing, and full-bleed views without
 * contortions").
 *
 * Where `headerNavMain` is a browse shell — content centre, refinements in a
 * narrow inspector — this is a two-column workbench: an `aside` column where
 * the query is *composed* (in prose, by conversation) and a wide `main` where
 * the resulting artifact is edited and run. The asymmetry is deliberate: the
 * conversation is an input of bounded width that reads like a transcript, and
 * the artifact deserves the room, because it is the thing being built.
 *
 * No `inspector`: collection facets have no meaning against a cross-class
 * query, so the slot is not supported here and config binding one degrades
 * visibly through AppShell rather than rendering dead chrome (ADR-0029).
 */
function QueryWorkbenchLayout({ slots }: LayoutProps) {
  return (
    <div className="qwb-frame">
      <header className="qwb-header">{slots.header}</header>
      <div className="qwb-body">
        <nav className="qwb-nav" aria-label="Primary">
          {slots.primaryNav}
        </nav>
        {slots.aside !== undefined && (
          <aside className="qwb-aside" aria-label="Query composer">
            {slots.aside}
          </aside>
        )}
        <main className="qwb-main">{slots.main}</main>
      </div>
      {slots.footer !== undefined && <footer className="qwb-footer">{slots.footer}</footer>}
    </div>
  );
}

export const queryWorkbench: LayoutDefinition = {
  name: 'queryWorkbench',
  supports: ['header', 'primaryNav', 'aside', 'main', 'footer'],
  Component: QueryWorkbenchLayout,
};
