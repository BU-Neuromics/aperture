import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';
import { App } from '../../App';
import { capableSchema, fakeClient } from '../../data/testing/fixtures';
import type { GraphQLResult } from '../../data/scopedClient';

const endpoint = { url: 'http://example.test/graphql' };

function renderApp(ui: ReactNode, searchParams = '') {
  return render(
    <NuqsTestingAdapter searchParams={searchParams} hasMemory>
      {ui}
    </NuqsTestingAdapter>,
  );
}

const book = {
  id: 'BK-0007',
  title: 'A Deep Book',
  published_on: '2019-05-01',
  page_count: 512,
  in_print: true,
  format: 'HARDCOVER',
  author: { id: 'AU-003' },
  reviews: [{ id: 'RV-1' }, { id: 'RV-2' }],
};

function respond(query: string, variables: Record<string, unknown>): GraphQLResult<unknown> {
  if (query.includes('ApertureDetail')) return { data: { book }, error: null };
  if (query.includes('ApertureHistory')) {
    return {
      data: {
        entityHistory: [{ timestamp: '2026-01-01T10:00:00Z', action: 'created', actor: 'ingest' }],
      },
      error: null,
    };
  }
  if (query.includes('books')) {
    const filter = variables['filter'] as Record<string, unknown> | undefined;
    return { data: { books: filter?.['author'] ? [book] : [book, { ...book, id: 'BK-0008' }] }, error: null };
  }
  return { data: { authors: [{ id: 'AU-003', name: 'Someone' }] }, error: null };
}

describe('EntityDetail (R3.7/R3.8)', () => {
  it('opens from the table id link, renders fields + type chip, URL carries entity', async () => {
    const user = userEvent.setup();
    const client = fakeClient(capableSchema(), respond);
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);

    await user.click(await screen.findByRole('button', { name: 'BK-0007' }));

    expect(await screen.findByText('A Deep Book')).toBeInTheDocument();
    expect(screen.getByText('Book')).toBeInTheDocument(); // type chip
    expect(screen.getByText('Page count')).toBeInTheDocument();
    expect(screen.getByText('512')).toBeInTheDocument();
    // The detail query went over the wire with the entity id.
    expect(
      client.recorded.some(
        (q) => q.document.includes('book(id: $id)') && q.variables['id'] === 'BK-0007',
      ),
    ).toBe(true);
  });

  it('renders directly from a deep link (?entity=…) and goes back to the table', async () => {
    const user = userEvent.setup();
    renderApp(
      <App endpoint={endpoint} clientFactory={() => fakeClient(capableSchema(), respond)} />,
      '?collection=books&entity=BK-0007',
    );
    expect(await screen.findByText('A Deep Book')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '← Books' }));
    expect(await screen.findByRole('heading', { name: 'Books' })).toBeInTheDocument();
  });

  it('shows history when the endpoint advertises entityHistory', async () => {
    renderApp(
      <App endpoint={endpoint} clientFactory={() => fakeClient(capableSchema(), respond)} />,
      '?collection=books&entity=BK-0007',
    );
    expect(await screen.findByText('History')).toBeInTheDocument();
    expect(await screen.findByText('created')).toBeInTheDocument();
    expect(screen.getByText('ingest')).toBeInTheDocument();
  });

  it('gates cross-links honestly when the target side offers no path', async () => {
    renderApp(
      <App endpoint={endpoint} clientFactory={() => fakeClient(capableSchema(), respond)} />,
      '?collection=books&entity=BK-0007',
    );

    // Book.author is a single ref; Author has no detail path → plain text, no link.
    await screen.findByText('A Deep Book');
    const relationRow = screen
      .getAllByText('Author')
      .map((el) => el.closest('.detail-relation'))
      .find((el): el is HTMLElement => el != null);
    expect(relationRow).toBeDefined();
    expect(within(relationRow!).getByText('AU-003')).toBeInTheDocument();
    expect(within(relationRow!).queryByRole('button')).toBeNull();

    // Book.reviews is multivalued but Review has no browsable collection → count only.
    expect(screen.getByText('Reviews')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View in/ })).not.toBeInTheDocument();
  });

  it('cross-links a single ref and pivots a multivalued ref when supported', async () => {
    const user = userEvent.setup();
    const author = { id: 'AU-003', name: 'Someone', books: [{ id: 'BK-0007' }, { id: 'BK-0009' }] };
    const client = fakeClient(capableSchema({ authorDetail: true }), (query, variables) => {
      if (query.includes('author(id: $id)')) return { data: { author }, error: null };
      if (query.includes('book(id: $id)')) return { data: { book }, error: null };
      if (query.includes('ApertureHistory'))
        return { data: { entityHistory: [] }, error: null };
      if (query.includes('books')) {
        const filter = variables['filter'] as Record<string, unknown> | undefined;
        return {
          data: { books: filter?.['author'] === 'AU-003' ? [book] : [book, { ...book, id: 'BK-0008' }] },
          error: null,
        };
      }
      return { data: { authors: [author] }, error: null };
    });
    renderApp(
      <App endpoint={endpoint} clientFactory={() => client} />,
      '?collection=books&entity=BK-0007',
    );

    // Author now has a detail path → the single ref cross-links to it.
    await user.click(await screen.findByRole('button', { name: 'AU-003' }));
    expect(await screen.findByText('Someone')).toBeInTheDocument();

    // Author.books is multivalued; books are filterable by author → pivot lights up.
    await user.click(await screen.findByRole('button', { name: 'View in Books' }));
    expect(await screen.findByRole('heading', { name: 'Books' })).toBeInTheDocument();
    expect(await screen.findByText(/· filtered/)).toBeInTheDocument();
    // The pivoted list actually filtered by this author on the wire.
    expect(
      client.recorded.some(
        (q) => JSON.stringify(q.variables['filter']) === '{"author":"AU-003"}',
      ),
    ).toBe(true);
    // And the facet panel reflects the pivot filter.
    expect(screen.getByLabelText('Filter by Author')).toHaveValue('AU-003');
  });

  it('deep link into a collection without a detail path degrades honestly', async () => {
    renderApp(
      <App endpoint={endpoint} clientFactory={() => fakeClient(capableSchema(), respond)} />,
      '?collection=authors&entity=AU-003',
    );
    expect(await screen.findByText(/No detail view for Authors/)).toBeInTheDocument();
  });

  it('gates the Archive/Supersede affordances off when the endpoint advertises no lifecycle mutations', async () => {
    renderApp(
      <App endpoint={endpoint} clientFactory={() => fakeClient(capableSchema(), respond)} />,
      '?collection=books&entity=BK-0007',
    );
    await screen.findByText('A Deep Book');
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supersede…' })).not.toBeInTheDocument();
  });
});

