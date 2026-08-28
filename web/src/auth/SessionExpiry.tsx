import { useEffect } from 'react';
import { useDataSource } from '../data/DataSourceContext';
import { useSession } from './SessionContext';

/**
 * Mid-session expiry (ADR-0038). The proxy keeps unauthenticated users out
 * before the bundle ever loads, so the case this handles is narrow and real: a
 * session that expires while the app is open. The data plane then starts
 * answering 401/403 and the UI would otherwise show an unexplained connection
 * error.
 *
 * The hand-off is a TOP-LEVEL navigation — never a fetch, never an iframe. A
 * PIV/CAC challenge needs the card and PIN prompt, which a background request
 * cannot reach; doing it wrong produces a hung state with no visible cause.
 */
export function SessionExpiry() {
  const { state, signIn, config } = useSession();
  const dataState = useDataSource();

  const expired =
    config.mode === 'proxy' &&
    dataState.status === 'error' &&
    /\b(401|403|unauthori[sz]ed|forbidden)\b/i.test(dataState.message);

  useEffect(() => {
    // Only bounce a viewer the proxy has already signed out. While we still
    // believe the session is good, show the panel and let them choose — an
    // automatic redirect on a misread error message would be a redirect loop.
    if (expired && state.status === 'anonymous') signIn();
  }, [expired, state.status, signIn]);

  if (!expired) return null;

  return (
    <div className="session-expired" role="alert" data-testid="session-expired">
      <strong>Your session has ended.</strong> Sign in again to continue — your saved views are
      unaffected.{' '}
      <button
        type="button"
        className="action-button identity-action"
        data-testid="session-expired-sign-in"
        onClick={() => signIn()}
      >
        Sign in
      </button>
    </div>
  );
}
