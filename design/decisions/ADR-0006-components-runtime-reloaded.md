# ADR-0006: Components are runtime-reloaded behind headless validation

- **Status:** Accepted
- **Date:** 2026-06-13
- **Deciders:** design session (backfilled from handoff §2.5, §5)
- **Related:** handoff §2.5, §4 (Langflow), §5, ADR-0009, ADR-0011 (runtime, Proposed)

## Context

The agent-driven dev loop requires adding or changing components without a rebuild/redeploy.
But a portal (possibly authenticated, shared) cannot let a broken or unvalidated component
endanger the running app. Langflow's per-component load isolation is the reference for
graceful degradation; its trusted-server-code model is not (see ADR-0008).

## Decision

Plugins/components are runtime-reloaded — no rebuild/redeploy to add or change one. A reloaded
component must pass **headless validation** (the three-layer contract, ADR-0009 / handoff §5)
before going live; on failure the previous version stays live. Per-component load isolation: a
component that fails logs an error and is skipped; the rest of the app keeps working.

**Hot-reload flow:** agent writes/edits component → three headless checks run → on green, the
registry entry updates in Hippo → live instances re-fetch and re-render their slot. No
rebuild, no redeploy, no browser.

## Consequences

- The validation pipeline must be fully headless (no browser) — a hard constraint on the
  component contract (ADR-0009) and on the runtime choice (ADR-0011).
- Component source is registered into Hippo's config store as a versioned, reversible entry
  (ADR-0003); a bad reload fails at check time, never at render time in front of a user.

## Alternatives considered

- **Rebuild/redeploy to change components.** Kills the agent loop's tight iteration.
  Rejected.
- **Load-time isolation only (Langflow-style).** Necessary but insufficient for Aperture's
  threat model; runtime sandboxing is also required (ADR-0008). Rejected as the whole answer.
