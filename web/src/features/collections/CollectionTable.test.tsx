import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';
import { App } from '../../App';
import { bareSchema, capableSchema, fakeClient, sortableSchema } from '../../data/testing/fixtures';
import type { GraphQLResult } from '../../data/scopedClient';
import { PAGE_SIZE } from './CollectionTable';

const endpoint = { url: 'http://example.test/graphql' };

function renderApp(ui: ReactNode, searchParams = '') {
  return render(
    <NuqsTestingAdapter searchParams={searchParams} hasMemory>
      {ui}
    </NuqsTestingAdapter>,
  );
}

function makeRows(n: number, offset = 0) {
  return Array.from({ length: n }, (_, i) => ({
    id: `BK-${String(offset + i + 1).padStart(4, '0')}`,
    title: `Book ${offset + i + 1}`,
    published_on: '2020-01-01',
    page_count: 100 + i,
    in_print: true,
    format: 'PAPERBACK',
    author: { id: 'AU-01' },
    reviews: [],
  }));
}

describe('CollectionTable states (design-export: loading / empty / error)', () => {
  it('shows the loading skeleton while a page is in flight', async () => {
    let resolveBooks: (r: GraphQLResult<unknown>) => void = () => {};
    const pending = new Promise<GraphQLResult<unknown>>((resolve) => {
      resolveBooks = resolve;
    });
    const client = {
      async query<T>(document: string): Promise<GraphQLResult<T>> {
        if (document.includes('__schema')) {
          return fakeClient(capableSchema()).query<T>(document);
        }
        return pending as Promise<GraphQLResult<T>>;
      },
      async mutate<T>(): Promise<GraphQLResult<T>> {
        return pending as Promise<GraphQLResult<T>>;
      },
    };
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);

    expect((await screen.findAllByTestId('skeleton-row')).length).toBeGreaterThan(0);
    resolveBooks({ data: { books: makeRows(2) }, error: null });
    expect(await screen.findByText('BK-0001')).toBeInTheDocument();
    expect(screen.queryByTestId('skeleton-row')).not.toBeInTheDocument();
  });

  it('shows the empty state when a collection has no records', async () => {
    const client = fakeClient(capableSchema(), () => ({ data: { books: [] }, error: null }));
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);
    expect(await screen.findByText(/no books/i)).toBeInTheDocument();
  });

  it('shows the error state with a working retry', async () => {
    let failures = 1;
    const client = fakeClient(capableSchema(), () => {
      if (failures > 0) {
        failures -= 1;
        return { data: null, error: new Error('timeout') };
      }
      return { data: { books: makeRows(1) }, error: null };
    });
    const user = userEvent.setup();
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Couldn’t load books/);
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('BK-0001')).toBeInTheDocument();
  });
});

describe('pagination (capability-gated, URL-backed)', () => {
  it('pages forward and back, driving offset from URL state', async () => {
    const client = fakeClient(capableSchema(), (_query, variables) => {
      const n = typeof variables['offset'] === 'number' ? variables['offset'] : 0;
      // Full first page (more may exist), short second page (the end).
      return {
        data: { books: n === 0 ? makeRows(PAGE_SIZE) : makeRows(3, n) },
        error: null,
      };
    });
    const user = userEvent.setup();
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);

    expect(await screen.findByText('BK-0001')).toBeInTheDocument();
    const next = screen.getByRole('button', { name: 'Next' });
    expect(screen.getByRole('button', { name: 'Prev' })).toBeDisabled();
    expect(next).toBeEnabled();

    await user.click(next);
    expect(await screen.findByText(`BK-00${PAGE_SIZE + 1}`)).toBeInTheDocument();
    expect(screen.getByText(`Page 2 · up to ${PAGE_SIZE} per page`)).toBeInTheDocument();
    // Short page → no further Next (mayHaveMore=false, no faked counts).
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Prev' }));
    expect(await screen.findByText('BK-0001')).toBeInTheDocument();
  });

  it('hides the pager entirely when the endpoint advertises no offset pagination', async () => {
    const client = fakeClient(bareSchema(), () => ({
      data: { things: [{ label: 'only page' }] },
      error: null,
    }));
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);

    expect(await screen.findByText('only page')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Prev' })).not.toBeInTheDocument();
  });
});

