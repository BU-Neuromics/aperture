import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthConfig, Claims } from './config';
import { resolveAuthConfig, resolveDisplayName, resolveGroups, resolveIdentity } from './config';

/**
 * The viewer's session, as reported by the authenticating proxy in front of
 * Aperture (ADR-0038). Aperture reads it and presents it; it never establishes
 * one, never holds a token, and never decides whether a request is permitted.
 *
 * States are honest and distinct (ADR-0029) — in particular `error` is not
 * collapsed into `anonymous`, because "the identity endpoint is misconfigured"
 * and "you are signed out" need different words and different actions.
 */
export type SessionState =
  | { status: 'disabled' }
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; identity: string; displayName: string; groups: string[] }
  | { status: 'error'; message: string };

export interface Session {
  state: SessionState;
  config: AuthConfig;
  /** The control-plane document owner (ADR-0032), or null when unauthenticated. */
  viewer: string | null;
  /**
   * Leave for the sign-in URL. A TOP-LEVEL navigation, always: a PIV/CAC
   * challenge needs the card and PIN prompt, which an iframe or XHR cannot
   * reach — that produces a hung state with no visible cause (ADR-0038).
   */
  signIn(returnTo?: string): void;
  signOut(): void;
}

const DISABLED: SessionState = { status: 'disabled' };

const SessionContext = createContext<Session>({
  state: DISABLED,
  config: { mode: 'none', identityUrl: '', loginUrl: '', logoutUrl: null, identityClaim: null, displayClaim: null },
  viewer: null,
  signIn: () => {},
  signOut: () => {},
});

/** Seam so tests can assert the navigation without a jsdom "not implemented". */
export type Navigate = (url: string) => void;

const defaultNavigate: Navigate = (url) => {
  window.location.assign(url);
};

function withReturnTo(url: string, returnTo: string): string {
  // oauth2-proxy reads `rd`; a proxy using another name can be given a URL that
  // already carries its own parameter, which we leave alone.
  if (url.includes('rd=')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}rd=${encodeURIComponent(returnTo)}`;
}

export function SessionProvider({
  config = resolveAuthConfig(),
  navigate = defaultNavigate,
  fetchImpl,
  children,
}: {
  config?: AuthConfig;
  /** Test seam for the top-level navigation. */
  navigate?: Navigate;
  /** Test seam for the identity request. */
  fetchImpl?: typeof fetch;
  children: ReactNode;
}) {
  const [state, setState] = useState<SessionState>(
    config.mode === 'none' ? DISABLED : { status: 'loading' },
  );

  useEffect(() => {
    if (config.mode === 'none') {
      setState(DISABLED);
      return;
    }
    const doFetch = fetchImpl ?? globalThis.fetch;
    let cancelled = false;
    setState({ status: 'loading' });

    doFetch(config.identityUrl, {
      // The session is a cookie the proxy set. No Authorization header is sent
      // and no token is ever read into the SPA (ADR-0038).
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 401 || response.status === 403) {
          setState({ status: 'anonymous' });
          return;
        }
        if (!response.ok) {
          setState({
            status: 'error',
            message: `Identity endpoint ${config.identityUrl} returned ${response.status}.`,
          });
          return;
        }
        const claims = (await response.json()) as Claims;
        const identity = resolveIdentity(claims, config);
        if (identity == null) {
          // Deliberately an error, not a guess. Keying on a changing value —
          // email above all — would orphan this user's control-plane documents
          // the day it changes (ADR-0038).
          setState({
            status: 'error',
            message:
              'Signed in, but the identity endpoint returned no usable identity claim. ' +
              'Set VITE_AUTH_IDENTITY_CLAIM to the claim holding a stable id (UPN or EDIPI, never email).',
          });
          return;
        }
        setState({
          status: 'authenticated',
          identity,
          displayName: resolveDisplayName(claims, config, identity),
          groups: resolveGroups(claims),
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: `Could not reach the identity endpoint: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [config, fetchImpl]);

  const signIn = useCallback(
    (returnTo?: string) => {
      const target = returnTo ?? `${window.location.pathname}${window.location.search}`;
      navigate(withReturnTo(config.loginUrl, target));
    },
    [config.loginUrl, navigate],
  );

  const signOut = useCallback(() => {
    if (config.logoutUrl == null) return;
    // Clearing a local cookie would not end the IdP session; the proxy's
    // sign-out route is what does (RP-initiated logout).
    navigate(config.logoutUrl);
  }, [config.logoutUrl, navigate]);

  const value = useMemo<Session>(
    () => ({
      state,
      config,
      viewer: state.status === 'authenticated' ? state.identity : null,
      signIn,
      signOut,
    }),
    [state, config, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  return useContext(SessionContext);
}
