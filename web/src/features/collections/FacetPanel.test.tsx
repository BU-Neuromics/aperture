import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';
import type { IntrospectionSchema } from '../../data/introspection';
import { App } from '../../App';
import {
  arg,
  bareSchema,
  capableSchema,
  facetCountsSchema,
  fakeClient,
  field,
  fieldRangeSchema,
  list,
  nonNull,
  object,
  objectType,
  scalar,
} from '../../data/testing/fixtures';

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

  it('shows per-value counts once the endpoint advertises a genuine facetCounts field (issue #20)', async () => {
    const client = fakeClient(facetCountsSchema(), (query) =>
      query.includes('ApertureFacetCounts')
        ? {
            data: {
              f0: [
                { value: 'ACTIVE', count: 3 },
                { value: 'ARCHIVED', count: 1 },
              ],
            },
            error: null,
          }
        : { data: { things: { items: [{ id: 'T-1', status: 'ACTIVE' }], total: 1 } }, error: null },
    );
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);
    expect(await screen.findByText('Filters')).toBeInTheDocument();
    const inspector = within(screen.getByRole('complementary', { name: 'Inspector' }));
    expect(await inspector.findByTestId('facet-count-status-ACTIVE')).toHaveTextContent('3');
    expect(inspector.getByTestId('facet-count-status-ARCHIVED')).toHaveTextContent('1');
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

  it('shows a range facet pre-filled with the endpoint’s advertised bounds once a genuine fieldRange field is advertised (issue #61)', async () => {
    const client = fakeClient(fieldRangeSchema(), (query) =>
      query.includes('ApertureFieldRange')
        ? { data: { f0: { min: 3, max: 88 } }, error: null }
        : { data: { things: { items: [{ id: 'T-1', age: 42 }], total: 1 } }, error: null },
    );
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);
    expect(await screen.findByText('Filters')).toBeInTheDocument();
    const inspector = within(screen.getByRole('complementary', { name: 'Inspector' }));
    expect(await inspector.findByTestId('facet-range-min-age')).toHaveAttribute('placeholder', '3');
    expect(inspector.getByTestId('facet-range-max-age')).toHaveAttribute('placeholder', '88');
  });

  it('wires min/max entry to GTE/LTE conditions in the same flat filters list (issue #61)', async () => {
    const user = userEvent.setup();
    const client = fakeClient(fieldRangeSchema(), (query) =>
      query.includes('ApertureFieldRange')
        ? { data: { f0: { min: null, max: null } }, error: null }
        : { data: { things: { items: [{ id: 'T-1', age: 42 }], total: 1 } }, error: null },
    );
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);
    expect(await screen.findByText('Filters')).toBeInTheDocument();
    const inspector = within(screen.getByRole('complementary', { name: 'Inspector' }));
    const minInput = await inspector.findByTestId('facet-range-min-age');
    await user.type(minInput, '10{Enter}');
    await screen.findByText(/· filtered/);
    expect(
      client.recorded.some(
        (q) =>
          q.document.includes('ApertureList') &&
          JSON.stringify(q.variables['filters']) === JSON.stringify([{ field: 'age', value: 10, op: 'GTE' }]),
      ),
    ).toBe(true);

    const maxInput = inspector.getByTestId('facet-range-max-age');
    await user.type(maxInput, '50{Enter}');
    expect(
      client.recorded.some(
        (q) =>
          q.document.includes('ApertureList') &&
          JSON.stringify(q.variables['filters']) ===
            JSON.stringify([
              { field: 'age', value: 10, op: 'GTE' },
              { field: 'age', value: 50, op: 'LTE' },
            ]),
      ),
    ).toBe(true);

    // Clear all resets the range too.
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    await screen.findByText(/Page 1 · 1 of 1 rows$/);
    expect(inspector.getByTestId('facet-range-min-age')).toHaveValue(null);
  });

  it('shows no range widget without a genuine fieldRange field, even with numeric/date columns present (ADR-0029: never fake)', async () => {
    const schema: IntrospectionSchema = {
      queryType: { name: 'Query' },
      mutationType: null,
      types: [
        objectType('Query', [
          field('things', nonNull(object('ThingPage')), [
            arg('limit', nonNull(scalar('Int'))),
            arg('offset', nonNull(scalar('Int'))),
            arg('filters', list(nonNull(object('FilterInput')))),
          ]),
        ]),
        objectType('ThingPage', [
          field('items', nonNull(list(nonNull(object('Thing'))))),
          field('total', nonNull(scalar('Int'))),
        ]),
        objectType('Thing', [
          field('id', nonNull(scalar('ID'))),
          field('age', scalar('Int')),
          // A boolean equality facet so the panel itself still renders —
          // isolating the assertion to "no range widget for `age`".
          field('active', scalar('Boolean')),
        ]),
      ],
    };
    const client = fakeClient(schema, () => ({
      data: { things: { items: [{ id: 'T-1', age: 42, active: true }], total: 1 } },
      error: null,
    }));
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);
    expect(await screen.findByText('Filters')).toBeInTheDocument();
    const inspector = within(screen.getByRole('complementary', { name: 'Inspector' }));
    expect(inspector.getByText('Active')).toBeInTheDocument();
    expect(inspector.queryByTestId('facet-range-min-age')).not.toBeInTheDocument();
  });
});