describe('sort (capability-gated, URL-backed — Mosaic ADR-0007, issue #20)', () => {
  function makeThings(orderBy?: unknown, orderDir?: unknown) {
    const rows = [
      { id: 'T-1', label: 'Banana' },
      { id: 'T-2', label: 'Apple' },
    ];
    if (orderBy === 'LABEL') {
      rows.sort((a, b) => (orderDir === 'DESC' ? b.label.localeCompare(a.label) : a.label.localeCompare(b.label)));
    }
    return rows;
  }

  it('is not offered when the endpoint advertises no matching orderBy enum', async () => {
    const client = fakeClient(capableSchema(), () => ({ data: { books: makeRows(1) }, error: null }));
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);
    expect(await screen.findByText('BK-0001')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /title/i })?.querySelector('button')).toBeNull();
  });

  it('cycles a column header asc → desc → unsorted, re-querying the server each time', async () => {
    const seen: Array<{ orderBy: unknown; orderDir: unknown }> = [];
    const client = fakeClient(sortableSchema(), (_query, variables) => {
      seen.push({ orderBy: variables['orderBy'], orderDir: variables['orderDir'] });
      return { data: { things: { items: makeThings(variables['orderBy'], variables['orderDir']), total: 2 } }, error: null };
    });
    const user = userEvent.setup();
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);

    expect(await screen.findByText('Banana')).toBeInTheDocument();
    const header = screen.getByRole('button', { name: /label/i });

    await user.click(header);
    expect(await screen.findByText('Apple')).toBeInTheDocument();
    const rowsAsc = screen.getAllByRole('row').slice(1).map((r) => r.textContent);
    expect(rowsAsc[0]).toContain('Apple');

    await user.click(header);
    await screen.findByText('Banana');
    const rowsDesc = screen.getAllByRole('row').slice(1).map((r) => r.textContent);
    expect(rowsDesc[0]).toContain('Banana');

    await user.click(header);
    // Third click clears sort — back to insertion order (Banana, Apple).
    await waitFor(() => {
      const rows = screen.getAllByRole('row').slice(1).map((r) => r.textContent);
      expect(rows[0]).toContain('Banana');
    });

    expect(seen).toEqual([
      { orderBy: undefined, orderDir: undefined },
      { orderBy: 'LABEL', orderDir: 'ASC' },
      { orderBy: 'LABEL', orderDir: 'DESC' },
      { orderBy: undefined, orderDir: undefined },
    ]);
  });
});

describe('CollectionTable reference cross-links (R3.8)', () => {
  it('links a reference column to the referenced entity in ITS OWN collection', async () => {
    const user = userEvent.setup();
    const author = { id: 'AU-01', name: 'Ada' };
    const client = fakeClient(capableSchema({ authorDetail: true }), (query) => {
      if (query.includes('author(id: $id)')) return { data: { author }, error: null };
      if (query.includes('ApertureHistory')) return { data: { entityHistory: [] }, error: null };
      if (query.includes('books')) return { data: { books: makeRows(1) }, error: null };
      return { data: { authors: [author] }, error: null };
    });
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />, '?collection=books');

    // The author reference renders as a link (not dead text) — click it.
    await user.click(await screen.findByRole('button', { name: 'AU-01' }));

    // It navigates to the AUTHORS collection (resolved by target type), NOT the
    // current books collection — the referenced entity's own detail loads.
    expect(await screen.findByText('Ada')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '← Authors' })).toBeInTheDocument();
  });

  it('leaves a reference as plain text when its target has no detail path', async () => {
    const client = fakeClient(capableSchema(), (query) => {
      if (query.includes('books')) return { data: { books: makeRows(1) }, error: null };
      return { data: { authors: [{ id: 'AU-01', name: 'Ada' }] }, error: null };
    });
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />, '?collection=books');

    // Author has no detail path here → honest gating: the ref id shows, but not
    // as a link (no button for it).
    expect(await screen.findByText('AU-01')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'AU-01' })).not.toBeInTheDocument();
  });
});
