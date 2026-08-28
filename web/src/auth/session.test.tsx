import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { App } from '../App';
import { SessionProvider, useSession } from './SessionContext';
import { capableSchema, fakeClient } from '../data/testing/fixtures';
import { resolveAuthConfig } from './config';

const endpoint = { url: 'http://example.test/graphql' };
const proxyConfig = resolveAuthConfig({ VITE_AUTH_MODE: 'proxy' });

/** An identity endpoint returning `claims`, or a status when given a number. */
function identityFetch(result: number | Record<string, unknown>): typeof fetch {
  return (async () =>
    typeof result === 'number'
      ? { ok: false, status: result, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => result }) as unknown as typeof fetch;
}

function dataClient(seedDocs: Record<string, unknown>[] = []) {
  const docs = [...seedDocs];
  return fakeClient(
    capableSchema({ documents: true, documentOwnership: true }),
    (query, variables) => {
      if (query.includes('apertureDocuments')) {
        const filter = (variables['filter'] ?? {}) as Record<string, string>;
        return {
          data: {
            apertureDocuments: docs.filter((d) =>
              (['kind', 'name', 'owner', 'visibility'] as const).every(
                (f) => filter[f] == null || String(d[f] ?? '') === filter[f],
              ),
            ),
          },
          error: null,
        };
      }
      if (query.includes('createApertureDocument')) {
        const input = variables['input'] as Record<string, unknown>;
        const doc = { id: `DOC-${docs.length + 1}`, ...input };
        docs.push(doc);
        return { data: { createApertureDocument: doc }, error: null };
      }
      return { data: { books: [{ id: 'BK-0001' }], authors: [] }, error: null };
    },
  );
}

function renderApp(ui: React.ReactNode, searchParams = '') {
  return render(
    <NuqsTestingAdapter searchParams={searchParams} hasMemory>
      {ui}
    </NuqsTestingAdapter>,
  );
}

describe('identity capability (ADR-0038)', () => {
  it('renders nothing at all when auth is unconfigured — today\'s deployments', async () => {
    renderApp(<App endpoint={endpoint} clientFactory={() => dataClient()} />);
    await screen.findByText(/Control plane:/);
    expect(screen.queryByTestId('identity')).not.toBeInTheDocument();
  });

  it('shows the display name and a sign-out affordance when signed in', async () => {
    renderApp(
      <App
        endpoint={endpoint}
        clientFactory={() => dataClient()}
        authConfig={proxyConfig}
        fetchImpl={identityFetch({ preferredUsername: 'alice', name: 'Alice A', groups: ['ptsd'] })}
      />,
    );
    expect(await screen.findByText('Alice A')).toBeInTheDocument();
    expect(screen.getByTestId('identity-sign-out')).toBeInTheDocument();
  });

  it('offers sign-in when the proxy reports no session', async () => {
    renderApp(
      <App
        endpoint={endpoint}
        clientFactory={() => dataClient()}
        authConfig={proxyConfig}
        fetchImpl={identityFetch(401)}
      />,
    );
    expect(await screen.findByTestId('identity-sign-in')).toBeInTheDocument();
  });

  it('distinguishes a broken identity endpoint from a signed-out user', async () => {
    renderApp(
      <App
        endpoint={endpoint}
        clientFactory={() => dataClient()}
        authConfig={proxyConfig}
        fetchImpl={identityFetch(500)}
      />,
    );
    // Not "Sign in" — a misconfigured endpoint needs different words and a
    // different action than an expired session (ADR-0029).
    expect(await screen.findByText('Sign-in unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('identity-sign-in')).not.toBeInTheDocument();
  });

  it('errors rather than keying the viewer on email', async () => {
    renderApp(
      <App
        endpoint={endpoint}
        clientFactory={() => dataClient()}
        authConfig={proxyConfig}
        fetchImpl={identityFetch({ email: 'alice@va.gov' })}
      />,
    );
    const identity = await screen.findByTestId('identity');
    expect(identity).toHaveTextContent('Sign-in unavailable');
    expect(identity).toHaveAttribute('title', expect.stringContaining('VITE_AUTH_IDENTITY_CLAIM'));
  });

  it('feeds the session identity to the control plane as the document owner', async () => {
    renderApp(
      <App
        endpoint={endpoint}
        clientFactory={() => dataClient()}
        authConfig={proxyConfig}
        fetchImpl={identityFetch({ preferredUsername: 'alice' })}
      />,
    );
    // ADR-0038 fills ADR-0032's viewer seam: per-user scoping lights up
    // without any explicit `viewer` prop.
    await waitFor(() =>
      expect(screen.getByTestId('control-plane-status')).toHaveTextContent('your own (alice)'),
    );
  });

  it('an explicit viewer prop still overrides the session', async () => {
    renderApp(
      <App
        endpoint={endpoint}
        clientFactory={() => dataClient()}
        viewer="carol"
        authConfig={proxyConfig}
        fetchImpl={identityFetch({ preferredUsername: 'alice' })}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('control-plane-status')).toHaveTextContent('your own (carol)'),
    );
  });
});

/* ------------------------------------------------------------------ */
/* The hand-off (ADR-0038): always a top-level navigation              */
/* ------------------------------------------------------------------ */

/** Exercises the provider directly, through its `navigate` seam. */
function SignInProbe() {
  const { signIn, signOut } = useSession();
  return (
    <>
      <button type="button" data-testid="probe-in" onClick={() => signIn('/collections?page=3')}>
        in
      </button>
      <button type="button" data-testid="probe-out" onClick={() => signOut()}>
        out
      </button>
    </>
  );
}

describe('sign-in / sign-out hand-off', () => {
  const renderProbe = (config = proxyConfig) => {
    const navigated: string[] = [];
    render(
      <SessionProvider config={config} navigate={(url) => navigated.push(url)} fetchImpl={identityFetch(401)}>
        <SignInProbe />
      </SessionProvider>,
    );
    return navigated;
  };

  it('navigates the whole window to the login URL, carrying the return path', async () => {
    const user = userEvent.setup();
    const navigated = renderProbe();
    await user.click(screen.getByTestId('probe-in'));
    // A PIV/CAC challenge needs the card and PIN prompt, which an iframe or an
    // XHR cannot reach — so this must be a top-level navigation, not a fetch.
    expect(navigated).toEqual(['/oauth2/start?rd=%2Fcollections%3Fpage%3D3']);
  });

  it('leaves a login URL that already carries its own return parameter alone', async () => {
    const user = userEvent.setup();
    const navigated = renderProbe({ ...proxyConfig, loginUrl: '/login?rd=/fixed' });
    await user.click(screen.getByTestId('probe-in'));
    expect(navigated).toEqual(['/login?rd=/fixed']);
  });

  it('signs out through the proxy route, not by dropping a cookie', async () => {
    const user = userEvent.setup();
    const navigated = renderProbe();
    await user.click(screen.getByTestId('probe-out'));
    // Clearing Aperture's cookie would not end the IdP session — the next
    // sign-in would silently reuse it.
    expect(navigated).toEqual(['/oauth2/sign_out']);
  });

  it('does nothing on sign-out when no logout route is configured', async () => {
    const user = userEvent.setup();
    const navigated = renderProbe({ ...proxyConfig, logoutUrl: null });
    await user.click(screen.getByTestId('probe-out'));
    expect(navigated).toEqual([]);
  });
});
