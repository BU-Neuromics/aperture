# ADR-0036: Global search is a heterogeneous fan-out surface

- **Status:** Proposed
- **Date:** 2026-08-19
- **Deciders:** labadorf (pending), design session
- **Related:** ADR-0002 (derive-everything), ADR-0029 (capability-honest degradation),
  ADR-0035 (QuerySpec — search results seed its table and the ADR-0037 graph view);
  `design/cross-class-query.md` §6(c)/§7 M4; **Mosaic OpenSpec `heterogeneous-roots`**
  (mosaic#158 — the server `searchAll` this degrades from).

## Context

The portal's landing surface is a nav list — honest but not useful (the "default isn't
useful" finding, `cross-class-query.md` §1/§6). The natural entry point is one search box
whose hits span classes. Mosaic's `searchAll(q, limit)` root (OpenSpec
`heterogeneous-roots`, mosaic#158) will serve this in one request; older endpoints offer
only per-class search twins and `findByXref`.

## Decision

**Aperture's global search is a heterogeneous fan-out surface**: one search box; hits
grouped by class; each group links into its collection with the search applied; the full
hit set can seed the ADR-0037 graph view. Served by Mosaic `searchAll` when introspection
advertises it; otherwise degraded to a **client fan-out** over the per-class search twins
(+ `findByXref` for identifier-shaped queries), visibly capped per class (ADR-0029).

## Consequences

Sequenced with the Mosaic `heterogeneous-roots` change (mosaic#158); the fan-out tier can
ship first. Not started — this ADR reserves the design so the QuerySpec/graph increments
(ADR-0035/0037, in progress) cite a stable number.

## Alternatives considered

- A search page per collection only (status quo): keeps the useless default.
- Waiting for server `searchAll` before any global surface: the fan-out tier is cheap and
  honest; rejected per the capability-degradation posture.
