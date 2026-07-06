import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';
import { App } from '../App';
import { capableSchema, fakeClient } from '../data/testing/fixtures';
import { sealPayload } from './store';

const endpoint = { url: 'http://example.test/graphql' };

/** Fake client with an in-memory document backend + book rows. */
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
    if (query.includes('createApertureDocument')) {
      const input = variables['input'] as Record<string, string>;
      const doc = { id: `DOC-${docs.length + 1}`, ...input } as (typeof docs)[number];
      docs.push(doc);
      return { data: { createApertureDocument: doc }, error: null };
    }
    if (query.includes('updateApertureDocument')) {
      const doc = docs.find((d) => d.id === variables['id']);
      if (doc) Object.assign(doc, variables['input']);
      return { data: { updateApertureDocument: doc ?? null }, error: null };
    }
    return { data: { books: [{ id: 'BK-0001' }], authors: [] }, error: null };
  });
  return { client, docs };
}

function renderApp(ui: ReactNode, searchParams = '') {
  return render(
    <NuqsTestingAdapter searchParams={searchParams} hasMemory>
      {ui}
    </NuqsTestingAdapter>,
  );
}

beforeEach(() => window.localStorage.clear());

describe('saved views (Phase 4, R3.9)', () => {
  it('footer reports the Hippo store when the document type is advertised', async () => {
    const { client } = makeClient();
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);
    expect(await screen.findByText(/LinkML-on-Hippo document store/)).toBeInTheDocument();
  });

  it('falls back to the browser store — and says so — without the document type', async () => {
    const client = fakeClient(capableSchema(), () => ({
      data: { books: [{ id: 'BK-0001' }], authors: [] },
      error: null,
    }));
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);
    expect(await screen.findByText(/this browser only/)).toBeInTheDocument();
  });

  it('saves the current query-state as a named document and lists it in the nav', async () => {
    const user = userEvent.setup();
    const { client, docs } = makeClient();
    renderApp(
      <App endpoint={endpoint} clientFactory={() => client} />,
      `?collection=books&filters=${encodeURIComponent('{"format":"EBOOK"}')}&q=deep`,
    );

    await user.click(await screen.findByRole('button', { name: 'Save view' }));
    await user.type(screen.getByLabelText('View name'), 'EBook deep dive');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // The document went to the control plane with the full query-state payload.
    await vi.waitFor(() => expect(docs).toHaveLength(1));
    expect(docs[0].kind).toBe('savedView');
    expect(docs[0].name).toBe('EBook deep dive');
    const payload = JSON.parse(docs[0].payload);
    expect(payload.v).toBe(1);
    expect(payload.data.state).toEqual({
      collection: 'books',
      page: 1,
      q: 'deep',
      filters: { format: 'EBOOK' },
    });
    expect(typeof payload.data.schemaFingerprint).toBe('string');

    // …and the nav now lists it.
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(await within(nav).findByText('EBook deep dive')).toBeInTheDocument();
  });

  it('opening a saved view applies the whole query-state', async () => {
    const seeded = {
      id: 'DOC-1',
      kind: 'savedView',
      name: 'Hardcovers p2',
      payload: sealPayload(1, {
        state: { collection: 'books', page: 2, filters: { format: 'HARDCOVER' } },
        schemaFingerprint: 'whatever',
      }),
    };
    const user = userEvent.setup();
    const { client } = makeClient([seeded]);
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />, '?collection=authors');

    const nav = screen.getByRole('navigation', { name: 'Primary' });
    await user.click(await within(nav).findByText('Hardcovers p2'));

    expect(await screen.findByRole('heading', { name: 'Books' })).toBeInTheDocument();
    expect(await screen.findByText(/· filtered/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'HARDCOVER' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Fingerprint mismatch → the item is marked stale (drift is visible, not silent).
    expect(within(nav).getByTitle(/saved under an older schema/)).toBeInTheDocument();
  });

  it('skips documents whose payload fails validation', async () => {
    const { client } = makeClient([
      { id: 'DOC-1', kind: 'savedView', name: 'broken', payload: '{"v":99}' },
      { id: 'DOC-2', kind: 'savedView', name: 'garbage', payload: 'not-json' },
    ]);
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);
    await screen.findByText(/LinkML-on-Hippo/);
    expect(screen.queryByText('broken')).not.toBeInTheDocument();
    expect(screen.queryByText('garbage')).not.toBeInTheDocument();
  });
});

describe('config-as-data through the control plane (Phase 4)', () => {
  const wfConfig = [
    {
      id: 'register-work',
      version: '1',
      label: 'Register a work',
      steps: [{ id: 'author-step', label: 'Register author', entityType: 'Author' }],
    },
  ];

  it('a valid control-plane workflows document wins over the env default', async () => {
    const { client } = makeClient([
      {
        id: 'DOC-1',
        kind: 'config',
        name: 'workflows',
        payload: sealPayload(1, wfConfig),
      },
    ]);
    renderApp(
      <App endpoint={endpoint} clientFactory={() => client} workflows={{ workflows: [] }} />,
    );
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(await within(nav).findByText('Register a work')).toBeInTheDocument();
  });

  it('an invalid document falls back to env with the error surfaced', async () => {
    const { client } = makeClient([
      {
        id: 'DOC-1',
        kind: 'config',
        name: 'workflows',
        payload: sealPayload(1, [{ id: 'broken' }]),
      },
    ]);
    renderApp(
      <App endpoint={endpoint} clientFactory={() => client} workflows={{ workflows: [] }} />,
    );
    expect(
      await screen.findByText(/control-plane workflows config is invalid/),
    ).toBeInTheDocument();
  });
});

describe('workflow drafts through the control plane (W4.8)', () => {
  it('staging a step writes a draft document to the Hippo store', async () => {
    const user = userEvent.setup();
    const wf = [
      {
        id: 'solo',
        version: '1',
        label: 'Solo book',
        steps: [{ id: 'book-step', label: 'Add book', entityType: 'Book' }],
      },
    ];
    const { client, docs } = makeClient();
    renderApp(
      <App
        endpoint={endpoint}
        clientFactory={() => client}
        workflows={{ workflows: wf }}
      />,
      '?workflow=solo',
    );

    await user.type(await screen.findByLabelText(/Title/), 'Draft Book');
    await user.click(screen.getByRole('button', { name: 'Stage & continue' }));

    await vi.waitFor(() => {
      const draft = docs.find((d) => d.kind === 'workflowDraft' && d.name === 'solo');
      expect(draft).toBeDefined();
      const payload = JSON.parse(draft!.payload);
      expect(payload.data.state.staged['book-step'].title).toBe('Draft Book');
    });
  });
});
