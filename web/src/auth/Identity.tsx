import { useSession } from './SessionContext';

/**
 * Header-slot identity (ADR-0038): who the viewer is, and a way out. Renders
 * nothing at all when auth is not configured, so an unauthenticated deployment
 * looks exactly as it did before this capability existed.
 *
 * This is presentation. It gates no request and enforces nothing — an
 * unauthenticated user is kept out by the proxy, never by this component
 * (ADR-0008/0016).
 */
export function Identity() {
  const { state, signIn, signOut, config } = useSession();

  if (state.status === 'disabled') return null;

  if (state.status === 'loading') {
    return (
      <span className="identity identity-muted" data-testid="identity">
        Signing in…
      </span>
    );
  }

  if (state.status === 'error') {
    // Named, not swallowed: a misconfigured identity endpoint looks exactly
    // like a signed-out user unless we say which it is (ADR-0029).
    return (
      <span className="identity identity-error" data-testid="identity" role="alert" title={state.message}>
        Sign-in unavailable
      </span>
    );
  }

  if (state.status === 'anonymous') {
    return (
      <span className="identity" data-testid="identity">
        <button
          type="button"
          className="action-button identity-action"
          data-testid="identity-sign-in"
          onClick={() => signIn()}
        >
          Sign in
        </button>
      </span>
    );
  }

  return (
    <span className="identity" data-testid="identity">
      <span className="identity-name" title={`Signed in as ${state.identity}`}>
        {state.displayName}
      </span>
      {config.logoutUrl != null && (
        <button
          type="button"
          className="action-button identity-action"
          data-testid="identity-sign-out"
          onClick={() => signOut()}
        >
          Sign out
        </button>
      )}
    </span>
  );
}
