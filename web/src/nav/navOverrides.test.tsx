import { render, screen, within } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';
import { App } from '../App';
import { capableSchema, fakeClient } from '../data/testing/fixtures';
import { sealNavConfig } from './NavConfigContext';

const endpoint = { url: 'http://example.test/graphql' };

/** Fake client with an in-memory document backend (savedViews.test.tsx pattern). */
function makeClient(seedDocs: { id: string; kind: string; name: string; payload: string }[] = []) {
  const docs = [...seedDocs];
  const client = fakeClient(capableSchema({ documents: true }), (query, variables) => {
    if (query.includes('apertureDocuments')) {
      const filter = (variables['filter'] ?? {}) as Record<string, string>;
      return {
        data: {
          apertureDocuments: docs.filter(
            (d) =>
              (filter['kind'] == null || d.kind === filter['kind']) &&
              (filter['name'] == null || d.name === filter['name']),
          ),
        },
        error: null,
      };
    }
    return { data: { books: [{ id: 'BK-0001' }], authors: [] }, error: null };
  });
  return { client, docs };
}

const navDoc = (config: unknown, payload?: string) => ({
  id: 'DOC-1',
  kind: 'config',
  name: 'nav',
  payload: payload ?? sealNavConfig(config),
});

function renderApp(ui: ReactNode, searchParams = '') {
  return render(
    <NuqsTestingAdapter searchParams={searchParams} hasMemory>
      {ui}
    </NuqsTestingAdapter>,
  );
}

const navItems = async () => {
  const nav = screen.getByRole('navigation', { name: 'Primary' });
  await within(nav).findByText('Books');
  const list = nav.querySelector('.nav-list')!;
  return [...list.querySelectorAll('.nav-item-label')].map((el) => el.textContent);
};

beforeEach(() => window.localStorage.clear());

describe('nav composition overrides (R3.1, issue #18)', () => {
  it('hides the control-plane document collection from browse by default', async () => {
    const { client } = makeClient();
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);
    expect(await navItems()).toEqual(['Books', 'Authors']);
  });

  it('still deep-links to the document collection (hidden ≠ inaccessible)', async () => {
    const { client } = makeClient();
    renderApp(
      <App endpoint={endpoint} clientFactory={() => client} />,
      '?collection=apertureDocuments',
    );
    expect(
      await screen.findByRole('heading', { name: 'Aperture documents' }),
    ).toBeInTheDocument();
  });

  it('a config/nav document reorders and relabels the nav', async () => {
    const { client } = makeClient([
      navDoc({ order: ['authors', 'books'], labels: { books: 'Library' } }),
    ]);
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    await within(nav).findByText('Library');
    const list = nav.querySelector('.nav-list')!;
    const labels = [...list.querySelectorAll('.nav-item-label')].map((el) => el.textContent);
    expect(labels).toEqual(['Authors', 'Library']);
    // The relabel carries into the main view.
    expect(await screen.findByRole('heading', { name: 'Authors' })).toBeInTheDocument();
  });

  it('hides configured collections while their deep links keep resolving', async () => {
    const { client } = makeClient([navDoc({ hide: ['authors'] })]);
    renderApp(
      <App endpoint={endpoint} clientFactory={() => client} />,
      '?collection=authors',
    );
    await vi.waitFor(async () => expect(await navItems()).toEqual(['Books']));
    expect(await screen.findByRole('heading', { name: 'Authors' })).toBeInTheDocument();
  });

  it('lands on the configured default collection when the URL names none', async () => {
    const { client } = makeClient([navDoc({ defaultCollection: 'authors' })]);
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);
    expect(await screen.findByRole('heading', { name: 'Authors' })).toBeInTheDocument();
  });

  it('an invalid document surfaces the error and falls back to derive-all (ADR-0029)', async () => {
    const { client } = makeClient([navDoc(null, sealNavConfig(['not', 'an', 'object']))]);
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);
    expect(await screen.findByText(/control-plane nav config is invalid/)).toBeInTheDocument();
    expect(await navItems()).toEqual(['Books', 'Authors']);
  });

  it('unknown collection ids are surfaced, not swallowed (ADR-0029)', async () => {
    const { client } = makeClient([navDoc({ order: ['ghosts', 'authors'] })]);
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);
    expect(await screen.findByText(/unknown collections: ghosts/)).toBeInTheDocument();
    expect(await navItems()).toEqual(['Authors', 'Books']);
  });

  it('listing the document collection in order opts it back into the nav', async () => {
    const { client } = makeClient([navDoc({ order: ['apertureDocuments'] })]);
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);
    await vi.waitFor(async () =>
      expect(await navItems()).toEqual(['Aperture documents', 'Books', 'Authors']),
    );
  });
});
