# ADR-0005: Config is equally accessible to humans and LLMs

- **Status:** Accepted
- **Date:** 2026-06-13
- **Deciders:** design session (backfilled from handoff §2.4)
- **Related:** handoff §2.4, §6, §10 (invariant), ADR-0003, ADR-0013 (agent loop, Proposed)

## Context

A guiding intent (handoff §1) is that a non-technical user can point a coding agent at their
Aperture instance and have it add or modify functionality by editing config. For that to be
reliable, the same canonical config must be equally legible and editable by humans and by
LLMs — with no hidden defaults the agent can't see.

## Decision

One canonical, fully-qualified, validated LinkML instance is the source of truth (stored in
Hippo, per ADR-0003). Humans edit it through an ERD editor / narrow admin UI; agents edit the
canonical form directly. Both converge on the same validated document.

**Invariants:**
- Every default is declared **in the LinkML schema**, never buried in render logic, so
  default-resolution is inspectable by humans and agents alike.
- Schema `description` / `comments` / `examples` on every slot are **mandatory** — the schema
  *is* the agent's primary context/spec.

## Consequences

- Forces schema-derived defaults to be a real, regenerable layer (feeds ADR-0012).
- Requires a "describe my config + catalog + registry" introspection capability alongside
  GraphQL's data-schema introspection (handoff §6).
- Raises the documentation bar on the config schema itself; under-documented slots are a bug.

## Alternatives considered

- **Render-time defaults / convention over declaration.** Faster to author, but invisible to
  agents and a source of "agent guesses, you find out in prod." Rejected.
