# ADR-0029: Capability-gated UI with honest degradation (faceting, aggregation, export)

- **Status:** Accepted
- **Date:** 2026-06-30
- **Deciders:** labadorf, design session
- **Related:** ADR-0002/0017 (generic over any endpoint; Layer-D adapter), ADR-0008 (capability-scoped client); `portal-requirements.md` L7/L8, N5.1/N5.11, R3.3–R3.6; Hippo deps X1 (aggregation), X2 (server export)

## Context

Aperture is generic over any LinkML+GraphQL endpoint (ADR-0002/0017), so backends differ in what
they support. Hippo today offers full-text search, equality facets, offset pagination, and
relationship traversal — but **no facet counts, `totalCount`, server sort, or range filters**. The
risk is a UI that *appears* to offer these and silently lies (e.g. a facet "count" computed over
only the loaded page).

## Decision

The Layer-D source adapter **declares its capabilities** (FTS, equality facets, pagination, sort,
aggregation/counts, range filters, relationship traversal, batch write/validate, schema
introspection) and the UI **gates features on the declared set**. **The UI never fakes a capability
the backend lacks** — it degrades *visibly*:

- **Faceting** = capability-gated. Ship what the backend advertises; surface facet **counts /
  range filters / sort / `totalCount`** only when declared. No client-side count over a partial
  page. The Hippo aggregation enhancement (**X1**) is the path to counts in v1.x.
- **Export** = client-side page-through of the filtered set to **CSV + JSON** over configured
  columns (no Hippo dependency); server-side streamed bulk export (**X2**) deferred to v1.x.
- **Client-side aggregation** (e.g. a WASM engine) is allowed *only at small scale* as adapter
  compensation, itself behind the capability gate — never presented as a backend guarantee.

Errors are surfaced honestly: the server `ValidationResult` (field-attributed, tier-annotated) and
coded transport errors are shown, not swallowed.

## Consequences

- Establishes the capability-negotiation protocol as a load-bearing part of Layer D (ADR-0017);
  every feature surface must declare its capability requirement and a degraded fallback.
- Raises two tracked Hippo dependencies: **X1** (aggregation/counts/sort/range/`totalCount`) and
  **X2** (server-side bulk export), both deferred to v1.x.
- Keeps ADR-0002's "generic" honest: the same UI works against a thinner or richer endpoint, just
  with more features lit up.

## Alternatives considered

- **Assume Hippo's current surface everywhere.** Rejected — couples the UI to one backend's
  capabilities, breaking the generic invariant.
- **Fake counts/sort client-side over the loaded page.** Rejected — silently wrong at any scale
  beyond one page; erodes trust in a data portal where counts are decision-grade.
- **Block features until every backend supports them.** Rejected — denies value the current
  backend *can* deliver; capability-gating lights up features per-endpoint instead.
