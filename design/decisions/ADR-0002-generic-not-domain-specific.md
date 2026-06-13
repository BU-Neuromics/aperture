# ADR-0002: Aperture is generic against any Hippo deployment, not brain-bank-specific

- **Status:** Accepted
- **Date:** 2026-06-13
- **Deciders:** design session (backfilled from handoff §2.1)
- **Related:** handoff §2.1, §10 (invariant), ADR-0003

## Context

Aperture's first deployment is the VA brain bank portal, but Hippo is a generic LinkML
runtime. Building Aperture around brain-bank nouns would couple the portal to one schema and
forfeit reuse across every other Hippo deployment.

## Decision

Aperture is generic against *any* Hippo deployment + LinkML schema + GraphQL endpoint. The
brain bank portal is simply the first and most-tested *instance* of the generic app.

**Invariant:** No brain-bank domain nouns (`Donor`, `Specimen`, `BrainRegion`, etc.) appear
anywhere in Aperture source. Those live only in schema + config. Domain nouns leaking into
source is the signal that the generic abstraction has drifted.

## Consequences

- Everything domain-specific is pushed into the LinkML schema and config (see ADR-0003).
- Aperture binds to Hippo's schema introspection (`hippoSchema`/`hippoEntityType`, GraphQL
  introspection) at runtime rather than to hardcoded types.
- This invariant is a standing review check (handoff §10): grep Aperture source for domain
  nouns on every change.

## Alternatives considered

- **Build the brain-bank portal directly, generalize later.** Faster to first demo, but
  "generalize later" rarely survives shipped domain coupling. Rejected — generality is a
  founding constraint, not a refactor.
