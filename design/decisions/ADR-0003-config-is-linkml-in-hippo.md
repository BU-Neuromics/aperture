# ADR-0003: Aperture config is a LinkML schema, stored in Hippo

- **Status:** Accepted
- **Date:** 2026-06-13
- **Deciders:** design session (backfilled from handoff §2.2)
- **Related:** handoff §2.2, §3, ADR-0002, ADR-0005, ADR-0012 (layering, Proposed)

## Context

Aperture's entire layout and behavior is configured, not coded (ADR-0004). That config needs
validation, versioning, provenance, and programmatic access by both humans and agents. Hippo
already provides all of that for LinkML-modeled data.

## Decision

Aperture config is itself modeled in LinkML and persisted in Hippo. This buys validation,
versioning, provenance, and native access via Hippo's GraphQL + REST APIs for free. There is
**no bespoke Aperture persistence layer**.

Two stores under the same Hippo store and permission model (handoff §3), modeled as distinct
LinkML classes: **deployment/registry config** (block catalog, layout, bindings, component
registry — admin-write, versioned) and **user state** (saved views, filters, dashboards,
component instances — user-write, high-churn).

## Consequences

- Config edits are reversible, attributed (PROV-O), and validatable via Hippo's dry-run path
  — the foundation of the agent loop (handoff §6).
- Aperture must depend on the same Hippo schema/version surface it serves data from; the
  config schema evolves under Hippo's migration discipline.
- Layering of config (derived defaults → admin → user state) is still open — see ADR-0012.

## Alternatives considered

- **Bespoke config store (files / separate DB).** Reintroduces a second source of truth that
  must sync with Hippo and reimplements validation/versioning/provenance. Rejected.
