import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useDataSource } from '../data/DataSourceContext';
import { connectHippoSource } from '../data/hippoSource';
import type { ScopedDataClient } from '../data/scopedClient';
import { createPassthroughClient } from '../data/scopedClient';
import type { ControlPlaneStore } from './store';
import { createHippoStore, createLocalStore, findDocumentCollection } from './store';

/**
 * Resolves the control-plane store once per session (N5.4): the control
 * endpoint defaults to the data-plane endpoint (co-located for MVP;
 * `VITE_HIPPO_CONTROL_PLANE_URL` points elsewhere when split). If the
 * endpoint's schema advertises an Aperture document type, documents live
 * there; otherwise persistence falls back to this browser's localStorage —
 * and the UI says so (ADR-0029).
 */
export interface ControlPlaneState {
  status: 'resolving' | 'ready';
  store: ControlPlaneStore;
}

const ControlPlaneContext = createContext<ControlPlaneState>({
  status: 'resolving',
  store: createLocalStore(),
});

export function resolveControlPlaneUrl(
  env: Record<string, unknown> = import.meta.env,
): string | null {
  const raw = env['VITE_HIPPO_CONTROL_PLANE_URL'];
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
}

export function ControlPlaneProvider({
  controlUrl = resolveControlPlaneUrl(),
  clientFactory = createPassthroughClient,
  children,
}: {
  /** Explicit control-plane endpoint; null → co-located with the data plane. */
  controlUrl?: string | null;
  clientFactory?: (url: string) => ScopedDataClient;
  children: ReactNode;
}) {
  const dataState = useDataSource();
  const [state, setState] = useState<ControlPlaneState>({
    status: 'resolving',
    store: createLocalStore(),
  });

  useEffect(() => {
    let cancelled = false;
    const fallback = () => {
      if (!cancelled) setState({ status: 'ready', store: createLocalStore() });
    };

    if (controlUrl == null) {
      // Co-located: the data-plane source doubles as the control plane.
      if (dataState.status === 'connecting') return; // wait for the outcome
      if (dataState.status !== 'ready') return fallback();
      const collection = findDocumentCollection(dataState.source);
      if (!cancelled) {
        setState({
          status: 'ready',
          store: collection
            ? createHippoStore(dataState.source, collection)
            : createLocalStore(),
        });
      }
      return;
    }

    connectHippoSource(clientFactory(controlUrl))
      .then((source) => {
        if (cancelled) return;
        const collection = findDocumentCollection(source);
        setState({
          status: 'ready',
          store: collection ? createHippoStore(source, collection) : createLocalStore(),
        });
      })
      .catch(fallback);
    return () => {
      cancelled = true;
    };
  }, [controlUrl, clientFactory, dataState]);

  return <ControlPlaneContext.Provider value={state}>{children}</ControlPlaneContext.Provider>;
}

export function useControlPlane(): ControlPlaneState {
  return useContext(ControlPlaneContext);
}
