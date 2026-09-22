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
import { FieldsPanel } from './FieldsPanel';

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

/**
 * The panel follows the answer, not the anchor.
 *
 * Rendered directly rather than through `App`: driving a conversational turn end to end
 * needs a planner, and the behaviour under test is the panel's, not the planner's.
 */
describe('FieldsPanel — showing a collection the query is not anchored on', () => {
  const collection = {
    id: 'toxicology_reports',
    label: 'Toxicology reports',
    typeName: 'ToxicologyReport',
    description: 'A post-mortem toxicology screen.',
    filterFields: ['panel_type'],
    detailColumns: [
      { field: 'panelType', slot: 'panel_type', label: 'Panel type', kind: 'scalar' as const },
    ],
  } as never;

  const props = {
    collection,
    highlighted: new Set(['panel_type']),
    hiddenFields: new Set<string>(),
    onAddFilter: () => {},
    onToggleField: () => {},
    showColumnToggles: false,
  };

  it('says why it is showing fields the user did not anchor on', () => {
    render(<FieldsPanel {...props} asideFromAnchor onAdoptAnchor={() => {}} />);
    // Without this the reader sees unfamiliar fields and cannot tell an answer from a bug.
    expect(screen.getByTestId('fields-panel-aside')).toBeInTheDocument();
  });

  it('says nothing when the shown collection IS the anchor', () => {
    render(<FieldsPanel {...props} />);
    expect(screen.queryByTestId('fields-panel-aside')).not.toBeInTheDocument();
  });

  it('offers to make it the anchor, and does not act until asked', async () => {
    // Discovery leads into query building by a deliberate gesture. Adopting silently would
    // move the reader's query out from under them.
    let adopted = 0;
    render(<FieldsPanel {...props} asideFromAnchor onAdoptAnchor={() => { adopted += 1; }} />);
    expect(adopted).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: /return rows of toxicology reports/i }));
    expect(adopted).toBe(1);
  });
});
