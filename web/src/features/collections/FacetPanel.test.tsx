import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';
import { App } from '../../App';
import { bareSchema, capableSchema, fakeClient } from '../../data/testing/fixtures';

const endpoint = { url: 'http://example.test/graphql' };

function renderApp(ui: ReactNode, searchParams = '') {
  return render(
    <NuqsTestingAdapter searchParams={searchParams} hasMemory>
      {ui}
    </NuqsTestingAdapter>,
  );
}

function respondWithBooks(rows: Record<string, unknown>[] = [{ id: 'BK-0001' }]) {
  return () => ({ data: { books: rows, authors: [] }, error: null });
}

describe('FacetPanel (R3.3 — equality facets + FTS, capability-gated)', () => {
  it('renders schema-derived facet groups and the search box', async () => {
    renderApp(
      <App endpoint={endpoint} clientFactory={() => fakeClient(capableSchema(), respondWithBooks())} />,
    );
    expect(await screen.findByText('Filters')).toBeInTheDocument();
    const inspector = within(screen.getByRole('complementary', { name: 'Inspector' }));
    expect(inspector.getByLabelText('Full-text search')).toBeInTheDocument();
    expect(inspector.getByText('Format')).toBeInTheDocument();
    expect(inspector.getByRole('button', { name: 'HARDCOVER' })).toBeInTheDocument();
    expect(inspector.getByText('In print')).toBeInTheDocument();
    expect(inspector.getByLabelText('Filter by Author')).toBeInTheDocument();
    // 'title' is a plain-text filter input, not an equality facet.
    expect(inspector.queryByText('Title')).not.toBeInTheDocument();
  });

  it('sends selected facets as filter variables and marks the result filtered', async () => {
    const user = userEvent.setup();
    const client = fakeClient(capableSchema(), respondWithBooks());
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);

    await user.click(await screen.findByRole('button', { name: 'EBOOK' }));
    await screen.findByText(/· filtered/);
    expect(
      client.recorded.some(
        (q) =>
          q.document.includes('filter: $filter') &&
          JSON.stringify(q.variables['filter']) === '{"format":"EBOOK"}',
      ),
    ).toBe(true);

    // Toggle a boolean facet too → AND across facets in one flat object.
    await user.click(screen.getByRole('button', { name: 'true' }));
    expect(
      client.recorded.some(
        (q) => JSON.stringify(q.variables['filter']) === '{"format":"EBOOK","in_print":true}',
      ),
    ).toBe(true);

    // Toggling the enum value again clears it.
    await user.click(screen.getByRole('button', { name: 'EBOOK' }));
    expect(
      client.recorded.some((q) => JSON.stringify(q.variables['filter']) === '{"in_print":true}'),
    ).toBe(true);
  });

  it('applies full-text search on Enter', async () => {
    const user = userEvent.setup();
    const client = fakeClient(capableSchema(), respondWithBooks());
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);

    const box = await screen.findByLabelText('Full-text search');
    await user.type(box, 'cortex{Enter}');
    await screen.findByText(/· filtered/);
    expect(client.recorded.some((q) => q.variables['search'] === 'cortex')).toBe(true);
  });

  it('restores facet + search state from the URL (shareable)', async () => {
    const client = fakeClient(capableSchema(), respondWithBooks());
    renderApp(
      <App endpoint={endpoint} clientFactory={() => client} />,
      `?collection=books&q=hippocampus&filters=${encodeURIComponent('{"format":"EBOOK"}')}`,
    );
    await screen.findByText(/· filtered/);
    expect(screen.getByRole('button', { name: 'EBOOK' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Full-text search')).toHaveValue('hippocampus');
    expect(
      client.recorded.some(
        (q) =>
          q.variables['search'] === 'hippocampus' &&
          JSON.stringify(q.variables['filter']) === '{"format":"EBOOK"}',
      ),
    ).toBe(true);
  });

  it('clear-all resets filters and search', async () => {
    const user = userEvent.setup();
    const client = fakeClient(capableSchema(), respondWithBooks());
    renderApp(
      <App endpoint={endpoint} clientFactory={() => client} />,
      `?filters=${encodeURIComponent('{"format":"EBOOK"}')}&q=x`,
    );
    await user.click(await screen.findByRole('button', { name: 'Clear all' }));
    await screen.findByText(/Page 1 · 1 rows$/);
    expect(screen.queryByText(/· filtered/)).not.toBeInTheDocument();
  });

  it('shows the filtered empty state with a clear-filters escape hatch', async () => {
    const user = userEvent.setup();
    const client = fakeClient(capableSchema(), respondWithBooks([]));
    renderApp(
      <App endpoint={endpoint} clientFactory={() => client} />,
      `?filters=${encodeURIComponent('{"format":"EBOOK"}')}`,
    );
    expect(await screen.findByText(/No matching books/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.queryByText(/· filtered/)).not.toBeInTheDocument();
  });

  it('renders no panel at all when the endpoint advertises neither facets nor search', async () => {
    const client = fakeClient(bareSchema(), () => ({
      data: { things: [{ label: 'x' }] },
      error: null,
    }));
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);
    await screen.findByText('x');
    expect(screen.queryByText('Filters')).not.toBeInTheDocument();
  });
});
