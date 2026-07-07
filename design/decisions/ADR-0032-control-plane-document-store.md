# ADR-0032: Control-plane state = versioned documents on a structurally-recognized Hippo collection, with an honest local fallback

- **Status:** Accepted
- **Date:** 2026-07-06
- **Deciders:** labadorf (via Phase-4 review/merge, PR #14), dev sprint
- **Related:** ADR-0017 (data plane vs control plane — refines its reference impl), ADR-0003/0004 (config-as-data), ADR-0029 (honest degradation), N5.4; aperture#17 (recipe), aperture#19 (removal affordance)

## Context

Phase 4 needs a concrete shape for the control-plane store ADR-0017 mandates: where saved
views, workflow drafts (L10), and config-as-data actually live, how Aperture finds the store,
and what happens when a deployment's Hippo doesn't (yet) carry it. The temptations to avoid:
a bespoke sidecar service (violates the LinkML-on-Hippo reference stance), silent
browser-local persistence (users can't tell what survives their machine), and a hard-coded
type name the adapter trusts blindly (violates the derive-don't-assume discipline every other
surface follows).

## Decision

Aperture persists its own state as **`{kind, name, payload}` documents** on a Hippo
collection it recognizes **structurally** — an entity type with text-ish `kind`/`name`/
`payload` fields, kind+name equality filters, and create+update mutations — reached through
the same Layer-D source machinery as domain data. Specifics:

- **Versioned payload envelopes.** Every payload is `{v, data}` JSON; readers validate
  structurally on open and **skip** documents they can't validate. Saved views and drafts pin
  the schema fingerprint (interim) / `schema_version` (once enrichment lands) for drift
  detection on open/resume.
- **Upsert by `(kind, name)`; no hard delete.** Removal retires a document by clearing its
  payload (W4.4 discipline applied to Aperture's own state); retired documents read as absent
  everywhere.
- **Co-located by default, splittable by config.** The control plane defaults to the data
  plane's endpoint (N5.4); `VITE_HIPPO_CONTROL_PLANE_URL` connects a separate one.
- **Honest local fallback.** No document type advertised → persistence falls back to
  browser localStorage, and the shell's footer states which backend is live. The fallback is
  labeled, never silent (ADR-0029).
- **Reads bypass the client document cache** (`fresh`/network-only): read-after-write over
  possibly-empty lists is the store's core access pattern, and an empty cached list has no
  typename association for mutations to invalidate.

The document type itself ships as an Aperture-owned Hippo recipe (aperture#17).

## Consequences

- The control plane inherits Hippo's transactions, provenance, and transport for free, and
  the store works against any endpoint that carries the document type — including a split
  control-plane Hippo — with zero Aperture changes (the ADR-0017 promise, kept).
- Drafts and saved views are server-side: they survive browsers and machines. Deployments
  without the recipe still function, visibly degraded to browser-local persistence.
- Structural recognition means the recipe can evolve names/prefixes as long as the shape
  holds; it also means a domain type that coincidentally matches the shape would be adopted
  as the store — acceptable at MVP, revisit if it ever bites (an explicit marker slot is the
  escape hatch).
- Envelope versioning gives upgrade-testing leverage (old documents against new app) and a
  forward-compatible migration point.

## Alternatives considered

- **Dedicated control-plane service / non-Hippo store.** More moving parts, loses
  provenance/validation reuse, contradicts the LinkML-on-Hippo reference impl in ADR-0017.
- **localStorage only for MVP.** No cross-browser drafts (undercuts L10's resume story), and
  persistence scope would be invisible to users.
- **Hard-coded `ApertureDocument` type name.** Simpler lookup, but breaks the
  derive-from-introspection discipline and couples the SPA to a recipe naming choice.
- **Hard delete for removals.** Contradicts W4.4; retirement keeps the audit trail and needs
  no delete mutation from Hippo.
