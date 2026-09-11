import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { capableSchema, fakeClient } from '../data/testing/fixtures';
import type { GraphQLResult } from '../data/scopedClient';

const endpoint = { url: 'http://example.test/graphql' };

interface WireTurn {
  id: string;
  utterance: string;
  status: string;
  message: string;
  query_spec: unknown;
}

/**
 * A planning endpoint with just enough behavior to drive the panel: each turn
 * proposes a spec, an unresolvable one asks for clarification, and an edit
 * replays the list so a turn that depended on the edited one suspends.
 */
function conversationalClient(options: { anchor?: string; criteria?: unknown[] } = {}) {
  const anchor = options.anchor ?? 'Book';
  const criteria = options.criteria ?? [];
  const client = fakeClient(capableSchema({ conversational: true }), (query, variables) => {
    if (!query.includes('ApertureConverse')) {
      return { data: { books: [], authors: [] }, error: null } as GraphQLResult<unknown>;
    }
    const utterance = variables['utterance'] as string;
    const prior = (variables['turns'] as WireTurn[] | undefined) ?? [];
    const editId = variables['editTurnId'] as string | undefined;

    const plan = (text: string) =>
      /nothing|xyzzy/.test(text)
        ? { status: 'clarification', message: 'Which field did you mean?', query_spec: null }
        : {
            status: 'proposal',
            message: `Filtering to ${text}.`,
            query_spec: { v: 1, anchor, mode: 'AND', criteria },
          };

    if (editId) {
      const i = prior.findIndex((t) => t.id === editId);
      const turns = prior.map((t, j) => {
        if (j === i) return { ...t, utterance, ...plan(utterance) };
        // Anything after the edited turn that had a spec loses it.
        if (j > i && t.status === 'proposal') {
          return { ...t, status: 'suspended', message: 'No longer applies.', query_spec: null };
        }
        return t;
      });
      return {
        data: {
          converseQuerySpec: {
            turn: turns[i],
            turns,
            suspended_turn_ids: turns.filter((t) => t.status === 'suspended').map((t) => t.id),
          },
        },
        error: null,
      };
    }

    const turn = { id: `t${prior.length + 1}`, utterance, ...plan(utterance) };
    return {
      data: {
        converseQuerySpec: { turn, turns: [...prior, turn], suspended_turn_ids: [] },
      },
      error: null,
    };
  });
  return client;
}

function renderApp(ui: ReactNode, searchParams = '') {
  return render(
    <NuqsTestingAdapter searchParams={searchParams} hasMemory>
      {ui}
    </NuqsTestingAdapter>,
  );
}

