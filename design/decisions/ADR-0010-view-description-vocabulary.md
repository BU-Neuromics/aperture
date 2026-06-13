# ADR-0010: View-description vocabulary is a typed noun-catalog (keystone)

- **Status:** Proposed
- **Date:** 2026-06-13
- **Deciders:** —
- **Related:** handoff §9.2 (open question Q2), open-questions Q2, ADR-0004, ADR-0009; gates ADR-0011, ADR-0012, ADR-0013

## Context

Components emit a serializable view description (ADR-0009). The vocabulary of that
description is a calibration problem: too thin and components can't express real
visualizations (pressure to allow raw rendering, breaking ADR-0009); too rich and it becomes
the bloated DSL ADR-0004 explicitly rejected.

This is the **keystone** decision. Per `portal-open-questions.md`, resolving it determines
where computation lives, which forces the runtime (ADR-0011), and the agent loop (ADR-0013)
and config layering (ADR-0012) then largely fall out of already-settled invariants.

## Decision (proposed)

Make the vocabulary a **catalog of typed, parameterized view primitives** (table,
faceted-list, key-value detail, line/step, bar, scatter, KM-curve, heatmap, …), each a closed
LinkML type. A view description is then *which primitive + bound data + typed params*.
Bounded yet growable.

**Calibration rule (enforceable against handoff §10):** every addition to the vocabulary is a
**noun** (a chart/layout type), never a **verb** (a transform/expression). Nouns go in the
vocabulary; verbs live in the query/binding layer (Hippo GraphQL) or in a Type-B component.
The escape hatch for a missing primitive is "compose primitives," not "raw render."

## Consequences

- Heavy computation is pushed into Hippo's GraphQL query/binding layer (or a Canon/Cappella
  computed result Aperture binds to), shrinking the Type-B component surface to genuinely
  novel rendering.
- If it holds, "novel views" are mostly "missing primitive + richer query" — i.e. mostly
  Type-A config, not Type-B code.

## Notes / open sub-questions

- **Load-bearing probe (resolve first):** can a survival-curve view stratified by genotype be
  expressed as `KM-curve primitive + a stratification group-by query`, or does it genuinely
  need escape-hatch rendering? Run this against 2–3 concrete target components before
  ratifying. The whole resolution chain (0011→0012→0013) rests on this bet.
- Constraint from Hippo today: GraphQL exposes equality filters + offset pagination only, and
  multivalued slots don't persist in the SQLite adapter — "richer query" stratification may
  be limited until Hippo's CEL-over-GraphQL and linktable support land (sec4 §4.7 limits).
