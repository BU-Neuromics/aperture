# Aperture — Config-Driven Data Portal
## Design Index

**Codename:** Aperture
**Component:** Interface Layer (config-driven data portal over Hippo)
**Version:** 0.1 — Portal fresh start

---

This repository is a **fresh start** extracted from the `drylims` monorepo (2026-06).
It carries forward the reusable Hippo backend protocol (`src/aperture/backends/`) and the
config-driven **portal** design. The earlier CLI-first v0.1 specification (`sec1`–`sec6`)
and its implementation were intentionally left behind in `drylims` history and are **not**
reproduced here — the portal vision supersedes them.

## Document Map

| File | Section | Status | Notes |
|---|---|---|---|
| `portal-vision-handoff.md` | Portal vision | 🟢 Handoff | Config-driven portal: problem statement, settled architectural decisions, and §9 open questions. Authoritative. |
| `portal-open-questions.md` | Portal §9 resolutions | 🟡 Proposed | Recommended resolutions to the handoff's open questions; not yet ratified. |

## Settled Decisions (from the handoff)

See `portal-vision-handoff.md` §2 for the authoritative list. In brief:

| Decision | Choice |
|---|---|
| Generic vs. domain-specific | Generic against any Hippo deployment + LinkML schema; no domain nouns in source |
| Config persistence | Config is itself a LinkML schema, stored in Hippo |
| Configurability levels | Composition + Binding are declarative; Behavior is typed sandboxed plugins only (no middle scripting layer) |
| Component authority | Components hold no authority; data reach resolved against the current viewer via an injected capability-scoped client |
| Component output | Components emit a serializable view description, never direct DOM manipulation |
| Validation | All three contract layers (manifest, data-contract, render-contract) checkable headlessly — no browser |

## Open Questions

Tracked in `portal-open-questions.md` (proposed resolutions to handoff §9):
component execution runtime, view-description vocabulary richness, local-vs-remote agent
loop, and config layering.

## Sequencing

De-risk in order (handoff §8): schema-derived browse + faceted search with config-in-Hippo
→ dry-run validate endpoint + Type-A agent loop → typed component contract + one hand-built
Type-B component → view construction/export → visualization catalog → sharing.

## How to Use This Spec

Sections feed the openplan pipeline:
```
Spec sections → openplan vision.yaml → roadmap → epics → features → OpenSpec
```
