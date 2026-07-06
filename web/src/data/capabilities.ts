/**
 * The typed capability set the Layer-D adapter negotiates with the active
 * endpoint (ADR-0017/0029, N5.1). Every flag is derived from what the endpoint
 * actually advertises via introspection — never assumed, never faked. The UI
 * gates features on these and degrades honestly when they are absent.
 */
export interface Capabilities {
  /** 'hippo' = `hippoSchema` enrichment available; 'graphql' = standard `__schema` only. */
  schemaIntrospection: 'hippo' | 'graphql' | 'none';
  /** Collection list fields accept limit/offset args. */
  offsetPagination: boolean;
  /** Collection list fields accept an equality filter arg. */
  equalityFacets: boolean;
  /** A full-text-search arg/field is advertised. */
  fullTextSearch: boolean;
  /** Server-side ordering (order_by/sort arg) — Hippo X1; gated off until it lands. */
  sort: boolean;
  /** Counts/totalCount/aggregation — Hippo X1; gated off until it lands. */
  aggregation: boolean;
  /** Entity types expose resolved relationship fields. */
  relationshipTraversal: boolean;
  /** Batch unit-of-work mutations (whole-set dry-run + atomic commit; Hippo #84). */
  batchWrite: boolean;
}

export const NO_CAPABILITIES: Capabilities = {
  schemaIntrospection: 'none',
  offsetPagination: false,
  equalityFacets: false,
  fullTextSearch: false,
  sort: false,
  aggregation: false,
  relationshipTraversal: false,
  batchWrite: false,
};