describe('ChatPanel (ADR-0039)', () => {
  it('stays off when the endpoint advertises no conversational mutation', async () => {
    const client = fakeClient(capableSchema(), () => ({
      data: { books: [], authors: [] },
      error: null,
    }));
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />, '?view=query');
    await screen.findByTestId('query-builder');
    expect(screen.queryByTestId('chat-panel')).not.toBeInTheDocument();
  });

  it('stays out of the inspector while browsing a collection', async () => {
    const client = conversationalClient();
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />);
    await screen.findByTestId('facet-panel');
    expect(screen.queryByTestId('chat-panel')).not.toBeInTheDocument();
  });

  it('composes turns and shows the draft spec', async () => {
    const user = userEvent.setup();
    const client = conversationalClient();
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />, '?view=query');

    await screen.findByTestId('chat-panel');
    await user.type(screen.getByRole('textbox', { name: 'Describe the query' }), 'recent books');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Filtering to recent books.')).toBeInTheDocument();
    // The artifact reads back as language, in the builder's own words.
    const prose = await screen.findByTestId('spec-prose');
    expect(prose).toHaveTextContent('Rows are');
  });

  it('sends the prior turns and the draft back on the next turn', async () => {
    const user = userEvent.setup();
    const client = conversationalClient();
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />, '?view=query');

    await screen.findByTestId('chat-panel');
    const input = screen.getByRole('textbox', { name: 'Describe the query' });
    await user.type(input, 'recent books');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Filtering to recent books.');
    await user.type(input, 'only hardbacks');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Filtering to only hardbacks.');

    const second = client.recorded.filter((r) => r.document.includes('ApertureConverse'))[1];
    expect((second.variables['turns'] as WireTurn[]).map((t) => t.utterance)).toEqual([
      'recent books',
    ]);
    expect(second.variables['querySpec']).toMatchObject({ anchor: 'Book' });
  });

  // The v2 canonicalization (task 4.1) is what makes this work: the planner
  // names its anchor by LinkML class (`Book`) and the artifact now speaks the
  // same vocabulary, so the handoff runs instead of degrading.
  it('hands a spec anchored by LinkML class name to the builder', async () => {
    const user = userEvent.setup();
    const client = conversationalClient({ anchor: 'Book' });
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />, '?view=query');

    await screen.findByTestId('chat-panel');
    await user.type(screen.getByRole('textbox', { name: 'Describe the query' }), 'recent books');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Filtering to recent books.');

    expect(screen.getByRole('button', { name: 'Use in builder' })).toBeEnabled();
    expect(screen.queryByText(/exposes no type/)).not.toBeInTheDocument();
  });

  // Honest degradation survives v2 for the case that is still real (ADR-0029):
  // an anchor this endpoint has no type for.
  it('refuses a spec whose anchor the endpoint exposes no type for', async () => {
    const user = userEvent.setup();
    const client = conversationalClient({ anchor: 'Ghost' });
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />, '?view=query');

    await screen.findByTestId('chat-panel');
    await user.type(screen.getByRole('textbox', { name: 'Describe the query' }), 'recent books');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Filtering to recent books.');

    expect(screen.getByRole('button', { name: 'Use in builder' })).toBeDisabled();
    expect(screen.getByText(/exposes no type/)).toBeInTheDocument();
  });

  /**
   * The handoff writes the spec to the URL, which auto-runs it — but the
   * builder's draft is its own state. Without an adopt-on-change sync the
   * planner's criteria never appear in the editor, and the next Run silently
   * executes whatever empty draft was on screen instead of the query the user
   * just approved.
   */
  it('loads the proposed criteria into the builder, not just the URL', async () => {
    const user = userEvent.setup();
    const client = conversationalClient({
      criteria: [{ kind: 'field', slot: 'title', op: 'eq', value: 'Dune' }],
    });
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />, '?view=query');

    await screen.findByTestId('chat-panel');
    await user.type(screen.getByRole('textbox', { name: 'Describe the query' }), 'books named Dune');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Filtering to books named Dune.');

    expect(screen.queryAllByTestId('query-condition')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Use in builder' }));

    const rows = await screen.findAllByTestId('query-condition');
    expect(rows).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: 'Field' })).toHaveValue('title');
  });

  it('flags turns an edit invalidated instead of dropping them', async () => {
    const user = userEvent.setup();
    const client = conversationalClient();
    renderApp(<App endpoint={endpoint} clientFactory={() => client} />, '?view=query');

    await screen.findByTestId('chat-panel');
    const input = screen.getByRole('textbox', { name: 'Describe the query' });
    await user.type(input, 'recent books');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Filtering to recent books.');
    await user.type(input, 'only hardbacks');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Filtering to only hardbacks.');

    // Rewind turn 1; turn 2 depended on it.
    await user.click(screen.getAllByRole('button', { name: /Rewrite turn 1/ })[0]);
    await user.clear(input);
    await user.type(input, 'xyzzy');
    await user.click(screen.getByRole('button', { name: 'Redo turn' }));

    expect(await screen.findByText('No longer applies.')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /1 turn needs re-wording/ }),
    ).toBeInTheDocument();
    // Flagged, not dropped — the original wording is still on screen.
    expect(screen.getByText('only hardbacks')).toBeInTheDocument();
  });

  /**
   * Mosaic's MCP boundary re-validates every candidate spec and, on failure,
   * returns a bare error turn with NO `turns` list at all (`mcp/server.py`;
   * the ADR-0010 relay re-validates the proposed turn and every recomputed
   * one). Its own message says "Nothing was applied", so the conversation is
   * still current — the error is one more turn on the end, not a reset. This
   * is the reverse-edge case of mosaic#204 arriving as a real response.
   */
  it('keeps the transcript when the server rejects a spec with a listless error turn', async () => {
    const user = userEvent.setup();
    let calls = 0;
    const client = fakeClient(capableSchema({ conversational: true }), (query, variables) => {
      if (!query.includes('ApertureConverse')) {
        return { data: { books: [], authors: [] }, error: null } as GraphQLResult<unknown>;
      }
      calls += 1;
      const utterance = variables['utterance'] as string;
      if (calls === 1) {
        const turn = {
          id: 't1',
          utterance,
          status: 'proposal',
          message: 'Filtering to recent books.',
          query_spec: { v: 1, anchor: 'Book', mode: 'AND', criteria: [] },
        };
        return {
          data: { converseQuerySpec: { turn, turns: [turn], suspended_turn_ids: [] } },
          error: null,
        };
      }
      // The boundary's rejection shape: a turn, no list, no suspensions.
      return {
        data: {
          converseQuerySpec: {
            turn: {
              id: 'err',
              utterance,
              status: 'error',
              message: 'Planner proposed a QuerySpec that failed validation (UNKNOWN_EDGE). Nothing was applied.',
              query_spec: null,
            },
            suspended_turn_ids: [],
          },
        },
        error: null,
      };
    });

    renderApp(<App endpoint={endpoint} clientFactory={() => client} />, '?view=query');
    await screen.findByTestId('chat-panel');
    const input = screen.getByRole('textbox', { name: 'Describe the query' });

    await user.type(input, 'recent books');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Filtering to recent books.');

    await user.type(input, 'the donors of those samples');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText(/failed validation/);

    // The first turn survived the rejection — both turns are on screen.
    expect(screen.getByText('Filtering to recent books.')).toBeInTheDocument();
    expect(screen.getAllByTestId('chat-turn')).toHaveLength(2);
  });
});
