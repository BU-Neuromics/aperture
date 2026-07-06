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
});
