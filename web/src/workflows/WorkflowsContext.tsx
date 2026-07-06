import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useControlPlane } from '../control/ControlPlaneContext';
import { openPayload, sealPayload } from '../control/store';
import type { ResolvedWorkflows } from './config';
import { parseWorkflowConfigs } from './config';

/**
 * Configured workflows (steps-as-data). Resolution order (config-as-data,
 * ADR-0003/0004): a control-plane `config/workflows` document wins over the
 * env-resolved default; an INVALID document falls back to env with the error
 * surfaced in the nav — config problems are never swallowed (ADR-0029).
 */
export const WORKFLOWS_CONFIG_VERSION = 1;

export function sealWorkflowsConfig(workflows: unknown): string {
  return sealPayload(WORKFLOWS_CONFIG_VERSION, workflows);
}

const WorkflowsContext = createContext<ResolvedWorkflows>({ workflows: [] });

export function WorkflowsProvider({
  value,
  children,
}: {
  /** The env-resolved default (VITE_WORKFLOWS). */
  value: ResolvedWorkflows;
  children: ReactNode;
}) {
  const { status: storeStatus, store } = useControlPlane();
  const [resolved, setResolved] = useState<ResolvedWorkflows>(value);

  useEffect(() => {
    setResolved(value);
    if (storeStatus !== 'ready') return;
    let cancelled = false;
    store
      .get('config', 'workflows')
      .then((document) => {
        if (cancelled || document == null) return;
        // The envelope check is version-only here; parseWorkflowConfigs is
        // the structural validator for the data inside.
        const isAny = (d: unknown): d is unknown => d !== undefined;
        const raw = openPayload(document.payload, WORKFLOWS_CONFIG_VERSION, isAny);
        if (raw == null) {
          setResolved({
            workflows: value.workflows,
            error: 'The control-plane workflows config has an invalid envelope — using the local config.',
          });
          return;
        }
        try {
          setResolved({ workflows: parseWorkflowConfigs(raw) });
        } catch (error) {
          setResolved({
            workflows: value.workflows,
            error: `The control-plane workflows config is invalid: ${
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

  return <WorkflowsContext.Provider value={resolved}>{children}</WorkflowsContext.Provider>;
}

export function useWorkflows(): ResolvedWorkflows {
  return useContext(WorkflowsContext);
}
