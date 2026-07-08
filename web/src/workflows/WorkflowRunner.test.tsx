import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';
import { App } from '../App';
import { capableSchema, fakeClient } from '../data/testing/fixtures';
import type { GraphQLResult } from '../data/scopedClient';
import type { WorkflowConfig } from './config';

const endpoint = { url: 'http://example.test/graphql' };

const REGISTER: WorkflowConfig = {
  id: 'register-work',
  version: '1',
  label: 'Register a work',
  description: 'Author, then their book — committed together.',
  steps: [
    { id: 'author-step', label: 'Register author', entityType: 'Author' },
    {
      id: 'book-step',
      label: 'Add book',
      entityType: 'Book',
      bindings: [{ field: 'author', fromStep: 'author-step' }],
    },
  ],
};

interface BatchEntity {
  entityType: string;
  data: Record<string, unknown>;
}

/** An ingestBatch endpoint with real all-or-nothing semantics for the tests. */
function batchClient() {
  const committed: BatchEntity[][] = [];
  const client = fakeClient(capableSchema({ authorWrite: true }), (query, variables) => {
    if (!query.includes('ApertureBatch')) {
      return { data: { books: [], authors: [] }, error: null } as GraphQLResult<unknown>;
    }
    const entities = variables['entities'] as BatchEntity[];
    const dryRun = variables['dryRun'] === true;
    const results = entities.map((e) => {
      const failures =
        e.entityType === 'Book' &&
        typeof e.data['page_count'] === 'number' &&
        (e.data['page_count'] as number) < 0
          ? [
              {
                tier: 'schema',
                rule: 'minimum_value',
                message: 'must be non-negative',
                field: 'page_count',
                details: null,
              },
            ]
          : [];
      return { entityId: e.data['id'], passed: failures.length === 0, failures };
    });
    const passed = results.every((r) => r.passed);
    const commits = !dryRun && passed;
    if (commits) committed.push(entities);
    return {
      data: {
        ingestBatch: {
          committed: commits,
          dryRun,
          validation: { passed, results },
          entities: commits
            ? entities.map((e) => ({ id: e.data['id'], entity_type: e.entityType, operation: 'insert' }))
            : [],
          relationships: [],
        },
      },
      error: null,
    };
  });
  return { client, committed };
}

function renderApp(ui: ReactNode, searchParams = '') {
  return render(
    <NuqsTestingAdapter searchParams={searchParams} hasMemory>
      {ui}
    </NuqsTestingAdapter>,
  );
}

const workflows = { workflows: [REGISTER] };

beforeEach(() => window.localStorage.clear());

