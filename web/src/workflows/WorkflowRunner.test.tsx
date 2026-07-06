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

interface Op {
  ref: string;
  type: string;
  data: Record<string, unknown>;
}

/** A batch endpoint with real all-or-nothing semantics for the tests. */
function batchClient() {
  const committed: Op[][] = [];
  const client = fakeClient(capableSchema({ authorWrite: true }), (query, variables) => {
    if (!query.includes('ApertureBatch')) {
      return { data: { books: [], authors: [] }, error: null } as GraphQLResult<unknown>;
    }
    const ops = variables['operations'] as Op[];
    const dryRun = variables['dryRun'] === true;
    const errors: { ref: string; field: string; message: string }[] = [];
    for (const op of ops) {
      if (op.type === 'Book' && typeof op.data['page_count'] === 'number' && (op.data['page_count'] as number) < 0) {
        errors.push({ ref: op.ref, field: 'page_count', message: 'must be non-negative' });
      }
    }
    if (errors.length > 0) return { data: { batchPut: { ok: false, results: [], errors } }, error: null };
    if (dryRun) return { data: { batchPut: { ok: true, results: [], errors: [] } }, error: null };
    committed.push(ops);
    return {
      data: {
        batchPut: {
          ok: true,
          results: ops.map((op, i) => ({ ref: op.ref, id: `NEW-${i + 1}` })),
          errors: [],
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

    // Success: one atomic commit, intra-batch ref token on the wire, ids listed.
    expect(await screen.findByText(/committed atomically/)).toBeInTheDocument();
    expect(committed).toHaveLength(1);
    expect(committed[0]).toEqual([
      { ref: 'author-step', type: 'Author', data: { name: 'New Author' } },
      {
        ref: 'book-step',
        type: 'Book',
        // checkbox widgets are explicit booleans; the bound field carries the ref token
        data: { title: 'The Linked Book', in_print: false, author: 'author-step' },
      },
    ]);
    expect(screen.getByRole('button', { name: 'NEW-2' })).toBeInTheDocument(); // book has a detail path
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
