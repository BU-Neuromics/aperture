# ADR-0021: Defer the in-app conversational agent UI; the coding agent (MCP/API) is the near-term surface

- **Status:** Accepted  — ⛔ **Deferred from MVP** (ADR-0026)
- **Date:** 2026-06-16
- **Deciders:** labadorf, design session
- **Related:** ADR-0013 (one API-based agent loop), ADR-0018, ADR-0019, ADR-0020; handoff §1 (guiding intent), §7

## Context

The guiding intent (handoff §1) is a literate natural-language interface that lets
non-technical and technical users alike control the app — ultimately an **in-app LLM chat**,
admin-configured to a provider with the right system prompts and skills, editing config from
inside Aperture. That integrated chatbot is **complex** (chat UX, streaming, the hosted agent
loop, prompt/skill engineering) and is **not required** to validate the core
config-driven-portal bets (the keystone ADR-0010 noun-catalog, the Type-A loop, the component
contract).

## Decision

**Defer the in-app conversational chat UI to a later version.** The near-term agent surface is
the **external coding agent** talking to Aperture via a config-mutation API — an **MCP server**
for external agents now, an internal API for in-app later. Both surfaces converge on **one**
config-mutation + capability-scoped-data path (consistent with ADR-0013's single agent loop).
Crucially, the **supporting infrastructure is specced now and built for the coding-agent
path**: per-user LLM key management (ADR-0019), agent-action/conversation provenance +
observability (ADR-0020), and user-delegated authority (ADR-0018). The in-app chat is then an
**added surface over existing foundations**, not a new foundation.

## Consequences

- v1 demonstrates agent-driven config edits via an **external Claude-Code-style client over
  MCP**, not an in-app chatbox — a smaller, faster surface to prove the config-mutation
  contract.
- The key / provenance / authority infrastructure is exercised early on the simpler surface;
  the in-app chat reuses it unchanged (same logic as ADR-0016's "seam now, swap later").
- Avoids premature investment in chat UX before the config-mutation contract and the primitive
  catalog (ADR-0010) are proven.

## Alternatives considered

- **Build the in-app chat now.** Large UX surface and a hosted agent loop before the core bets
  are validated. Rejected as premature.
- **Skip the key/provenance/authority infra until in-app chat.** Would force retrofitting keys,
  provenance, and authority later — the same retrofit ADR-0016 rejects for the Bridge seam.
  Rejected: build the infra now on the coding-agent path.
