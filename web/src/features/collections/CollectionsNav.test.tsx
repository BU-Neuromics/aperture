/**
 * The nav agrees with itself about where the user is.
 *
 * `collection` deliberately survives in the URL while a query view is open — it is how
 * "Back to collections" knows where to return. The nav read that as "this collection is
 * current" and marked it, so opening the query surface left the sidebar pointing at one
 * collection while the anchor control pointed at another, and the query entry itself was
 * never marked at all. Two controls disagreeing about where you are is worse than either
 * being wrong; found by driving the page, not by a test, which is why this one exists.
 */
import { render, screen } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { App } from '../../App';
import { capableSchema, fakeClient } from '../../data/testing/fixtures';

const endpoint = { url: 'http://nav.test/graphql' };

function renderApp(ui: ReactNode, searchParams = '') {
  return render(
    <NuqsTestingAdapter searchParams={searchParams} hasMemory>
      {ui}
    </NuqsTestingAdapter>,
  );
}

const client = () =>
  fakeClient(capableSchema(), () => ({ data: { books: [], authors: [] }, error: null }));

/** Every nav entry the browser would report as current. */
function currentEntries(): string[] {
  return screen
    .getAllByRole('button')
    .filter((el) => el.getAttribute('aria-current') === 'true')
    .map((el) => el.textContent ?? '');
}

describe('CollectionsNav — exactly one entry is current', () => {
  it('marks a collection while browsing collections', async () => {
    renderApp(<App endpoint={endpoint} clientFactory={client} />, '?collection=books');
    await screen.findByTestId('nav-query-builder');
    expect(currentEntries()).toHaveLength(1);
    expect(currentEntries()[0]).toMatch(/books/i);
  });

  it('moves the marker to the query entry when the query surface is open', async () => {
    // `collection` is still in the URL here — that is the case that used to double-mark.
    renderApp(<App endpoint={endpoint} clientFactory={client} />, '?collection=books&view=query');
    await screen.findByTestId('query-builder');

    const current = currentEntries();
    expect(current).toHaveLength(1);
    expect(current[0]).toMatch(/query builder/i);
    expect(screen.getByTestId('nav-query-builder')).toHaveAttribute('aria-current', 'true');
  });

  it('marks no collection in the query surface, so nothing contradicts the anchor', async () => {
    renderApp(<App endpoint={endpoint} clientFactory={client} />, '?collection=books&view=query');
    await screen.findByTestId('query-builder');
    expect(currentEntries().some((label) => /books|authors/i.test(label))).toBe(false);
  });

  // NOT covered here: the graph view (`view=graph`), which the same expression treats
  // identically. It does not render under jsdom in this harness — the body comes back
  // empty — and making it do so is a fixture problem unrelated to the nav. Left uncovered
  // and said so, rather than asserted against a component that never mounted.
});
