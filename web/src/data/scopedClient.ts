import { Client, cacheExchange, fetchExchange } from 'urql';

/**
 * The capability-scoped data client seam (steps 0.3/0.7; ADR-0008/0016, N5.3).
 * Everything that talks to the data plane goes through this interface. For MVP
 * it is a transparent pass-through over urql (local Hippo, no auth); Bridge
 * later drops in by wrapping/replacing this client — no other Aperture change.
 * Components never get ambient network access, only an injected client.
 */
export interface GraphQLResult<T> {
  data: T | null;
  error: Error | null;
}

export interface QueryOptions {
  /**
   * Bypass the document cache. Needed for read-after-write over lists that
   * can be empty: urql's document cache stores an empty result with no
   * typename association, so no later mutation ever invalidates it.
   */
  fresh?: boolean;
}

export interface ScopedDataClient {
  query<T>(
    document: string,
    variables?: Record<string, unknown>,
    options?: QueryOptions,
  ): Promise<GraphQLResult<T>>;
  mutate<T>(document: string, variables?: Record<string, unknown>): Promise<GraphQLResult<T>>;
}

export function createPassthroughClient(url: string): ScopedDataClient {
  const client = new Client({ url, exchanges: [cacheExchange, fetchExchange] });
  return {
    async query<T>(document: string, variables?: Record<string, unknown>, options?: QueryOptions) {
      const result = await client
        .query<T>(document, variables ?? {}, options?.fresh ? { requestPolicy: 'network-only' } : undefined)
        .toPromise();
      return { data: result.data ?? null, error: result.error ?? null };
    },
    // Routed through urql's mutation path so the document cache invalidates
    // queries touching the mutated typename.
    async mutate<T>(document: string, variables?: Record<string, unknown>) {
      const result = await client.mutation<T>(document, variables ?? {}).toPromise();
      return { data: result.data ?? null, error: result.error ?? null };
    },
  };
}
