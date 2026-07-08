# ADR-0019: Per-user LLM provider key management

- **Status:** Accepted (approach ratified; LinkML shape is an open sub-question)  — ⛔ **Deferred from MVP** (ADR-0026)
- **Date:** 2026-06-16
- **Deciders:** labadorf, design session
- **Related:** ADR-0003 (config-as-LinkML-in-Hippo), ADR-0005, ADR-0017 (control plane), ADR-0018, ADR-0020, ADR-0021

## Context

Aperture's agent surface calls an LLM endpoint (Claude / ChatGPT / a local model),
admin-configured with the right system prompts and skills. Deployments must be able to assign
**individual users** specific provider keys/config: the simplest case is one shared key all
users use, but **fine-grained per-user key management is a requirement**. Keys are secrets.
Rate limits and token budgets are assumed enforced by the LLM endpoint itself. The in-app
agent is the primary consumer (deferred, ADR-0021), but the key model must exist now for the
near-term coding-agent path and its tracking (ADR-0020).

## Decision

Model LLM provider configuration as **control-plane config (LinkML-on-Hippo; ADR-0003,
ADR-0017)**: a provider/endpoint definition plus a **user/role → key mapping**. Defaults and
rules:

- **Default:** a single shared key all users map to. **Fine-grained:** per-user or per-role
  key assignment. Optional **bring-your-own-key**.
- **Secrets discipline:** config stores **key *references*** (pointers to env / a secret
  manager), **never raw secrets** — mirroring Bridge's `${...}` convention. Raw keys never
  enter the provenance-tracked config store.
- **Assignment is admin config** (admin authority per ADR-0018).
- The provider key is **distinct from the DataHelix user session** (ADR-0018) and never conflated:
  the key is the agent's *brain*, the session its *hands*. The key confers no DataHelix authority.

## Consequences

- A deployment starts with one key and grows to per-user/per-role with no schema change.
- Each agent interaction involves two attributable credentials (provider key-ref + user
  session), both surfaced in provenance (ADR-0020).
- Aperture must resolve "which key for this user" at agent-invocation time.
- Provider-side rate/budget enforcement is assumed; Aperture adds **usage observability**
  (ADR-0020), not budget enforcement, unless a sub-question below reverses that.

## Notes / open sub-questions

- Exact LinkML shape of the provider config + user/role→key mapping.
- How key references resolve (env var vs Vault/secret-manager vs a Bridge-provided secret
  store) — and whether that resolution is Aperture's or Bridge's once Bridge lands.
- Is BYO-key in v1, or admin-assigned only?
- If some endpoints don't enforce budgets, does Aperture need per-key/per-user caps?
