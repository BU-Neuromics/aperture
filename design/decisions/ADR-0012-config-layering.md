# ADR-0012: Config layering resolves to one canonical validated instance

- **Status:** Proposed
- **Date:** 2026-06-13
- **Deciders:** —
- **Related:** handoff §9.4 (open question Q4); depends on ADR-0003, ADR-0005, ADR-0007

## Context

Is Aperture config a single document per deployment, or layered (base defaults →
schema-derived → admin overrides → user-accessible subset)? Layering is more powerful but
each layer is a place bugs hide. ADR-0003 already commits to deployment-config vs user-state
as *distinct* LinkML classes, so single-document is effectively off the table.

## Decision (proposed)

**Layered authoring resolving to one canonical validated instance**, using the layers the
design already implies (not a new four-tier invention):

1. **Schema-derived defaults** — *derived, not stored* (regenerated from the LinkML schema
   per ADR-0005). A derived layer can't drift, so it isn't "a place bugs hide."
2. **Deployment/admin config** — stored, versioned, provenance-tagged (ADR-0003).
3. **User state** — high-churn, scoped to the viewer (ADR-0003).

Neutralize the "layers hide bugs" risk with two mechanisms already needed for the agent loop
(handoff §6):
- **(a) layer-attributed resolution** — `describe`/introspect returns the resolved value
  *and which layer produced it*;
- **(b) validate-the-resolved-output** — the dry-run validator runs against the *resolved*
  instance, catching bad layer combinations before apply.

**Drop the proposed 4th layer** ("user-accessible subset") *as a layer*: per ADR-0007 that's
pure ACL/visibility over layers 2–3, not config precedence.

## Consequences

- Requires the "describe my config" introspection capability (handoff §6) to be
  layer-attributed from day one.
- The dry-run validator must operate on resolved output, not per-layer fragments.

## Alternatives considered

- **Single config document.** Off the table given ADR-0003's distinct classes.
- **Four-tier layering with a user-subset precedence layer.** Conflates ACL with precedence;
  rejected per ADR-0007.
