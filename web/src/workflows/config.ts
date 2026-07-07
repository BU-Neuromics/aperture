/**
 * Workflow config — steps-as-data (W4.6; CNCF Serverless Workflow is the
 * model): a serializable description of a guided multi-entity workflow, never
 * code. Each step stages one entity of a schema type; the step's form derives
 * from that type's create input (the Tier-0 generator). `bindings` wire a
 * step's field to a prior step's staged entity — committed as intra-batch
 * references (ADR-0028).
 *
 * MVP source of config: the `VITE_WORKFLOWS` env var (JSON array), or the
 * default below. Phase 4 moves this into the control-plane store as
 * config-as-data proper (ADR-0003/0004).
 */
import { runtimeEnv } from '../config/runtime';

export interface WorkflowBinding {
  /** Field on this step's entity that references the prior step's entity. */
  field: string;
  /** The earlier step whose staged entity this field points at. */
  fromStep: string;
}

export interface WorkflowStepConfig {
  id: string;
  label: string;
  /** Entity type this step stages (must have a create-shaped mutation). */
  entityType: string;
  description?: string;
  bindings?: WorkflowBinding[];
}

export interface WorkflowConfig {
  id: string;
  version: string;
  label: string;
  description?: string;
  steps: WorkflowStepConfig[];
}

/** Deployment default: none. Domain workflows come from config (ADR-0002). */
export const DEFAULT_WORKFLOWS: WorkflowConfig[] = [];

function fail(message: string): never {
  throw new Error(message);
}

export function parseWorkflowConfigs(raw: unknown): WorkflowConfig[] {
  if (!Array.isArray(raw)) fail('workflow config must be a JSON array');
  return raw.map((entry, i) => {
    if (typeof entry !== 'object' || entry == null) fail(`workflow[${i}] must be an object`);
    const w = entry as Record<string, unknown>;
    for (const key of ['id', 'version', 'label'] as const) {
      if (typeof w[key] !== 'string' || w[key] === '') fail(`workflow[${i}].${key} must be a string`);
    }
    if (!Array.isArray(w['steps']) || w['steps'].length === 0) {
      fail(`workflow[${i}].steps must be a non-empty array`);
    }
    const stepIds = new Set<string>();
    const steps = (w['steps'] as unknown[]).map((rawStep, j) => {
      if (typeof rawStep !== 'object' || rawStep == null) fail(`workflow[${i}].steps[${j}] must be an object`);
      const s = rawStep as Record<string, unknown>;
      for (const key of ['id', 'label', 'entityType'] as const) {
        if (typeof s[key] !== 'string' || s[key] === '') {
          fail(`workflow[${i}].steps[${j}].${key} must be a string`);
        }
      }
      if (stepIds.has(s['id'] as string)) fail(`workflow[${i}] has duplicate step id “${s['id']}”`);
      const bindings = (s['bindings'] as unknown[] | undefined)?.map((rawBinding, k) => {
        if (typeof rawBinding !== 'object' || rawBinding == null) {
          fail(`workflow[${i}].steps[${j}].bindings[${k}] must be an object`);
        }
        const b = rawBinding as Record<string, unknown>;
        if (typeof b['field'] !== 'string' || typeof b['fromStep'] !== 'string') {
          fail(`workflow[${i}].steps[${j}].bindings[${k}] needs field + fromStep`);
        }
        if (!stepIds.has(b['fromStep'])) {
          fail(
            `workflow[${i}].steps[${j}] binds “${b['field']}” to “${b['fromStep']}”, which is not an earlier step`,
          );
        }
        return { field: b['field'], fromStep: b['fromStep'] };
      });
      stepIds.add(s['id'] as string);
      return {
        id: s['id'] as string,
        label: s['label'] as string,
        entityType: s['entityType'] as string,
        description: typeof s['description'] === 'string' ? s['description'] : undefined,
        bindings,
      };
    });
    return {
      id: w['id'] as string,
      version: w['version'] as string,
      label: w['label'] as string,
      description: typeof w['description'] === 'string' ? w['description'] : undefined,
      steps,
    };
  });
}

export interface ResolvedWorkflows {
  workflows: WorkflowConfig[];
  /** A config parse problem — surfaced, never swallowed (ADR-0029). */
  error?: string;
}

export function resolveWorkflows(env: Record<string, unknown> = runtimeEnv()): ResolvedWorkflows {
  const raw = env['VITE_WORKFLOWS'];
  if (typeof raw !== 'string' || raw.trim() === '') return { workflows: DEFAULT_WORKFLOWS };
  try {
    return { workflows: parseWorkflowConfigs(JSON.parse(raw)) };
  } catch (error) {
    return {
      workflows: [],
      error: `VITE_WORKFLOWS is invalid: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
