import { useControlPlane } from './ControlPlaneContext';

/**
 * The footer status line: where saved views/drafts/config actually live —
 * persistence scope stays legible (ADR-0029).
 */
export function ControlPlaneStatus() {
  const { status, store } = useControlPlane();
  // data-testid is the stable certification contract (datahelix golden-path
  // suite; #15) — the scenario asserts the Hippo-backed store is reported.
  if (status !== 'ready') {
    return <span data-testid="control-plane-status">Control plane: resolving…</span>;
  }
  return (
    <span data-testid="control-plane-status">
      Control plane:{' '}
      {store.backend === 'hippo'
        ? 'LinkML-on-Hippo document store'
        : 'this browser only (no document type advertised by the endpoint)'}
    </span>
  );
}
