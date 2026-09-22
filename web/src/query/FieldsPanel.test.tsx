/**
 * The fields panel — what the surface shows when it has no results.
 *
 * The behaviour worth protecting is the one that is easiest to lose: `+ filter` must NOT
 * run anything. In this builder a spec in the URL *is* an executed query, so an affordance
 * that wrote there would execute off a single click on a field listing — which ADR-0039
 * rules out ("the user must then explicitly run").
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { capableSchema, fakeClient } from '../data/testing/fixtures';

const endpoint = { url: 'http://fields.test/graphql' };

function renderApp(ui: ReactNode, searchParams = '') {
  return render(
    <NuqsTestingAdapter searchParams={searchParams} hasMemory>
      {ui}
    </NuqsTestingAdapter>,
  );
}

const client = () =>
  fakeClient(capableSchema(), () => ({ data: { books: [], authors: [] }, error: null }));

describe('FieldsPanel', () => {
  it('shows the anchor’s fields instead of an empty state', async () => {
    renderApp(<App endpoint={endpoint} clientFactory={client} />, '?view=query');
    await screen.findByTestId('query-builder');
    await screen.findByTestId('fields-panel');

    // The placeholder this replaced covered most of the screen to say there was nothing
    // to show, while the page held the entire schema.
    expect(screen.queryByText(/nothing run yet/i)).not.toBeInTheDocument();
    expect(screen.getAllByTestId('fields-row').length).toBeGreaterThan(0);
  });

  it('adds a criterion to the draft without executing', async () => {
    const user = userEvent.setup();
    renderApp(<App endpoint={endpoint} clientFactory={client} />, '?view=query');
    await screen.findByTestId('query-builder');
    await screen.findByTestId('fields-panel');

    expect(screen.queryAllByTestId('query-condition')).toHaveLength(0);

    await user.click(screen.getAllByRole('button', { name: '+ filter' })[0]!);

    // In the builder…
    expect(await screen.findAllByTestId('query-condition')).toHaveLength(1);
    // …and nothing ran. Results appear only after Run.
    expect(screen.queryByTestId('query-results')).not.toBeInTheDocument();
    expect(screen.getByTestId('fields-panel')).toBeInTheDocument();
  });

  it('keeps Run present as the only execution gesture', async () => {
    renderApp(<App endpoint={endpoint} clientFactory={client} />, '?view=query');
    await screen.findByTestId('query-builder');
    expect(screen.getByTestId('query-run')).toBeInTheDocument();
  });

  it('degrades without slot enrichment', async () => {
    // An endpoint advertising no `hippoSchema` has no per-field descriptions. The panel
    // must still list every field from the generic type surface (ADR-0029).
    renderApp(<App endpoint={endpoint} clientFactory={client} />, '?view=query');
    await screen.findByTestId('fields-panel');
    const rows = screen.getAllByTestId('fields-row');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.textContent).toBeTruthy();
  });
});
