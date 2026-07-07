import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useControlPlane } from '../control/ControlPlaneContext';
import { findDocumentCollection } from '../control/store';
import { openPayload, sealPayload } from '../control/store';
import { useDataSource } from '../data/DataSourceContext';
import type { NavView, ResolvedNavConfig } from './config';
import { buildNavView, DEFAULT_NAV_CONFIG, parseNavConfig } from './config';

/**
 * Nav composition config (R3.1). Resolution order matches the workflows
 * config (ADR-0003/0004): a control-plane `config/nav` document wins over the
 * env-resolved default (`VITE_NAV`); an INVALID document falls back to env
 * with the error surfaced in the nav — never swallowed (ADR-0029).
 */
export const NAV_CONFIG_VERSION = 1;

export function sealNavConfig(config: unknown): string {
  return sealPayload(NAV_CONFIG_VERSION, config);
}

const NavConfigContext = createContext<ResolvedNavConfig>({ config: DEFAULT_NAV_CONFIG });

export function NavConfigProvider({
  value,
  children,
}: {
  /** The env-resolved default (VITE_NAV). */
  value: ResolvedNavConfig;
  children: ReactNode;
}) {
  const { status: storeStatus, store } = useControlPlane();
  const [resolved, setResolved] = useState<ResolvedNavConfig>(value);

  useEffect(() => {
    setResolved(value);
    if (storeStatus !== 'ready') return;
    let cancelled = false;
    store
      .get('config', 'nav')
      .then((document) => {
        if (cancelled || document == null) return;
        // The envelope check is version-only; parseNavConfig is the
        // structural validator for the data inside.
        const isAny = (d: unknown): d is unknown => d !== undefined;
        const raw = openPayload(document.payload, NAV_CONFIG_VERSION, isAny);
        if (raw == null) {
          setResolved({
            config: value.config,
            error: 'The control-plane nav config has an invalid envelope — using the local config.',
          });
          return;
        }
        try {
          setResolved({ config: parseNavConfig(raw) });
        } catch (error) {
          setResolved({
            config: value.config,
            error: `The control-plane nav config is invalid: ${
              error instanceof Error ? error.message : String(error)
            } — using the local config.`,
          });
        }
      })
      .catch(() => {
        // Store unreachable → the env default stands.
      });
    return () => {
      cancelled = true;
    };
  }, [storeStatus, store, value]);

  return <NavConfigContext.Provider value={resolved}>{children}</NavConfigContext.Provider>;
}

export function useNavConfig(): ResolvedNavConfig {
  return useContext(NavConfigContext);
}

/**
 * The config-applied view of the derived collections, or null until the data
 * source is ready. The one source of truth for what the nav lists and which
 * collection is the landing default.
 */
export function useNavView(): NavView | null {
  const state = useDataSource();
  const { config, error } = useNavConfig();
  return useMemo(() => {
    if (state.status !== 'ready') return null;
    return buildNavView(
      state.source.collections,
      config,
      findDocumentCollection(state.source)?.id,
      error,
    );
  }, [state, config, error]);
}
