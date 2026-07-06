import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { ResolvedWorkflows } from './config';

/** Configured workflows (steps-as-data), resolved once at the app root. */
const WorkflowsContext = createContext<ResolvedWorkflows>({ workflows: [] });

export function WorkflowsProvider({
  value,
  children,
}: {
  value: ResolvedWorkflows;
  children: ReactNode;
}) {
  return <WorkflowsContext.Provider value={value}>{children}</WorkflowsContext.Provider>;
}

export function useWorkflows(): ResolvedWorkflows {
  return useContext(WorkflowsContext);
}
