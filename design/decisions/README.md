# Aperture Design Decisions (ADRs)

This directory is the **canonical, durable record of Aperture's design decisions**. It
exists to defend a long series of design sessions against context rot: every load-bearing
choice lives in exactly one numbered file, with a one-line summary mirrored in the
[`design/INDEX.md`](../INDEX.md) Decision Log so the whole set is scannable at a glance.

> If a decision isn't recorded here, it isn't decided. Prose in the vision handoff is
> *context*; an ADR is the *decision*.

## The system, in one paragraph

Each decision is an **ADR** (Architecture Decision Record): a numbered Markdown file
(`ADR-NNNN-slug.md`) with a status, the context that forced the choice, the decision
itself, its consequences, and the alternatives rejected. The
[`design/INDEX.md`](../INDEX.md) **Decision Log** table is the index of record — one row
per ADR, status-tracked. Open questions are ADRs in `Proposed` status (the *decision
queue*); ratifying one is a status flip from `Proposed` → `Accepted`, not a new document.

## Lifecycle and statuses

```
        ┌─────────┐  ratify   ┌──────────┐  revisit   ┌─────────────┐
new ───►│ Proposed│ ────────► │ Accepted │ ─────────► │ Superseded  │
        └─────────┘           └──────────┘            │ by ADR-NNNN │
             │                                         └─────────────┘
             └────────► Rejected (kept, not deleted)
```

| Status | Meaning |
|---|---|
| `Proposed` | An open question with a recommended resolution. In the decision queue; not yet binding. |
| `Accepted` | Ratified. Binding on Aperture source and design. Change only by superseding. |
| `Rejected` | Considered and declined. Kept for the record (never deleted) so we don't relitigate. |
| `Superseded by ADR-NNNN` | Was `Accepted`, now replaced. Points forward to its replacement. |

**Decisions are never deleted.** A reversed decision is `Superseded`, with a forward
pointer. This is the same discipline Hippo's Key Decisions Log uses (superseded entries
gain a `Superseded by` pointer rather than disappearing).

## How a decision gets made

1. **Raise it as a `Proposed` ADR.** Copy [`_template.md`](./_template.md), take the next
   number, fill in Context + the question, and record the recommended resolution under
   Decision. Add the row to the INDEX Decision Log with status `Proposed`.
2. **Pressure-test it in a design session.** Capture alternatives weighed and any probe
   results (e.g. "can the survival curve be expressed as catalog primitives?") in the ADR.
3. **Ratify.** When agreed, flip the status to `Accepted`, set the date, and update the
   INDEX row. If it replaces an earlier decision, mark the old one `Superseded by` this one.

## Relationship to the other design docs

| Doc | Role |
|---|---|
| `decisions/` (this dir) | **Canonical decisions.** The source of truth for *what was decided and why*. |
| `INDEX.md` Decision Log | **The index.** One scannable row per ADR; the entry point. |
| `portal-vision-handoff.md` | **Historical vision / context.** The original brainstorm. Its §2 "settled decisions" are backfilled here as `Accepted` ADRs; its §9 open questions are `Proposed` ADRs. Read it for narrative context, cite ADRs for decisions. |
| `portal-open-questions.md` | **Working notes.** Proposed resolutions to §9, now carried into the corresponding `Proposed` ADRs as their recommended Decision + rationale. |

## Conventions

- **Numbering:** zero-padded, monotonic, never reused. Gaps are fine; numbers are stable IDs.
- **Slugs:** short, decision-shaped (`ADR-0011-component-execution-runtime.md`).
- **One decision per ADR.** If you're writing "and also," it's two ADRs.
- **Invariants link back.** When an ADR establishes an invariant, reference the handoff §10
  Invariants Checklist so review keeps catching violations.
- **Supersede, don't edit history.** Correcting a typo is fine; reversing a decision means a
  new ADR that supersedes the old one.
