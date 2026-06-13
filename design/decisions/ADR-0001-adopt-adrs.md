# ADR-0001: Record Aperture design decisions as ADRs

- **Status:** Accepted
- **Date:** 2026-06-13
- **Deciders:** labadorf, design session
- **Related:** handoff §2 ("record any change as an ADR"), `decisions/README.md`

## Context

Aperture is entering a long series of design sessions covering load-bearing, still-open
choices (application architecture, component runtime/technology, the view-description
vocabulary, config layering, the agent loop, composability and cross-links). Until now,
decisions lived as prose spread across `portal-vision-handoff.md` (settled decisions in §2,
open questions in §9) and `portal-open-questions.md` (unratified proposed resolutions). The
handoff itself instructs "record any change as an ADR" (§2) but no ADR mechanism existed.

Across many sessions, prose-only decision records rot: it becomes unclear what was actually
decided versus merely discussed, settled choices get relitigated, and reversals lose their
rationale. Hippo already solved this with a status-tracked Key Decisions Log plus numbered
section files; Aperture should adopt the same proven discipline.

## Decision

Aperture records every design decision as a numbered **ADR** in `design/decisions/`, indexed
by a **Decision Log** table in `design/INDEX.md`. The mechanism, lifecycle, and statuses are
defined in [`decisions/README.md`](./README.md). Open questions are `Proposed` ADRs (the
decision queue); ratification is a status flip, not a new document. Decisions are never
deleted — reversals supersede with a forward pointer.

## Consequences

- One canonical, scannable record of decisions that survives context compaction between
  sessions; a new session (or a fresh agent) can reconstruct the design state from the
  Decision Log alone.
- `portal-vision-handoff.md` is demoted from "authoritative" to **historical vision /
  context**; its §2 decisions are backfilled as `Accepted` ADRs (0002–0009) and its §9 open
  questions become `Proposed` ADRs (0010–0013). New decisions cite ADRs, not the handoff.
- Every design session has a defined ritual: raise/refine `Proposed` ADRs, ratify by status
  flip, update the INDEX row. Low ceremony, high durability.

## Alternatives considered

- **Single append-only decision-log table only (no per-decision files).** Lighter weight and
  matches Hippo's INDEX table, but a one-line row can't hold the context, alternatives, and
  consequences a contested architectural choice needs. Rejected in favour of the hybrid: the
  table indexes, the files reason.
- **Full MADR ceremony per file.** More structure than this early-stage, fast-moving design
  warrants. Rejected as premature overhead; the lite template here can grow if needed.
- **Keep editing the handoff prose.** Status quo. Rejected — it is precisely the context-rot
  failure mode this ADR exists to prevent.
