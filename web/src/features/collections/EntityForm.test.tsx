import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';
import { App } from '../../App';
import { bareSchema, capableSchema, fakeClient } from '../../data/testing/fixtures';
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
  reviews: [],
};

function respond(query: string): GraphQLResult<unknown> {
  if (query.includes('ApertureDetail')) return { data: { book }, error: null };
  if (query.includes('ApertureHistory')) return { data: { entityHistory: [] }, error: null };
  if (query.includes('ApertureCreate')) {
    return { data: { createBook: { id: 'BK-NEW' } }, error: null };
  }
  if (query.includes('ApertureUpdate')) return { data: { updateBook: { id: 'BK-0007' } }, error: null };
  if (query.includes('books')) return { data: { books: [book] }, error: null };
  return {
    data: { authors: [{ id: 'AU-001', name: 'First Author' }, { id: 'AU-002', name: 'Other' }] },
    error: null,
  };
}

describe('EntityForm (W4.1–W4.5)', () => {
  it('offers New only where a create path is advertised', async () => {
    const first = renderApp(
      <App endpoint={endpoint} clientFactory={() => fakeClient(capableSchema(), respond)} />,
    );
    expect(await screen.findByRole('button', { name: 'New Book' })).toBeInTheDocument();
    first.unmount();

    // Authors advertise no create mutation → no button.
    const second = renderApp(
      <App endpoint={endpoint} clientFactory={() => fakeClient(capableSchema(), respond)} />,
      '?collection=authors',
    );
    await screen.findByRole('heading', { name: 'Authors' });
    expect(screen.queryByRole('button', { name: /New Author/ })).not.toBeInTheDocument();
    second.unmount();

    // Bare endpoint → nothing write-shaped anywhere.
    renderApp(
      <App
        endpoint={endpoint}
        clientFactory={() =>
          fakeClient(bareSchema(), () => ({ data: { things: [{ label: 'x' }] }, error: null }))
        }
      />,
    );
    await screen.findByText('x');
    expect(screen.queryByRole('button', { name: /^New / })).not.toBeInTheDocument();
  });

  it('generates the form from the input type and blocks submit on client validation', async () => {
    const user = userEvent.setup();
    const client = fakeClient(capableSchema(), respond);
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);

    await user.click(await screen.findByRole('button', { name: 'New Book' }));
    expect(await screen.findByText('New Book')).toBeInTheDocument();

    // Derived widgets: required title, enum select, checkbox, ref picker, number.
    expect(screen.getByLabelText(/Title/)).toBeInTheDocument();
    const format = screen.getByLabelText('Format');
    expect(within(format).getByRole('option', { name: 'EBOOK' })).toBeInTheDocument();
    expect(screen.getByLabelText('In print')).toHaveAttribute('type', 'checkbox');
    expect(screen.getByLabelText('Page count')).toHaveAttribute('type', 'number');
    // Multivalued 'tags' has no Tier-0 widget → not offered.
    expect(screen.queryByLabelText('Tags')).not.toBeInTheDocument();

    // Submit empty → required error, no mutation on the wire.
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Required.')).toBeInTheDocument();
    expect(client.queries.some((q) => q.includes('ApertureCreate'))).toBe(false);
  });

  it('creates with typed values and navigates to the new entity', async () => {
    const user = userEvent.setup();
    const client = fakeClient(capableSchema(), (query) =>
      query.includes('ApertureDetail')
        ? { data: { book: { ...book, id: 'BK-NEW' } }, error: null }
        : respond(query),
    );
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);

    await user.click(await screen.findByRole('button', { name: 'New Book' }));
    await user.type(await screen.findByLabelText(/Title/), 'Fresh Book');
    await user.type(screen.getByLabelText('Page count'), '128');
    await user.selectOptions(screen.getByLabelText('Format'), 'EBOOK');
    await user.click(screen.getByLabelText('In print'));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    // Lands on the new entity's detail (create returned BK-NEW).
    expect(await screen.findByText('BK-NEW', { selector: '.detail-title' })).toBeInTheDocument();
    const create = client.recorded.find((q) => q.document.includes('ApertureCreate'))!;
    expect(create.variables).toEqual({
      input: { title: 'Fresh Book', page_count: 128, in_print: true, format: 'EBOOK' },
    });
  });

  it('surfaces server rejection verbatim and attributes named fields (W4.2)', async () => {
    const user = userEvent.setup();
    const client = fakeClient(capableSchema(), (query) =>
      query.includes('ApertureCreate')
        ? { data: null, error: new Error('page_count must be non-negative') }
        : respond(query),
    );
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);

    await user.click(await screen.findByRole('button', { name: 'New Book' }));
    await user.type(await screen.findByLabelText(/Title/), 'T');
    await user.type(screen.getByLabelText('Page count'), '-5');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/server rejected/i);
    expect(alert).toHaveTextContent(/page_count must be non-negative/);
    expect(screen.getByText('See server message above.')).toBeInTheDocument();
  });

  it('edit prefills from the entity and submits only touched fields (partial-merge)', async () => {
    const user = userEvent.setup();
    const client = fakeClient(capableSchema(), respond);
    renderApp(
      <App endpoint={endpoint} clientFactory={() => client} />,
      '?collection=books&entity=BK-0007',
    );

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const title = await screen.findByLabelText(/Title/);
    expect(title).toHaveValue('A Deep Book'); // prefilled
    expect(screen.getByLabelText('Page count')).toHaveValue(512);

    await user.clear(screen.getByLabelText('Page count'));
    await user.type(screen.getByLabelText('Page count'), '640');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('A Deep Book')).toBeInTheDocument(); // back on detail
    const update = client.recorded.find((q) => q.document.includes('ApertureUpdate'))!;
    expect(update.variables).toEqual({ id: 'BK-0007', input: { page_count: 640 } });
  });

  it('ref picker searches the target collection and fills the id (W4.5)', async () => {
    const user = userEvent.setup();
    const client = fakeClient(capableSchema(), respond);
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);

    await user.click(await screen.findByRole('button', { name: 'New Book' }));
    const picker = await screen.findByLabelText('Author');
    await user.click(picker);
    const option = await screen.findByRole('option', { name: /AU-001/ });
    expect(option).toHaveTextContent('First Author');
    await user.click(option);
    expect(picker).toHaveValue('AU-001');
  });

  it('deep link to an unadvertised form degrades honestly', async () => {
    renderApp(
      <App endpoint={endpoint} clientFactory={() => fakeClient(capableSchema(), respond)} />,
      '?collection=authors&form=new',
    );
    expect(await screen.findByText(/No create form for Authors/)).toBeInTheDocument();
  });
});
