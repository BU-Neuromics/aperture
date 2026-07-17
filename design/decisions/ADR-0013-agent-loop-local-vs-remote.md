# ADR-0013: One API-based agent loop; component source is the only file-based artifact

- **Status:** Proposed  — ⛔ **Deferred from MVP** (ADR-0026)
- **Date:** 2026-06-13
- **Deciders:** —
- **Related:** handoff §9.3 (open question Q3); depends on ADR-0003, ADR-0005; informed by ADR-0006

## Context

Should "agent points at a local instance" and "agent points at an authenticated remote
endpoint" be the *same* loop (always talk to a running Aperture API) or genuinely different
(local = edit files in a repo; remote = call config-mutation endpoints)? Picking one now
avoids building both.

## Decision (proposed)

**One loop — the agent always talks to a running Aperture/Hippo API.**

- Local = Hippo on localhost, possibly no-op auth; remote = the same API, authenticated. The
  capability-scoped client (ADR-0008) resolves "current viewer" identically in both.
- "Edit files in a repo" would reintroduce a second source of truth that must sync with the
  canonical Hippo instance — exactly the drift ADR-0003/ADR-0005 forbid.
- Matches the kept `backends/` protocol (`MosaicSdkBackend` local / `MosaicRestBackend` remote
  behind one interface) — and should extend to a GraphQL backend.

**One honest carve-out:** Type-B **component source code** is code and wants VCS + review.
Precise rule: *config (Levels 1 & 2) travels by API into Hippo; component source (Level 3)
travels by VCS, passes the three-layer headless validation (ADR-0009), then registers into
Hippo.* This is not two agent loops — it is "config by API, code by VCS+validate+register,"
which the ADR-0006 hot-reload flow already implies.

## Consequences

- Aperture exposes config-mutation + dry-run validate over its API for both local and remote.
- Component authoring tooling targets VCS + the headless validators, then a register step.

## Alternatives considered

- **Two distinct loops (files locally, API remotely).** Doubles the surface and reintroduces
  a config source-of-truth that drifts from Hippo. Rejected.
