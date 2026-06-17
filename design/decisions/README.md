# Aperture Design Decisions (ADRs)

Aperture records design decisions as **ADRs** following the **platform-wide convention** — the
canonical process, lifecycle/statuses, and template live in the parent repo at
[`platform/design/decisions/README.md`](../../../platform/design/decisions/README.md) (see also
the root [`../CLAUDE.md`](../../CLAUDE.md)). **Aperture's `design/decisions/` is the reference
implementation** of that convention: it was designed ADR-first, so essentially every
load-bearing decision is an ADR here. [`_template.md`](./_template.md) is the local copy of the
canonical template.

> If a decision isn't recorded here, it isn't decided. Prose in the vision handoff is
> *context*; an ADR is the *decision*.

The [`../INDEX.md`](../INDEX.md) **Decision Log** table is Aperture's index of record — one row
per ADR, status-tracked. Open questions are `Proposed` ADRs (the *decision queue*); ratifying
one is a status flip from `Proposed` → `Accepted`, not a new document.

## Relationship to the other design docs

| Doc | Role |
|---|---|
| `decisions/` (this dir) | **Canonical decisions.** The source of truth for *what was decided and why*. |
| `INDEX.md` Decision Log | **The index.** One scannable row per ADR; the entry point. |
| `portal-vision-handoff.md` | **Historical vision / context.** The original brainstorm. Its §2 "settled decisions" are backfilled here as `Accepted` ADRs; its §9 open questions are `Proposed` ADRs. Read it for narrative context, cite ADRs for decisions. |
| `portal-open-questions.md` | **Working notes.** Proposed resolutions to §9, carried into the corresponding `Proposed` ADRs as their recommended Decision + rationale. |
| `instruction-path-model.md` | **Working design.** The data-story substrate model; its open decisions D-1–D-5 are recorded as ADR-0022–0025 (+ a Hippo requirement). |
