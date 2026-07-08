# ADR-0028: Workflow atomicity — stage → whole-set dry-run validate → atomic commit

- **Status:** Accepted
- **Date:** 2026-06-30
- **Deciders:** labadorf, design session
- **Related:** ADR-0027 (write portal), ADR-0017 (control plane), ADR-0009 (view descriptions); `portal-requirements.md` L9/L10, W4.6–W4.9; **Hippo [#84](https://github.com/BU-Neuromics/hippo/issues/84)** + Hippo `design/sec5_ingestion.md` §5.4 (batch unit-of-work)

## Context

A guided multi-step workflow (ADR-0027 Tier 1) creates several **linked** entities in sequence.
Hippo commits **one entity per transaction**, so a workflow that fails partway would leave
orphaned, partially-built records. The question: how does Aperture guarantee a workflow is
all-or-nothing without a client-side distributed transaction? A prior-art pass (saga/compensation,
BPMN, durable engines) and a review of Hippo's storage layer (which already has a
`staged_transaction()` primitive) settled it.

## Decision

A workflow **stages** its entities in a draft buffer; **nothing enters the domain graph** until the
**whole related set** is validated and then committed **all-or-nothing**:

1. **Stage** — accumulate entities/relationships in an inert control-plane draft (ADR-0017).
2. **Validate whole set** — continuous per-step dry-run for fast feedback, plus a whole-set
   dry-run over the staged graph before commit.
3. **Commit atomically** — one Hippo **batch unit-of-work** (`batch_put`) commits the set in a
   single `staged_transaction`; any failure rolls the whole set back.

This relies on a Hippo capability — whole-set dry-run validation + atomic multi-entity write with
intra-batch reference resolution — **delivered in Hippo [#84](https://github.com/BU-Neuromics/hippo/issues/84)**
(SDK `validate_batch`/`batch_put` + REST/GraphQL; atomic on SQLite + Postgres). **Saga/compensation
is retained only as the fallback** for steps with genuinely irreversible external side-effects that
cannot be staged.

**Resumable drafts (L10):** in-progress forms/workflows persist as an **inert** control-plane draft
(not committed entities); resume = reload the draft. The draft **pins the workflow + schema version**
it began under, so a later schema change is detectable rather than silently breaking.

## Consequences

- No partial workflow output is ever visible (nothing commits until valid+complete) → no saga
  orchestration, no semantic-lock juggling, no idempotency reconciliation in the common case.
- Establishes a hard **cross-component dependency on Hippo** (the batch unit-of-work), satisfied by
  #84; cross-referenced from Hippo `sec5` §5.4 per the two-sided-dependency rule.
- Drafts are first-class control-plane objects (ADR-0017); schema-version pinning is required.
- The fallback saga path is an explicit, narrow exception (irreversible side-effects), not the norm.

## Alternatives considered

- **Saga with per-step commit + compensation (undo via supersede/availability-flip).** The first
  design; correct but pushes orchestration, semantic locks, and idempotency reconciliation onto the
  client. Superseded by staging once Hippo could offer atomic batch commit. Kept as the
  side-effect-only fallback.
- **Distributed/multi-entity transaction as a generic Hippo feature.** Heavier; sagas/staging exist
  precisely to avoid it. The staged-transaction primitive already in Hippo storage made the batch
  unit-of-work the lighter path.
- **Hold a DB transaction open across the user's session.** Infeasible — a transaction can't span a
  multi-day resume; hence the *inert draft* + short-lived commit transaction split.
