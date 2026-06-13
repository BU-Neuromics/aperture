# ADR-0008: Components hold no authority; data reach is an injected capability-scoped client

- **Status:** Accepted
- **Date:** 2026-06-13
- **Deciders:** design session (backfilled from handoff §2.7)
- **Related:** handoff §2.7, §10 (invariant), ADR-0007, ADR-0009, ADR-0011 (runtime, Proposed)

## Context

If a component could capture its author's credentials or visibility, then promoting it to
portal-wide (ADR-0007) or running it on behalf of another viewer would leak the author's data
reach to every viewer — a privilege-escalation vector.

## Decision

A component never holds authority. Its data reach is conferred by the **context it runs in**,
resolved against the **current viewer** at call time, via an **injected, capability-scoped
client**. A component never captures or carries its author's credentials or visibility.

## Consequences

- Promotion (ADR-0007) is safe by construction: the same component, run by any viewer, sees
  only what that viewer is permitted to see.
- The runtime boundary must be the thing that injects the client — strengthening the case for
  an isolation boundary whose message channel *is* the capability-scoped client (ADR-0011's
  Web Worker `postMessage` boundary).
- Aperture maps "current viewer" onto Hippo's auth surface (Bridge-injected actor headers,
  sec8) and the capability scope onto what that actor can read.

## Alternatives considered

- **Components run with their author's or a service credential.** Simple, but makes promotion
  and shared execution privilege-escalation vectors. Rejected outright.