describe('WorkflowRunner (W4.6–W4.9, ADR-0028)', () => {
  it('lists workflows in the nav; unavailable ones are disabled with reasons', async () => {
    // Endpoint without createAuthor → the workflow cannot run.
    const client = fakeClient(capableSchema(), () => ({ data: { books: [], authors: [] }, error: null }));
    renderApp(<App endpoint={endpoint} clientFactory={() => client} workflows={workflows} />);
    const item = await screen.findByRole('button', { name: /Register a work/ });
    expect(item).toBeDisabled();
    expect(item).toHaveAttribute('title', expect.stringMatching(/no create mutation/));
  });

  it('walks stage → per-step dry-run → review → whole-set validate → atomic commit', async () => {
    const user = userEvent.setup();
    const { client, committed } = batchClient();
    renderApp(<App endpoint={endpoint} clientFactory={() => client} workflows={workflows} />);

    await user.click(await screen.findByRole('button', { name: /Register a work/ }));
    expect(await screen.findByRole('heading', { name: 'Register author' })).toBeInTheDocument();

    // Step 1: required field blocks, then stages with a dry-run on the wire.
    await user.click(screen.getByRole('button', { name: 'Stage & continue' }));
    expect(await screen.findByText('Required.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Name/), 'New Author');
    await user.click(screen.getByRole('button', { name: 'Stage & continue' }));

    // Step 2: the bound field is locked, not an input.
    expect(await screen.findByText(/from step “Register author”/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Author')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Title/), 'The Linked Book');
    await user.click(screen.getByRole('button', { name: 'Stage & continue' }));

    // Review: staged values + the binding arrow; commit disabled until a clean validate.
    expect(await screen.findByRole('heading', { name: /Review & commit/ })).toBeInTheDocument();
    expect(screen.getByText('New Author')).toBeInTheDocument();
    expect(screen.getByText('The Linked Book')).toBeInTheDocument();
    expect(screen.getByText(/→ “Register author”/)).toBeInTheDocument();
    const commitButton = screen.getByRole('button', { name: 'Commit atomically' });
    expect(commitButton).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Validate whole set' }));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Commit atomically' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Commit atomically' }));

    // Success: one atomic commit, client-id staging on the wire, ids listed.
    expect(await screen.findByText(/committed atomically/)).toBeInTheDocument();
    expect(committed).toHaveLength(1);
    const [author, book] = committed[0];
    expect(author.entityType).toBe('Author');
    expect(author.data['name']).toBe('New Author');
    expect(author.data['id']).toMatch(/^[0-9a-f-]{36}$/); // pre-assigned client id
    expect(book.entityType).toBe('Book');
    // checkbox widgets are explicit booleans; the bound field carries the
    // sibling's pre-assigned client id (the real intra-batch mechanism).
    expect(book.data['title']).toBe('The Linked Book');
    expect(book.data['in_print']).toBe(false);
    expect(book.data['author']).toBe(author.data['id']);
    // book has a detail path → its committed (client) id links out.
    expect(screen.getByRole('button', { name: book.data['id'] as string })).toBeInTheDocument();
    // Draft cleared after commit.
    expect(window.localStorage.getItem('aperture:workflow-draft:register-work')).toBeNull();
  });

  it('a per-step dry-run rejection blocks advancing and attributes the field', async () => {
    const user = userEvent.setup();
    const { client, committed } = batchClient();
    renderApp(
      <App endpoint={endpoint} clientFactory={() => client} workflows={workflows} />,
      '?workflow=register-work',
    );

    await user.type(await screen.findByLabelText(/Name/), 'A');
    await user.click(screen.getByRole('button', { name: 'Stage & continue' }));
    await user.type(await screen.findByLabelText(/Title/), 'T');
    await user.type(screen.getByLabelText(/Page count/), '-5');
    await user.click(screen.getByRole('button', { name: 'Stage & continue' }));

    expect(await screen.findByText('must be non-negative')).toBeInTheDocument();
    // Still on step 2 — not advanced, nothing committed.
    expect(screen.getByRole('button', { name: 'Stage & continue' })).toBeInTheDocument();
    expect(committed).toHaveLength(0);
  });

  it('resumes a saved draft (version-pinned) and can discard it', async () => {
    const user = userEvent.setup();
    const { client } = batchClient();
    const first = renderApp(
      <App endpoint={endpoint} clientFactory={() => client} workflows={workflows} />,
      '?workflow=register-work',
    );
    await user.type(await screen.findByLabelText(/Name/), 'Draft Author');
    await user.click(screen.getByRole('button', { name: 'Stage & continue' }));
    await screen.findByText(/from step “Register author”/); // staged + advanced (draft saved)
    first.unmount();

    const { client: client2 } = batchClient();
    renderApp(
      <App endpoint={endpoint} clientFactory={() => client2} workflows={workflows} />,
      '?workflow=register-work',
    );
    expect(await screen.findByText(/Resumed a saved draft/)).toBeInTheDocument();
    // Resumed onto step 2 with step 1 staged (✓ chip).
    const stepper = screen.getAllByRole('listitem');
    expect(within(stepper[0]).getByRole('button')).toHaveAttribute('data-staged', 'true');

    await user.click(screen.getByRole('button', { name: 'Discard draft' }));
    expect(await screen.findByLabelText(/Name/)).toHaveValue('');
    expect(window.localStorage.getItem('aperture:workflow-draft:register-work')).toBeNull();
  });

  it('flags schema drift on resume instead of silently breaking (L10)', async () => {
    const { client } = batchClient();
    // Seed a control-plane draft document (local-fallback key + v1 envelope).
    window.localStorage.setItem(
      'aperture:cp:workflowDraft:register-work',
      JSON.stringify({
        v: 1,
        data: {
          state: {
            workflowId: 'register-work',
            workflowVersion: '1',
            schemaFingerprint: 'stale-fingerprint',
            currentStep: 1,
            staged: { 'author-step': { name: 'Old Author' } },
          },
          savedAt: '2026-07-01T00:00:00Z',
        },
      }),
    );
    renderApp(
      <App endpoint={endpoint} clientFactory={() => client} workflows={workflows} />,
      '?workflow=register-work',
    );
    expect(await screen.findByText(/the schema has changed since it was saved/)).toBeInTheDocument();
  });

  it('an unknown workflow id degrades honestly', async () => {
    const { client } = batchClient();
    renderApp(
      <App endpoint={endpoint} clientFactory={() => client} workflows={workflows} />,
      '?workflow=nope',
    );
    expect(await screen.findByText(/Unknown workflow “nope”/)).toBeInTheDocument();
  });
});
