import { render, screen } from '@testing-library/react';
import { AppShell } from './AppShell';
import { getLayout, listLayouts, DEFAULT_LAYOUT } from './registry';

describe('layout registry', () => {
  it('resolves headerNavMain (the MVP catalog entry)', () => {
    const layout = getLayout('headerNavMain');
    expect(layout).toBeDefined();
    expect(layout!.supports).toEqual(['header', 'primaryNav', 'main', 'footer']);
    expect(DEFAULT_LAYOUT).toBe('headerNavMain');
  });

  it('lists registered layouts', () => {
    expect(listLayouts().map((l) => l.name)).toContain('headerNavMain');
  });
});

describe('AppShell + headerNavMain', () => {
  it('renders content bound to header, primaryNav, and main slots', () => {
    render(
      <AppShell
        config={{ layout: 'headerNavMain' }}
        slots={{
          header: <span>the header</span>,
          primaryNav: <span>the nav</span>,
          main: <span>the content</span>,
        }}
      />,
    );
    expect(screen.getByRole('banner')).toHaveTextContent('the header');
    expect(screen.getByRole('navigation', { name: 'Primary' })).toHaveTextContent('the nav');
    expect(screen.getByRole('main')).toHaveTextContent('the content');
    // No footer binding → no footer region rendered.
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('renders the optional footer slot when bound', () => {
    render(
      <AppShell
        config={{ layout: 'headerNavMain' }}
        slots={{ main: <span>content</span>, footer: <span>the footer</span> }}
      />,
    );
    expect(screen.getByRole('contentinfo')).toHaveTextContent('the footer');
  });

  it('degrades honestly: drops unsupported-slot bindings with a visible notice', () => {
    render(
      <AppShell
        config={{ layout: 'headerNavMain' }}
        slots={{ main: <span>content</span>, inspector: <span>inspector content</span> }}
      />,
    );
    expect(screen.queryByText('inspector content')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/does not support: inspector/);
    // The supported slots still render — degraded, not broken.
    expect(screen.getByRole('main')).toHaveTextContent('content');
  });

  it('renders an error state for an unknown layout name (never guesses)', () => {
    render(<AppShell config={{ layout: 'noSuchLayout' }} slots={{ main: <span>content</span> }} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Unknown layout/);
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });
});
