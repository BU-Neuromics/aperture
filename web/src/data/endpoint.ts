import { runtimeEnv } from '../config/runtime';

/**
 * Step 0.2 — endpoint config (N5.2): exactly one active data-plane endpoint,
 * resolved from env (build-time VITE_* overlaid by the image's runtime
 * config — see `config/runtime.ts`). Swapping the source (Hippo →
 * Bridge/Cappella) is a config change, never a refactor (ADR-0017).
 */
export interface EndpointConfig {
  /** GraphQL endpoint URL, or null when unconfigured (degrade honestly). */
  url: string | null;
}

export function resolveEndpoint(
  env: Record<string, unknown> = runtimeEnv(),
): EndpointConfig {
  const raw = env['VITE_HIPPO_GRAPHQL_URL'];
  const url = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
  return { url };
}
