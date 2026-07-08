import type { LayoutDefinition, LayoutProps } from '../slots';

/**
 * headerNavMain — the MVP layout (ADR-0031): a fixed header bar, a left
 * primary-nav column, a scrollable main region, and an optional right
 * inspector column (the filters panel in the design export) + footer.
 * Translated from design/design-export/ (headerNavMain variant), styled from
 * the tokens (design/design-tokens.md). Theming and responsive behavior live
 * here, inside the template — not in config. An inspector binding that
 * renders nothing collapses its column (CSS :empty), so panels can gate
 * themselves on capabilities without leaving dead chrome.
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
        {slots.inspector !== undefined && (
          <aside className="hnm-inspector" aria-label="Inspector">
            {slots.inspector}
          </aside>
        )}
      </div>
      {slots.footer !== undefined && <footer className="hnm-footer">{slots.footer}</footer>}
    </div>
  );
}

export const headerNavMain: LayoutDefinition = {
  name: 'headerNavMain',
  supports: ['header', 'primaryNav', 'main', 'inspector', 'footer'],
  Component: HeaderNavMainLayout,
};