describe('EntityDetail lifecycle affordances (W4.4)', () => {
  function lifecycleRespond(mutations: {
    setBookAvailability?: GraphQLResult<unknown>;
    supersedeBook?: GraphQLResult<unknown>;
  }) {
    // Mutable so a successful mutation is reflected in the post-mutation reload,
    // just like a real server would.
    const current = { ...book, isAvailable: true } as Record<string, unknown>;
    return (query: string, variables: Record<string, unknown>): GraphQLResult<unknown> => {
      if (query.includes('ApertureSetAvailability')) {
        if (mutations.setBookAvailability) return mutations.setBookAvailability;
        current.isAvailable = variables['isAvailable'];
        return {
          data: { setBookAvailability: { entityId: 'BK-0007', isAvailable: variables['isAvailable'] } },
          error: null,
        };
      }
      if (query.includes('ApertureSupersede')) {
        if (mutations.supersedeBook) return mutations.supersedeBook;
        current.supersededBy = variables['replacementId'];
        return {
          data: { supersedeBook: { entityId: 'BK-0007', supersededBy: variables['replacementId'] } },
          error: null,
        };
      }
      if (query.includes('ApertureDetail')) return { data: { book: current }, error: null };
      if (query.includes('ApertureHistory')) return { data: { entityHistory: [] }, error: null };
      return { data: { books: [current] }, error: null };
    };
  }

  it('archives an available entity, then reloads to show Restore', async () => {
    const user = userEvent.setup();
    const client = fakeClient(capableSchema({ bookLifecycle: true }), lifecycleRespond({}));
    renderApp(
      <App endpoint={endpoint} clientFactory={() => client} />,
      '?collection=books&entity=BK-0007',
    );

    const archiveButton = await screen.findByRole('button', { name: 'Archive' });
    await user.click(archiveButton);

    expect(await screen.findByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(
      client.recorded.some(
        (q) =>
          q.document.includes('setBookAvailability') &&
          q.variables['id'] === 'BK-0007' &&
          q.variables['isAvailable'] === false,
      ),
    ).toBe(true);
  });

  it('surfaces a server rejection from the availability mutation without crashing', async () => {
    const user = userEvent.setup();
    const client = fakeClient(
      capableSchema({ bookLifecycle: true }),
      lifecycleRespond({ setBookAvailability: { data: null, error: new Error('entity not found') } }),
    );
    renderApp(
      <App endpoint={endpoint} clientFactory={() => client} />,
      '?collection=books&entity=BK-0007',
    );

    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/entity not found/);
    // Stays "Archive" — the transition did not take effect.
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });

  it('supersedes via the inline form and reloads the entity', async () => {
    const user = userEvent.setup();
    const client = fakeClient(capableSchema({ bookLifecycle: true }), lifecycleRespond({}));
    renderApp(
      <App endpoint={endpoint} clientFactory={() => client} />,
      '?collection=books&entity=BK-0007',
    );

    await user.click(await screen.findByRole('button', { name: 'Supersede…' }));
    await user.type(await screen.findByLabelText('Replacement id'), 'BK-0099');
    await user.click(screen.getByRole('button', { name: 'Confirm supersede' }));

    await screen.findByText('A Deep Book'); // reload completed, detail still rendered
    expect(
      client.recorded.some(
        (q) =>
          q.document.includes('supersedeBook') &&
          q.variables['id'] === 'BK-0007' &&
          q.variables['replacementId'] === 'BK-0099',
      ),
    ).toBe(true);
    // The form closes back to the trigger button after a successful submit.
    expect(await screen.findByRole('button', { name: 'Supersede…' })).toBeInTheDocument();
  });
});
