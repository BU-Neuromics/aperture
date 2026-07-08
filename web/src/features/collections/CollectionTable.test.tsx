import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';
import { App } from '../../App';
import { bareSchema, capableSchema, fakeClient } from '../../data/testing/fixtures';
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
