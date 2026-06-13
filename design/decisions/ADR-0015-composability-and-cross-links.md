# ADR-0015: Composability and cross-links (hrefs)

- **Status:** Proposed
- **Date:** 2026-06-13
- **Deciders:** —
- **Related:** raised 2026-06-13 ("composition composability and cross links / hrefs"); depends on ADR-0009, ADR-0010; informed by ADR-0014; Hippo sec4 §4.7, issue #48 (xref)

## Context

The portal is built from composed blocks/views (Level 1 composition, ADR-0004) bound to Hippo
entities (Level 2 binding). Two related questions need a recorded decision:

1. **Composability** — how do view primitives/blocks compose? The ADR-0010 escape hatch is
   "compose primitives, not raw render," so composition is a first-class mechanism, not an
   afterthought. What is the composition model (nesting, slots-within-slots, layout
   containers) and how does it stay within the noun-catalog discipline?
2. **Cross-links / hrefs** — how does a value rendered in one view link to another view
   (entity → detail page, relationship → related entity, external identifier → external
   system)? Links must be *derivable from the schema + config*, not hand-coded, to preserve
   the generic-not-domain-specific invariant (ADR-0002).

Hippo gives Aperture strong material to build on:
- **Internal cross-links** come from GraphQL **resolved relationship fields** — a reference
  slot exposes both the raw UUID (`donorId: ID`) and a resolved entity (`donor: Donor`) — so
  an entity-to-entity href is "route to the bound entity type's detail view for this id"
  (Hippo sec4 §4.7).
- **External cross-links / hrefs** come from Hippo's `ExternalReference` value type +
  `hippo_external_xref` (issue #48), with reverse lookup (`findByXref`, `GET
  /xref/{system}/{value}`) — the basis for "this value links out to STARLIMS/HALO/etc."

## Decision (proposed)

*To be decided in a design session.* Candidate framing:

- A cross-link is itself a **typed primitive / typed param** in the view vocabulary (ADR-0010)
  — a `link` is a noun that resolves a target *route*, never an embedded transform/expression.
- Internal links are **schema-derived** from relationship slots; the binding layer maps a
  reference slot to "the configured detail view for the target entity type." No domain nouns
  in source (ADR-0002).
- External links are derived from `hippo_external_xref` slots and a small per-deployment
  config table mapping `system` → URL template.
- Composition is **declarative nesting of primitives** within layout containers, validated
  headlessly against the manifest contract (ADR-0009); depth/shape is bounded by the
  vocabulary, not by arbitrary code.

## Notes / open sub-questions

- How is a "route" represented so it works under whichever app architecture ADR-0014 picks
  (server route vs. client-side router path)? Keep the view-spec's link target architecture-
  neutral (logical target: entity type + id, or named view + params) and let the runtime
  realize it as an href.
- Multivalued relationship slots don't persist in Hippo's v0.1 SQLite adapter (sec4 §4.7) —
  resolved list-of-links fields return `[]` until linktable support lands. Design the link
  primitive to degrade gracefully.
- Does composition need a "reference/transclude another named view" primitive, and if so does
  that stay a noun (a `view-ref` primitive) rather than becoming a macro/expression layer
  (ADR-0004 line)?
