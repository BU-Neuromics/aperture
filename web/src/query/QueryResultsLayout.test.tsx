/**
 * The result area's containment and zoom.
 *
 * The layout itself (nothing painting over the table) is a browser property
 * jsdom cannot measure; it was checked in Chromium. What is testable here is
 * the structure that layout depends on, and the zoom control's behaviour.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { capableSchema, fakeClient } from '../data/testing/fixtures';

const endpoint = { url: 'http://layout.test/graphql' };

function renderApp(ui: ReactNode, searchParams = '') {
  return render(
    <NuqsTestingAdapter searchParams={searchParams} hasMemory>
      {ui}
    </NuqsTestingAdapter>,
  );
}

const client = () =>
  fakeClient(capableSchema(), () => ({ data: { books: [], authors: [] }, error: null }));

async function runQuery() {
  const user = userEvent.setup();
  renderApp(<App endpoint={endpoint} clientFactory={client} />, '?view=query');
  await screen.findByTestId('query-builder');
  await user.click(screen.getByTestId('query-run'));
  await screen.findByTestId('query-results');
  return user;
}

describe('query results layout', () => {
  it('puts the results table in its own scroll area', async () => {
    await runQuery();
    const box = screen.getByTestId('query-table-scroll');
    expect(box.querySelector('table')).not.toBeNull();
  });

  it('zooms the table out and back in, step by step, within its limits', async () => {
    const user = await runQuery();
    const table = screen.getByTestId('query-table-scroll').querySelector('table')!;
    const level = screen.getByTestId('query-zoom-level');
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });

    // Full size to start; there is no zooming in past it.
    expect(level).toHaveTextContent('100%');
    expect(zoomIn).toBeDisabled();

    await user.click(zoomOut);
    expect(level).toHaveTextContent('90%');
    expect(table.style.zoom).toBe('0.9');

    // Down to the smallest step, where zooming out stops.
    for (let i = 0; i < 6; i++) if (!zoomOut.hasAttribute('disabled')) await user.click(zoomOut);
    expect(level).toHaveTextContent('60%');
    expect(zoomOut).toBeDisabled();

    await user.click(zoomIn);
    expect(level).toHaveTextContent('70%');
  });
});
