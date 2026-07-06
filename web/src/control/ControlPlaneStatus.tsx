import { useControlPlane } from './ControlPlaneContext';

/**
 * The footer status line: where saved views/drafts/config actually live —
 * persistence scope stays legible (ADR-0029).
 */
export function ControlPlaneStatus() {
  const { status, store } = useControlPlane();
  if (status !== 'ready') return <span>Control plane: resolving…</span>;
  return (
    <span>
      Control plane:{' '}
      {store.backend === 'hippo'
        ? 'LinkML-on-Hippo document store'
        : 'this browser only (no document type advertised by the endpoint)'}
    </span>
  );
}
