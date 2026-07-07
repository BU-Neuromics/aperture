# ADR-0033: Workflow config is steps-as-data interpreted by a pure reducer engine; the draft is the serialized run state

- **Status:** Accepted
- **Date:** 2026-07-06
- **Deciders:** labadorf (via Phase-3 review/merge, PR #13), dev sprint
- **Related:** ADR-0028 (stage→validate→atomic commit — implements W4.6/W4.8), ADR-0003/0004
  (config-as-data, no middle scripting), ADR-0029 (availability gating), ADR-0032 (drafts as
  control-plane documents); `library-survey.md` (XState as reference runtime)

## Context

W4.6 requires the Tier-1 guided workflow to be **serialized config interpreted by an engine**
(CNCF Serverless Workflow named as the config model to steal from; XState named as the
*reference* runtime — explicitly "engine, not the config format"). Phase 3 had to pick the
concrete config shape, the engine, and the draft representation, under two constraints: no
user-facing scripting layer (ADR-0004), and resume must be "reload a document" with no
reconciliation (L10).

## Decision

- **Config:** a `WorkflowConfig` of ordered steps, each staging **one entity of a schema
  type** whose form derives from that type's create input (the Tier-0 generator — no
  workflow-specific form definitions). Cross-step `bindings` name a field on a later step and
  an earlier step; they commit as **intra-batch reference tokens** (op ref = step id),
  resolved server-side (ADR-0028). Config is structurally validated with pointed errors and
  arrives as config-as-data (control-plane `config/workflows` document, env fallback).
- **Engine:** a **pure reducer** over `(config, run state)` — stage, back-edit, no forward
  skips over unstaged steps — with zero dependencies. XState remains the reference runtime if
  step logic ever needs hierarchy/guards/timers; the contract that matters (config-in,
  serializable-state-out, no side effects in the interpreter) is XState-compatible, so
  swapping engines is an implementation change, not a config change.
- **The draft IS the engine state.** `WorkflowRunState` is a plain JSON document — staged
  values keyed by step id, current position, and pins for workflow version + schema
  fingerprint. Persisting it (ADR-0032) on every change gives stop/resume and drift
  detection with no extra draft schema.
- **Availability gating:** a configured workflow is runnable only when the endpoint offers
  the batch unit-of-work, a create path per step type, and every bound field; otherwise it is
  visibly disabled with the named reasons (ADR-0029).

## Consequences

- One serializable artifact (the config) fully describes a workflow; one serializable
  artifact (the run state) fully describes a run. Both round-trip as JSON — the properties
  the control plane, drift detection, and future authoring tools (L14) all lean on.
- Steps are limited to one-entity-per-step with linear ordering and field-level bindings.
  Conditional steps, fan-out, and non-create operations are out of scope until a real
  workflow demands them — at which point the CNCF-SW model has room and the engine seam is
  where richness lands (possibly by adopting XState in earnest).
- The engine's purity is what made the runner testable to the level Phase 3 shipped with
  (single-atomic-commit assertions on the wire, resume/drift cases as data fixtures).

## Alternatives considered

- **XState as the shipped engine.** The reference runtime, but Phase 3 needed none of its
  power; a dependency-free reducer with the same contract keeps the bundle small and the
  draft trivially serializable. Revisit per above.
- **Workflow-specific form definitions in config.** Duplicates the Tier-0 generator and
  reopens the config-vs-code boundary; deriving step forms from create inputs keeps forms
  schema-true automatically.
- **Client-side sequential commits with compensation.** The saga model ADR-0028 already
  rejected as default; the batch unit-of-work makes it unnecessary.
