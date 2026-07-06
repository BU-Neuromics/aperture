import type { LayoutDefinition, LayoutProps } from '../slots';

/**
 * headerNavMain — the MVP layout (ADR-0031): a fixed header bar, a left
 * primary-nav column, and a scrollable main region, with an optional footer.
 * Translated from design/design-export/ (headerNavMain variant), styled from
 * the tokens (design/design-tokens.md). Theming and responsive behavior live
 * here, inside the template — not in config.
 */
function HeaderNavMainLayout({ slots }: LayoutProps) {
  return (
    <div className="hnm-frame">
      <header className="hnm-header">{slots.header}</header>
      <div className="hnm-body">
        <nav className="hnm-nav" aria-label="Primary">
          {slots.primaryNav}
        </nav>
        <main className="hnm-main">{slots.main}</main>
      </div>
      {slots.footer !== undefined && <footer className="hnm-footer">{slots.footer}</footer>}
    </div>
  );
}

export const headerNavMain: LayoutDefinition = {
  name: 'headerNavMain',
  supports: ['header', 'primaryNav', 'main', 'footer'],
  Component: HeaderNavMainLayout,
};
