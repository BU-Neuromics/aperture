# ADR-0018: Agents act with the invoking user's delegated authority

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** labadorf, design session
- **Related:** ADR-0008 (components hold no authority), ADR-0016 (defer Bridge), ADR-0019, ADR-0020, ADR-0021; handoff §7 (Type-A/B request types); platform `sec6_security_model.md`

## Context

Aperture exposes **agent-driven** app control: an LLM agent edits config (Type A) and
scaffolds components (Type B) on a user's behalf (handoff §7), via an external coding agent
now (MCP/API) and an in-app chat later (ADR-0021). ADR-0008 settles what a *component* may
reach; it does **not** settle what authority the **config-editing/data-reading agent** holds —
a distinct principal question. If the agent had its own or elevated authority, it would be
both a privilege-escalation vector and an audit-laundering one ("the agent did it").

## Decision

An agent acting on a user's behalf carries **exactly that user's authority — no more, no
less.** Every read and write the agent issues rides the **user's** capability-scoped session
(ADR-0008), through the same path a direct UI action takes. The agent is **never a distinct
principal** and **never a Bridge `service` account**. An admin's agent can perform admin
config; a researcher's agent is bounded to researcher operations. Enforcement remains
**Bridge's** (the agent inherits whatever Bridge grants the user); Aperture adds **no
agent-specific authority logic.** Locally, with Bridge deferred (ADR-0016), the user has full
access, so the agent does too.

## Consequences

- "Agent = user authority" needs **no app-level enforcement**: a researcher's agent attempting
  an admin-only write simply receives Bridge's `403`. The property falls out of routing every
  agent action through the user's session.
- Provenance actor is the **user**; agent mediation is captured alongside (ADR-0020), so audit
  distinguishes "Alice" from "Alice via agent" without the agent becoming the actor.
- Clean separation from Bridge `service` accounts (unattended pipeline runners): an agent
  acting *for a user* must carry the *user's* identity for both scope and provenance.
- Aperture needs no agent RBAC table — there is exactly one authority model (the user's).

## Alternatives considered

- **Agent as its own (elevated) principal.** Reintroduces privilege escalation and launders
  accountability. Rejected outright.
- **Agent as a Bridge `service` account.** Wrong identity class — services are unattended
  machine identities with their own role; an agent acting on a user's behalf must resolve to
  the *user* for scope and provenance. Rejected.
